'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const render=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
function scene(lighting){
 const s=Sim.newMatch(20261107,1,'carbine',false,'central',lighting);
 s.status='playing';s.obstacles=[];
 const b=s.bots[0];Object.assign(b,{x:0,z:-43,angle:Math.PI,moveTime:999,actionTime:999,
  lastSeenX:35,lastSeenZ:23,lastSeenUntil:0});
 s.player.x=0;s.player.z=0;return {s,b};
}
test('BR daylight is unchanged by default; sunset is explicit and never a magic perk',()=>{
 const implicit=Sim.newMatch(5,4,'carbine');
 const explicit=Sim.newMatch(5,4,'carbine',false,'central','day');
 assert.equal(implicit.lighting,'day');assert.equal(JSON.stringify(implicit),JSON.stringify(explicit));
 assert.equal(implicit.random.getState(),explicit.random.getState());
 for(const lighting of ['day','dusk'])for(const site of Object.keys(Sim.ENTRY_SITES)){
  const game=Sim.newMatch(129,4,'carbine',false,site,lighting);
  assert.equal(game.lighting,lighting);
  assert.equal(game.loot.length,40);
  assert.equal(game.bots.length,4);
  assert.ok(Math.hypot(game.player.x,game.player.z)<170);
 }
 assert.throws(()=>Sim.newMatch(2,0,'carbine',false,'central','night'),/Unknown BR lighting/);
 assert.throws(()=>Sim.newMatch(2,0,'carbine',false,'central','__proto__'),/Unknown BR lighting/);
});
test('dusk AI loses distant direct sight but preserves hearing, solid-cover checks and actual coordinates',()=>{
 const bright=scene('day'),dim=scene('dusk');
 Sim.tick(bright.s,1/60,{});Sim.tick(dim.s,1/60,{});
 assert.ok(bright.b.lastSeenUntil>0,'daylight AI should see a directly exposed actor at this range');
 assert.equal(dim.b.lastSeenUntil,0,'dusk must not use daylight sight through haze');
 assert.equal(dim.b.lastSeenX,35);
 assert.equal(dim.b.lastSeenZ,23);
 // Same ambient condition cannot read player position from behind real walls.
 const occluded=scene('day');
 occluded.s.obstacles=[{x:0,z:-21,w:10,d:4}];
 Sim.tick(occluded.s,1/60,{});
 assert.equal(occluded.b.lastSeenUntil,0);
 // At close range sunset does not create invisibility or a sci-fi cloaking mechanic.
 const nearby=scene('dusk');
 nearby.b.z=-24;
 Sim.tick(nearby.s,1/60,{});
 assert.ok(nearby.b.lastSeenUntil>0);
});
test('offline BR snapshot carries dusk, legacy snapshots migrate and malformed conditions are refused',()=>{
 for(const mode of ['day','dusk']){
  const match=Sim.newMatch(20261107,4,'carbine',false,'west',mode);
  match.status='playing';
  const saved=Sim.snapshotMatch(match);
  const restored=Sim.restoreMatch(saved);
  assert.equal(restored.lighting,mode);
  assert.equal(restored.entrySite,'west');
  assert.equal(Sim.snapshotMatch(restored),saved);
  const malformed=JSON.parse(saved);malformed.lighting='darkness';
  assert.throws(()=>Sim.restoreMatch(malformed),/Invalid saved BR lighting/);
  match.lighting='darkness';
  assert.throws(()=>Sim.snapshotMatch(match),/Invalid BR lighting/);
 }
 const legacy=Sim.newMatch(20261107,1);legacy.status='playing';
 const old=JSON.parse(Sim.snapshotMatch(legacy));
 delete old.lighting;
 const migrated=Sim.restoreMatch(old);
 assert.equal(migrated.lighting,'day');
 assert.equal(migrated.entrySite,'central');
});
test('PC runtime and both renderers show sunset without enabling powered CH01-only lamps',()=>{
 assert.match(html,/<select id="brLighting"/);
 assert.match(html,/<option value="dusk">해질녘/);
 assert.match(app,/Game\.newMatch\(seed,rivals,weaponId,rivals===1,sector,lighting\)/);
 assert.match(app,/lightingSelect\.value=restored\.lighting\|\|'day'/);
 assert.match(app,/lastFinishedMatch\.entrySite,lastFinishedMatch\.lighting/);
 assert.match(render,/state\.lighting==='dusk'/);
 assert.match(render,/dusk\?'#46505e'/);
 assert.match(render,/dusk\?1\.18:1\.35/);
 assert.match(render,/g\.uniform1f\(l\.night,night\?1:dusk\?\.44:0\)/);
 assert.match(render,/if\(uNight>\.5&&uRelayOn>\.5\)/);
 assert.doesNotMatch(app,/simulation\.player\.x=lightingSelect/);
});
