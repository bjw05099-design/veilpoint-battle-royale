'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Audio=require('../src/footstep-audio.js');
function fake(){
 const notes=[];
 const param=label=>({setValueAtTime(value){notes.push([label,value]);},
  exponentialRampToValueAtTime(){}});
 const ctx={currentTime:1,destination:{},createOscillator(){return {
  frequency:param('hz'),type:'',connect(){},start(){},stop(){}};},
  createGain(){return {gain:param('gain'),connect(){}};}};
 return {notes,ctx};
}
test('real waterlogged apron sets actual footstep surface, not arbitrary PC input',()=>{
 const game=Sim.newMatch(1234,0);
 const pad=Sim.WET_LOADING_PAD;
 assert.equal(Sim.wetApronFooting(game.player).wet,false);
 assert.equal(Sim.wetApronFooting({x:pad.x,z:pad.z}).wet,true);
 const a=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(a,/surface:Game\.wetApronFooting\(simulation\.player\)\.wet\?'wet':'dry'/);
 assert.match(a,/distance:Math\.hypot\(simulation\.player\.x-footX,simulation\.player\.z-footZ\)/);
});
test('water-surface walking differs audibly without inventing footsteps or additional movement',()=>{
 const dry=fake(),wet=fake();
 const dryAudio=Audio.createFootstepAudio(()=>dry.ctx),wetAudio=Audio.createFootstepAudio(()=>wet.ctx);
 for(let n=0;n<14;n++){
  assert.equal(dryAudio.sync({enabled:true,playable:true,distance:0,surface:'dry'}),0);
  assert.equal(wetAudio.sync({enabled:true,playable:true,distance:0,surface:'wet'}),0);
 }
 assert.equal(dry.notes.length,0);assert.equal(wet.notes.length,0);
 assert.equal(dryAudio.sync({enabled:true,playable:true,distance:1.35,surface:'dry'}),1);
 assert.equal(wetAudio.sync({enabled:true,playable:true,distance:1.35,surface:'wet'}),1);
 assert.ok(wet.notes.find(q=>q[0]==='hz')[1]>dry.notes.find(q=>q[0]==='hz')[1]);
 assert.ok(wet.notes.find(q=>q[0]==='gain')[1]>dry.notes.find(q=>q[0]==='gain')[1]);
 assert.equal(wetAudio.sync({enabled:true,playable:false,distance:1.9,surface:'wet'}),0);
 assert.equal(wetAudio.pendingDistance,0);
});
test('wet footsteps are somewhat more audible, but solid buildings still attenuate',()=>{
 const walker={x:0,z:0},listener={x:4,z:0},none=[];
 assert.equal(Sim.hearsFootsteps(listener,walker,.1,false,none,false,false),false);
 assert.equal(Sim.hearsFootsteps(listener,walker,.1,false,none,false,true),true);
 assert.equal(Sim.hearsFootsteps(listener,walker,0,false,none,false,true),false);
 const wall=[{x:2,z:0,w:.5,d:4}];
 assert.equal(Sim.hearsFootsteps(listener,walker,.1,false,wall,false,true),false);
 assert.equal(Sim.hearsFootsteps({x:1,z:0},walker,.1,false,wall,false,true),true);
 assert.equal(Sim.hearsFootsteps({x:30,z:0},walker,.1,false,none,false,true),false);
});
test('existing CH01 hearing defaults dry and offline code contains no network requests',()=>{
 const story=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(story,/Sim\.hearsFootsteps\(/);
 const a=fs.readFileSync(path.resolve(__dirname,'../src/footstep-audio.js'),'utf8');
 assert.doesNotMatch(a,/\bfetch\(|https?:\/\//);
 const dry=Audio.createFootstepAudio(()=>null);
 assert.equal(dry.sync({enabled:true,playable:true,distance:1.5}),0);
});
