'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
test('an archived witness statement cannot fabricate a remote colleague speaking beside the captain',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;s.workerInterviewed=true;
 s.world.player.x=-200;s.world.player.z=-200;
 const beat=Comms.localCharacterBeat(s);
 assert.equal(beat.speaker,'이수혁 대위');
 assert.match(beat.message,/개인의 진술/);
 assert.doesNotMatch(beat.message,/모든 주민이/);
 const radio=Comms.fieldRadio(s);
 assert.equal(radio.speaker,'이수혁 대위');
 assert.equal(Story.missionTasks(s).length,0,'narrative observation adds no objective');
});
