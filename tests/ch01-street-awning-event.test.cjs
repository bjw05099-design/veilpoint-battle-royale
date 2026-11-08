'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const body=s=>s.world.obstacles.find(o=>o.routeId==='story-fallen-awning');
function begin(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 const event=Story.interact(s);
 assert.equal(event.phase,'engagement');
 return s;
}
test('story opening changes the actual street geometry only after the unexpected escalation',()=>{
 const initial=Story.createState();
 assert.equal(initial.awningFallen,false);
 assert.equal(body(initial),undefined,'Korea briefing and original mission have no fallen awning');
 const state=begin();
 assert.equal(state.awningFallen,true);
 assert.ok(body(state));
 assert.equal(Sim.blocked(24,-35,.85,state.world.obstacles),true,
  'the damaged public street prop must really obstruct the middle lane');
 assert.equal(Sim.blocked(0,-35,.85,[body(state)]),false,
  'the short roadside walking detour must remain unobstructed');
 assert.ok(!Story.objective(state).includes('차양 조사'),
  'the fallen object is a gameplay event, not mandatory paperwork');
});
test('fixed step pedestrian collision cannot move through the fallen structure',()=>{
 const s=begin();
 const p={x:24,z:-30};
 for(let i=0;i<150;i++)Sim.moveEntity(p,0,-5,1/60,s.world.obstacles);
 assert.ok(p.z>-33,'approaching straight ahead stops on actual debris');
 const alternate={x:0,z:-30};
 for(let i=0;i<150;i++)Sim.moveEntity(alternate,0,-5,1/60,s.world.obstacles);
 assert.ok(alternate.z<-38,'sidewalk remains a walkable alternative at 60 Hz');
});
test('new saved hazard survives restart; older midscene checkpoints keep their original open path',()=>{
 const s=begin();
 const json=Story.serialize(s),restored=Story.restore(json);
 assert.equal(restored.awningFallen,true);
 assert.ok(body(restored));
 assert.equal(Story.serialize(restored),json);
 const legacy=JSON.parse(json);
 delete legacy.awningFallen;
 const old=Story.restore(JSON.stringify(legacy));
 assert.equal(old.awningFallen,false);
 assert.equal(body(old),undefined,'legacy save must not materialize fresh obstacle over an old player');
 const invalid={...JSON.parse(json),awningFallen:'yes'};
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),RangeError);
 const impossible={...JSON.parse(json),phase:'terminal',awningFallen:true};
 assert.throws(()=>Story.restore(JSON.stringify(impossible)),RangeError);
});
test('both visual render paths draw the fallen object using the collision geometry',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/type==='story-fallen-awning'\?'story-fallen-awning'/);
 assert.match(source,/type==='story-fallen-awning'\?'#b58c65'/);
 assert.match(source,/m\.box\(o\.x,0,o\.z,o\.w,\.12,o\.d/);
});
