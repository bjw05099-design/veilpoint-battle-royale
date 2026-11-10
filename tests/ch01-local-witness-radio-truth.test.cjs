'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
function state(){
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;
 s.world.obstacles=[];
 s.world.player.x=-2;s.world.player.z=-58;
 return s;
}
test('local civilian outcome requires actual arrival at authored destination, not merely a stale boolean',()=>{
 const s=state();s.civilianRerouted=true;
 s.civilianWalker={x:-4,z:-54,arrived:true};
 assert.notEqual(Comms.onsiteWitness(s)?.speaker,'이수혁 대위');
 s.civilianWalker.z=-58;
 assert.equal(Comms.onsiteWitness(s)?.speaker,'이수혁 대위');
 assert.match(Comms.onsiteWitness(s).message,/실제로 도착/);
 s.world.obstacles=[{x:-3,z:-58,w:1,d:5}];
 assert.equal(Comms.onsiteWitness(s),null,'solid wall prevents eyewitness claim');
});
test('local observation never pretends an offsite aid coordinator is speaking over a radio',()=>{
 const s=state();s.waterSurveyed=true;s.waterReportFiled=true;
 const beat=Comms.localCharacterBeat(s);
 assert.equal(beat.speaker,'이수혁 대위');
 assert.match(beat.message,/직접 인계/);
 assert.doesNotMatch(beat.message,/도시 전체의 급수 복구는 확인했다/);
 assert.equal(Comms.briefing(s).speaker,'이수혁 대위');
});
test('unmodified physical companion and active incident dialogue remain authoritative',()=>{
 const s=state();s.waterReportFiled=true;
 s.world.liaison={x:-2,z:-57};
 assert.equal(Comms.fieldRadio(s).speaker,'조현지');
 s.phase='engagement';
 assert.equal(Comms.fieldRadio(s).speaker,'조현지');
});
test('radio dialogue is read-only for v2 saves and 60Hz world',()=>{
 const s=state();s.waterReportFiled=true;s.waterSurveyed=true;
 const before=JSON.stringify(s),serialized=Story.serialize(s);
 for(let i=0;i<12;i++){Comms.fieldRadio(s);Comms.briefing(s);Comms.localCharacterBeat(s);}
 assert.equal(JSON.stringify(s),before);
 assert.equal(Story.serialize(s),serialized);
});
