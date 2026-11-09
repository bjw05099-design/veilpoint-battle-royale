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
 // The same PUBLIC harbor approach is encountered before and after the
 // unexpected escalation.  Distinct *synthetic* harmonic beds communicate
 // local environmental change; these are not licensed recordings or a claim
 // to faithfully reproduce real Aden.  Coordinates only select sound near
 // the player, never reveal distant actors or generate story objectives.
 function acousticArea(player){
  if(indoors(player))return 'interior';
  const distance=(x,z)=>Math.hypot(player.x-x,player.z-z);
  if(distance(24,-35)<19)return 'market';
  if(distance(0,-18)<23)return 'harbor-approach';
  return 'open-harbor';
 }
 function profile(state){
  if(!state||!state.world||!state.world.player||
     ![state.world.player.x,state.world.player.z].every(Number.isFinite))
   return Object.freeze({lowHz:54,highHz:96,level:0,indoors:false,
     area:'unavailable',moment:'silent'});
  const phase=state.phase,player=state.world.player,area=acousticArea(player);
  const inside=area==='interior',active=phase!=='failed'&&phase!=='complete';
  // One original, observable incident changes an already visited street.
  // "After" does not claim the whole fictional city is destroyed or safe.
  const moment=!active?'silent':phase==='terminal'?'ordinary':
    phase==='engagement'?'escalation':'changed-street';
  // Speech and effects retain priority while danger is unfolding.
  const base=!active?0:phase==='engagement'?.0028:
    phase==='terminal'?.0043:.0062;
  const level=clamp(base*(inside?.40:1),0,.008);
  let lowHz=inside?51:58,highHz=96;
  if(area==='market'){
   lowHz=moment==='ordinary'?65:moment==='silent'?58:47;
   highHz=moment==='ordinary'?125:moment==='silent'?96:78;
  }else if(area==='harbor-approach'){
   lowHz=moment==='ordinary'?60:moment==='silent'?58:49;
   highHz=moment==='ordinary'?105:moment==='silent'?96:81;
  }else if(inside && moment!=='ordinary' && moment!=='silent'){
   lowHz=46;highHz=84;
  }
  // Restored relay power affects only its actual nearby public walkway.
  // A single powered fixture never implies a city-wide recovery.
  if(state.relayRestored===true&&
     Math.hypot(player.x-8,player.z+42)<17)highHz=109;
  return Object.freeze({lowHz,highHz,level,indoors:inside,area,moment});
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
