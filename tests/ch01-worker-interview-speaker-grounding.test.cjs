'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');

function observedWorkerInterview(){
 const state=Story.createState();
 state.phase='records';
 state.combat.cleared=true;
 state.workerInterviewed=true;
 state.world.player.x=0;state.world.player.z=0;
 // An interview is a saved fact, NOT proof that either colleague is nearby.
 state.world.liaison={x:90,z:90};
 state.world.kimJiyoon={x:80,z:80};
 return state;
}

test('CH01 offline radio never impersonates a remote colleague after a saved worker interview',()=>{
 const state=observedWorkerInterview();
 const before=JSON.stringify(state);
 const beat=Comms.localCharacterBeat(state);
 assert.equal(beat.speaker,'이수혁 대위');
 assert.match(beat.message,/작업자가 직접 들려준/);
 assert.match(beat.message,/확인하지 못했다/);
 assert.equal(Comms.fieldRadio(state).speaker,'이수혁 대위');
 assert.equal(JSON.stringify(state),before,'dialogue is read-only and cannot change V2 save state');
});

test('physically present CH01 colleague takes precedence over the captain\'s private recollection',()=>{
 const state=observedWorkerInterview();
 state.world.obstacles=[];
 state.world.kimJiyoon={x:1,z:1};
 assert.equal(Comms.fieldRadio(state).speaker,'김지윤');
 // A position alone must not make a remote character speak through an obstruction.
 state.world.kimJiyoon={x:100,z:100};
 assert.equal(Comms.fieldRadio(state).speaker,'이수혁 대위');
});
