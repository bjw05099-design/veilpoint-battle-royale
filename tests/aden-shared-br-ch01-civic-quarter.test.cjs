'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Visibility=require('../src/visibility.js');
const Graphics=require('../src/graphics.js');
const Perf=require('../src/performance.js');
const civic=obstacles=>obstacles.filter(o=>o.type?.startsWith('aden-civic-'));
const expected=[
 {x:64,z:125,w:.6,d:18,h:4,type:'aden-civic-wall'},
 {x:90,z:125,w:.6,d:18,h:4,type:'aden-civic-wall'},
 {x:77,z:134,w:26,d:.6,h:4,type:'aden-civic-wall'},
 {x:69,z:116,w:10,d:.6,h:4,type:'aden-civic-wall'},
 {x:85,z:116,w:10,d:.6,h:4,type:'aden-civic-wall'},
 {x:69,z:127,w:3,d:2,h:1.3,type:'aden-civic-stall'}
];
test('BR and CH01 consume identical common-city objects from one original world geometry source',()=>{
 const br=Sim.newMatch(91,0),ch=Story.createState();
 assert.deepEqual(civic(br.obstacles),expected);
 assert.deepEqual(civic(ch.world.obstacles),expected);
 assert.equal(ch.world.scene,'nahrin');
 for(const body of expected){
  assert.equal(Sim.blocked(body.x,body.z,.85,br.obstacles),true);
  assert.equal(Sim.blocked(body.x,body.z,.85,ch.world.obstacles),true);
 }
 assert.equal(Sim.blocked(77,116,.85,br.obstacles),false,'actual street entrance is open in BR');
 assert.equal(Sim.blocked(77,116,.85,ch.world.obstacles),false,'same physical entrance remains open in CH01');
 assert.equal(Sim.blocked(77,125,.85,ch.world.obstacles),false,'human can stand inside common city courtyard');
 for(const point of Object.values(Story.POINTS)){
  assert.equal(Sim.blocked(point.x,point.z,.85,ch.world.obstacles),false,'existing story objective '+point.id+' remains walkable');
 }
});
test('the same 60Hz movement traverses the continuous civic entrance in both modes',()=>{
 const br=Sim.newMatch(105,0),story=Story.createState();
 br.status='playing';
 for(const p of [br.player,story.world.player]){p.x=77;p.z=107;p.yaw=Math.PI;}
 for(let i=0;i<165;i++){
  // A zero-rival offline BR immediately completes after one full tick, so
  // inspect its actual fixed-step movement collider directly without
  // inventing a bot or bypassing the world obstacle array.
  Sim.moveEntity(br.player,0,6.1,1/60,br.obstacles);
  Story.step(story,1/60,{forward:true});
 }
 assert.ok(br.player.z>118&&br.player.z<133,'BR body actually enters market courtyard');
 assert.ok(story.world.player.z>118&&story.world.player.z<133,'CH01 walks the same connected route');
 assert.equal(Sim.blocked(br.player.x,br.player.z,.85,br.obstacles),false);
 assert.equal(Sim.blocked(story.world.player.x,story.world.player.z,.85,story.world.obstacles),false);
 const saved=Sim.snapshotMatch(br),restored=Sim.restoreMatch(saved);
 assert.deepEqual(civic(restored.obstacles),expected);
 assert.equal(Sim.snapshotMatch(restored),saved);
 const ss=Story.serialize(story),sr=Story.restore(ss);
 assert.deepEqual(civic(sr.world.obstacles),expected);
 assert.equal(Story.serialize(sr),ss);
});
function fakeGl(){
 const uploads=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({}),bindBuffer(){},bufferData(){},bufferSubData:(_t,_o,data,start,count)=>uploads.push(Float32Array.from(data.subarray(start,start+count))),vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},viewport(){},clearColor(){},clear(){},uniformMatrix4fv(){},uniform3f(){},uniform1f(){},getExtension:()=>null};
 return {gl,uploads};
}
test('common-city architectural material reaches both live 3D scenes and Canvas fallback',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const env=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,VeilpointPerformance:Perf,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(text,env);
 const fake=fakeGl(),renderer=new env.VeilpointRenderer({clientWidth:640,clientHeight:360,getContext:t=>t==='webgl2'?fake.gl:null});
 for(const [mode,world] of [['br',Sim.newMatch(1,0)],['nahrin',Story.createState().world]]){
  if(mode==='nahrin')fake.uploads.length=0;
  const prior=JSON.stringify(world);
  renderer.draw(world);
  assert.equal(renderer.sceneMode,mode);
  const vertices=fake.uploads.flatMap(v=>[v]);
  const wall=vertices.some(arr=>{
   for(let i=0;i<arr.length-8;i+=9){
    if(Math.abs(arr[i]-64)<1&&Math.abs(arr[i+2]-125)<10&&arr[i+1]>=0&&arr[i+1]<=4.2&&
       Math.abs(arr[i+6]-.57)<.002&&Math.abs(arr[i+7]-.49)<.002)return true;
   }
   return false;
  });
  assert.equal(wall,true,'WebGL 3D facade in '+mode+' must originate from common collision geometry');
  assert.equal(JSON.stringify(world),prior,'rendering does not mutate the 60Hz world');
 }
 assert.match(text,/o\.type==='aden-civic-wall'\?'#978774'/,
  'Canvas fallback draws the same shared building class');
});
