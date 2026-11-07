'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSpatialIndex}=require('../src/br-spatial-index.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,RADIUS}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=n=>n.toString(16).padStart(64,'0');
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('broadphase is complete at negative cell boundaries and preserves insertion order',()=>{
 const actors=[{x:-6,z:-6,id:0},{x:-.1,z:-.1,id:1},{x:0,z:0,id:2},
  {x:5.999,z:5.999,id:3},{x:6,z:6,id:4},{x:50,z:50,id:5}];
 const idx=new BrSpatialIndex(actors);
 for(const [x,z,r] of [[0,0,0],[0,0,2],[-6,-6,8],[5.5,5.5,2],[49,49,2]]){
  const naive=actors.filter(a=>Math.abs(a.x-x)<=r&&Math.abs(a.z-z)<=r);
  assert.deepEqual(idx.nearby(x,z,r),naive);
 }
 assert.deepEqual(idx.nearby(-.3,-.3,.5).map(a=>a.id),[1,2]);
 for(const invalid of [-1,NaN,Infinity,2000,'3'])assert.throws(()=>idx.nearby(0,0,invalid),/invalid_spatial_query/);
 assert.throws(()=>new BrSpatialIndex([{x:Infinity,z:0}]),/invalid_spatial_actor/);
 assert.throws(()=>new BrSpatialIndex([],0),/invalid_spatial_index/);
});
test('all 96 physical bodies return exactly the naive nearby set across typical cell sizes',()=>{
 const w=world(),actors=[...w.actors.values()];
 for(const size of [3,6,12,30]){
  const idx=new BrSpatialIndex(actors,size);
  for(const actor of actors)for(const radius of [0,2*RADIUS,6,12,18,36]){
   const expected=actors.filter(p=>Math.abs(p.x-actor.x)<=radius&&Math.abs(p.z-actor.z)<=radius);
   assert.deepEqual(idx.nearby(actor.x,actor.z,radius),expected);
  }
 }
 for(const actor of actors){
  assert.equal(Sim.blocked(actor.x,actor.z,RADIUS,w.obstacles),false);
 }
});
test('spatial interest list matches actual range and cover rules without leaking other squads',()=>{
 const w=world(),a=w.actors.get(token(0)),b=w.actors.get(token(6));
 const me=w.snapshot(token(0));
 assert.equal(me.squad.length,6);
 assert.ok(me.visible.every(v=>[...w.actors.values()].some(p=>p.id===v.id&&p.team!==0&&p.eligible)));
 const actual=[...w.actors.values()];
 const expected=actual.filter(p=>p.team!==a.team&&p.eligible&&
   Math.hypot(p.x-a.x,p.z-a.z)<=me.coastalWeather.visibilityMeters&&
   !Sim.lineBlocked(a.x,a.z,p.x,p.z,w.obstacles)).map(p=>p.id);
 assert.deepEqual(me.visible.map(p=>p.id),expected);
 a.x=59;a.z=125;b.x=69;b.z=125;
 assert.equal(w.snapshot(token(0)).visible.some(p=>p.id===b.id),false);
 a.x=0;a.z=0;b.x=3;b.z=0;
 assert.equal(w.snapshot(token(0)).visible.some(p=>p.id===b.id),true);
 w.tick=2700;
 assert.equal(w.snapshot(token(0)).coastalWeather.code,'sea-haze');
 assert.equal(JSON.stringify(w.snapshot(token(0))).includes(token(6)),false);
});
