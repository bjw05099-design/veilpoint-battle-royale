'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Opening=require('../src/ch01-opening.js');
const Playback=require('../src/ch01-opening-playback.js');
test('original predeparture sequence remains canonical and new civilian aftermath is actually playable',()=>{
 assert.deepEqual(Opening.SCENES.slice(0,4).map(s=>s.id),
  ['briefed-in-korea','arrival','escalation','decision']);
 assert.deepEqual(Opening.SCENES.slice(4).map(s=>s.id),
  ['civic-uncertainty','captain-commitment']);
 assert.match(Opening.SCENES[0].place,/대한민국/);
 assert.match(Opening.SCENES[0].line,/출국 전/);
 assert.match(Opening.SCENES[4].line,/직접 확인/);
 assert.match(Opening.SCENES[5].line,/아직 모르는/);
 assert.equal(Playback.sceneTicks(3),Playback.TICKS_PER_SCENE);
 assert.equal(Playback.sceneTicks(4),240);
 assert.equal(Playback.sceneTicks(5),240);
});
test('extended 60Hz beats use exact authored ticks and preserve backwards replay',()=>{
 let s=Playback.initial();
 for(let i=0;i<4;i++)s=Playback.skip(s);
 assert.equal(Playback.current(s).id,'civic-uncertainty');
 for(let i=0;i<239;i++)s=Playback.tick(s);
 assert.equal(Playback.current(s).id,'civic-uncertainty');
 assert.equal(s.ticks,239);
 s=Playback.tick(s);
 assert.equal(Playback.current(s).id,'captain-commitment');
 assert.equal(s.ticks,0);
 const rewound=Playback.previous(s);
 assert.equal(Playback.current(rewound).id,'civic-uncertainty');
 assert.equal(rewound.ticks,0);
 const restored=Playback.restore({version:1,scene:4,ticks:239});
 assert.equal(restored.ticks,239);
 assert.equal(Playback.restore({version:1,scene:4,ticks:999999}).ticks,239);
 for(let i=0;i<240;i++)s=Playback.tick(s);
 assert.equal(s.finished,true);
 assert.equal(Playback.current(s),null);
 assert.equal(Playback.forCheckpoint({phase:'exit'},null).finished,true);
});
