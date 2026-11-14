/* VEILPOINT CH01 — optional original, synthesized public harbor atmosphere.
 * This is a restrained prototype tone bed, not real environmental recording.
 * A real direct player gesture must activate WebAudio. No location tracking,
 * rival awareness, remote fetch, score changes or checkpoint schema change.
 */
(function(root,factory){
 const api=factory(root.VeilpointSim ||
   (typeof module==='object'&&module.exports?require('./simulation.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryHarborAmbience=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Sim){
 'use strict';
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 function indoors(player,obstacles=[]){
  if(!player||![player.x,player.z].every(Number.isFinite))return false;
  const {x,z}=player;
  // Legacy public rooms retain their original acoustics. New story-first
  // halls have to exist as ACTUAL collision bodies, not a magic coordinate:
  // old checkpoint/world revisions may not contain that venue.
  const oldPublicInterior=(x>=80&&x<=94&&z>=17&&z<=33) ||
    (x>=-56&&x<=-34&&z>=125&&z<=145) ||
    (x>=-164&&x<=-144&&z>=112&&z<=130);
  if(oldPublicInterior)return true;
  if(!Array.isArray(obstacles))return false;
  if(Sim?.harborPassageAt?.(player,obstacles))return true;
  const walls=['west','east','north','southwest','southeast']
    .map(part=>obstacles.find(o=>o?.id==='harbor-hall-'+part&&
      o.type==='story-public-hall-wall'&&
      [o.x,o.z,o.w,o.d].every(Number.isFinite)));
  if(walls.some(o=>!o))return false;
  const [west,east,north,southwest,southeast]=walls;
  // Genuine inner standing space bounded by the real 60Hz wall extents;
  // an exterior player beside a facade must not hear enclosed room sound.
  return x>west.x+west.w/2&&x<east.x-east.w/2&&
    z>Math.max(southwest.z+southwest.d/2,southeast.z+southeast.d/2)&&
    z<north.z-north.d/2&&
    !obstacles.some(o=>{
      if(!o||![o.x,o.z,o.w,o.d].every(Number.isFinite))return false;
      const dx=Math.max(0,Math.abs(x-o.x)-o.w/2),
            dz=Math.max(0,Math.abs(z-o.z)-o.d/2);
      return dx*dx+dz*dz<.65*.65;
    });
 }
 // The same PUBLIC harbor approach is encountered before and after the
 // unexpected escalation.  Distinct *synthetic* harmonic beds communicate
 // local environmental change; these are not licensed recordings or a claim
 // to faithfully reproduce real Aden.  Coordinates only select sound near
 // the player, never reveal distant actors or generate story objectives.
 function acousticArea(player,obstacles){
  if(indoors(player,obstacles))return 'interior';
  const distance=(x,z)=>Math.hypot(player.x-x,player.z-z);
  if(distance(-12,-60)<15)return 'relief-courtyard';
  if(distance(24,-35)<19)return 'market';
  if(distance(0,-18)<23)return 'harbor-approach';
  return 'open-harbor';
 }
 // The synthesized public environmental bed originates from fixed,
 // original civilian activity areas, NOT real-world surveyed facilities.
 // The same CH01 wall colliders that block walking also muffle the ambience.
 // No NPC identities, opponent visibility or arbitrary player GPS enters it.
 const SOURCES=Object.freeze({
  'harbor-approach':Object.freeze({x:0,z:-18}),
  'market':Object.freeze({x:24,z:-35}),
  'relief-courtyard':Object.freeze({x:-12,z:-60}),
  'open-harbor':Object.freeze({x:0,z:-18})
 });
 function spatialResponse(state,area){
  const player=state.world.player,source=SOURCES[area];
  if(!source)return Object.freeze({occluded:false,pan:0});
  const dx=source.x-player.x,dz=source.z-player.z;
  const distance=Math.hypot(dx,dz),yaw=Number.isFinite(player.yaw)?player.yaw:0;
  const pan=clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/
    Math.max(1,distance)*.72,-.72,.72);
  const solids=state.world.obstacles;
  const occluded=distance>1&&distance<90&&Array.isArray(solids)&&
    !!Sim?.lineBlocked?.(player.x,player.z,source.x,source.z,solids);
  return Object.freeze({occluded,pan});
 }
 // Existing on-foot CH01 dialogue (including the newly authored civilian
 // hall) has priority over atmosphere ONLY while a real person can speak at
 // close range without a solid wall in between. This does not change story
 // facts, invent NPC locations or require a new save field.
 function witnessedSpeech(state){
  if(!state?.combat?.cleared||!['records','decision','exit'].includes(state.phase))
   return false;
  const p=state.world?.player,solids=state.world?.obstacles;
  if(!p||![p.x,p.z].every(Number.isFinite)||!Array.isArray(solids))
   return false;
  const audible=(person,range)=>person&&[person.x,person.z].every(Number.isFinite)&&
   Math.hypot(p.x-person.x,p.z-person.z)<=range&&
   !Sim?.lineBlocked?.(p.x,p.z,person.x,person.z,solids);
  return !!(audible(state.world.liaison,5)||
   audible(state.world.kimJiyoon,5)||
   (state.mara?.arrived===true&&audible(state.mara,8))||
   (state.civilianRerouted===true&&state.civilianWalker?.arrived===true&&
    audible(state.civilianWalker,7)));
 }
 function profile(state){
  if(!state||!state.world||!state.world.player||
     ![state.world.player.x,state.world.player.z].every(Number.isFinite))
   return Object.freeze({lowHz:54,highHz:96,level:0,indoors:false,
     area:'unavailable',moment:'silent',occluded:false,pan:0});
  const phase=state.phase,player=state.world.player,
        area=acousticArea(player,state.world.obstacles);
  const inside=area==='interior',active=phase!=='failed'&&phase!=='complete';
  // One original, observable incident changes an already visited street.
  // "After" does not claim the whole fictional city is destroyed or safe.
  const moment=!active?'silent':phase==='terminal'?'ordinary':
    phase==='engagement'?'escalation':'changed-street';
  // Speech and effects retain priority while danger is unfolding.
  const base=!active?0:phase==='engagement'?.0028:
    phase==='terminal'?.0043:.0062;
  const spatial=spatialResponse(state,area);
  const speechPriority=witnessedSpeech(state);
  const passage=Sim?.harborPassageAt?.(player,state.world.obstacles);
  const roomGain=passage?1-.60*passage.enclosure:inside?.40:1;
  const level=clamp(base*roomGain*(spatial.occluded?.52:1)*
    (speechPriority?.58:1),0,.008);
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
  // Reaching the south courtyard alone is not evidence of resupply.
  // Once the captain has physically handed the crate to Yusuf's team,
  // only the immediate public receiving yard gains a modest, calmer
  // original synthesized activity bed. Other districts do not change.
  const witnessedAid=state.aidDelivered===true&&
    area==='relief-courtyard'&&moment==='changed-street';
  if(witnessedAid){lowHz=56;highHz=119;}
  return Object.freeze({lowHz,highHz,level,indoors:inside,area,moment,
    witnessedAid,speechPriority,occluded:spatial.occluded,pan:spatial.pan});
 }
 function create({AudioContextClass=null}={}){
  let context=null,low=null,high=null,gain=null,panner=null,enabled=false,volume=1,lastLevel=0;
  const available=()=>typeof AudioContextClass==='function';
  function disable(){
   enabled=false;lastLevel=0;
   for(const node of [low,high]){
    if(node){try{node.stop();}catch(_){ }try{node.disconnect();}catch(_){ }}
   }
   if(gain)try{gain.disconnect();}catch(_){ }
   if(panner)try{panner.disconnect();}catch(_){ }
   const prior=context;context=null;low=null;high=null;gain=null;panner=null;
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
    low.connect(gain);high.connect(gain);
    // StereoPanner is optional in older offline PC runtimes: the same
    // original ambience remains audible in mono when it is unavailable.
    panner=typeof context.createStereoPanner==='function'
      ?context.createStereoPanner():null;
    if(panner){gain.connect(panner);panner.connect(context.destination);}
    else gain.connect(context.destination);
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
   panner?.pan?.setTargetAtTime(values.pan,time,.22);
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
 return Object.freeze({profile,create,indoors,witnessedSpeech});
});
