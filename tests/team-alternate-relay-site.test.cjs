'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {TeamMatch,STEP,WIN_SCORE}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const fs=require('node:fs'),path=require('node:path');
const A='a'.repeat(48),B='b'.repeat(48);

function playing(site,goal=WIN_SCORE){
 const g=new TeamMatch({now:()=>0,objectiveSite:site,targetScore:goal});
 g.join(A,'A');g.join(B,'B');
 g.command(A,{seq:1,type:'ready'});g.command(B,{seq:1,type:'ready'});
 assert.equal(g.phase,'playing');
 return g;
}
test('real 60Hz relay capture respects each physical host-chosen location',()=>{
 for(const [site,z] of [['north',-3.2],['center',0],['south',3.2]]){
  const g=playing(site,1),p=g.players.get(A),other=g.players.get(B);
  const snapshot=g.snapshot(A);
  assert.deepEqual([snapshot.objective.x,snapshot.objective.z],[0,z]);
  assert.equal(snapshot.objective.radius,2.6);
  assert.equal(g.targetScore,1);
  p.x=0;p.z=z===0?7:0;other.x=8;other.z=0;
  if(z!==0){
   assert.equal(g.snapshot(A).self.relayInteraction,'approach');
   assert.equal(g.command(A,{seq:2,type:'capture',active:true}).ok,true);
   assert.equal(p.captureArmed,false,'outside an alternate pad cannot earn capture');
   g.command(A,{seq:3,type:'capture',active:false});
  }
  p.x=0;p.z=z;p.direction={x:0,z:0};
  assert.equal(g.command(A,{seq:z===0?2:4,type:'capture',active:true}).ok,true);
  assert.equal(p.captureArmed,true);
  for(let i=0;i<121;i++){
   g.step();
   // A held E is leased for 90 ticks. A real live PC renews its intent,
   // without a release/press or any extra point, while it stays stationary.
   if(i===59&&g.phase==='playing')
    assert.equal(g.command(A,{seq:z===0?3:5,type:'capture',active:true}).ok,true);
   if(g.phase==='ended')break;
  }
  assert.equal(g.score.red,1);
  assert.equal(g.phase,'ended');
  assert.equal(g.winner,'red');
 }
});
test('local 2D client renders the real public relay and capture clock at its world coordinate',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 assert.match(html,/const site=validSite\?point\(objective\.x,objective\.z\):point\(0,0\)/);
 assert.match(html,/ctx\.arc\(site\.x,site\.y,relayRadius,0,Math\.PI\*2\)/);
 assert.match(html,/ctx\.arc\(site\.x,site\.y,radius,-Math\.PI\/2/);
 assert.doesNotMatch(html,/ctx\.arc\(250,250,25/);
});
test('server denies invalid authored relay locations and exposes physical public coordinates',async()=>{
 for(const value of ['',null,0,'diagonal','NORTH',{},'../../']){
  assert.throws(()=>new TeamMatch({objectiveSite:value}),/invalid_objective_site/);
 }
 const server=createTeamServer({port:0,autoTick:false,objectiveSite:'south'});
 const addr=await server.listen();
 try{
  const base='http://127.0.0.1:'+addr.port;
  const join=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({name:'Guest'})});
  const {token}=await join.json();
  const response=await fetch(base+'/state',{headers:{'x-player-token':token}});
  assert.equal(response.status,200);
  const state=await response.json();
  assert.deepEqual([state.objective.x,state.objective.z],[0,3.2]);
  const forged=await fetch(base+'/command',{method:'POST',headers:{'content-type':'application/json','x-player-token':token},
   body:JSON.stringify({seq:1,type:'ready',objectiveSite:'center'})});
  assert.equal(forged.status,400);
 }finally{await server.close();}
});
