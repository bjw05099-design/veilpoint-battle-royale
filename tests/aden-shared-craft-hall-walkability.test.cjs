'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const Footpaths=require('../src/public-city-footpaths.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const craft=world=>world.obstacles.filter(o=>o.type.startsWith('aden-craft-'))
 .map(({x,z,w,d,h,type})=>({x,z,w,d,h,type}));
const token=i=>i.toString(16).padStart(64,'0');
function walk(world,from,to,speed=4){
 const p={...from};
 const dx=to.x-from.x,dz=to.z-from.z,distance=Math.hypot(dx,dz);
 const steps=Math.ceil(distance/speed*60);
 const vx=dx/distance*speed,vz=dz/distance*speed;
 for(let i=0;i<steps;i++)Sim.moveEntity(p,vx,vz,
   Math.min(1/60,(distance-Math.hypot(p.x-from.x,p.z-from.z))/speed),
   world.obstacles,.85);
 return p;
}
test('original public craft neighborhood is one identical 18-body collision source for BR and CH01',()=>{
 const br=Sim.newMatch(20261109,0),story=Story.createState();
 const a=craft(br),b=craft(story.world);
 assert.equal(a.length,18);
 assert.deepEqual(b,a);
 const types=new Set(a.map(x=>x.type));
 for(const type of ['aden-craft-hall-wall','aden-craft-hall-divider',
  'aden-craft-hall-table','aden-craft-hall-shelf',
  'aden-craft-court-post','aden-craft-court-seat'])
  assert.ok(types.has(type),'missing a real world prop '+type);
 for(const world of [br,story.world]){
  for(const body of a)
   assert.equal(Sim.blocked(body.x,body.z,.85,world.obstacles),true,
    'every visible ground-level wall, room divider and item has collision');
  for(const spot of [
   [-63,20],[-63,22],[-63,36],[-63,50],[-63,53],[-63,60.5],
   [-75,24],[-75,28],[-72,38],[-72,46],
   [-51,24],[-51,28],[-54,38],[-54,46]
  ])assert.equal(Sim.blocked(spot[0],spot[1],.85,world.obstacles),false,
   'open doorway and real accessible side room '+spot.join(','));
 }
});
test('both shared map modes traverse the full south-to-north hall and enter both rooms at fixed 60Hz',()=>{
 for(const world of [Sim.newMatch(96,0),Story.createState().world]){
  const north=walk(world,{x:-63,z:12},{x:-63,z:68});
  assert.ok(north.z>67.9,'not a painted door: 56m physical corridor is passable');
  assert.ok(Math.abs(north.x+63)<1e-6,'no teleport or off-aisle drift');
  const left=walk(world,{x:-63,z:24},{x:-75,z:24});
  assert.ok(left.x < -74.9);
  const side=walk(world,{x:-75,z:24},{x:-75,z:28});
  assert.ok(side.z>27.9);
  const aisle=walk(world,{x:-75,z:28},{x:-72,z:28});
  assert.ok(aisle.x>-72.1);
  const interior=walk(world,{x:-72,z:28},{x:-72,z:46});
  assert.ok(interior.z>45.9,'left room is a genuine interior');
  const right=walk(world,{x:-63,z:24},{x:-51,z:24});
  assert.ok(right.x>-51.1);
  assert.ok(walk(world,{x:-51,z:24},{x:-51,z:28}).z>27.9);
  assert.ok(walk(world,{x:-51,z:28},{x:-54,z:28}).x<-53.9);
  assert.ok(walk(world,{x:-54,z:28},{x:-54,z:46}).z>45.9);
 }
});
test('public roads remain walkable and existing saved terrain format stays backward compatible',()=>{
 const br=Sim.newMatch(551,0),story=Story.createState();
 for(const world of [br,story.world]){
  assert.deepEqual(Footpaths.planAll(world.obstacles).map(r=>r.walkable),
    Array(Sim.PUBLIC_CITY_ADJACENCY.length).fill(true));
 }
 const legacy=Sim.newMatch(551,0,'carbine',false,'central','day',0);
 legacy.status='playing';
 assert.deepEqual(craft(legacy),[]);
 assert.deepEqual(craft(Sim.restoreMatch(Sim.snapshotMatch(legacy))),[]);
 br.status='playing';
 assert.deepEqual(craft(Sim.restoreMatch(Sim.snapshotMatch(br))),craft(br));
 const raw=Story.serialize(story);
 assert.deepEqual(craft(Story.restore(raw).world),craft(story.world));
 assert.equal(Story.serialize(Story.restore(raw)),raw);
});
test('96-human server world inherits exactly the same locally inspectable public building',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby);
 assert.deepEqual(craft(world),craft(Sim.newMatch(13,0)));
 assert.equal(world.snapshot(token(0)).capacity,96);
 assert.equal(world.snapshot(token(0)).visible.every(p=>p.x!==-63),true,
  'the map itself does not spawn fictional opponents as spectators');
});
test('WebGL and Canvas both render the complete public craft-hall footprint and three raised roofs',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 for(const type of ['aden-craft-hall-wall','aden-craft-hall-divider',
   'aden-craft-hall-shelf','aden-craft-hall-table',
   'aden-craft-court-post','aden-craft-court-seat']){
  assert.match(source,new RegExp("o\\.type==='"+type+"'"));
 }
 const roofPart=source.slice(source.indexOf('const SHARED_PUBLIC_CANOPIES='),
  source.indexOf('const rand='));
 for(const coord of ['x:-75,z:35','x:-51,z:35','x:-63,z:60.5'])
  assert.ok(roofPart.includes(coord),coord);
 assert.match(source,/if\(state\.terrainRevision===1\|\|harborNight\)\{/);
 assert.match(source,/floor\.x-hw/);
 assert.match(source,/this\.worldTerrainRevision===1\)for\(const roof of SHARED_PUBLIC_CANOPIES\)/);
});
