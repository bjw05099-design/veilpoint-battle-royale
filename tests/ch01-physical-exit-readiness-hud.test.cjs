'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
function readyForRoute(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 // Fixture starts from a genuinely completed encounter; no live player
 // can manufacture this shortcut, and source validation still protects saves.
 for(const bot of s.world.bots){bot.alive=false;bot.health=0;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
function place(state,point){
 state.world.player.x=point.x;state.world.player.z=point.z;
}
function evacuation(){
 const s=readyForRoute();
 place(s,Story.POINTS.coordinatorRequest);
 const outcome=Story.interact(s);
 assert.equal(outcome.phase,'exit');assert.equal(s.choice,'evacuation');
 return s;
}
function verification(){
 const s=readyForRoute();
 place(s,Story.POINTS.decision);
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,'verification').ok,true);
 assert.equal(s.phase,'exit');
 return s;
}
test('CH01 south exit shares ONE physical cargo/guide readiness decision across mission tracker and HUD',()=>{
 const s=evacuation();
 const initial=Story.exitReadiness(s);
 assert.deepEqual(initial,{ready:true,reason:'south_clear',label:'남쪽 안뜰 출구 직접 통과 가능'});
 assert.equal(Story.missionTasks(s).find(t=>t.id==='exit').status,'available');
 assert.deepEqual(Story.situation(s).exitReadiness,initial);
 assert.match(Story.objective(s),/걸어서 통과/);
 assert.doesNotMatch(Story.objective(s),/E를 누르세요/);
 s.world.carryingAid=true;
 assert.equal(Story.exitReadiness(s).reason,'aid_in_hands');
 assert.equal(Story.missionTasks(s).find(t=>t.id==='exit').status,'blocked');
 assert.match(Story.situation(s).exitReadiness.label,/물품.*인계/);
 s.world.carryingAid=false;
 s.guide.active=true;
 assert.equal(Story.exitReadiness(s).reason,'guide_en_route');
 assert.equal(Story.missionTasks(s).find(t=>t.id==='exit').status,'blocked');
 s.guide.waiting=true;
 assert.equal(Story.exitReadiness(s).reason,'guide_waiting');
 assert.match(Story.exitReadiness(s).label,/F로 재개/);
 s.guide.waiting=false;s.guide.arrived=true;
 assert.equal(Story.exitReadiness(s).ready,true,
  'physical civilian arrival unblocks south passage even if escort remains active');
 s.guide.arrived=false;s.guide.active=false;s.guide.released=true;
 assert.equal(Story.exitReadiness(s).ready,true,
  'actual staffed release does not impose a second artificial escort task');
});
test('CH01 east route cannot mark access available before actual gate time or while a safety stop is active',()=>{
 const s=verification();
 assert.equal(Story.exitReadiness(s).ready,false);
 assert.equal(Story.exitReadiness(s).reason,'gate_opening');
 assert.equal(Story.missionTasks(s).find(t=>t.id==='exit').status,'blocked');
 s.gateObstructed=true;
 assert.equal(Story.exitReadiness(s).reason,'gate_safety_stop');
 assert.match(Story.situation(s).exitReadiness.label,/이동 경로에서 벗어나/);
 s.gateObstructed=false;s.world.elapsed=s.gateReadyAt;
 assert.equal(Story.exitReadiness(s).ready,true);
 assert.equal(Story.missionTasks(s).find(t=>t.id==='exit').status,'available');
 assert.match(Story.objective(s),/걸어서 통과/);
 // Old routes and true 60Hz-world gate phase remain unchanged by inspection.
 assert.equal(s.choice,'verification');
});
test('read-only readiness never invents inventory, time, escort arrival or a new v2 checkpoint field',()=>{
 const s=evacuation(),before=Story.serialize(s);
 for(let i=0;i<20;i++){
  Story.exitReadiness(s);Story.missionTasks(s);Story.situation(s);
 }
 assert.equal(Story.serialize(s),before);
 const restored=Story.restore(before);
 assert.equal(Story.serialize(restored),before);
 assert.equal(Story.exitReadiness(restored).ready,true);
 const fresh=Story.createState();
 assert.equal(Story.exitReadiness(fresh).reason,'route_not_selected');
 assert.equal(Story.exitReadiness(fresh).ready,false);
 assert.deepEqual(Story.missionTasks(fresh),[]);
});
test('physical threshold and PC UI use the same read-only rule rather than false finished labels',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(src,/if\(crossed&&movedDistance>1e-7&&exitReadiness\(state\)\.ready&&/);
 assert.match(src,/item\('exit','남쪽 안뜰 도착',completed\?'done':\s*exitReadiness\(state\)\.ready/);
 assert.match(src,/item\('exit','동쪽 통로 이동',completed\?'done':\s*exitReadiness\(state\)\.ready/);
 assert.match(app,/const situation=Story\.situation\(state\)/);
 assert.match(app,/primary\.status==='blocked'&&situation\.exitReadiness\?\.label/);
 assert.match(src,/function exitReadiness\(state\)/);
 assert.doesNotMatch(Story.objective(verification()),/E를 누르세요/);
});
