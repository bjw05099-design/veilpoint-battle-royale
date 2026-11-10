/* VEILPOINT: original fictional civilian-city walking probe.
 * Offline map-only 60Hz motion, based on displayed 512m triangle terrain
 * and simple drawn-home footprints. This is NOT story/BR game collision,
 * verified real Aden geography, or an operational navigation system.
 */
(function(root,factory){
 'use strict';
 const api=factory(root.VeilpointAdenCityTiles||
  (typeof module==='object'&&module.exports?require('./aden-citywide-tiles.js'):null),
  root.VeilpointAdenPreviewDistricts||
  (typeof module==='object'&&module.exports?require('./aden-preview-districts.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenWalkingProbe=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tiles,Districts){
 'use strict';
 if(!Tiles||!Districts)throw new Error('Terrain and civilian district geometry required');
 const TICKS_PER_SECOND=60,SPEED_METRES_PER_SECOND=1.7,RADIUS_METRES=.45;
 const MAX_SLOPE_DEGREES=35,MAX_TICK_STEP_METRES=.35;
 const EPS=1e-7;
 function createWorld(registry,cache,activeKeys,buildings){
  if(!(registry instanceof Map)||!(cache instanceof Map)||
   !(activeKeys instanceof Set)||!Array.isArray(buildings)||buildings.length>3000)
   throw new TypeError('Invalid local 60Hz civilian walk world');
  const solids=[];
  for(const b of buildings){
   if(!b||typeof b.x!=='number'||typeof b.z!=='number'||
      !Number.isFinite(b.w)||!Number.isFinite(b.d)||
      b.w<=0||b.d<=0)throw new TypeError('Invalid civilian home footprint');
   const foundation=Districts.buildingFoundation(b,registry,cache,activeKeys);
   if(!foundation)continue;
   solids.push(Object.freeze({id:b.id||'original-civic-home',
    minX:b.x-b.w/2,maxX:b.x+b.w/2,
    minZ:b.z-b.d/2,maxZ:b.z+b.d/2,
    lowestGround:foundation.lowMetres}));
  }
  return Object.freeze({registry,cache,activeKeys,
   solids:Object.freeze(solids),
   metresPerWorldUnit:1,
   surveyedAden:false,storyCollisionConnected:false,brCollisionConnected:false});
 }
 function collide(world,x,z,radius){
  return world.solids.some(b=>{
   const nearX=Math.max(b.minX,Math.min(x,b.maxX)),
    nearZ=Math.max(b.minZ,Math.min(z,b.maxZ));
   return Math.hypot(nearX-x,nearZ-z)<radius-EPS;
  });
 }
 function localHeight(world,x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  let tileLocation;
  try{tileLocation=Tiles.tileFor(x,z);}catch(_){return null;}
  if(!world.activeKeys.has(tileLocation.key))return null;
  const tile=world.registry.get(tileLocation.key),
   slot=world.cache.get(tileLocation.key);
  if(!tile||!slot||slot.sourceTile!==tile||!slot.mesh)return null;
  try{return Tiles.terrainSurface(slot.mesh,x,z);}
  catch(_){return null;}
 }
 function probe(world,x,z,radius=RADIUS_METRES){
  if(!world||!Array.isArray(world.solids)||
     !Number.isFinite(radius)||radius<=0||radius>1.25)return null;
  if(collide(world,x,z,radius))return null;
  const centre=localHeight(world,x,z);
  if(!centre||centre.elevationMetres<0||
     centre.slopeDegrees>MAX_SLOPE_DEGREES)return null;
  const corners=[[radius,0],[-radius,0],[0,radius],[0,-radius]];
  let min=centre.elevationMetres,max=centre.elevationMetres;
  for(const [dx,dz] of corners){
   const s=localHeight(world,x+dx,z+dz);
   if(!s||s.elevationMetres<0||s.slopeDegrees>MAX_SLOPE_DEGREES)
    return null;
   min=Math.min(min,s.elevationMetres);
   max=Math.max(max,s.elevationMetres);
  }
  if(max-min>MAX_TICK_STEP_METRES*2)return null;
  return Object.freeze({x,z,y:centre.elevationMetres,slopeDegrees:centre.slopeDegrees,
   normal:centre.normal,groundRangeMetres:max-min});
 }
 function initial(world,x,z){
  const ground=probe(world,x,z);
  if(!ground)throw new RangeError('No walkable local city ground at starting point');
  return Object.freeze({version:1,tick:0,x,z,y:ground.y,blocked:false});
 }
 function step(world,state,intent={}){
  if(!state||state.version!==1||!Number.isSafeInteger(state.tick)||
     state.tick<0||![state.x,state.z,state.y].every(Number.isFinite))
   throw new TypeError('Invalid temporary civilian walk state');
  const east=intent.east??0,south=intent.south??0;
  if(!Number.isFinite(east)||!Number.isFinite(south)||
     Math.abs(east)>1||Math.abs(south)>1)
   throw new RangeError('Invalid 60Hz civilian walk input');
  const mag=Math.hypot(east,south),distance=SPEED_METRES_PER_SECOND/TICKS_PER_SECOND;
  const dx=mag>0?east/mag*distance:0,
   dz=mag>0?south/mag*distance:0;
  let x=state.x,z=state.z,y=state.y,blocked=false;
  const trySegment=(sx,sz,tx,tz)=>{
   const length=Math.hypot(tx-sx,tz-sz);
   if(length===0)return {x:sx,z:sz,y,valid:true};
   // Swept capsule samples forbid skipping over thin fictional facades or
   // sparse/unloaded tiles even if a later speed policy is changed.
   const samples=Math.max(1,Math.ceil(length/.1));
   let lastY=y;
   for(let i=1;i<=samples;i++){
    const at=i/samples,px=sx+(tx-sx)*at,pz=sz+(tz-sz)*at;
    const hit=probe(world,px,pz);
    if(!hit||Math.abs(hit.y-lastY)>MAX_TICK_STEP_METRES)
     return {x:sx,z:sz,y,valid:false};
    lastY=hit.y;
   }
   return {x:tx,z:tz,y:lastY,valid:true};
  };
  let attempt=trySegment(x,z,x+dx,z+dz);
  if(attempt.valid){x=attempt.x;z=attempt.z;y=attempt.y;}
  else{
   // Axis-separated slide retains responsive walking along the facade.
   // Neither component may cross an occupied or unknown terrain region.
   blocked=true;
   const horizontal=trySegment(x,z,x+dx,z);
   if(horizontal.valid){x=horizontal.x;z=horizontal.z;y=horizontal.y;}
   const vertical=trySegment(x,z,x,z+dz);
   if(vertical.valid){x=vertical.x;z=vertical.z;y=vertical.y;}
  }
  return Object.freeze({version:1,tick:state.tick+1,x,z,y,blocked});
 }
 return Object.freeze({TICKS_PER_SECOND,SPEED_METRES_PER_SECOND,RADIUS_METRES,
  MAX_SLOPE_DEGREES,MAX_TICK_STEP_METRES,createWorld,probe,initial,step});
});
