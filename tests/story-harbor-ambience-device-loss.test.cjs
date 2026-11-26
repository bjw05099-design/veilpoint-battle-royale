'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Audio=require('../src/story-harbor-ambience.js');
function fixture(throwsOn='frequency'){
 const calls={stops:0,closes:0};
 function param(kind){return {setValueAtTime(){},setTargetAtTime(){if(throwsOn===kind)throw Error('audio output removed');}};}
 class Context{
  constructor(){this.currentTime=1;this.destination={};this.state='running';}
  createOscillator(){return {type:'',frequency:param('frequency'),connect(){},start(){},stop(){calls.stops++;},disconnect(){}};}
  createGain(){return {gain:param('gain'),connect(){},disconnect(){}};}
  createStereoPanner(){return {pan:param('pan'),connect(){},disconnect(){}};}
  close(){calls.closes++;return Promise.resolve();}
 }
 const instance=Audio.create({AudioContextClass:Context});
 return {instance,calls};
}
const state={phase:'terminal',world:{player:{x:0,z:0,yaw:0},obstacles:[]}};
test('CH01 ambient device loss in update never propagates to the fixed-step story loop',()=>{
 const {instance,calls}=fixture('frequency');
 assert.equal(instance.enable(),true);
 assert.equal(instance.update(state,true),false);
 assert.equal(instance.enabled(),false);
 assert.equal(instance.update(state,true),false);
 assert.equal(calls.stops,2);
 assert.equal(calls.closes,1);
});
test('CH01 volume update fails closed if output gain is disconnected',()=>{
 const {instance,calls}=fixture('gain');
 assert.equal(instance.enable(),true);
 assert.equal(instance.setVolume(.4),.4);
 assert.equal(instance.enabled(),false);
 assert.equal(calls.closes,1);
 assert.equal(instance.update(state,true),false);
});
