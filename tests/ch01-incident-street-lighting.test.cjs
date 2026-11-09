'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Story=require('../src/story-slice.js');

const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
const game=vm.createContext({});
vm.runInContext(renderer,game,{filename:'renderer.js'});
const civicLight=game.VeilpointCivicStreetLamp;

test('CH01 arrival has ordinary streetlight; on-foot witnessed escalation cuts only the local grid',()=>{
 const s=Story.createState();
 assert.equal(s.phase,'terminal');
 assert.equal(s.world.publicStreetPowered,true);
 assert.equal(civicLight(s.world),1);
 const originalObstacles=s.world.obstacles.length;
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 const event=Story.interact(s);
 assert.equal(event.phase,'engagement');
 assert.equal(s.world.publicStreetPowered,false);
 assert.equal(civicLight(s.world),0);
 assert.equal(s.world.obstacles.length>=originalObstacles,true);
 assert.equal(s.world.scene,'nahrin');
 // Local emergency radio cannot pretend to restore the entire city grid.
 s.relayRestored=true;
 Story.step(s,1/60,{});
 assert.equal(s.world.relayRestored,true);
 assert.equal(s.world.publicStreetPowered,false);
 assert.equal(civicLight(s.world),0);
});

test('restored V2 checkpoints retain the same persistent blackout and never replay arrival lighting',()=>{
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 Story.interact(s);
 s.world.player.x=-115;s.world.player.z=110;
 for(let i=0;i<3;i++)Story.step(s,1/60,{});
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(saved,Story.serialize(restored));
 assert.equal(restored.world.publicStreetPowered,false);
 assert.equal(civicLight(restored.world),0);
 assert.equal(restored.phase,'engagement');
 assert.equal(civicLight({scene:'br',publicStreetPowered:true}),0,
   'BR must not inherit story-only lamps');
 assert.equal(civicLight({scene:'nahrin',publicStreetPowered:false}),0);
});

test('both renderers use the same causal lighting level and do not add a collectible or switch gate',()=>{
 assert.match(renderer,/uniform float uExposure,uTime,uEffects,uNight,uRelayOn,uCivicOn,uBeaconOn/);
 assert.match(renderer,/g\.uniform1f\(l\.civicOn,civicStreetLampLevel\(state\)\)/);
 assert.match(renderer,/if\(civicStreetLampLevel\(state\)>0\)/);
 assert.match(renderer,/streetLamps\[2\]/);
 assert.doesNotMatch(renderer,/uCivicOn[^\n]*playerLocation/i);
 const source=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(source,/state\.world\.publicStreetPowered=state\.phase==='terminal'/);
 assert.doesNotMatch(source,/publicStreetPowered:.*snapshot/);
});
