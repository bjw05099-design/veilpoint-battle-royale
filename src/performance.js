/* VEILPOINT v1.4 — truthful CPU/GPU timing and opt-in GPU-guided resolution. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.VeilpointPerformance=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const RESOLUTIONS=Object.freeze([.5,.6,.7,.8,.9,1,1.1,1.25]);
const TARGET_FRAME_MS=1000/165;
function percentileSorted(a,p){
 if(!a.length)return null;
 const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
 return a[lo]+(a[hi]-a[lo])*(i-lo);
}
function percentile(values,p){
 return percentileSorted([...values].sort((x,y)=>x-y),p);
}
function createTelemetry(size=180){
 if(!Number.isInteger(size)||size<8||size>10000)throw new RangeError('Invalid sample window');
 // Fixed-capacity ring buffers avoid O(window size) Array.shift() per frame.
 // Percentiles sort a copy, so physical ring order is immaterial.
 const samples={cpu:{values:[],next:0,total:0},gpu:{values:[],next:0,total:0},raf:{values:[],next:0,total:0}};
 function record(type,value){
  if(!Object.prototype.hasOwnProperty.call(samples,type))throw new RangeError('Unknown timing type');
  if(!Number.isFinite(value)||value<=0||value>10000)return false;
  const window=samples[type],a=window.values;
  if(a.length<size)a.push(value);
  else {a[window.next]=value;window.next=(window.next+1)%size;}
  window.total++;
  return true;
 }
 function stats(type){
  if(!Object.prototype.hasOwnProperty.call(samples,type))throw new RangeError('Unknown timing type');
  // One sorted snapshot serves P50/P95/P99; avoid sorting three copies
  // on every 250ms HUD update or adaptive-resolution check.
  const a=samples[type].values,sorted=[...a].sort((x,y)=>x-y);
  return {count:a.length,total:samples[type].total,p50:percentileSorted(sorted,.5),
   p95:percentileSorted(sorted,.95),p99:percentileSorted(sorted,.99)};
 }
 function clear(){for(const window of Object.values(samples)){window.values.length=0;window.next=0;window.total=0;}}
 return {record,stats,clear};
}
// Timer queries are asynchronous. No gl.finish(), no synthetic GPU measurement.
function createGpuTimer(gl,onSample,onInvalidated){
 let ext=null;
 // A GPU context may disappear between renderer setup and extension query.
 // Never let a failing WebGL driver tear down the actual PC frame loop.
 try{ext=gl&&gl.getExtension&&gl.getExtension('EXT_disjoint_timer_query_webgl2');}
 catch(_){ext=null;}
 if(!ext)return {supported:false,begin:()=>false,end:()=>{},poll:()=>{},dispose:()=>{}};
 let active=null,activeTag=null;const pending=[];let disposed=false,disjointActive=false;
 // Driver/context errors invalidate ALL timing evidence, not the game frame.
 // Recovered graphics must create a fresh timer with a fresh WebGL context.
 function invalidateAndDispose(){
  if(disposed)return;
  dispose();
  if(typeof onInvalidated==='function'){
   try{onInvalidated();}catch(_){}
  }
 }
 // An unavailable WebGL result must not occupy the four-query ring forever.
 // A timeout only invalidates GPU evidence; it never fabricates a frame time.
 // Pass the draw clock from the renderer so age is measured in real milliseconds.
 function poll(nowMs=null){
  if(disposed)return;
  try{
  const disjoint=!!gl.getParameter(ext.GPU_DISJOINT_EXT);
  if(disjoint){
   // A disjoint invalidates *every* query spanning the event, including one
   // currently open. End the active WebGL query before deleting it so a later
   // frame cannot accidentally consume a stale/invalid GPU timing result.
   if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);active=null;activeTag=null;}
   while(pending.length)gl.deleteQuery(pending.shift().query);
   // Notify the UI once per disjoint episode; old timing windows must not
   // drive adaptive resolution after a GPU reset or timing discontinuity.
   if(!disjointActive&&typeof onInvalidated==='function')onInvalidated();
   disjointActive=true;
   return;
  }
  disjointActive=false;
  while(pending.length){
   const {query:q,tag}=pending[0];
   if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){
    // A lost/never-completing query otherwise blocks every newer GPU sample.
    // Only timestamped draws with a valid monotonic age may expire. Discard
    // the whole dependent batch and reset telemetry rather than mixing epochs.
    if(Number.isFinite(nowMs)&&Number.isFinite(tag)&&nowMs-tag>2500){
     while(pending.length)gl.deleteQuery(pending.shift().query);
     if(typeof onInvalidated==='function')onInvalidated();
    }
    break;
   }
   pending.shift();
   const ns=gl.getQueryParameter(q,gl.QUERY_RESULT);
   gl.deleteQuery(q);
   // Return the original draw's monotonic timestamp, not the later poll time.
   if(Number.isFinite(ns)&&ns>0&&typeof onSample==='function')onSample(ns/1e6,tag);
  }
  }catch(_){invalidateAndDispose();}
 }
 function begin(tag=null){
  if(disposed||disjointActive||active||pending.length>=4)return false;
  try{
   active=gl.createQuery();if(!active)return false;
   activeTag=tag;
   gl.beginQuery(ext.TIME_ELAPSED_EXT,active);return true;
  }catch(_){invalidateAndDispose();return false;}
 }
 function end(){
  if(!active||disposed)return;
  try{
   gl.endQuery(ext.TIME_ELAPSED_EXT);
   pending.push({query:active,tag:activeTag});active=null;activeTag=null;
  }catch(_){invalidateAndDispose();}
 }
 function dispose(){
  if(disposed)return;
  // On a lost context, endQuery/deleteQuery may themselves throw.
  // Cleanup is best-effort; the external timer has already been retired.
  disposed=true;
  if(active){
   try{gl.endQuery(ext.TIME_ELAPSED_EXT);}catch(_){}
   try{gl.deleteQuery(active);}catch(_){}
   active=null;activeTag=null;
  }
  for(const {query} of pending){
   try{gl.deleteQuery(query);}catch(_){}
  }
  pending.length=0;
 }
 return {supported:true,begin,end,poll,dispose};
}
// A WebGL timer result can arrive several frames after its draw. A query
// issued at the OLD render scale must not seed a fresh quality decision.
function createGpuEvidenceGate(){
 let minimumIssuedAt=-Infinity;
 function reset(nowMs){
  if(!Number.isFinite(nowMs))throw new RangeError('Invalid GPU evidence epoch');
  minimumIssuedAt=Math.max(minimumIssuedAt,nowMs);
 }
 function accepts(issuedAt){return Number.isFinite(issuedAt)&&issuedAt>=minimumIssuedAt;}
 return {reset,accepts};
}
function createResolutionGovernor({minScale=.7,maxScale=1.25,initialScale=maxScale,targetFps=165,cooldownMs=2500}={}){
 if(!RESOLUTIONS.includes(minScale)||!RESOLUTIONS.includes(maxScale)||minScale>maxScale||!RESOLUTIONS.includes(initialScale)||initialScale<minScale||initialScale>maxScale)throw new RangeError('Invalid resolution bounds');
 if(!Number.isFinite(targetFps)||targetFps<30||targetFps>240||!Number.isFinite(cooldownMs)||cooldownMs<0)throw new RangeError('Invalid timing configuration');
 let scale=initialScale,lastChange=-Infinity,goodWindows=0,lastEvidenceAt=-Infinity;
 let lastGpuTotal=null,lastCpuTotal=null;
 // A GPU disjoint or invalid measurement breaks consecutive low-load evidence.
 // Preserve the current scale and cooldown when invalidating timing history.
 function resetEvidence(){goodWindows=0;lastGpuTotal=null;lastCpuTotal=null;}
 function update({nowMs,gpuP95,cpuP95,gpuSamples=0,cpuSamples=0,gpuTotal=null,cpuTotal=null}){
  // NaN/fractional/forged sample counts and duplicate or backward windows
  // must not trigger quality changes without fresh, ordered CPU/GPU evidence.
  const tracked=gpuTotal!==null||cpuTotal!==null;
  if(!Number.isFinite(nowMs)||nowMs<=lastEvidenceAt||
     !Number.isSafeInteger(gpuSamples)||gpuSamples<30||
     !Number.isSafeInteger(cpuSamples)||cpuSamples<30||
     !Number.isFinite(gpuP95)||!Number.isFinite(cpuP95)||gpuP95<=0||cpuP95<=0||
     (tracked&&(!Number.isSafeInteger(gpuTotal)||gpuTotal<gpuSamples||
       !Number.isSafeInteger(cpuTotal)||cpuTotal<cpuSamples||
       (lastGpuTotal!==null&&gpuTotal<=lastGpuTotal)||
       (lastCpuTotal!==null&&cpuTotal<=lastCpuTotal)))){
   // A repeated telemetry window is not a second independent GPU/CPU sample.
   // Preserve last accepted totals so stale data cannot be counted as fresh later.
   goodWindows=0;return scale;
  }
  lastEvidenceAt=nowMs;
  if(tracked){lastGpuTotal=gpuTotal;lastCpuTotal=cpuTotal;}
  const budget=1000/targetFps;
  if(nowMs-lastChange<cooldownMs)return scale;
  const index=RESOLUTIONS.indexOf(scale);
  // Lowering pixel count cannot solve a CPU bottleneck. Preserve image quality
  // unless GPU time is above budget and is a meaningful contributor to the stall.
  const gpuOverBudget=gpuP95>budget*.93;
  const cpuDominated=cpuP95>gpuP95*1.15;
  if(gpuOverBudget&&!cpuDominated){
   goodWindows=0;
   for(let i=index-1;i>=0;i--){if(RESOLUTIONS[i]>=minScale){scale=RESOLUTIONS[i];lastChange=nowMs;break;}}
  }else if(gpuP95<budget*.62&&cpuP95<budget*.62){
   if(++goodWindows>=3){for(let i=index+1;i<RESOLUTIONS.length;i++){if(RESOLUTIONS[i]<=maxScale){scale=RESOLUTIONS[i];lastChange=nowMs;break;}}goodWindows=0;}
  }else goodWindows=0;
  return scale;
 }
 return {update,getScale:()=>scale,resetEvidence};
}
return {RESOLUTIONS,TARGET_FRAME_MS,percentile,createTelemetry,createGpuTimer,createGpuEvidenceGate,createResolutionGovernor};
});
