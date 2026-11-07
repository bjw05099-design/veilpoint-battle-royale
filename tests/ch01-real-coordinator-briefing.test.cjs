'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const fs=require('node:fs'),path=require('node:path');
function evacuation(){
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';
 return state;
}
test('CH01 south muster is a physically reached coordinator conversation, not a form inspection',()=>{
 const s=evacuation();
 const mark=Story.POINTS.muster;
 assert.equal(mark.kind,'evac');
 assert.match(mark.label,/구조단.*담당자/);
 assert.doesNotMatch(mark.label,/계획표|확인표|기록서/);
 assert.equal(s.musterConfirmed,false);
 assert.ok(Story.markers(s).some(m=>m.id==='muster'));
 s.world.player.x=mark.x;s.world.player.z=mark.z;
 const action=Story.interact(s);
 assert.equal(action.ok,true);
 assert.equal(action.event,'muster');
 assert.equal(s.musterConfirmed,true,'the local conversation unlocks further civilian assistance');
 assert.match(s.subtitle,/유수프/);
 assert.match(s.subtitle,/직접 인수/);
 assert.doesNotMatch(s.subtitle,/확인표|계획표/);
 assert.ok(Story.markers(s).some(m=>m.id==='guide'),'real guide is available after meeting coordinator');
 const notes=Journal.entries(s);
 const fact=notes.find(n=>n.id==='muster');
 assert.ok(fact);
 assert.match(fact.detail,/직접 협의/);
 assert.doesNotMatch(fact.detail,/인원 수 확정/);
 assert.equal(Story.restore(Story.serialize(s)).musterConfirmed,true,
   'older checkpoint field and the real escort unlock remain compatible');
});
test('CH01 scene retains no paperwork-only transit marker or remote headcount',()=>{
 const body=fs.readFileSync(path.join(__dirname,'../src/story-slice.js'),'utf8');
 const journal=fs.readFileSync(path.join(__dirname,'../src/field-journal.js'),'utf8');
 assert.doesNotMatch(body,/POINTS\.transitBoard|marker\.id==='transitBoard'/);
 assert.doesNotMatch(body,/집결지 인원 확인표|근처 인원 확인표/);
 assert.doesNotMatch(journal,/인원 확인표를 현장에서 직접 대조/);
});
