'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
test('the short opening is causally correct and never changes the physical world or checkpoint',()=>{
 const state=Story.createState();
 const baseline=Story.serialize(state);
 const phases=[
  {at:0,location:'출국 전 · 대한민국',needle:'한국에서 확인'},
  {at:3.4,location:'도착 · 가상 해안 도시 나흐린',needle:'한국에서 브리핑받은'},
  {at:6.8,location:'도착 후 · 예상 밖 상황 변화',needle:'도착한 뒤'},
 ];
 for(const beat of phases){
  state.world.elapsed=beat.at;
  const actual=Story.openingBeat(state);
  assert.equal(actual.location,beat.location);
  assert.match(actual.subtitle,new RegExp(beat.needle));
  assert.equal(Object.isFrozen(actual),true);
  assert.match(actual.subtitle,/파견|복귀|도착/);
 }
 state.world.elapsed=10.2;
 assert.equal(Story.openingBeat(state),null,'there is no mandatory cutscene hold');
 state.world.elapsed=0;
 assert.equal(Story.serialize(state),baseline,'visual dialogue never mutates saves');
 assert.deepEqual(state.found,[]);
 assert.equal(state.deploymentReviewed,false);
});
test('normal 60Hz movement and encounter transition preserve a short nonblocking recap',()=>{
 const state=Story.createState();
 const oldZ=state.world.player.z;
 for(let i=0;i<30;i++)Story.step(state,1/60,{forward:true});
 assert.ok(Math.abs(state.world.player.z-oldZ)>.03,
  'the predeparture recap must never lock first-person movement');
 assert.ok(Story.openingBeat(state));
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 assert.ok(Story.openingBeat(state),
  'immediate engagement does not erase the brief opening context');
 state.world.elapsed=10.2;
 assert.equal(Story.openingBeat(state),null,
  'the recap expires on time during active gameplay');
});
test('old story checkpoints retain schema, and PC HUD uses text-only unskippable-free cues',()=>{
 const s=Story.createState();
 const saved=Story.serialize(s);
 const restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 assert.deepEqual(Story.openingBeat(restored),Story.openingBeat(s));
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/const opening=Story\.openingBeat\(state\)/);
 assert.match(app,/urgentReload\?state\.subtitle:\(opening\?opening\.subtitle:state\.subtitle\)/);
 assert.match(app,/\$\('subtitle'\)\.textContent=/);
 assert.doesNotMatch(app,/opening\.complete\s*=|opening\.gate\s*=/,
  'opening must not create an artificial mission gate');
});
