'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Audio=require('../src/story-audio.js');
const Story=require('../src/story-slice.js');
function fake(){
 const ramps=[];let created=0;
 class Context{
  constructor(){created++;this.currentTime=5;this.state='running';this.destination={};}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){}};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(v){ramps.push(v);},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 return {Context,ramps,contexts:()=>created};
}
test('CH01 physical local interaction cue attenuates with distance and verified cover, not a synthetic remote ping',()=>{
 const player={x:0,z:0},near={x:1,z:0},far={x:12,z:0};
 const wall={x:6,z:0,w:.4,d:3};
 assert.equal(Audio.spatialGain(player,player),1);
 assert.ok(Audio.spatialGain(player,near)>Audio.spatialGain(player,far));
 assert.ok(Audio.spatialGain(player,far,[wall])<Audio.spatialGain(player,far,[])*.3);
 assert.ok(Audio.spatialGain(player,far,[{...wall,solid:false}])>Audio.spatialGain(player,far,[wall]));
 assert.equal(Audio.spatialGain(player,{x:25,z:0}),0);
 assert.equal(Audio.spatialGain(player,{x:Infinity,z:0}),0);
});
test('real CH01 F target is resolved before state transition; sound obeys mute and has no gameplay checkpoint effects',()=>{
 const {Context,ramps,contexts}=fake(),audio=Audio.create({AudioContextClass:Context});
 const s=Story.createState(),before=Story.serialize(s);
 const marker=Story.nearest(s);
 assert.equal(marker,null,'ordinary unapproached location does not fake a local conversation');
 const player={x:0,z:0},source={x:8,z:0};
 assert.equal(audio.play('interact',{listener:player,source:{x:30,z:0}}),false);
 assert.equal(contexts(),0,'an inaudible remote cue cannot even create an audio graph');
 assert.equal(audio.play('interact',{listener:player,source}),true);
 assert.ok(Math.abs(ramps[0]-.045*Audio.spatialGain(player,source))<1e-10);
 audio.setVolume(0);
 assert.equal(audio.play('interact',{listener:player,source}),false);
 assert.equal(Story.serialize(s),before);
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/const localSource=Story\.nearest\(state\)/);
 assert.match(app,/listener,source:\{x:localSource\.x,z:localSource\.z\}/);
});
