'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
test('original deployment is a discoverable physical document before the unexpected conflict, not a mandatory war mission',()=>{
 const s=Story.createState(),p=s.world.player;
 assert.equal(s.phase,'terminal');
 assert.equal(s.deploymentReviewed,false);
 assert.deepEqual(Story.markers(s).map(m=>m.id),['terminal'],
  'a paper assignment is NOT a global marker across the map');
 const body=s.world.obstacles.filter(o=>o.type==='story-dispatch-case');
 assert.deepEqual(body,[{x:-12,z:9.8,w:2.2,d:.8,h:1.2,type:'story-dispatch-case'}]);
 assert.equal(Sim.blocked(body[0].x,body[0].z,.85,s.world.obstacles),true);
 p.yaw=-Math.PI/2;
 let ticks=0;
 while(p.x>-11.4&&ticks++<190)Story.step(s,1/60,{forward:true});
 assert.ok(p.x<=-11.4&&p.x>-14,'the captain has to WALK to the original arrival record');
 assert.equal(Sim.blocked(p.x,p.z,.85,s.world.obstacles),false);
 assert.equal(Story.markers(s).some(m=>m.id==='dispatchOrders'),true);
 const marker=Story.POINTS.dispatchOrders;
 assert.equal(Sim.blocked(marker.x,marker.z,.85,s.world.obstacles),false);
 assert.equal(Story.nearest(s)?.id,'dispatchOrders');
 const opened=Story.interact(s);
 assert.deepEqual(opened,{ok:true,event:'original_dispatch_orders',phase:'terminal'});
 assert.equal(s.deploymentReviewed,true);
 assert.match(s.subtitle,/원래 파견 지시서/);
 assert.match(s.subtitle,/도착 후 내전이 급격히 확산/);
 assert.match(s.subtitle,/내전 참전은 최초 파견 목적이 아니었습니다/);
 assert.deepEqual(Story.markers(s).map(m=>m.id),['terminal'],
  'once read the field record does not repeat or replace the original main mission');
 assert.equal(Story.interact(s).reason,'too_far');
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement',
  'reading original orders cannot gate or skip existing gameplay');
});
test('original dispatch evidence survives save/load and factual ending without modifying v2 format',()=>{
 const s=Story.createState(),p=s.world.player;
 p.x=Story.POINTS.dispatchOrders.x;p.z=Story.POINTS.dispatchOrders.z;
 assert.equal(Story.interact(s).event,'original_dispatch_orders');
 const saved=Story.serialize(s),back=Story.restore(saved);
 assert.equal(back.deploymentReviewed,true);
 assert.equal(Story.serialize(back),saved);
 const old=JSON.parse(saved);delete old.deploymentReviewed;
 assert.equal(Story.restore(JSON.stringify(old)).deploymentReviewed,false,
  'historical genuine saves omit an optional paper document');
 for(const forged of ['yes',1,null]){
  assert.throws(()=>Story.restore(JSON.stringify({...old,deploymentReviewed:forged})),
   /checkpoint/i,'untrusted save cannot forge the review flag');
 }
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='records';
 p.x=Story.POINTS.decision.x;p.z=Story.POINTS.decision.z;
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,'evacuation').ok,true);
 p.x=Story.POINTS.exitEvac.x;p.z=Story.POINTS.exitEvac.z;
 assert.equal(Story.interact(s).phase,'complete');
 const result=Story.debrief(s);
 assert.equal(result.deploymentReviewed,true);
 assert.match(result.summary,/최초 파견 지시서를 직접 확인했습니다/);
 assert.match(result.summary,/처음부터 계획된 임무가 아니었습니다/);
});
test('original documents render as actual waist-high solid geometry in both story visual paths',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(code,/if\(o\.type==='story-dispatch-case'\)/);
 assert.match(code,/o\.type==='story-dispatch-case'\?'#86735c'/);
 assert.match(code,/m\.box\(o\.x,0,o\.z,o\.w,o\.h,o\.d,\[\.47,\.40,\.33\]\)/);
 const br=Sim.newMatch(23,0);
 assert.equal(br.obstacles.some(o=>o.type==='story-dispatch-case'),false,
  'arrival story orders must not be injected into the BR competition world');
});
