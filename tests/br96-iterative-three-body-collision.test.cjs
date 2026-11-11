'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {settleBodyProposals}=require('../src/br96-simultaneous-bodies.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,RADIUS}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
function planned(x,next,tag){
 return {actor:{x,z:0,id:tag},next:{x:next,z:0},tag};
}
function assertSeparated(proposals,radius){
 for(let i=0;i<proposals.length;i++)
  for(let j=i+1;j<proposals.length;j++)
   assert.ok(Math.hypot(proposals[i].next.x-proposals[j].next.x,
    proposals[i].next.z-proposals[j].next.z)>=2*radius-1e-8);
}
test('three simultaneous server bodies converge after a later rollback invalidates an earlier pair',()=>{
 // In one pass A-B looks safe: 1.81 - 0.05 > 1.7. Then B must return
 // from 1.81 to 1.71 because C is stationary at 3.42. That change makes
 // A-B overlap, even though A-B has already been scanned this tick.
 const motions=[planned(0,.05,'A'),planned(1.71,1.81,'B'),planned(3.42,3.42,'C')];
 const evidence=settleBodyProposals(motions,.85);
 assert.deepEqual(motions.map(p=>p.next.x),[0,1.71,3.42]);
 assert.ok(evidence.passes>=2,'a single roster-ordered pass is not enough');
 assert.equal(evidence.rollbacks,2);
 assertSeparated(motions,.85);
});
test('fixed-point peer collision remains bounded for all 96 simultaneous participants',()=>{
 const motions=Array.from({length:96},(_,i)=>planned(i*1.71,
  i%3===0?i*1.71+.06:i%3===1?i*1.71+.09:i*1.71,i));
 const result=settleBodyProposals(motions,.85);
 assert.ok(result.passes<=97);
 assertSeparated(motions,.85);
 for(const p of motions)assert.ok(
  Math.abs(p.next.x-p.actor.x)<.1,'never teleport another seat during resolution');
 assert.throws(()=>settleBodyProposals(motions.slice(0,2),0),TypeError);
});
function token(i){return i.toString(16).padStart(64,'0');}
test('real 96-member server tick retains disjoint authenticated bodies during simultaneous movement',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 const world=new BrSquadWorld(lobby),actors=[...world.actors.values()];
 let origin;
 outer:for(let z=-120;z<120;z+=9)for(let x=-120;x<120;x+=9){
  if([0,1.71,3.42].some(dx=>Sim.blocked(x+dx,z,.85,world.obstacles)))
   continue;
  if(actors.slice(3).some(p=>Math.hypot(p.x-x,p.z-z)<9))continue;
  origin={x,z};break outer;
 }
 assert.ok(origin,'find a genuine empty original civilian plaza, not a forged collider map');
 actors.slice(0,3).forEach((p,i)=>{p.x=origin.x+i*1.71;p.z=origin.z;});
 assert.equal(world.move(token(0),{seq:0,dx:1,dz:0}).ok,true);
 assert.equal(world.move(token(1),{seq:0,dx:1,dz:0}).ok,true);
 for(let i=0;i<10;i++){
  world.step();
  const live=[...world.actors.values()].filter(p=>p.eligible);
  for(let a=0;a<live.length;a++)for(let b=a+1;b<live.length;b++)
   assert.ok(Math.hypot(live[a].x-live[b].x,live[a].z-live[b].z)>=1.7-1e-7,
    'server must never report overlapping authenticated bodies');
 }
 assert.equal(world.snapshot(token(0)).squad.length,6);
 assert.equal(world.snapshot(token(0)).squadCount,16);
});
