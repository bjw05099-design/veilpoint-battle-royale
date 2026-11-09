/* VEILPOINT CH01 — optional original, synthesized public harbor atmosphere.
 * This is a restrained prototype tone bed, not real environmental recording.
 * A real direct player gesture must activate WebAudio. No location tracking,
 * rival awareness, remote fetch, score changes or checkpoint schema change.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryHarborAmbience=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 function indoors(player){
  if(!player||![player.x,player.z].every(Number.isFinite))return false;
  const {x,z}=player;
  // Three physically walk-in PUBLIC rooms already authored in CH01.
  return (x>=80&&x<=94&&z>=17&&z<=33) ||
    (x>=-56&&x<=-34&&z>=125&&z<=145) ||
    (x>=-164&&x<=-144&&z>=112&&z<=130);
 }
 function profile(state){
  if(!state||!state.world||!state.world.player)
   return Object.freeze({lowHz:54,highHz:96,level:0,indoors:false});
  const phase=state.phase,inside=indoors(state.world.player);
  const active=phase!=='failed'&&phase!=='complete';
  // Keep speech and game effects unobscured during the opening encounter.
  // Restoration of one local power line does NOT mean the whole city is safe.
  const base=!active?0:phase==='engagement'?.0028:
    phase==='terminal'?.0043:.0062;
  const level=clamp(base*(inside?.40:1),0,.008);
  return Object.freeze({lowHz:inside?51:58,
   highHz:state.relayRestored===true?109:96,level,indoors:inside});
 }
 function create({AudioContextClass=null}={}){
  let context=null,low=null,high=null,gain=null,enabled=false,volume=1,lastLevel=0;
  const available=()=>typeof AudioContextClass==='function';
  function disable(){
   enabled=false;lastLevel=0;
   for(const node of [low,high]){
    if(node){try{node.stop();}catch(_){ }try{node.disconnect();}catch(_){ }}
   }
   if(gain)try{gain.disconnect();}catch(_){ }
   const prior=context;context=null;low=null;high=null;gain=null;
   if(prior&&typeof prior.close==='function'){
    try{prior.close()?.catch?.(()=>{});}catch(_){ }
   }
  }
  function enable(){
   if(enabled)return true;
   if(!available())return false;
   try{
    context=new AudioContextClass();
    low=context.createOscillator();high=context.createOscillator();
    gain=context.createGain();
    low.type='sine';high.type='triangle';
    low.frequency.setValueAtTime(54,context.currentTime);
    high.frequency.setValueAtTime(96,context.currentTime);
    gain.gain.setValueAtTime(0,context.currentTime);
    low.connect(gain);high.connect(gain);gain.connect(context.destination);
    low.start();high.start();enabled=true;
    if(context.state==='suspended'&&typeof context.resume==='function'){
     try{context.resume()?.catch?.(()=>{});}catch(_){ }
    }
    return true;
   }catch(_){disable();return false;}
  }
  function update(state,foreground=true){
   // A rAF tick or checkpoint restore cannot initialize an audio context.
   if(!enabled||!context||!gain)return false;
   const time=context.currentTime;
   if(!Number.isFinite(time)||time<0)return false;
   const values=profile(state),level=foreground?values.level:0;
   low.frequency.setTargetAtTime(values.lowHz,time,.28);
   high.frequency.setTargetAtTime(values.highHz,time,.28);
   lastLevel=level;
   gain.gain.setTargetAtTime(level*volume,time,.36);
   return true;
  }
  function setVolume(value){
   if(!Number.isFinite(value)||value<0||value>1)
    throw new RangeError('invalid_ambience_volume');
   volume=value;
   if(enabled&&context&&gain)
    gain.gain.setTargetAtTime(lastLevel*volume,context.currentTime,.12);
   return volume;
  }
  return Object.freeze({available,enable,update,setVolume,volume:()=>volume,
   enabled:()=>enabled,disable,dispose:disable});
 }
 return Object.freeze({profile,create});
});
