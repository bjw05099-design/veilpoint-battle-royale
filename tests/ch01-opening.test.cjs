const test=require('node:test');
const assert=require('node:assert/strict');
const opening=require('../src/ch01-opening.js');

test('briefing occurs in Korea before arrival and escalation',()=>{
  const scenes=opening.SCENES;
  assert.equal(scenes.length,6);
  assert.match(scenes[0].place,/대한민국/);
  assert.match(scenes[0].line,/출국 전/);
  assert.equal(scenes[1].id,'arrival');
  assert.equal(scenes[2].id,'escalation');
  assert.equal(scenes[3].id,'decision');
  assert.match(scenes[3].line,/원래 파견 임무와는 다른/);
  assert.equal(scenes[4].id,'civic-uncertainty');
  assert.equal(scenes[5].id,'captain-commitment');
  assert.ok(scenes.slice(4).every(s=>s.durationTicks===240));
});
test('opening is deterministic, resumable and bounded',()=>{
  let state=opening.initial();
  assert.equal(opening.current(state).id,'briefed-in-korea');
  for(let i=0;i<opening.SCENES.length;i++){
    state=opening.restore(JSON.parse(JSON.stringify(opening.advance(state))));
  }
  assert.equal(state.finished,true);
  assert.equal(opening.current(state),null);
  assert.deepEqual(opening.advance(state),state);
});
test('invalid legacy opening state falls back without corrupting CH01 saves',()=>{
  assert.deepEqual(opening.restore(null),opening.initial());
  assert.equal(opening.restore({scene:-500}).scene,0);
  assert.equal(opening.restore({scene:999}).finished,true);
  assert.equal(opening.restore({scene:1,finished:true}).finished,false);
});
