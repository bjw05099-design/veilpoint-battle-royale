/* VEILPOINT BR96 — original, opt-in simulated harbor ambience.
 * No recordings, external fetches, enemy location inference or autoplay.
 * Tonal staging cue for a local prototype, not realistic positional acoustics.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointBR96Audio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function create({AudioContextClass=null}={}){
  let context=null,low=null,high=null,master=null,enabled=false,volume=1,lastBase=.009;
  const usable=()=>typeof AudioContextClass==='function';
  function clear(){
   const stale=context;
   for(const node of [low,high]){
    if(node){try{node.stop();}catch(_){ }try{node.disconnect();}catch(_){ }}
   }
   if(master)try{master.disconnect();}catch(_){ }
   low=null;high=null;master=null;context=null;enabled=false;
   if(stale&&typeof stale.close==='function'){
    try{const task=stale.close();task?.catch?.(()=>{});}catch(_){ }
   }
  }
  function enable(){
   if(enabled)return true;
   if(!usable())return false;
   try{
    context=new AudioContextClass();
    low=context.createOscillator();
    high=context.createOscillator();
    master=context.createGain();
    low.type='sine';high.type='triangle';
    low.frequency.setValueAtTime(66,context.currentTime);
    high.frequency.setValueAtTime(111,context.currentTime);
    master.gain.setValueAtTime(lastBase*volume,context.currentTime);
    low.connect(master);high.connect(master);master.connect(context.destination);
    low.start();high.start();enabled=true;
    // Called only from the player's direct on-screen click.
    if(context.state==='suspended'&&typeof context.resume==='function'){
     const task=context.resume();task?.catch?.(()=>{});
    }
    return true;
   }catch(_){clear();return false;}
  }
  function update(surface,weather=null){
   if(!enabled||!context||!master)return false;
   // The only inputs are the caller's authenticated *own* ground and the
   // public server-authored coastal weather. No rival data, sensors or GPS.
   const wet=surface?.wet===true,active=wet&&surface?.waveActive===true;
   // Unknown/malformed weather is ignored. The prototype's old single-arg
   // mixing contract remains byte-for-byte unchanged for existing callers.
   const conditions=weather&&typeof weather==='object'&&!Array.isArray(weather)&&
     ['clear','sea-haze','gusty','clearing'].includes(weather.code)&&
     ['light','moderate'].includes(weather.wind)?weather:null;
   const gust=conditions?.code==='gusty'&&conditions.wind==='moderate';
   const haze=conditions?.code==='sea-haze';
   const time=context.currentTime;
   if(!Number.isFinite(time)||time<0)return false;
   const lower=(active?92:wet?78:66)+(gust?4:haze?-2:0);
   const upper=(active?147:wet?126:111)+(gust?2:haze?-2:0);
   // Quiet placeholder tonal ambience, never a realistic field recording.
   // Weather never exceeds the prior .015 peak gain safety ceiling.
   const base=active?.015:wet?.012:.009;
   const level=Math.min(.015,base+(gust?.0015:haze?-.0008:0));
   // A disconnected or replaced Windows audio output can throw while a
   // WebAudio parameter is scheduled. Do not crash the BR96 render loop:
   // retire this graph, allow a fresh explicit player-gesture enable later.
   try{
    low.frequency.setTargetAtTime(lower,time,.22);
    high.frequency.setTargetAtTime(upper,time,.3);
    master.gain.setTargetAtTime(level*volume,time,.3);
   }catch(_){clear();return false;}
   lastBase=level;
   return true;
  }
  function setVolume(value){
   if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('invalid_audio_volume');
   volume=value;
   if(enabled&&master&&context&&Number.isFinite(context.currentTime)){
    try{master.gain.setTargetAtTime(lastBase*volume,context.currentTime,.08);}
    catch(_){clear();}
   }
   return volume;
  }
  return Object.freeze({enable,update,setVolume,volume:()=>volume,disable:clear,dispose:clear,
   enabled:()=>enabled,available:usable});
 }
 return Object.freeze({create});
});