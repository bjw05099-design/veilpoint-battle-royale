/* VEILPOINT v1.4 — truthful CPU/GPU timing and opt-in GPU-guided resolution. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.VeilpointPerformance=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const RESOLUTIONS=Object.freeze([.5,.6,.7,.8,.9,1,1.1,1.25]);
const TARGET_FRAME_MS=1000/165;
function percentile(values,p){
 if(!values.length)return null;
 const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
 return a[lo]+(a[hi]-a[lo])*(i-lo);
}
function createTelemetry(size=180){
 if(!Number.isInteger(size)||size<8||size>10000)throw new RangeError('Invalid sample window');
 const samples={cpu:[],gpu:[],raf:[]};
 function record(type,value){
  if(!Object.prototype.hasOwnProperty.call(samples,type))throw new RangeError('Unknown timing type');
  if(!Number.isFinite(value)||value<=0||value>10000)return false;
  const a=samples[type];a.push(value);if(a.length>size)a.shift();return true;
 }
 function stats(type){
  if(!Object.prototype.hasOwnProperty.call(samples,type))throw new RangeError('Unknown timing type');
  const a=samples[type];return {count:a.length,p50:percentile(a,.5),p95:percentile(a,.95),p99:percentile(a,.99)};
 }
 function clear(){for(const a of Object.values(samples))a.length=0;}
 return {record,stats,clear};
}
// Timer queries are asynchronous. No gl.finish(), no synthetic GPU measurement.
function createGpuTimer(gl,onSample){
 const ext=gl&&gl.getExtension&&gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext)return {supported:false,begin:()=>false,end:()=>{},poll:()=>{},dispose:()=>{}};
 let active=null;const pending=[];let disposed=false;
 function poll(){
  if(disposed)return;
  const disjoint=!!gl.getParameter(ext.GPU_DISJOINT_EXT);
  if(disjoint){while(pending.length)gl.deleteQuery(pending.shift());return;}
  while(pending.length){
   const q=pending[0];
   if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))break;
   pending.shift();
   const ns=gl.getQueryParameter(q,gl.QUERY_RESULT);
   gl.deleteQuery(q);
   if(Number.isFinite(ns)&&ns>0&&typeof onSample==='function')onSample(ns/1e6);
  }
 }
 function begin(){
  if(disposed||active||pending.length>=4)return false;
  active=gl.createQuery();if(!active)return false;
  gl.beginQuery(ext.TIME_ELAPSED_EXT,active);return true;
 }
 function end(){if(!active||disposed)return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=null;}
 function dispose(){
  if(disposed)return;
  if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);active=null;}
  for(const q of pending)gl.deleteQuery(q);pending.length=0;disposed=true;
 }
 return {supported:true,begin,end,poll,dispose};
}
function createResolutionGovernor({minScale=.7,maxScale=1.25,initialScale=maxScale,targetFps=165,cooldownMs=2500}={}){
 if(!RESOLUTIONS.includes(minScale)||!RESOLUTIONS.includes(maxScale)||minScale>maxScale||!RESOLUTIONS.includes(initialScale)||initialScale<minScale||initialScale>maxScale)throw new RangeError('Invalid resolution bounds');
 if(!Number.isFinite(targetFps)||targetFps<30||targetFps>240||!Number.isFinite(cooldownMs)||cooldownMs<0)throw new RangeError('Invalid timing configuration');
 let scale=initialScale,lastChange=-Infinity,goodWindows=0;
 function update({nowMs,gpuP95,cpuP95,gpuSamples=0,cpuSamples=0}){
  if(!Number.isFinite(nowMs)||gpuSamples<30||cpuSamples<30||!Number.isFinite(gpuP95)||!Number.isFinite(cpuP95)||gpuP95<=0||cpuP95<=0)return scale;
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
 return {update,getScale:()=>scale};
}
return {RESOLUTIONS,TARGET_FRAME_MS,percentile,createTelemetry,createGpuTimer,createResolutionGovernor};
});
