'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Footfall=require('../src/story-footfall.js');
class FakeAudio {
 constructor(){this.sampleRate=44100;this.currentTime=0;this.destination={};this.plays=0;}
 createBuffer(){return {getChannelData:()=>new Float32Array(512)};}
 createBufferSource(){return {playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){}};}
 createBiquadFilter(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){}};}
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 close(){return Promise.resolve();}
}
test('CH01 never treats overflowing finite clock subtraction as a physical step',()=>{
 const audio=Footfall.create({AudioContextClass:FakeAudio});
 assert.equal(audio.enable(),true);
 const world={scene:'nahrin',elapsed:-1e308,player:{x:0,z:0},obstacles:[]};
 const story={phase:'active',world};
 assert.equal(audio.update(story,true),null);
 world.elapsed=1e308;world.player.x=1.5;
 assert.equal(audio.update(story,true),null);
 assert.equal(audio.stats().cues,0);
 world.elapsed=1e308+1;world.player.x=2.8;
 assert.equal(audio.update(story,true),null);
 assert.equal(audio.stats().cues,0);
 audio.disable();
});
test('ordinary finite 60Hz movement still generates footfalls',()=>{
 const audio=Footfall.create({AudioContextClass:FakeAudio});
 assert.equal(audio.enable(),true);
 const world={scene:'nahrin',elapsed:0,player:{x:0,z:0},obstacles:[]};
 const story={phase:'active',world};
 audio.update(story,true);
 for(let i=1;i<=15;i++){world.elapsed=i/60;world.player.x=i*.1;audio.update(story,true);}
 assert.ok(audio.stats().cues>=1);
 audio.disable();
});
