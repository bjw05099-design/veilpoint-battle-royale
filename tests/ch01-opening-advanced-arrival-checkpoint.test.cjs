'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const playback=require('../src/ch01-opening-playback.js');
test('CH01 resumed arrival with already started combat never replays Korea briefing',()=>{
 const progress={version:1,scene:1,ticks:37,finished:false};
 const resumed=playback.forCheckpoint({phase:'arrival',combat:{started:true}},progress);
 assert.equal(resumed.finished,true);
 assert.equal(playback.current(resumed),null);
 assert.deepEqual(playback.tick(resumed),resumed);
});
test('fresh arrival retains optional intro and older nonarrival checkpoints remain skipped',()=>{
 const progress={version:1,scene:1,ticks:37,finished:false};
 assert.deepEqual(playback.forCheckpoint({phase:'arrival',combat:{started:false}},progress),progress);
 assert.equal(playback.forCheckpoint({phase:'decision',combat:{started:false}},progress).finished,true);
});
