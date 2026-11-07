'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch,WIN_SCORE}=require('../src/team-match.cjs');

test('team prototype publishes a real target score with both public team scores',()=>{
 const game=new TeamMatch({now:()=>0});
 const player='a'.repeat(48);
 game.join(player,'Alpha');
 const snapshot=game.snapshot(player);
 assert.equal(snapshot.targetScore,WIN_SCORE);
 assert.equal(snapshot.score.red,0);
 assert.equal(snapshot.score.blue,0);
 snapshot.score.red=WIN_SCORE+500;
 assert.equal(game.score.red,0,'client snapshot mutations cannot affect 60Hz authority');
});

test('PC local 2D interface presents two accessible server-goal meters without disclosing hidden players',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../team.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 for(const id of ['scoreGoal','redScoreMeter','blueScoreMeter'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-label="RED 팀 승리 목표 달성도"/);
 assert.match(html,/aria-label="BLUE 팀 승리 목표 달성도"/);
 assert.match(client,/targetScore = Number\.isSafeInteger\(state\.targetScore\)/);
 assert.match(client,/meter\.max = targetScore \?\? 1/);
 assert.match(client,/Math\.min\(targetScore,Math\.max\(0,state\.score\[team\]\)\)/);
 assert.doesNotMatch(client.slice(client.indexOf('const targetScore ='),client.indexOf('// Both relay progress numbers')),/state\.visible|opponent/);
});
