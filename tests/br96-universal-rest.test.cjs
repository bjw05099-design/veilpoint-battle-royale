'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,REST_RECOVERY_PER_SECOND,STAMINA_RECOVERY_PER_SECOND}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const tokens=Array.from({length:96},(_,n)=>n.toString(16).padStart(64,'0'));
function match(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(tokens[i],'Player '+i).ok,true);
 for(const token of tokens)assert.equal(lobby.ready(token,true).ok,true);
 assert.equal(lobby.phase,'roster_locked');
 return new BrSquadWorld(lobby,20261108);
}
function recoverAt(x,z,steps=60){
 const world=match(),self=world.actors.get(tokens[0]);
 assert.equal(Sim.blocked(x,z,.85,world.obstacles),false,'real pedestrian space');
 self.x=x;self.z=z;self.stamina=40;
 for(let i=0;i<steps;i++)world.step();
 return {value:self.stamina,resting:world.snapshot(tokens[0]).self.resting};
}
test('BR96 stamina recovers anywhere when standing still, not only in the shade court',()=>{
 const center=recoverAt(0,0),shade=recoverAt(43,75),east=recoverAt(100,60);
 assert.equal(REST_RECOVERY_PER_SECOND>STAMINA_RECOVERY_PER_SECOND,true);
 assert.ok(Math.abs(center.value-52.5)<1e-7);
 assert.ok(Math.abs(shade.value-center.value)<1e-9,'shade gives no magical bonus');
 assert.ok(Math.abs(east.value-center.value)<1e-9,'distant ordinary public path gives same rest');
 assert.equal(center.resting,true);
 assert.equal(shade.resting,true);
});
test('BR96 walking recovers slower and sprint drains, both from server-measured movement',()=>{
 const world=match(),p=world.actors.get(tokens[0]);
 p.x=0;p.z=0;p.stamina=50;
 world.move(tokens[0],{dx:1,dz:0,seq:1});
 world.step();
 assert.equal(world.snapshot(tokens[0]).self.resting,false);
 assert.ok(Math.abs(p.stamina-(50+STAMINA_RECOVERY_PER_SECOND/60))<1e-7);
 world.move(tokens[0],{dx:0,dz:0,seq:2});
 world.step();
 assert.equal(world.snapshot(tokens[0]).self.resting,true);
 assert.ok(Math.abs(p.stamina-(50+(STAMINA_RECOVERY_PER_SECOND+REST_RECOVERY_PER_SECOND)/60))<1e-7);
 world.move(tokens[0],{dx:1,dz:0,seq:3});
 assert.equal(world.pace(tokens[0],{sprint:true}).ok,true);
 const before=p.stamina;
 world.step();
 assert.equal(world.snapshot(tokens[0]).self.resting,false);
 assert.ok(p.stamina<before);
});
test('BR96 does not award stationary bonus when movement input pushes against a wall',()=>{
 const world=match(),p=world.actors.get(tokens[0]);
 p.x=0;p.z=0;p.stamina=50;
 world.obstacles.push({x:1.45,z:0,w:.8,d:5,h:2,type:'test-collision-wall'});
 world.move(tokens[0],{dx:1,dz:0,seq:1});
 for(let i=0;i<20;i++)world.step();
 assert.equal(world.snapshot(tokens[0]).self.resting,false,
   'holding a movement key, even when blocked, is not voluntary rest');
 assert.ok(p.stamina<=50+STAMINA_RECOVERY_PER_SECOND/3+1e-7);
});
