'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Wind=require('../src/coastal-wind-audio.js');
const Sim=require('../src/simulation.js');
const fs=require('node:fs'),path=require('node:path');
test('actual west-side physical wall attenuates ambient wind without altering 60Hz BR world',()=>{
 const player={x:2,z:0};
 const walls=[{x:-4,z:0,w:2,d:9,h:3,type:'building'}];
 const before=JSON.stringify({player,walls});
 assert.equal(Wind.localWindExposure(player,walls,Sim.lineBlocked),.4);
 assert.equal(Wind.localWindExposure({x:2,z:8},walls,Sim.lineBlocked),1);
 assert.equal(Wind.localWindExposure(null,walls,Sim.lineBlocked),1);
 assert.equal(Wind.localWindExposure(player,null,Sim.lineBlocked),1);
 assert.equal(Wind.localWindExposure(player,walls,null),1);
 assert.equal(JSON.stringify({player,walls}),before,'sound-only shelter never edits physical scenery or RNG');
});
test('shelter changes gain only and does not create an audio source when paused',()=>{
 const p={setValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}};
 let created=0;
 const context={sampleRate:48000,currentTime:1,destination:{},
  createBuffer(n,size){return {getChannelData(){return new Float32Array(size);}};},
  createBufferSource(){return {connect(){},start(){created++;},stop(){}};},
  createBiquadFilter(){return {frequency:p,connect(){}};},
  createGain(){return {gain:p,connect(){}};}
 };
 const audio=Wind.createCoastalWindAudio(()=>context);
 assert.equal(audio.sync({enabled:false,playable:true,phase:3,exposure:.4}),0);
 assert.equal(created,0);
 const free=audio.sync({enabled:true,playable:true,phase:3,exposure:1});
 const sheltered=audio.sync({enabled:true,playable:true,phase:3,exposure:.4});
 assert.ok(free>0&&sheltered<free);
 assert.ok(Math.abs(sheltered/free-.4)<1e-9);
 assert.equal(created,1,'20ms animation/polling reuses single wind source');
 audio.stop();
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/localWindExposure\(/);
 assert.match(app,/simulation\.player,simulation\.obstacles,Game\.lineBlocked/);
});
