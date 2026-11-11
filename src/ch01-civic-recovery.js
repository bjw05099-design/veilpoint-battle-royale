/* VEILPOINT CH01 civic crossing simulation, shared by Node tests and PC browser.\n * Public resident movement only; no remote tracking or mission gating. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointCivicRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // CH01 fictional harbor civic recovery: a witnessed disruption changes an
 // ordinary street crossing. Deterministic 60Hz positions, no remote actions.
 const CROSSING=Object.freeze({x:6,z:-16,radius:2.5});
 const SPEED=1.1;
 function initial(){return {version:1,tick:0,disrupted:false,assisted:false,civilian:{x:2,z:-16},destination:{x:10,z:-16}};}
 function step(state,{disruption=false,assist=false,player,blocked=null,pedestrians=[]}={}){
   if(!Array.isArray(pedestrians)||pedestrians.length>32)
     throw new TypeError('invalid_local_pedestrians');
   if(!state||state.version!==1||!Number.isSafeInteger(state.tick)||state.tick<0)throw new TypeError('invalid_civic_state');
   const near=player&&Number.isFinite(player.x)&&Number.isFinite(player.z)&&
     Math.hypot(player.x-CROSSING.x,player.z-CROSSING.z)<=CROSSING.radius;
   const disrupted=state.disrupted||disruption===true;
   const assisted=state.assisted||(disrupted&&assist===true&&near);
   const civilian={...state.civilian};
   // An ordinary resident can walk around a short fictional street obstruction
   // instead of freezing forever on a single straight line. The local detour
   // is rebuilt from the current saved metre-space pose on every fixed tick:
   // no unseen teleport, new checkpoint field or remote route command.
   if(disrupted&&state.assisted){
     const travel=SPEED/60;
     const destination=state.destination;
     const blockedAt=(x,z)=>typeof blocked==='function'&&blocked(x,z);
     const bodyAt=(body,x,z)=>!!body&&Number.isFinite(body.x)&&
       Number.isFinite(body.z)&&Math.hypot(x-body.x,z-body.z)<1.1;
     const crowdOccupied=(x,z)=>pedestrians.some(body=>bodyAt(body,x,z));
     const occupied=(x,z)=>bodyAt(player,x,z)||crowdOccupied(x,z);
     let nx=civilian.x,nz=civilian.z;
     const ahead=Math.min(destination.x,civilian.x+2.4);
     const centerObstructed=[.6,1.2,2.4].some(offset=>{
       const aheadX=Math.min(destination.x,civilian.x+offset);
       // Preserve the established player-controlled crossing: the captain
       // physically standing in the way causes a wait, not an automatic
       // detour that silently changes the existing CH01 escort outcome.
       return blockedAt(aheadX,destination.z)||crowdOccupied(aheadX,destination.z);
     });
     if(centerObstructed&&civilian.x<destination.x){
       // Prefer the original curb-side lane, then the opposite public lane.
       // A corridor unavailable at the current location is not forced.
       // Sample the prospective lane ahead rather than picking a corridor
       // that is clear only at the current feet. The person owns this 60Hz
       // choice; an unseen client cursor never creates a route or waypoint.
       const lanes=[-18.4,-13.6].filter(z=>
         [.6,1.2,2.4].every(offset=>{
           const x=Math.min(destination.x,civilian.x+offset);
           return !blockedAt(x,z)&&!occupied(x,z);
         })&&!blockedAt(civilian.x,z)&&!occupied(civilian.x,z));
       const lane=lanes.find(z=>Math.abs(z-civilian.z)<.05)||lanes[0];
       if(lane!==undefined){
         if(Math.abs(civilian.z-lane)>1e-8)
           nz+=Math.sign(lane-civilian.z)*Math.min(travel,Math.abs(lane-civilian.z));
         else nx=Math.min(destination.x,civilian.x+travel);
       }
     }else{
       const dx=destination.x-civilian.x,dz=destination.z-civilian.z;
       const length=Math.hypot(dx,dz);
       if(length>0){
         const distance=Math.min(length,travel);
         nx+=dx/length*distance;nz+=dz/length*distance;
       }
     }
     // The same CH01 solid obstacles and the actual player's capsule retain
     // final authority. Failure to fit means this 60Hz tick simply waits.
     if(nx>=2&&nx<=destination.x&&nz>=-18.4&&nz<=-13.6&&
        !occupied(nx,nz)&&!blockedAt(nx,nz)){
       civilian.x=nx;civilian.z=nz;
     }
   }
   return {version:1,tick:state.tick+1,disrupted,assisted,civilian,destination:{...state.destination}};
 }
 function restore(raw){
   if(!raw||raw.version!==1||!Number.isSafeInteger(raw.tick)||raw.tick<0||
      typeof raw.disrupted!=='boolean'||typeof raw.assisted!=='boolean'||
      (raw.assisted&&!raw.disrupted)||
      ![raw.civilian?.x,raw.civilian?.z,raw.destination?.x,raw.destination?.z].every(Number.isFinite))
     throw new TypeError('invalid_civic_save');
   return {version:1,tick:raw.tick,disrupted:raw.disrupted,assisted:raw.assisted,
     civilian:{x:raw.civilian.x,z:raw.civilian.z},
     destination:{x:raw.destination.x,z:raw.destination.z}};
 }
 return Object.freeze({initial,step,restore,CROSSING});
});
