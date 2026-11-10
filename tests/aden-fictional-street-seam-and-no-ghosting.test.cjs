'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Streets=require('../src/aden-preview-streets.js');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const source=Explorer.SOURCE;
const approx=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,'expected '+a+' close to '+b);
function tile(tx,tz,height=undefined){
 const n=17,interval=512/(n-1);
 const sample=(x,z)=>height===undefined?20+.027*x+.016*z:height;
 return Tiles.createHeightTile({tx,tz,source,gridSize:n,
  samples:Array.from({length:n*n},(_,i)=>sample(
   tx*512+(i%n)*interval,tz*512+Math.floor(i/n)*interval))});
}
function loaded(registry,stride=2){
 const cache=new Map();
 for(const [key,terrain] of registry)
  cache.set(key,{sourceTile:terrain,lod:stride,
   mesh:Tiles.buildTerrainMesh(terrain,stride)});
 return cache;
}
test('three authored civilian quarters have actual spaced 6m streets and two ordinary links, not georeferenced roads',()=>{
 assert.equal(Streets.QUARTERS.length,3);
 assert.equal(Streets.ROUTES.length,32);
 assert.equal(Streets.geographicAccuracyVerified,false);
 assert.equal(Streets.hasGameCollision,false);
 assert.equal(Streets.ROUTES.filter(r=>r.id.includes('fictional-')).length,2);
 assert.ok(Object.isFrozen(Streets.ROUTES));
 assert.ok(Object.isFrozen(Streets.ROUTES[0]));
 const houses=Explorer.CIVIC_SHELLS;
 assert.equal(houses.length,105);
 for(const b of Streets.QUARTERS){
  const districtHouses=houses.filter(h=>
   Math.abs(h.x-b.x)<=81&&Math.abs(h.z-b.z)<=60);
  assert.equal(districtHouses.length,35,'street alignment is grounded in visible 7x5 built block');
  for(const street of Streets.ROUTES.filter(r=>r.id.startsWith(b.id))){
   const points=Streets.stations(street,6);
   assert.ok(points.length>=25);
   assert.ok(Math.hypot(points[0].x-points.at(-1).x,
    points[0].z-points.at(-1).z)>150);
   for(let i=1;i<points.length;i++){
    const step=Math.hypot(points[i].x-points[i-1].x,
     points[i].z-points[i-1].z);
    assert.ok(step<=6.00001&&step>0);
   }
   assert.ok(Streets.edges(street).every(p=>p.length===2));
   // No finished road centreline may cut through a building's real footprint.
   for(const p of points)for(const h of districtHouses)
    assert.ok(Math.abs(p.x-h.x)>h.w/2+street.width/2-.01||
      Math.abs(p.z-h.z)>h.d/2+street.width/2-.01,
      'a road lies in actual civic gaps: '+street.id);
  }
 }
});
test('road mesh crosses a REAL continuous 512m tile seam using current painted LOD triangles',()=>{
 const left=tile(0,0),right=tile(1,0),registry=Tiles.createRegistry([left,right]);
 assert.equal(Tiles.auditSeam(left,right,1e-7).pass,true);
 const road={id:'original-civilian-test-bridge',width:6,
  points:[{x:498,z:100},{x:530,z:100}]};
 for(const stride of [1,2,4,8]){
  const cache=loaded(registry,stride);
  const mesh=Streets.triangulate(registry,cache,new Set(registry.keys()),[road]);
  assert.ok(mesh.length>2);
  const xs=mesh.flatMap(t=>t.vertices.map(p=>p[0]));
  assert.ok(xs.some(x=>x<512)&&xs.some(x=>x>512));
  for(const tri of mesh){
   assert.ok(Object.isFrozen(tri)&&Object.isFrozen(tri.vertices));
   for(const p of tri.vertices){
    const key=Tiles.tileFor(p[0],p[2]).key;
    const ground=Tiles.heightOnTerrainMesh(cache.get(key).mesh,p[0],p[2]);
    approx(p[1],ground+Streets.ELEVATION_OFFSET);
   }
  }
  const partial=Streets.triangulate(registry,cache,new Set(['aden:0:0']),[road]);
  assert.ok(partial.length<mesh.length,'road cannot bridge into an unloaded neighbor');
  assert.ok(partial.every(t=>t.vertices.every(p=>p[0]<512)),
   'unknown east bank must not receive a fake public surface');
 }
});
test('unknown sea tile, stale source cache, and absent registry cannot manufacture a paved street',()=>{
 const water=tile(0,0,-3),reg=Tiles.createRegistry([water]),cache=loaded(reg);
 const road={id:'original-seaside-test',width:6,
  points:[{x:15,z:40},{x:200,z:40}]};
 assert.deepEqual(Streets.triangulate(reg,cache,new Set(reg.keys()),[road]),[]);
 assert.deepEqual(Streets.triangulate(new Map(),new Map(),new Set(),[road]),[]);
 const rebuilt=tile(0,0,-2);
 const changed=Tiles.createRegistry([rebuilt]);
 assert.deepEqual(Streets.triangulate(changed,cache,new Set(changed.keys()),[road]),[],
  'a mesh cached from a different same-key tile must never be drawn');
 assert.throws(()=>Streets.triangulate(reg,cache,[],[road]),/Invalid terrain street mesh/);
 assert.throws(()=>Streets.stations({id:'bad',width:0,points:[]}),/Invalid original street path/);
});
test('terrain preview stays separate from existing 60Hz story and authoritative BR collision',()=>{
 const before=Story.serialize(Story.createState()),match=Sim.newMatch(1985,0);
 const obstacles=match.obstacles.map(o=>({...o}));
 const registry=Explorer.createPreviewRegistry();
 const dummy={fillStyle:'',strokeStyle:'',beginPath(){},moveTo(){},lineTo(){},
  closePath(){},fill(){},stroke(){},fillRect(){},strokeRect(){}};
 const canvas={width:1280,height:720,getContext:()=>dummy};
 const result=Explorer.draw(canvas,registry,Explorer.viewState(),new Map());
 assert.ok(result.roadTriangles>0&&result.triangles>0);
 assert.equal(result.realAdenTilesLoaded,0);
 assert.deepEqual(match.obstacles,obstacles);
 assert.equal(Story.serialize(Story.restore(before)),before);
});
