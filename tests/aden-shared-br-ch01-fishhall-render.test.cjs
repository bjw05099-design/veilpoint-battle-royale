'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Graphics=require('../src/graphics.js'),Perf=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
function fakeGl(){
 const uploads=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,
 LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
 createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),
 enableVertexAttribArray(){},enable(){},depthFunc(){},cullFace(){},
 createBuffer:()=>({}),bindBuffer(){},bufferData(){},
 bufferSubData:(_t,_o,data,start,count)=>uploads.push(Float32Array.from(data.subarray(start,start+count))),
 vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},viewport(){},
 clearColor(){},clear(){},uniformMatrix4fv(){},uniform3f(){},uniform1f(){},
 getExtension:()=>null};
 return {gl,uploads};
}
test('new shared 3D stone and wood is rendered from real physical bodies in both BR and CH01',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/o\.type\.startsWith\('aden-fishhall-'\)\?o\.type/);
 assert.match(source,/o\.type==='aden-fishhall-wall'\?'#afa18d'/,
  'Canvas fallback distinguishes fish hall stone from existing crates');
 const env=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(source,env);
 const fake=fakeGl(),renderer=new env.VeilpointRenderer(
  {clientWidth:640,clientHeight:360,getContext:t=>t==='webgl2'?fake.gl:null});
 for(const [mode,world] of [['br',Sim.newMatch(17,0)],['nahrin',Story.createState().world]]){
  // Distant geography is legitimately culled; stand at the public entrance.
  world.player.x=-154;world.player.z=105;world.player.yaw=Math.PI;
  // Static BR geometry uploads at Renderer construction, before draw().
  // Reset only on CH01's scene transition, which rebuilds the static mesh.
  if(mode==='nahrin')fake.uploads.length=0;
  const checkpoint=JSON.stringify(world);
  renderer.draw(world);
  assert.equal(renderer.sceneMode,mode);
  let found=false;
  for(const vertices of fake.uploads)for(let i=0;i<vertices.length-8;i+=9){
   if(Math.abs(vertices[i]+164)<1&&Math.abs(vertices[i+2]-121)<11&&
       Math.abs(vertices[i+6]-.65)<.003&&Math.abs(vertices[i+7]-.59)<.003){
    found=true;break;
   }
  }
  assert.equal(found,true,'real hall wall mesh must be visible in '+mode);
  assert.equal(JSON.stringify(world),checkpoint,'rendering is read-only');
 }
});
