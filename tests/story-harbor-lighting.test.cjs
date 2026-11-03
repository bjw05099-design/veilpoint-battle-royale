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

test('CH01 harbor warning light requires a separate reachable PC E interaction and survives 60Hz replay',()=>{
 const state=Story.createState();
 assert.equal(Story.markers(state).some(p=>p.id==='beacon'),false);
 restoreRadio(state);
 assert.equal(state.beaconEnabled,false,'restoring the relay must not automatically operate the warning switch');
 assert.equal(state.world.beaconEnabled,false);
 assert.equal(Story.markers(state).some(p=>p.id==='beacon'),true);
 assert.equal(Story.interact(state).ok,false,'distant E cannot remotely operate the switch');
 state.world.player.x=Story.POINTS.beacon.x;
 state.world.player.z=Story.POINTS.beacon.z+2.5;
 assert.equal(Story.nearest(state),null,'the switch must not activate from a few metres away');
 assert.equal(Story.interact(state).ok,false);
 go(state,'beacon');
 assert.equal(Story.nearest(state).id,'beacon');
 assert.deepEqual(Story.interact(state),{ok:true,event:'beacon',phase:'records'});
 assert.equal(state.beaconEnabled,true);
 assert.equal(state.world.beaconEnabled,true);
 assert.equal(Story.markers(state).some(p=>p.id==='beacon'),true,
   'the powered manual switch stays reachable to turn the warning off');
 assert.match(Story.situation(state).warning,/점등/);
 const saved=Story.serialize(state);
 const restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 const a=Story.restore(saved),b=Story.restore(saved);
 for(let i=0;i<120;i++){Story.step(a,1/60,{forward:true});Story.step(b,1/60,{forward:true});}
 assert.equal(Story.serialize(a),Story.serialize(b),'same PC input must replay deterministically at 60Hz');
 go(restored,'decision');assert.equal(Story.interact(restored).ok,true);
 assert.equal(Story.choose(restored,'evacuation').ok,true);
 go(restored,'exitEvac');assert.equal(Story.interact(restored).ok,true);
 assert.equal(Story.debrief(restored).harborWarningEnabled,true);
 assert.match(Story.debrief(restored).summary,/경고등/);
});

test('CH01 warning-light saves migrate old checkpoints and reject invented power or early activation',()=>{
 const state=Story.createState();
 const early=JSON.parse(Story.serialize(state));
 early.beaconEnabled=true;
 assert.throws(()=>Story.restore(JSON.stringify(early)),RangeError);
 restoreRadio(state);
 const old=JSON.parse(Story.serialize(state));
 delete old.beaconEnabled;
 assert.equal(Story.restore(JSON.stringify(old)).beaconEnabled,false,'old v2 saves default to lamp off');
 const forged={...old,beaconEnabled:true,relayRestored:false};
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 const east=Story.restore(Story.serialize(state));
 go(east,'decision');assert.equal(Story.interact(east).ok,true);
 assert.equal(Story.choose(east,'verification').ok,true);
 assert.equal(Story.markers(east).some(p=>p.id==='beacon'),true,
   'manual warning remains optional after the player chooses the east route');
 go(east,'beacon');assert.equal(Story.interact(east).ok,true);
 assert.equal(Story.restore(Story.serialize(east)).beaconEnabled,true);
});

test('CH01 WebGL warning lamp changes material and local light only after manual activation; BR stays isolated',()=>{
 const h=harness(),state=Story.createState();
 h.renderer.draw(state.world);
 assert.equal(h.latest('uBeaconOn'),0);
 restoreRadio(state);
 h.renderer.draw(state.world);
 assert.equal(h.latest('uRelayOn'),1);
 assert.equal(h.latest('uBeaconOn'),0,'powered facade lighting is separate from manual warning');
 const before=Array.from(h.uploads.at(-1));
 go(state,'beacon');assert.equal(Story.interact(state).ok,true);
 const unchanged=JSON.stringify(state.world);
 h.renderer.draw(state.world);
 assert.equal(JSON.stringify(state.world),unchanged,'rendering must not mutate the 60Hz state');
 assert.equal(h.latest('uBeaconOn'),1);
 assert.notDeepEqual(Array.from(h.uploads.at(-1)),before,'the physical lens must change material');
 assert.ok(h.shaders.some(shader=>shader.includes('distanceToBeacon')),
   'warning light should illuminate only nearby facing surfaces');
 h.renderer.draw(Sim.newMatch(22,0));
 assert.equal(h.latest('uBeaconOn'),0,'BR must not inherit campaign warning state');
});

test('Canvas fallback shows the manual warning lamp only on the street-facing side',()=>{
 const rects=[];
 const ctx={
  createLinearGradient:()=>({addColorStop:()=>{}}),
  fillRect:(x,y,w,h)=>rects.push({color:ctx.fillStyle,x,y,w,h}),
  beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},closePath:()=>{},
  fill:()=>{},stroke:()=>{}
 };
 const context=vm.createContext({
  VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1
 });
 vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),context);
 const renderer=new context.VeilpointRenderer({
  clientWidth:640,clientHeight:360,
  getContext:type=>type==='webgl2'?null:ctx
 });
 const state=Story.createState();
 state.world.player.x=-42;state.world.player.z=0;state.world.player.yaw=0;
 renderer.draw(state.world);
 assert.equal(rects.some(rect=>rect.color==='#f5b55b'),false);
 restoreRadio(state);
 go(state,'beacon');assert.equal(Story.interact(state).ok,true);
 state.world.player.x=-42;state.world.player.z=0;state.world.player.yaw=0;
 rects.length=0;renderer.draw(state.world);
 assert.equal(rects.some(rect=>rect.color==='#f5b55b'),true);
 state.world.player.z=-40;state.world.player.yaw=Math.PI;
 rects.length=0;renderer.draw(state.world);
 assert.equal(rects.some(rect=>rect.color==='#f5b55b'),false);
});

test('CH01 powered harbor warning can be turned off and back on without losing 60Hz checkpoint continuity',()=>{
 const h=harness(),state=Story.createState();
 restoreRadio(state);go(state,'beacon');
 assert.equal(Story.interact(state).event,'beacon');
 h.renderer.draw(state.world);
 assert.equal(h.latest('uBeaconOn'),1);
 const on=Story.serialize(state);
 assert.equal(Story.restore(on).beaconEnabled,true);
 assert.equal(Story.interact(state).event,'beacon');
 assert.equal(state.beaconEnabled,false);
 assert.equal(state.world.beaconEnabled,false,'the world light must go dark in the same interaction');
 assert.match(Story.situation(state).warning,/소등/);
 assert.equal(Story.nearest(state).id,'beacon','PC E must still reach the physical switch');
 h.renderer.draw(state.world);
 assert.equal(h.latest('uBeaconOn'),0);
 const off=Story.serialize(state),a=Story.restore(off),b=Story.restore(off);
 for(let i=0;i<120;i++){Story.step(a,1/60,{});Story.step(b,1/60,{});}
 assert.equal(Story.serialize(a),Story.serialize(b),'replayed light-off state is deterministic');
 assert.equal(Story.interact(a).event,'beacon');
 assert.equal(a.beaconEnabled,true);
 assert.equal(Story.restore(Story.serialize(a)).world.beaconEnabled,true);
 const br=Sim.newMatch(17,0);
 h.renderer.draw(br);
 assert.equal(h.latest('uBeaconOn'),0,'a story-only switch never changes BR lighting');
});
