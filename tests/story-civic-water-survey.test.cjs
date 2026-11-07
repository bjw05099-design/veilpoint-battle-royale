'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
function afterEncounter(){
 const s=Story.createState(),p=s.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('Aden-inspired arcade retains physically solid water infrastructure without busywork markers',()=>{
 const s=afterEncounter(),p=s.world.player;
 p.x=77;p.z=122;Story.step(s,1/60,{});
 assert.equal(s.civicVisited,true);
 const objects=s.world.obstacles.filter(o=>o.type==='aden-arcade-water');
 assert.equal(objects.length,1);
 for(const o of objects)assert.equal(Sim.blocked(o.x,o.z,.85,s.world.obstacles),true);
 assert.equal(Object.hasOwn(Story.POINTS,'waterSite'),false);
 assert.equal(Object.hasOwn(Story.POINTS,'waterReportDesk'),false);
 assert.equal(Story.markers(s).some(m=>m.id==='waterSite'||m.id==='waterReportDesk'),false);
 p.x=140;p.z=87;assert.equal(Story.nearest(s)?.id==='waterSite',false);
 assert.equal(s.waterSurveyed,false);
 assert.equal(s.waterReportFiled,false);
 const one=Story.serialize(s),restored=Story.restore(one);
 assert.equal(Story.serialize(restored),one,'unchanged checkpoint contract');
});
test('previously collected optional water records remain readable but never spawn new errands',()=>{
 const s=afterEncounter();
 s.world.player.x=77;s.world.player.z=122;Story.step(s,1/60,{});
 s.waterSurveyed=true;s.waterReportFiled=true;
 const archived=Story.serialize(s),old=Story.restore(archived);
 assert.equal(old.waterSurveyed,true);assert.equal(old.waterReportFiled,true);
 assert.equal(Story.serialize(old),archived);
 assert.equal(Story.markers(old).some(m=>m.id==='waterSite'||m.id==='waterReportDesk'),false);
 const previous=JSON.parse(archived);delete previous.waterSurveyed;delete previous.waterReportFiled;
 assert.equal(Story.restore(JSON.stringify(previous)).waterReportFiled,false);
 for(const forged of [1,'true',null]){
  assert.throws(()=>Story.restore(JSON.stringify({...previous,waterSurveyed:forged})),/checkpoint/i);
  assert.throws(()=>Story.restore(JSON.stringify({...previous,waterReportFiled:forged})),/checkpoint/i);
 }
 assert.throws(()=>Story.restore(JSON.stringify({...previous,waterSurveyed:false,waterReportFiled:true})),
  /checkpoint/i);
});
