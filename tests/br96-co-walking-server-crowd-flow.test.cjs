'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assessPedestrianFlow}=require('../src/br96-pedestrian-flow.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const Sim=require('../src/simulation.js');
const tokens=Array.from({length:96},(_,i)=>i.toString(16).padStart(64,'0'));
function lobby(){
 const l=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(l.join(tokens[i],'Human '+i).ok,true);
 for(const token of tokens)l.ready(token,true);
 assert.equal(l.phase,'roster_locked');return l;
}
const offsets=[[2.6,0],[2.8,2],[2.8,-2]];
test('fictional server-driven parallel pedestrians do not block an open street as a stationary crowd',()=>{
 const me={x:0,z:0,eligible:true},same=offsets.map(([x,z])=>({
  x,z,eligible:true,moving:true,direction:{x:1,z:0}}));
 const side=offsets.map(([x,z])=>({x,z,eligible:true,moving:true,direction:{x:0,z:1}}));
 const opposing=offsets.map(([x,z])=>({x,z,eligible:true,moving:true,direction:{x:-1,z:0}}));
 assert.deepEqual(assessPedestrianFlow(me,[me,...same],()=>false,{x:1,z:0}),
  {mobility:1,busy:false});
 assert.equal(assessPedestrianFlow(me,[me,...side],()=>false,{x:1,z:0}).mobility,.84);
 assert.equal(assessPedestrianFlow(me,[me,...opposing],()=>false,{x:1,z:0}).mobility,.84);
 assert.equal(assessPedestrianFlow(me,[me,...same.map(o=>({...o,moving:false}))],
  ()=>false,{x:1,z:0}).mobility,.84);
 assert.equal(assessPedestrianFlow(me,[me,...same],()=>false,null).mobility,.84,
  'idle people still feel local human density in their own status');
 const overlap={x:1,z:0,eligible:true,moving:true,direction:{x:1,z:0}};
 assert.equal(assessPedestrianFlow(me,[me,overlap,...opposing],()=>false,{x:1,z:0}).busy,true,
  'overlapping moving bodies must never be ignored');
});
test('live BR96 6x16 server 60Hz displacement honours co-walking versus opposing real humans',()=>{
 const walk=(direction)=>{
  const world=new BrSquadWorld(lobby()),p=world.actors.get(tokens[0]);
  p.x=0;p.z=0;p.moving=true;p.direction={x:1,z:0};p.lastMoveTick=world.tick;
  const others=[...world.actors.values()].filter(q=>q!==p).slice(0,3);
  others.forEach((q,i)=>{q.x=offsets[i][0];q.z=offsets[i][1];
   q.moving=true;q.direction={x:direction,z:0};q.lastMoveTick=world.tick;
   assert.equal(Sim.blocked(q.x,q.z,.85,world.obstacles),false);
  });
  const initial=world.snapshot(tokens[0]).self.pedestrianFlow;
  assert.equal(world.move(tokens[0],{dx:1,dz:0,seq:0}).ok,true);
  const before=p.x;world.step();
  return {movement:p.x-before,initial};
 };
 const same=walk(1),opposite=walk(-1);
 assert.equal(same.initial.mobility,1);
 assert.equal(opposite.initial.mobility,.84);
 assert.ok(same.movement>opposite.movement&&opposite.movement>0,
  'server-authoritative walking advances farther with clear co-moving human flow');
 assert.ok(same.movement<.1,'60Hz traversal remains bounded; no teleport');
});
