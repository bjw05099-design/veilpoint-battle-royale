'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TeamMatch}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');

const RED='r'.repeat(48),BLUE='b'.repeat(48);
function playing(site,targetScore=5){
 const match=new TeamMatch({objectiveSite:site,targetScore,now:()=>0});
 match.join(RED,'Red');match.join(BLUE,'Blue');
 match.command(RED,{seq:1,type:'ready'});
 match.command(BLUE,{seq:1,type:'ready'});
 assert.equal(match.phase,'playing');
 return match;
}
test('optional extended relay course advances between five permanent, public consoles',()=>{
 const match=playing('rotation-wide',5),red=match.players.get(RED);
 const positions=[[0,0],[0,-3.2],[0,3.2],[3.8,0],[-3.8,0]];
 let seq=1;
 for(let index=0;index<positions.length;index++){
  const snap=match.snapshot(RED);
  assert.equal(snap.relayVariant,'rotation-wide');
  assert.equal(snap.objective.stations.length,5);
  assert.deepEqual([snap.objective.x,snap.objective.z],positions[index]);
  assert.equal(snap.objective.stations.filter(p=>p.active).length,1);
  // Isolate physical relay interaction after arriving on foot; gameplay
  // never offers a remote client an objective-position command.
  red.x=positions[index][0];red.z=positions[index][1];
  red.direction={x:0,z:0};
  match.command(RED,{seq:++seq,type:'capture',active:true});
  for(let tick=0;tick<130&&match.phase==='playing';tick++){
   match.step();
   if(tick===59 && match.phase==='playing')
    match.command(RED,{seq:++seq,type:'capture',active:true});
   if(match.score.red>index)break;
  }
  assert.equal(match.score.red,index+1,'each site requires physical server ticks');
  if(index<positions.length-1){
   assert.equal(match.phase,'playing');
   assert.deepEqual([match.objective.x,match.objective.z],positions[index+1]);
   match.command(RED,{seq:++seq,type:'capture',active:false});
  }
 }
 assert.equal(match.phase,'ended');
 assert.equal(match.winner,'red');
 assert.equal(match.reason,'objective_score');
 assert.equal(match.players.get(RED).relayCompletions,5);
});
test('east/west fixed sites can be selected by host, with no change to legacy three-pad course',()=>{
 for(const [site,x] of [['east',3.8],['west',-3.8]]){
  const match=playing(site,1),snapshot=match.snapshot(RED);
  assert.equal(snapshot.relayVariant,'fixed');
  assert.deepEqual([snapshot.objective.x,snapshot.objective.z],[x,0]);
  assert.ok(snapshot.objective.stations.some(s=>s.x===x&&s.z===0&&s.active));
  const red=match.players.get(RED);
  red.x=x;red.z=0;red.direction={x:0,z:0};
  match.command(RED,{seq:2,type:'capture',active:true});
  for(let tick=0;tick<130&&match.phase==='playing';tick++){
   match.step();
   if(tick===59 && match.phase==='playing')
    match.command(RED,{seq:3,type:'capture',active:true});
  }
  assert.equal(match.winner,'red');
 }
 const legacy=playing('rotation',3).snapshot(RED);
 assert.equal(legacy.relayVariant,'rotation');
 assert.deepEqual(legacy.objective.stations.map(s=>s.id),['center','north','south']);
});
test('local HTTP team server publishes extended station course without client authority',async()=>{
 const server=createTeamServer({port:0,autoTick:false,objectiveSite:'rotation-wide',targetScore:5});
 const addr=await server.listen();
 try{
  const join=await fetch('http://127.0.0.1:'+addr.port+'/join',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({name:'Wide course guest'})});
  assert.equal(join.status,201);
  const {token}=await join.json();
  const state=await fetch('http://127.0.0.1:'+addr.port+'/state',
   {headers:{'x-player-token':token}}).then(res=>res.json());
  assert.deepEqual(state.objective.stations.map(s=>s.id),
   ['center','north','south','east','west']);
  assert.equal(state.targetScore,5);
  assert.equal(state.relayVariant,'rotation-wide');
  assert.equal(state.objective.x,0);
  assert.equal(state.objective.z,0);
 }finally{await server.close();}
});
