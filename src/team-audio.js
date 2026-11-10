/* VEILPOINT: original optional localhost PvP round cues, no external audio. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointTeamAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TONES=Object.freeze({
  start:Object.freeze({hz:440,duration:.14,type:'sine',gain:.025}),
  overtime:Object.freeze({hz:350,duration:.18,type:'triangle',gain:.03}),
  finish:Object.freeze({hz:275,duration:.20,type:'sine',gain:.026})
 });
 function create({AudioContextClass=null}={}){
  let context=null,enabled=false,lastPhase=null,lastRoundId=null,lastOvertime=false,lastTick=null;
  const playing=new Set();
  function sound(kind){
   const cue=Object.prototype.hasOwnProperty.call(TONES,kind)?TONES[kind]:null;
   if(!enabled||!cue||!context||playing.size>=4)return false;
   try{
    const when=context.currentTime,osc=context.createOscillator(),gain=context.createGain();
    osc.type=cue.type;osc.frequency.setValueAtTime(cue.hz,when);
    gain.gain.setValueAtTime(.0001,when);
    gain.gain.linearRampToValueAtTime(cue.gain,when+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,when+cue.duration);
    osc.connect(gain);gain.connect(context.destination);
    const voice={osc,gain};playing.add(voice);
    osc.onended=()=>{
     playing.delete(voice);
     try{osc.disconnect();gain.disconnect();}catch(_){}
    };
    osc.start(when);osc.stop(when+cue.duration);
    return true;
   }catch(_){return false;}
  }
  function setEnabled(value){
   enabled=false;
   if(!value){
    for(const voice of playing){
     try{voice.osc.stop();voice.osc.disconnect();voice.gain.disconnect();}catch(_){}
    }
    playing.clear();
    return false;
   }
   if(typeof AudioContextClass!=='function')return false;
   try{
    if(!context)context=new AudioContextClass();
    // Only called from the user's actual click; never autoplay on page load.
    if(context.state==='suspended'&&typeof context.resume==='function')
     context.resume()?.catch?.(()=>{});
    enabled=true;return true;
   }catch(_){return false;}
  }
  function sync(snapshot){
   if(!snapshot||!['lobby','playing','ended'].includes(snapshot.phase))return null;
   const id=snapshot.round?.id;
   if(!Number.isSafeInteger(id)||id<0)return null;
   const phase=snapshot.phase,overtime=snapshot.round?.suddenDeathActive===true;
   const tick=Number.isSafeInteger(snapshot.tick)&&snapshot.tick>=0?snapshot.tick:null;
   // A 400ms snapshot may arrive after the match has already advanced via
   // another poll. Never roll back generation, phase, tick or overtime audio.
   // The host reuses the previous round ID in its post-match lobby, so that
   // phase is deliberately silent until the next genuine round increments ID.
   const phaseOrder={lobby:0,playing:1,ended:2};
   if(lastRoundId!==null&&(
      id<lastRoundId ||
      (id===lastRoundId&&phaseOrder[phase]<phaseOrder[lastPhase]) ||
      (id===lastRoundId&&tick!==null&&lastTick!==null&&tick<lastTick) ||
      (id===lastRoundId&&phase==='playing'&&lastOvertime&&!overtime)
   ))return null;
   let emitted=null;
   if(lastRoundId!==null){
    if(phase==='playing'&&(lastPhase!=='playing'||id!==lastRoundId))emitted='start';
    else if(phase==='playing'&&overtime&&!lastOvertime&&id===lastRoundId)emitted='overtime';
    else if(phase==='ended'&&lastPhase==='playing'&&id===lastRoundId)emitted='finish';
   }
   lastRoundId=id;lastPhase=phase;lastOvertime=overtime;lastTick=tick;
   if(emitted)sound(emitted);
   return emitted;
  }
  function dispose(){
   setEnabled(false);
   if(context&&typeof context.close==='function'){
    try{context.close()?.catch?.(()=>{});}catch(_){}
   }
   context=null;
  }
  return Object.freeze({sync,setEnabled,dispose,get enabled(){return enabled;}});
 }
 return Object.freeze({TONES,create});
});