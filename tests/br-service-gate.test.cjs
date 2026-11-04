'use strict';
// BR service-yard world interaction: physical route, 60Hz state, persistence,
// WebGL parity, and PC controller. Node tests do not certify Windows hardware.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');
const Graphics=require('../src/graphics.js');
const Performance=require('../src/performance.js');

function yard(seed=21101){
 const game=Sim.newMatch(seed,1);
 game.status='playing';
 game.player.x=Sim.SERVICE_YARD.switchX;
 game.player.z=Sim.SERVICE_YARD.switchZ;
 game.player.yaw=0;
 return game;
}
function panel(game){return game.obstacles.find(o=>o.routeId==='br-service-gate');}

test('BR gated service-yard road requires a local PC-reachable switch and actual sliding geometry',()=>{
 const game=yard();
 assert.ok(panel(game));
 assert.equal(panel(game).x,Sim.SERVICE_YARD.x);
 assert.equal(Sim.blocked(30,-24,.85,game.obstacles),true,'closed gate has a solid body');
 game.player.x=0;game.player.z=0;
 assert.deepEqual(Sim.operateServiceGate(game),{ok:false,reason:'out_of_reach'});
 assert.equal(game.yardGate.engaged,false);
 game.player.x=30;game.player.z=-21.8;
 assert.equal(Sim.serviceGateStatus(game).near,true);
 assert.equal(Sim.operateServiceGate(game).ok,true);
 assert.deepEqual(Sim.operateServiceGate(game),{ok:false,reason:'already_engaged'});
 assert.equal(game.yardGate.progress,0,'interacting does not teleport panel open');
 Sim.tick(game,1/60,{});
 assert.ok(game.yardGate.progress>0&&game.yardGate.progress<1);
 assert.ok(panel(game).x>30&&panel(game).x<37.2);
 for(let i=0;i<121;i++)Sim.tick(game,1/60,{});
 assert.ok(Math.abs(game.yardGate.progress-1)<1e-12);
 assert.ok(Math.abs(panel(game).x-37.2)<1e-9);
 assert.equal(Sim.blocked(30,-24,.85,game.obstacles),false,'opening clears the passage');
 const x=game.player.x;
 for(let i=0;i<50;i++)Sim.tick(game,1/60,{forward:true});
 assert.ok(game.player.z<-24,'a character can now traverse the formerly blocked passage');
 assert.equal(game.player.x,x);
});

test('BR fixed-step gate movement and one-way progression replay byte-identically from a mid-slide checkpoint',()=>{
 const first=yard(21102);
 assert.equal(Sim.operateServiceGate(first).ok,true);
 for(let i=0;i<45;i++)Sim.tick(first,1/60,{});
 const snapshot=Sim.snapshotMatch(first);
 const resumed=Sim.restoreMatch(snapshot);
 assert.equal(resumed.yardGate.engaged,true);
 assert.equal(resumed.yardGate.progress,first.yardGate.progress);
 assert.equal(panel(resumed).x,panel(first).x);
 for(let i=0;i<145;i++){
  Sim.tick(first,1/60,{forward:i>125});
  Sim.tick(resumed,1/60,{forward:i>125});
 }
 assert.equal(Sim.snapshotMatch(resumed),Sim.snapshotMatch(first));
 assert.equal(Sim.serviceGateStatus(resumed).open,true);
});

test('BR gate validates saved motor state and migrates older closed-gate checkpoints',()=>{
 const game=yard(21103);
 const older=JSON.parse(Sim.snapshotMatch(game));
 delete older.yardGate;
 const legacy=Sim.restoreMatch(JSON.stringify(older));
 assert.deepEqual(legacy.yardGate,{engaged:false,progress:0});
 assert.equal(panel(legacy).x,30);
 const injected={...older,yardGate:{engaged:false,progress:.75}};
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(injected)),/gate/i);
 const impossible={...older,yardGate:{engaged:true,progress:1.01}};
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(impossible)),/gate/i);
 game.yardGate={engaged:false,progress:.75};
 assert.throws(()=>Sim.snapshotMatch(game),/gate/i,
  'writer refuses to overwrite a usable save with fabricated gate motion');
});

test('BR yard panel is rendered at the live collider position without changing state or 3D visibility budget',()=>{
 const state=yard(21104);
 const GL={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
  ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,
  LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
  createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
  createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
  useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
  enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},
  bufferData(){},bufferSubData(){},vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},
  viewport(){},clearColor(){},clear(){},uniformMatrix4fv(){},uniform3f(){},uniform1f(){},
  getExtension:()=>null};
 const context=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Performance,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const renderer=new context.VeilpointRenderer({clientWidth:800,clientHeight:600,
  getContext:type=>type==='webgl2'?GL:null});
 state.player.x=30;state.player.z=-21.8;state.player.yaw=0;
 const observed=[];
 const box=renderer.dynamic.box.bind(renderer.dynamic);
 renderer.dynamic.box=(x,y,z,w,h,d,color)=>{
  if(w===6&&h===2.3&&d===.6)observed.push({x,z});
  return box(x,y,z,w,h,d,color);
 };
 const before=JSON.stringify(state.yardGate);
 renderer.draw(state);
 assert.deepEqual(observed.at(-1),{x:30,z:-24});
 assert.equal(renderer.dynamic.count,renderer.lastVisibilityStats.estimatedDynamicVertices);
 assert.equal(JSON.stringify(state.yardGate),before,'drawing never advances the panel');
 assert.equal(Sim.operateServiceGate(state).ok,true);
 for(let i=0;i<120;i++)Sim.tick(state,1/60,{});
 renderer.draw(state);
 assert.deepEqual(observed.at(-1),{x:panel(state).x,z:-24});
 assert.equal(renderer.dynamic.count,renderer.lastVisibilityStats.estimatedDynamicVertices);
});

test('BR PC input, HUD and minimap use the real service gate instead of a menu-only flag',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/Game\.operateServiceGate\(simulation\)/);
 assert.match(app,/SERVICE YARD GATE OPENING/);
 assert.match(app,/Game\.serviceGateStatus\(simulation\)/);
 const story=require('../src/story-slice.js').createState();
 assert.equal(story.world.obstacles.some(o=>o.routeId==='br-service-gate'),false,
  'CH01 must not acquire a BR-only obstacle');
});
