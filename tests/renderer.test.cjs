'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');
const Gfx=require('../src/graphics.js');
const Perf=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
function fakeGl(){
 let created=0;let allocations=0;const deleted=[];let viewports=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,
  FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
  createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,
  useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray:()=>{},enable:()=>{},depthFunc:()=>{},cullFace:()=>{},
  createBuffer:()=>({id:++created}),bindBuffer:()=>{},bufferData:()=>{allocations++},bufferSubData:()=>{},vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:b=>deleted.push(b.id),
  viewport:(x,y,w,h)=>viewports.push([w,h]),clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},uniform3f:()=>{},uniform1f:()=>{},
  getExtension:()=>null};
 return {gl,get created(){return created},get allocations(){return allocations},deleted,get viewports(){return viewports}};
}
test('WebGL renderer reuses dynamic GPU vertex buffer across frames and honors adaptive resolution',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Gfx,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const canvas={clientWidth:800,clientHeight:600,getContext:type=>type==='webgl2'?fake.gl:null};
 const renderer=new context.VeilpointRenderer(canvas);
 assert.equal(fake.created,1,'one static GPU buffer');
 renderer.setGraphicsQuality(Gfx.fromPreset('hyperreal165'));
 const state=Sim.newMatch(5,8);
 for(let i=0;i<12;i++)renderer.draw(state);
 assert.equal(fake.created,2,'one static and one reused dynamic GPU buffer after 12 frames');
 assert.ok(fake.allocations<=3,'dynamic GPU buffer grows at most a few times, not every frame');
 const originalBuffer=renderer.dynamic.buffer;
 renderer.setAdaptiveResolution(.8);
 renderer.draw(state);
 assert.equal(renderer.dynamic.buffer,originalBuffer);
 assert.equal(canvas.width,640);assert.equal(canvas.height,480);
 assert.equal(fake.created,2,'resolution change does not allocate a new vertex buffer');
 assert.throws(()=>renderer.setAdaptiveResolution(4),e=>e.name==='RangeError');
 renderer.setGraphicsQuality(Gfx.fromPreset('balanced'));
 renderer.draw(state);
 assert.equal(fake.created,3,'changing vegetation regenerates only the static mesh');
 assert.deepEqual(fake.deleted,[1]);
});

test('renderer draws only planned visible geometry, preserving active simulation entities',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Gfx,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:800,clientHeight:600,getContext:type=>type==='webgl2'?fake.gl:null});
 const state=Sim.newMatch(9,18);
 state.zone={x:0,z:0,radius:95};
 state.player.x=0;state.player.z=0;state.player.yaw=0;
 renderer.draw(state);
 const forward=renderer.lastVisibilityStats;
 assert.equal(renderer.dynamic.count,forward.estimatedDynamicVertices);
 assert.equal(forward.zoneVisible,0,'moving match eligibility is not a physical 3D fence');
 const original=JSON.stringify(state);
 state.player.yaw=Math.PI;
 renderer.draw(state);
 const backward=renderer.lastVisibilityStats;
 assert.equal(renderer.dynamic.count,backward.estimatedDynamicVertices);
 assert.ok(backward.estimatedDynamicVertices>0);
 assert.equal(state.bots.filter(b=>b.alive).length,18);
 state.player.yaw=0;
 assert.equal(JSON.stringify(state),original);
});

test('CH01 checkpoint has matching visible WebGL geometry and collision until local clearance',()=>{
 const Story=require('../src/story-slice.js');
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Gfx,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:800,clientHeight:600,getContext:type=>type==='webgl2'?fake.gl:null});
 const state=Story.createState();
 const gate=state.world.obstacles.find(o=>o.routeId==='east-checkpoint');
 assert.ok(gate);
 const initialX=gate.x;
 assert.equal(Sim.blocked(gate.x,gate.z,.85,state.world.obstacles),true);
 const boxes=[];
 const originalBox=renderer.dynamic.box.bind(renderer.dynamic);
 renderer.dynamic.box=(x,y,z,w,h,d,color)=>{
  if(w===gate.w&&h===gate.h&&d===gate.d)boxes.push({x,z,w,h,d});
  return originalBox(x,y,z,w,h,d,color);
 };
 const before=JSON.stringify(state.world);
 renderer.draw(state.world);
 assert.deepEqual(boxes,[{x:gate.x,z:gate.z,w:gate.w,h:gate.h,d:gate.d}]);
 assert.equal(JSON.stringify(state.world),before,'rendering must not change mission state');
 state.world.player.x=Story.POINTS.terminal.x;state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).ok,true);
 for(const opponent of state.world.bots){
  for(let i=0;i<2;i++){
   state.world.player.yaw=Math.atan2(opponent.x-state.world.player.x,-(opponent.z-state.world.player.z));
   state.world.elapsed+=.21;
   assert.equal(Story.fire(state).hit,true);
  }
 }
 assert.equal(state.phase,'records');
 for(const id of ['recordA','recordB','decision']){
  state.world.player.x=Story.POINTS[id].x;state.world.player.z=Story.POINTS[id].z;
  assert.equal(Story.interact(state).ok,true);
 }
 assert.equal(Story.choose(state,'verification').ok,true);
 for(let i=0;i<Story.GATE_CLEARANCE_SECONDS*60+1;i++)Story.step(state,1/60,{});
 assert.equal(Story.situation(state).eastGateOpen,true);
 assert.equal(Sim.blocked(initialX,gate.z,.85,state.world.obstacles),false);
 renderer.draw(state.world);
 assert.equal(boxes.length,2,'the barrier must move rather than disappear');
 assert.equal(boxes[1].x,initialX-12,'opened gate is parked clear of the passage');
 const openCount=renderer.dynamic.count;
 const withoutGate={...state.world,obstacles:state.world.obstacles.filter(o=>o.routeId!=='east-checkpoint')};
 renderer.draw(withoutGate);
 assert.equal(renderer.dynamic.count,openCount-36,'a parked gate contributes exactly one dynamic box');
 const restored=Story.restore(Story.serialize(state));
 renderer.draw(restored.world);
 assert.equal(boxes.length,3,'checkpoint restore must render the same gate');
 assert.deepEqual(boxes[2],boxes[1]);
});

test('BR renderer uses muted physical-scale shot feedback rather than floating energy cubes',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Gfx,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:800,clientHeight:600,getContext:type=>type==='webgl2'?fake.gl:null});
 const state=Sim.newMatch(7603,0);state.player.x=0;state.player.z=0;state.player.yaw=0;
 state.effects=[{x:0,z:-8,t:.1,type:'hit'},{x:2,z:-8,t:.1,type:'hostile'}];
 const feedback=[];
 const box=renderer.dynamic.box.bind(renderer.dynamic);
 renderer.dynamic.box=(x,y,z,w,h,d,color)=>{
   if((x===0&&z===-8)||(x===2&&z===-8))feedback.push({x,y,z,w,h,d,color});
   return box(x,y,z,w,h,d,color);
 };
 renderer.draw(state);
 assert.equal(feedback.length,2);
 assert.deepEqual(feedback.map(e=>[e.y,e.w,e.h,e.d]),[[.025,.22,.06,.22],[1.18,.16,.12,.16]]);
 assert.ok(feedback.every(e=>e.color.every(c=>c<.7)), 'no saturated neon shot markers');
 assert.equal(renderer.dynamic.count,renderer.lastVisibilityStats.estimatedDynamicVertices);
});

test('BR WebGL displays finite caches on the ground without moving force-field pylons',()=>{
 const fake=fakeGl();
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Gfx,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:800,clientHeight:600,getContext:type=>type==='webgl2'?fake.gl:null});
 const state=Sim.newMatch(8801,0);
 state.obstacles=[];state.bots=[];state.effects=[];
 state.loot=[{id:0,x:0,z:-4,kind:'ammo',picked:false}];
 state.zone.radius=95;
 const props=[];
 const box=renderer.dynamic.box.bind(renderer.dynamic);
 renderer.dynamic.box=(x,y,z,w,h,d,color)=>{props.push({x,y,z,w,h,d,color});return box(x,y,z,w,h,d,color);};
 renderer.draw(state);
 assert.equal(renderer.lastVisibilityStats.zoneVisible,0);
 assert.equal(renderer.lastVisibilityStats.zoneTotal,0);
 assert.equal(props.length,2,'only grounded cache and its base, never ring pylons');
 assert.ok(props.every(p=>p.x===0&&p.z===-4&&p.y<=.09&&p.h<=.18));
 assert.equal(renderer.dynamic.count,72);
});
