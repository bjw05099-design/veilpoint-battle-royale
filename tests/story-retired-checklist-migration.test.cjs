'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const Comms=require('../src/story-comms.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function evacuating(){
 return Story.restore(JSON.stringify({version:1,phase:'exit',found:[],choice:'evacuation',
  player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12}));
}
test('CH01 removes the artificial transit document and keeps physically meaningful evacuation choices',()=>{
 const s=evacuating();
 assert.equal(Story.POINTS.transitBoard,undefined);
 assert.equal(s.transitReviewed,undefined);
 assert.deepEqual(Story.missionTasks(s).map(t=>t.id),['muster','guide','aid','exit']);
 assert.equal(Story.markers(s).some(m=>m.id==='transitBoard'),false);
 go(s,'muster');
 assert.equal(Story.interact(s).event,'muster');
 assert.equal(Story.markers(s).some(m=>m.id==='transitBoard'),false);
 assert.equal(Story.missionTasks(s).some(t=>t.id==='transit'),false);
 assert.equal(Journal.entries(s).some(e=>e.id==='transit'),false);
 assert.doesNotMatch(Comms.briefing(s).message,/이동 계획표|통행 계획표/);
 // A player may still directly help a real escort or carry finite aid.
 assert.equal(Story.interact(s).event,'guide');
 assert.equal(s.guide.active,true);
 assert.equal(Story.optionalTaskAudit(s).total,3);
 assert.equal(Object.hasOwn(JSON.parse(Story.serialize(s)),'transitReviewed'),false,
  'no retired checklist data is emitted by new CH01 saves');
});
test('previous v2 saves with valid obsolete board flag migrate without losing escort, aid or movement',()=>{
 const s=evacuating();go(s,'muster');Story.interact(s);Story.interact(s);
 const current=JSON.parse(Story.serialize(s));
 const historic={...current,transitReviewed:true};
 const restored=Story.restore(JSON.stringify(historic));
 assert.equal(restored.transitReviewed,undefined);
 assert.equal(restored.musterConfirmed,true);
 assert.equal(restored.guide.active,true);
 assert.equal(restored.world.player.x,s.world.player.x);
 assert.equal(restored.world.player.z,s.world.player.z);
 assert.equal(restored.world.player.charges,s.world.player.charges);
 assert.equal(restored.world.elapsed,s.world.elapsed);
 assert.equal(Story.serialize(restored),JSON.stringify(current),
   'only the removed optional checklist flag disappears from checkpoint');
 const reloaded=Story.restore(Story.serialize(restored));
 assert.equal(reloaded.guide.active,true);
 assert.equal(Story.markers(reloaded).some(m=>m.id==='transitBoard'),false);
 const historicFalse={...current,transitReviewed:false};
 assert.equal(Story.serialize(Story.restore(JSON.stringify(historicFalse))),JSON.stringify(current));
});
test('retired field is accepted only for valid historical checkpoints, never as a forged mission success',()=>{
 const early=JSON.parse(Story.serialize(Story.createState()));
 early.transitReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(early)),RangeError);
 const state=evacuating(),saved=JSON.parse(Story.serialize(state));
 saved.transitReviewed=true;
 assert.throws(()=>Story.restore(JSON.stringify(saved)),RangeError);
 saved.transitReviewed='yes';
 assert.throws(()=>Story.restore(JSON.stringify(saved)),RangeError);
 const source=fs.readFileSync(path.join(__dirname,'../src/story-slice.js'),'utf8');
 const journal=fs.readFileSync(path.join(__dirname,'../src/field-journal.js'),'utf8');
 const comms=fs.readFileSync(path.join(__dirname,'../src/story-comms.js'),'utf8');
 assert.doesNotMatch(source,/transitBoard|대피 통행 계획표|대피 통행 계획표 확인/);
 assert.doesNotMatch(journal,/transitReviewed|대피 통행 계획표/);
 assert.doesNotMatch(comms,/transitReviewed|이동 계획표/);
});
