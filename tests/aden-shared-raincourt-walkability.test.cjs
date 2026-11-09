'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const bodies=w=>w.obstacles.filter(o=>o.type.startsWith('aden-raincourt-'))
 .map(({x,z,w,d,h,type})=>({x,z,w,d,h,type}));
const tokenize=i=>i.toString(16).padStart(64,'0');
function travel(obstacles,points,speed=3){
 const a={...points[0]};
 for(let i=1;i<points.length;i++){
  const dest=points[i],dx=dest.x-a.x,dz=dest.z-a.z;
  const dist=Math.hypot(dx,dz),steps=Math.ceil(dist*60/speed),
   vx=dx/steps*60,vz=dz/steps*60;
  for(let t=0;t<steps;t++)
   Sim.moveEntity(a,vx,vz,1/60,obstacles,.85);
  assert.ok(Math.hypot(a.x-dest.x,a.z-dest.z)<.16,
   '60Hz capsule cannot reach accessible public point '+JSON.stringify(dest));
 }
 return a;
}
test('16 real civilian raincourt fixtures are shared by BR and CH01 and remain non-sensitive',()=>{
 const match=Sim.newMatch(20261109,0),chapter=Story.createState();
 const scene=bodies(match);
 assert.equal(scene.length,16);
 assert.deepEqual(scene,bodies(chapter.world));
 const names=scene.reduce((a,b)=>(a[b.type]=(a[b.type]||0)+1,a),{});
 assert.deepEqual(names,{
  'aden-raincourt-wall':6,'aden-raincourt-dry-basin':2,
  'aden-raincourt-seat':4,'aden-raincourt-post':4
 });
 for(const world of [match,chapter.world]){
  for(const b of bodies(world))assert.equal(Sim.blocked(b.x,b.z,.85,world.obstacles),true);
  for(const pos of [
   [-80,-34],[-80,-26],[-80,-12],[-80,2],[-80,9],
   [-86,-12],[-74,-12],[-80,-2],[-80,-20]
  ])assert.equal(Sim.blocked(pos[0],pos[1],.85,world.obstacles),false,
   'open public entrance must stay physically accessible '+pos);
 }
});
test('player-size body can cross both doorways and circulate around both dry stone basins at fixed 60Hz',()=>{
 const route=[{x:-80,z:-34},{x:-80,z:-26},{x:-80,z:-12},
  {x:-80,z:2},{x:-80,z:9}];
 for(const world of [Sim.newMatch(2,0),Story.createState().world]){
  travel(world.obstacles,route);
  travel(world.obstacles,[{x:-80,z:-18},{x:-85,z:-18},
   {x:-85,z:-6},{x:-80,z:-6}]);
  travel(world.obstacles,[{x:-80,z:-18},{x:-75,z:-18},
   {x:-75,z:-6},{x:-80,z:-6}]);
  const stopped={x:-100,z:-12};
  for(let i=0;i<200;i++)Sim.moveEntity(stopped,3,0,1/60,world.obstacles,.85);
  assert.ok(stopped.x<-96.75,'west stone wall physically closes side entry');
 }
});
test('new civic court preserves all existing four public district routes, legacy BR saves, CH01 checkpoints and BR96 authority',()=>{
 const foot=require('../src/public-city-footpaths.js');
 const match=Sim.newMatch(88,0),chapter=Story.createState();
 for(const world of [match,chapter.world]){
  assert.deepEqual(foot.planAll(world.obstacles).map(o=>o.walkable),[true,true,true]);
  assert.deepEqual(foot.planLocalPaths(world.obstacles).map(o=>o.walkable),
   [true,true,true,true]);
 }
 match.status='playing';
 const snapshot=Sim.snapshotMatch(match);
 assert.deepEqual(bodies(Sim.restoreMatch(snapshot)),bodies(match));
 const old=Sim.newMatch(88,0,'carbine',false,'central','day',0);
 old.status='playing';
 assert.equal(bodies(old).length,0);
 assert.equal(bodies(Sim.restoreMatch(Sim.snapshotMatch(old))).length,0);
 const saved=Story.serialize(chapter);
 assert.equal(Story.serialize(Story.restore(saved)),saved);
 assert.deepEqual(bodies(Story.restore(saved).world),bodies(chapter.world));
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(tokenize(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(tokenize(i),true);
 const br96=new BrSquadWorld(lobby);
 assert.deepEqual(bodies(br96),bodies(match));
 assert.equal(br96.actors.size,96);
});
