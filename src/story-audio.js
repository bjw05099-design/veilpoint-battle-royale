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
    let context=null,active=0,on=!!enabled;
    function play(kind) {
      const cue=Object.prototype.hasOwnProperty.call(CUES,kind)?CUES[kind]:null;
      if(!on||!cue||typeof AudioContextClass!=='function'||active>=6)return false;
      try {
        if(!context)context=new AudioContextClass();
        if(context.state==='suspended'&&typeof context.resume==='function'){
          const pending=context.resume();
          if(pending&&typeof pending.catch==='function')pending.catch(()=>{});
        }
        const oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.type=cue.type;
        oscillator.frequency.setValueAtTime(cue.frequency,context.currentTime);
        gain.gain.setValueAtTime(.0001,context.currentTime);
        gain.gain.linearRampToValueAtTime(.045,context.currentTime+.008);
        gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+cue.duration);
        oscillator.connect(gain);gain.connect(context.destination);
        active++;
        oscillator.onended=()=>{active=Math.max(0,active-1);oscillator.disconnect();gain.disconnect();};
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime+cue.duration);
        return true;
      } catch (_) {active=Math.max(0,active-1);return false;}
    }
    return Object.freeze({
      play,enabled:()=>on,setEnabled:value=>{on=!!value;return on;},
      dispose:()=>{on=false;if(context&&typeof context.close==='function')context.close().catch?.(()=>{});context=null;active=0;}
    });
  }
  return Object.freeze({CUES,create});
});
