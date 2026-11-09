'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const Flood=require('../src/ch01-street-flood.js');
function atWater(state){
 const p=state.world.player;
 p.x=Flood.PATCH.x;p.z=Flood.PATCH.z;p.yaw=0;p.pitch=0;
 assert.equal(Sim.blocked(p.x,p.z,.85,state.world.obstacles),false);
}
test('the witnessed crisis changes physical footing; ordinary pre-crisis travel stays dry',()=>{
 const dry=Story.createState(),wet=Story.createState();
 wet.world.player.x=Story.POINTS.terminal.x;
 wet.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(wet).phase,'engagement');
 atWater(dry);atWater(wet);
 assert.equal(dry.world.streetFlood,null);
 assert.deepEqual(wet.world.streetFlood,Flood.PATCH);
 const d0=dry.world.player.z,w0=wet.world.player.z;
 Story.step(dry,1/60,{forward:true});
 Story.step(wet,1/60,{forward:true});
 const dryTravel=Math.abs(dry.world.player.z-d0);
 const wetTravel=Math.abs(wet.world.player.z-w0);
 assert.ok(dryTravel>wetTravel&&wetTravel>0,'street water slows walking, never locks movement');
 assert.ok(wetTravel>dryTravel*.68);
});
test('water remains ground-truth after v2 checkpoint restore, without adding a save key',()=>{
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 atWater(s);
 const raw=Story.serialize(s),parsed=JSON.parse(raw);
 assert.equal(Object.hasOwn(parsed,'streetFlood'),false);
 const restored=Story.restore(raw);
 assert.deepEqual(restored.world.streetFlood,Flood.PATCH);
 assert.equal(Story.serialize(restored),raw);
 assert.equal(Flood.exposure('terminal',Flood.PATCH.x,Flood.PATCH.z),0);
 assert.equal(Flood.mobility('records',Flood.PATCH.x+20,Flood.PATCH.z),1);
});
test('both browser render paths and script dependencies use the same authored rectangle',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.ok(html.indexOf('src/ch01-street-flood.js')<html.indexOf('src/story-slice.js'));
 assert.match(renderer,/if\(harborNight&&state\.streetFlood\)/);
 assert.match(renderer,/if\(state\.scene==='nahrin'&&state\.streetFlood\)/);
 assert.equal(Flood.mobility('engagement',Flood.PATCH.x,Flood.PATCH.z),.72);
});
