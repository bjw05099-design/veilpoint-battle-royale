'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const Graphics=require('../src/graphics.js');
const Perf=require('../src/performance.js');
const Visibility=require('../src/visibility.js');

function harness(){
 const uniforms=[],shaders=[],uploads=[];
 const gl={
  VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
  ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
  DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
  createShader:()=>({}),shaderSource:(_shader,source)=>shaders.push(source),
  compileShader:()=>{},getShaderParameter:()=>true,createProgram:()=>({}),
  attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,
  useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,
  enableVertexAttribArray:()=>{},enable:()=>{},depthFunc:()=>{},cullFace:()=>{},
  createBuffer:()=>({}),bindBuffer:()=>{},bufferData:()=>{},
  bufferSubData:(_target,_offset,vertices,start,count)=>uploads.push(Float32Array.from(vertices.subarray(start,start+count))),
  vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:()=>{},
  viewport:()=>{},clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},
  uniform3f:()=>{},uniform1f:(name,value)=>uniforms.push([name,value]),
  getExtension:()=>null
 };
 const context=vm.createContext({
  VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1
 });
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer({
  clientWidth:640,clientHeight:360,getContext:type=>type==='webgl2'?gl:null
 });
 const latest=name=>uniforms.filter(pair=>pair[0]===name).at(-1)?.[1];
 return {renderer,latest,shaders,uploads};
}
const go=(state,id)=>{
 const p=Story.POINTS[id];
 state.world.player.x=p.x;state.world.player.z=p.z;
};
function restoreRadio(state){
 go(state,'terminal');assert.equal(Story.interact(state).ok,true);
 for(const hostile of state.world.bots){
  for(let i=0;i<2;i++){
   state.world.player.yaw=Math.atan2(hostile.x-state.world.player.x,
     -(hostile.z-state.world.player.z));
   state.world.player.pitch=0;state.world.elapsed+=.21;
   assert.equal(Story.fire(state).ok,true);
  }
 }
 assert.equal(state.phase,'records');
 for(const id of ['recordA','recordB']){
  go(state,id);assert.equal(Story.interact(state).ok,true);
 }
 go(state,'relay');
 assert.equal(Story.interact(state).ok,true);
 assert.equal(state.relayRestored,true);
}

test('CH01 dusk lighting responds to an actual radio relay interaction and survives checkpoint restore',()=>{
 const h=harness();
 const state=Story.createState();
 assert.equal(state.world.relayRestored,false);
 const before=JSON.stringify(state.world);
 h.renderer.draw(state.world);
 assert.equal(h.latest('uNight'),1);
 assert.equal(h.latest('uRelayOn'),0);
 assert.equal(JSON.stringify(state.world),before,'renderer must not mutate 60Hz state');
 const fragment=h.shaders.find(src=>src.includes('uRelayOn'));
 assert.ok(fragment&&fragment.includes('distanceToLamp')&&fragment.includes('max(dot(N,normalize(delta)),0.)'),
   'lamp illumination must attenuate with distance and surface direction');
 restoreRadio(state);
 assert.equal(state.world.relayRestored,true,'relay interaction must reach renderer state');
 assert.match(state.message,/벽등 점등/);
 assert.match(Story.situation(state).radio,/벽등 점등/);
 const checkpoint=Story.serialize(state);
 const loaded=Story.restore(checkpoint);
 assert.equal(loaded.world.relayRestored,true,'saved relay power must restore before drawing');
 const restoredBefore=JSON.stringify(loaded.world);
 h.renderer.draw(loaded.world);
 assert.equal(h.latest('uNight'),1);
 assert.equal(h.latest('uRelayOn'),1);
 assert.equal(JSON.stringify(loaded.world),restoredBefore);
 assert.equal(Story.serialize(loaded),checkpoint,'lighting must not change checkpoint bytes');
 const br=Sim.newMatch(22,0);
 h.renderer.draw(br);
 assert.equal(h.latest('uNight'),0);
 assert.equal(h.latest('uRelayOn'),0,'BR must not inherit campaign lighting');
});

test('powered CH01 luminaires produce physical dynamic fixture vertices, not hovering markers',()=>{
 const h=harness();
 const state=Story.createState();
 h.renderer.draw(state.world);
 const off=h.uploads.at(-1);
 assert.ok(off.length>0);
 const maxColor=data=>{
  let maximum=0;
  for(let i=6;i<data.length;i+=9)maximum=Math.max(maximum,data[i]);
  return maximum;
 };
 const offPeak=maxColor(off);
 restoreRadio(state);
 h.renderer.draw(state.world);
 const on=h.uploads.at(-1);
 assert.ok(maxColor(on)>offPeak,'relay-powered fixtures must visibly change their material');
 assert.equal(state.world.obstacles.filter(o=>o.type?.startsWith('story-')).length,9,
   'wall-mounted lighting must not invent pass-through solid obstacles');
 for(const p of Object.values(Story.POINTS))
  assert.equal(Sim.blocked(p.x,p.z,.85,state.world.obstacles),false,p.id);
});

test('Canvas fallback displays a front-facing powered fixture without exposing it through the rear wall',()=>{
 const rects=[];
 const ctx={
  createLinearGradient:()=>({addColorStop:()=>{}}),
  fillRect:(x,y,w,h)=>rects.push({x,y,w,h,color:ctx.fillStyle}),
  beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},closePath:()=>{},
  fill:()=>{},stroke:()=>{}
 };
 const canvas={
  clientWidth:640,clientHeight:360,
  getContext:type=>type==='webgl2'?null:ctx
 };
 const context=vm.createContext({
  VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1
 });
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer(canvas);
 const state=Story.createState();
 state.world.player.x=-42;state.world.player.z=0;state.world.player.yaw=0;
 renderer.draw(state.world);
 assert.equal(rects.some(rect=>rect.color==='#ffdfa2'),false);
 restoreRadio(state);
 state.world.player.x=-42;state.world.player.z=0;state.world.player.yaw=0;
 rects.length=0;
 renderer.draw(state.world);
 assert.equal(rects.some(rect=>rect.color==='#ffdfa2'),true,
   'powered facade lens must be visible from the harbor road');
 state.world.player.z=-40;state.world.player.yaw=Math.PI;
 rects.length=0;
 renderer.draw(state.world);
 assert.equal(rects.some(rect=>rect.color==='#ffdfa2'),false,
   'do not draw a facade light through the rear of a solid building');
});
