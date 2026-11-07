'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Camera=require('../src/camera-view.js');
const Sim=require('../src/simulation.js');
const Graphics=require('../src/graphics.js');
const Performance=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
function storage(){
 const m=new Map();
 return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};
}
function fakeGL(){
 const projection=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
 DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
 createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
 enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},
 bufferData(){},bufferSubData(){},vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},
 viewport(){},clearColor(){},clear(){},uniformMatrix4fv:(_l,_t,m)=>projection.push(Array.from(m)),
 uniform3f(){},uniform1f(){},getExtension:()=>null};
 return {gl,projection};
}
test('PC camera choices are exact bounded values, durable when available and safe on denied storage',()=>{
 assert.equal(Camera.DEFAULT,55);
 assert.deepEqual(Camera.OPTIONS,[48,55,63,70,78]);
 const disk=storage();
 assert.equal(Camera.read(disk),55);
 assert.equal(Camera.persist(disk,70),true);
 assert.equal(Camera.read(disk),70);
 assert.equal(disk.map.get(Camera.KEY),'70');
 disk.map.set(Camera.KEY,'105');
 assert.equal(Camera.read(disk),55,'unsupported external camera setting is rejected');
 assert.throws(()=>Camera.validate(NaN),RangeError);
 assert.throws(()=>Camera.validate('70'),RangeError);
 assert.throws(()=>Camera.persist(disk,99),RangeError);
 assert.equal(Camera.read({getItem(){throw Error('storage blocked');}}),55);
 assert.equal(Camera.persist({setItem(){throw Error('denied');},getItem(){return null;}},63),false);
});
test('WebGL view matrix changes immediately without altering deterministic 60Hz BR state',()=>{
 const fake=fakeGL();
 const scope=vm.createContext({VeilpointSim:Sim,VeilpointCameraView:Camera,
 VeilpointGraphics:Graphics,VeilpointPerformance:Performance,VeilpointVisibility:Visibility,
 devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),scope);
 const renderer=new scope.VeilpointRenderer({clientWidth:800,clientHeight:600,
 getContext:k=>k==='webgl2'?fake.gl:null});
 const game=Sim.newMatch(2048,1),before=JSON.stringify(game);
 assert.equal(renderer.verticalFov,55);
 renderer.setFieldOfView(48);renderer.draw(game);
 const narrow=fake.projection.at(-2)?.[5]||fake.projection.at(-1)?.[5];
 renderer.setFieldOfView(78);renderer.draw(game);
 const wide=fake.projection.at(-2)?.[5]||fake.projection.at(-1)?.[5];
 assert.ok(Number.isFinite(narrow)&&Number.isFinite(wide)&&narrow>wide,
   'narrower real camera FOV means greater projection scale');
 assert.equal(JSON.stringify(game),before,'camera changes must not mutate player, opponents or saves');
 assert.throws(()=>renderer.setFieldOfView(105),e=>e?.name==='RangeError');
 assert.equal(renderer.verticalFov,78);
});
test('Canvas fallback shares FOV preference and both game modes restore after GPU resets',()=>{
 const scope=vm.createContext({VeilpointSim:Sim,VeilpointCameraView:Camera,
 VeilpointGraphics:Graphics,VeilpointPerformance:Performance,VeilpointVisibility:Visibility,
 devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),scope);
 const fallback=new scope.VeilpointRenderer({clientWidth:800,clientHeight:600,
 getContext:k=>k==='2d'?{}:null});
 assert.ok(fallback.fallback);
 fallback.setFieldOfView(70);
 assert.equal(fallback.fallback.verticalFov,70);
 const rendererCode=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(rendererCode,/Math\.tan\(this\.verticalFov\*Math\.PI\/360\)/);
 const br=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const story=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const storyHtml=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 for(const page of [html,storyHtml])
  assert.match(page,/<script src="src\/camera-view\.js"><\/script>/);
 assert.match(html,/<select id="cameraFov"/);
 assert.match(storyHtml,/<select id="storyCameraFov"/);
 assert.match(br,/renderer\.setFieldOfView\(cameraFov\)/);
 assert.match(story,/renderer\.setFieldOfView\(cameraFov\)/);
 assert.match(br,/Camera\.persist\(cameraStorage\(\),cameraFov\)/);
 assert.match(story,/Camera\.persist\(cameraStorage\(\),cameraFov\)/);
});
