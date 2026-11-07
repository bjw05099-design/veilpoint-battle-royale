'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {TeamMatch,STEP,WIN_SCORE,CAPTURE_SECONDS}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const A='a'.repeat(48),B='b'.repeat(48);

function active(targetScore){
 const game=new TeamMatch({now:()=>0,targetScore});
 game.join(A,'Alpha');game.join(B,'Bravo');
 game.command(A,{seq:1,type:'ready'});
 game.command(B,{seq:1,type:'ready'});
 assert.equal(game.phase,'playing');
 return game;
}
test('host offers short, standard and extended objectives without changing old default',()=>{
 assert.equal(new TeamMatch().targetScore,WIN_SCORE);
 for(const [target,expected] of [[1,1],[3,3],[5,5]]){
  const game=active(target);
  const snapshot=game.snapshot(A);
  assert.equal(snapshot.targetScore,expected);
  snapshot.targetScore=999;
  assert.equal(game.targetScore,expected,'client-side edits cannot change authoritative round rule');
 }
 for(const invalid of [-1,0,2,4,6,3.5,'3',NaN,Infinity])
  assert.throws(()=>new TeamMatch({targetScore:invalid}),/invalid_target_score/);
});
test('physical two-second 60Hz relay completes a short match; longer match stays active',()=>{
 for(const target of [1,3,5]){
  const game=active(target),operator=game.players.get(A),other=game.players.get(B);
  operator.x=0;operator.z=0;operator.direction={x:0,z:0};
  operator.capturing=true;operator.captureHeld=true;operator.captureArmed=true;
  other.x=8;other.z=0;
  let seq=2;
  for(let i=0;i<Math.ceil(CAPTURE_SECONDS/STEP)+1;i++){
   // Only the server's renewed 60Hz intent can remain physically active.
   if(i>0&&i%50===0)
    game.command(A,{seq:seq++,type:'capture',active:true});
   game.step();if(game.phase==='ended')break;
  }
  assert.equal(game.score.red,1);
  assert.equal(game.phase,target===1?'ended':'playing');
  assert.equal(game.winner,target===1?'red':null);
  assert.equal(game.events.some(e=>e.type==='relay_complete'),true);
 }
});
test('local HTTP game exposes configured target, but clients cannot override it in a command',async()=>{
 const server=createTeamServer({port:0,autoTick:false,targetScore:5});
 const {port}=await server.listen();
 try{
  const base='http://127.0.0.1:'+port;
  const join=await fetch(base+'/join',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({name:'A'})});
  const {token}=await join.json();
  const state=await (await fetch(base+'/state',{headers:{'x-player-token':token}})).json();
  assert.equal(state.targetScore,5);
  const forged=await fetch(base+'/command',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':token},
   body:JSON.stringify({seq:1,type:'ready',targetScore:1})});
  assert.equal(forged.status,400);
  assert.equal(server.match.targetScore,5);
 }finally{await server.close();}
 assert.throws(()=>createTeamServer({port:0,autoTick:false,targetScore:9}),/invalid_target_score/);
});
