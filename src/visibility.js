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
// The precision class can reach 260 fictional world metres; its low-LOD
// silhouettes must not vanish at the ordinary 155m prototype draw limit.
const PRECISION_VIEW_DISTANCE=270;
const MARKSMAN_VIEW_DISTANCE=195;
function actorViewDistance(weaponId){
 return weaponId==='precision'?PRECISION_VIEW_DISTANCE:
  weaponId==='marksman'?MARKSMAN_VIEW_DISTANCE:MAX_DISTANCE;
}
const ZONE_SEGMENTS=128;
function halfHorizontalFov(aspect,verticalFov=VERTICAL_FOV){
 if(!Number.isFinite(aspect)||aspect<=0)throw new RangeError('Invalid viewport aspect');
 // The camera's CURRENT projection angle (including observation zoom) is
 // authoritative for culling. A fixed 55-degree estimate removed objects
 // actually visible in 78-degree PC mode at both 16:9 and narrow viewports.
 if(!Number.isFinite(verticalFov)||verticalFov<=0||verticalFov>=Math.PI*.9)
  throw new RangeError('Invalid vertical camera field of view');
 return Math.min(Math.PI/2-.01,Math.atan(Math.tan(verticalFov/2)*aspect)+.12);
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
function rayBlocked(ax,az,bx,bz,obstacles,fromY=null,toY=null){
 const dx=bx-ax,dz=bz-az;
 for(const o of obstacles){
  if(!o||!Number.isFinite(o.x)||!Number.isFinite(o.z)||
     !Number.isFinite(o.w)||!Number.isFinite(o.d)||o.w<=0||o.d<=0)continue;
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
  if(Number.isFinite(fromY)&&Number.isFinite(toY)&&Number.isFinite(o.h)){
   const base=Number.isFinite(o.y)?o.y:0,dy=toY-fromY;
   if(Math.abs(dy)<1e-8){if(fromY<base||fromY>base+o.h)continue;}
   else{
    let a=(base-fromY)/dy,b=(base+o.h-fromY)/dy;
    if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);
   }
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
 const eye=player.crouched?1.09:1.64,head=entity.crouched?1.2:1.75;
 return !rayBlocked(player.x,player.z,entity.x,entity.z,obstacles,eye,head)||
  !rayBlocked(player.x,player.z,entity.x+sideX,entity.z+sideZ,obstacles,eye,head)||
  !rayBlocked(player.x,player.z,entity.x-sideX,entity.z-sideZ,obstacles,eye,head);
}
function planVisible(state,aspect=16/9,verticalFov=VERTICAL_FOV){
 if(!state||!state.player||!state.zone||!Array.isArray(state.bots)||!Array.isArray(state.loot)||!Array.isArray(state.effects))throw new TypeError('Invalid simulation state');
 const p=state.player,halfFov=halfHorizontalFov(aspect,verticalFov);
 // Preserve the normal geometry budget for other classes. Only distant
 // low-LOD actors and their brief physical cues need the extended horizon.
 const actorDistance=actorViewDistance(p.weaponId);
 const bots=[],loot=[],zone=[],effects=[],serviceGates=[],yardIndicators=[],trailMarkers=[],guides=[],handcarts=[],witnesses=[],workers=[],vehicles=[];
 let botTotal=0,lootTotal=0,boxes=0;
 for(const entity of state.bots){
  if(!entity.alive)continue;
  botTotal++;
  if(!inView(p,entity.x,entity.z,1.1,actorDistance,halfFov)||
     !hasExposedSilhouette(p,entity,.85,state.obstacles))continue;
  const distance=Math.hypot(entity.x-p.x,entity.z-p.z),lod=lodForDistance(distance);
  bots.push({entity,lod});boxes+=lod==='high'?6:lod==='medium'?3:1;
 }
 // The optional, physically moving CH01 local guide is shown only in the
 // player's finite view and when not occluded by solid harbor buildings.
 if(state.scene==='nahrin'&&state.guide&&
    inView(p,state.guide.x,state.guide.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.guide,.5,state.obstacles)){
   guides.push({entity:state.guide});boxes+=2;
 }
 // A physically present human at the south route; local camera bounds and
 // solid-cover occlusion apply exactly as to the optional civilian guide.
 if(state.scene==='nahrin'&&state.witness&&
    inView(p,state.witness.x,state.witness.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.witness,.55,state.obstacles)){
   witnesses.push({entity:state.witness});boxes+=2;
 }
 // A second independent local civilian actually walks from the cleared public
 // street toward the staffed south courtyard. Occlusion and camera FOV use the
 // same bounded rules as all existing actors; never create an offscreen radar.
 if(state.scene==='nahrin'&&state.civilianWalker&&
    inView(p,state.civilianWalker.x,state.civilianWalker.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.civilianWalker,.55,state.obstacles)){
   witnesses.push({entity:state.civilianWalker});boxes+=2;
 }
 // Civic crossing resident is visible only in the player's true frustum
 // with wall occlusion; there is never a remote resident/travel HUD pin.
 if(state.scene==='nahrin'&&state.civicCrossing&&
    inView(p,state.civicCrossing.x,state.civicCrossing.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.civicCrossing,.55,state.obstacles)){
   witnesses.push({entity:state.civicCrossing});boxes+=2;
 }
 // Mara's independent market journey is a physical, optional local scene.
 // The player gets no distant position marker or awareness through walls.
 if(state.scene==='nahrin'&&state.mara&&
    inView(p,state.mara.x,state.mara.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.mara,.55,state.obstacles)){
  witnesses.push({entity:state.mara});boxes+=2;
 }
 // Jo Hyunji is a physically present character with the same finite
 // camera, line-of-sight and solid-cover checks as other local civilians.
 if(state.scene==='nahrin'&&state.liaison&&
    inView(p,state.liaison.x,state.liaison.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.liaison,.55,state.obstacles)){
  witnesses.push({entity:state.liaison});boxes+=2;
 }
 // Kim Jiyoon exists as an actually moving nearby companion. He receives
 // the same frustum and opaque-wall test as the existing local CH01 people,
 // never an omniscient compass, silhouette through cover or remote target.
 if(state.scene==='nahrin'&&state.kimJiyoon&&
    inView(p,state.kimJiyoon.x,state.kimJiyoon.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.kimJiyoon,.55,state.obstacles)){
   witnesses.push({entity:state.kimJiyoon});boxes+=2;
 }
 // A CH01 civilian traverses a genuine sidewalk using the same physical
 // collision rule as the captain. It appears only when camera-visible and
 // not obscured behind opaque harbor buildings.
 if(state.scene==='nahrin'&&state.worker&&
    inView(p,state.worker.x,state.worker.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.worker,.55,state.obstacles)){
   workers.push({entity:state.worker});boxes+=2;
 }
 // Render the same finite field pouch that PC E can collect from a defeated
 // BR rival. Administrative boundary disqualification creates no physical loot.
 const addVisibleLoot=entity=>{
  if(entity.picked)return;
  lootTotal++;
  if(!inView(p,entity.x,entity.z,1,MAX_DISTANCE,halfFov)||
     !hasExposedSilhouette(p,entity,.5,state.obstacles))return;
  const distance=Math.hypot(entity.x-p.x,entity.z-p.z),lod=distance<75?'high':'low';
  loot.push({entity,lod});boxes+=(lod==='high'?2:1)+(Number.isFinite(entity.remaining)&&entity.remaining>0?1:0);
 };
 for(const entity of state.loot)addVisibleLoot(entity);
 if(!state.scene)for(const b of state.bots){
  if(b.alive||b.disqualified||b.health!==0||
     !Number.isInteger(b.charges)||!Number.isInteger(b.loaded)||b.charges<=b.loaded)continue;
  // Only eligible pouches allocate a draw entity; no per-frame filter/map/concat.
  addVisibleLoot({id:'field-'+b.id,x:b.x,z:b.z,kind:'ammo',weaponId:'carbine',
    remaining:Math.min(12,b.charges-b.loaded),picked:false,fieldPouch:true});
 }
 // Live BR yard panels are dynamic collision geometry; render exactly one
 // moving metal panel whenever it occupies the player's current view.
 // A story scene has no BR service yard.
 if(!state.scene)for(const item of state.obstacles||[]){
  if(item.routeId==='br-service-gate'&&inView(p,item.x,item.z,3.2,MAX_DISTANCE,halfFov)){
   serviceGates.push(item);boxes++;
  }
 }
 // A physical service-yard panel lamp is visible only in the actual camera
 // frustum and after a solid-cover silhouette test. It is not a radar marker.
 if(!state.scene&&state.yardGate){
  const indicator={x:30,z:-21.8};
  if(inView(p,indicator.x,indicator.z,.3,MAX_DISTANCE,halfFov)&&
      hasExposedSilhouette(p,indicator,.25,state.obstacles)){
   yardIndicators.push(indicator);boxes++;
  }
 }
 // A locally placed one-use physical route sign uses the same occlusion and
 // geometry accounting as other small world props. No location reveals AI.
 if(!state.scene&&state.trailMarker&&
    inView(p,state.trailMarker.x,state.trailMarker.z,.5,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,state.trailMarker,.25,state.obstacles)){
   trailMarkers.push(state.trailMarker);boxes+=2;
 }
 // One actual moving dock handcart is visible only in camera and clear sight.
 // Its physical AABB is already in the live 60Hz obstacle array.
 if(!state.scene&&state.handcart){
  const body=state.obstacles.find(o=>o.routeId==='br-dock-handcart');
  if(body&&inView(p,body.x,body.z,1,MAX_DISTANCE,halfFov)&&
    hasExposedSilhouette(p,body,.6,state.obstacles.filter(o=>o!==body))){
    handcarts.push(body);boxes++;
  }
 }
 // The single physical yard vehicle is drawn only when visible to the player.
 // Once occupied, its own body is hidden from the cockpit camera; driving
 // cannot double-render a nearby hollow shell over the driver's eyes.
 if(!state.scene&&state.vehicle&&!state.vehicle.driver){
  const body=state.obstacles.find(o=>o.routeId==='br-yard-shuttle');
  if(body&&inView(p,body.x,body.z,2.5,MAX_DISTANCE,halfFov)&&
     hasExposedSilhouette(p,body,1.15,state.obstacles.filter(o=>o!==body))){
    // Eight existing vehicle meshes plus two physical rear stop lamps.
    vehicles.push(state.vehicle);boxes+=10;
  }
 }
 // The changing match-eligibility boundary belongs on the minimap/HUD only.
 // No impossible moving physical pylons or glowing world-space force field.
 for(const entity of state.effects){
  if(inView(p,entity.x,entity.z,.65,actorDistance,halfFov)&&
     hasExposedSilhouette(p,entity,.16,state.obstacles)){effects.push(entity);boxes++;}
 }
 return {bots,loot,zone,effects,serviceGates,yardIndicators,trailMarkers,guides,handcarts,witnesses,workers,vehicles,stats:{botsVisible:bots.length,botsTotal:botTotal,guidesVisible:guides.length,lootVisible:loot.length,lootTotal,zoneVisible:zone.length,zoneTotal:0,effectsVisible:effects.length,estimatedDynamicVertices:boxes*36}};
}
return {VERTICAL_FOV,MAX_DISTANCE,PRECISION_VIEW_DISTANCE,MARKSMAN_VIEW_DISTANCE,actorViewDistance,ZONE_SEGMENTS,halfHorizontalFov,inView,lodForDistance,planVisible};
});
