'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch,ROUND_LIMIT_TICKS,OVERTIME_TICKS,STEP,CAPTURE_SECONDS}=
 require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const RED='red-player',BLUE='blue-player';
function started(options={}){
 const m=new TeamMatch({now:()=>0,...options});
 m.join(RED,'Red');m.join(BLUE,'Blue');
 m.command(RED,{seq:1,type:'ready'});
 m.command(BLUE,{seq:1,type:'ready'});
 assert.equal(m.phase,'playing');
 return m;
}
test('opt-in tied relay round receives precisely one 60-second server extension',()=>{
 const m=started({suddenDeath:true});
 const red=m.players.get(RED);
 red.health=43;red.ammo=2;
 const position={x:red.x,z:red.z};
 m.score.red=1;m.score.blue=1;
 m.progress.red=CAPTURE_SECONDS/2;
 red.captureArmed=true;red.capturing=true;
 m.ticks=ROUND_LIMIT_TICKS-1;
 m.step();
 assert.equal(m.phase,'playing');
 assert.equal(m.ticks,ROUND_LIMIT_TICKS);
 assert.equal(m.suddenDeathActive,true);
 assert.deepEqual(m.score,{red:1,blue:1});
 assert.deepEqual(m.progress,{red:0,blue:0});
 assert.equal(red.captureArmed,false,'no automatic scoring from an unfinished held interaction');
 assert.equal(red.capturing,false);
 assert.equal(red.health,43);assert.equal(red.ammo,2);
 assert.deepEqual({x:red.x,z:red.z},position,'no teleport or spawn reset');
 const publicState=m.snapshot(RED);
 assert.deepEqual(publicState.round,{
  id:1,limitTicks:ROUND_LIMIT_TICKS+OVERTIME_TICKS,
  remainingTicks:OVERTIME_TICKS,suddenDeathActive:true
 });
 assert.deepEqual(m.events.map(e=>e.type),['round_start','overtime_start']);
 // Finite extension, with no score and no hidden extra overtime.
 m.ticks=ROUND_LIMIT_TICKS+OVERTIME_TICKS-1;
 m.step();
 assert.equal(m.phase,'ended');
 assert.equal(m.reason,'time_limit');
 assert.equal(m.winner,null);
 assert.equal(m.ticks,ROUND_LIMIT_TICKS+OVERTIME_TICKS);
 m.step();assert.equal(m.ticks,ROUND_LIMIT_TICKS+OVERTIME_TICKS);
});
test('first valid physical relay completion after tied deadline decides competitive overtime',()=>{
 const m=started({suddenDeath:true});
 m.score.red=1;m.score.blue=1;
 m.ticks=ROUND_LIMIT_TICKS-1;
 m.step();
 const red=m.players.get(RED),blue=m.players.get(BLUE);
 red.x=0;red.z=0;blue.x=8;blue.z=0;
 assert.equal(m.command(RED,{seq:2,type:'capture',active:true}).ok,true);
 for(let i=0;i<126&&m.phase==='playing';i++){
  if(i===60)m.command(RED,{seq:3,type:'capture',active:true});
  m.step();
 }
 assert.equal(m.phase,'ended');
 assert.equal(m.winner,'red');
 assert.equal(m.reason,'objective_score');
 assert.equal(m.score.red,2,'overtime ends on the first earned point, not the usual target 3');
 assert.ok(m.ticks<ROUND_LIMIT_TICKS+OVERTIME_TICKS);
 assert.equal(m.events.filter(e=>e.type==='overtime_start').length,1);
});
test('overtime is host-only, noncombat mode cannot opt in, and ordinary rounds retain schema',()=>{
 assert.throws(()=>new TeamMatch({suddenDeath:'yes'}),/invalid_sudden_death/);
 assert.throws(()=>new TeamMatch({suddenDeath:true,objectiveSite:'courier',targetScore:1}),/sudden_death_relay_only/);
 const normal=started();
 normal.ticks=ROUND_LIMIT_TICKS-1;
 normal.step();
 assert.equal(normal.phase,'ended');
 assert.equal(normal.reason,'time_limit');
 assert.deepEqual(normal.snapshot(RED).round,{id:1,limitTicks:ROUND_LIMIT_TICKS,remainingTicks:0});
 const lead=started({suddenDeath:true});
 lead.score.red=2;lead.score.blue=1;
 lead.ticks=ROUND_LIMIT_TICKS-1;
 lead.step();
 assert.equal(lead.phase,'ended');
 assert.equal(lead.suddenDeathActive,false);
 assert.equal(lead.winner,'red');
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 assert.match(ui,/overtime_start:'동점 연장전 시작'/);
 assert.match(ui,/round\?\.suddenDeathActive/);
});
test('connected clients see the same authoritative overtime clock; new round clears it',async()=>{
 const server=createTeamServer({port:0,autoTick:false,now:()=>0,suddenDeath:true});
 const addr=await server.listen();
 const base='http://127.0.0.1:'+addr.port;
 const join=async name=>{
  const r=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(r.status,201);return (await r.json()).token;
 };
 const command=async(token,body)=>{
  const r=await fetch(base+'/command',{method:'POST',headers:{'content-type':'application/json','x-player-token':token},body:JSON.stringify(body)});
  assert.equal(r.status,200);return r.json();
 };
 try{
  const a=await join('A'),b=await join('B');
  await command(a,{seq:1,type:'ready'});
  await command(b,{seq:1,type:'ready'});
  server.match.ticks=ROUND_LIMIT_TICKS-1;
  server.match.step();
  for(const token of [a,b]){
   const r=await fetch(base+'/state',{headers:{'x-player-token':token}});
   assert.equal(r.status,200);
   const data=await r.json();
   assert.equal(data.phase,'playing');
   assert.equal(data.round.suddenDeathActive,true);
   assert.equal(data.round.remainingTicks,OVERTIME_TICKS);
   assert.ok(data.events.some(e=>e.type==='overtime_start'));
  }
  server.match.ticks=ROUND_LIMIT_TICKS+OVERTIME_TICKS-1;
  server.match.step();
  await command(a,{seq:2,type:'ready'});
  await command(b,{seq:2,type:'ready'});
  assert.equal(server.match.phase,'playing');
  assert.equal(server.match.suddenDeathActive,false);
  assert.equal(server.match.snapshot(a).round.remainingTicks,ROUND_LIMIT_TICKS);
 }finally{await server.close();}
});
