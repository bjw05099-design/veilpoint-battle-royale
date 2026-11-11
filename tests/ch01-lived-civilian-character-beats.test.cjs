'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');

test('CH01 crew voices react to already spoken civilian eyewitness testimony, no extra inquiry gate',()=>{
 const s=Story.createState();s.phase='records';
 const baseline=Comms.briefing(s);
 assert.equal(baseline.speaker,'김지윤');
 s.workerInterviewed=true;
 const saved=JSON.stringify(s),spoken=Comms.briefing(s);
 assert.equal(spoken.speaker,'이수혁 대위',
  'an archived interview cannot make a distant colleague appear on-site');
 assert.match(spoken.message,/개인의 진술/);
 assert.match(spoken.message,/시각은 미확인/);
 assert.doesNotMatch(spoken.message,/모든 주민의 뜻|전국의 주민/);
 assert.equal(JSON.stringify(s),saved,'radio cannot advance an interaction or save flag');
 assert.ok(Object.isFrozen(spoken));
 s.waterSurveyed=true;
 assert.equal(Comms.briefing(s).speaker,'이수혁 대위');
 assert.match(Comms.briefing(s).message,/한 곳/);
 s.waterReportFiled=true;
 assert.equal(Comms.briefing(s).speaker,'이수혁 대위');
 assert.match(Comms.briefing(s).message,/직접 인계/);
 assert.doesNotMatch(Comms.briefing(s).message,/도시 전체의 급수 복구를 확인했다/);
});
test('nearby witnessed arrival is not reported by a remote or uninformed observer',()=>{
 const s=Story.createState();s.phase='exit';s.choice='evacuation';
 s.civilianRerouted=true;s.civilianWalker.arrived=false;
 let spoken=Comms.briefing(s);
 assert.match(spoken.message,/도착했는지 확인하지 않고/);
 s.civilianWalker.arrived=true;
 // Match the actual 60Hz walking destination, not a boolean alone.
 s.civilianWalker.x=-4;s.civilianWalker.z=-58;
 s.world.player.x=140;s.world.player.z=140;
 spoken=Comms.briefing(s);
 assert.doesNotMatch(spoken.message,/실제로 도착한 것을 봤다/);
 // A physically nearby captain is allowed to acknowledge exactly one arrival.
 s.world.player.x=s.civilianWalker.x;
 s.world.player.z=s.civilianWalker.z+1;
 spoken=Comms.briefing(s);
 assert.match(spoken.message,/한 주민/);
 assert.match(spoken.message,/다른 주민이 모두 도착했다는 뜻은 아니다/);
 assert.equal(Comms.localCharacterBeat(null),null);
});
test('optional urban environment and physical awning clearance change dialogue without changing route rules',()=>{
 const s=Story.createState();s.phase='records';s.combat.cleared=true;
 s.awningShift=1;
 let line=Comms.localCharacterBeat(s);
 assert.equal(line.speaker,'마라');
 assert.match(line.message,/차양/);
 assert.equal(Comms.localCharacterBeat({...s,phase:'terminal'}),null);
 assert.equal(Comms.localCharacterBeat({...s,phase:'failed'}),null);
 const source=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(source,/Comms\.fieldRadio\(state,Story\.localPublicAddress\(state\)\)/,
  'actual CH01 HUD must select physically witnessed character lines before public PA');
});
