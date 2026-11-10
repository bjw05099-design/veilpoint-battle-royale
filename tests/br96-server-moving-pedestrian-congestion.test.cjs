'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assessPedestrianFlow}=require('../src/br96-pedestrian-flow.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const keys=Array.from({length:96},(_,i)=>i.toString(16).padStart(64,'0'));
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(keys[i],'Human '+i).ok,true);
 for(const key of keys)assert.equal(lobby.ready(key,true).ok,true);
 return new BrSquadWorld(lobby);
}
test('server-travel direction excludes rear crowd while an idle body still experiences nearby congestion',()=>{
 const me={x:0,z:0},behind=[{x:-2.4,z:0},{x:-2.4,z:2},{x:-2.4,z:-2}];
 const ahead=[{x:2.4,z:0},{x:2.4,z:2},{x:2.4,z:-2}];
 assert.equal(assessPedestrianFlow(me,[me,...behind]).mobility,.84);
 assert.deepEqual(assessPedestrianFlow(me,[me,...behind],()=>false,{x:1,z:0}),
  {mobility:1,busy:false});
 assert.equal(assessPedestrianFlow(me,[me,...ahead],()=>false,{x:1,z:0}).mobility,.84);
 assert.equal(assessPedestrianFlow(me,[me,...behind],()=>false,{x:-1,z:0}).mobility,.84);
 assert.equal(assessPedestrianFlow(me,[me,...ahead],()=>true,{x:1,z:0}).mobility,1,
  'a wall never becomes a through-wall crowd sensor');
});
test('transient same-position bodies remain visible to congestion model',()=>{
 const p={x:0,z:0},overlaps=[{x:0,z:0},{x:0,z:0}];
 assert.equal(assessPedestrianFlow(p,[p,...overlaps],()=>false,{x:1,z:0}).mobility,.92);
 assert.equal(assessPedestrianFlow(p,[p,...overlaps],()=>false,{x:0,z:0}).mobility,.92);
});
test('96-person authoritative tick applies forward-flow to physical movement and self-only HUD',()=>{
 const w=world(),p=w.actors.get(keys[0]);
 p.x=0;p.z=0;
 const extras=[...w.actors.values()].filter(x=>x!==p).slice(0,3);
 const pos=[[-2.4,0],[-2.4,2],[-2.4,-2]];
 extras.forEach((a,i)=>{a.x=pos[i][0];a.z=pos[i][1];});
 assert.equal(w.snapshot(keys[0]).self.pedestrianFlow.mobility,.84);
 assert.equal(w.move(keys[0],{seq:0,dx:1,dz:0}).ok,true);
 const old=p.x;
 w.step();
 assert.ok(p.x>old,'60Hz server sim moves a real player forward');
 const own=w.snapshot(keys[0]);
 assert.equal(own.self.pedestrianFlow.mobility,1,
   'trailing bodies do not impose a phantom forward slowdown');
 assert.equal(Object.hasOwn(own.self.pedestrianFlow,'nearbyCount'),false);
 assert.equal(own.world,undefined,'self response does not grant raw server world');
});
