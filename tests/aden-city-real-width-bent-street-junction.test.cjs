'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Streets=require('../src/aden-preview-streets.js');
const source={provider:'VEILPOINT original civil demo',observedDate:'2026-11-12',
 license:'Original in-repository test art',reference:'invented-world',scope:'public-terrain',type:'artist-blockout'};
const corner={id:'fictional-bent-public-road',width:6,points:[
 {x:80,z:90},{x:92,z:90},{x:92,z:102}]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,String(a)+' != '+String(b));
function flat(){
 const tile=Tiles.createHeightTile({tx:0,tz:0,gridSize:17,source,
  samples:Array(17*17).fill(22)});
 const registry=Tiles.createRegistry([tile]);
 const cache=new Map([[tile.key,{sourceTile:tile,lod:1,mesh:Tiles.buildTerrainMesh(tile)}]]);
 return {registry,cache,active:new Set([tile.key])};
}

test('real right-angle 6m fictional road keeps its full lateral width at the corner',()=>{
 const stations=Streets.stations(corner);
 const edges=Streets.edges(corner);
 assert.equal(stations.length,5);
 assert.deepEqual(stations[2],{x:92,z:90});
 const [left,right]=edges[2];
 // Both incoming and outgoing normals have a 3m projection. The
 // former averaged tangent narrowed each half to 2.12m.
 near(left.z-90,3);near(92-left.x,3);
 near(90-right.z,3);near(right.x-92,3);
 near(Math.hypot(left.x-92,left.z-90),3*Math.SQRT2);
 near(Math.hypot(right.x-92,right.z-90),3*Math.SQRT2);
 for(const pair of edges)assert.ok(pair.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 assert.ok(Object.isFrozen(edges)&&Object.isFrozen(edges[2]));
});

test('the actual terrain-grounded street mesh uses mitered junction triangles with no invented collision',()=>{
 const terrain=flat();
 const output=Streets.triangulate(terrain.registry,terrain.cache,terrain.active,[corner]);
 assert.equal(output.length,8,'four consecutive physical street quadrilaterals');
 assert.ok(output.every(t=>t.roadId===corner.id));
 assert.ok(output.some(t=>t.vertices.some(v=>Math.abs(v[0]-89)<1e-8&&Math.abs(v[2]-93)<1e-8)));
 for(const tri of output)for(const p of tri.vertices){
  near(p[1],22+Streets.ELEVATION_OFFSET);
  assert.ok(Object.isFrozen(tri)&&Object.isFrozen(tri.vertices));
 }
 assert.equal(Streets.hasGameCollision,false);
 assert.equal(Streets.geographicAccuracyVerified,false);
});

test('straight roads retain their original centreline/width, unsupported corners never make pavement spikes',()=>{
 const straight={id:'fictional-straight',width:6,points:[{x:80,z:90},{x:98,z:90}]};
 const sections=Streets.edges(straight);
 for(const [left,right] of sections){
  near(left.z-right.z,6);near(left.x,right.x);
 }
 const reversal={id:'fictional-invalid-hairpin',width:6,points:[
  {x:80,z:90},{x:92,z:90},{x:81,z:90}]};
 assert.throws(()=>Streets.edges(reversal),/Reversing street|too sharp/);
 const noTerrain=Streets.triangulate(new Map(),new Map(),new Set(),[corner]);
 assert.equal(noTerrain.length,0,'no rendered roads over absent terrain');
});
