'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
test('BR ferry starting location is a verified walkable new-match choice, not a mid-game teleport',()=>{
 const place=Sim.ENTRY_SITES.ferry;
 assert.deepEqual([place.x,place.z],[-45,121]);
 const match=Sim.newMatch(414,1,'carbine',false,'ferry','day',1);
 assert.equal(match.entrySite,'ferry');
 assert.equal(match.player.x,place.x);assert.equal(match.player.z,place.z);
 assert.equal(match.player.yaw,Math.PI,'start facing the real public entrance');
 assert.equal(Sim.blocked(place.x,place.z,.85,match.obstacles),false);
 assert.ok(Math.hypot(place.x,place.z)<170,'entry is inside initial playable zone');
 match.status='playing';
 const z=match.player.z;
 for(let i=0;i<140;i++)Sim.tick(match,1/60,{forward:true});
 assert.ok(match.player.z>z+8,
  'the player must be able to walk into the new hall using normal keyboard movement');
 assert.ok(match.player.z<145,
  'walking does not jump through the northern wall');
 assert.equal(match.player.x,place.x);
 const raw=Sim.snapshotMatch(match),restored=Sim.restoreMatch(raw);
 assert.equal(restored.entrySite,'ferry');
 assert.equal(Sim.snapshotMatch(restored),raw,'the new entry remains checkpoint-compatible');
});
test('other BR starting sectors and the legacy terrain checkpoint remain untouched',()=>{
 for(const site of ['central','service','east','west']){
  const m=Sim.newMatch(415,0,'carbine',false,site,'day',1);
  assert.equal(m.entrySite,site);
  assert.equal(Sim.blocked(m.player.x,m.player.z,.85,m.obstacles),false);
 }
 const legacy=Sim.newMatch(415,0,'carbine',false,'central','day',0);
 legacy.status='playing';
 const raw=Sim.snapshotMatch(legacy);
 assert.equal(Sim.snapshotMatch(Sim.restoreMatch(raw)),raw);
 assert.throws(()=>Sim.newMatch(415,0,'carbine',false,'unknown'),/Unknown BR entry sector/);
});
test('existing BR PC menu includes the new public sector without an added scrolling screen',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(html,/<option value="ferry">민간 여객 대기소 · 남측 보행 입구<\/option>/);
 assert.match(app,/Game\.ENTRY_SITES,entrySelect\.value/);
 assert.match(app,/Game\.newMatch\(seed,rivals,weaponId,rivals===1,sector,lighting\)/);
 assert.equal((html.match(/id="brEntrySite"/g)||[]).length,1);
});
