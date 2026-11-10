'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const at=(s,p)=>{s.world.player.x=p.x;s.world.player.z=p.z;};
function route(choice){
 const s=Story.createState();
 at(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const enemy of s.world.bots){enemy.alive=false;enemy.health=0;}
 s.combat.cleared=true;s.phase='records';
 at(s,Story.POINTS.decision);
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,choice).ok,true);
 return s;
}
test('CH01 south exit never invents a civilian headcount or a remotely heard coordinator',()=>{
 const s=route('evacuation');
 assert.equal(s.musterConfirmed,false);
 at(s,Story.POINTS.exitEvac);
 assert.equal(Story.interact(s).phase,'complete');
 assert.equal(s.world.status,'won');
 assert.match(s.subtitle,/안뜰에 실제로 도착/);
 assert.match(s.subtitle,/아직 확인하지 못했다/);
 assert.doesNotMatch(s.subtitle,/대피 인원을 확인했어|유수프:/);
 const loaded=Story.restore(Story.serialize(s));
 assert.equal(loaded.phase,'complete');
 assert.equal(loaded.world.status,'won');
 assert.equal(loaded.subtitle,s.subtitle,'the completed V2 save reconstructs only its witnessed evidence');
});
test('real in-person muster consultation changes CH01 closing line without unlocking a new task',()=>{
 const s=route('evacuation');
 s.musterConfirmed=true;
 at(s,Story.POINTS.exitEvac);
 assert.equal(Story.interact(s).phase,'complete');
 assert.match(s.subtitle,/구조단 담당자와 직접 협의/);
 assert.match(s.subtitle,/확인되지 않은 주민/);
 assert.equal(Story.debrief(s).campaignUnlocked,false);
 const loaded=Story.restore(Story.serialize(s));
 assert.equal(loaded.phase,'complete');
 assert.equal(loaded.musterConfirmed,true,'witnessed coordinator evidence survives V2 restore');
 assert.equal(loaded.subtitle,s.subtitle,'the in-person consultation remains reflected in the restored recap');
});
test('verified east passage reports only its physically opened corridor, not unseen paperwork',()=>{
 const s=route('verification');
 at(s,Story.POINTS.exitVerify);
 assert.equal(Story.interact(s).ok,false);
 for(let i=0;i<600;i++)Story.step(s,1/60,{});
 at(s,Story.POINTS.exitVerify);
 assert.equal(Story.interact(s).phase,'complete');
 assert.equal(s.world.status,'won');
 assert.match(s.subtitle,/동쪽 통로가 실제로 열렸다/);
 assert.match(s.subtitle,/원인은 아직 확인되지 않았다/);
 assert.doesNotMatch(s.subtitle,/나디아:/);
});
