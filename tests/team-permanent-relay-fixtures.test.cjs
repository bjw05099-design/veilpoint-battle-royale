'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');
const A='a'.repeat(48),B='b'.repeat(48);
function paired(site='rotation'){
 const game=new TeamMatch({now:()=>0,objectiveSite:site});
 game.join(A,'First');game.join(B,'Second');game.start();
 return game;
}
test('three real fixtures remain physically installed while active authorization changes',()=>{
 const game=paired(),first=game.snapshot(A);
 const fixed=[
  {id:'center',x:0,z:0,active:true},
  {id:'north',x:0,z:-3.2,active:false},
  {id:'south',x:0,z:3.2,active:false}
 ];
 assert.deepEqual(first.objective.stations,fixed);
 assert.deepEqual(game.snapshot(B).objective.stations,fixed);
 const p=game.players.get(A),other=game.players.get(B);
 p.x=0;p.z=0;other.x=8;other.z=0;
 assert.equal(game.command(A,{seq:1,type:'capture',active:true}).ok,true);
 for(let i=0;i<130;i++){
  if(i===59)game.command(A,{seq:2,type:'capture',active:true});
  game.step();if(game.score.red>0)break;
 }
 assert.equal(game.score.red,1);
 assert.equal(game.objective.z,-3.2);
 const active=game.snapshot(B).objective.stations;
 assert.deepEqual(active.map(t=>[t.id,t.x,t.z]),fixed.map(t=>[t.id,t.x,t.z]));
 assert.deepEqual(active.map(t=>t.active),[false,true,false]);
 assert.deepEqual(game.snapshot(A).objective.stations,active);
 assert.equal(game.snapshot(A).events.at(-1).type,'relay_shift');
 assert.equal(game.snapshot(A).self.relayInteraction,'approach');
 active[0].x=999;
 assert.equal(game.snapshot(B).objective.stations[0].x,0,'client cannot change authority fixtures');
});
test('single-location matches still publish all installed terminals and render all of them',()=>{
 const game=paired('south');
 assert.deepEqual(game.snapshot(A).objective.stations.map(t=>t.active),[false,false,true]);
 const source=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 assert.match(source,/for\(const terminal of objective\.stations\.slice\(0,3\)\)/);
 assert.match(source,/ctx\.fillRect\(p\.x-4,p\.y-4,8,8\)/);
 assert.doesNotMatch(source.slice(source.indexOf('for(const terminal of'),source.indexOf('const relayRadius=')),/state\.visible|innerHTML/);
});
