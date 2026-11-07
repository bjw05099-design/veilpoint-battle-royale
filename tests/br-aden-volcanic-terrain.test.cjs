'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');
const Graphics=require('../src/graphics.js');
const Performance=require('../src/performance.js');
const ROCKS=[[-158,43,7,9,5.3],[-155,62,8,7,6.5],[-151,82,7,10,4.7],
 [-133,74,9,7,3.9],[-116,97,7,9,5.1]];
const terrain=game=>game.obstacles.filter(o=>o.type==='volcanic-outcrop');
test('five real volcanic outcrops are collidable BR world bodies, with continuous open gaps',()=>{
 for(const seed of [1,44,20261107])for(const site of Object.keys(Sim.ENTRY_SITES)){
  const game=Sim.newMatch(seed,18,'carbine',false,site,'day');
  assert.deepEqual(terrain(game).map(o=>[o.x,o.z,o.w,o.d,o.h]),ROCKS);
  for(const rock of terrain(game)){
   assert.equal(Sim.blocked(rock.x,rock.z,.85,game.obstacles),true);
   assert.equal(Sim.blocked(rock.x,rock.z,.85,[]),false);
  }
  for(let x=-168;x<=-136;x+=2){
   assert.equal(Sim.blocked(x,53,.85,terrain(game)),false,
    'open rocky lane must have actual walkable centerline at x='+x);
  }
  assert.equal(Sim.blocked(game.player.x,game.player.z,.85,game.obstacles),false);
  for(const b of game.bots)assert.equal(Sim.blocked(b.x,b.z,.85,game.obstacles),false);
  for(const o of game.loot)assert.equal(Sim.blocked(o.x,o.z,.85,game.obstacles),false);
  assert.equal(game.loot.length,40);
 }
});
test('new BR coastal rocks persist across save, but historical terrain is restored exactly',()=>{
 const fresh=Sim.newMatch(505,4,'carbine',false,'west','dusk');
 fresh.status='playing';
 assert.equal(fresh.terrainRevision,1);
 const saved=Sim.snapshotMatch(fresh);
 const restored=Sim.restoreMatch(saved);
 assert.equal(restored.terrainRevision,1);
 assert.deepEqual(terrain(restored),terrain(fresh));
 assert.equal(Sim.snapshotMatch(restored),saved);
 const old=JSON.parse(saved);delete old.terrainRevision;
 const legacy=Sim.restoreMatch(old);
 assert.equal(legacy.terrainRevision,0);
 assert.equal(terrain(legacy).length,0);
 assert.equal(JSON.parse(Sim.snapshotMatch(legacy)).terrainRevision,0);
 const stable=Sim.restoreMatch(Sim.snapshotMatch(legacy));
 assert.equal(stable.terrainRevision,0);
 assert.deepEqual(stable.player,legacy.player);
 assert.equal(stable.random.getState(),legacy.random.getState());
 old.terrainRevision=999;
 assert.throws(()=>Sim.restoreMatch(old),/Invalid saved BR terrain revision/);
 fresh.terrainRevision=999;
 assert.throws(()=>Sim.snapshotMatch(fresh),/Invalid BR terrain revision/);
});
function mockGL(){
 let records=[],buffers=0;
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,TRIANGLES:9,
 DEPTH_TEST:10,LEQUAL:11,CULL_FACE:12,BACK:13,
 COLOR_BUFFER_BIT:14,DEPTH_BUFFER_BIT:15,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
 createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},getAttribLocation:()=>0,getUniformLocation:()=>({}),enableVertexAttribArray(){},
 enable(){},depthFunc(){},cullFace(){},createBuffer:()=>({id:++buffers}),bindBuffer(){},bufferData(){},
 bufferSubData:(_a,_b,data,start,count)=>{if(count>50000)records.push(Float32Array.from(data.subarray(start,start+count)));},
 vertexAttribPointer(){},drawArrays(){},deleteBuffer(){},viewport(){},clearColor(){},clear(){},
 uniformMatrix4fv(){},uniform3f(){},uniform1f(){},getExtension:()=>null};
 return {gl,records};
}
test('WebGL static terrain follows legacy/new 60Hz collision revision; Canvas shows rock class',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const env=vm.createContext({VeilpointSim:Sim,VeilpointGraphics:Graphics,
  VeilpointPerformance:Performance,VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(code,env);
 const fake=mockGL();
 const canvas={clientWidth:960,clientHeight:540,getContext:()=>fake.gl};
 const renderer=new env.VeilpointRenderer(canvas);
 const old=Sim.newMatch(3,0,'carbine',false,'central','day',0);
 const next=Sim.newMatch(3,0);
 const original=JSON.stringify(next);
 renderer.draw(old);
 assert.equal(renderer.worldTerrainRevision,0);
 const before=renderer.static.count,buffer=renderer.static.buffer;
 renderer.draw(next);
 assert.equal(renderer.worldTerrainRevision,1);
 assert.notEqual(renderer.static.buffer,buffer);
 assert.ok(renderer.static.count>before,'physical rocks must produce additional opaque vertices');
 assert.equal(JSON.stringify(next),original);
 assert.equal(code.includes("o.type==='volcanic-outcrop'?'volcanic-outcrop'"),true);
 assert.equal(code.includes("o.type==='volcanic-outcrop'?'#464644'"),true);
 renderer.draw(old);
 assert.equal(renderer.worldTerrainRevision,0,'old world cannot display newly built solid rocks');
});
