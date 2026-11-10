'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Foot=require('../src/story-footfall.js');
function fakeContext({fail=false}={}){
 return class{
  constructor(){this.sampleRate=44100;this.currentTime=0;this.destination={};}
  createBuffer(_c,n){return {getChannelData:()=>new Float32Array(n)};}
  createBufferSource(){
   if(fail)throw Error('audio output disconnected');
   return {playbackRate:{value:1},connect(){},start(){},stop(){},disconnect(){}};
  }
  createBiquadFilter(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){}};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  close(){return Promise.resolve();}
 };
}
function story(x,t){return {phase:'records',world:{scene:'nahrin',elapsed:t,player:{x,z:0},obstacles:[]}};}
test('CH01 never reports an audible step when the audio output fails',()=>{
 const f=Foot.create({AudioContextClass:fakeContext({fail:true})});
 assert.equal(f.enable(),true);
 f.update(story(0,0),true);
 assert.equal(f.update(story(1.3,.2),true),null);
 assert.equal(f.stats().cues,0);
 assert.equal(f.enabled(),true,'simulation and audio lifecycle remain independent');
});
test('a successfully played CH01 step reports its surface and exactly one cue',()=>{
 const f=Foot.create({AudioContextClass:fakeContext()});
 assert.equal(f.enable(),true);
 f.update(story(0,0),true);
 const result=f.update(story(1.3,.2),true);
 assert.equal(result.surface,'earth');
 assert.equal(f.stats().cues,1);
 assert.equal(result.elapsed,.2);
});
test('muted CH01 footfalls do not claim audio was played',()=>{
 const f=Foot.create({AudioContextClass:fakeContext()});
 f.enable();f.setVolume(0);
 f.update(story(0,0),true);
 assert.equal(f.update(story(1.3,.2),true),null);
 assert.equal(f.stats().cues,0);
});
