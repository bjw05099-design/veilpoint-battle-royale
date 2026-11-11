'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Visibility=require('../src/visibility.js');
const Camera=require('../src/camera-view.js');
const Sim=require('../src/simulation.js');
const Graphics=require('../src/graphics.js');
const Performance=require('../src/performance.js');

test('changing from narrow to wide PC FOV actually retains visible edge objects in render plan',()=>{
 const state=Sim.newMatch(20261111,0),angle=53*Math.PI/180;
 const target={id:97,x:Math.sin(angle)*72,z:-Math.cos(angle)*72,alive:true};
 state.player.x=0;state.player.z=0;state.player.yaw=0;
 state.bots=[target];state.loot=[];state.effects=[];state.obstacles=[];
 const snapshot=JSON.stringify(state);
 const narrow=Visibility.planVisible(state,16/9,48*Math.PI/180);
 const wide=Visibility.planVisible(state,16/9,78*Math.PI/180);
 assert.equal(narrow.stats.botsVisible,0,
  'narrow camera does not rasterize a genuinely offscreen subject');
 assert.equal(wide.stats.botsVisible,1,
  'wide configured projection must not discard a genuinely onscreen subject');
 assert.equal(JSON.stringify(state),snapshot,'display-only budget cannot alter 60Hz world');
 assert.ok(Visibility.halfHorizontalFov(16/9,78*Math.PI/180)>
  Visibility.halfHorizontalFov(16/9,48*Math.PI/180));
 assert.throws(()=>Visibility.halfHorizontalFov(16/9,Infinity),RangeError);
 assert.throws(()=>Visibility.halfHorizontalFov(16/9,0),RangeError);
});
test('renderer forwards actual FOV to both static and dynamic geometry culling on each PC frame',()=>{
 const received=[],real=Visibility;
 const observed={...real,
  halfHorizontalFov(aspect,fov){received.push(['static',fov]);return real.halfHorizontalFov(aspect,fov);},
  planVisible(state,aspect,fov){received.push(['dynamic',fov]);return real.planVisible(state,aspect,fov);}
 };
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
 DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
 createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
 enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},
 bufferData(){},bufferSubData(){},vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},
 viewport(){},clearColor(){},clear(){},uniformMatrix4fv(){},uniform3f(){},uniform1f(){},
 getExtension:()=>null};
 const scope=vm.createContext({VeilpointSim:Sim,VeilpointCameraView:Camera,
 VeilpointGraphics:Graphics,VeilpointPerformance:Performance,VeilpointVisibility:observed,
 devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8'),scope);
 const viewer=new scope.VeilpointRenderer({clientWidth:1280,clientHeight:720,
  getContext:k=>k==='webgl2'?gl:null});
 const game=Sim.newMatch(2048,0),before=JSON.stringify(game);
 for(const degree of [48,78]){
  received.length=0;
  viewer.setFieldOfView(degree);
  viewer.draw(game);
  assert.ok(received.some(x=>x[0]==='static'),'static facade chunks were culled');
  assert.ok(received.some(x=>x[0]==='dynamic'),'dynamic character planning was culled');
  assert.ok(received.every(([,actual])=>Math.abs(actual-degree*Math.PI/180)<1e-10),
    'all geometry classes use the actual configured PC projection');
 }
 assert.equal(JSON.stringify(game),before,'FOV never changes simulation outcomes or checkpoint');
});
test('the offline Canvas2D path and WebGL path are both wired to the same camera lens preference',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(text,/Visibility\.planVisible\(state,w\/Math\.max\(h,1\),this\.verticalFov\*Math\.PI\/180\)/);
 assert.match(text,/Visibility\.planVisible\(state,this\.lastWidth\/Math\.max\(this\.lastHeight,1\),this\.verticalFov\*Math\.PI\/180\)/);
 assert.match(text,/Visibility\.halfHorizontalFov\(this\.lastWidth\/Math\.max\(this\.lastHeight,1\),this\.verticalFov\*Math\.PI\/180\)/);
 assert.deepEqual(Camera.OPTIONS,[48,55,63,70,78]);
});
