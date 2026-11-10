'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const Sim=require('../src/simulation.js');
const Navigation=require('../src/navigation.js');
const Footpaths=require('../src/public-city-footpaths.js');
const Guidance=require('../src/story-pedestrian-guidance.js');
const Story=require('../src/story-slice.js');
const {storyEntries,verifyStoryArchive}=require('../scripts/package-story-preview.cjs');
const {buildZip}=require('../scripts/package-offline-demo.cjs');
const person=Object.freeze({x:-12,z:0,yaw:Math.PI/2});
const publicMarker=Object.freeze({id:'decision',x:12,z:0,kind:'objective',label:'가상 공공 현장 안내소'});
const box=Object.freeze({x:0,z:0,w:6,d:10,h:3,type:'public-fictional-building'});

test('direct public walking only claims the actual collision-checked straight segment',()=>{
 const p=Guidance.plan(person,publicMarker,[]);
 assert.equal(p.kind,'direct');
 assert.equal(p.id,'decision');
 assert.equal(p.distance,24);
 assert.equal(p.segment,24);
 assert.deepEqual(p.points,[{x:-12,z:0},{x:12,z:0}]);
 assert.equal(p.terrainVerified,true);
 assert.equal(p.peopleVerified,false);
 assert.equal(Guidance.instruction(p),'');
 assert.equal(Navigation.directLineBlocked(person,publicMarker,[]),false);
});

test('real static AABB forces finite, collision-free pedestrian detour with a concrete first direction',()=>{
 assert.equal(Navigation.directLineBlocked(person,publicMarker,[box]),true);
 const p=Guidance.plan(person,publicMarker,[box]);
 assert.ok(p&&p.kind==='detour','a 24m civilian walkway around a 6x10m building should be navigable');
 assert.ok(p.distance>24,'detour cannot pretend to be the straight-line length');
 assert.ok(p.distance<100,'detour must be bounded and local');
 assert.equal(p.points[0].x,person.x);
 assert.equal(p.points.at(-1).x,publicMarker.x);
 assert.ok(p.points.length>=3);
 assert.equal(p.terrainVerified,true);
 assert.equal(p.peopleVerified,false);
 const inflated=[{...box,w:box.w+2*Footpaths.CLEARANCE,d:box.d+2*Footpaths.CLEARANCE}];
 for(let i=1;i<p.points.length;i++){
  const prev=p.points[i-1],now=p.points[i];
  assert.equal(Sim.lineBlocked(prev.x,prev.z,now.x,now.z,inflated),false,
   'presented path must never cut through solid mesh '+i);
  assert.equal(Sim.blocked(now.x,now.z,Footpaths.CLEARANCE,[box]),false);
 }
 const hint=Guidance.instruction(p);
 assert.match(hint,/실제 보행 우회 확인/);
 assert.match(hint,/첫 구간/);
 assert.match(hint,/전체 약/);
 assert.match(hint,/이동 인원은 현장에서 확인/);
 assert.equal(Guidance.plan(person,publicMarker,[box]).distance,p.distance,
  'same world snapshot should give same deterministic walking advice');
});

test('inaccessible, fully enclosed or distant targets never produce a fictitious walking route',()=>{
 const prison=[
  {x:0,z:3,w:20,d:2},{x:0,z:-3,w:20,d:2},
  {x:3,z:0,w:2,d:20},{x:-3,z:0,w:2,d:20}
 ];
 assert.equal(Guidance.plan({x:0,z:0,yaw:0},{id:'x',x:0,z:12},prison),null);
 assert.equal(Guidance.plan({x:0,z:0,yaw:0},{id:'x',x:0,z:200},[]),null);
 assert.equal(Guidance.plan({x:0,z:0,yaw:0},{id:'x',x:0,z:0},[{x:0,z:0,w:2,d:2}]),null);
 assert.throws(()=>Guidance.plan(person,publicMarker,[box],{maxVisits:50000}),/bounded/);
 assert.throws(()=>Guidance.plan(person,publicMarker,[box],{maxVisits:0}),/bounded/);
 assert.equal(Guidance.plan(person,{id:'x',x:NaN,z:4},[]),null);
 assert.equal(Guidance.plan(person,publicMarker,null),null);
});

test('route recomputes from current physical world rather than caching stale passability',()=>{
 const clear=Guidance.plan(person,publicMarker,[]);
 const blocked=Guidance.plan(person,publicMarker,[box]);
 assert.equal(clear.kind,'direct');
 assert.equal(blocked.kind,'detour');
 const next={x:person.x+1,z:person.z,yaw:person.yaw};
 const moved=Guidance.plan(next,publicMarker,[box]);
 assert.equal(moved.kind,'detour');
 assert.notDeepEqual(moved.points[0],blocked.points[0]);
 assert.equal(Guidance.plan(person,publicMarker,[]).kind,'direct');
});

test('only existing public markers are selectable; real escort pause never suggests a false distant exit',()=>{
 const local={id:'local-physically-visible',x:-10,z:0},target=publicMarker;
 assert.equal(Guidance.targetFor(person,[target,local],null,null,false).id,'local-physically-visible');
 assert.equal(Guidance.targetFor(person,[target,local],null,'decision',false).id,'decision');
 assert.equal(Guidance.targetFor(person,[target,local],'local-physically-visible','decision',false).id,'local-physically-visible');
 assert.equal(Guidance.targetFor(person,[target,local],null,'decision',true),null);
 assert.equal(Guidance.targetFor(person,[target,local],'local-physically-visible','decision',true).id,'local-physically-visible');
 assert.equal(Guidance.targetFor(person,[],null,'secret-unseen-marker',false),null);
 assert.equal(Guidance.targetFor(person,[null],null,null,false),null);
});

test('story PC route uses one verified target for both text and minimap, and is shipped in story-only ZIP',()=>{
 const html=read('story.html'),app=read('src/story-app.js');
 assert.ok(html.indexOf('src/navigation.js')<html.indexOf('src/story-pedestrian-guidance.js'));
 assert.ok(html.indexOf('src/story-pedestrian-guidance.js')<html.indexOf('src/story-app.js'));
 assert.match(app,/const Pedestrian=global\.VeilpointStoryPedestrianGuidance/);
 assert.match(app,/Pedestrian\?\.targetFor\(state\.world\.player,publicMarkers/);
 assert.match(app,/Pedestrian\.plan\(state\.world\.player/);
 assert.match(app,/Pedestrian\.instruction\(walkRoute\)/);
 assert.match(app,/minimap\(walkRoute\)/);
 assert.match(app,/walkRoute\?\.kind==='detour'/);
 assert.match(app,/ctx\.setLineDash\?\.\(\[4,3\]\)/);
 const packed=storyEntries().map(x=>x.name);
 assert.ok(packed.includes('src/story-pedestrian-guidance.js'),
  'verified story standalone archive must include navigation code');
 assert.ok(!packed.includes('src/br96-client.js'),'BR code must remain outside story-only release');
 const verified=verifyStoryArchive(buildZip(storyEntries()));
 assert.equal(verified.storyOnly,true);
 assert.equal(verified.nativeUE5Verified,false);
});

test('story save schema and BR world are unchanged by the read-only pedestrian planner',()=>{
 const world=Story.createState(),old=Story.serialize(world);
 const br=Sim.newMatch(20261110,2),before=JSON.stringify(br);
 Guidance.plan(person,publicMarker,[box]);
 assert.equal(Story.serialize(world),old);
 assert.equal(JSON.stringify(br),before);
 assert.equal(Story.VERSION,2);
 assert.equal(Story.restore(old).world.scene,'nahrin');
});
