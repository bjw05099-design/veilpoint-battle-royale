'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const go=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
function readyRoute(route){
 const s=Story.createState();
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).phase,'engagement');
 // An isolated post-encounter movement fixture; no fake success recorded as a save.
 for(const b of s.world.bots){b.alive=false;b.health=0;}
 s.combat.cleared=true;s.phase='records';
 go(s,Story.POINTS.decision.x,Story.POINTS.decision.z);
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,route).ok,true);
 return s;
}
function walkSouth(s){
 go(s,0,-57);s.world.player.yaw=0;
 for(let n=0;n<120&&s.phase==='exit';n++)Story.step(s,1/60,{forward:true});
}
test('CH01 actual on-foot south arrival closes the short preview without an invisible E completion switch',()=>{
 const s=readyRoute('evacuation');
 assert.equal(s.musterConfirmed,false,'optional coordinator chat is not a paper gate');
 assert.deepEqual(s.found,[],'optional evidence remains optional');
 walkSouth(s);
 assert.equal(s.phase,'complete');
 assert.equal(s.world.status,'won');
 assert.match(s.subtitle,/남쪽 안뜰에 실제로 도착/);
 assert.match(s.subtitle,/아직 확인하지 못했다/,
  'walking to the exit cannot fabricate a coordinator headcount');
 assert.ok(s.world.player.z<=-65.5,
  'the player must travel beyond the staffed southern exit, not merely approach a mission icon');
 const elapsed=s.world.elapsed;
 Story.step(s,1/60,{forward:true});
 assert.equal(s.world.elapsed,elapsed,'terminal state cannot keep changing on 60Hz ticks');
});
test('CH01 physical corridor does not accept teleports, carried cargo or unfinished voluntary escort',()=>{
 const already=readyRoute('evacuation');
 go(already,0,-61);
 Story.step(already,1/60,{});
 assert.equal(already.phase,'exit','saved/teleported coordinate by itself cannot forge a crossing');
 assert.equal(Story.interact(already).phase,'complete','existing E interaction remains valid');
 const cargo=readyRoute('evacuation');
 cargo.aidPickedUp=true;cargo.world.carryingAid=true;
 walkSouth(cargo);
 assert.equal(cargo.phase,'exit','carrying a real crate still prevents corridor completion');
 const companion=readyRoute('evacuation');
 companion.musterConfirmed=true;companion.guide.active=true;companion.guide.arrived=false;
 walkSouth(companion);
 assert.equal(companion.phase,'exit','a genuinely accepted civilian companion cannot be abandoned');
});
test('CH01 east passage completes only after existing physically controlled clearance and movement',()=>{
 const s=readyRoute('verification');
 go(s,27,-57);s.world.player.yaw=0;
 for(let n=0;n<60*9;n++)Story.step(s,1/60,{});
 assert.equal(s.phase,'exit');
 assert.equal(Story.situation(s).eastGateOpen,true,'real 60Hz gate clearance must finish');
 // Visiting the cabinet at x=27,z=-66 must remain optional, rather
 // than accidentally finishing the mission as the actor walks there.
 go(s,27,-61);s.world.player.yaw=Math.PI/2;
 for(let n=0;n<120&&s.phase==='exit';n++)Story.step(s,1/60,{forward:true});
 assert.equal(s.phase,'complete');
 assert.ok(s.world.player.x>=33.5,'the east route is a distinct physical exit');
 assert.equal(s.choice,'verification');
});
test('browser completion presentation is wired to both interaction and real fixed-step arrival',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(source,/function presentCompletion\(\)/);
 assert.match(source,/const completeBefore=state\.phase==='complete'/);
 assert.match(source,/if\(running&&!completeBefore&&state\.phase==='complete'\)/);
 assert.match(source,/persist\('현장 실제 도착'\)/);
 assert.match(source,/recordCompletion\(\)/);
});