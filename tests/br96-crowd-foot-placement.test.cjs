'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,RADIUS,SPEED,STEP}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function fullWorld(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby);
}
function uncrowdedPatch(world,excluded){
 const others=[...world.actors.values()].filter(p=>!excluded.includes(p));
 for(let x=-145;x<145;x+=13)for(let z=-145;z<145;z+=13){
  if([-2.8,-.86,0,.86,2.8].some(dx=>
      Sim.blocked(x+dx,z,RADIUS,world.obstacles)))continue;
  if(others.some(p=>Math.hypot(p.x-x,p.z-z)<5))continue;
  return {x,z};
 }
 throw new Error('no_public_open_space_for_test_fixture');
}
test('BR96 60Hz human bodies yield laterally instead of indefinitely freezing on an open pedestrian square',()=>{
 const world=fullWorld(),a=world.actors.get(token(0)),
   b=world.actors.get(token(1)),untouched=world.actors.get(token(12));
 const beforeUnrelated={x:untouched.x,z:untouched.z};
 const {x,z}=uncrowdedPatch(world,[a,b]);
 a.x=x-.86;a.z=z;b.x=x+.86;b.z=z;
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>2*RADIUS);
 assert.equal(world.move(token(0),{dx:1,dz:0,seq:1}).ok,true);
 assert.equal(world.move(token(1),{dx:-1,dz:0,seq:1}).ok,true);
 world.step();
 const strideA=Math.hypot(a.x-(x-.86),a.z-z);
 const strideB=Math.hypot(b.x-(x+.86),b.z-z);
 assert.ok(strideA>0&&strideB>0,'both actual server humans make progress on a spacious public route');
 assert.ok(strideA<=SPEED*STEP+1e-6&&strideB<=SPEED*STEP+1e-6,
   'sidestep never exceeds the authenticated 60Hz walk budget');
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=2*RADIUS-1e-8,
   'one 60Hz snapshot may not overlap another human capsule');
 assert.ok(!Sim.blocked(a.x,a.z,RADIUS,world.obstacles));
 assert.ok(!Sim.blocked(b.x,b.z,RADIUS,world.obstacles));
 assert.equal(a.traveledMeters>0,true);
 assert.equal(b.traveledMeters>0,true);
 assert.deepEqual({x:untouched.x,z:untouched.z},beforeUnrelated,
   'independent third-squad human cannot be moved by someone else steering');
 const self=world.snapshot(token(0)).self;
 assert.equal(self.moving,true);
 assert.ok(Math.abs(self.facing)>0,'real accepted sidestep changes server-owned avatar facing');
});
test('the BR96 crowd mechanic cannot change identity, eligibility, or the required 16x6 human roster',()=>{
 const world=fullWorld(),before=[...world.actors.values()]
   .map(p=>[p.id,p.team,p.slot,p.eligible]);
 world.step();
 assert.deepEqual([...world.actors.values()]
   .map(p=>[p.id,p.team,p.slot,p.eligible]),before);
 assert.equal(world.actors.size,96);
});
