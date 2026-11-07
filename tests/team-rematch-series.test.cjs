'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');
const A='a'.repeat(48),B='b'.repeat(48),C='c'.repeat(48);
function paired(now=()=>0){
 const game=new TeamMatch({now});
 game.join(A,'Alpha');game.join(B,'Bravo');game.start();
 return game;
}
test('server persists public competitive series wins across mutually agreed 60Hz rematches',()=>{
 const game=paired();
 game.finish('red','objective_score');
 assert.deepEqual(game.snapshot(A).series,{red:1,blue:0,draw:0});
 game.command(A,{seq:1,type:'ready'});
 game.command(B,{seq:1,type:'ready'});
 assert.equal(game.phase,'playing');
 assert.equal(game.score.red,0,'new round score and timer reset without erasing the series');
 assert.deepEqual(game.snapshot(B).series,{red:1,blue:0,draw:0});
 game.finish('blue','time_limit');
 assert.deepEqual(game.snapshot(B).series,{red:1,blue:1,draw:0});
 game.command(A,{seq:2,type:'ready'});
 game.command(B,{seq:2,type:'ready'});
 assert.equal(game.phase,'playing');
 game.finish(null,'mutual_incapacitation');
 assert.deepEqual(game.snapshot(A).series,{red:1,blue:1,draw:1});
 const copy=game.snapshot(A);copy.series.red=900;
 assert.equal(game.snapshot(A).series.red,1,'client cannot overwrite server series');
 game.finish('red','objective_score');
 assert.deepEqual(game.snapshot(B).series,{red:1,blue:1,draw:1},
  'finished round cannot receive a duplicate result');
});
test('unexpected disconnect or server failure cannot award competitive rematch points',()=>{
 const game=paired();
 game.finish('red','connection_timeout');
 assert.deepEqual(game.snapshot(A).series,{red:0,blue:0,draw:0});
 game.command(A,{seq:1,type:'ready'});
 game.command(B,{seq:1,type:'ready'});
 game.finish(null,'simulation_error');
 assert.deepEqual(game.snapshot(B).series,{red:0,blue:0,draw:0});
});
test('physical seat leave and idle expiration reset old pair series before a newcomer joins',()=>{
 let now=0;
 const game=paired(()=>now);
 game.finish('red','objective_score');
 assert.equal(game.snapshot(A).series.red,1);
 game.command(B,{seq:1,type:'leave'});
 assert.equal(game.series.red,0);
 game.join(C,'Charlie');
 assert.deepEqual(game.snapshot(C).series,{red:0,blue:0,draw:0});
 const fresh=paired(()=>now);
 fresh.finish('blue','time_limit');
 now=31000;
 fresh.pruneIdleWaitingPlayers();
 assert.deepEqual(fresh.series,{red:0,blue:0,draw:0});
});
test('series is displayed only from server snapshot and never from an inferred client victory',()=>{
 const team=fs.readFileSync(path.join(__dirname,'../team.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'../src/team-match.cjs'),'utf8');
 assert.match(team,/id="series" role="status" aria-live="off"/);
 assert.match(client,/el\('series'\)\.textContent=validSeries/);
 assert.match(client,/Number\.isSafeInteger\(series\[team\]\)/);
 assert.match(source,/series: \{\.\.\.this\.series\}/);
 assert.match(source,/this\.series\[key\]=Math\.min\(999,this\.series\[key\]\+1\)/);
});
