'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');

function localCrossing(){
 const state=Story.createState();
 state.phase='records';
 state.combat.cleared=true;
 state.world.obstacles=[];
 state.civicCrossing.disrupted=true;
 state.civicCrossing.assisted=true;
 state.civicCrossing.civilian={x:4,z:-16};
 state.civicCrossing.destination={x:10,z:-16};
 state.world.player.x=4;
 state.world.player.z=-14;
 return state;
}
test('physically assisted civilian speaks only in clear local reach and distinguishes guidance from arrival',()=>{
 const state=localCrossing();
 const snapshot=JSON.stringify(state);
 let voice=Comms.onsiteWitness(state);
 assert.equal(voice.speaker,'현지 주민');
 assert.match(voice.message,/아직 반대편에 도착하지 않았/);
 assert.equal(JSON.stringify(state),snapshot,'character radio may not mutate live 60Hz world');
 state.civicCrossing.civilian.x=10;
 state.world.player.x=10;
 voice=Comms.onsiteWitness(state);
 assert.equal(voice.speaker,'현지 주민');
 assert.match(voice.message,/직접 도착/);
 assert.doesNotMatch(voice.message,/모두 도착|모두 안전/);
});
test('no remote omniscient voice behind cover, outside sight or before physical assistance',()=>{
 const state=localCrossing();
 state.civicCrossing.assisted=false;
 assert.equal(Comms.onsiteWitness(state),null);
 state.civicCrossing.assisted=true;
 state.world.player.x=35;
 assert.equal(Comms.onsiteWitness(state),null);
 state.world.player.x=4;state.world.player.z=-14;
 state.world.obstacles=[{id:'temporary-test-occluder',x:4,z:-15,w:4,d:.4,h:3}];
 assert.equal(Comms.onsiteWitness(state),null);
 state.world.obstacles=[];
 state.phase='terminal';
 assert.equal(Comms.onsiteWitness(state),null);
});
test('live mission radio uses local witnessed actor without new checklist, save fields or later BR signal',()=>{
 const state=localCrossing();
 const fromAudio=Comms.fieldRadio(state,null);
 assert.equal(fromAudio.speaker,'현지 주민');
 assert.equal(typeof fromAudio.message,'string');
 const normal=Story.createState();
 const before=JSON.stringify(normal);
 Comms.fieldRadio(normal,null);
 assert.equal(JSON.stringify(normal),before);
 assert.notEqual(Comms.fieldRadio(normal,null).speaker,'현지 주민');
});
