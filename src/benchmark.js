/* VEILPOINT opt-in browser-only benchmark: no network upload or GPU/CPU model inference. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.VeilpointBenchmark=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const DEFAULT_DURATION_MS=120000;
 const DEFAULT_WARMUP_MS=5000;
 const MAX_SAMPLES=30000;
 function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
 }
 function stats(values){return {count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99)};}
 function createBenchmark({durationMs=DEFAULT_DURATION_MS,warmupMs=DEFAULT_WARMUP_MS}={}){
  if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>300000||
     !Number.isInteger(warmupMs)||warmupMs<0||warmupMs>30000)throw new RangeError('Invalid benchmark duration');
  let state='idle',reason=null,metadata=null,startedAt=null,lastFrameAt=null,measuredMs=0;
  let intervals=[],cpuDraw=[],gpuTimer=[],scales=[],gpuInvalidated=false;
  function arm(settings={}){
   if(state==='running'||state==='armed')throw new Error('Benchmark already active');
   if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new TypeError('Invalid benchmark settings');
   // Values are supplied by the UI, not inferred from a GPU identity database.
   metadata=JSON.parse(JSON.stringify(settings));
   state='armed';reason=null;startedAt=null;lastFrameAt=null;measuredMs=0;
   intervals=[];cpuDraw=[];gpuTimer=[];scales=[];gpuInvalidated=false;
  }
  function finish(why='manual'){
   if(state==='running'||state==='armed'){state='finished';reason=why;}
   return report();
  }
  function frame(nowMs,drawMs,scale){
   if(state==='armed'){
    if(!Number.isFinite(nowMs))return false;
    state='running';startedAt=nowMs;lastFrameAt=nowMs;return true;
   }
   if(state!=='running')return false;
   if(!Number.isFinite(nowMs)||nowMs<=lastFrameAt||nowMs-lastFrameAt>1000){finish('render-gap-or-invalid-clock');return false;}
   const elapsed=nowMs-startedAt,delta=nowMs-lastFrameAt;
   lastFrameAt=nowMs;
   if(elapsed>=warmupMs&&elapsed<=warmupMs+durationMs&&intervals.length<MAX_SAMPLES){
    if(elapsed-delta>=warmupMs){intervals.push(delta);measuredMs+=delta;}
    if(Number.isFinite(drawMs)&&drawMs>0&&drawMs<10000)cpuDraw.push(drawMs);
    if(Number.isFinite(scale)&&scale>.1&&scale<=2)scales.push(scale);
   }
   if(elapsed>=warmupMs+durationMs||intervals.length>=MAX_SAMPLES)finish(elapsed>=warmupMs+durationMs?'completed':'sample-limit');
   return true;
  }
  function gpu(ms){
   if(state!=='running'||gpuInvalidated||lastFrameAt-startedAt<warmupMs||gpuTimer.length>=MAX_SAMPLES)return false;
   if(!Number.isFinite(ms)||ms<=0||ms>10000)return false;
   gpuTimer.push(ms);return true;
  }
  function invalidateGpu(){gpuInvalidated=true;gpuTimer=[];}
  function getStatus(){return {state,reason,elapsedMs:startedAt===null?0:Math.max(0,lastFrameAt-startedAt),durationMs,warmupMs,frames:intervals.length};}
  function report(){
   const slowCount=Math.max(1,Math.ceil(intervals.length*.01));
   const slowest=[...intervals].sort((a,b)=>b-a).slice(0,slowCount);
   const avgSlow=slowest.reduce((a,b)=>a+b,0)/slowest.length;
   const cap=metadata&&metadata.fpsCap;
   const threshold=Number.isFinite(cap)&&cap>0?Math.max(50,2*1000/cap):50;
   return {
    schema:'veilpoint.browser-benchmark.v1',mode:'offline-battle-royale',state,reason,
    note:'Opt-in local browser measurements only. No remote upload. GPU and CPU hardware identity, native QHD output, 165Hz refresh, input-to-photon latency and Unreal performance are NOT verified.',
    settings:metadata,durationTargetMs:durationMs,warmupMs,activeMeasuredMs:measuredMs,
    renderedFrameCount:intervals.length,observedFps:measuredMs>0?1000*intervals.length/measuredMs:null,
    estimatedOnePercentLowFps:slowest.length?1000/avgSlow:null,
    onePercentLowMethod:'reciprocal of mean slowest 1% rendered callback intervals; not a native GPU benchmark',
    renderCallbackIntervalMs:stats(intervals),cpuRendererDrawMs:stats(cpuDraw),
    webglGpuTimerMs:gpuInvalidated?stats([]):stats(gpuTimer),gpuTimerInvalidated:gpuInvalidated,
    stutterThresholdMs:threshold,stutterIntervals:intervals.filter(ms=>ms>threshold).length,
    effectiveRenderScale:scales.length?{min:Math.min(...scales),max:Math.max(...scales)}:null
   };
  }
  return {arm,frame,gpu,invalidateGpu,finish,getStatus,report};
 }
 return {createBenchmark,DEFAULT_DURATION_MS,DEFAULT_WARMUP_MS};
});
