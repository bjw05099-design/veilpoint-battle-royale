'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Footfall=require('../src/story-footfall.js');
class FakeAudio {
 constructor(){this.sampleRate=44100;this.currentTime=0;this.destination={};}
 createBuffer(){return {getChannelData:()=>new Float32Array(512)};}
 createBufferSource(){return {playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){}};}
 createBiquadFilter(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){}};}
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 close(){return Promise.resolve();}
}
function story(){return {phase:'explore',world:{scene:'nahrin',elapsed:0,player:{x:0,z:0},obstacles:[]}};}
test('CH01 fixed-step stationary pause discards a stale partial stride',()=>{
 const audio=Footfall.create({AudioContextClass:FakeAudio});
 assert.equal(audio.enable(),true);
 const s=story();
 const tick=(dx)=>{s.world.elapsed+=1/60;s.world.player.x+=dx;return audio.update(s,true);};
 audio.update(s,true);
 for(let i=0;i<10;i++)tick(.1);
 assert.equal(audio.stats().cues,0);
 for(let i=0;i<9;i++)tick(0);
 assert.equal(audio.stats().cues,0);
 for(let i=0;i<3;i++)tick(.1);
 assert.equal(audio.stats().cues,0,'old near-complete stride must not sound on restart');
 for(let i=0;i<10;i++)tick(.1);
 assert.equal(audio.stats().cues,1,'new physical displacement still makes a step');
});
test('short fixed-step hesitation preserves normal stride continuity',()=>{
 const audio=Footfall.create({AudioContextClass:FakeAudio});
 assert.equal(audio.enable(),true);
 const s=story();
 audio.update(s,true);
 for(let i=0;i<10;i++){s.world.elapsed+=1/60;s.world.player.x+=.1;audio.update(s,true);}
 for(let i=0;i<3;i++){s.world.elapsed+=1/60;audio.update(s,true);}
 for(let i=0;i<3;i++){s.world.elapsed+=1/60;s.world.player.x+=.1;audio.update(s,true);}
 assert.equal(audio.stats().cues,1);
});
