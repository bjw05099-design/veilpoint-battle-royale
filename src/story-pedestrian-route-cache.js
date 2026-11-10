/* VEILPOINT CH01: bounded, collision-audited reuse of public pedestrian routes.
 * This HUD-only object is never part of the 60Hz simulation or V2 saves.
 * Exact mutable obstacle geometry comparison prevents stale routes after
 * a van, awning, public gate or any other physical world shape changes.
 */
(function(root,factory){
 const guidance=typeof module==='object'&&module.exports?
   require('./story-pedestrian-guidance.js'):root.VeilpointStoryPedestrianGuidance;
 const sim=typeof module==='object'&&module.exports?
   require('./simulation.js'):root.VeilpointSim;
 const paths=typeof module==='object'&&module.exports?
   require('./public-city-footpaths.js'):root.VeilpointPublicFootpaths;
 const navigation=typeof module==='object'&&module.exports?
   require('./navigation.js'):root.VeilpointNavigation;
 const api=factory(guidance,sim,paths,navigation);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryPedestrianRouteCache=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Guidance,Sim,Footpaths,Navigation){
 'use strict';
 const MAX_REUSE_METRES=6,MAX_NEGATIVE_REUSE_METRES=.2;
 const CLEARANCE=Footpaths?.CLEARANCE||1.05;
 function geometryMatches(obstacles,saved){
  if(!Array.isArray(obstacles)||!Array.isArray(saved)||obstacles.length*4!==saved.length)
   return false;
  for(let i=0;i<obstacles.length;i++){
   const o=obstacles[i],j=i*4;
   if(!o||!Object.is(o.x,saved[j])||!Object.is(o.z,saved[j+1])||
      !Object.is(o.w,saved[j+2])||!Object.is(o.d,saved[j+3]))return false;
  }
  return true;
 }
 function geometryCopy(obstacles){
  const copy=[];
  for(const o of obstacles)copy.push(o?.x,o?.z,o?.w,o?.d);
  return copy;
 }
 function routeFrom(player,marker,obstacles,previous){
  if(!previous||previous.kind!=='detour'||!Array.isArray(previous.points)||
      previous.points.length<2)return null;
  const p={x:player.x,z:player.z},goal={x:marker.x,z:marker.z};
  if(Sim.blocked(p.x,p.z,CLEARANCE,obstacles)||
     Sim.blocked(goal.x,goal.z,CLEARANCE,obstacles))return null;
  // A changed player position can make the destination directly visible,
  // but only an actual collision check may remove the previous detour.
  if(!Navigation.directLineBlocked(p,goal,obstacles)){
   const distance=Math.hypot(p.x-goal.x,p.z-goal.z);
   return Object.freeze({id:marker.id,kind:'direct',
    points:Object.freeze([Object.freeze(p),Object.freeze(goal)]),
    distance,segment:distance,heading:Navigation.direction(player,goal),
    terrainVerified:true,peopleVerified:false});
  }
  const inflated=obstacles.map(o=>({...o,w:o.w+2*CLEARANCE,d:o.d+2*CLEARANCE}));
  // Rejoin only a FORWARD segment that is clear for a real player body.
  // Never skip a physical wall, and never reuse the previous world position
  // as an immovable route start while the captain is actually walking.
  for(let i=previous.points.length-1;i>=1;i--){
   const next=previous.points[i],distance=Math.hypot(next.x-p.x,next.z-p.z);
   if(distance<1e-7||Sim.lineBlocked(p.x,p.z,next.x,next.z,inflated))continue;
   const points=[p,...previous.points.slice(i)];
   let total=0,valid=true;
   for(let j=1;j<points.length;j++){
    const from=points[j-1],to=points[j],length=Math.hypot(from.x-to.x,from.z-to.z);
    if(!Number.isFinite(length)||length<1e-7||
       Sim.lineBlocked(from.x,from.z,to.x,to.z,inflated)){valid=false;break;}
    total+=length;
   }
   if(!valid)continue;
   return Object.freeze({id:marker.id,kind:'detour',
    points:Object.freeze(points.map(x=>Object.freeze({x:x.x,z:x.z}))),
    distance:total,segment:distance,
    heading:Navigation.direction(player,next),
    terrainVerified:true,peopleVerified:false});
  }
  return null;
 }
 function create(search=Guidance?.plan){
  if(typeof search!=='function')throw new TypeError('Missing public pedestrian planner');
  let remembered=null,freshOrigin=null,geometry=null,target=null;
  let searches=0,reuses=0;
  function clear(){remembered=null;freshOrigin=null;geometry=null;target=null;}
  function get(player,marker,obstacles){
   if(!player||!marker||typeof marker.id!=='string'||!marker.id||
      ![player.x,player.z,player.yaw,marker.x,marker.z].every(Number.isFinite)||
      !Array.isArray(obstacles)){
    clear();return null;
   }
   const same=target&&target.id===marker.id&&
     target.x===marker.x&&target.z===marker.z&&
     geometryMatches(obstacles,geometry)&&freshOrigin;
   if(same){
    const moved=Math.hypot(player.x-freshOrigin.x,player.z-freshOrigin.z);
    if(remembered===null&&moved<=MAX_NEGATIVE_REUSE_METRES){
     reuses++;return null;
    }
    if(remembered&&moved<=MAX_REUSE_METRES){
     const reused=routeFrom(player,marker,obstacles,remembered);
     if(reused){
      reuses++;remembered=reused;
      return reused;
     }
    }
   }
   // A missing route, changed body, changed objective or a moved player is
   // never silently "approved" using a cached result.
   const result=search(player,marker,obstacles);
   searches++;
   target={id:marker.id,x:marker.x,z:marker.z};
   geometry=geometryCopy(obstacles);
   freshOrigin={x:player.x,z:player.z};
   remembered=result;
   return result;
  }
  function stats(){return Object.freeze({searches,reuses});}
  return Object.freeze({get,clear,stats});
 }
 return Object.freeze({MAX_REUSE_METRES,MAX_NEGATIVE_REUSE_METRES,
  geometryMatches,create});
});
