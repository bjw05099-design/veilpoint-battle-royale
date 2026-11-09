'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const areas=Sim.PUBLIC_CITY_PAVEMENTS;

test('four public district surfaces have genuinely traversable footprints in both existing game modes',()=>{
 assert.deepEqual(areas.map(a=>a.id),['tawahi','mualla','crater','khormaksar']);
 const br=Sim.newMatch(20971,0),story=Story.createState();
 for(const a of areas){
  const district=Sim.PUBLIC_CITY_DISTRICTS.find(x=>x.id===a.id);
  assert.deepEqual([a.x,a.z],[district.x,district.z]);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.color),true);
  assert.ok(a.w>=10&&a.d>=8);
  for(const obstacles of [br.obstacles,story.world.obstacles]){
   // Each surface has a clear walkable approach, not an inaccessible building.
   assert.equal(Sim.blocked(a.x,a.z,.85,obstacles),false,a.id+' centre blocked');
   for(const [dx,dz] of [[-2,0],[2,0],[0,-2],[0,2]])
    assert.equal(Sim.blocked(a.x+dx,a.z+dz,.85,obstacles),false,
     a.id+' near-centre path blocked '+dx+','+dz);
   assert.equal(Sim.publicDistrictAt(a,obstacles)?.id,a.id);
  }
 }
 assert.deepEqual(br.obstacles.filter(x=>x.type.startsWith('aden-')),
  story.world.obstacles.filter(x=>x.type.startsWith('aden-')));
});
test('UE5 native civilian paving centers and dimensions match the ONE browser world source',()=>{
 const source=read('Unreal/Veilpoint/Source/Veilpoint/VPWorldBootstrap.cpp');
 const start=source.indexOf('static const FPublicPavement PublicDistrictPavements[] = {');
 const end=source.indexOf('for (const FPublicPavement& Paving',start);
 assert.ok(start>0&&end>start);
 const rows=[...source.slice(start,end).matchAll(/\{\s*(-?\d+)\.f,\s*(-?\d+)\.f,\s*(\d+)\.f,\s*(\d+)\.f\}/g)]
  .map(match=>match.slice(1).map(Number));
 assert.deepEqual(rows,areas.map(p=>[p.x,p.z,p.w,p.d]));
 assert.match(source,/AddBlock\(Vegetation,FVector\(Paving.X\*100.f,Paving.Z\*100.f,1.5f\)/);
 assert.match(source,/Vegetation->SetCollisionEnabled\(ECollisionEnabled::NoCollision\)/);
});
test('WebGL and Canvas actually draw the same ground surfaces without new 60Hz obstruction',()=>{
 const renderer=read('src/renderer.js');
 assert.match(renderer,/for\(const pavement of global.VeilpointSim.PUBLIC_CITY_PAVEMENTS\)/);
 assert.match(renderer,/this.worldTerrainRevision===1/);
 assert.match(renderer,/m\.quad\(\[x,height\(x,z\)\+y,z\]/);
 assert.match(renderer,/polygon\(\[proj\(x-ww,.08,z-dd\)/);
 assert.match(renderer,/pavement\.canvas/);
 assert.match(renderer,/pavement\.color/);
 assert.match(renderer,/state.terrainRevision===1\|\|harborNight/);
 const old=Sim.newMatch(20972,0,'carbine',false,'central','day',0);
 for(const a of areas)assert.equal(Sim.publicDistrictAt(a,old.obstacles),null,
  'legacy terrain-0 saves cannot gain newly invented visible public districts');
 // All new surfaces are render-only; no new collision body, save flag, or quest gate.
 assert.ok(old.obstacles.every(x=>!x.type?.includes('pavement')));
 const s=Story.createState(),checkpoint=Story.serialize(s);
 areas.forEach(x=>Sim.publicDistrictAt(x,s.world.obstacles));
 assert.equal(Story.serialize(s),checkpoint);
 assert.equal(Story.serialize(Story.restore(checkpoint)),checkpoint);
});
