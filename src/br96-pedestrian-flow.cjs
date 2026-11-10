'use strict';
// Server-authoritative pedestrian crowding for the fictional BR96 district.
// No client-supplied density, obstacle bypass, opponent coordinates or
// additional team scoring. Visible, nearby human bodies alone affect pace.
const REACH=3.6, MAX_PENALTY=.24;
function assessPedestrianFlow(actor,all,blockedSight=()=>false,travel=null){
 if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.z)||
    !Array.isArray(all)||typeof blockedSight!=='function')
    throw new RangeError('invalid_pedestrian_flow');
 // Moving through a crowd is different from standing inside one. People
 // already behind the actor do not obstruct its NEXT forward step, while
 // people alongside or ahead can. The travel vector comes from server-owned
 // movement intent, never a client-supplied crowd density or camera heading.
 // Omitted/idle heading retains the historical omnidirectional crowd view.
 const moving=travel&&Number.isFinite(travel.x)&&Number.isFinite(travel.z);
 const magnitude=moving?Math.hypot(travel.x,travel.z):0;
 const heading=magnitude>1e-8?{x:travel.x/magnitude,z:travel.z/magnitude}:null;
 let near=0;
 for(const other of all){
  if(!other||other===actor||other.eligible===false||
     !Number.isFinite(other.x)||!Number.isFinite(other.z))continue;
  const d=Math.hypot(other.x-actor.x,other.z-actor.z);
  if(d<REACH&&
     // Include exact overlaps: a transient coincident avatar must never
     // become invisible to the congestion estimate.
     (!heading||(other.x-actor.x)*heading.x+
       (other.z-actor.z)*heading.z>=-0.25)&&
     !blockedSight(actor.x,actor.z,other.x,other.z))near++;
 }
 // A single passerby never imposes an artificial slowing effect. Congestion
 // only modulates ordinary movement; it cannot freeze a player or teleport.
 const mobility=Math.round((1-Math.min(MAX_PENALTY,Math.max(0,near-1)*.08))*100)/100;
 return Object.freeze({mobility,busy:mobility<1});
}
module.exports={assessPedestrianFlow,REACH};
