/* VEILPOINT v1.6: camera-space dynamic geometry culling and distance LOD.
 * Render-only: this never filters simulation entities or changes game outcomes.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.VeilpointVisibility=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERTICAL_FOV=Math.PI/3.25;
const MAX_DISTANCE=155;
const ZONE_SEGMENTS=128;
function halfHorizontalFov(aspect){
 if(!Number.isFinite(aspect)||aspect<=0)throw new RangeError('Invalid viewport aspect');
 return Math.min(Math.PI/2-.01,Math.atan(Math.tan(VERTICAL_FOV/2)*aspect)+.12);
}
function inView(player,x,z,radius=1,maxDistance=MAX_DISTANCE,halfFov=halfHorizontalFov(16/9)){
 if(!player||![player.x,player.z,player.yaw,x,z,radius,maxDistance,halfFov].every(Number.isFinite)||radius<0||maxDistance<=0||halfFov<=0)return false;
 const dx=x-player.x,dz=z-player.z,distance=Math.hypot(dx,dz);
 if(distance-radius>maxDistance)return false;
 if(distance<=radius+1)return true;
 const forward=(dx*Math.sin(player.yaw)-dz*Math.cos(player.yaw))/distance;
 const expanded=Math.min(Math.PI,halfFov+Math.asin(Math.min(1,radius/distance)));
 return forward>=Math.cos(expanded);
}
function lodForDistance(distance,near=45,mid=90){
 if(!Number.isFinite(distance)||distance<0)throw new RangeError('Invalid distance');
 return distance<=near?'high':distance<=mid?'medium':'low';
}
function planVisible(state,aspect=16/9){
 if(!state||!state.player||!state.zone||!Array.isArray(state.bots)||!Array.isArray(state.loot)||!Array.isArray(state.effects))throw new TypeError('Invalid simulation state');
 const p=state.player,halfFov=halfHorizontalFov(aspect);
 const bots=[],loot=[],zone=[],effects=[];
 let botTotal=0,lootTotal=0,boxes=0;
 for(const entity of state.bots){
  if(!entity.alive)continue;
  botTotal++;
  if(!inView(p,entity.x,entity.z,1.1,MAX_DISTANCE,halfFov))continue;
  const distance=Math.hypot(entity.x-p.x,entity.z-p.z),lod=lodForDistance(distance);
  bots.push({entity,lod});boxes+=lod==='high'?6:lod==='medium'?3:1;
 }
 for(const entity of state.loot){
  if(entity.picked)continue;
  lootTotal++;
  if(!inView(p,entity.x,entity.z,1,MAX_DISTANCE,halfFov))continue;
  const distance=Math.hypot(entity.x-p.x,entity.z-p.z),lod=distance<75?'high':'low';
  loot.push({entity,lod});boxes+=lod==='high'?2:1;
 }
 if(Number.isFinite(state.zone.radius)&&state.zone.radius>0&&state.zone.radius<170){
  for(let i=0;i<ZONE_SEGMENTS;i++){
   const theta=i/ZONE_SEGMENTS*Math.PI*2;
   const x=state.zone.x+Math.cos(theta)*state.zone.radius;
   const z=state.zone.z+Math.sin(theta)*state.zone.radius;
   if(inView(p,x,z,1.5,MAX_DISTANCE,halfFov)){zone.push({x,z});boxes++;}
  }
 }
 for(const entity of state.effects){
  if(inView(p,entity.x,entity.z,.65,MAX_DISTANCE,halfFov)){effects.push(entity);boxes++;}
 }
 return {bots,loot,zone,effects,stats:{botsVisible:bots.length,botsTotal:botTotal,lootVisible:loot.length,lootTotal,zoneVisible:zone.length,zoneTotal:state.zone.radius<170?ZONE_SEGMENTS:0,effectsVisible:effects.length,estimatedDynamicVertices:boxes*36}};
}
return {VERTICAL_FOV,MAX_DISTANCE,ZONE_SEGMENTS,halfHorizontalFov,inView,lodForDistance,planVisible};
});
