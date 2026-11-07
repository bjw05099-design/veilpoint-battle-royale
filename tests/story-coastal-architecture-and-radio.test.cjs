'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Comms=require('../src/story-comms.js');
const Graphics=require('../src/graphics.js'),Performance=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
test('CH01 actual player injury, reload, finite resources and completed ally report alter original dialogue',()=>{
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.phase,'engagement');
 assert.equal(Comms.briefing(s).speaker,'조현지');
 s.combat.supportUsed=true;
 assert.equal(Comms.briefing(s).speaker,'김도겸 중사');
 s.world.player.charges=4;
 assert.match(Comms.briefing(s).message,/휴대 자원/);
 s.world.player.charges=48;s.world.player.reloadRemaining=20;
 assert.match(Comms.briefing(s).message,/장비 상태/);
 s.world.player.health=32;
 assert.equal(Comms.briefing(s).speaker,'이수혁 대위');
 assert.match(Comms.briefing(s).message,/부상/);
});
test('CH01 contextual radio does not reveal hidden opponent position or change checkpoint schema',()=>{
 const s=Story.createState(),before=Story.serialize(s);
 s.phase='engagement';s.world.player.health=80;
 const line=Comms.briefing(s);
 s.world.bots=[{x:153,z:-135,alive:true},{x:0,z:-2,alive:false}];
 assert.deepEqual(Comms.briefing(s),line,'hidden or inactive NPC data must never be included');
 assert.doesNotMatch(line.message,/153|135|좌측|우측|적 위치/);
 const original=Story.createState();
 assert.equal(Story.serialize(original),before,'reading comms does not change persisted data');
 const restored=Story.restore(before);
 assert.deepEqual(Comms.briefing(restored),Comms.briefing(original));
});
function fakeGL(){
 let capture=null;
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
 DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,
 COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
 createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
 enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},bufferData(){},
 bufferSubData:(_a,_b,data,_start,count)=>{if(count>10000)capture=Float32Array.from(data.subarray(0,count));},
 vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},viewport(){},clearColor(){},
 clear(){},uniformMatrix4fv(){},uniform3f(){},uniform1f(){},getExtension:()=>null};
 return {gl,get:()=>capture};
}
test('authored harbor facade window geometry uploads for older residences and industrial buildings',()=>{
 const rendererCode=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const env={VeilpointSim:Sim,VeilpointGraphics:Graphics,
 VeilpointPerformance:Performance,VeilpointVisibility:Visibility,devicePixelRatio:1};
 const scope=vm.createContext(env);vm.runInContext(rendererCode,scope);
 const capture=fakeGL();
 const renderer=new scope.VeilpointRenderer({clientWidth:1200,clientHeight:675,
 getContext:k=>k==='webgl2'?capture.gl:null});
 const story=Story.createState(),before=JSON.stringify(story.world);
 renderer.draw(story.world);
 const vertices=capture.get();
 assert.ok(vertices&&vertices.length>0,'native browser static scene must upload real geometry');
 function visibleAt(nearX,nearZ,nearY,rr,gg,bb){
  for(let i=0;i<vertices.length;i+=9){
   if(Math.abs(vertices[i]-nearX)<2&&Math.abs(vertices[i+1]-nearY)<.55&&
      Math.abs(vertices[i+2]-nearZ)<.2&&
      Math.abs(vertices[i+6]-rr)<.17&&Math.abs(vertices[i+7]-gg)<.15&&
      Math.abs(vertices[i+8]-bb)<.15)return true;
  }return false;
 }
 assert.ok(visibleAt(-46.05,-27.975,2.7,.19,.23,.24),
  'historic frontage must actually emit a second-floor window quad');
 assert.ok(visibleAt(41.6,-67.475,3.35,.19,.23,.24)||visibleAt(42.14,-67.475,3.35,.19,.23,.24)||
  renderer.static.count>2500,'harbor scene must generate distinct warehouse geometry');
 assert.equal(JSON.stringify(story.world),before,'render-only historic styling may not change the world');
 for(const point of Object.values(Story.POINTS))
  assert.equal(Sim.blocked(point.x,point.z,.85,story.world.obstacles),false,
   'existing real approach to '+point.id+' must remain navigable');
 assert.match(rendererCode,/o\.type==='story-building'\?'story-building'/);
 assert.match(rendererCode,/o\.type==='story-warehouse'\?'story-warehouse'/);
 assert.match(rendererCode,/p\.z>o\.z\+o\.d\/2/);
});
