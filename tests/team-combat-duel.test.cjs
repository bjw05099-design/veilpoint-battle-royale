'use strict';
// Abstract two-client competitive rules; no real-world operational model.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {TeamMatch,ROUND_LIMIT_TICKS,FIRE_INTERVAL_TICKS}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const RED='red-session',BLUE='blue-session';
function ready(settings){
 const game=new TeamMatch({now:()=>0,...settings});
 game.join(RED,'A');game.join(BLUE,'B');
 game.command(RED,{seq:1,type:'ready'});
 game.command(BLUE,{seq:1,type:'ready'});
 assert.equal(game.phase,'playing');
 return game;
}
test('duel is a distinct explicitly chosen combat round; no fabricated relay or objective',()=>{
 assert.throws(()=>new TeamMatch({objectiveSite:'duel'}),/duel_one_round_only/);
 assert.throws(()=>new TeamMatch({objectiveSite:'duel',targetScore:1,suddenDeath:true}),/sudden_death_relay_only/);
 const game=ready({objectiveSite:'duel',targetScore:1});
 const snapshot=game.snapshot(RED);
 assert.equal(snapshot.relayVariant,'duel');
 assert.equal(snapshot.objective,null);
 assert.equal(snapshot.self.relayInteraction,'inactive');
 assert.deepEqual(snapshot.progress,{red:0,blue:0});
 assert.deepEqual(snapshot.score,{red:0,blue:0});
 const refused=game.command(RED,{seq:2,type:'capture',active:true});
 assert.deepEqual(refused,{ok:false,reason:'duel_no_capture'});
 for(let i=0;i<150;i++)game.step();
 assert.deepEqual(game.progress,{red:0,blue:0});
 assert.deepEqual(game.score,{red:0,blue:0});
 assert.equal(game.players.get(RED).captureHeld,false);
 assert.equal(game.phase,'playing');
});
test('duel uses existing server-owned finite combat result, never capture-score victory',()=>{
 const game=ready({objectiveSite:'duel',targetScore:1});
 let seq=2;
 for(;seq<=4;seq++){
  assert.equal(game.command(RED,{seq,type:'fire'}).ok,true);
  if(seq<4)for(let i=0;i<FIRE_INTERVAL_TICKS;i++)game.step();
 }
 assert.equal(game.phase,'ended');
 assert.equal(game.winner,'red');
 assert.equal(game.reason,'opponent_incapacitated');
 assert.deepEqual(game.score,{red:0,blue:0});
 assert.equal(game.snapshot(BLUE).objective,null);
 // The same participants may explicitly agree to a new round.
 game.command(RED,{seq:5,type:'ready'});
 game.command(BLUE,{seq:2,type:'ready'});
 assert.equal(game.phase,'playing');
 assert.equal(game.snapshot(RED).relayVariant,'duel');
 assert.equal(game.snapshot(RED).round.remainingTicks,ROUND_LIMIT_TICKS);
});
test('duel with two active players at deadline is a draw, not a hidden point win',()=>{
 const game=ready({objectiveSite:'duel',targetScore:1});
 game.ticks=ROUND_LIMIT_TICKS-1;
 game.step();
 assert.equal(game.phase,'ended');
 assert.equal(game.reason,'time_limit');
 assert.equal(game.winner,null);
 assert.equal(game.ticks,ROUND_LIMIT_TICKS);
 assert.deepEqual(game.score,{red:0,blue:0});
 const legacy=ready({});
 assert.equal(legacy.snapshot(RED).relayVariant,'fixed');
 assert.ok(legacy.snapshot(RED).objective);
 assert.equal(legacy.command(RED,{seq:2,type:'capture',active:true}).ok,true);
});
test('two local PC clients see the same duel rules, not an invisible capture target',async()=>{
 const host=createTeamServer({port:0,autoTick:false,now:()=>0,objectiveSite:'duel',targetScore:1});
 const {port}=await host.listen(),base='http://127.0.0.1:'+port;
 const join=async name=>{
  const r=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(r.status,201);return (await r.json()).token;
 };
 const command=async(token,data)=>{
  const response=await fetch(base+'/command',{method:'POST',headers:{'content-type':'application/json','x-player-token':token},body:JSON.stringify(data)});
  assert.equal(response.status,200);return response.json();
 };
 try{
  const a=await join('First'),b=await join('Second');
  await command(a,{seq:1,type:'ready'});await command(b,{seq:1,type:'ready'});
  for(const token of [a,b]){
   const r=await fetch(base+'/state',{headers:{'x-player-token':token}});
   const state=await r.json();
   assert.equal(state.relayVariant,'duel');
   assert.equal(state.objective,null);
   assert.equal(state.targetScore,1);
  }
  const refusal=await command(a,{seq:2,type:'capture',active:true});
  assert.equal(refusal.ok,false);
  assert.equal(refusal.reason,'duel_no_capture');
 }finally{await host.close();}
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../team.html'),'utf8');
 assert.match(ui,/duelMode\?'중계기 없음/);
 assert.match(ui,/if\(validSite\)\{/);
 assert.match(html,/VEILPOINT_OBJECTIVE_SITE=duel VEILPOINT_TARGET_SCORE=1/);
});
