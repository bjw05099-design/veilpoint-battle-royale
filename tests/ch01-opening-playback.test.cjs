'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Playback=require('../src/ch01-opening-playback.js');
const Opening=require('../src/ch01-opening.js');
test('opening follows predeparture, arrival, escalation, decision at fixed 60Hz',()=>{
 let s=Playback.initial();
 assert.equal(Playback.current(s).id,'briefed-in-korea');
 for(let i=0;i<Playback.TICKS_PER_SCENE;i++)s=Playback.tick(s);
 assert.equal(Playback.current(s).id,'arrival');
 for(let scene=1;scene<Opening.SCENES.length;scene++)
  for(let i=0;i<Playback.sceneTicks(scene);i++)s=Playback.tick(s);
 assert.equal(s.finished,true);
 assert.equal(Playback.current(s),null);
 assert.deepEqual(Playback.tick(s),s);
});
test('skip advances only one caption and restored progress is bounded',()=>{
 let s=Playback.skip(Playback.initial());
 assert.equal(Playback.current(s).id,'arrival');
 assert.deepEqual(Playback.restore({scene:1,ticks:23}),{version:1,scene:1,ticks:23,finished:false});
 assert.equal(Playback.restore({scene:999,ticks:999}).finished,true);
 assert.equal(Playback.restore({scene:-2,ticks:-1}).scene,0);
});
test('later CH01 checkpoint does not force a replay of Korea briefing',()=>{
 const s=Playback.forCheckpoint({phase:'evacuation'},null);
 assert.equal(s.finished,true);
 assert.equal(Playback.current(s),null);
 assert.equal(Playback.forCheckpoint({phase:'arrival'},null).finished,false);
});
