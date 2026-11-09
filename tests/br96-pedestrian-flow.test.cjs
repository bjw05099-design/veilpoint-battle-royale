'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const {assessPedestrianFlow}=require('../src/br96-pedestrian-flow.cjs');
const tokens=Array.from({length:96},(_,i)=>i.toString(16).padStart(64,'0'));
function lobby(){
 const l=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(l.join(tokens[i],'Human '+i).ok,true);
 for(const t of tokens)l.ready(t,true);
 assert.equal(l.phase,'roster_locked');
 return l;
}
test('nearby visible humans reduce, but never stop, server walking; unseen others do not',()=>{
 const me={x:0,z:0,eligible:true},near=[
  {x:2.2,z:0,eligible:true},{x:0,z:2.2,eligible:true},
  {x:-2.2,z:0,eligible:true}];
 assert.deepEqual(assessPedestrianFlow(me,[me]),{mobility:1,busy:false});
 assert.deepEqual(assessPedestrianFlow(me,[me,...near]),
  {mobility:.84,busy:true});
 assert.equal(assessPedestrianFlow(me,[me,...near],()=>true).mobility,1,
  'a solid wall never becomes a through-wall rival presence sensor');
 assert.equal(assessPedestrianFlow(me,[me,...near.map(p=>({...p,eligible:false}))]).mobility,1);
 assert.throws(()=>assessPedestrianFlow({x:NaN,z:0},[]),/invalid_pedestrian_flow/);
});
test('real 96-human world applies congestion to the next server tick and own snapshot',()=>{
 const w=new BrSquadWorld(lobby()),p=w.actors.get(tokens[0]);
 const all=[...w.actors.values()];
 const near=all.filter(q=>q!==p).slice(0,3);
 p.x=0;p.z=0;const offsets=[[2.2,0],[0,2.2],[-2.2,0]];
 near.forEach((q,i)=>{q.x=offsets[i][0];q.z=offsets[i][1];});
 for(const q of [p,...near])
  assert.equal(Sim.blocked(q.x,q.z,.85,w.obstacles),false,
   'fixture participants must occupy actual walkable ground');
 const flow=w.snapshot(tokens[0]).self.pedestrianFlow;
 assert.equal(flow.busy,true);
 assert.ok(flow.mobility<1&&flow.mobility>.7);
 assert.equal(Object.hasOwn(flow,'nearbyCount'),false,'do not publish hidden rival telemetry');
 assert.equal(w.move(tokens[0],{dx:1,dz:0,seq:0}).ok,true);
 const before=p.x;w.step();
 assert.ok(p.x>before&&p.x-before<4.5/60,
   'world moves for a real 60Hz tick, with a server-side crowd reduction');
});
test('existing PC status shows only the server-supplied local mobility value',()=>{
 const client=fs.readFileSync(require('node:path').join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/w\.self\.pedestrianFlow\?\.busy/);
 assert.doesNotMatch(client,/pedestrianFlow\.nearbyCount/);
});
