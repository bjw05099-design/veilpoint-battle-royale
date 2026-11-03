'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Graphics=require('../src/graphics.js');
const Perf=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
const go=(s,id)=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
function verifiedRoute(){
  const s=Story.createState();
  go(s,'terminal');assert.equal(Story.interact(s).ok,true);
  for(const b of s.world.bots)for(let i=0;i<2;i++){
    s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
    s.world.player.pitch=0;s.world.elapsed+=.21;
    assert.equal(Story.fire(s).hit,true);
  }
  assert.equal(s.phase,'records');
  for(const id of ['recordA','recordB']){go(s,id);assert.equal(Story.interact(s).ok,true);}
  go(s,'decision');assert.equal(Story.interact(s).ok,true);
  assert.equal(Story.choose(s,'verification').ok,true);
  return s;
}
test('CH01 east route reveals a reachable physical transmission log only after clearance',()=>{
  const s=verifiedRoute();
  assert.equal(Story.markers(s).some(m=>m.id==='gateLog'),false);
  go(s,'gateLog');assert.equal(Story.interact(s).ok,false,'no remote or premature evidence');
  for(let i=0;i<500;i++)Story.step(s,1/60,{});
  assert.equal(Story.situation(s).eastGateOpen,true);
  assert.equal(Story.markers(s).some(m=>m.id==='gateLog'),true);
  assert.equal(s.world.loot.some(m=>m.x===27&&m.z===-66),true,'visible marker must follow the 60Hz gate');
  assert.deepEqual(Story.interact(s),{ok:true,event:'gateLog',phase:'exit'});
  assert.equal(s.gateLogReviewed,true);
  assert.equal(s.world.gateLogReviewed,true);
  assert.equal(Story.markers(s).some(m=>m.id==='gateLog'),false);
  assert.match(Story.situation(s).evidence,/재전송/);
  const raw=Story.serialize(s),resumed=Story.restore(raw);
  assert.equal(Story.serialize(resumed),raw);
  go(resumed,'exitVerify');assert.equal(Story.interact(resumed).ok,true);
  const report=Story.debrief(resumed);
  assert.equal(report.gateLogReviewed,true);
  assert.equal(report.clockDiscrepancy,'retransmission-confirmed');
  assert.match(report.summary,/재전송/);
});
test('optional log does not block the original exit and forged/legacy checkpoints are handled',()=>{
  const s=verifiedRoute();
  for(let i=0;i<500;i++)Story.step(s,1/60,{});
  go(s,'exitVerify');assert.equal(Story.interact(s).ok,true);
  assert.equal(Story.debrief(s).gateLogReviewed,false);
  assert.equal(Story.debrief(s).clockDiscrepancy,'unresolved');
  const legacy=JSON.parse(Story.serialize(s));delete legacy.gateLogReviewed;
  assert.equal(Story.restore(JSON.stringify(legacy)).gateLogReviewed,false);
  const initial=JSON.parse(Story.serialize(Story.createState()));
  initial.gateLogReviewed=true;
  assert.throws(()=>Story.restore(JSON.stringify(initial)),RangeError);
  const premature=JSON.parse(Story.serialize(verifiedRoute()));
  premature.gateLogReviewed=true;
  assert.throws(()=>Story.restore(JSON.stringify(premature)),RangeError);
  premature.gateLogReviewed='true';
  assert.throws(()=>Story.restore(JSON.stringify(premature)),RangeError);
});
test('60Hz east log gate, interaction and saved replay are deterministic and BR-isolated',()=>{
  const s=verifiedRoute(),raw=Story.serialize(s);
  const a=Story.restore(raw),b=Story.restore(raw);
  for(let i=0;i<500;i++){Story.step(a,1/60,{});Story.step(b,1/60,{});}
  assert.equal(Story.serialize(a),Story.serialize(b));
  for(const state of [a,b]){go(state,'gateLog');Story.interact(state);}
  assert.equal(Story.serialize(a),Story.serialize(b));
  const br=Sim.newMatch(2,0);
  assert.equal(br.gateLogReviewed,undefined);
  assert.equal(br.scene,undefined);
});
test('east cabinet has authored 3D geometry and visibly changes indicator after review',()=>{
  const uploads=[];
  const gl={
    VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
    DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
    createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,
    createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,
    useProgram:()=>{},getAttribLocation:()=>0,getUniformLocation:()=>0,enableVertexAttribArray:()=>{},
    enable:()=>{},depthFunc:()=>{},cullFace:()=>{},createBuffer:()=>({}),bindBuffer:()=>{},
    bufferData:()=>{},bufferSubData:(_t,_o,verts,start,count)=>uploads.push(Float32Array.from(verts.subarray(start,start+count))),
    vertexAttribPointer:()=>{},drawArrays:()=>{},deleteBuffer:()=>{},viewport:()=>{},
    clearColor:()=>{},clear:()=>{},uniformMatrix4fv:()=>{},uniform3f:()=>{},uniform1f:()=>{},getExtension:()=>null
  };
  const ctx=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
    VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
  vm.runInContext(fs.readFileSync(__dirname+'/../src/renderer.js','utf8'),ctx);
  const renderer=new ctx.VeilpointRenderer({clientWidth:640,clientHeight:360,getContext:t=>t==='webgl2'?gl:null});
  const s=verifiedRoute();for(let i=0;i<500;i++)Story.step(s,1/60,{});
  const before=JSON.stringify(s.world);
  renderer.draw(s.world);
  assert.equal(JSON.stringify(s.world),before,'rendering never changes fixed-step state');
  const off=uploads.at(-1);
  go(s,'gateLog');Story.interact(s);renderer.draw(s.world);
  const on=uploads.at(-1);
  const hasIndicator=(data,r,g)=>{for(let i=0;i<data.length;i+=9)
    if(Math.abs(data[i]-26.725)<.02&&Math.abs(data[i+6]-r)<.02&&Math.abs(data[i+7]-g)<.02)return true;
    return false;
  };
  assert.equal(hasIndicator(off,.58,.42),true,'unreviewed cabinet indicator is amber');
  assert.equal(hasIndicator(on,.23,.48),true,'reviewed cabinet indicator is green');
  // The new report counter has a matching solid footprint and remains reachable
  // from its south-side interaction marker without walking through furniture.
  assert.equal(Sim.blocked(18,-42.9,.85,s.world.obstacles),true);
  assert.equal(Sim.blocked(Story.POINTS.reportDesk.x,Story.POINTS.reportDesk.z,.85,s.world.obstacles),false);
  go(s,'reportDesk');renderer.draw(s.world);
  const pending=uploads.at(-1);
  assert.equal(Story.interact(s).event,'reportDesk');
  renderer.draw(s.world);
  const delivered=uploads.at(-1);
  const hasDeskInk=(data,r,g)=>{for(let i=0;i<data.length;i+=9)
    if(Math.abs(data[i]-17.7)<.02&&Math.abs(data[i+6]-r)<.02&&Math.abs(data[i+7]-g)<.02)return true;
    return false;
  };
  assert.equal(hasDeskInk(pending,.60,.46),true,'pending receipt is amber');
  assert.equal(hasDeskInk(delivered,.22,.49),true,'submitted receipt turns green');
  renderer.draw(Sim.newMatch(3,0));
  assert.equal(renderer.sceneMode,'br','cabinet and counter geometry must not leak into BR');
});
