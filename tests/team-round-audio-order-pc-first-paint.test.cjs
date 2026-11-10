'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Audio=require('../src/team-audio.js');
const html=fs.readFileSync(path.resolve(__dirname,'../team.html'),'utf8');
function snapshot(id,phase,tick,over=false){
 return {phase,tick,round:{id,suddenDeathActive:over}};
}
test('real two-client server audio refuses delayed same-round or prior-round status packets',()=>{
 const a=Audio.create();
 assert.equal(a.sync(snapshot(2,'lobby',0)),null);
 assert.equal(a.sync(snapshot(2,'playing',10)),'start');
 assert.equal(a.sync(snapshot(2,'playing',35)),null);
 assert.equal(a.sync(snapshot(2,'playing',14)),null,'stale tick must be ignored');
 assert.equal(a.sync(snapshot(2,'playing',320,true)),'overtime');
 assert.equal(a.sync(snapshot(2,'playing',300,false)),null,'old tick cannot rewind overtime');
 assert.equal(a.sync(snapshot(2,'playing',325,false)),null,'overtime is a one-way match transition');
 assert.equal(a.sync(snapshot(2,'ended',330,true)),'finish');
 assert.equal(a.sync(snapshot(2,'playing',328,true)),null,'delayed running state cannot replay start after finish');
 assert.equal(a.sync(snapshot(2,'lobby',0)),null,'post-match lobby must not retroactively reopen finished round');
 assert.equal(a.sync(snapshot(1,'playing',999)),null,'older generation must not replay any cue');
 assert.equal(a.sync(snapshot(3,'lobby',0)),null);
 assert.equal(a.sync(snapshot(3,'playing',0)),'start',
   'new server-assigned round ID legitimately allows exactly one start');
 assert.equal(a.sync(snapshot(3,'playing',0)),null);
});
test('team mode first paint correctly tells Windows PC users F to interact and Space to fire',()=>{
 assert.match(html,/기본 WASD\/방향키 이동 · F 근거리 점령·물품 인수\/인계 · SPACE 발사 · R 재장전/);
 assert.match(html,/<button id="capture">F 점령<\/button>/);
 assert.match(html,/<button id="fire" aria-label="발사">SPACE 발사<\/button>/);
 assert.doesNotMatch(html,/E 점령 유지|기존 F 별칭|>F 발사<|>E 점령</);
 const controls=require('../src/desktop-controls.js');
 assert.equal(controls.DEFAULT_BINDINGS.interact,'KeyF');
 assert.equal(controls.DEFAULT_BINDINGS.fire,'Space');
});
