'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch,STEP}=require('../src/team-match.cjs');
const A='a'.repeat(48),B='b'.repeat(48);
function match(start='center'){
 const game=new TeamMatch({now:()=>0,objectiveSite:start,targetScore:3});
 game.join(A,'A');game.join(B,'B');
 assert.equal(game.command(A,{seq:1,type:'ready'}).ok,true);
 assert.equal(game.command(B,{seq:1,type:'ready'}).ok,true);
 return game;
}
test('authoritative earned relay points rotate center/north/south, with real E release between pads',()=>{
 const m=match(),p=m.players.get(A),rival=m.players.get(B);
 rival.x=8;rival.z=0;
 let seq=2;
 for(const [round,expectedNext] of [[1,-3.2],[2,3.2],[3,3.2]]){
  const old={...m.objective};
  p.x=old.x;p.z=old.z;p.direction={x:0,z:0};
  assert.equal(m.command(A,{seq:seq++,type:'capture',active:true}).ok,true);
  assert.equal(p.captureArmed,true,'fresh local console press required');
  for(let i=0;i<121;i++){
   m.step();
   if(i===59&&m.phase==='playing')
    assert.equal(m.command(A,{seq:seq++,type:'capture',active:true}).ok,true);
   if(m.score.red>=round)break;
  }
  assert.equal(m.score.red,round);
  if(round<3){
   assert.equal(m.objective.z,expectedNext);
   assert.equal(m.phase,'playing');
   assert.equal(m.snapshot(A).objective.z,expectedNext);
   assert.equal(p.captureArmed,false,'earned point must clear previous armed action');
   m.command(A,{seq:seq++,type:'capture',active:true});
   assert.equal(p.captureArmed,false,'held E renewal cannot auto-capture relocated pad');
   assert.equal(m.progress.red,0);
   m.command(A,{seq:seq++,type:'capture',active:false});
  }else{
   assert.equal(m.phase,'ended');assert.equal(m.winner,'red');
   assert.equal(m.objective.z,old.z,'final goal must not move after match has ended');
  }
 }
 assert.deepEqual(m.events.map(x=>x.type),[
  'round_start','relay_complete','relay_shift',
  'relay_complete','relay_shift','relay_complete','round_end'
 ]);
 assert.ok(m.events.every(x=>Object.keys(x).sort().join(',')==='team,tick,type'));
});
test('each rematch restores originally chosen physical relay, not the last moved site',()=>{
 for(const [start,originalZ] of [['center',0],['north',-3.2],['south',3.2]]){
  const m=match(start);
  m.advanceRelaySite();
  assert.notEqual(m.objective.z,originalZ);
  m.finish(null,'time_limit');
  m.command(A,{seq:2,type:'ready'});
  m.command(B,{seq:2,type:'ready'});
  assert.equal(m.phase,'playing');
  assert.equal(m.objective.z,originalZ);
  assert.deepEqual(m.events.map(x=>x.type),['round_start']);
 }
});
test('PC score event text recognises server relay shift without inferring opponent position',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 assert.match(client,/relay_shift:'중계 위치 변경'/);
 assert.match(client,/const site=validSite\?point\(objective\.x,objective\.z\):point\(0,0\)/);
 assert.doesNotMatch(client.slice(client.indexOf('const publicEventLabels='),client.indexOf('// Both relay progress numbers')),/state\.visible|state\.players/);
});
