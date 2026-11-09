'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');
const Comms=require('../src/story-comms.js');
const fs=require('node:fs'),path=require('node:path');

const marketStart={x:19.5,z:-35},marketEnd={x:25,z:-39.5};
const walk=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
function afterEscalation(){
 const s=Story.createState();walk(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const bot of s.world.bots){bot.alive=false;bot.health=0;}
 s.combat.cleared=true;s.phase='records';
 Story.step(s,1/60,{});
 return s;
}
test('Mara is a real public actor from the opening and no compulsory marker or remote task',()=>{
 const initial=Story.createState();
 assert.deepEqual(initial.mara,{...marketStart,arrived:false});
 assert.equal(initial.world.mara.role,'mara');
 assert.equal(Sim.blocked(marketStart.x,marketStart.z,.55,initial.world.obstacles),false);
 assert.ok(!Story.markers(initial).some(m=>m.id==='mara'));
 const s=afterEscalation();
 const before={...s.mara};
 for(let i=0;i<150;i++)Story.step(s,1/60,{});
 assert.deepEqual(s.mara,before,'civilian does not magically escape while the awning is still blocking the street');
 assert.ok(!Story.markers(s).some(m=>m.id==='mara'),
   'civilian's own judgment does not create escort or checklist tasks');
});
test('optional physical awning actually opens market passage for a self-directed 60Hz civilian walk',()=>{
 const s=afterEscalation();
 walk(s,20.5,-38);
 const start=Story.interact(s);
 assert.equal(start.event,'awning_clear_started');
 let frames=0;
 while(s.awningShift<1&&frames++<300)Story.step(s,1/60,{});
 assert.equal(s.awningShift,1,'actual clearance completes in a few seconds of local interaction');
 assert.equal(s.awningWorking,false);
 assert.ok(s.mara.x>=marketStart.x&&s.mara.z<=marketStart.z);
 let maxStep=0;
 while(!s.mara.arrived&&frames++<1200){
  const old={x:s.mara.x,z:s.mara.z};
  Story.step(s,1/60,{});
  maxStep=Math.max(maxStep,Math.hypot(s.mara.x-old.x,s.mara.z-old.z));
  assert.equal(Sim.blocked(s.mara.x,s.mara.z,.55,s.world.obstacles),false,
    'every voluntary walking tick stays outside solid buildings and the shifted awning');
  assert.equal(s.world.mara.x,s.mara.x);
  assert.equal(s.world.mara.z,s.mara.z);
 }
 assert.equal(s.mara.arrived,true,'market passage must yield one real physically arriving person');
 assert.deepEqual({x:s.mara.x,z:s.mara.z},marketEnd);
 assert.ok(maxStep<=1.05/60+.03,'no teleporting jump during authored pedestrian movement');
 assert.equal(s.choice,null,'independent civilian cannot grant checkpoint or evacuation completion');
 assert.deepEqual(s.found,[],'no new paper pickup or mandatory investigation');
});
test('mid-walk and historic CH01 checkpoint both restore safely, preserving personal agency',()=>{
 const s=afterEscalation();
 s.awningShift=1;s.awningWorking=false;
 Story.step(s,1/60,{});
 const saved=Story.serialize(s);
 const loaded=Story.restore(saved);
 assert.equal(Story.serialize(loaded),saved);
 assert.equal(loaded.world.mara.role,'mara');
 assert.equal(loaded.mara.x,s.mara.x);
 assert.equal(loaded.mara.z,s.mara.z);
 const older=JSON.parse(saved);delete older.mara;
 const compatible=Story.restore(JSON.stringify(older));
 assert.deepEqual(compatible.mara,{...marketStart,arrived:false},
   'older v2 does not invent an already completed civilian crossing');
 assert.equal(Story.serialize(Story.restore(Story.serialize(compatible))),
   Story.serialize(compatible));
 for(const forged of [{x:25,z:-35,arrived:true},{x:19.5,z:-35,arrived:true},
   {x:500,z:-35,arrived:false}]){
  const bad={...JSON.parse(saved),mara:forged};
  assert.throws(()=>Story.restore(JSON.stringify(bad)),/checkpoint|invalid|Unknown/i);
 }
});
test('line of sight and proximity govern Mara display and local testimony, never distant omniscience',()=>{
 const s=afterEscalation();
 walk(s,marketStart.x,marketStart.z+5);
 s.world.player.yaw=0;
 const visible=Visibility.planVisible(s.world,16/9);
 assert.ok(visible.witnesses.some(p=>p.entity.role==='mara'),
   'market resident is actually rendered in the player camera');
 const wall={x:marketStart.x,z:marketStart.z+2.2,w:2,d:.9,h:3};
 s.world.obstacles.push(wall);
 assert.equal(Visibility.planVisible(s.world,16/9).witnesses.some(p=>
    p.entity.role==='mara'),false,'solid wall conceals civilian');
 s.world.obstacles.pop();
 s.awningShift=1;s.mara={...marketEnd,arrived:true};s.world.mara={...s.mara,role:'mara'};
 walk(s,marketEnd.x,marketEnd.z+2);
 const line=Comms.localCharacterBeat(s);
 assert.equal(line.speaker,'마라');
 assert.match(line.message,/제 판단/);
 walk(s,140,140);
 assert.notEqual(Comms.localCharacterBeat(s)?.message,line.message,
   'the captain cannot quote a nearby civilian from the other side of the city');
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/type:'market-resident'/);
 assert.match(renderer,/marketResident=w\.role==='mara'/);
});
