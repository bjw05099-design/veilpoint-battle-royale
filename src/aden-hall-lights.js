/* VEILPOINT - original civilian hall light circuit shared by the
 * story renderer, fallback painter, and locally witnessed CH01 dialogue.
 * This is non-georeferenced fictional street art, not a real Aden building.
 * Housing is DECORATIVE: never add its footprint to 60Hz collision solids.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointHallLights=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const REQUIRED_WALL_IDS=Object.freeze([
  'harbor-hall-west','harbor-hall-east','harbor-hall-north',
  'harbor-hall-southwest','harbor-hall-southeast'
 ]);
 // Four diffused indoor lamps mounted INSIDE the two existing solid sidewalls;
 // no new pillars, hidden quest markers, or publicly surveyed coordinates.
 const FIXTURES=Object.freeze([
  Object.freeze({id:'hall-west-1',wall:'harbor-hall-west',x:20.34,y:2.76,z:30.5}),
  Object.freeze({id:'hall-west-2',wall:'harbor-hall-west',x:20.34,y:2.76,z:38.4}),
  Object.freeze({id:'hall-east-1',wall:'harbor-hall-east',x:35.66,y:2.76,z:30.5}),
  Object.freeze({id:'hall-east-2',wall:'harbor-hall-east',x:35.66,y:2.76,z:38.4})
 ]);
 const finite=Number.isFinite;
 function hallPresent(world){
  if(world?.scene!=='nahrin'||!Array.isArray(world.obstacles))return false;
  return REQUIRED_WALL_IDS.every(id=>world.obstacles.some(o=>
   o?.id===id&&o.type==='story-public-hall-wall'&&
   [o.x,o.z,o.w,o.d,o.h].every(finite)&&
   o.w>0&&o.d>0&&o.h>=2));
 }
 function level(world){
  // A city's radio relay is NOT equivalent to restoration of city power.
  // Here it enables only the fictional hall's explicitly connected local
  // low-voltage lighting circuit, in a scene whose actual walls exist.
  return hallPresent(world)&&world.relayRestored===true?1:0;
 }
 function visibleFixtures(world){
  if(!hallPresent(world))return Object.freeze([]);
  const lit=level(world)===1;
  return Object.freeze(FIXTURES.map(f=>Object.freeze({...f,lit})));
 }
 function occupiedInterior(world){
  if(!hallPresent(world))return false;
  const p=world.player;
  if(!p||![p.x,p.z].every(finite)||p.x<=21.2||p.x>=34.8||
    p.z<=26.7||p.z>=41.2)return false;
  // A listener embedded in a wall, desk or bench is not in a physical room.
  return !world.obstacles.some(o=>{
   if(!o||o.blocksMovement===false||o.solid===false||
      ![o.x,o.z,o.w,o.d].every(finite)||o.w<=0||o.d<=0)return false;
   const dx=Math.max(0,Math.abs(p.x-o.x)-o.w/2),
         dz=Math.max(0,Math.abs(p.z-o.z)-o.d/2);
   return dx*dx+dz*dz<.7*.7;
  });
 }
 return Object.freeze({REQUIRED_WALL_IDS,FIXTURES,hallPresent,level,
  visibleFixtures,occupiedInterior,geographicAccuracyVerified:false});
});
