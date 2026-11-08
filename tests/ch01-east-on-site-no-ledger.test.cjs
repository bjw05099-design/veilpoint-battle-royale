'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const go=(s,point)=>{s.world.player.x=point.x;s.world.player.z=point.z;};
function afterDisruption(){
 const s=Story.createState();
 go(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const bot of s.world.bots){bot.alive=false;bot.health=0;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('east passage selection is a physical local gate request, not a mandatory two-record fetch',()=>{
 const s=afterDisruption();
 assert.deepEqual(s.found,[]);
 assert.equal(s.deploymentReviewed,false);
 go(s,Story.POINTS.decision);
 assert.equal(Story.interact(s).phase,'decision');
 const chosen=Story.choose(s,'verification');
 assert.deepEqual(chosen,{ok:true,event:'choice',choice:'verification'});
 assert.equal(s.phase,'exit');
 assert.deepEqual(s.found,[]);
 assert.equal(s.relayRestored,false,'field request does not forge a radio repair');
 assert.equal(s.gateLogReviewed,false,'no invented evidence');
 assert.equal(Story.missionTasks(s).find(t=>t.id==='evidence').optional,true);
 const raw=Story.serialize(s),resumed=Story.restore(raw);
 assert.equal(Story.serialize(resumed),raw,'checkpoint format must remain compatible');
 go(resumed,Story.POINTS.exitVerify);
 assert.deepEqual(Story.interact(resumed),{ok:false,reason:'awaiting_clearance'});
 assert.equal(resumed.phase,'exit');
 // Ordinary 60Hz time and physical motor movement remain necessary.
 for(let i=0;i<550;i++)Story.step(resumed,1/60,{});
 assert.equal(Story.situation(resumed).eastGateOpen,true);
 go(resumed,Story.POINTS.exitVerify);
 assert.equal(Story.interact(resumed).phase,'complete');
 const report=Story.debrief(resumed);
 assert.equal(report.clockDiscrepancy,'unresolved');
 assert.equal(report.gateLogReviewed,false);
 assert.equal(report.logHandedOff,false);
});
test('existing record-gathering route and legacy checkpoints continue to load',()=>{
 const s=afterDisruption();
 for(const id of ['recordA','recordB']){
  go(s,Story.POINTS[id]);assert.equal(Story.interact(s).ok,true);
 }
 go(s,Story.POINTS.decision);Story.interact(s);
 assert.equal(Story.choose(s,'verification').ok,true);
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 assert.deepEqual(restored.found,['recordA','recordB']);
 const old=Story.restore(JSON.stringify({
  version:1,phase:'records',found:[],choice:null,
  player:{x:0,z:-41,yaw:0,pitch:0,stamina:100},elapsed:12
 }));
 assert.equal(old.phase,'records');
 assert.deepEqual(old.found,[]);
});
test('PC dialog enables physical east route without forcing document count',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 const logic=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(ui,/\$\('choiceVerified'\)\.disabled=false/);
 assert.match(ui,/기록 검토는 선택 사항/);
 assert.doesNotMatch(logic,/choice==='verification'&&state\.found\.length!==2/);
 assert.doesNotMatch(logic,/data\.choice==='verification'&&data\.found\.length!==2/);
});
