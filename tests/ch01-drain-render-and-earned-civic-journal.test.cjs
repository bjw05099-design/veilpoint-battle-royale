'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Flood=require('../src/ch01-street-flood.js');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Civic=require('../src/ch01-civic-recovery.js');
const Journal=require('../src/field-journal.js');
function realDrainScene(){
 const state=Story.createState();
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 state.world.bots.forEach(b=>{b.health=0;b.alive=false;});
 state.combat.cleared=true;
 state.phase='records';
 state.world.player.x=Flood.DRAIN.x;
 state.world.player.z=Flood.DRAIN.z;
 state.world.player.yaw=0;
 return state;
}
test('CH01 authored metal drain is a bounded visual part of real wet map, with progressive physical debris reduction',()=>{
 const wet=Flood.details(Flood.PATCH);
 const mid=Flood.details({...Flood.PATCH,repairProgress:.5});
 const clean=Flood.details({...Flood.PATCH,cleared:true});
 assert.equal(Flood.details(null).length,0);
 assert.equal(Flood.details({...Flood.PATCH,x:900}).length,0,
   'unrelated world data cannot fabricate a drain at unreviewed coordinates');
 assert.ok(wet.length>=12);
 const leaves=x=>x.filter(d=>d.id.startsWith('drain-leaf-'));
 assert.equal(leaves(wet).length,3);
 assert.equal(leaves(mid).length,2);
 assert.equal(leaves(clean).length,0);
 assert.ok(wet.some(d=>d.id==='drain-rim'));
 assert.ok(wet.some(d=>d.id==='drain-bar-3'));
 assert.ok(clean.some(d=>d.id==='drain-bar-3'));
 assert.ok(Object.isFrozen(wet)&&wet.every(Object.isFrozen));
 for(const d of wet){
  assert.ok(d.w>0&&d.d>0&&d.h>0&&d.h<=.03,
    'shallow dressing must not appear to be a step or invisible obstacle');
  assert.ok(Math.abs(d.x-Flood.PATCH.x)+d.w/2<=Flood.PATCH.w/2+.001);
  assert.ok(Math.abs(d.z-Flood.PATCH.z)+d.d/2<=Flood.PATCH.d/2+.001);
  assert.ok(d.y>=0&&d.y<=.10);
  assert.equal(d.rgb.length,3);
  assert.match(d.canvas,/^#[0-9a-f]{6}$/i);
 }
 assert.equal(Flood.details(Flood.PATCH),wet,
   'visible details are cached, not re-created on every GPU frame');
 assert.equal(Flood.mobility('records',Flood.PATCH.x,Flood.PATCH.z),.72);
 assert.equal(Flood.mobility('records',Flood.PATCH.x,Flood.PATCH.z,true),.92);
});
test('WebGL and Canvas fallback consume identical fixed-step drain props and never modify gameplay collision',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.equal((renderer.match(/VeilpointStreetFlood\?\.details\?\.\(wet\)/g)||[]).length,2,
   'both render paths must use the same authored asset list');
 assert.match(renderer,/polygon\(\[proj\(d\.x-d\.w\/2,y,d\.z-d\.d\/2\)/);
 assert.match(renderer,/mesh\.box\(d\.x,d\.y,d\.z,d\.w,d\.h,d\.d,d\.rgb\)/);
 const state=Story.createState();
 const empty=Journal.entries(state);
 assert.equal(empty.some(x=>x.id==='streetDrain'),false);
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 const obstaclesBefore=JSON.stringify(state.world.obstacles);
 Flood.details(state.world.streetFlood);
 assert.equal(JSON.stringify(state.world.obstacles),obstaclesBefore,
  'render-only storm drain fixtures must not alter the active 60Hz collisions');
});
test('CH01 optional wet-street action reaches the journal only after the actual 60Hz task finishes, including restore',()=>{
 const state=realDrainScene();
 const initial=Story.serialize(state);
 assert.equal(Journal.entries(state).some(x=>x.id==='streetDrain'),false);
 assert.equal(Story.interact(state).event,'street_drain_started');
 for(let n=0;n<90;n++)Story.step(state,1/60,{});
 assert.equal(state.drainCleared,false);
 assert.equal(Journal.entries(state).some(x=>x.id==='streetDrain'),false,
  'partial progress is not a finished civic intervention');
 const progress=Story.serialize(state);
 assert.equal(Journal.entries(Story.restore(progress)).some(x=>x.id==='streetDrain'),false);
 for(let n=0;n<110;n++)Story.step(state,1/60,{});
 assert.equal(state.drainCleared,true);
 const rows=Journal.entries(state),row=rows.find(x=>x.id==='streetDrain');
 assert.ok(row&&row.unlocked);
 assert.match(row.detail,/현장에서 직접 치웠다/);
 assert.match(row.detail,/젖은 노면은 남아/);
 assert.doesNotMatch(row.detail,/완전히 복구|도시 전체.*복구/);
 const finished=Story.serialize(state),restored=Story.restore(finished);
 assert.equal(Story.serialize(restored),finished);
 assert.equal(Journal.entries(restored).find(x=>x.id==='streetDrain').detail,row.detail);
 assert.ok(Object.isFrozen(rows)&&rows.every(Object.isFrozen));
 assert.equal(Story.serialize(state),finished,'reading the diary never mutates the saved world');
 assert.notEqual(initial,finished);
});
test('CH01 civic crossing journal separates an earned on-site conversation from a physically completed pedestrian crossing',()=>{
 const state=Story.createState(),before=Story.serialize(state);
 assert.equal(Journal.entries(state).some(x=>x.id==='civicCrossing'),false);
 state.phase='records';
 // This is the actual authored civilian pedestrian's 60Hz controller,
 // not a synthetic teleport or a status flag awarded by the UI.
 state.civicCrossing=Civic.step(state.civicCrossing,{
  disruption:true,assist:true,player:{x:Civic.CROSSING.x,z:Civic.CROSSING.z}});
 assert.equal(state.civicCrossing.assisted,true);
 assert.equal(Story.civicCrossingReached(state),false);
 let journal=Journal.entries(state).find(x=>x.id==='civicCrossing');
 assert.ok(journal);
 assert.match(journal.detail,/도착은 아직 확인되지 않았다/);
 const away={x:-8,z:0};
 let steps=0;
 while(!Story.civicCrossingReached(state)&&steps<600){
  state.civicCrossing=Civic.step(state.civicCrossing,{player:away});
  steps++;
 }
 assert.ok(steps>120&&steps<600);
 assert.equal(Story.civicCrossingReached(state),true);
 journal=Journal.entries(state).find(x=>x.id==='civicCrossing');
 assert.match(journal.detail,/한 명이 실제로 건너편 보행로에 도착/);
 assert.match(journal.detail,/다른 인원의 상황은 미확인/);
 assert.equal(Journal.entries({...state,civicCrossing:null}).some(x=>x.id==='civicCrossing'),false,
  'an absent old-checkpoint optional NPC never manufactures a positive report');
 assert.ok(before.length>0);
});
