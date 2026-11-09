'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
const storySource=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');

test('the player experiences a lit working neighborhood before the actual CH01 disruption',()=>{
 const state=Story.createState();
 assert.equal(state.phase,'terminal');
 assert.equal(state.world.scene,'nahrin');
 assert.equal(state.world.publicStreetPowered,true);
 const saved=Story.restore(Story.serialize(state));
 assert.equal(saved.phase,'terminal');
 assert.equal(saved.world.publicStreetPowered,true);
});

test('actual fixed-step story incident blacks out local civic lighting and persists its consequence',()=>{
 const state=Story.createState();
 // Same physical harbor terminal the story player must already be able to
 // reach on foot. No second mission, collectable or remote interaction.
 state.world.player.x=0;state.world.player.z=-18;
 state.world.elapsed=10.25;
 Story.step(state,1/60,{});
 assert.equal(state.phase,'engagement');
 assert.equal(state.combat.started,true);
 assert.equal(state.world.publicStreetPowered,false);
 assert.equal(state.world.scene,'nahrin');
 // The visual loss is a real reason for an existing player-controlled action:
 // finite-battery headlamp use, not a new quest or magic city power switch.
 const lamp=Story.toggleFlashlight(state);
 assert.deepEqual(lamp,{ok:true,on:true});
 assert.equal(state.world.flashlightOn,true);
 const beforeBattery=state.flashlightTicks;
 Story.step(state,1/60,{});
 assert.equal(state.flashlightTicks,beforeBattery-1);
 const loaded=Story.restore(Story.serialize(state));
 assert.equal(loaded.phase,'engagement');
 assert.equal(loaded.world.publicStreetPowered,false);
 assert.equal(loaded.world.flashlightOn,true);
 // Restoring a civilian relay later illuminates its own two lamps only;
 // the original district blackout never becomes an implausible grid repair.
 state.phase='records';state.combat.cleared=true;
 state.world.player.x=12;state.world.player.z=-39;
 // Use the existing reachable F interaction; changing an internal variable
 // directly would not synchronize the renderer's authoritative world.
 const result=Story.interact(state);
 assert.equal(result.ok,true);
 assert.equal(result.event,'onsite_liaison_relay');
 assert.equal(state.world.relayRestored,true);
 assert.equal(state.world.publicStreetPowered,false);
});

test('WebGL and software scene both draw real before-after lighting from the saved world',()=>{
 assert.match(storySource,/state\.world\.publicStreetPowered=state\.phase==='terminal'/);
 assert.match(renderer,/uniform float uExposure,uTime,uEffects,uNight,uRelayOn,uCivicOn/);
 assert.match(renderer,/uNight>\.5&&uCivicOn>\.5/);
 assert.match(renderer,/vec3 streetLamps\[2\]=vec3\[2\]/);
 assert.match(renderer,/civicOn:g\.getUniformLocation\(this\.prog,'uCivicOn'\)/);
 assert.match(renderer,/g\.uniform1f\(l\.civicOn,civicStreetLampLevel\(state\)\)/);
 assert.match(renderer,/function civicStreetLampLevel\(state\)/);
 assert.match(renderer,/state\.publicStreetPowered===true\?1:0/);
 assert.match(renderer,/if\(civicStreetLampLevel\(state\)>0\)/);
 assert.match(renderer,/polygon\(\[proj\(x-2,\.085,-20\)/);
 assert.doesNotMatch(storySource,/publicStreetPowered:.*true.*checkpoint/);
});
