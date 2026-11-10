'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Tiles=require('../src/aden-citywide-tiles.js');
const Explorer=require('../src/aden-city-explorer.js');
const Streets=require('../src/aden-preview-streets.js');
const Districts=require('../src/aden-preview-districts.js');
const source=Explorer.SOURCE;
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,
 'physical terrain difference '+a+' vs '+b);
const buildCache=(registry,stride=2)=>new Map([...registry].map(([key,tile])=>[
 key,{sourceTile:tile,lod:stride,mesh:Tiles.buildTerrainMesh(tile,stride)}
]));
function makeTile(tx,tz,fn){
 const size=17,spacing=512/(size-1);
 return Tiles.createHeightTile({tx,tz,source,gridSize:size,
  samples:Array.from({length:size*size},(_,i)=>
   fn(tx*512+(i%size)*spacing,tz*512+Math.floor(i/size)*spacing))
 });
}
test('eight additional fictional neighborhood plans actually author 224 distinct homes and 80 public street/court corridors',()=>{
 assert.equal(Districts.NEIGHBORHOODS.length,8);
 assert.equal(Districts.PLAN.buildings.length,224);
 assert.equal(Districts.PLAN.streets.length,80);
 assert.equal(Districts.PLAN.courtyards.length,8);
 assert.equal(Districts.verifiedAdenCityBuildings,0);
 assert.equal(Districts.collisionAuthored,false);
 assert.equal(Districts.authoredOnly,true);
 assert.equal(new Set(Districts.PLAN.buildings.map(p=>p.id)).size,224);
 assert.equal(new Set(Districts.PLAN.streets.map(p=>p.id)).size,80);
 assert.ok(Object.isFrozen(Districts.PLAN));
 assert.ok(Object.isFrozen(Districts.PLAN.buildings[0]));
 for(const b of Districts.NEIGHBORHOODS){
  const homes=Districts.PLAN.buildings.filter(h=>h.district===b.id);
  const streets=Districts.PLAN.streets.filter(s=>s.id.startsWith(b.id));
  assert.equal(homes.length,28,'two central parcels per quarter remain open to pedestrians');
  assert.equal(streets.length,10,'four crossings, five lanes and one public court');
  assert.ok(streets.some(s=>s.id.endsWith('-public-court')));
  assert.ok(homes.every(h=>h.actualAdenArchitectureVerified===false));
  assert.ok(homes.every(h=>Math.abs(h.x-b.x)<=60&&Math.abs(h.z-b.z)<=56));
  for(const street of streets){
   assert.ok(street.width>=5&&street.width<=10);
   const station=Streets.stations(street);
   assert.ok(station.length>=4);
   for(let i=1;i<station.length;i++)
    assert.ok(Math.hypot(station[i].x-station[i-1].x,
      station[i].z-station[i-1].z)<=6+1e-8);
   for(const p of station)for(const house of homes)
    assert.ok(Math.abs(p.x-house.x)>house.w/2+street.width/2-.01||
      Math.abs(p.z-house.z)>house.d/2+street.width/2-.01,
      'authored street must leave an actual gap outside occupied home '+house.id);
  }
 }
});
test('building foundations are sampled from painted triangle LOD at all four corners, not bilinear preview data',()=>{
 const reg=Explorer.createPreviewRegistry(),visible=new Set(reg.keys());
 for(const stride of [1,2,4]){
  const cache=buildCache(reg,stride);
  let accepted=0;
  for(const b of Districts.PLAN.buildings){
   const a=Districts.buildingFoundation(b,reg,cache,visible);
   if(!a)continue;
   accepted++;
   const points=[[0,0],[-1,-1],[-1,1],[1,-1],[1,1]];
   const elevations=points.map(([dx,dz])=>{
    const x=b.x+dx*b.w/2,z=b.z+dz*b.d/2;
    return Tiles.heightOnTerrainMesh(cache.get(Tiles.tileFor(x,z).key).mesh,x,z);
   });
   close(a.baseMetres,Math.max(...elevations));
   close(a.lowMetres,Math.min(...elevations));
   close(a.centreMetres,elevations[0]);
   close(a.plinthMetres,a.baseMetres-a.lowMetres);
   assert.ok(a.plinthMetres<=6);
   assert.equal(a.actualSurveyVerified,false);
   assert.ok(Object.isFrozen(a));
  }
  assert.ok(accepted>=170,'the city must contain substantial real drawn urban mass at LOD '+stride);
 }
});
test('unknown tiles, stale imported revisions, sea level and steep terrain cannot support fake civilian buildings',()=>{
 const at={id:'fictional-seam-building',x:512,z:250,w:12,d:14};
 const west=makeTile(0,0,(x,z)=>20+.02*x+.01*z);
 const east=makeTile(1,0,(x,z)=>20+.02*x+.01*z);
 const registry=Tiles.createRegistry([west,east]),cache=buildCache(registry);
 assert.equal(Districts.buildingFoundation(at,registry,cache,new Set(['aden:0:0'])),null);
 const valid=Districts.buildingFoundation(at,registry,cache,new Set(registry.keys()));
 assert.ok(valid&&valid.baseMetres>20);
 assert.equal(Districts.buildingFoundation(at,registry,new Map(),new Set(registry.keys())),null);
 const stale=buildCache(registry);
 const replaced=Tiles.createRegistry([west,
  makeTile(1,0,(x,z)=>20+.02*x+.01*z)]);
 assert.equal(Districts.buildingFoundation(at,replaced,stale,new Set(replaced.keys())),null,
  'same-key newer DEM cannot borrow outdated cached geometry');
 const water=Tiles.createRegistry([makeTile(0,0,()=>-4)]);
 assert.equal(Districts.buildingFoundation({x:140,z:250,w:12,d:14},
  water,buildCache(water),new Set(water.keys())),null);
 const cliff=Tiles.createRegistry([makeTile(0,0,(x,z)=>20+.625*x)]);
 assert.equal(Districts.buildingFoundation({x:260,z:250,w:16,d:14},
  cliff,buildCache(cliff),new Set(cliff.keys())),null);
});
test('district roads are requested only near visible 512m tiles and do not claim surveyed Aden streets',()=>{
 assert.deepEqual(Districts.visibleStreets(new Set()),[]);
 assert.deepEqual(Districts.visibleStreets(new Set(['aden:77:77'])),[]);
 assert.throws(()=>Districts.visibleStreets([]),/Visible tile keys/);
 const around=Districts.visibleStreets(new Set(['aden:0:-1']));
 assert.ok(around.length>0&&around.length<80);
 assert.ok(around.every(s=>s.id.startsWith('fictional-')));
 for(const street of around)assert.ok(street.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 const all=new Set(Explorer.createPreviewRegistry().keys());
 assert.equal(Districts.visibleStreets(all).length,80);
});
