'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const Sim=require('../src/simulation.js');
const Footpaths=require('../src/public-city-footpaths.js');
const Nav=require('../src/navigation.js');
const Guidance=require('../src/story-pedestrian-guidance.js');
const Cache=require('../src/story-pedestrian-route-cache.js');
const Story=require('../src/story-slice.js');
const {storyEntries,verifyStoryArchive}=require('../scripts/package-story-preview.cjs');
const {buildZip}=require('../scripts/package-offline-demo.cjs');
const start={x:-12,z:0,yaw:Math.PI/2};
const objective={id:'public-route',x:12,z:0};
const building=()=>[{x:0,z:0,w:6,d:10,type:'fictional-public-building'}];
function instrument(){
 let calls=0;
 const cache=Cache.create((...args)=>{calls++;return Guidance.plan(...args);});
 return {cache,calls:()=>calls};
}

test('unchanged CH01 walls and target reuse a genuinely collision-audited A* detour',()=>{
 const {cache,calls}=instrument(),solids=building();
 const first=cache.get(start,objective,solids);
 assert.ok(first&&first.kind==='detour');
 assert.equal(calls(),1);
 for(let i=0;i<24;i++){
  const reused=cache.get(start,objective,solids);
  assert.ok(reused&&reused.kind==='detour');
  assert.equal(reused.id,objective.id);
  assert.equal(reused.terrainVerified,true);
  assert.equal(reused.peopleVerified,false);
  assert.equal(calls(),1,'unchanged HUD must not repeat expensive A* at ~5Hz');
 }
 assert.equal(cache.stats().searches,1);
 assert.ok(cache.stats().reuses>=24);
});

test('real player displacement reanchors the verified first segment without stale map coordinates',()=>{
 const {cache,calls}=instrument(),solids=building();
 const baseline=cache.get(start,objective,solids);
 assert.equal(baseline.kind,'detour');
 const moved={x:start.x+.5,z:start.z,yaw:start.yaw};
 const newer=cache.get(moved,objective,solids);
 assert.ok(newer&&newer.terrainVerified);
 assert.equal(newer.points[0].x,moved.x,'waypoint begins at ACTUAL moving player');
 assert.equal(newer.points[0].z,moved.z);
 assert.equal(newer.points.at(-1).x,objective.x);
 assert.equal(calls(),1,'safe first-leg reuse should avoid full A*');
 const inflated=solids.map(o=>({...o,w:o.w+2*Footpaths.CLEARANCE,
  d:o.d+2*Footpaths.CLEARANCE}));
 for(let i=1;i<newer.points.length;i++){
  const prev=newer.points[i-1],p=newer.points[i];
  assert.equal(Sim.lineBlocked(prev.x,prev.z,p.x,p.z,inflated),false,
   'reused route would cross a real colliding structure');
 }
 assert.ok(Object.isFrozen(newer));
});

test('an in-place moving obstacle instantly revokes cached path, even with same array identity',()=>{
 const {cache,calls}=instrument(),solids=building();
 assert.equal(cache.get(start,objective,solids).kind,'detour');
 solids[0].x=-12;
 assert.equal(cache.get(start,objective,solids),null,
  'a changed collider on player location must NOT reuse old route');
 assert.equal(calls(),2);
 solids[0].x=0;
 assert.equal(cache.get(start,objective,solids).kind,'detour');
 assert.equal(calls(),3);
 solids[0].w=22;
 assert.equal(cache.get(start,objective,solids),null,
  'changed collision width invalidates path even if object count is unchanged');
 assert.equal(calls(),4);
});

test('marker identity, exact coordinates and world geometry length all invalidate cached guidance',()=>{
 const {cache,calls}=instrument(),solids=building();
 assert.equal(cache.get(start,objective,solids).kind,'detour');
 assert.equal(cache.get(start,{...objective,id:'different-public-target'},solids).kind,'detour');
 assert.equal(calls(),2);
 const shifted={...objective,x:13};
 assert.equal(cache.get(start,shifted,solids).id,shifted.id);
 assert.equal(calls(),3);
 solids.push({x:100,z:100,w:2,d:2});
 cache.get(start,shifted,solids);
 assert.equal(calls(),4,'even a changed remote obstacle must invalidate exact topology');
 solids.pop();
 cache.get(start,shifted,solids);
 assert.equal(calls(),5);
});

test('negative route evidence is cached only at effectively the SAME real position',()=>{
 const {cache,calls}=instrument(),solids=[{x:-12,z:0,w:4,d:4}];
 assert.equal(cache.get(start,objective,solids),null);
 assert.equal(cache.get(start,objective,solids),null);
 assert.equal(calls(),1);
 assert.equal(cache.get({...start,x:start.x+.1},objective,solids),null);
 assert.equal(calls(),1);
 cache.get({...start,x:start.x+.5},objective,solids);
 assert.equal(calls(),2,'player motion invalidates a previously unreachable result');
 assert.equal(Cache.MAX_NEGATIVE_REUSE_METRES,.2);
});

test('direct route never invents an invisible detour, and state-independent cache reset works',()=>{
 const {cache,calls}=instrument();
 const result=cache.get(start,objective,[]);
 assert.equal(result.kind,'direct');
 assert.equal(result.distance,24);
 assert.equal(Guidance.instruction(result),'');
 assert.equal(cache.get(null,objective,[]),null);
 assert.equal(cache.get(start,objective,[]).kind,'direct');
 assert.equal(calls(),2,'invalid state clears the previous cached guidance');
 cache.clear();
 assert.equal(cache.get(start,objective,[]).kind,'direct');
 assert.equal(calls(),3);
});

test('CH01 independent story-only Windows payload includes memoized planner in correct script order',()=>{
 const html=read('story.html'),app=read('src/story-app.js');
 assert.ok(html.indexOf('src/story-pedestrian-guidance.js') <
   html.indexOf('src/story-pedestrian-route-cache.js'));
 assert.ok(html.indexOf('src/story-pedestrian-route-cache.js') <
   html.indexOf('src/story-app.js'));
 assert.match(app,/PedestrianCache=global\.VeilpointStoryPedestrianRouteCache/);
 assert.match(app,/pedestrianRouteCache=PedestrianCache\?\.create\(\)/);
 assert.match(app,/pedestrianRouteCache\.get\(state\.world\.player,walkTarget,state\.world\.obstacles\)/);
 assert.match(app,/if\(!walkTarget\)pedestrianRouteCache\?\.clear\(\)/);
 const packed=storyEntries().map(x=>x.name);
 assert.ok(packed.includes('src/story-pedestrian-route-cache.js'));
 assert.ok(!packed.includes('src/br96-client.js'));
 assert.equal(verifyStoryArchive(buildZip(storyEntries())).storyOnly,true);
});

test('route cache cannot mutate current CH01 V2 checkpoint or BR player state',()=>{
 const s=Story.createState(),before=Story.serialize(s);
 const br=Sim.newMatch(20261110,1),oldBr=JSON.stringify(br);
 const cache=Cache.create();
 const player=s.world.player,targets=Story.navigationMarkers(s);
 if(targets.length)cache.get(player,targets[0],s.world.obstacles);
 assert.equal(Story.serialize(s),before);
 assert.equal(JSON.stringify(br),oldBr);
 assert.equal(Story.restore(before).phase,s.phase);
 assert.equal(Story.VERSION,2);
});
