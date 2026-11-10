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
  function create({AudioContextClass=null,enabled=true}={}) {
    let context=null,active=0,on=!!enabled,volume=1,generation=0;
    function play(kind) {
      const cue=Object.prototype.hasOwnProperty.call(CUES,kind)?CUES[kind]:null;
      if(!on||volume<=0||!cue||typeof AudioContextClass!=='function'||active>=6)return false;
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
        gain.gain.linearRampToValueAtTime(.045*volume,context.currentTime+.008);
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
  return Object.freeze({CUES,create});
});
