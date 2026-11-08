'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
const go=(s,where)=>{s.world.player.x=where.x;s.world.player.z=where.z;};
function cleared(choice){
 const s=Story.createState();
 go(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 s.world.bots.forEach(b=>{b.health=0;b.alive=false;});
 s.combat.cleared=true;s.phase='records';
 if(choice==='verification')s.found=['recordA','recordB'];
 go(s,Story.POINTS.decision);
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,choice).ok,true);
 return s;
}
function approach(s,exit){
 const p=s.world.player;
 // Grounded 60Hz approach from a nearby unobstructed point; no fake E task.
 let start=null;
 for(const [dx,dz] of [[0,14],[14,0],[-14,0],[0,-14],[10,10],[-10,10]]){
  const x=exit.x+dx,z=exit.z+dz;
  if(!Sim.blocked(x,z,.85,s.world.obstacles)&&
     !Sim.lineBlocked(x,z,exit.x,exit.z,s.world.obstacles)){start={x,z};break;}
 }
 if(!start)throw new Error('cannot find open approach to real CH01 exit');
 p.x=start.x;p.z=start.z;
 assert.ok(Math.hypot(p.x-exit.x,p.z-exit.z)>12,'event does not trigger from far away');
 p.yaw=Math.atan2(exit.x-p.x,-(exit.z-p.z));
 for(let n=0;n<65&&!s.passageWarningHeard;n++)Story.step(s,1/60,{forward:true});
 return s;
}
test('south civilian route gives an unsolicited contextual on-foot update with no paperwork',()=>{
 const s=cleared('evacuation'),beforeMarkers=Story.markers(s).map(m=>m.id);
 assert.equal(s.passageWarningHeard,false);
 approach(s,Story.POINTS.exitEvac);
 assert.equal(s.passageWarningHeard,true,'walk near the staffed south lane first');
 assert.match(s.subtitle,/유수프.*주민을 집결지로 안내/);
 assert.match(s.subtitle,/출국 전에 들은 복귀 일정/);
 assert.deepEqual(Story.markers(s).map(m=>m.id).filter(id=>id!=='residentRoute'),beforeMarkers,
  'arrival cannot create paperwork, records or new mandatory tasks; only a local voluntary resident exchange may appear');
 assert.ok(Story.markers(s).filter(m=>m.id==='residentRoute').every(m=>m.kind==='evac'),
  'a person-to-person conversation must never become a dossier objective');
 const report=s.message;
 for(let t=0;t<30;t++)Story.step(s,1/60,{});
 assert.equal(s.message,report,'event must not spam a new radio message each frame');
 const checkpoint=Story.serialize(s);
 const loaded=Story.restore(checkpoint);
 assert.equal(loaded.passageWarningHeard,true);
 assert.equal(Story.serialize(loaded),checkpoint);
 go(s,Story.POINTS.exitEvac);
 assert.equal(Story.interact(s).phase,'complete');
 assert.equal(Story.debrief(s).passageWarningHeard,true);
 assert.match(Story.debrief(s).summary,/귀환 일정과 현재 지역 이동 여건/);
});
test('eastern optional verification route gets a different update with original assignment continuity',()=>{
 const s=cleared('verification');
 approach(s,Story.POINTS.exitVerify);
 assert.equal(s.passageWarningHeard,true);
 assert.match(s.subtitle,/조현지.*출국 전 귀환 계획/);
 assert.match(s.subtitle,/현지 구조단과 통제소의 확인/);
 assert.equal(s.choice,'verification');
 assert.equal(s.found.length,2);
 assert.equal(s.logHandedOff,false,'narrative radio never forges investigation results');
 assert.equal(s.world.player.alive,true);
 const current=Story.serialize(s),restored=Story.restore(current);
 assert.equal(restored.passageWarningHeard,true);
 assert.equal(Story.serialize(restored),current);
});
test('old CH01 v2 saves migrate and untrusted departure status flags cannot fake an event',()=>{
 const opening=Story.createState(),raw=Story.serialize(opening),old=JSON.parse(raw);
 assert.equal(opening.passageWarningHeard,false);
 delete old.passageWarningHeard;
 assert.equal(Story.restore(JSON.stringify(old)).passageWarningHeard,false);
 for(const forged of [1,'true',null]){
  assert.throws(()=>Story.restore(JSON.stringify({...old,passageWarningHeard:forged})),/checkpoint/i);
 }
 assert.throws(()=>Story.restore(JSON.stringify({...old,passageWarningHeard:true})),/checkpoint/i,
  'an event at a route exit cannot have occurred before departure');
 assert.deepEqual(Story.markers(opening).map(m=>m.id),['terminal'],
  'the departure status adds no new objective');
});
