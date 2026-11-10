'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Flood=require('../src/ch01-street-flood.js');
const Sim=require('../src/simulation.js');
function onsite(){
 const state=Story.createState();
 state.phase='records';
 state.combat.started=true;state.combat.cleared=true;
 state.world.player.x=Flood.DRAIN.x;
 state.world.player.z=Flood.DRAIN.z;
 state.world.player.yaw=0;
 return state;
}
test('CH01 optional civic drain action runs 180 real fixed ticks near the same physical public patch',()=>{
 const state=onsite();
 assert.equal(Sim.blocked(Flood.DRAIN.x,Flood.DRAIN.z,.85,state.world.obstacles),false);
 assert.ok(Story.markers(state).some(m=>m.id==='streetDrain'));
 const result=Story.interact(state);
 assert.equal(result.ok,true);assert.equal(result.event,'street_drain_started');
 assert.equal(state.drainCleared,false);
 assert.equal(state.drainClearTicks,1);
 assert.equal(Story.markers(state).some(m=>m.id==='streetDrain'),false);
 const raw=Story.serialize(state);
 assert.equal(Story.serialize(Story.restore(raw)),raw,
  'a mid-action save should keep the same 60Hz repair progress');
 for(let n=0;n<95;n++)Story.step(state,1/60,{});
 assert.equal(state.drainCleared,false);
 assert.ok(state.world.streetFlood.repairProgress>0&&
  state.world.streetFlood.repairProgress<1);
 for(let n=0;n<100;n++)Story.step(state,1/60,{});
 assert.equal(state.drainCleared,true);
 assert.equal(state.drainClearTicks,0);
 assert.equal(state.world.streetFlood.cleared,true);
 assert.ok(Flood.mobility('records',Flood.PATCH.x,Flood.PATCH.z,true)>
  Flood.mobility('records',Flood.PATCH.x,Flood.PATCH.z,false));
 assert.ok(Flood.mobility('records',Flood.PATCH.x,Flood.PATCH.z,true)<1,
  'the street remains damp rather than drying instantaneously');
 assert.equal(Story.serialize(Story.restore(Story.serialize(state))),Story.serialize(state));
});
test('CH01 leaving the drain or carrying a bulky crate cancels work without repairing remotely',()=>{
 const state=onsite();
 assert.equal(Story.interact(state).event,'street_drain_started');
 for(let n=0;n<30;n++)Story.step(state,1/60,{});
 assert.ok(state.drainClearTicks>1);
 state.world.player.x+=6;
 Story.step(state,1/60,{});
 assert.equal(state.drainClearTicks,0);assert.equal(state.drainCleared,false);
 assert.equal(state.world.streetFlood.repairProgress,undefined);
 state.world.player.x=Flood.DRAIN.x;
 state.world.carryingAid=true;
 assert.equal(Story.interact(state).reason,'hands_occupied');
 assert.equal(state.drainClearTicks,0);
 state.world.carryingAid=false;
 assert.equal(Story.interact(state).event,'street_drain_started');
 assert.equal(state.drainClearTicks,1,'work restarts locally, never at a remote point');
});
test('old v2 story saves remain loadable and unrecognized or impossible repair progress is rejected',()=>{
 const clean=Story.createState(),valid=Story.serialize(clean);
 const saved=JSON.parse(valid);
 assert.equal(saved.drainCleared,false);
 assert.equal(saved.drainClearTicks,0);
 delete saved.drainCleared;delete saved.drainClearTicks;
 const old=Story.restore(JSON.stringify(saved));
 assert.equal(old.drainCleared,false);assert.equal(old.drainClearTicks,0);
 const invalid=JSON.parse(valid);
 invalid.drainClearTicks=Flood.CLEAR_TICKS+1;
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),/Invalid/);
 invalid.drainClearTicks=12;
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),/Invalid/);
 invalid.drainClearTicks=0;invalid.drainCleared=true;
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),/Invalid/);
 assert.equal(Story.serialize(Story.restore(valid)),valid);
});
test('CH01 Canvas and WebGL show the same fixed-tick repair and still-wet street without external assets',()=>{
 const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
 const renderer=read('src/renderer.js'),app=read('src/story-slice.js');
 const html=read('story.html');
 assert.match(renderer,/wet\.cleared\?'#596966':'#426d74'/);
 assert.match(renderer,/wet\.repairProgress>0/);
 assert.match(renderer,/wet\.cleared\?\[\.31,\.38,\.36\]:\[\.20,\.36,\.41\]/);
 assert.match(app,/drainClearTicks\+Math\.max\(1,Math\.round\(t\*60\)\)/);
 assert.ok(html.indexOf('src/ch01-street-flood.js')<html.indexOf('src/story-slice.js'));
 assert.doesNotMatch(read('src/ch01-street-flood.js'),/fetch\(|XMLHttpRequest|WebSocket/);
});
