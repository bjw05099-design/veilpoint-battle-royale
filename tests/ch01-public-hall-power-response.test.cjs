'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Hall=require('../src/aden-hall-lights.js');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Comms=require('../src/story-comms.js');
const {buildZip}=require('../scripts/package-offline-demo.cjs');
const Package=require('../scripts/package-story-preview.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('CH01 hall light circuit is physically attached to five authored solids, has no extra colliders and stays off until restored',()=>{
 const state=Story.createState(),w=state.world;
 assert.equal(w.scene,'nahrin');
 assert.equal(Hall.hallPresent(w),true,'existing playable room is required');
 assert.equal(Hall.level(w),0);
 assert.equal(Hall.FIXTURES.length,4);
 assert.equal(Hall.visibleFixtures(w).length,4);
 assert.ok(Hall.visibleFixtures(w).every(f=>f.lit===false));
 assert.ok(Hall.FIXTURES.every(f=>f.x>20&&f.x<36&&f.z>26&&f.z<42));
 // Interior lamp housings must actually touch the corresponding solid
 // side-wall face rather than float 0.5m into an otherwise empty room.
 for(const f of Hall.FIXTURES){
  const wall=w.obstacles.find(o=>o.id===f.wall);
  const innerFace=f.x<28?wall.x+wall.w/2:wall.x-wall.w/2;
  assert.ok(Math.abs(f.x-innerFace)<.12,'lamp housing is wall-mounted');
 }
 assert.equal(Sim.blocked(28,26,.75,w.obstacles),false,'the south doorway must remain passable');
 assert.equal(Sim.blocked(28,34,.75,w.obstacles),false,'the civilian room remains enterable');
 const before=Story.serialize(state);
 w.relayRestored=true;
 assert.equal(Hall.level(w),1);
 assert.ok(Hall.visibleFixtures(w).every(f=>f.lit===true));
 w.relayRestored=false;
 assert.equal(Story.serialize(state),before,
  'visual circuit must never add gameplay state or alter old V2 saves');
 assert.equal(Object.isFrozen(Hall.FIXTURES),true);
});
test('hall power never leaks into BR mode, missing room, invalid geometry or unsafe player positions',()=>{
 const w=Story.createState().world;
 w.relayRestored=true;
 for(const id of Hall.REQUIRED_WALL_IDS){
  const clone={...w,obstacles:w.obstacles.filter(o=>o.id!==id)};
  assert.equal(Hall.hallPresent(clone),false);
  assert.equal(Hall.level(clone),0);
  assert.equal(Hall.visibleFixtures(clone).length,0);
 }
 assert.equal(Hall.level({...w,scene:'br'}),0);
 const invalid={...w,obstacles:w.obstacles.map(o=>o.id==='harbor-hall-north'?{...o,w:-1}:o)};
 assert.equal(Hall.level(invalid),0);
 assert.equal(Hall.occupiedInterior(w),false,'the player is initially outside');
 w.player.x=28;w.player.z=34;
 assert.equal(Hall.occupiedInterior(w),true);
 w.player.x=22.6;w.player.z=35;
 assert.equal(Hall.occupiedInterior(w),false,'a wall-side bench is not walkable floor');
 w.player.x=0;w.player.z=0;
 assert.equal(Hall.occupiedInterior(w),false);
});
test('CH01 on-site human dialogue reflects only the observed public hall circuit and does not invent city-wide power',()=>{
 const state=Story.createState();state.phase='records';state.combat.cleared=true;
 state.world.player.x=28;state.world.player.z=34;
 let note=Comms.onsitePublicHall(state);
 assert.equal(note.speaker,'이수혁 대위');
 assert.match(note.message,/조명은 여전히 꺼져 있다/);
 assert.doesNotMatch(note.message,/도시 전체의 전기가 복구/);
 state.relayRestored=true;state.world.relayRestored=true;
 note=Comms.onsitePublicHall(state);
 assert.match(note.message,/조명만 켜져 있다/);
 assert.match(note.message,/도시 전체의 전기가 복구된 것은 아니다/);
 state.world.obstacles=state.world.obstacles.filter(x=>x.id!=='harbor-hall-north');
 assert.equal(Hall.level(state.world),0);
 assert.equal(Comms.onsitePublicHall(state),null,
  'missing physical room cannot narrate its power state to an on-site player');
 state.phase='engagement';
 assert.equal(Comms.onsitePublicHall(state),null);
});
test('actual WebGL uniform, physical 3D housing and software fallback consume one circuit',()=>{
 const source=read('src/renderer.js'),html=read('story.html');
 assert.match(source,/uniform float uExposure,uTime,uEffects,uNight,uRelayOn,uCivicOn,uBeaconOn,uHallOn/);
 assert.match(source,/hallOn:g\.getUniformLocation\(this\.prog,'uHallOn'\)/);
 assert.match(source,/g\.uniform1f\(l\.hallOn,night\?\(HallLights\?\.level\(state\)\|\|0\):0\)/);
 assert.match(source,/for\(const f of HallLights\?\.FIXTURES\|\|\[\]\)/);
 assert.match(source,/for\(const part of HallLights\?\.visibleFixtures\(state\)\|\|\[\]\)/);
 assert.match(source,/HallLights\?\.level\(state\)>0/);
 assert.match(source,/float room=step\(21\.,vWorld\.x\)/);
 const order=['src/simulation.js','src/aden-hall-lights.js','src/renderer.js','src/story-comms.js','src/story-app.js']
  .map(s=>html.indexOf('src="'+s+'"'));
 assert.ok(order.every(i=>i>=0));
 assert.ok(order[0]<order[1]&&order[1]<order[2]&&order[2]<order[3]&&order[3]<order[4]);
 const sandbox={};
 vm.runInNewContext(source,sandbox);
 const w=Story.createState().world;
 assert.equal(sandbox.VeilpointHallLightLevel(w),0);
 w.relayRestored=true;
 assert.equal(sandbox.VeilpointHallLightLevel(w),0,
  'the renderer in a missing standalone script must fail closed, not invent light');
});
test('standalone story ZIP and combined demo both include the physically reactive hall circuit without network assets',()=>{
 const html=read('story.html'),source=read('src/aden-hall-lights.js');
 assert.ok(!/fetch\(|WebSocket|XMLHttpRequest|geolocation|localStorage/.test(source));
 const files=Package.storyEntries();
 assert.ok(files.some(x=>x.name==='src/aden-hall-lights.js'));
 const archive=buildZip(files);
 assert.equal(Package.verifyStoryArchive(archive).storyOnly,true);
 assert.ok(html.includes('src/aden-hall-lights.js'));
});
