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
  let canvasRange=null,canvasSamples=0;
  function arm(settings={}){
   if(state==='running'||state==='armed')throw new Error('Benchmark already active');
   if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new TypeError('Invalid benchmark settings');
   // Values are supplied by the UI, not inferred from a GPU identity database.
   metadata=JSON.parse(JSON.stringify(settings));
   state='armed';reason=null;startedAt=null;lastFrameAt=null;measuredMs=0;
   intervals=[];cpuDraw=[];gpuTimer=[];scales=[];gpuInvalidated=false;
   canvasRange=null;canvasSamples=0;
  }
  function finish(why='manual'){
   if(state==='running'||state==='armed'){state='finished';reason=why;}
   return report();
  }
  function frame(nowMs,drawMs,scale,canvasSize){
   if(state==='armed'){
    if(!Number.isFinite(nowMs))return false;
    state='running';startedAt=nowMs;lastFrameAt=nowMs;return true;
   }
   if(state!=='running')return false;
   if(!Number.isFinite(nowMs)||nowMs<=lastFrameAt||nowMs-lastFrameAt>1000){finish('render-gap-or-invalid-clock');return false;}
   const elapsed=nowMs-startedAt,delta=nowMs-lastFrameAt;
   lastFrameAt=nowMs;
   if(elapsed>=warmupMs&&elapsed<=warmupMs+durationMs&&intervals.length<MAX_SAMPLES){
    // Only complete post-warmup intervals contribute to any per-frame metric.
    // Otherwise CPU and resolution samples could silently include warmup work.
    if(elapsed-delta>=warmupMs){
     intervals.push(delta);measuredMs+=delta;
     if(Number.isFinite(drawMs)&&drawMs>0&&drawMs<10000)cpuDraw.push(drawMs);
     if(Number.isFinite(scale)&&scale>.1&&scale<=2)scales.push(scale);
     // Browser canvas backing pixels are measurable; OS monitor resolution is not.
     if(canvasSize&&Number.isSafeInteger(canvasSize.width)&&Number.isSafeInteger(canvasSize.height)&&
        canvasSize.width>0&&canvasSize.height>0&&canvasSize.width<=16384&&canvasSize.height<=16384){
      const {width,height}=canvasSize;
      canvasRange=canvasRange?{
       minWidth:Math.min(canvasRange.minWidth,width),maxWidth:Math.max(canvasRange.maxWidth,width),
       minHeight:Math.min(canvasRange.minHeight,height),maxHeight:Math.max(canvasRange.maxHeight,height)
      }:{minWidth:width,maxWidth:width,minHeight:height,maxHeight:height};
      canvasSamples++;
     }
    }
   }
   if(elapsed>=warmupMs+durationMs||intervals.length>=MAX_SAMPLES)finish(elapsed>=warmupMs+durationMs?'completed':'sample-limit');
   return true;
  }
  function gpu(ms,issuedAt){
   // WebGL timer queries finish asynchronously, often *after* the final
   // measured frame has completed. Preserve valid draw-time evidence for a
   // naturally completed run, but never reopen interrupted measurements.
   const acceptsLateResult=state==='finished'&&(reason==='completed'||reason==='sample-limit');
   if((state!=='running'&&!acceptsLateResult)||gpuInvalidated||gpuTimer.length>=MAX_SAMPLES)return false;
   // WebGL timer queries resolve asynchronously. A result from a previous
   // benchmark, pre-warmup draw or later measurement window must never be
   // misattributed merely because it was polled during this run.
   if(!Number.isFinite(issuedAt)||issuedAt<startedAt+warmupMs||
      issuedAt>startedAt+warmupMs+durationMs)return false;
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
   // A fixed 50ms floor hides several missed refresh opportunities at
   // 120/144/165Hz. Flag intervals longer than two selected frame budgets;
   // retain 50ms only when no valid FPS cap is supplied.
   const threshold=Number.isFinite(cap)&&cap>=30&&cap<=240?2*1000/cap:50;
   return {
    schema:'veilpoint.browser-benchmark.v1',mode:'offline-battle-royale',state,reason,
    note:'Opt-in local browser measurements only. No remote upload. GPU and CPU hardware identity, native QHD output, 165Hz refresh, input-to-photon latency and Unreal performance are NOT verified.',
    settings:metadata,durationTargetMs:durationMs,warmupMs,activeMeasuredMs:measuredMs,
    completed:state==='finished'&&reason==='completed',
    measuredPercent:Math.min(100,Math.round(10000*measuredMs/durationMs)/100),
    // An early match end, pause or graphics change is a partial sample, never
    // a completed 120-second performance certificate.
    measurementStatus:state==='finished'?(reason==='completed'?'complete':'partial'):'incomplete',
    renderedFrameCount:intervals.length,observedFps:measuredMs>0?1000*intervals.length/measuredMs:null,
    estimatedOnePercentLowFps:slowest.length?1000/avgSlow:null,
    onePercentLowMethod:'reciprocal of mean slowest 1% rendered callback intervals; not a native GPU benchmark',
    renderCallbackIntervalMs:stats(intervals),cpuRendererDrawMs:stats(cpuDraw),
    webglGpuTimerMs:gpuInvalidated?stats([]):stats(gpuTimer),gpuTimerInvalidated:gpuInvalidated,
    stutterThresholdMs:threshold,stutterIntervals:intervals.filter(ms=>ms>threshold).length,
    stutterMethod:'rendered callback interval > 2 selected FPS-cap frame budgets (50ms fallback); not GPU frametime or input latency',
    gpuTimerSampleNote:'WebGL timer queries are asynchronous; re-export after pending results resolve. Sample count is not guaranteed to match rendered frames.',
    effectiveRenderScale:scales.length?{min:Math.min(...scales),max:Math.max(...scales)}:null,
    canvasBackingPixels:canvasRange?{...canvasRange,samples:canvasSamples}:null
   };
  }
  return {arm,frame,gpu,invalidateGpu,finish,getStatus,report};
 }
 return {createBenchmark,DEFAULT_DURATION_MS,DEFAULT_WARMUP_MS};
});
