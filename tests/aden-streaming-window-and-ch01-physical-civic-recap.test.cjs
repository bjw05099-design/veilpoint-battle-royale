'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Story=require('../src/story-slice.js');

test('citywide terrain camera streaming reads bounded nearby keys instead of scanning a full-city registry',()=>{
  class QueryOnlyRegistry extends Map{
    [Symbol.iterator](){throw new Error('full-registry iteration not allowed per frame');}
    entries(){throw new Error('full-registry entries scan not allowed per frame');}
    values(){throw new Error('full-registry values scan not allowed per frame');}
  }
  const registry=new QueryOnlyRegistry();
  for(let tx=-2;tx<=2;tx++)for(let tz=-2;tz<=2;tz++)
    registry.set(Tiles.tileKey(tx,tz),{tx,tz});
  // Distant loaded tiles are evicted while the camera's own registered tile
  // remains highest priority. Defer, do NOT declare available source missing.
  const far=Tiles.tileKey(50,50),origin=Tiles.tileKey(0,0);
  const planned=Tiles.planStreaming(20,20,registry,[origin,far],
    {radius:2,maxLoaded:5});
  assert.equal(planned.origin,origin);
  assert.equal(planned.active.length,5);
  assert.equal(planned.active[0],origin);
  assert.equal(planned.keep.length,1);
  assert.equal(planned.load.length,4);
  assert.deepEqual(planned.unload,[far]);
  assert.equal(planned.deferred.length,20);
  assert.equal(planned.unresolved.length,0);
  assert.equal(planned.completeCity,false);
  assert.equal(planned.streamedWorldMetresPerUnit,1);
  assert.ok(Object.isFrozen(planned.deferred));
  // Idempotent when all currently active tiles are already resident.
  const again=Tiles.planStreaming(20,20,registry,planned.active,
    {radius:2,maxLoaded:5});
  assert.deepEqual(again.active,planned.active);
  assert.equal(again.load.length,0);
  assert.equal(again.unload.length,0);
});

test('missing terrain provenance and streaming memory pressure remain two different map states',()=>{
  const registry=new Map();
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){
    if(x===1&&z===0)continue;
    registry.set(Tiles.tileKey(x,z),{tx:x,tz:z});
  }
  const full=Tiles.planStreaming(0,0,registry,[],{radius:1,maxLoaded:9});
  assert.deepEqual(full.unresolved,[Tiles.tileKey(1,0)]);
  assert.deepEqual(full.deferred,[]);
  assert.equal(full.active.length,8);
  const constrained=Tiles.planStreaming(0,0,registry,[],{radius:1,maxLoaded:3});
  assert.deepEqual(constrained.unresolved,full.unresolved);
  assert.equal(constrained.active.length,3);
  assert.equal(constrained.deferred.length,5);
  assert.equal(constrained.deferred.some(x=>full.unresolved.includes(x)),false);
  assert.throws(()=>Tiles.planStreaming(0,0,registry,[],{radius:1,maxLoaded:0}),RangeError);
});

function ended(){
  const state=Story.createState();
  state.phase='complete';state.choice='evacuation';
  return state;
}
test('CH01 closing scene and debrief never claim a public crossing or drain was cleared without its actual saved outcome',()=>{
  const state=ended(),before=JSON.stringify(state);
  const report=Story.debrief(state);
  assert.equal(report.publicStreetDrainCleared,false);
  assert.equal(report.civicCrossingAssisted,false);
  assert.equal(report.civicCrossingReached,false);
  assert.doesNotMatch(report.summary,/배수구의 장애물을 정리|건널목을 건넌 주민/);
  assert.equal(JSON.stringify(state),before,'debrief may not mutate the 60Hz world or V2 save');
});

test('CH01 documents earned civilian crossing and drain results independently, including an incomplete escort',()=>{
  const state=ended();
  state.civicCrossing.disrupted=true;
  state.civicCrossing.assisted=true;
  let partial=Story.debrief(state);
  assert.equal(partial.civicCrossingAssisted,true);
  assert.equal(partial.civicCrossingReached,false);
  assert.match(partial.summary,/도착까지 확인하지는 못했습니다/);
  assert.match(partial.closingScene.lines.join(' '),/도착은 확인하지 못했습니다/);
  state.drainCleared=true;
  state.civicCrossing.civilian.x=state.civicCrossing.destination.x;
  state.civicCrossing.civilian.z=state.civicCrossing.destination.z;
  const original=JSON.stringify(state),report=Story.debrief(state);
  assert.equal(report.publicStreetDrainCleared,true);
  assert.equal(report.civicCrossingAssisted,true);
  assert.equal(report.civicCrossingReached,true);
  assert.match(report.summary,/물기가 모두 마른 것은 아닙니다/);
  assert.match(report.summary,/주민 한 명이 실제로 도착/);
  assert.match(report.closingScene.lines.join(' '),/다른 주민의 이동은 미확인/);
  assert.equal(JSON.stringify(state),original,'read-only narrative must not modify the original checkpoint');
});
