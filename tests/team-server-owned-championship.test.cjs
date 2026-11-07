'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {TeamMatch}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
function match(target){
 const m=new TeamMatch({now:()=>0,seriesTargetWins:target});
 m.join('red-token','Red Player');
 m.join('blue-token','Blue Player');
 return m;
}
function vote(m,n){
 const a=m.command('red-token',{seq:n,type:'ready'});
 const b=m.command('blue-token',{seq:n,type:'ready'});
 assert.equal(a.ok,true);
 assert.equal(b.ok,true);
 assert.equal(m.phase,'playing');
}
test('3-round competitive series ends at two actual server results, not client claims',()=>{
 const m=match(2);
 vote(m,1);
 m.finish('red','objective_score');
 assert.deepEqual(m.series,{red:1,blue:0,draw:0});
 assert.deepEqual(m.snapshot('red-token').seriesFormat,{targetWins:2,champion:null});
 vote(m,2);
 assert.deepEqual(m.series,{red:1,blue:0,draw:0},
  'rematch must not erase accepted series history');
 m.finish('red','time_limit');
 assert.deepEqual(m.series,{red:2,blue:0,draw:0});
 assert.deepEqual(m.snapshot('blue-token').seriesFormat,
  {targetWins:2,champion:'red'});
 assert.equal(m.command('red-token',{seq:3,type:'ready'}).reason,'series_completed');
 assert.equal(m.command('blue-token',{seq:3,type:'ready'}).reason,'series_completed');
 assert.equal(m.phase,'ended');
 assert.throws(()=>m.start(),/series_completed/);
 assert.equal(m.roundId,2,'a third round cannot start after series victory');
});
test('draws do not grant series win; first-to-three allows 5-round competition',()=>{
 const m=match(3);
 vote(m,1);m.finish(null,'time_limit');
 assert.equal(m.series.draw,1);
 for(let n=2;n<=6;n++){
  vote(m,n);
  m.finish(n%2===0?'blue':'red','objective_score');
 }
 assert.deepEqual(m.series,{red:2,blue:3,draw:1});
 assert.equal(m.seriesChampion(),'blue');
 assert.equal(m.snapshot('red-token').seriesFormat.champion,'blue');
});
test('disconnect/voluntary exit never awards an artificial series victory; fresh seats reset series',()=>{
 const m=match(2);
 vote(m,1);m.finish('red','objective_score');
 vote(m,2);
 m.finish('blue','connection_timeout');
 assert.deepEqual(m.series,{red:1,blue:0,draw:0});
 const left=m.command('red-token',{seq:3,type:'leave'});
 assert.equal(left.ok,true);
 assert.deepEqual(m.series,{red:0,blue:0,draw:0});
 m.join('other-token','Other Person');
 assert.equal(m.seriesChampion(),null);
});
test('unlimited rematches stay byte-for-byte compatible with existing defaults',()=>{
 const m=match(0);
 vote(m,1);
 m.finish('red','objective_score');
 assert.equal(Object.hasOwn(m.snapshot('red-token'),'seriesFormat'),false);
 vote(m,2);
 assert.equal(m.phase,'playing');
 for(const n of [1,-1,4,'2',null])assert.throws(()=>match(n),/invalid_series_target/);
 assert.throws(()=>createTeamServer({seriesTargetWins:9,autoTick:false}),/invalid_series_target/);
});
test('PC final-series state is visible from public snapshot, no opponent private data required',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const code=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 assert.match(code,/seriesFormat\.targetWins/);
 assert.match(code,/seriesChampion\?'시리즈 종료 · 새 참가자와 재시작'/);
 assert.match(code,/!!seriesChampion/);
 const server=fs.readFileSync(path.resolve(__dirname,'../server/team-server.cjs'),'utf8');
 assert.match(server,/VEILPOINT_SERIES_TARGET_WINS/);
 assert.match(server,/seriesTargetWins/);
});
