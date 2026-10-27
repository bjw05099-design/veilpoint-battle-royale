'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const V=require('../src/visibility.js');
const player={x:0,z:0,yaw:0};
const state=()=>({player:{...player},bots:[{x:0,z:-10,alive:true},{x:0,z:20,alive:true},{x:0,z:-100,alive:true},{x:0,z:-160,alive:true},{x:0,z:-30,alive:false}],loot:[{x:1,z:-15,picked:false},{x:0,z:20,picked:false},{x:0,z:-120,picked:false},{x:0,z:-8,picked:true}],zone:{x:0,z:0,radius:100},effects:[{x:0,z:-5,type:'hit'},{x:0,z:20,type:'hit'}]});
test('camera horizontal field of view adapts to viewport aspect',()=>{
 assert.ok(V.halfHorizontalFov(21/9)>V.halfHorizontalFov(4/3));
 assert.throws(()=>V.halfHorizontalFov(0),RangeError);
 assert.throws(()=>V.halfHorizontalFov(NaN),RangeError);
});
test('forward, behind and yaw rotation match renderer camera convention',()=>{
 assert.equal(V.inView(player,0,-20),true);
 assert.equal(V.inView(player,0,20),false);
 assert.equal(V.inView({...player,yaw:Math.PI/2},20,0),true);
 assert.equal(V.inView({...player,yaw:Math.PI/2},-20,0),false);
});
test('near objects, object radii, distance and invalid positions are handled safely',()=>{
 assert.equal(V.inView(player,0,0),true);
 assert.equal(V.inView(player,0,10,15),true);
 assert.equal(V.inView(player,0,-156,1,155),true);
 assert.equal(V.inView(player,0,-160,1,155),false);
 assert.equal(V.inView(player,NaN,0),false);
 assert.equal(V.inView(player,0,0,-1),false);
});
test('distance LOD selects high, medium and low without changing gameplay',()=>{
 assert.equal(V.lodForDistance(45),'high');
 assert.equal(V.lodForDistance(46),'medium');
 assert.equal(V.lodForDistance(90),'medium');
 assert.equal(V.lodForDistance(91),'low');
 assert.throws(()=>V.lodForDistance(-1),RangeError);
});
test('plan skips behind/far/dead entities, preserving nearby visible entities',()=>{
 const s=state(),plan=V.planVisible(s);
 assert.deepEqual(plan.bots.map(x=>x.lod),['high','low']);
 assert.equal(plan.stats.botsTotal,4);
 assert.equal(plan.stats.botsVisible,2);
 assert.equal(plan.stats.lootVisible,2);
 assert.equal(plan.effects.length,1);
 assert.ok(plan.zone.length>0&&plan.zone.length<128);
});
test('zone never disappears when camera faces the nearby boundary',()=>{
 const s=state();s.player.z=-99;
 const p=V.planVisible(s);
 assert.ok(p.zone.length>0);
 assert.ok(p.zone.some(x=>x.z<0));
});
test('render planner is deterministic and does not mutate simulation state',()=>{
 const s=state(),before=JSON.stringify(s);
 assert.deepEqual(V.planVisible(s),V.planVisible(s));
 assert.equal(JSON.stringify(s),before);
 assert.equal(V.planVisible(s).stats.estimatedDynamicVertices%36,0);
});
test('culling reduces planned geometry versus drawing every active entity and all ring pylons',()=>{
 const s=state(),p=V.planVisible(s);
 const oldVertices=(s.bots.filter(b=>b.alive).length*6+s.loot.filter(l=>!l.picked).length*2+128+s.effects.length)*36;
 assert.ok(p.stats.estimatedDynamicVertices<oldVertices);
 assert.ok(p.stats.estimatedDynamicVertices>0);
});
test('invalid state and aspect are rejected, zero-radius zone is skipped',()=>{
 assert.throws(()=>V.planVisible({}),TypeError);
 assert.throws(()=>V.planVisible(state(),0),RangeError);
 const s=state();s.zone.radius=0;
 assert.equal(V.planVisible(s).zone.length,0);
});
