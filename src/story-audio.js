/* VEILPOINT CH01 — original, optional synthesized prototype feedback.
 * No third-party audio, spatial-acoustics claim, or realistic gunshot recording.
 * The browser must receive a player gesture before playback is attempted.
 */
(function (root, factory) {
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.VeilpointStoryAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function () {
  'use strict';
  const CUES=Object.freeze({
    shot:Object.freeze({frequency:160,duration:.065,type:'triangle'}),
    reload:Object.freeze({frequency:330,duration:.08,type:'sine'}),
    interact:Object.freeze({frequency:490,duration:.07,type:'sine'}),
    report:Object.freeze({frequency:420,duration:.09,type:'sine'}),
    impact:Object.freeze({frequency:115,duration:.12,type:'triangle'}),
    complete:Object.freeze({frequency:650,duration:.15,type:'sine'})
  });
  // Pure physical-space approximation for optional diegetic CH01 cues.
  // Proximity does NOT reveal a human or assert an event: the real F action
  // still has to pass Story.nearest() / the existing collision gate.
  function spatialGain(listener,source,obstacles=[]){
    if(!listener||!source||![listener.x,listener.z,source.x,source.z]
        .every(Number.isFinite)||!Array.isArray(obstacles))return 0;
    const dx=source.x-listener.x,dz=source.z-listener.z;
    const distance=Math.hypot(dx,dz);
    if(!Number.isFinite(distance)||distance>24)return 0;
    const unobstructed=1/(1+(distance/5)**2);
    if(distance<.001)return unobstructed;
    // A solid rectangle between source and listener absorbs some of the cue;
    // it never turns the effect into an extra target detector or radar ping.
    let covered=false;
    for(const o of obstacles){
      if(!o||![o.x,o.z,o.w,o.d].every(Number.isFinite)||o.w<=0||o.d<=0||
         o.solid===false)continue;
      let t0=0,t1=1;
      const axes=[[listener.x,dx,o.x-o.w/2,o.x+o.w/2],
        [listener.z,dz,o.z-o.d/2,o.z+o.d/2]];
      for(const [start,delta,min,max] of axes){
        if(Math.abs(delta)<1e-10){if(start<min||start>max){t0=2;break;}continue;}
        const lo=(min-start)/delta,hi=(max-start)/delta;
        t0=Math.max(t0,Math.min(lo,hi));t1=Math.min(t1,Math.max(lo,hi));
        if(t0>t1)break;
      }
      if(t0<=t1&&t1>.02&&t0<.98){covered=true;break;}
    }
    return unobstructed*(covered?.22:1);
  }
  function create({AudioContextClass=null,enabled=true}={}) {
    let context=null,active=0,on=!!enabled,volume=1,generation=0;
    function play(kind,space=null) {
      const cue=Object.prototype.hasOwnProperty.call(CUES,kind)?CUES[kind]:null;
      const distanceGain=space===null?1:spatialGain(space.listener,space.source,space.obstacles);
      if(!on||volume<=0||distanceGain<=0||!cue||
         typeof AudioContextClass!=='function'||active>=6)return false;
      let oscillator=null,gain=null,registered=false,finalized=false;
      const currentGeneration=generation;
      try {
        if(!context)context=new AudioContextClass();
        if(context.state==='suspended'&&typeof context.resume==='function'){
          const pending=context.resume();
          if(pending&&typeof pending.catch==='function')pending.catch(()=>{});
        }
        oscillator=context.createOscillator();gain=context.createGain();
        oscillator.type=cue.type;
        oscillator.frequency.setValueAtTime(cue.frequency,context.currentTime);
        gain.gain.setValueAtTime(.0001,context.currentTime);
        gain.gain.linearRampToValueAtTime(.045*volume*distanceGain,context.currentTime+.008);
        gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+cue.duration);
        oscillator.connect(gain);gain.connect(context.destination);
        active++;registered=true;
        oscillator.onended=()=>{
          if(finalized)return;
          finalized=true;
          if(currentGeneration===generation)active=Math.max(0,active-1);
          try{oscillator.disconnect();}catch(_){}
          try{gain.disconnect();}catch(_){}
        };
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime+cue.duration);
        return true;
      } catch (_) {
        // A partially created Web Audio graph must not steal a concurrency
        // slot from other cues or leak its nodes after an audio-device error.
        if(registered&&!finalized&&currentGeneration===generation)active=Math.max(0,active-1);
        finalized=true;
        try{oscillator?.disconnect();}catch(_){}
        try{gain?.disconnect();}catch(_){}
        return false;
      }
    }
    return Object.freeze({
      play,enabled:()=>on,setEnabled:value=>{on=!!value;return on;},
      setVolume:value=>{if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('invalid_audio_volume');volume=value;return volume;},
      volume:()=>volume,
      dispose:()=>{
        on=false;generation++;
        const previous=context;context=null;active=0;
        if(previous&&typeof previous.close==='function'){
          try{previous.close()?.catch?.(()=>{});}catch(_){}
        }
      }
    });
  }
  return Object.freeze({CUES,spatialGain,create});
});
