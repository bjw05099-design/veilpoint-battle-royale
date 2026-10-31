'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');

function longClearLane(id='precision'){
 const g=Sim.newMatch(20261101,1,id);
 g.status='playing';g.obstacles=[];g.loot=[];
 Object.assign(g.player,{x:-105,z:-20,yaw:Math.PI/2,pitch:0});
 Object.assign(g.bots[0],{x:105,z:-20,health:100,alive:true});
 return g;
}

test('all seven fictional classes have a distinct bounded upward sight impulse',()=>{
 const kicks=Object.values(Sim.FIREARMS).map(w=>w.recoilPitch);
 assert.equal(kicks.length,7);
 assert.equal(new Set(kicks).size,7);
 assert.ok(kicks.every(k=>Number.isFinite(k)&&k>0&&k<.025));
});

test('shot hits using the pre-recoil sight line, but an uncorrected second long shot misses',()=>{
 const g=longClearLane(),w=Sim.FIREARMS.precision;
 const before=g.player.charges;
 assert.equal(Sim.tag(g).hit,true);
 assert.equal(g.bots[0].health,100-w.damage);
 assert.equal(g.player.pitch,w.recoilPitch);
 g.elapsed+=w.fireInterval+1/60;
 const second=Sim.tag(g);
 assert.equal(second.ok,true);
 assert.equal(second.hit,false,'recoil requires actual mouse aim correction');
 assert.equal(g.player.charges,before-2,'both hits and misses spend one physical round');
 assert.equal(g.player.pitch,2*w.recoilPitch);
});

test('cooldown, empty trigger and a rejected automatic trigger do not kick the view',()=>{
 const g=longClearLane();
 Sim.tag(g);
 const after=g.player.pitch;
 assert.equal(Sim.tag(g).reason,'cooldown');
 assert.equal(Sim.autoFire(g,true).reason,'manual_trigger');
 assert.equal(g.player.pitch,after);
 g.elapsed+=2;
 g.player.charges=0;g.player.loaded=0;
 assert.equal(Sim.tag(g).reason,'empty');
 assert.equal(g.player.pitch,after);
});

test('pitch impulse clamps at the existing vertical view limit without changing shot validity',()=>{
 const g=longClearLane('shotgun');
 g.player.pitch=.349;
 const shot=Sim.tag(g);
 assert.equal(shot.ok,true);
 assert.equal(shot.hit,false);
 assert.equal(g.player.pitch,.35);
});

test('BR checkpoint restores recoil-adjusted aim and deterministic fixed-step continuation',()=>{
 const a=Sim.newMatch(20261102,2,'compact');
 a.status='playing';a.player.pitch=.24;
 assert.equal(Sim.tag(a).ok,true);
 const save=Sim.snapshotMatch(a),b=Sim.restoreMatch(save);
 assert.equal(b.player.pitch,a.player.pitch);
 assert.equal(Sim.snapshotMatch(b),save);
 for(let i=0;i<45;i++){
  Sim.tick(a,1/60,{});Sim.tick(b,1/60,{});
  if(a.status==='playing')Sim.autoFire(a,true);
  if(b.status==='playing')Sim.autoFire(b,true);
 }
 assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b));
});

test('CH01 uses shared sight kick and retains its existing checkpoint schema',()=>{
 const s=Story.createState('marksman');
 s.world.player.x=0;s.world.player.z=-18;
 assert.equal(Story.interact(s).phase,'engagement');
 s.world.player.yaw=0;s.world.player.pitch=0;
 const shot=Story.fire(s);
 assert.equal(shot.ok,true);
 assert.equal(shot.hit,true);
 assert.equal(s.world.player.pitch,Sim.FIREARMS.marksman.recoilPitch);
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 assert.equal(restored.world.player.pitch,s.world.player.pitch);
});
