'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function southRoute(){
 const s=Story.createState();go(s,'terminal');
 assert.equal(Story.interact(s).ok,true);
 for(const bot of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 assert.equal(s.phase,'records');
 go(s,'decision');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 return s;
}
function driverBoarded(){
 const s=southRoute();go(s,'transportDriver');
 assert.equal(Story.interact(s).ok,true);
 go(s,'exitEvac');
 for(let i=0;i<1250&&s.transportVan.driverZ>-79.4+1e-8;i++)
  Story.step(s,1/60,{});
 assert.ok(s.transportVan.driverZ<=-79.4+1e-8,
   'the driver must physically walk to the existing vehicle first');
 assert.equal(s.transportVan.arrived,false);
 return s;
}
test('CH01 optional nearby E request pauses one real moving civilian vehicle for five simulation seconds',()=>{
 const s=driverBoarded();
 const current=s.transportVan.z;
 assert.equal(Story.markers(s).some(m=>m.id==='transportYield'),false,
   'no cross-town marker or remote dispatch task');
 s.world.player.x=13.4;s.world.player.z=current;
 assert.equal(Sim.blocked(s.world.player.x,s.world.player.z,.85,s.world.obstacles),false);
 const marker=Story.nearest(s);
 assert.equal(marker?.id,'transportYield');
 assert.ok(Math.abs(marker.x-12.3)<1e-9,'the street-side marker stays beside the real van door');
 const action=Story.interact(s);
 assert.deepEqual([action.ok,action.event],[true,'transport_yield']);
 assert.equal(s.transportVan.pauseUntil,s.world.elapsed+5);
 assert.equal(s.world.transportVan.yielding,true);
 for(let i=0;i<240;i++)Story.step(s,1/60,{});
 assert.equal(s.transportVan.z,current,'physical vehicle is actually held, not just labeled');
 assert.equal(s.world.obstacles.find(o=>o.routeId==='story-civil-transport').z,current);
 const checkpoint=Story.serialize(s),restored=Story.restore(checkpoint);
 assert.equal(Story.serialize(restored),checkpoint,'new optional v2 subfield roundtrips exactly');
 assert.equal(restored.world.transportVan.yielding,true);
 for(let i=0;i<100;i++)Story.step(restored,1/60,{});
 assert.ok(restored.transportVan.z>current,'driver resumes without further player action');
 assert.equal(restored.transportContact,1,'a short road pause is never passenger evacuation');
 restored.phase='complete';
 const summary=Story.debrief(restored);
 assert.equal(summary.civilianVehicleYieldRequested,true);
 assert.match(summary.closingScene.lines.at(-1),/승객 수송 및 철수 완료는 확인되지 않았습니다/);
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/v\.yielding\?\[\.72,\.19,\.13\]/,
   'actual saved server vehicle pause changes live brake-light color');
});
test('a second local E action lets the driver proceed without a forced five-second gate',()=>{
 const s=driverBoarded();
 s.world.player.x=13.4;s.world.player.z=s.transportVan.z;
 assert.equal(Story.interact(s).event,'transport_yield');
 assert.equal(Story.interact(s).event,'transport_resume');
 assert.equal(s.transportVan.pauseUntil,s.world.elapsed);
 assert.equal(s.world.transportVan.yielding,false);
 const before=s.transportVan.z;
 s.world.player.x=16;s.world.player.z=-82;
 for(let i=0;i<20;i++)Story.step(s,1/60,{});
 assert.ok(s.transportVan.z>before);
});
test('old v2 civilian shuttle saves remain unchanged and forged active stops cannot be loaded',()=>{
 const s=driverBoarded(),old=Story.serialize(s);
 assert.equal('pauseUntil' in JSON.parse(old).transportVan,false);
 assert.equal(Story.serialize(Story.restore(old)),old);
 const raw=JSON.parse(old);
 for(const time of [-1,'tomorrow',null,raw.elapsed+5.5]){
  const fake=JSON.parse(old);fake.transportVan.pauseUntil=time;
  assert.throws(()=>Story.restore(JSON.stringify(fake)),RangeError);
 }
 const fake=JSON.parse(old);
 fake.transportVan.pauseUntil=fake.elapsed+1;
 fake.transportVan.driverZ=-60; // cannot ask a driver who has not boarded
 assert.throws(()=>Story.restore(JSON.stringify(fake)),RangeError);
});
