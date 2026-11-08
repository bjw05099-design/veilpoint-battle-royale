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
  let context=null,low=null,high=null,master=null,enabled=false;
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
    master.gain.setValueAtTime(.009,context.currentTime);
    low.connect(master);high.connect(master);master.connect(context.destination);
    low.start();high.start();enabled=true;
    // Called only from the player's direct on-screen click.
    if(context.state==='suspended'&&typeof context.resume==='function'){
     const task=context.resume();task?.catch?.(()=>{});
    }
    return true;
   }catch(_){clear();return false;}
  }
  function update(surface){
   if(!enabled||!context||!master)return false;
   // Self-only authoritative surface flags: never infer absent players or
   // access the camera, microphone, session token or other squads.
   const wet=surface?.wet===true,active=wet&&surface?.waveActive===true;
   const time=context.currentTime;
   if(!Number.isFinite(time)||time<0)return false;
   low.frequency.setTargetAtTime(active?92:wet?78:66,time,.22);
   high.frequency.setTargetAtTime(active?147:wet?126:111,time,.3);
   master.gain.setTargetAtTime(active?.015:wet?.012:.009,time,.3);
   return true;
  }
  return Object.freeze({enable,update,disable:clear,dispose:clear,
   enabled:()=>enabled,available:usable});
 }
 return Object.freeze({create});
});