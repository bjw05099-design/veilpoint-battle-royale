'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const Map=require('../src/story-local-minimap.js');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const {storyEntries,verifyStoryArchive}=require('../scripts/package-story-preview.cjs');
const {buildZip}=require('../scripts/package-offline-demo.cjs');

function capture(){
 const commands=[],ctx={};
 for(const method of ['fillRect','beginPath','moveTo','lineTo','stroke','arc','fill','setLineDash'])
  ctx[method]=(...args)=>{commands.push({method,args});};
 return {ctx,commands,of(method){return commands.filter(c=>c.method===method);}};
}
const canvas={width:240,height:150};
const near=(a,b)=>Math.abs(a-b)<1e-8;

test('CH01 map follows the person into the REAL relocated 110m/-37m court outside previous fixed map',()=>{
 const player={x:110,z:-37,yaw:0};
 const f=Map.frameFor(player,240,150);
 assert.ok(f);
 assert.deepEqual(Map.point(f,110,-37),{x:120,y:75});
 assert.equal(Map.contains(f,110,-37),true);
 assert.equal(Map.contains(f,0,-37),false,'historic fixed harbor view is now outside the map');
 assert.equal(f.scale,2);
 assert.equal(f.left,50);
 assert.equal(f.right,170);
 assert.equal(f.top,-74.5);
 assert.equal(f.bottom,.5);
 const t=Map.frameFor({x:-120,z:125,yaw:Math.PI},240,150);
 assert.deepEqual(Map.point(t,-120,125),{x:120,y:75});
 assert.equal(Map.contains(t,110,-37),false);
});

test('world scale remains metre-correct and aspect-consistent at small and high-DPI canvas sizes',()=>{
 for(const {width,height} of [{width:240,height:150},{width:480,height:300},{width:300,height:180}]){
  const p={x:0,z:0},f=Map.frameFor(p,width,height);
  const origin=Map.point(f,0,0),east=Map.point(f,20,0),south=Map.point(f,0,20);
  assert.ok(near(origin.x,width/2)&&near(origin.y,height/2));
  assert.ok(near(east.x-origin.x,south.y-origin.y),'20m east and south must draw at equal pixel scale');
  assert.ok(near(f.right-f.left,120));
 }
 assert.equal(Map.frameFor({x:NaN,z:0},240,150),null);
 assert.equal(Map.frameFor({x:0,z:0},0,150),null);
 assert.equal(Map.point(null,0,0),null);
});

test('physical obstacle rectangles clip to viewport, never bleed into distant map regions',()=>{
 const f=Map.frameFor({x:110,z:-37},240,150);
 const inFrame={x:110,z:-37,w:4,d:8};
 assert.deepEqual(Map.rectangle(f,inFrame),{x:116,y:67,w:8,h:16});
 const clipped=Map.rectangle(f,{x:171,z:-37,w:6,d:4});
 assert.deepEqual(clipped,{x:236,y:71,w:4,h:8});
 assert.equal(Map.rectangle(f,{x:180,z:-37,w:6,d:4}),null);
 assert.equal(Map.rectangle(f,{x:110,z:-37,w:-4,d:4}),null);
 assert.equal(Map.rectangle(f,{x:NaN,z:0,w:5,d:5}),null);
});

test('pedestrian route strokes are trimmed to real camera boundaries',()=>{
 const f=Map.frameFor({x:110,z:-37},240,150);
 const clipped=Map.segment(f,{x:0,z:-37},{x:200,z:-37});
 assert.ok(clipped);
 assert.deepEqual(clipped.from,{x:0,y:75});
 assert.deepEqual(clipped.to,{x:240,y:75});
 assert.equal(Map.segment(f,{x:0,z:30},{x:200,z:30}),null);
 assert.equal(Map.segment(f,{x:110,z:90},{x:110,z:110}),null);
 const diagonal=Map.segment(f,{x:50,z:-74.5},{x:170,z:.5});
 assert.deepEqual(diagonal.from,{x:0,y:0});
 assert.deepEqual(diagonal.to,{x:240,y:150});
 assert.equal(Map.segment(f,{x:110,z:-37},{x:110,z:-37}),null);
});

test('local rendering only draws visible public markers and real clipped buildings',()=>{
 const c=capture(),player={x:110,z:-37,yaw:0};
 const f=Map.draw(c.ctx,canvas,{player,
  obstacles:[{x:110,z:-37,w:4,d:4},{x:500,z:-37,w:18,d:22}],
  markers:[
   {id:'local',kind:'objective',x:120,z:-37},
   {id:'far',kind:'evidence',x:-60,z:20}
  ]});
 assert.equal(f.playerX,110);
 // Exactly one visible public marker, plus the player symbol.
 assert.equal(c.of('arc').length,2);
 assert.equal(c.of('fillRect').length,2,
  'one full viewport fill and one physically on-screen AABB');
 assert.deepEqual(c.of('fillRect')[1].args,[116,71,8,8]);
 assert.deepEqual(c.of('arc')[0].args.slice(0,2),[140,75]);
 assert.deepEqual(c.of('arc')[1].args.slice(0,2),[120,75]);
});

test('a known observed civilian remains optional and never projects a distant hidden person',()=>{
 const player={x:110,z:-37,yaw:0};
 const none=capture();
 Map.draw(none.ctx,canvas,{player,escort:{x:0,z:0},markers:[]});
 assert.equal(none.of('arc').length,1,'distant guide not shown');
 const nearby=capture();
 Map.draw(nearby.ctx,canvas,{player,escort:{x:116,z:-37},markers:[]});
 assert.equal(nearby.of('arc').length,2,'only physically in-frame supplied guide appears');
 const html=read('src/story-app.js');
 assert.match(html,/Math\.hypot\(guide\.x-player\.x,guide\.z-player\.z\)<20/);
 assert.match(html,/!Sim\.lineBlocked\(player\.x,player\.z,guide\.x,guide\.z,state\.world\.obstacles\)/);
 assert.match(html,/escort:observedGuide/);
});

test('story minimap uses collision-verified moving route segments, not world-spanning arrows',()=>{
 const player={x:110,z:-37,yaw:Math.PI/2};
 const c=capture();
 Map.draw(c.ctx,canvas,{player,markers:[],
  walkRoute:{kind:'detour',points:[
   {x:20,z:-37},{x:110,z:-37},{x:195,z:-37}
  ]}});
 assert.equal(c.of('setLineDash').length,2);
 assert.equal(c.of('setLineDash')[0].args[0][0],4);
 assert.equal(c.of('setLineDash')[1].args[0].length,0);
 const segments=c.of('lineTo');
 assert.ok(segments.some(s=>near(s.args[0],120)&&near(s.args[1],75)));
 assert.ok(segments.every(s=>s.args[0]>=0&&s.args[0]<=240&&s.args[1]>=0&&s.args[1]<=150),
  'no route/projected line may extend past actual canvas clipping');
 const single=capture();
 Map.draw(single.ctx,canvas,{player,walkRoute:{kind:'direct',points:[{x:20,z:0},{x:300,z:0}]}});
 assert.equal(single.of('setLineDash').length,0,
  'direct path must remain an honest bearing rather than a fictitious detour');
});

test('script dependencies and existing story-only closure contain the actual executable minimap, no BR',()=>{
 const html=read('story.html'),app=read('src/story-app.js');
 assert.ok(html.indexOf('src/story-local-minimap.js')>html.indexOf('src/story-pedestrian-guidance.js'));
 assert.ok(html.indexOf('src/story-local-minimap.js')<html.indexOf('src/story-app.js'));
 assert.match(app,/const LocalMinimap=global\.VeilpointStoryLocalMinimap/);
 assert.match(app,/LocalMinimap\.draw\(ctx,c,/);
 assert.match(app,/minimap\(visibleWalkRoute\)/);
 assert.match(app,/const visibleWalkRoute=pedestrianYield\?null:walkRoute/);
 assert.match(app,/Pedestrian\?\.firstLegOccupiedByCivilian/);
 assert.doesNotMatch(app,/const w=c\.width,h=c\.height,tx=x=>\(x\+75\)\/150\*w/);
 const files=storyEntries().map(x=>x.name);
 assert.ok(files.includes('src/story-local-minimap.js'));
 assert.ok(!files.includes('src/br96-client.js'));
 assert.equal(verifyStoryArchive(buildZip(storyEntries())).storyOnly,true);
});

test('pure local camera does not mutate CH01 V2 saves or standalone BR match geometry',()=>{
 const state=Story.createState(),before=Story.serialize(state);
 const br=Sim.newMatch(20261110,0),originalBr=JSON.stringify(br);
 const c=capture();Map.draw(c.ctx,canvas,{
  player:state.world.player,obstacles:state.world.obstacles,
  markers:Story.navigationMarkers(state)
 });
 assert.equal(Story.serialize(state),before);
 assert.equal(JSON.stringify(br),originalBr);
 assert.equal(Story.restore(before).phase,state.phase);
 assert.equal(Story.VERSION,2);
});
