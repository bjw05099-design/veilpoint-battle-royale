'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');

function live(seed=20261105){
 const state=Sim.newMatch(seed,1,'compact');
 state.status='playing';
 return state;
}
test('PC survivor plants precisely one grounded field sign and recovers it only at physical reach',()=>{
 const game=live(),initial=Sim.getAliveCount(game);
 assert.equal(game.trailMarker,null);
 const placed=Sim.toggleTrailMarker(game);
 assert.equal(placed.ok,true);
 assert.equal(placed.action,'placed');
 assert.ok(Math.hypot(game.trailMarker.x-game.player.x,game.trailMarker.z-game.player.z)<1.2);
 const first={...game.trailMarker};
 game.player.x=10;game.player.z=0;
 assert.deepEqual(Sim.toggleTrailMarker(game),{ok:false,reason:'out_of_reach'});
 assert.deepEqual(game.trailMarker,first,'sign cannot teleport or duplicate');
 game.player.x=0;game.player.z=0;
 const picked=Sim.toggleTrailMarker(game);
 assert.deepEqual(picked,{ok:true,action:'recovered'});
 assert.equal(game.trailMarker,null);
 assert.equal(Sim.getAliveCount(game),initial);
 assert.equal(Sim.toggleTrailMarker(game).action,'placed','recovered sign can be planted again');
});

test('solid cover blocks placement and retrieval without consuming the one sign',()=>{
 const game=live(20261106);
 game.obstacles.push({x:0,z:-.7,w:1,d:.25,h:2,type:'test-wall'});
 assert.deepEqual(Sim.toggleTrailMarker(game),{ok:false,reason:'blocked'});
 assert.equal(game.trailMarker,null);
 game.obstacles.pop();
 Sim.toggleTrailMarker(game);
 const placed={...game.trailMarker};
 game.obstacles.push({x:0,z:-.43,w:.4,d:.1,h:2,type:'test-wall'});
 assert.deepEqual(Sim.toggleTrailMarker(game),{ok:false,reason:'out_of_reach'});
 assert.deepEqual(game.trailMarker,placed);
});

test('60Hz movement, marker pickup and save/resume produce byte-identical world states',()=>{
 const a=live(20261107);
 assert.equal(Sim.toggleTrailMarker(a).ok,true);
 const checkpoint=Sim.snapshotMatch(a),b=Sim.restoreMatch(checkpoint);
 assert.equal(Sim.snapshotMatch(b),checkpoint);
 for(let i=0;i<180;i++){
  const input={forward:i%17<4,right:i%31<3,sprint:i%25<5};
  Sim.tick(a,1/60,input);Sim.tick(b,1/60,input);
  if(a.status!=='playing'||b.status!=='playing')break;
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b),'marker state diverged at 60Hz frame '+i);
 }
 assert.deepEqual(a.trailMarker,b.trailMarker);
});

test('legacy BR checkpoint without a trail sign migrates and forged sign is refused',()=>{
 const game=live(20261108);
 const legacy=JSON.parse(Sim.snapshotMatch(game));
 delete legacy.trailMarker;
 const restored=Sim.restoreMatch(JSON.stringify(legacy));
 assert.equal(restored.trailMarker,null);
 const forged=JSON.parse(Sim.snapshotMatch(game));
 forged.trailMarker={x:game.obstacles[0].x,z:game.obstacles[0].z};
 assert.throws(()=>Sim.restoreMatch(forged),/sign/i);
 forged.trailMarker={x:0,z:-.9,extra:'infinite-signs'};
 assert.throws(()=>Sim.restoreMatch(forged),/sign/i);
 forged.trailMarker={x:Infinity,z:0};
 assert.throws(()=>Sim.restoreMatch(forged),/sign/i);
 game.trailMarker={x:game.obstacles[0].x,z:game.obstacles[0].z};
 assert.throws(()=>Sim.snapshotMatch(game),/sign/i,'writer protects earlier usable save');
});

test('field sign is an actual cull-budgeted world prop and never reveals concealed opponents',()=>{
 const state=live(20261109);
 const before=Visibility.planVisible(state);
 assert.equal(before.trailMarkers.length,0);
 assert.equal(Sim.toggleTrailMarker(state).ok,true);
 const after=Visibility.planVisible(state);
 assert.equal(after.trailMarkers.length,1);
 assert.equal(after.stats.estimatedDynamicVertices-before.stats.estimatedDynamicVertices,72,
  'two boxes must be part of the renderer vertex budget');
 assert.deepEqual(after.bots.map(x=>x.entity.id),before.bots.map(x=>x.entity.id));
 state.trailMarker={x:0,z:-30};
 state.obstacles.push({x:0,z:-15,w:12,d:1,h:4,type:'test-wall'});
 assert.equal(Visibility.planVisible(state).trailMarkers.length,0,'solid cover occludes marker geometry');
});

test('PC input and both renderers use the saved physical marker; CH01 remains isolated',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(app,/KeyJ/);
 assert.match(app,/Game\.toggleTrailMarker\(simulation\)/);
 assert.match(app,/simulation\.trailMarker/);
 assert.match(renderer,/trailMarkers/);
 const story=require('../src/story-slice.js').createState();
 assert.equal(Sim.toggleTrailMarker(story.world).reason,'inactive');
 assert.equal(story.world.trailMarker,null);
});
