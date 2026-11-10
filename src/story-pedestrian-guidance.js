/* VEILPOINT CH01 · collision-checked, read-only pedestrian directions.
 * Runs on the game's ORIGINAL fictional civilian street AABBs, not
 * georeferenced conflict-zone routes. Does not command or move any actor,
 * store a checkpoint field, award a mission result or reveal hidden targets.
 * Moving people may still cross a previously planned street segment.
 */
(function(root,factory){
 const sim=typeof module==='object'&&module.exports?
  require('./simulation.js'):root.VeilpointSim;
 const paths=typeof module==='object'&&module.exports?
  require('./public-city-footpaths.js'):root.VeilpointPublicFootpaths;
 const nav=typeof module==='object'&&module.exports?
  require('./navigation.js'):root.VeilpointNavigation;
 const api=factory(sim,paths,nav);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryPedestrianGuidance=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Sim,Footpaths,Navigation){
 'use strict';
 const MAX_STRAIGHT_METRES=75;
 const MAX_VISITS=360;
 const MAX_SEGMENTS=24;
 const clearance=Footpaths?.CLEARANCE||1.05;
 const publicTarget=target=>!!target&&typeof target.id==='string'&&
  target.id.length>0&&[target.x,target.z].every(Number.isFinite);
 function targetFor(player,markers,selectedId=null,preferredId=null,escortBlocked=false){
  if(!player||!Array.isArray(markers)||!markers.length)return null;
  const manual=markers.find(p=>p.id===selectedId&&publicTarget(p));
  if(manual)return manual;
  // An unresolved escort should never advertise a generic distant exit as
  // a verified walking route when its actual civilian is out of sight.
  if(escortBlocked)return null;
  const preferred=markers.find(p=>p.id===preferredId&&publicTarget(p));
  if(preferred)return preferred;
  let best=null,meters=Infinity;
  for(const p of markers){
   if(!publicTarget(p))continue;
   const d=Math.hypot(player.x-p.x,player.z-p.z);
   if(Number.isFinite(d)&&d<meters){best=p;meters=d;}
  }
  return best;
 }
 function plan(player,marker,obstacles,{maxVisits=MAX_VISITS}={}){
  if(!Footpaths||!Sim||!Navigation||!publicTarget(marker)||
    !player||!Number.isFinite(player.x)||!Number.isFinite(player.z)||
    !Number.isFinite(player.yaw)||!Array.isArray(obstacles))return null;
  if(!Number.isSafeInteger(maxVisits)||maxVisits<1||maxVisits>MAX_VISITS)
   throw new RangeError('Story pedestrian route search must be bounded');
  const straight=Math.hypot(marker.x-player.x,marker.z-player.z);
  if(!Number.isFinite(straight)||straight>MAX_STRAIGHT_METRES)return null;
  const p={x:player.x,z:player.z},destination={x:marker.x,z:marker.z};
  // Do not report paths from/to a player-height AABB occupied by a wall.
  if(Sim.blocked(p.x,p.z,clearance,obstacles)||
     Sim.blocked(destination.x,destination.z,clearance,obstacles))return null;
  if(!Navigation.directLineBlocked(p,destination,obstacles)){
   return Object.freeze({id:marker.id,kind:'direct',
    points:Object.freeze([Object.freeze(p),Object.freeze(destination)]),
    distance:straight,segment:straight,heading:Navigation.direction(player,destination),
    terrainVerified:true,peopleVerified:false});
  }
  // The full city A* planner is already bounded and validates the same
  // inflated collision AABBs as character walking. Never fake a usable
  // route when its budget is exhausted or the crossing remains blocked.
  const found=Footpaths.plan(p,destination,obstacles,{maxVisits});
  if(!found||found.length<2||found.length>MAX_SEGMENTS)return null;
  const all=found.map(x=>Object.freeze({x:x.x,z:x.z}));
  const inflated=obstacles.map(o=>({...o,w:o.w+2*clearance,d:o.d+2*clearance}));
  let distance=0;
  for(let i=1;i<all.length;i++){
   const a=all[i-1],b=all[i],len=Math.hypot(a.x-b.x,a.z-b.z);
   if(!Number.isFinite(len)||len<1e-7||Sim.lineBlocked(a.x,a.z,b.x,b.z,inflated))
    return null;
   distance+=len;
  }
  const next=all[1];
  return Object.freeze({id:marker.id,kind:'detour',
   points:Object.freeze(all),distance,segment:Math.hypot(next.x-p.x,next.z-p.z),
   heading:Navigation.direction(player,next),terrainVerified:true,
   peopleVerified:false});
 }
 function instruction(result){
  if(!result||result.kind!=='detour')return '';
  if(!result.heading||!Number.isFinite(result.distance))return '';
  // The route is valid against world collision at this simulation snapshot,
  // not a promise that changing traffic or humans will remain stationary.
  return ' · 실제 보행 우회 확인 · 첫 구간 '+result.heading.label+
   ' 약 '+Math.ceil(result.segment)+'m · 전체 약 '+Math.ceil(result.distance)+
   'm · 이동 인원은 현장에서 확인';
 }
 return Object.freeze({MAX_STRAIGHT_METRES,MAX_VISITS,targetFor,plan,instruction});
});
