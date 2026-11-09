'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Civic=require('../src/ch01-civic-recovery.js');

test('a witnessed public crossing saves only after real 60Hz pedestrian arrival, not on the F conversation',()=>{
 const state=Story.createState();
 const near={x:Civic.CROSSING.x,z:Civic.CROSSING.z};
 state.civicCrossing=Civic.step(state.civicCrossing,{disruption:true,assist:true,player:near});
 assert.equal(state.civicCrossing.assisted,true);
 assert.equal(Story.civicCrossingReached(state),false);
 assert.equal(Story.civicCrossingArrivalCheckpoint(false,state),false);
 // Keep the captain out of the pedestrian's path. No teleport or UI timer
 // can substitute for the exact civilian position following real fixed ticks.
 const far={x:-8,z:0};
 let steps=0;
 while(!Story.civicCrossingReached(state)&&steps<600){
  state.civicCrossing=Civic.step(state.civicCrossing,{player:far});
  steps++;
 }
 assert.ok(steps>120&&steps<600,'a walking person must take genuine world time');
 assert.equal(state.civicCrossing.civilian.x,state.civicCrossing.destination.x);
 assert.equal(state.civicCrossing.civilian.z,state.civicCrossing.destination.z);
 state.phase='records';
 assert.equal(Story.civicCrossingArrivalCheckpoint(false,state),true);
 assert.equal(Story.civicCrossingArrivalCheckpoint(true,state),false,'one-shot autosave transition');
 assert.equal(Story.civicCrossingArrivalCheckpoint(false,{...state,phase:'terminal'}),false);
 const persisted=Civic.restore(JSON.parse(JSON.stringify(state.civicCrossing)));
 assert.equal(Story.civicCrossingReached({...state,civicCrossing:persisted}),true);
});

test('CH01 60Hz loop, renderer and PC save hook use the same physical crossing result',()=>{
 const story=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(story,/state\.civicCrossing=Civic\.step\(state\.civicCrossing/);
 assert.match(story,/state\.world\.civicCrossingArrived=civicCrossingReached\(state\)/);
 assert.match(story,/civicCrossing:Civic\?Civic\.initial\(\):null/);
 assert.match(story,/Civic\.restore\(data\.civicCrossing\)/);
 assert.match(app,/const civicReachedBefore=Story\.civicCrossingReached\(state\)/);
 assert.match(app,/Story\.civicCrossingArrivalCheckpoint\(civicReachedBefore,state\)\)\s*persist\(/);
 assert.match(app,/persist\('주민의 실제 건널목 도착'\)/);
});