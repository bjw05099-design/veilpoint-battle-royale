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
// Render-only, conservative 2D solid-cover test. Three silhouette samples keep
// an actor visible when a shoulder is exposed at an edge, while suppressing
// wall-penetrating opponent models and shot flashes in the software fallback.
// This is not a substitute for native depth testing or full 3D occlusion.
function rayBlocked(ax,az,bx,bz,obstacles){
 const dx=bx-ax,dz=bz-az;
 for(const o of obstacles){
  if(!o||![o.x,o.z,o.w,o.d].every(Number.isFinite)||o.w<=0||o.d<=0)continue;
  const minX=o.x-o.w/2,maxX=o.x+o.w/2;
  const minZ=o.z-o.d/2,maxZ=o.z+o.d/2;
  let near=0,far=1;
  if(Math.abs(dx)<1e-8){if(ax<minX||ax>maxX)continue;}
  else{
   let a=(minX-ax)/dx,b=(maxX-ax)/dx;
   if(a>b){const tmp=a;a=b;b=tmp;}
   near=Math.max(near,a);far=Math.min(far,b);
   if(near>=far)continue;
  }
  if(Math.abs(dz)<1e-8){if(az<minZ||az>maxZ)continue;}
  else{
   let a=(minZ-az)/dz,b=(maxZ-az)/dz;
   if(a>b){const tmp=a;a=b;b=tmp;}
   near=Math.max(near,a);far=Math.min(far,b);
  }
  // Only positive-length cover strictly between the camera and target counts.
  if(near<far-1e-8&&far>1e-6&&near<1-1e-6)return true;
 }
 return false;
}
function hasExposedSilhouette(player,entity,radius,obstacles){
 if(!Array.isArray(obstacles)||obstacles.length===0)return true;
 const dx=entity.x-player.x,dz=entity.z-player.z;
 const distance=Math.hypot(dx,dz);
 if(distance<1e-6)return true;
 const sideX=-dz/distance*radius,sideZ=dx/distance*radius;
 return !rayBlocked(player.x,player.z,entity.x,entity.z,obstacles)||
  !rayBlocked(player.x,player.z,entity.x+sideX,entity.z+sideZ,obstacles)||
  !rayBlocked(player.x,player.z,entity.x-sideX,entity.z-sideZ,obstacles);
}
function planVisible(state,aspect=16/9){
 if(!state||!state.player||!state.zone||!Array.isArray(state.bots)||!Array.isArray(state.loot)||!Array.isArray(state.effects))throw new TypeError('Invalid simulation state');
 const p=state.player,halfFov=halfHorizontalFov(aspect);
 const bots=[],loot=[],zone=[],effects=[];
 let botTotal=0,lootTotal=0,boxes=0;
 for(const entity of state.bots){
  if(!entity.alive)continue;
  botTotal++;
  if(!inView(p,entity.x,entity.z,1.1,MAX_DISTANCE,halfFov)||
     !hasExposedSilhouette(p,entity,.85,state.obstacles))continue;
  const distance=Math.hypot(entity.x-p.x,entity.z-p.z),lod=lodForDistance(distance);
  bots.push({entity,lod});boxes+=lod==='high'?6:lod==='medium'?3:1;
 }
 for(const entity of state.loot){
  if(entity.picked)continue;
  lootTotal++;
  if(!inView(p,entity.x,entity.z,1,MAX_DISTANCE,halfFov)||
     !hasExposedSilhouette(p,entity,.5,state.obstacles))continue;
  const distance=Math.hypot(entity.x-p.x,entity.z-p.z),lod=distance<75?'high':'low';
  loot.push({entity,lod});boxes+=lod==='high'?2:1;
 }
 // The changing match-eligibility boundary belongs on the minimap/HUD only.
 // No impossible moving physical pylons or glowing world-space force field.
 for(const entity of state.effects){
  if(inView(p,entity.x,entity.z,.65,MAX_DISTANCE,halfFov)&&
     hasExposedSilhouette(p,entity,.16,state.obstacles)){effects.push(entity);boxes++;}
 }
 return {bots,loot,zone,effects,stats:{botsVisible:bots.length,botsTotal:botTotal,lootVisible:loot.length,lootTotal,zoneVisible:zone.length,zoneTotal:0,effectsVisible:effects.length,estimatedDynamicVertices:boxes*36}};
}
return {VERTICAL_FOV,MAX_DISTANCE,ZONE_SEGMENTS,halfHorizontalFov,inView,lodForDistance,planVisible};
});
