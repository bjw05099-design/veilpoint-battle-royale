'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Footpaths=require('../src/public-city-footpaths.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const geometry=world=>world.obstacles.filter(o=>o.type.startsWith('aden-laneshop-'))
 .map(({x,z,w,d,h,type})=>({x,z,w,d,h,type}));
const token=i=>i.toString(16).padStart(64,'0');
const waypoints=[[-28,90],[-35,96],[-35,116],[-45,121]];
function assertWalkable(points,obstacles,r=.85){
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],distance=Math.hypot(b.x-a.x,b.z-a.z);
  const segments=Math.max(1,Math.ceil(distance/.18));
  for(let k=0;k<=segments;k++){
   const t=k/segments,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   assert.equal(Sim.blocked(x,z,r,obstacles),false,
    'actual physical lane must be open at '+[x,z].join(','));
  }
 }
}
test('15 grounded shop-street bodies are exactly shared by current BR and CH01',()=>{
 const br=Sim.newMatch(20261109,0),story=Story.createState();
 assert.equal(geometry(br).length,15);
 assert.deepEqual(geometry(story.world),geometry(br));
 const byType=Object.groupBy?.(geometry(br),o=>o.type)||
  Object.fromEntries([...new Set(geometry(br).map(o=>o.type))]
   .map(k=>[k,geometry(br).filter(o=>o.type===k)]));
 for(const [type,count] of [['outer-wall',2],['inner-wall',2],
   ['back-wall',2],['shelf',2],['counter',2],['post',4],['public-tap',1]]){
  assert.equal(byType['aden-laneshop-'+type]?.length,count,type);
 }
 for(const world of [br,story.world]){
  for(const body of geometry(world))
   assert.equal(Sim.blocked(body.x,body.z,.85,world.obstacles),true);
  assertWalkable(waypoints.map(([x,z])=>({x,z})),world.obstacles);
  // Each shop is reached from the open street, with a physical south entry.
  assertWalkable([{x:-35,z:98},{x:-43,z:98},{x:-43,z:110}],world.obstacles);
  assertWalkable([{x:-35,z:98},{x:-27,z:98},{x:-27,z:110}],world.obstacles);
 }
});
test('four neighborhood footpaths visibly connect the craft court, promenade, two shops and ferry',()=>{
 const world=Sim.newMatch(22,0);
 const roads=Footpaths.planLocalPaths(world.obstacles);
 assert.deepEqual(roads.map(r=>r.id),[
  'craft-to-promenade','promenade-to-shop-street',
  'shop-street-through','shop-street-to-ferry'
 ]);
 for(const road of roads){
  assert.equal(road.walkable,true,'no fake walk-through street for '+road.id);
  assert.ok(road.points.length>=2);
  assert.deepEqual(road.points[0],road.from);
  assert.deepEqual(road.points.at(-1),road.to);
  assertWalkable(road.points,world.obstacles,1.05);
  assert.ok(Object.isFrozen(road)&&Object.isFrozen(road.points));
 }
 const story=Story.createState();
 assert.deepEqual(Footpaths.planLocalPaths(story.world.obstacles).map(r=>r.points),
  roads.map(r=>r.points),'both modes use collision-verified public pathways');
 assert.deepEqual(Footpaths.planAll(world.obstacles).map(r=>r.walkable),
  [true,true,true],'three prior city-district roads remain intact');
});
test('the original shared craft roofs and the new two shop roofs retain visible floor-to-ceiling alignment',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const context=require('node:vm').createContext({});
 require('node:vm').runInContext(renderer,context);
 assert.equal(context.VeilpointSharedPublicCanopies.length,3,
  'the three existing civic canopies must remain unchanged');
 assert.match(renderer,/const MARKET_LANE_ROOFS=Object\.freeze\(\[/);
 assert.match(renderer,/for\(const roof of MARKET_LANE_ROOFS\)objects\.push\(roof\)/);
 assert.match(renderer,/for\(const roof of MARKET_LANE_ROOFS\)/);
 assert.match(renderer,/PublicFootpaths\.planLocalPaths\(state\.obstacles\)/);
 assert.match(renderer,/PublicFootpaths\.planLocalPaths\(sim\.obstacles\)/);
 for(const key of ['aden-laneshop-outer-wall','aden-laneshop-inner-wall',
  'aden-laneshop-back-wall','aden-laneshop-shelf','aden-laneshop-counter',
  'aden-laneshop-post','aden-laneshop-public-tap'])assert.ok(renderer.includes(key));
});
test('legacy terrain saves and complete story checkpoints retain backwards-compatible state',()=>{
 const current=Sim.newMatch(20261109,0);current.status='playing';
 assert.deepEqual(geometry(Sim.restoreMatch(Sim.snapshotMatch(current))),geometry(current));
 const old=Sim.newMatch(20261109,0,'carbine',false,'central','day',0);
 old.status='playing';
 assert.deepEqual(geometry(old),[]);
 assert.deepEqual(Footpaths.planLocalPaths(old.obstacles),[]);
 assert.deepEqual(geometry(Sim.restoreMatch(Sim.snapshotMatch(old))),[]);
 const story=Story.createState(),saved=Story.serialize(story);
 assert.deepEqual(geometry(Story.restore(saved).world),geometry(story.world));
 assert.equal(Story.serialize(Story.restore(saved)),saved);
});
test('96-seat BR server starts with the same actual walkable shared public alley',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby);
 assert.deepEqual(geometry(world),geometry(Sim.newMatch(55,0)));
 assertWalkable(waypoints.map(([x,z])=>({x,z})),world.obstacles);
 assert.equal(world.actors.size,96);
});
