'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Journal=require('../src/field-journal.js');
const Comms=require('../src/story-comms.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
const SimBlocked=(p,body)=>require('../src/simulation.js').blocked(p.x,p.z,.9,[body]);
function southRoute(){
 const s=Story.createState();go(s,'terminal');
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 assert.equal(s.phase,'records');
 go(s,'decision');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 return s;
}
test('a single local civilian request starts moving visible, solid, finite-speed transport',()=>{
 const s=southRoute();go(s,'transportDriver');
 assert.equal(s.transportVan,null);
 const result=Story.interact(s);
 assert.equal(result.ok,true);
 assert.equal(s.transportContact,1);
 assert.deepEqual(s.transportVan,{z:-82,arrived:false,driverZ:-54});
 assert.equal(Story.markers(s).some(m=>m.id==='transportDriver'),false);
 assert.equal(Story.markers(s).some(m=>m.id==='dispatchLedger'),false);
 assert.equal(s.world.obstacles.filter(o=>o.routeId==='story-civil-transport').length,1);
 assert.match(Comms.briefing(s).message,/접근 중/);
 const before=Story.serialize(s);
 assert.equal(Story.serialize(Story.restore(before)),before);
 Story.step(s,0);
 assert.equal(s.transportVan.z,-82);
 for(let i=0;i<60;i++)Story.step(s,1/60,{});
 assert.equal(s.transportVan.z,-82,'the van waits for the driver to walk to the parked vehicle');
 assert.ok(s.transportVan.driverZ<-54.5,'the physical driver advances on foot at 60Hz');
 assert.equal(s.transportContact,1,'approaching vehicle is not an arrived vehicle');
 const body=s.world.obstacles.find(o=>o.routeId==='story-civil-transport');
 assert.equal(body.z,s.transportVan.z,'visible body and collider follow same 60Hz pose');
 assert.equal(s.world.transportVan.z,s.transportVan.z);
 const saved=Story.serialize(s),reloaded=Story.restore(saved);
 assert.equal(Story.serialize(reloaded),saved);
 assert.equal(reloaded.transportVan.z,s.transportVan.z);
});
test('civilian vehicle brakes for a standing person and finishes only after actually reaching curb',()=>{
 const s=southRoute();go(s,'transportDriver');Story.interact(s);
 s.world.player.x=10;s.world.player.z=-77;
 for(let i=0;i<360;i++)Story.step(s,1/60,{});
 const halted=s.world.obstacles.find(o=>o.routeId==='story-civil-transport');
 assert.equal(SimBlocked(s.world.player,halted),false,
   'a moving vehicle cannot overlap a nearby stationary person');
 assert.ok(s.transportVan.z< -79.4,'vehicle must stop in front of the person');
 assert.equal(s.transportContact,1);
 s.world.player.x=0;s.world.player.z=-54;
 for(let i=0;i<2100&&!s.transportVan.arrived;i++)Story.step(s,1/60,{});
 assert.equal(s.transportVan.arrived,true);
 assert.equal(s.transportVan.z,-64);
 assert.equal(s.transportContact,2);
 assert.match(Journal.entries(s).find(e=>e.id==='transport').detail,/실제 이동 차량/);
 assert.match(Comms.briefing(s).message,/실제 승차 지점/);
 const v=s.world.obstacles.find(o=>o.routeId==='story-civil-transport');
 assert.equal(v.z,-64);
 assert.equal(Story.serialize(Story.restore(Story.serialize(s))),Story.serialize(s));
});
test('historic interview saves stay readable and malformed vehicle completion is rejected',()=>{
 const s=southRoute(),old=JSON.parse(Story.serialize(s));
 delete old.transportVan;old.transportContact=1;
 const legacy=Story.restore(JSON.stringify(old));
 assert.equal(legacy.transportVan,null);
 go(legacy,'transportDriver');
 assert.equal(Story.interact(legacy).ok,true);
 assert.equal(legacy.transportContact,2);
 assert.equal(legacy.transportVan,null);
 for(const bad of [
  {z:-78,arrived:true},{z:-60,arrived:true},{z:-64,arrived:false},
  {z:-80,arrived:false,actorId:22}
 ]){
  const forged={...JSON.parse(Story.serialize(s)),transportContact:bad.arrived?2:1,transportVan:bad};
  assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 }
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/o\.type==='story-civil-transport'/);
 assert.match(renderer,/mesh\.box\(v\.x,0,v\.z,2\.4,1\.45,3\.8/);
 assert.match(renderer,/o\.type==='story-civil-transport'\?'#657d87'/);
});
