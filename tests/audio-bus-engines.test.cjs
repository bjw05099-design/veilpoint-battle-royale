'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const StoryAudio=require('../src/story-audio.js');
const Harbor=require('../src/br96-environment-audio.js');
const Wind=require('../src/coastal-wind-audio.js');
const Gate=require('../src/gate-motor-audio.js');
const Footsteps=require('../src/footstep-audio.js');
function rig(){
 const gains=[],starts=[];
 const param=()=>({setValueAtTime(v){gains.push(v);},setTargetAtTime(v){gains.push(v);},
  linearRampToValueAtTime(v){gains.push(v);},exponentialRampToValueAtTime(v){gains.push(v);},
  cancelScheduledValues(){}});
 class Context{
  constructor(){this.currentTime=5;this.destination={};this.state='running';this.sampleRate=44100;}
  createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){starts.push('osc');},
   stop(){},type:'sine'};}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createBuffer(){return {getChannelData(){return new Float32Array(4096)}};}
  createBufferSource(){return {loop:false,connect(){},stop(){},start(){starts.push('wind')}};}
  createBiquadFilter(){return {frequency:param(),connect(){}};}
  close(){return Promise.resolve();}
 }
 return {gains,starts,Context,context:new Context()};
}
test('CH01 effects bus scales actual cue gain, including mute, without altering the original ceiling',()=>{
 const {gains,Context}=rig(),sounds=StoryAudio.create({AudioContextClass:Context});
 assert.equal(sounds.setVolume(.5),.5);
 assert.equal(sounds.play('interact'),true);
 assert.ok(gains.includes(.0225));
 sounds.setVolume(0);
 assert.equal(sounds.play('complete'),false);
 sounds.setVolume(1);
 assert.equal(sounds.play('report'),true);
 assert.ok(gains.includes(.045));
 assert.throws(()=>sounds.setVolume(1.01),/invalid_audio_volume/);
});
test('BR96 ambience always obeys a user-selected gain and stays disabled before the first gesture',()=>{
 const {gains,Context}=rig(),sounds=Harbor.create({AudioContextClass:Context});
 assert.equal(sounds.enabled(),false);
 sounds.setVolume(.25);
 assert.equal(sounds.update({wet:true,waveActive:true}),false);
 assert.equal(sounds.enable(),true);
 assert.ok(gains.includes(.009*.25));
 assert.equal(sounds.update({wet:true,waveActive:true}),true);
 assert.ok(gains.includes(.015*.25));
 sounds.setVolume(0);
 assert.equal(gains.at(-1),0);
 assert.throws(()=>sounds.setVolume(-.01),/invalid_audio_volume/);
 sounds.disable();
});
test('offline BR bus levels scale wind, gate motor, and physical footsteps instead of just labels',()=>{
 const a=rig(),wind=Wind.createCoastalWindAudio(()=>a.context);
 wind.setVolume(.5);
 assert.equal(wind.sync({enabled:true,playable:true,elapsed:0}),.0025);
 wind.setVolume(0);
 assert.equal(wind.sync({enabled:true,playable:true,elapsed:0}),0);
 const b=rig(),gate=Gate.createGateMotorAudio(()=>b.context);
 gate.setVolume(.5);
 const level=gate.sync({enabled:true,playable:true,active:true,distance:0});
 assert.equal(level,Gate.MAX_GAIN*.5);
 gate.setVolume(0);
 assert.equal(gate.sync({enabled:true,playable:true,active:true,distance:0}),0);
 const c=rig(),step=Footsteps.createFootstepAudio(()=>c.context);
 step.setVolume(.5);
 assert.equal(step.sync({enabled:true,playable:true,distance:1.31}),1);
 assert.ok(c.gains.includes(.013*.5));
 step.setVolume(0);
 assert.equal(step.sync({enabled:true,playable:true,distance:1.31}),0);
});
