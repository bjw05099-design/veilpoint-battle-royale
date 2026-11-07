'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const A='a'.repeat(48),B='b'.repeat(48);
function playing(targetScore=3){
 const game=new TeamMatch({now:()=>0,objectiveSite:'rotation',targetScore});
 game.join(A,'One');game.join(B,'Two');
 game.command(A,{seq:1,type:'ready'});game.command(B,{seq:1,type:'ready'});
 assert.equal(game.phase,'playing');
 return game;
}
test('authoritative 60Hz relay moves center to north to south after each actual scored point',()=>{
 const game=playing(),player=game.players.get(A),opponent=game.players.get(B);
 opponent.x=8;opponent.z=0;
 let seq=1;
 for(const [index,z,nextZ] of [[0,0,-3.2],[1,-3.2,3.2],[2,3.2,null]]){
  assert.equal(game.objective.z,z);
  assert.equal(game.snapshot(B).objective.z,z,'public target is identical to both seats');
  player.x=0;player.z=z;player.direction={x:0,z:0};
  assert.equal(game.command(A,{seq:++seq,type:'capture',active:true}).ok,true);
  for(let i=0;i<124;i++){
   game.step();
   if(i===59&&game.phase==='playing')
    assert.equal(game.command(A,{seq:++seq,type:'capture',active:true}).ok,true,
      'held key is renewed before the 90-tick lease expires');
   if(game.score.red>index)break;
  }
  assert.equal(game.score.red,index+1);
  assert.equal(player.captureArmed,false,'completed site cannot auto-earn another point');
  if(nextZ!==null){
   assert.equal(game.phase,'playing');
   assert.equal(game.objective.z,nextZ);
   const snapshot=game.snapshot(A);
   assert.equal(snapshot.relayVariant,'rotation');
   assert.equal(snapshot.events.at(-1).type,'relay_shift');
   assert.equal(snapshot.self.relayInteraction,'approach','old site never counts as new target');
   assert.equal(game.command(A,{seq:++seq,type:'capture',active:false}).ok,true);
  }else{
   assert.equal(game.phase,'ended');
   assert.equal(game.winner,'red');
   assert.equal(game.events.filter(e=>e.type==='relay_shift').length,2);
  }
 }
});
test('rotation is optional, unavailable on forged client commands and resets on actual rematch',async()=>{
 for(const site of ['center','north','south']){
  const g=new TeamMatch({objectiveSite:site});
  assert.equal(g.snapshot===undefined,false);
  assert.equal(g.objective.z,site==='north'?-3.2:site==='south'?3.2:0);
 }
 const g=playing(1);
 const p=g.players.get(A),b=g.players.get(B);
 p.x=0;p.z=0;b.x=8;b.z=0;
 g.command(A,{seq:2,type:'capture',active:true});
 for(let i=0;i<121;i++){
  g.step();
  if(i===59&&g.phase==='playing')g.command(A,{seq:3,type:'capture',active:true});
 }
 assert.equal(g.phase,'ended');
 assert.equal(g.events.some(e=>e.type==='relay_shift'),false,'winning point must not shift the pad');
 g.command(A,{seq:4,type:'ready'});g.command(B,{seq:2,type:'ready'});
 assert.equal(g.phase,'playing');
 assert.equal(g.objective.z,0,'new round begins at the initial physical pad');
 const server=createTeamServer({port:0,autoTick:false,objectiveSite:'rotation'});
 const address=await server.listen();
 try{
  const base='http://127.0.0.1:'+address.port;
  const join=await (await fetch(base+'/join',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({name:'Local'})})).json();
  const json=await (await fetch(base+'/state',{headers:{'x-player-token':join.token}})).json();
  assert.equal(json.relayVariant,'rotation');
  const forged=await fetch(base+'/command',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':join.token},
   body:JSON.stringify({seq:1,type:'ready',relayVariant:'fixed'})});
  assert.equal(forged.status,400);
 }finally{await server.close();}
 const client=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 assert.match(client,/relay_shift:'중계 위치 변경'/);
});
