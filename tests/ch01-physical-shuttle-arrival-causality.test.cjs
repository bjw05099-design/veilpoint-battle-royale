'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/story-consequences.js');
const F=C.EVENTS.CIVILIAN_SHUTTLE_ARRIVED;
function scene(){
  // Uses the same authored fictional public-stop position and collision body
  // produced by CH01 syncCivilianShuttle (metres in the fixed 60Hz world).
  return {
    phase:'exit',choice:'evacuation',combat:{started:true,cleared:true},
    musterConfirmed:true,
    transportVan:{z:-64,arrived:true},
    world:{elapsed:60,obstacles:[
      {routeId:'story-civil-transport',type:'story-civil-transport',x:10,z:-64,w:2.4,d:3.8}
    ]}
  };
}
test('CH01 timeline records only physical civilian vehicle arrival, not passenger transport',()=>{
  const timeline=C.fromMission(scene());
  assert.ok(timeline.events.includes(F));
  assert.ok(timeline.events.includes(C.EVENTS.SAFE_ROUTE));
  assert.equal(timeline.route,'courtyard');
  assert.equal(C.restoreTimeline(JSON.parse(JSON.stringify(timeline))).events.at(-1),F);
  assert.ok(!timeline.events.some(e=>/passenger|evacuated|rescue_complete/.test(e)));
});
test('claimed arrival without matching actual 60Hz public collision body is not witnessed',()=>{
  const missing=scene();missing.world.obstacles=[];
  assert.ok(!C.fromMission(missing).events.includes(F));
  const moved=scene();moved.world.obstacles[0].z=-69;
  assert.ok(!C.fromMission(moved).events.includes(F));
  const premature=scene();premature.transportVan.arrived=false;
  assert.ok(!C.fromMission(premature).events.includes(F));
  const moving=scene();moving.transportVan.z=-68;
  assert.ok(!C.fromMission(moving).events.includes(F));
});
test('unconsulted or alternative-route events never invent a local civilian transport observation',()=>{
  const noGuide=scene();noGuide.musterConfirmed=false;
  assert.ok(!C.fromMission(noGuide).events.includes(F));
  const other=scene();other.choice='verification';other.gateLogReviewed=true;
  const timeline=C.fromMission(other);
  assert.ok(!timeline.events.includes(F));
  assert.equal(timeline.route,'harbor');
  assert.throws(()=>C.advance(C.newTimeline(),F),/prerequisite/);
});
