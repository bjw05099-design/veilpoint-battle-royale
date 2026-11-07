'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch,ROUND_LIMIT_TICKS}=require('../src/team-match.cjs');
const {lineBlocked}=require('../src/simulation.js');
const {createTeamServer}=require('../server/team-server.cjs');
const RED='a'.repeat(48),BLUE='b'.repeat(48);
function round(site='duel-docks'){
 const m=new TeamMatch({now:()=>0,objectiveSite:site,targetScore:1});
 m.join(RED,'Harbor A');m.join(BLUE,'Harbor B');
 m.command(RED,{seq:1,type:'ready'});m.command(BLUE,{seq:1,type:'ready'});
 assert.equal(m.phase,'playing');
 return m;
}
test('dockside duel is a genuinely different fixed cover arena, not a map reskin',()=>{
 assert.throws(()=>new TeamMatch({objectiveSite:'duel-docks',targetScore:3}),/duel_one_round_only/);
 assert.throws(()=>new TeamMatch({objectiveSite:'duel-docks',targetScore:1,suddenDeath:true}),/sudden_death_relay_only/);
 assert.throws(()=>new TeamMatch({objectiveSite:'duel-docks-extra',targetScore:1}),/invalid_objective_site/);
 const m=round(),old=round('duel');
 const a=m.snapshot(RED),legacy=old.snapshot(RED);
 assert.equal(a.relayVariant,'duel');
 assert.equal(a.arena,'dockyard');
 assert.equal(a.objective,null);
 assert.equal(a.cover.length,3,'new dockside route has actual different physical cover');
 assert.equal(legacy.cover.length,2,'original duel is not modified');
 assert.equal(Object.hasOwn(legacy,'arena'),false,'legacy snapshots preserve their existing contract');
 assert.deepEqual(a.cover,[{x:0,z:0,w:1.2,d:5.2},{x:-4,z:-4,w:2,d:1.5},{x:4,z:4,w:2,d:1.5}]);
 assert.deepEqual(m.score,{red:0,blue:0});
 assert.equal(m.command(RED,{seq:2,type:'capture',active:true}).reason,'duel_no_capture');
});
test('both physical cover and fair pedestrian path use identical server geometry',()=>{
 const m=round(),s=m.snapshot(RED),red=m.players.get(RED),blue=m.players.get(BLUE);
 assert.equal(lineBlocked(red.x,red.z,blue.x,blue.z,m.cover),true);
 assert.deepEqual(s.visible.map(x=>x.team),['red'],
  'opaque center geometry cannot reveal the opponent through a wall');
 assert.equal(lineBlocked(-8,-6,8,-6,m.cover),false,
  'an open passage exists around the installed barriers');
 assert.equal(lineBlocked(-8,6,8,6,m.cover),false,
  'opposite passage also remains open');
 // Use ordinary authenticated 60Hz movement; never accept x/z coordinates
 // from a remote browser command as a teleport.
 m.command(RED,{seq:2,type:'move',direction:{x:1,z:0}});
 for(let i=0;i<180;i++){
  if(i===60)m.command(RED,{seq:3,type:'move',direction:{x:1,z:0}});
  if(i===120)m.command(RED,{seq:4,type:'move',direction:{x:1,z:0}});
  m.step();
 }
 assert.ok(red.x>-8&&red.x<0);
 assert.ok(red.x<=-1.15+1e-5,'server collider stops the avatar at the barrier');
 assert.equal(red.health,100);
 assert.deepEqual(m.score,{red:0,blue:0});
 assert.equal(m.snapshot(RED).cover.length,3);
});
test('the same observed player becomes visible once real walls no longer occlude',()=>{
 const m=round(),red=m.players.get(RED),blue=m.players.get(BLUE);
 // Move fixture positions solely for a controlled renderer/visibility proof.
 // No client command in the protocol accepts these coordinates.
 red.z=-6;blue.z=-6;
 assert.equal(lineBlocked(red.x,red.z,blue.x,blue.z,m.cover),false);
 assert.deepEqual(m.snapshot(RED).visible.map(x=>x.team),['red','blue']);
 assert.deepEqual(m.snapshot(BLUE).visible.map(x=>x.team),['red','blue']);
 const oldScore={...m.score};
 m.ticks=ROUND_LIMIT_TICKS-1;m.step();
 assert.equal(m.phase,'ended');
 assert.equal(m.winner,null);
 assert.deepEqual(m.score,oldScore);
});
test('two HTTP players observe same authoritative physical dockside arena',async()=>{
 const host=createTeamServer({port:0,autoTick:false,now:()=>0,objectiveSite:'duel-docks',targetScore:1});
 const {port}=await host.listen(),base='http://127.0.0.1:'+port;
 const join=async name=>{
  const response=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(response.status,201);return (await response.json()).token;
 };
 const send=async(token,seq,type)=>{
  const response=await fetch(base+'/command',{method:'POST',headers:{'content-type':'application/json','x-player-token':token},body:JSON.stringify({seq,type})});
  assert.equal(response.status,200);return response.json();
 };
 try{
  const a=await join('Red'),b=await join('Blue');
  await send(a,1,'ready');await send(b,1,'ready');
  for(const token of [a,b]){
   const response=await fetch(base+'/state',{headers:{'x-player-token':token}});
   assert.equal(response.status,200);
   const state=await response.json();
   assert.equal(state.arena,'dockyard');
   assert.equal(state.relayVariant,'duel');
   assert.equal(state.objective,null);
   assert.equal(state.cover.length,3);
  }
 }finally{await host.close();}
 const html=fs.readFileSync(path.resolve(__dirname,'../team.html'),'utf8');
 const client=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 assert.match(html,/VEILPOINT_OBJECTIVE_SITE=duel-docks VEILPOINT_TARGET_SCORE=1/);
 assert.match(client,/state\.arena==='dockyard'\?' · 부두 대결'/);
});
