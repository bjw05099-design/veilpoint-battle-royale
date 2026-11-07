'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');
const fs=require('node:fs'),path=require('node:path');
test('CH01 worker is a physically walking, finite local civilian, not an objective icon',()=>{
 const state=Story.createState(),p=state.world.player,w=state.worker;
 assert.deepEqual(w,{x:20,z:-12,direction:1});
 assert.equal(state.world.worker,w);
 assert.equal(Sim.blocked(w.x,w.z,.55,state.world.obstacles),false);
 assert.equal(state.world.obstacles.some(o=>o.type==='volcanic-outcrop'),false,
  'BR-only volcanic cover may not appear in CH01');
 const source=Story.serialize(state);
 for(let i=0;i<130;i++)Story.step(state,1/60,{});
 assert.ok(w.x>22&&w.x<25,'civilian must walk along existing on-foot corridor');
 assert.equal(w.z,-12);
 assert.equal(Sim.blocked(w.x,w.z,.55,state.world.obstacles),false);
 assert.equal(p.x,0);
 assert.equal(p.z,12);
 assert.equal(state.world.worker,w);
 assert.ok(state.world.elapsed>2);
 assert.notEqual(Story.serialize(state),source);
});
test("worker reverses at real endpoints and respects nearby player's solid body",()=>{
 const state=Story.createState(),w=state.worker,p=state.world.player;
 for(let i=0;i<900;i++){
  Story.step(state,1/60,{});
  assert.ok(w.x>=20-1e-7&&w.x<=28+1e-7);
  assert.equal(Sim.blocked(w.x,w.z,.55,state.world.obstacles),false);
 }
 assert.ok([-1,1].includes(w.direction));
 // Block the worker's immediate path with the captain. It must wait on its
 // current side, never cross the actual capsule or teleport to the far end.
 w.x=24;w.direction=1;p.x=25.7;p.z=-12;
 const old=w.x;
 for(let i=0;i<90;i++)Story.step(state,1/60,{});
 assert.ok(w.x>=old&&w.x<old+.2,'a person immediately ahead stops the worker without overlap');
 assert.equal(w.direction,1);
 assert.ok(Math.hypot(w.x-p.x,w.z-p.z)>=1.6);
});
test('checkpoint roundtrip stores exact worker position, and old CH01 checkpoints remain unchanged',()=>{
 const s=Story.createState();
 for(let i=0;i<180;i++)Story.step(s,1/60,{});
 const json=Story.serialize(s),o=JSON.parse(json);
 assert.ok(o.worker.x>20&&o.worker.x<28);
 const restored=Story.restore(json);
 assert.deepEqual(restored.worker,s.worker);
 assert.equal(restored.world.worker,restored.worker);
 assert.equal(Story.serialize(restored),json);
 for(let i=0;i<100;i++){
  Story.step(s,1/60,{});
  Story.step(restored,1/60,{});
  assert.deepEqual(restored.worker,s.worker);
 }
 delete o.worker;
 const old=Story.restore(JSON.stringify(o));
 assert.equal(old.worker,null,'existing saves cannot materialize a new NPC into occupied old positions');
 assert.equal(old.world.worker,null);
 Story.step(old,1/60,{});
 assert.equal(Story.serialize(old).includes('"worker":null'),true);
 for(const invalid of [
  {x:999,z:-12,direction:1},
  {x:20,z:-12,direction:0},
  {x:20,z:4,direction:-1},
  {x:20,z:-12,direction:1,health:100}
 ]){
  assert.throws(()=>Story.restore(JSON.stringify({...o,worker:invalid})),/checkpoint/i);
 }
});
test('worker appears in story scene only when visible and uncovered, never BR',()=>{
 const s=Story.createState(),p=s.world.player;
 p.x=20;p.z=-4;p.yaw=0;
 let visible=Visibility.planVisible(s.world);
 assert.equal(visible.workers.length,1);
 assert.equal(visible.workers[0].entity,s.worker);
 s.world.obstacles.push({x:20,z:-8,w:7,d:2});
 visible=Visibility.planVisible(s.world);
 assert.equal(visible.workers.length,0);
 const br=Sim.newMatch(42,0);
 br.worker={x:20,z:-12};
 assert.equal(Visibility.planVisible(br).workers.length,0);
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/plan\.workers\|\|\[\]/);
 assert.match(renderer,/type:'worker'/);
 assert.match(renderer,/mesh\.box\(w\.x,\.04,w\.z/);
});
