'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const Visibility=require('../src/visibility.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function evacuation(){
 const state=Story.createState();go(state,'terminal');
 assert.equal(Story.interact(state).ok,true);
 for(const person of state.world.bots)for(let i=0;i<2;i++){
  state.world.player.yaw=Math.atan2(person.x-state.world.player.x,
    -(person.z-state.world.player.z));
  state.world.player.pitch=0;state.world.elapsed+=.21;
  assert.equal(Story.fire(state).hit,true);
 }
 assert.equal(state.phase,'records');
 go(state,'decision');assert.equal(Story.interact(state).ok,true);
 assert.equal(Story.choose(state,'evacuation').ok,true);
 return state;
}
test('one local civilian driver request starts an observable vehicle rather than duplicate interviews',()=>{
 const s=evacuation();
 assert.equal(s.transportContact,0);
 assert.equal(Story.markers(s).some(p=>p.id==='transportDriver'),true);
 assert.equal(Story.interact(s).ok,false,'no long-distance dispatch');
 go(s,'transportDriver');
 assert.equal(Story.nearest(s).id,'transportDriver');
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.transportContact,1);
 assert.ok(s.transportVan&&!s.transportVan.arrived);
 assert.equal(Story.markers(s).some(m=>m.id==='transportDriver'),false);
 assert.equal(Journal.entries(s).some(m=>m.id==='transport'),true);
 assert.match(Journal.entries(s).find(m=>m.id==='transport').detail,/접근 중/);
 const inTransit=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(inTransit)),inTransit);
 s.world.player.x=0;s.world.player.z=-54;
 for(let i=0;i<2100&&!s.transportVan.arrived;i++)Story.step(s,1/60,{});
 assert.equal(s.transportContact,2);
 assert.equal(s.transportVan.arrived,true);
 assert.equal(Story.markers(s).some(m=>m.id==='transportDriver'),false);
 assert.equal(s.world.witness,null,'new driver is physically inside the arrived vehicle, not a ghost at the old staff post');
 assert.equal(Story.missionTasks(s).some(t=>t.id==='driver'),false,
   'vehicle progress does not become a compulsory document checklist');
 assert.match(Journal.entries(s).find(t=>t.id==='transport').detail,/승차 지점에 도착/);
 const done=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(done)),done);
});
test('the witness is an actual locally visible solid human and never an unseen world map marker',()=>{
 const s=evacuation(),npc=s.world.witness;
 assert.deepEqual(npc,{x:10,z:-54});
 s.world.player.x=10;s.world.player.z=-58;s.world.player.yaw=Math.PI;
 const view=Visibility.planVisible(s.world,16/9);
 assert.ok(view.witnesses.some(item=>item.entity===npc),
  'the original human driver remains visible beside another independently moving resident');
 for(let i=0;i<60;i++)Story.step(s,1/60,{forward:true});
 assert.ok(s.world.player.z < -55,
  'the player must not walk straight through a visible human body');
 s.world.player.x=10;s.world.player.z=-58;s.world.player.yaw=0;
 assert.equal(Visibility.planVisible(s.world,16/9).witnesses.length,0,
  'turning away cannot leave a hidden civilian rendered on camera');
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/for\(const \{entity:w\} of plan\.witnesses\|\|\[\]\)/);
 assert.match(render,/type:'witness'/);
 assert.match(render,/mesh\.boxYaw\(w\.x,\.05,w\.z/);
 const before=Story.createState();
 assert.equal(before.world.witness,null);
 assert.ok(Visibility.planVisible(before.world,16/9).witnesses.every(item=>
  item.entity===before.civilianWalker||item.entity===before.world.mara||
  item.entity===before.world.kimJiyoon||
   item.entity===before.world.civicCrossing),
  'before evacuation there is no driver; only original and newly authored civilians can be observed');
});
test('previous saves migrate safely and invented conversations are rejected',()=>{
 const s=evacuation(),raw=JSON.parse(Story.serialize(s));
 delete raw.transportContact;
 const old=Story.restore(JSON.stringify(raw));
 assert.equal(old.transportContact,0);
 assert.equal(Story.markers(old).some(m=>m.id==='transportDriver'),true);
 for(const invalid of [3,-1,'2',null,1.5]){
  const bad={...raw,transportContact:invalid};
  assert.throws(()=>Story.restore(JSON.stringify(bad)),/checkpoint|Unknown|Invalid|fields/i);
 }
 const forged=JSON.parse(Story.serialize(Story.createState()));
 forged.transportContact=1;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),/checkpoint|Unknown|Invalid|fields/i);
 // Optional meeting cannot block the existing south exit and cannot grant
 // arrival/vehicle completion even if the player skips the staff conversation.
 go(old,'exitEvac');
 assert.equal(Story.interact(old).ok,true);
 assert.match(Journal.entries(old).find(r=>r.id==='debrief').detail,/운송 담당자 면담 미진행/);
 const completed=Story.restore(Story.serialize(old));
 assert.equal(completed.phase,'complete');
 assert.equal(completed.transportContact,0);
});test('one local request launches a physically arriving vehicle and survives checkpoint restore',()=>{
 const s=evacuation();
 go(s,'transportDriver');
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.transportContact,1);
 assert.ok(s.transportVan);
 assert.equal(s.transportVan.arrived,false);
 assert.equal(Story.markers(s).some(m=>m.id==='transportDriver'),false);
 assert.equal(s.world.obstacles.filter(o=>o.routeId==='story-civil-transport').length,1);
 const initial=s.transportVan.z;
 for(let i=0;i<60;i++)Story.step(s,1/60,{});
 assert.equal(s.transportVan.z,initial,'no vehicle departure before the driver reaches the real cabin');
 assert.ok(s.transportVan.driverZ<-54.5,'actual driver walks to the parked vehicle first');
 const saved=Story.serialize(s);
 const restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 assert.equal(restored.world.obstacles.filter(o=>o.routeId==='story-civil-transport').length,1);
 for(let i=0;i<2100;i++)Story.step(restored,1/60,{});
 assert.equal(restored.transportVan.arrived,true);
 assert.equal(restored.transportContact,2);
 assert.equal(restored.transportVan.z,-64);
 assert.match(Journal.entries(restored).find(x=>x.id==='transport').detail,/도착/);
 assert.equal(Story.markers(restored).some(m=>m.id==='transportDriver'),false);
 const forged=JSON.parse(Story.serialize(restored));
 forged.transportVan.z=-70;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),/checkpoint|Invalid|fields/i);
});
test('the witness is an actual locally visible solid human and never an unseen world map marker',()=>{
 const s=evacuation(),npc=s.world.witness;
 assert.deepEqual(npc,{x:10,z:-54});
 s.world.player.x=10;s.world.player.z=-58;s.world.player.yaw=Math.PI;
 const view=Visibility.planVisible(s.world,16/9);
 assert.ok(view.witnesses.some(item=>item.entity===npc),
  'the original human driver remains visible beside another independently moving resident');
 for(let i=0;i<60;i++)Story.step(s,1/60,{forward:true});
 assert.ok(s.world.player.z < -55,
  'the player must not walk straight through a visible human body');
 s.world.player.x=10;s.world.player.z=-58;s.world.player.yaw=0;
 assert.equal(Visibility.planVisible(s.world,16/9).witnesses.length,0,
  'turning away cannot leave a hidden civilian rendered on camera');
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/for\(const \{entity:w\} of plan\.witnesses\|\|\[\]\)/);
 assert.match(render,/type:'witness'/);
 assert.match(render,/mesh\.boxYaw\(w\.x,\.05,w\.z/);
 const before=Story.createState();
 assert.equal(before.world.witness,null);
 assert.ok(Visibility.planVisible(before.world,16/9).witnesses.every(item=>
  item.entity===before.civilianWalker||item.entity===before.world.mara||
  item.entity===before.world.kimJiyoon||
   item.entity===before.world.civicCrossing),
  'before evacuation there is no driver; only original and newly authored civilians can be observed');
});
test('previous saves migrate safely and invented conversations are rejected',()=>{
 const s=evacuation(),raw=JSON.parse(Story.serialize(s));
 delete raw.transportContact;
 const old=Story.restore(JSON.stringify(raw));
 assert.equal(old.transportContact,0);
 assert.equal(Story.markers(old).some(m=>m.id==='transportDriver'),true);
 for(const invalid of [3,-1,'2',null,1.5]){
  const bad={...raw,transportContact:invalid};
  assert.throws(()=>Story.restore(JSON.stringify(bad)),/checkpoint|Unknown|Invalid|fields/i);
 }
 const forged=JSON.parse(Story.serialize(Story.createState()));
 forged.transportContact=1;
 assert.throws(()=>Story.restore(JSON.stringify(forged)),/checkpoint|Unknown|Invalid|fields/i);
 // Optional meeting cannot block the existing south exit and cannot grant
 // arrival/vehicle completion even if the player skips the staff conversation.
 go(old,'exitEvac');
 assert.equal(Story.interact(old).ok,true);
 assert.match(Journal.entries(old).find(r=>r.id==='debrief').detail,/운송 담당자 면담 미진행/);
 const completed=Story.restore(Story.serialize(old));
 assert.equal(completed.phase,'complete');
 assert.equal(completed.transportContact,0);
});
