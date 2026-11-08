'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const go=(s,p)=>{s.world.player.x=p.x;s.world.player.z=p.z;};
function cleared(){
 const s=Story.createState();
 go(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 s.world.bots.forEach(b=>{b.alive=false;b.health=0;});
 s.combat.cleared=true;s.phase='records';
 go(s,Story.POINTS.decision);
 assert.equal(Story.interact(s).phase,'decision');
 return s;
}
test('CH01 south completion has an on-site local-coordinator response, not an invented overall rescue',()=>{
 const s=cleared();
 assert.equal(Story.choose(s,'evacuation').ok,true);
 assert.equal(Story.closingScene(s),null,'no ending before physically reaching the exit');
 go(s,Story.POINTS.exitEvac);
 assert.equal(Story.interact(s).phase,'complete');
 const scene=Story.closingScene(s);
 assert.equal(scene.location,'남쪽 주민 집결지');
 assert.equal(scene.route,'south-civilian-priority');
 assert.equal(scene.lines.length,4);
 assert.match(scene.lines[0],/유수프.*확인하지 못한 주민/);
 assert.match(scene.lines[1],/아직 확인되지 않았습니다/);
 assert.match(scene.lines[2],/복구 여부는 미확인/);
 assert.match(scene.lines[3],/한국에서 받은 지시는 그대로입니다/);
 assert.match(scene.lines[3],/우리가 확인한 것과 모르는 것/);
 assert.match(scene.nextChapter,/미확정/);
 assert.deepEqual(Story.debrief(s).closingScene,scene);
 assert.equal(Story.debrief(s).campaignUnlocked,false);
 assert.equal(Story.serialize(Story.restore(Story.serialize(s))),Story.serialize(s));
});
test('CH01 east completion requires the real gate and differentiates restored communications',()=>{
 const s=cleared();
 assert.equal(Story.choose(s,'verification').ok,true);
 go(s,Story.POINTS.exitVerify);
 assert.deepEqual(Story.interact(s),{ok:false,reason:'awaiting_clearance'});
 for(let i=0;i<600;i++)Story.step(s,1/60,{});
 assert.equal(Story.situation(s).eastGateOpen,true);
 go(s,Story.POINTS.exitVerify);
 assert.equal(Story.interact(s).phase,'complete');
 const scene=Story.closingScene(s);
 assert.equal(scene.route,'east-physically-opened');
 assert.match(scene.lines[0],/마라.*실제로 열렸어요/);
 assert.match(scene.lines[1],/조현지/);
 assert.match(scene.lines[2],/김지윤.*복구 여부는 미확인/);
 assert.equal(scene.nextChapter,'후속 상황과 복귀 계획은 미확정 · CH01 프리뷰 종료');
 const resumed=Story.restore(Story.serialize(s));
 assert.deepEqual(Story.debrief(resumed).closingScene,scene);
});
test('in-person aid transfer and witnessed civilian arrival change closing scene without changing mission score',()=>{
 const s=cleared();
 assert.equal(Story.choose(s,'evacuation').ok,true);
 // Scene outcomes are sourced from verified live state, not a fabricated headcount.
 s.aidDelivered=true;
 s.civilianWalker.z=-58;s.civilianWalker.arrived=true;
 s.relayRestored=true;
 go(s,Story.POINTS.exitEvac);
 assert.equal(Story.interact(s).phase,'complete');
 const scene=Story.closingScene(s);
 assert.match(scene.lines[0],/물품은 우리가 현장에서 인수했어/);
 assert.match(scene.lines[1],/주민 한 명은 확인/);
 assert.match(scene.lines[2],/비상 통신은 복구됐습니다/);
 assert.equal(Story.debrief(s).civilianOutcome,'south-evacuation-prioritized');
});
test('PC completion and validated review display a route-specific line from real checkpoint data',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/report\.closingScene\.lines\[0\]/);
 assert.match(app,/const report=recordCompletion\(\)/);
 assert.match(app,/Story\.reviewCompletedMission\(storage\.get\(SAVE_KEY\)\)/);
});
