'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Audio=require('../src/story-harbor-ambience.js');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

test('CH01 audible public harbor change is spatial and muffled by the SAME solid wall used by walking',()=>{
 const state={phase:'records',relayRestored:false,aidDelivered:false,
  world:{player:{x:0,z:0,yaw:0},obstacles:[]}};
 const clear=Audio.profile(state);
 assert.equal(clear.area,'harbor-approach');
 assert.equal(clear.occluded,false);
 assert.equal(clear.pan,0);
 const wall={x:0,z:-9,w:10,d:2,h:3,type:'fictional-civilian-building'};
 assert.equal(Sim.lineBlocked(0,0,0,-18,[wall]),true,
   'test uses an actual simulation-opaque public wall');
 state.world.obstacles=[wall];
 const before=JSON.stringify(state);
 const muffled=Audio.profile(state);
 assert.equal(muffled.occluded,true);
 assert.ok(muffled.level>0&&muffled.level<clear.level,
  'public building muffles an existing noncombat source without silencing the world');
 assert.equal(JSON.stringify(state),before,
  'read-only audio must never move a wall or alter an active checkpoint');
 state.world.player.yaw=Math.PI/2;
 assert.ok(Audio.profile(state).pan<-.6,
  'turning east moves the public northward ambience to the left ear');
 state.world.player.yaw=-Math.PI/2;
 assert.ok(Audio.profile(state).pan>.6,
  'turning west moves the same fixed source to the right ear');
 state.phase='complete';
 assert.equal(Audio.profile(state).level,0,
  'CH01 ending remains quiet; no ambience leaks into completion report');
});

test('CH01 optional stereo node updates on an enabled player audio graph and always supports mono fallback',()=>{
 const events=[];
 class Context {
  constructor(){this.currentTime=1;this.destination={};this.state='running';events.push('context');}
  createOscillator(){return {type:'sine',frequency:{
   setValueAtTime(){},setTargetAtTime(){}
  },connect(){},disconnect(){},start(){},stop(){}};}
  createGain(){return {gain:{
   setValueAtTime(){},setTargetAtTime(v){events.push(['gain',v]);}
  },connect(target){events.push(['gainDest',target===this.destination]);},disconnect(){}};}
  createStereoPanner(){
   events.push('panner');
   return {pan:{setTargetAtTime(v){events.push(['pan',v]);}},
    connect(){events.push('stereo-connected');},disconnect(){}};
  }
  close(){return Promise.resolve();}
 }
 const graph=Audio.create({AudioContextClass:Context});
 const state={phase:'records',world:{player:{x:3,z:-18,yaw:0},obstacles:[]}};
 assert.equal(graph.update(state),false,'an offline page never starts audio on a frame tick');
 assert.equal(events.length,0);
 assert.equal(graph.enable(),true);
 assert.equal(graph.update(state),true);
 assert.ok(events.includes('panner'));
 assert.ok(events.includes('stereo-connected'));
 assert.ok(events.some(x=>Array.isArray(x)&&x[0]==='pan'&&x[1]<0));
 graph.disable();
 class MonoContext extends Context {
  constructor(){super();this.createStereoPanner=undefined;}
 }
 const mono=Audio.create({AudioContextClass:MonoContext});
 assert.equal(mono.enable(),true);
 assert.equal(mono.update(state),true,'older offline PC runtime remains playable in mono');
 mono.disable();
});

test('CH01 old v2 checkpoint stays byte-identical when the derived audio profile is queried',()=>{
 const original=Story.createState();
 const save=Story.serialize(original);
 const restored=Story.restore(save);
 Audio.profile(restored);
 assert.equal(Story.serialize(restored),save);
 assert.equal(Audio.profile({phase:'records',world:{player:{x:0,z:0},obstacles:[]}}).pan,0);
});
