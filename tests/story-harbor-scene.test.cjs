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
function fakeGl(){
 let buffers=0;const deleted=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray:()=>{},enable:()=>{},depthFunc:()=>{},cullFace:()=>{},createBuffer:()=>({id:++buffers}),bindBuffer:()=>{},bufferData:()=>{},bufferSubData:()=>{},vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:b=>deleted.push(b.id),viewport:()=>{},clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},uniform3f:()=>{},uniform1f:()=>{},getExtension:()=>null};
 return {gl,deleted};
}
test('authored Nahrin buildings are physically blocked and avoid all objective/exit points',()=>{
 const s=Story.createState();assert.equal(s.world.scene,'nahrin');
 const buildings=s.world.obstacles.filter(o=>o.type&&o.type.startsWith('story-'));
 assert.equal(buildings.length,8);
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