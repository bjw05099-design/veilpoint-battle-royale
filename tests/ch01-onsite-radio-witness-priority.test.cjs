'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
const fs=require('node:fs'),path=require('node:path');

function observedState(){
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;
 s.civilianRerouted=true;s.civilianWalker.arrived=true;
 s.civilianWalker.x=-4;s.civilianWalker.z=-58;
 s.world.player.x=s.civilianWalker.x;
 s.world.player.z=s.civilianWalker.z-1.2;
 return s;
}
test('real local human reaction is heard before an ordinary powered public announcement',()=>{
 const s=observedState(),publicPA=Object.freeze({
  speaker:'현지 구조단 안내 방송',message:'현장 공개 안내'});
 const before=JSON.stringify(s);
 const line=Comms.fieldRadio(s,publicPA);
 assert.equal(line.speaker,'이수혁 대위');
 assert.match(line.message,/한 주민/);
 assert.notEqual(line,publicPA);
 assert.deepEqual(Comms.onsiteWitness(s),line);
 assert.equal(JSON.stringify(s),before,'radio cannot change gameplay, checkpoint or 60Hz world');
 assert.ok(Object.isFrozen(line));
});
test('distant civilians or obstructed visual path never displace real public announcements',()=>{
 const s=observedState(),publicPA=Object.freeze({
  speaker:'현지 구조단 안내 방송',message:'현장 안내'});
 const bystander=s.civilianWalker;
 s.world.player.x=bystander.x+36;s.world.player.z=bystander.z+36;
 assert.strictEqual(Comms.fieldRadio(s,publicPA),publicPA);
 s.world.player.x=bystander.x;s.world.player.z=bystander.z-3;
 s.world.obstacles.push({x:bystander.x,z:bystander.z-1.5,w:4,d:.4,h:3,type:'cover'});
 assert.equal(Comms.onsiteWitness(s),null);
 assert.strictEqual(Comms.fieldRadio(s,publicPA),publicPA);
 s.world.obstacles.pop();
 s.civilianWalker.arrived=false;
 assert.strictEqual(Comms.fieldRadio(s,publicPA),publicPA);
 assert.equal(Comms.fieldRadio(s,null).speaker,'이수혁 대위',
  'without a live arrival or public PA, retain the established unconfirmed route report');
});
test('a nearby independently arrived Mara has agency and no hidden-tracking radio',()=>{
 const s=Story.createState();s.phase='records';
 s.mara.arrived=true;
 const mara=s.mara;
 s.world.player.x=mara.x;s.world.player.z=mara.z+.8;
 const line=Comms.onsiteWitness(s);
 assert.equal(line.speaker,'마라');
 assert.match(line.message,/제 판단/);
 s.world.player.x=-140;s.world.player.z=140;
 assert.equal(Comms.onsiteWitness(s),null);
 s.phase='terminal';
 assert.equal(Comms.onsiteWitness(s),null);
});
test('missing actor data and old v2 save-compatible phases fall through without invented sight',()=>{
 const s=Story.createState(),fallback=Object.freeze({speaker:'현장 교신',message:'현장 통신'});
 assert.equal(Comms.onsiteWitness(null),null);
 assert.equal(Comms.onsiteWitness(s),null);
 assert.strictEqual(Comms.fieldRadio(s,fallback),fallback);
 const original=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(original)),original);
 const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
 assert.match(source,/Comms\.fieldRadio\(state,Story\.localPublicAddress\(state\)\)/);
 assert.doesNotMatch(source,/Comms\.onsiteWitness\(state\)\.message\s*=/);
});
