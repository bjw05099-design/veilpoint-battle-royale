'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const Walk=require('../src/aden-city-walking-probe.js');
const Story=require('../src/story-slice.js');
function scene(){
 const registry=Explorer.createPreviewRegistry(),cache=new Map();
 const ctx={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},fill(){},stroke(){}};
 Explorer.draw({width:1280,height:720,getContext:()=>ctx},
  registry,Explorer.viewState(),cache);
 return Walk.createWorld(registry,cache,new Set(cache.keys()),
  [...Explorer.CIVIC_SHELLS,...Districts.PLAN.buildings]);
}
test('eight unique authored public rooms exist in physically grounded original buildings, without new tactical or verified geography',()=>{
 assert.equal(Districts.NEIGHBORHOODS.length,8);
 assert.equal(Districts.PLAN.buildings.length,224,'the rooms do not invent extra buildings');
 assert.equal(Districts.PUBLIC_INTERIORS.length,8);
 assert.equal(new Set(Districts.PUBLIC_INTERIORS.map(r=>r.district)).size,8);
 const world=scene();
 assert.equal(world.rooms.length,8,'all eight rooms really have physical terrain foundations');
 assert.equal(world.surveyedAden,false);
 assert.equal(world.storyCollisionConnected,false);
 assert.equal(world.brCollisionConnected,false);
 for(const room of world.rooms){
  assert.equal(room.entrance,'south');
  assert.equal(room.doorWidth,3);
  assert.equal(room.wallThickness,.35);
  assert.equal(room.isSurveyed,false);
  assert.ok(Object.isFrozen(room));
  assert.ok(world.solids.some(s=>s.id===room.id+':north'));
  assert.ok(world.solids.some(s=>s.id===room.id+':south-left'));
  assert.ok(world.solids.some(s=>s.id===room.id+':south-right'));
  assert.equal(world.solids.filter(s=>s.id.startsWith(room.id+':')).length,5);
  assert.ok(!world.solids.some(s=>s.id===room.id),
   'accessible rooms cannot retain a solid invisible rectangle across the door');
 }
 assert.equal(Districts.publicRoomAt(Number.NaN,0),null);
 assert.equal(Districts.publicRoomAt(Infinity,0),null);
});
test('each public doorway permits a 60Hz continuous human-size walk into and back out of the same room',()=>{
 const world=scene();
 for(const room of world.rooms){
  let visitor=Walk.initial(world,room.x,room.z+room.d/2+1.8);
  const start=visitor;
  for(let tick=0;tick<340;tick++){
   const before=visitor;visitor=Walk.step(world,visitor,{south:-1});
   assert.ok(Math.hypot(visitor.x-before.x,visitor.z-before.z)<=
     Walk.SPEED_METRES_PER_SECOND/Walk.TICKS_PER_SECOND+1e-8);
   assert.ok(Walk.probe(world,visitor.x,visitor.z),
    'residents cannot pass through an invisible solid at '+room.id);
  }
  assert.equal(Districts.publicRoomAt(visitor.x,visitor.z)?.id,room.id,
   'door should lead inside real room: '+room.id);
  assert.ok(visitor.z<room.z+room.d/2-room.wallThickness);
  assert.equal(visitor.tick,340);
  const inside=visitor;
  for(let tick=0;tick<340;tick++)
   visitor=Walk.step(world,visitor,{south:1});
  assert.ok(visitor.z>room.z+room.d/2,
   'public room exit must remain physically traversable: '+room.id);
  assert.equal(Districts.publicRoomAt(visitor.x,visitor.z),null);
  assert.ok(visitor.z>=start.z-.1);
  assert.equal(visitor.tick,680);
  assert.equal(inside.blocked,false);
 }
});
test('off-centre approach hits the real intact exterior wall; the far wall cannot be crossed from inside',()=>{
 const world=scene();
 for(const room of world.rooms){
  const outsideX=room.x+room.doorWidth/2+.7,
   facade=room.z+room.d/2;
  let visitor=Walk.initial(world,outsideX,facade+1.8);
  for(let tick=0;tick<340;tick++)
   visitor=Walk.step(world,visitor,{south:-1});
  assert.ok(visitor.z>=facade+Walk.RADIUS_METRES-.02,
   'solid wall cannot be crossed beside door: '+room.id);
  assert.equal(Districts.publicRoomAt(visitor.x,visitor.z),null);
  visitor=Walk.initial(world,room.x,room.z);
  for(let tick=0;tick<400;tick++)
   visitor=Walk.step(world,visitor,{south:-1});
  const north=room.z-room.d/2;
  assert.ok(visitor.z>=north+Walk.RADIUS_METRES-.02,
   'northern public wall prevents passing into neighbouring building');
  assert.equal(visitor.blocked,true);
 }
});
test('invalid heightfields and stale tile mesh never conjure an enterable room; no story save mutation',()=>{
 const room=Districts.PUBLIC_INTERIORS[0];
 const tile=Tiles.tileFor(room.x,room.z),make=h=>Tiles.createHeightTile({
  tx:tile.tx,tz:tile.tz,gridSize:17,source:Explorer.SOURCE,
  samples:Array(17*17).fill(h)});
 const dry=make(12),sea=make(-10);
 const dryReg=Tiles.createRegistry([dry]),seaReg=Tiles.createRegistry([sea]);
 const cache=new Map([[dry.key,{sourceTile:dry,lod:1,
  mesh:Tiles.buildTerrainMesh(dry,1)}]]);
 const dryWorld=Walk.createWorld(dryReg,cache,new Set(dryReg.keys()),
  [Districts.PLAN.buildings.find(b=>b.id===room.id)]);
 assert.equal(dryWorld.rooms.length,1);
 assert.ok(Walk.probe(dryWorld,room.x,room.z));
 const seaWorld=Walk.createWorld(seaReg,cache,new Set(seaReg.keys()),
  [Districts.PLAN.buildings.find(b=>b.id===room.id)]);
 assert.equal(seaWorld.rooms.length,0);
 assert.equal(Walk.probe(seaWorld,room.x,room.z),null);
 const snap=Story.serialize(Story.createState());
 Walk.step(dryWorld,Walk.initial(dryWorld,room.x,room.z),{south:1});
 assert.equal(Story.serialize(Story.restore(snap)),snap);
});
