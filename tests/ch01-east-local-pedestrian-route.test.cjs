'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const go=(s,p)=>{s.world.player.x=p.x;s.world.player.z=p.z;};
function afterUnexpectedEscalation(){
 const s=Story.createState();
 go(s,Story.POINTS.terminal);
 assert.equal(Story.interact(s).phase,'engagement');
 // Encounter completion here is test setup, never a player shortcut.
 for(const hostile of s.world.bots){hostile.alive=false;hostile.health=0;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('CH01 east route can begin with a local worker and actual gate clearance, without paperwork',()=>{
 const s=afterUnexpectedEscalation(),m=Story.POINTS.eastLocalRequest;
 assert.deepEqual(s.found,[]);
 assert.equal(s.dispatchReviewed,false);
 assert.equal(s.deploymentReviewed,false);
 assert.equal(Story.markers(s).some(p=>p.id==='eastLocalRequest'),false);
 assert.equal(Sim.blocked(m.x,m.z,.85,s.world.obstacles),false,'human-scale conversation location walkable');
 go(s,m);
 assert.equal(Story.markers(s).some(p=>p.id==='eastLocalRequest'),true);
 assert.equal(Story.nearest(s)?.id,'eastLocalRequest');
 const previousElapsed=s.world.elapsed;
 const result=Story.interact(s);
 assert.deepEqual(result,{ok:true,event:'east_route_in_person',
   choice:'verification',phase:'exit'});
 assert.equal(s.choice,'verification');
 assert.equal(s.phase,'exit');
 assert.deepEqual(s.found,[]);
 assert.equal(s.relayRestored,false);
 assert.equal(s.dispatchReviewed,false);
 assert.equal(s.gateReadyAt>previousElapsed,true,
  'conversation requests existing physically-timed gate, not an instant open');
 assert.match(s.subtitle,/동쪽 현지 통제 담당자/);
 assert.match(s.subtitle,/출국 전/);
 const exported=Story.serialize(s),restored=Story.restore(exported);
 assert.equal(Story.serialize(restored),exported);
 assert.equal(restored.choice,'verification');
 assert.deepEqual(restored.found,[]);
 assert.equal(restored.gateReadyAt,s.gateReadyAt);
 assert.equal(Story.markers(restored).some(p=>p.id==='eastLocalRequest'),false);
});
test('no distant, blocked or pre-escalation eastside E can grant a route',()=>{
 const s=Story.createState(),m=Story.POINTS.eastLocalRequest;
 go(s,m);
 assert.equal(Story.markers(s).some(p=>p.id==='eastLocalRequest'),false);
 assert.notEqual(Story.nearest(s)?.id,'eastLocalRequest');
 const triggered=afterUnexpectedEscalation();
 go(triggered,{x:100,z:100});
 assert.equal(Story.markers(triggered).some(p=>p.id==='eastLocalRequest'),false);
 assert.equal(Story.interact(triggered).ok,false);
 assert.equal(triggered.choice,null);
 assert.equal(triggered.phase,'records');
});
test('new field interaction leaves the PC HUD input, save format and original routes unchanged',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/const result=Story\.interact\(state\)/);
 assert.match(app,/audio\.play\(state\.phase==='complete'\?'complete':'interact',/);
 assert.match(app,/const localSource=Story\.nearest\(state\)/);
 assert.match(app,/state\.phase!=='complete'&&localSource\?\{/);
 assert.match(app,/listener,source:\{x:localSource\.x,z:localSource\.z\}/);
 assert.match(app,/persist\(\)/);
 const s=afterUnexpectedEscalation();
 go(s,Story.POINTS.coordinatorRequest);
 assert.equal(Story.interact(s).phase,'exit');
 assert.equal(s.choice,'evacuation','existing west/south civilian-led choice unchanged');
 const old=Story.restore(JSON.stringify({
   version:1,phase:'records',found:[],choice:null,
   player:{x:0,z:-41,yaw:0,pitch:0,stamina:100},elapsed:12
 }));
 assert.equal(Story.markers(old).some(p=>p.id==='decision'),true);
});
