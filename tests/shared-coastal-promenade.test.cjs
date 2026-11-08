'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
const geometry=world=>world.obstacles.filter(o=>o.type.startsWith('aden-promenade-'))
 .map(({x,z,w,d,h,type})=>({x,z,w,d,h,type}));
const expected=[
 {x:-40,z:72,w:.7,d:.7,h:3,type:'aden-promenade-post'},
 {x:-16,z:72,w:.7,d:.7,h:3,type:'aden-promenade-post'},
 {x:-40,z:89,w:.7,d:.7,h:3,type:'aden-promenade-post'},
 {x:-16,z:89,w:.7,d:.7,h:3,type:'aden-promenade-post'},
 {x:-37,z:80,w:2.4,d:1,h:.7,type:'aden-promenade-seat'},
 {x:-19,z:80,w:2.4,d:1,h:.7,type:'aden-promenade-seat'}
];
test('new original shore promenade has identical physical supports and a clear walk-through center in BR/CH01',()=>{
 const br=Sim.newMatch(77,0),story=Story.createState();
 assert.deepEqual(geometry(br),expected);
 assert.deepEqual(geometry(story.world),expected);
 for(const world of [br,story.world]){
  for(const obstacle of expected)
   assert.equal(Sim.blocked(obstacle.x,obstacle.z,.85,world.obstacles),true,
    'the actual columns and seats are solid, not floating decoration');
  assert.equal(Sim.blocked(-28,80,.85,world.obstacles),false);
  const p={x:-28,z:62};
  for(let i=0;i<540;i++)Sim.moveEntity(p,0,5,1/60,world.obstacles,.85);
  assert.ok(p.z>100,'real 60Hz walking traverses the promenade uninterrupted');
  assert.ok(Math.abs(p.x+28)<1e-9,'no scripted sideways teleport to bypass scenery');
 }
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/if\(o\.type==='aden-promenade-post'\)/);
 assert.match(renderer,/if\(o\.type==='aden-promenade-seat'\)/);
});
test('legacy offline terrain remains as recorded; both current mode saves keep the same source',()=>{
 const old=Sim.newMatch(77,0,'carbine',false,'central','day',0);
 old.status='playing';
 assert.deepEqual(geometry(old),[]);
 assert.deepEqual(geometry(Sim.restoreMatch(Sim.snapshotMatch(old))),[]);
 const current=Sim.newMatch(77,0);
 current.status='playing';
 assert.deepEqual(geometry(Sim.restoreMatch(Sim.snapshotMatch(current))),expected);
 const state=Story.createState(),saved=Story.serialize(state);
 assert.deepEqual(geometry(Story.restore(saved).world),expected);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
});
test('BR96 discovers promenade only after a human body physically approaches, and does not broadcast to rivals',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby),actor=world.actors.get(token(0));
 assert.deepEqual(geometry(world),expected);
 const landmark=Sim.LANDMARKS.find(s=>s.label==='PUBLIC COAST PROMENADE');
 assert.deepEqual([landmark.x,landmark.z],[-28,80]);
 actor.x=-28;actor.z=70; // server test fixture only; no client position API
 assert.equal(world.snapshot(token(0)).squadLandmarks.some(s=>s.label===landmark.label),false);
 assert.equal(world.move(token(0),{dx:0,dz:1,seq:0}).ok,true);
 for(let i=0;i<50;i++)world.step();
 assert.equal(world.snapshot(token(0)).squadLandmarks.some(s=>s.label===landmark.label),true);
 assert.equal(world.snapshot(token(1)).squadLandmarks.some(s=>s.label===landmark.label),true);
 assert.equal(world.snapshot(token(6)).squadLandmarks.some(s=>s.label===landmark.label),false);
 assert.throws(()=>world.move(token(0),{dx:0,dz:1,seq:1,landmarkMask:16}),/invalid_movement/,
   'a client may never claim a landmark without physical traversal');
});
