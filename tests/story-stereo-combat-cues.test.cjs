'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Audio=require('../src/story-audio.js');
function soundDevice(){
 const ramps=[],pans=[],voices=[],detached=[];
 class Context{
  constructor(){this.currentTime=1;this.destination={};this.state='running'}
  createOscillator(){const voice={frequency:{setValueAtTime(){}},connect(){},
   disconnect(){detached.push('voice')},start(){},stop(){}};voices.push(voice);return voice}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(v){ramps.push(v)},
   exponentialRampToValueAtTime(){}},connect(){},disconnect(){detached.push('gain')}}}
  createStereoPanner(){return {pan:{setValueAtTime(v){pans.push(v)}},connect(){},
   disconnect(){detached.push('pan')}}}
 }
 return {Context,ramps,pans,voices,detached};
}
test('spatial combat sound follows listener yaw and attenuates actual cover without demanding visual contact',()=>{
 const dev=soundDevice(),audio=Audio.create({AudioContextClass:dev.Context});
 const listener={x:0,z:0,yaw:0},source={x:30,z:0};
 const space={listener,source,obstacles:[]};
 assert.equal(audio.play('hostileShot',space),true);
 assert.equal(dev.pans[0],1);
 listener.yaw=Math.PI;
 assert.equal(audio.play('hostileShot',space),true);assert.equal(dev.pans[1],-1);
 space.obstacles=[{x:15,z:0,w:1,d:6}];
 assert.equal(audio.play('hostileShot',space),true);
 assert.ok(dev.ramps[2]<dev.ramps[1]*.3,'wall muffles a real shot, not a silent actor');
 assert.equal(audio.play('interact',space),false,'a quiet interaction retains its original 24m limit');
 assert.equal(audio.play('hostileShot',{...space,source:{x:97,z:0}}),false);
 audio.setEnabled(false);assert.equal(audio.play('hostileShot',space),false);
 dev.voices[0].onended();assert.deepEqual(dev.detached,['voice','gain','pan']);
});
test('stereo direction is finite at coincident positions and missing yaw falls back to centred audio',()=>{
 assert.equal(Audio.spatialPan({x:0,z:0,yaw:1},{x:0,z:0}),0);
 assert.equal(Audio.spatialPan({x:0,z:0},{x:4,z:2}),0);
 assert.equal(Audio.spatialPan({x:0,z:0,yaw:Infinity},{x:4,z:2}),0);
 assert.equal(Audio.spatialGain({x:0,z:0},{x:4,z:2},[],Infinity),0);
});
