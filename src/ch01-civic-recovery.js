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
 function step(state,{disruption=false,assist=false,player,blocked=null}={}){
   if(!state||state.version!==1||!Number.isSafeInteger(state.tick)||state.tick<0)throw new TypeError('invalid_civic_state');
   const near=player&&Number.isFinite(player.x)&&Number.isFinite(player.z)&&
     Math.hypot(player.x-CROSSING.x,player.z-CROSSING.z)<=CROSSING.radius;
   const disrupted=state.disrupted||disruption===true;
   const assisted=state.assisted||(disrupted&&assist===true&&near);
   const civilian={...state.civilian};
   // A face-to-face F interaction records intent; walking starts on the
  // NEXT 60Hz world tick, not by mutating coordinates inside a UI click.
  if(disrupted&&state.assisted){
     const dx=state.destination.x-civilian.x,dz=state.destination.z-civilian.z;
     const distance=Math.hypot(dx,dz);
     const travel=Math.min(distance,SPEED/60);
     if(distance>0){
      const nextX=civilian.x+dx/distance*travel;
      const nextZ=civilian.z+dz/distance*travel;
      // A person cannot pass through the captain or an authored solid wall.
      // Wait in place until the actual route is physically passable.
      const occupied=!!player&&Number.isFinite(player.x)&&Number.isFinite(player.z)&&
        Math.hypot(nextX-player.x,nextZ-player.z)<1.1;
      if(!occupied&&!(typeof blocked==='function'&&blocked(nextX,nextZ))){
       civilian.x=nextX;civilian.z=nextZ;
      }
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
