'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
function afterEncounter(){
 const s=Story.createState();
 s.phase='records';s.combat.started=true;s.combat.cleared=true;
 for(const bot of s.world.bots){bot.alive=false;bot.health=0;}
 return s;
}
test('CH01 real physical approach offers meaningful local choice without prior paper investigation',()=>{
 const s=afterEncounter();
 s.world.player.x=0;s.world.player.z=-33.5;s.world.player.yaw=0;
 assert.equal(s.phase,'records');
 assert.deepEqual(s.found,[]);
 for(let i=0;i<90&&s.phase==='records';i++)Story.step(s,1/60,{forward:true});
 assert.equal(s.phase,'decision');
 assert.match(s.subtitle,/기록 조사는 필수가 아닙니다/);
 assert.deepEqual(s.found,[]);
 assert.equal(s.deploymentReviewed,false,'predeparture mandate stays known before arrival');
 assert.equal(Story.choose(s,'evacuation').ok,true);
 assert.equal(s.phase,'exit');
 const restored=Story.restore(Story.serialize(s));
 assert.equal(restored.phase,'exit');
 assert.equal(restored.choice,'evacuation');
 assert.deepEqual(restored.found,[]);
});
test('CH01 position restore, waiting, frozen time and arbitrary remote E cannot forge a route choice',()=>{
 const s=afterEncounter();
 s.world.player.x=Story.POINTS.decision.x;
 s.world.player.z=Story.POINTS.decision.z;
 for(let i=0;i<80;i++)Story.step(s,1/60,{});
 assert.equal(s.phase,'records','being restored inside a physical area is not a crossing');
 assert.equal(Story.interact(s).phase,'decision','historic E route remains valid');
 assert.equal(Story.choose(s,'verification').ok,true);
 assert.equal(s.phase,'exit');
 const other=afterEncounter();
 other.world.player.x=100;other.world.player.z=100;other.world.player.yaw=0;
 for(let i=0;i<100;i++)Story.step(other,1/60,{forward:true});
 assert.equal(other.phase,'records','remote running is not arrival');
 const paused=afterEncounter();
 paused.world.player.x=0;paused.world.player.z=-33.5;
 Story.step(paused,0,{forward:true});
 assert.equal(paused.phase,'records');
});
test('CH01 PC controller persists and presents actual route arrival using existing focused choice dialog',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/const recordsBefore=state\.phase==='records'/);
 assert.match(app,/if\(running&&recordsBefore&&state\.phase==='decision'\)/);
 assert.match(app,/persist\('현장 경로 분기 도착'\)/);
 assert.match(app,/showChoices\(\)/);
 assert.match(app,/if\(state\.phase==='decision'\)return;/);
});
