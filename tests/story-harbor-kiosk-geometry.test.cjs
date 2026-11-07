'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
const Graphics=require('../src/graphics.js'),Performance=require('../src/performance.js');
const Visibility=require('../src/visibility.js');
test('water kiosk is solid, outside worker route and keeps all CH01 interaction sites open',()=>{
 const s=Story.createState(),o=s.world.obstacles.find(o=>o.type==='story-water-kiosk');
 assert.deepEqual(o,{x:34,z:-12,w:2.6,d:2.2,h:2.4,type:'story-water-kiosk'});
 assert.equal(Sim.blocked(o.x,o.z,.85,s.world.obstacles),true);
 assert.equal(Sim.blocked(s.worker.x,s.worker.z,.55,s.world.obstacles),false);
 for(const target of Object.values(Story.POINTS))
  assert.equal(Sim.blocked(target.x,target.z,.85,s.world.obstacles),false,target.id+' access');
 const p=s.world.player;
 p.x=30;p.z=-12;p.yaw=0;
 for(let i=0;i<100;i++)Story.step(s,1/60,{right:true});
 assert.equal(Sim.blocked(p.x,p.z,.85,s.world.obstacles),false);
 assert.ok(p.x<o.x-o.w/2-.6,'the player must stop outside the real kiosk wall');
 assert.ok(p.x>30,'the pedestrian can walk toward the kiosk before collision');
 const br=Sim.newMatch(20261027,0,'carbine');
 assert.equal(br.obstacles.some(o=>o.type==='story-water-kiosk'),false,
   'story-only waterfront scenery must not leak into battle royale');
});
function fakeGL(){
 const uploads=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
 DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,
 COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
 createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
 enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},bufferData(){},
 bufferSubData:(_target,_offset,data,_start,count)=>{if(count>10000)uploads.push(Float32Array.from(data.subarray(0,count)));},
 vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},viewport(){},clearColor(){},
 clear(){},uniformMatrix4fv(){},uniform3f(){},uniform1f(){},getExtension:()=>null};
 return {gl,uploads};
}
test('the authored water kiosk creates actual WebGL mesh, not just a text marker',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const env={VeilpointSim:Sim,VeilpointGraphics:Graphics,VeilpointPerformance:Performance,
 VeilpointVisibility:Visibility,devicePixelRatio:1};
 const context=vm.createContext(env);vm.runInContext(source,context);
 const capture=fakeGL();
 const renderer=new context.VeilpointRenderer({clientWidth:1280,clientHeight:720,
  getContext:k=>k==='webgl2'?capture.gl:null});
 const s=Story.createState(),original=Story.serialize(s);
 renderer.draw(s.world);
 assert.ok(capture.uploads.length>0,'static geometry uploaded to GPU');
 const hasKiosk=capture.uploads.some(vertices=>{
  for(let i=0;i+8<vertices.length;i+=9){
   if(Math.abs(vertices[i]-34)<1.5&&
      Math.abs(vertices[i+2]+12)<1.4&&
      vertices[i+1]>=0&&vertices[i+1]<=2.7&&
      Math.abs(vertices[i+6]-.55)<.02&&
      Math.abs(vertices[i+7]-.48)<.02&&
      Math.abs(vertices[i+8]-.39)<.02)return true;
  }return false;
 });
 assert.equal(hasKiosk,true,'stone facade must be present in the emitted 3D vertex data');
 assert.equal(Story.serialize(s),original,'drawing may not mutate the live chapter state');
 assert.match(source,/story-water-kiosk'\?'#8d7b64'/,
   'Canvas fallback must also give the kiosk a visible grounded material');
});
