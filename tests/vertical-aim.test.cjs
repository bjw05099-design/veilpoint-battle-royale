'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const V=require('../src/visibility.js');

function lane(weaponId='precision',distance=210,pitch=0){
 const g=Sim.newMatch(20261031,1,weaponId);
 g.status='playing';g.obstacles=[];g.loot=[];g.effects=[];
 Object.assign(g.player,{x:-105,z:-20,yaw:Math.PI/2,pitch});
 Object.assign(g.bots[0],{x:-105+distance,z:-20,health:100,alive:true});
 return g;
}
test('horizontal 210m shot hits; tiny high/low aim errors miss and still spend rounds',()=>{
 for(const pitch of [0,.02,-.02]){
  const g=lane('precision',210,pitch),before=g.player.charges;
  const shot=Sim.tag(g);
  assert.equal(shot.ok,true);
  assert.equal(shot.hit,pitch===0,'vertical miss must not become a 2D hit');
  assert.equal(g.player.charges,before-1);
  assert.equal(g.bots[0].health,pitch===0?100-Sim.FIREARMS.precision.damage:100);
 }
});
test('close actor silhouette allows modest elevation but not a steep upward ray',()=>{
 for(const [pitch,expected] of [[.02,true],[-.02,true],[.2,false]]){
  const g=lane('carbine',10,pitch);
  assert.equal(Sim.tag(g).hit,expected);
 }
});
test('crouched shots use the same lower eye origin as the browser camera',()=>{
 const standing=lane('carbine',20,.04);
 const crouched=lane('carbine',20,.04);
 assert.equal(Sim.tag(standing,false).hit,false);
 assert.equal(Sim.tag(crouched,true).hit,true);
 assert.equal(Sim.autoFire(lane('carbine',20,.04),true,true).hit,true);
});
test('marksman 170m target is visible in both WebGL planning and finite gameplay reach',()=>{
 const g=lane('marksman',170,0);
 assert.equal(V.planVisible(g).bots.length,1);
 assert.equal(V.planVisible(g).bots[0].lod,'low');
 assert.equal(Sim.tag(g).hit,true);
 g.bots[0].x=95; // 200m from -105, beyond 185m authored reach
 assert.equal(Sim.tag(g).reason,'cooldown');
 g.elapsed+=1;
 assert.equal(Sim.tag(g).hit,false);
});
test('CH01 uses the shared vertical rule and retains 60Hz checkpoint determinism',()=>{
 const s=Story.createState('precision');
 s.world.player.x=0;s.world.player.z=-18;
 assert.equal(Story.interact(s).phase,'engagement');
 s.world.obstacles=[];
 Object.assign(s.world.player,{x:-105,z:-20,yaw:Math.PI/2,pitch:.02});
 Object.assign(s.world.bots[0],{x:105,z:-20,health:90,alive:true});
 for(const bot of s.world.bots.slice(1)){bot.alive=false;bot.health=0;}
 assert.equal(Story.fire(s).hit,false);
 assert.equal(s.phase,'engagement');
 s.world.elapsed+=Sim.FIREARMS.precision.fireInterval+1/60;
 s.world.player.pitch=0;
 assert.equal(Story.fire(s).hit,true);
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 for(let i=0;i<60;i++){Story.step(s,1/60,{});Story.step(restored,1/60,{});}
 assert.equal(Story.serialize(s),Story.serialize(restored));
});
