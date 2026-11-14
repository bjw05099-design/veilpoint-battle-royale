'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const Hall=require('../src/aden-public-hall.js');
const Court=require('../src/story-public-court.js');
const Graphics=require('../src/graphics.js');
const Perf=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
function fakeGl(){
 let buffers=0;const deleted=[],uploads=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray:()=>{},enable:()=>{},depthFunc:()=>{},cullFace:()=>{},createBuffer:()=>({id:++buffers}),bindBuffer:()=>{},bufferData:()=>{},bufferSubData:(_target,_offset,vertices,start,count)=>uploads.push(Float32Array.from(vertices.subarray(start,start+count))),vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:b=>deleted.push(b.id),viewport:()=>{},clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},uniform3f:()=>{},uniform1f:()=>{},getExtension:()=>null};
 return {gl,deleted,uploads};
}
test('authored Nahrin buildings are physically blocked and avoid all objective/exit points',()=>{
 const s=Story.createState();assert.equal(s.world.scene,'nahrin');
 const buildings=s.world.obstacles.filter(o=>o.type&&o.type.startsWith('story-'));
 const historic=buildings.filter(o=>!o.id?.startsWith('harbor-hall-')&&
  !o.id?.startsWith('public-court-'));
 assert.equal(historic.length,20,
  'twenty prior structures remain; the east solid building is now a walk-through hall');
 assert.equal(s.world.obstacles.filter(o=>o.type==='harbor-passage-wall'&&o.x<60).length,6);
 assert.equal(Sim.blocked(42,-38,.85,s.world.obstacles),false);
 assert.equal(buildings.filter(o=>o.id?.startsWith('harbor-hall-')).length,Hall.PARTS.length,
  'new accessible public hall adds exactly its seven real collision objects');
 assert.equal(buildings.filter(o=>o.id?.startsWith('public-court-')).length,Court.SOLIDS.length,
  'eight newly authored CH01 court columns/furniture are separate real colliders');
 assert.equal(buildings.length,20+Hall.PARTS.length+Court.SOLIDS.length,
  'retain historic collision, existing public hall and new courtyard independently');
 assert.equal(buildings.filter(o=>o.type==='story-dispatch-case').length,0);
 assert.equal(buildings.filter(o=>o.type==='story-office-wall').length,5);
 assert.equal(buildings.filter(o=>o.type==='story-office-desk').length,1);
 assert.equal(buildings.filter(o=>o.type==='story-water-kiosk').length,1,'the public water kiosk must not be silently dropped');
 assert.deepEqual(buildings.filter(o=>o.type==='story-container'&&o.z < -80)
  .map(o=>[o.x,o.z,o.h]),[[-72,-84,5.2],[72,-91,2.6]],
  'both outer-quay solid stacks must exist without replacing old buildings');
 assert.ok(buildings.some(o=>o.x===-24&&o.z===-55&&o.type==='story-desk'),
  'south aid intake must be a physically visible counter with collision');
 for(const o of buildings)assert.equal(Sim.blocked(o.x,o.z,.85,s.world.obstacles),true);
 for(const p of Object.values(Story.POINTS)){
  assert.equal(Sim.blocked(p.x,p.z,.85,s.world.obstacles),false,p.id+' must remain accessible');
 }
 assert.equal(Story.restore(Story.serialize(s)).world.scene,'nahrin');
});
test('story-only authored static 3D scene appears and restores BR geometry without touching 60Hz state',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:640,clientHeight:360,getContext:t=>t==='webgl2'?fake.gl:null});
 const baseline=renderer.static.count;
 const story=Story.createState(),before=JSON.stringify(story.world);
 renderer.draw(story.world);
 assert.equal(renderer.sceneMode,'nahrin');
 assert.ok(renderer.static.count>baseline,'authored harbor must add visible 3D geometry');
 assert.equal(JSON.stringify(story.world),before,'rendering may not mutate story state');
 const sceneCount=renderer.static.count;
 renderer.setGraphicsQuality(Graphics.fromPreset('performance'));
 assert.equal(renderer.sceneMode,'nahrin');
 assert.ok(renderer.static.count>baseline*.5,'quality changes retain authored buildings');
 renderer.draw(Sim.newMatch(1,0));
 assert.equal(renderer.sceneMode,'br');
 assert.ok(renderer.static.count<sceneCount,'BR must not inherit Nahrin architecture');
 assert.ok(fake.deleted.length>=2,'GPU static scene buffers are retired on scene switches');
});
test('pre-harbor CH01 checkpoint inside new building is relocated once to nearest safe exterior',()=>{
 const s=Story.createState();s.world.player.x=-42;s.world.player.z=-38;
 const raw=Story.serialize(s);
 const loaded=Story.restore(raw);
 assert.equal(Sim.blocked(loaded.world.player.x,loaded.world.player.z,.85,loaded.world.obstacles),false);
 assert.equal(loaded.phase,'terminal');
 assert.match(loaded.message,/항구 건물 밖/);
 assert.ok(Math.hypot(loaded.world.player.x+42,loaded.world.player.z+38)<15);
 assert.equal(Story.restore(Story.serialize(loaded)).world.player.x,loaded.world.player.x);
});

test('CH01 south muster paint and harbor lane markings are original static geometry, not invisible collision',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:640,clientHeight:360,getContext:t=>t==='webgl2'?fake.gl:null});
 const story=Story.createState(),before=JSON.stringify(story.world);
 renderer.draw(story.world);
 const staticFloats=fake.uploads.findLast(v=>v.length===renderer.static.count*9);
 assert.ok(staticFloats,'capture static WebGL geometry for Nahrin');
 let painted=false;
 for(let i=0;i<staticFloats.length;i+=9){
  const x=staticFloats[i],y=staticFloats[i+1],z=staticFloats[i+2],r=staticFloats[i+6],g=staticFloats[i+7];
  if(x>-11&&x<-7&&z>-57&&z<-53&&y>=.007&&y<.014&&r>.45&&g>.38){painted=true;break;}
 }
 assert.equal(painted,true,'painted muster boundary must reach the GPU vertex upload');
 assert.equal(JSON.stringify(story.world),before,'paint must not change 60Hz simulation');
 assert.equal(Sim.blocked(Story.POINTS.muster.x,Story.POINTS.muster.z,.85,story.world.obstacles),false);
});

test('CH01 evacuation guide has real WebGL vertices only when exposed and never appears in BR',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:640,clientHeight:360,
  getContext:type=>type==='webgl2'?fake.gl:null});
 const s=Story.createState(),p=s.world.player;
 p.x=-10.5;p.z=-49;p.yaw=0;
 renderer.draw(s.world);
 const baseline=renderer.dynamic.count;
 s.world.guide={active:true,arrived:false,x:-10.5,z:-55};
 const plan=Visibility.planVisible(s.world,16/9);
 assert.equal(plan.guides.length,1,'guide is visible directly in the captain field of view');
 renderer.draw(s.world);
 assert.equal(renderer.dynamic.count,baseline+72,'WebGL uploads two physical actor boxes');
 assert.ok(plan.stats.estimatedDynamicVertices>=72);
 s.world.obstacles.push({x:-10.5,z:-52,w:6,d:1,h:3,type:'cover'});
 assert.equal(Visibility.planVisible(s.world,16/9).guides.length,0,
  'solid harbor occlusion must hide guide geometry');
 renderer.draw(s.world);
 assert.equal(renderer.dynamic.count,baseline,'hidden guide must not be drawn through walls');
 const br=Sim.newMatch(20261105,1);
 assert.equal(Visibility.planVisible(br,16/9).guides.length,0);
});

test('loading-hall mesh has an elevated ceiling, flat floor and no decorative house inside its doorway',()=>{
 const fake=fakeGl(),context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:640,clientHeight:360,
  getContext:t=>t==='webgl2'?fake.gl:null});
 const s=Story.createState();renderer.draw(s.world);
 const mesh=fake.uploads.findLast(v=>v.length===renderer.static.count*9);
 const points=[];for(let i=0;i<mesh.length;i+=9)points.push([mesh[i],mesh[i+1],mesh[i+2]]);
 assert.ok(points.some(([x,y,z])=>Math.abs(x-34)<.001&&Math.abs(y-9)<.001&&Math.abs(z+28)<.001),
  'the underside of the real roof is uploaded to WebGL');
 assert.ok(points.some(([x,y,z])=>Math.abs(x-34.5)<.001&&Math.abs(y-.012)<.001&&Math.abs(z+28)<.001));
 assert.equal(points.some(([x,y,z])=>x>40.15&&x<43.85&&z>-28.6&&z<-27.4&&y>.3&&y<2.6),false,
  'generic house windows, doors, roof trim and random trees cannot seal the four-metre entry');
});
