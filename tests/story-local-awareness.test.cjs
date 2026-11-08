'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const near=(state,id)=>{state.world.player.x=Story.POINTS[id].x;state.world.player.z=Story.POINTS[id].z;};

test('CH01 navigation reduces distant paperwork arrows but keeps physical interactions and main exits',()=>{
  const state=Story.createState();
  state.phase='records';
  near(state,'terminal');
  const all=Story.markers(state).map(x=>x.id);
  const nav=Story.navigationMarkers(state).map(x=>x.id);
  assert.ok(all.includes('recordA'));
  assert.ok(all.includes('recordB'));
  assert.ok(nav.includes('decision'),'route decisions remain globally discoverable');
  assert.ok(!nav.includes('recordA')&&!nav.includes('recordB'));
  near(state,'recordA');
  assert.ok(Story.navigationMarkers(state).some(x=>x.id==='recordA'),
    'paperwork is shown when actually reached on foot');
  state.phase='exit';state.choice='evacuation';
  near(state,'terminal');
  assert.ok(Story.navigationMarkers(state).some(x=>x.id==='exitEvac'),
    'already-saved evacuation routes keep a discoverable goal');
  assert.ok(!Story.navigationMarkers(state).some(x=>x.id==='dispatchLedger'),
    'side paperwork is not a distant mandatory arrow');
  assert.ok(Story.markers(state).some(x=>x.id==='dispatchLedger'),
    'historic optional interactions remain in the world');
});
test('local civilian address requires powered equipment and a genuinely nearby player',()=>{
  const state=Story.createState();
  state.phase='records';
  near(state,'relay');
  assert.equal(Story.localPublicAddress(state),null,'blackout cannot broadcast');
  state.relayRestored=true;
  const before=JSON.stringify({phase:state.phase,found:state.found,elapsed:state.world.elapsed});
  const nearSignal=Story.localPublicAddress(state);
  assert.ok(nearSignal);
  assert.match(nearSignal.message,/현지 구조단/);
  assert.equal(JSON.stringify({phase:state.phase,found:state.found,elapsed:state.world.elapsed}),before,
    'a passive announcement cannot advance a chapter or mutate a save');
  state.world.player.x=100;state.world.player.z=100;
  assert.equal(Story.localPublicAddress(state),null,'no remote audio or GPS-like hint');
  state.phase='complete';
  near(state,'relay');
  assert.equal(Story.localPublicAddress(state),null,'no extra finished-chapter mission');
});
