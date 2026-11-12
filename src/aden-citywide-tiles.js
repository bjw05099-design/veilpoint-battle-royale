/* VEILPOINT — 1:1 Aden-wide civil geography streaming foundation.
 * No live geography, exact protected-facility locations or world data are
 * included here. The existing 350 m proof-of-play remains untouched.
 * Public terrain and ordinary civilian appearance may be imported only with
 * verifiable provenance and explicit usage rights.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenCityTiles=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const METRES_PER_UNIT=1,TILE_METRES=512,UE_CENTIMETRES=51200;
 const MAX_ABS_COORD=1000000,GRIDS=Object.freeze([17,33,65]);
 const SOURCE_SCOPE=Object.freeze(['public-terrain','civilian-architecture','public-coastline']);
 const DISTRICTS=Object.freeze([
  Object.freeze({id:'crater',label:'Crater / 구시가지',character:'volcanic-basin'}),
  Object.freeze({id:'tawahi',label:'Tawahi / 서부 항만',character:'bay-front'}),
  Object.freeze({id:'mualla',label:"Ma'alla / 해안 시가지",character:'waterfront'}),
  Object.freeze({id:'khormaksar',label:'Khormaksar / 반도 연결부',character:'coastal-lowland'}),
  Object.freeze({id:'sheikh-othman',label:'Sheikh Othman / 내륙 생활권',character:'inland-urban'}),
  Object.freeze({id:'mansoura',label:'Al Mansoura / 내륙 생활권',character:'inland-urban'}),
  Object.freeze({id:'dar-saad',label:'Dar Saad / 내륙 생활권',character:'inland-urban'}),
  Object.freeze({id:'buraiqa',label:'Al Buraiqa / 서부 해안권',character:'western-coast'})
 ]);
 const validFinite=n=>typeof n==='number'&&Number.isFinite(n);
 function point(x,z){
  if(!validFinite(x)||!validFinite(z)||
    Math.abs(x)>MAX_ABS_COORD||Math.abs(z)>MAX_ABS_COORD)
   throw new RangeError('Invalid local world-metre coordinate');
  return Object.freeze({x,z});
 }
 function tileKey(tx,tz){
  if(!Number.isSafeInteger(tx)||!Number.isSafeInteger(tz)||
     Math.abs(tx)>2048||Math.abs(tz)>2048)throw new RangeError('Invalid tile index');
  return 'aden:'+tx+':'+tz;
 }
 function parseTileKey(key){
  const m=typeof key==='string'&&/^aden:(-?\d+):(-?\d+)$/.exec(key);
  if(!m)throw new RangeError('Invalid city tile key');
  const tx=Number(m[1]),tz=Number(m[2]),canonical=tileKey(tx,tz);
  if(canonical!==key)throw new RangeError('Noncanonical city tile key');
  return Object.freeze({tx,tz});
 }
 function tileFor(x,z){
  point(x,z);
  const tx=Math.floor(x/TILE_METRES),tz=Math.floor(z/TILE_METRES);
  return Object.freeze({tx,tz,key:tileKey(tx,tz)});
 }
 function tileBounds(tx,tz){
  return Object.freeze({key:tileKey(tx,tz),minX:tx*TILE_METRES,
   maxX:(tx+1)*TILE_METRES,minZ:tz*TILE_METRES,
   maxZ:(tz+1)*TILE_METRES,unit:'metres',metresPerWorldUnit:METRES_PER_UNIT});
 }
 function validDate(s){
  if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
 }
 function validateSource(source){
  if(!source||typeof source!=='object'||Array.isArray(source))throw new TypeError('Missing source provenance');
  const {provider,observedDate,license,reference,scope,type}=source;
  if(typeof provider!=='string'||provider.trim().length<3||
    typeof license!=='string'||license.trim().length<3||
    typeof reference!=='string'||reference.trim().length<5||
    !validDate(observedDate)||!SOURCE_SCOPE.includes(scope)||
    !['licensed-dem','historical-public','artist-blockout'].includes(type))
   throw new RangeError('Unverified geographic source/provenance');
  return Object.freeze({provider:provider.trim(),observedDate,
   license:license.trim(),reference:reference.trim(),scope,type});
 }
 function createHeightTile(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Invalid terrain tile');
  const {tx,tz,gridSize,samples,source}=raw;
  const key=tileKey(tx,tz);
  if(!GRIDS.includes(gridSize)||!Array.isArray(samples)||
    samples.length!==gridSize*gridSize||
    !samples.every(n=>validFinite(n)&&n>=-500&&n<=3000))
   throw new RangeError('Invalid 1:1 metre height grid');
  const provenance=validateSource(source);
  if(provenance.scope!=='public-terrain')
   throw new RangeError('Height tile requires public-terrain provenance');
  const values=Object.freeze(samples.slice());
  return Object.freeze({key,tx,tz,gridSize,samples:values,
   metresPerWorldUnit:METRES_PER_UNIT,
   sampleIntervalMetres:TILE_METRES/(gridSize-1),
   source:provenance,quality:provenance.type==='artist-blockout'?'blockout':'dataset-derived'});
 }
 function heightAt(tile,x,z){
  if(!tile||!Array.isArray(tile.samples)||!GRIDS.includes(tile.gridSize))
   throw new TypeError('Invalid height tile');
  point(x,z);
  const b=tileBounds(tile.tx,tile.tz),eps=1e-7;
  if(x<b.minX-eps||x>b.maxX+eps||z<b.minZ-eps||z>b.maxZ+eps)
   throw new RangeError('Point outside loaded tile');
  const n=tile.gridSize,u=Math.max(0,Math.min(n-1,(x-b.minX)/TILE_METRES*(n-1))),
   v=Math.max(0,Math.min(n-1,(z-b.minZ)/TILE_METRES*(n-1)));
  const ix=Math.min(n-2,Math.floor(u)),iz=Math.min(n-2,Math.floor(v)),
   a=u-ix,beta=v-iz,s=tile.samples;
  const h00=s[iz*n+ix],h10=s[iz*n+ix+1],
   h01=s[(iz+1)*n+ix],h11=s[(iz+1)*n+ix+1];
  return (h00*(1-a)+h10*a)*(1-beta)+(h01*(1-a)+h11*a)*beta;
 }
 function auditSeam(a,b,toleranceMetres=.15){
  if(!a||!b||!GRIDS.includes(a.gridSize)||!GRIDS.includes(b.gridSize)||
    !validFinite(toleranceMetres)||toleranceMetres<0||toleranceMetres>1)
   throw new RangeError('Invalid tile seam audit');
  // A missing or malformed edge sample must never turn into NaN and silently
  // pass a terrain seam. Audit only complete, finite, bounded source grids.
  for(const tile of [a,b]){
   if(!Array.isArray(tile.samples)||
      tile.samples.length!==tile.gridSize*tile.gridSize||
      !tile.samples.every(h=>validFinite(h)&&h>=-500&&h<=3000)||
      tileKey(tile.tx,tile.tz)!==tile.key)
    throw new RangeError('Invalid terrain source for seam audit');
  }
  const dx=b.tx-a.tx,dz=b.tz-a.tz;
  if(Math.abs(dx)+Math.abs(dz)!==1)throw new RangeError('Tiles are not cardinal neighbors');
  // Adjacent licensed/local tiles can legitimately have 17/33/65 samples.
  // Compare the PIECEWISE-LINEAR elevation along their entire common edge,
  // not just shared endpoints. For two linear segments the maximum mismatch
  // is attained at a breakpoint, so their UNION of sample fractions proves
  // the maximum seam gap without fabricating a resampled source tile.
  const edge=(tile,side,k)=>{
   const n=tile.gridSize;
   if(side==='east')return tile.samples[k*n+n-1];
   if(side==='west')return tile.samples[k*n];
   if(side==='south')return tile.samples[(n-1)*n+k];
   return tile.samples[k];
  };
  const aSide=dx===1?'east':dx===-1?'west':dz===1?'south':'north';
  const bSide=dx===1?'west':dx===-1?'east':dz===1?'north':'south';
  const at=(tile,side,t)=>{
   const u=t*(tile.gridSize-1),i=Math.min(tile.gridSize-2,Math.floor(u));
   const fraction=u-i;
   return edge(tile,side,i)*(1-fraction)+edge(tile,side,i+1)*fraction;
  };
  const fractions=new Set();
  for(let k=0;k<a.gridSize;k++)fractions.add(k/(a.gridSize-1));
  for(let k=0;k<b.gridSize;k++)fractions.add(k/(b.gridSize-1));
  let maxGap=0;
  for(const t of fractions)
   maxGap=Math.max(maxGap,Math.abs(at(a,aSide,t)-at(b,bSide,t)));
  return Object.freeze({pass:maxGap<=toleranceMetres,maxGapMetres:maxGap,
   samplesChecked:fractions.size,left:a.key,right:b.key});
 }
 // Weak source identity keeps a frozen tile's immutable meshes reusable even
 // after it leaves and re-enters the camera window. The cache never retains a
 // source tile on its own, and a replaced tile key cannot reuse old vertices.
 const MESH_BY_SOURCE=new WeakMap();
 // Generate actual triangle geometry at 1:1 physical scale for an
 // imported public DEM heightfield. LODs are subgrids of the SAME samples,
 // so each distance tier retains the same tile corner elevations. Native
 // and browser consumers can upload these metre-space vertices separately.
 function buildTerrainMesh(tile,stride=1){
  if(!tile||!Array.isArray(tile.samples)||!GRIDS.includes(tile.gridSize))
   throw new TypeError('Invalid source tile for terrain mesh');
  const n=tile.gridSize;
  if(!Number.isInteger(stride)||stride<1||
    (n-1)%stride!==0||(stride&(stride-1))!==0)
   throw new RangeError('Invalid terrain mesh LOD step');
  // Only immutable validated source samples may be cached. Legacy callers
  // passing mutable fixtures still get a fresh mesh after changing samples.
  const cacheable=Object.isFrozen(tile)&&Object.isFrozen(tile.samples);
  const previous=cacheable?MESH_BY_SOURCE.get(tile)?.get(stride):null;
  if(previous)return previous;
  const columns=(n-1)/stride+1,
   positions=[],triangles=[],x0=tile.tx*TILE_METRES,z0=tile.tz*TILE_METRES,
   metresBetweenSamples=TILE_METRES/(n-1);
  for(let r=0;r<n;r+=stride)
   for(let c=0;c<n;c+=stride){
    const h=tile.samples[r*n+c];
    if(!validFinite(h))throw new RangeError('Invalid terrain sample');
    positions.push(x0+c*metresBetweenSamples,h,z0+r*metresBetweenSamples);
   }
  for(let r=0;r<columns-1;r++)
   for(let c=0;c<columns-1;c++){
    const a=r*columns+c,b=a+1,d=(r+1)*columns+c,e=d+1;
    triangles.push(a,d,b,b,d,e);
   }
  const mesh=Object.freeze({key:tile.key,lodStep:stride,
   metresPerWorldUnit:METRES_PER_UNIT,
   vertexCount:positions.length/3,triangleCount:triangles.length/3,
   positions:Object.freeze(positions),triangles:Object.freeze(triangles)});
  if(cacheable){
   let lods=MESH_BY_SOURCE.get(tile);
   if(!lods){lods=new Map();MESH_BY_SOURCE.set(tile,lods);}
   lods.set(stride,mesh);
  }
  return mesh;
 }
 // Sample the EXACT visible triangle height for one locally loaded mesh.
 // Raw DEM heightAt() intentionally stays bilinear for source inspections;
 // a triangulated 17/33/65-grid LOD uses two planar faces per cell. A non-
 // planar sample quad has a DIFFERENT bilinear height at its centre. UI and
 // future non-operational pedestrian terrain probes must not claim the
 // displayed surface is at the raw bilinear elevation.
 function heightOnTerrainMesh(mesh,x,z){
  if(!mesh||typeof mesh!=='object'||!Array.isArray(mesh.positions)||
     !Number.isSafeInteger(mesh.vertexCount)||
     mesh.vertexCount<4||mesh.positions.length!==mesh.vertexCount*3)
   throw new TypeError('Invalid triangulated terrain mesh');
  const n=Math.sqrt(mesh.vertexCount);
  if(!Number.isSafeInteger(n)||n<2||n>65||
     !Number.isSafeInteger(mesh.lodStep)||mesh.lodStep<1)
   throw new RangeError('Invalid terrain mesh topology');
  const {tx,tz}=parseTileKey(mesh.key);
  point(x,z);
  const b=tileBounds(tx,tz),eps=1e-7;
  if(x<b.minX-eps||x>b.maxX+eps||z<b.minZ-eps||z>b.maxZ+eps)
   throw new RangeError('Point outside loaded terrain mesh');
  const ux=Math.max(0,Math.min(n-1,(x-b.minX)/TILE_METRES*(n-1))),
    uz=Math.max(0,Math.min(n-1,(z-b.minZ)/TILE_METRES*(n-1))),
    ix=Math.min(n-2,Math.floor(ux)),iz=Math.min(n-2,Math.floor(uz)),
    u=ux-ix,v=uz-iz,values=mesh.positions;
  const elevation=(row,col)=>{
   const h=values[(row*n+col)*3+1];
   if(!validFinite(h))throw new RangeError('Invalid terrain vertex elevation');
   return h;
  };
  const h00=elevation(iz,ix),h10=elevation(iz,ix+1),
    h01=elevation(iz+1,ix),h11=elevation(iz+1,ix+1);
  // buildTerrainMesh() emits (00,01,10) and (10,01,11).
  return u+v<=1
   ?h00*(1-u-v)+h10*u+h01*v
   :h10*(1-v)+h01*(1-u)+h11*(u+v-1);
 }
 // Per-point physical slope from the EXACT triangle mesh currently drawn
 // at the active LOD, not a bilinear DEM slope or speculative GPS estimate.
 // Produces local metre geometry only; it is not surveyed Aden topography.
 function terrainSurface(mesh,x,z){
  const elevationMetres=heightOnTerrainMesh(mesh,x,z);
  const n=Math.sqrt(mesh.vertexCount),
   {tx,tz}=parseTileKey(mesh.key),b=tileBounds(tx,tz);
  const u=Math.max(0,Math.min(n-1,(x-b.minX)/TILE_METRES*(n-1))),
   v=Math.max(0,Math.min(n-1,(z-b.minZ)/TILE_METRES*(n-1))),
   ix=Math.min(n-2,Math.floor(u)),iz=Math.min(n-2,Math.floor(v));
  const indices=u-ix+v-iz<=1
   ?[[iz,ix],[iz,ix+1],[iz+1,ix]]
   :[[iz,ix+1],[iz+1,ix+1],[iz+1,ix]];
  const p=indices.map(([row,col])=>
   mesh.positions.slice((row*n+col)*3,(row*n+col+1)*3));
  const ab=p[1].map((v,i)=>v-p[0][i]),
   ac=p[2].map((v,i)=>v-p[0][i]);
  let nx=ab[1]*ac[2]-ab[2]*ac[1],
   ny=ab[2]*ac[0]-ab[0]*ac[2],
   nz=ab[0]*ac[1]-ab[1]*ac[0];
  const magnitude=Math.hypot(nx,ny,nz);
  if(!Number.isFinite(magnitude)||magnitude<1e-10)
   throw new RangeError('Degenerate terrain surface triangle');
  if(ny<0){nx=-nx;ny=-ny;nz=-nz;}
  const slopeDegrees=Math.atan2(Math.hypot(nx,nz),ny)*180/Math.PI;
  return Object.freeze({elevationMetres,slopeDegrees,
   normal:Object.freeze({x:nx/magnitude,y:ny/magnitude,z:nz/magnitude}),
   meshKey:mesh.key,lodStep:mesh.lodStep});
 }
 function createRegistry(tiles){
  if(!Array.isArray(tiles)||tiles.length>25000)throw new RangeError('Invalid city tile registry');
  const map=new Map();
  for(const tile of tiles){
   if(!tile||tile.key!==tileKey(tile.tx,tile.tz)||
     tile.metresPerWorldUnit!==METRES_PER_UNIT||
     !GRIDS.includes(tile.gridSize)||!Array.isArray(tile.samples)||
     tile.samples.length!==tile.gridSize*tile.gridSize||
     tile.samples.some(n=>!validFinite(n)||n<-500||n>3000)||
     !Object.isFrozen(tile)||!Object.isFrozen(tile.samples)||
     tile.sampleIntervalMetres!==TILE_METRES/(tile.gridSize-1))
    throw new TypeError('Only validated 1:1 height tiles may enter registry');
   const provenance=validateSource(tile.source);
   if(provenance.scope!=='public-terrain'||
      tile.quality!==(provenance.type==='artist-blockout'?'blockout':'dataset-derived'))
    throw new RangeError('Invalid tile source grade');
   if(map.has(tile.key))throw new RangeError('Duplicate tile '+tile.key);
   map.set(tile.key,tile);
  }
  return map;
 }
 // Accept an explicit local-only DEM fixture (JSON). This validates the
 // *declared* source metadata but does not establish genuine observation,
 // usage rights or physical accuracy. No GPS-to-game conversion supported;
 // only local metre tiles, heights and provenance are accepted. Fail closed.
 function importHeightDataset(document){
  if(!document||typeof document!=='object'||Array.isArray(document)||
    Object.keys(document).some(k=>!['format','coordinateSystem','title','tiles'].includes(k))||
    document.format!=='veilpoint-heightfield-v1'||
    document.coordinateSystem!=='local-metre-unreferenced'||
    typeof document.title!=='string'||document.title.trim().length<3||
    document.title.length>100||
    !Array.isArray(document.tiles)||document.tiles.length===0||
    document.tiles.length>49)
   throw new RangeError('Invalid offline heightfield document');
  const tiles=document.tiles.map(raw=>{
   if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).some(k=>!['tx','tz','gridSize','samples','source'].includes(k))||
     !raw.source||Object.keys(raw.source).some(k=>!
       ['provider','observedDate','license','reference','scope','type'].includes(k)))
    throw new RangeError('Invalid elevation-only tile record');
   return createHeightTile(raw);
  });
  const registry=createRegistry(tiles);
  const seams=auditRegistrySeams(registry,.15);
  if(!seams.pass)throw new RangeError('Heightfield tile boundary mismatch');
  return Object.freeze({title:document.title.trim(),
   registry,tilesImported:registry.size,seams:seams.edgesChecked,
   unreviewed:true,localOnly:true,accuracy:'source-declared-unverified'});
 }
 function auditRegistrySeams(registry,toleranceMetres=.15){
  if(!(registry instanceof Map)||!validFinite(toleranceMetres)||
     toleranceMetres<0||toleranceMetres>1)
   throw new RangeError('Invalid registry seam audit');
  let edgesChecked=0,maxGapMetres=0,pass=true;
  for(const tile of registry.values())
   for(const [dx,dz] of [[1,0],[0,1]]){
    const neighbor=registry.get(tileKey(tile.tx+dx,tile.tz+dz));
    if(!neighbor)continue;
    // A validated mixed-density edge is safe when both interpolated
    // profiles agree at every breakpoint. A discontinuity still fails
    // before either registry or imported-world view can be mutated.
    const audit=auditSeam(tile,neighbor,toleranceMetres);
    edgesChecked++;maxGapMetres=Math.max(maxGapMetres,audit.maxGapMetres);
    if(!audit.pass)pass=false;
   }
  return Object.freeze({pass,edgesChecked,maxGapMetres,toleranceMetres});
 }
 // Incrementally extend a local, non-georeferenced city registry. Entire
 // batches are validated BEFORE committing any tile: the old Map and its
 // existing source tiles are never changed on duplicate IDs, mixed-density
 // seams, illegal metadata or height mismatches. This verifies only the
 // declared local geometry, NOT a real-world survey or source licence.
 function mergeHeightRegistries(existing,incoming,toleranceMetres=.15){
  if(!(existing instanceof Map)||!(incoming instanceof Map)||incoming.size===0)
   throw new TypeError('Two validated terrain registries are required');
  if(!validFinite(toleranceMetres)||toleranceMetres<0||toleranceMetres>1)
   throw new RangeError('Invalid registry seam audit');
  for(const [key,tile] of existing)
   if(!tile||tile.key!==key)throw new TypeError('Invalid existing tile registry key');
  for(const [key,tile] of incoming){
   if(!tile||tile.key!==key)throw new TypeError('Invalid incoming tile registry key');
   if(existing.has(key))throw new RangeError('Duplicate imported terrain tile '+key);
  }
  const registry=createRegistry([...existing.values(),...incoming.values()]);
  const seamAudit=auditRegistrySeams(registry,toleranceMetres);
  if(!seamAudit.pass)throw new RangeError('Heightfield tile boundary mismatch');
  return Object.freeze({registry,tilesAdded:incoming.size,
   tilesTotal:registry.size,seams:seamAudit.edgesChecked,
   seamMaxGapMetres:seamAudit.maxGapMetres,
   localOnly:true,geographicAccuracyVerified:false});
 }
 function planStreaming(x,z,registry,loadedKeys=[],options={}){
  const origin=tileFor(x,z);
  if(!(registry instanceof Map)||!Array.isArray(loadedKeys)||
    loadedKeys.some(k=>typeof k!=='string'))throw new TypeError('Invalid streaming registry');
  const radius=options.radius===undefined?2:options.radius,
   maxLoaded=options.maxLoaded===undefined?25:options.maxLoaded;
  if(!Number.isInteger(radius)||radius<0||radius>6||
    !Number.isInteger(maxLoaded)||maxLoaded<1||maxLoaded>169)
   throw new RangeError('Invalid tile streaming budget');
  // In street-eye mode, keep the centre and the 8 immediately adjacent
  // terrain tiles resident, then favour authored ground ahead of the camera.
  // This is a streaming priority ONLY: it never fabricates missing source
  // tiles or changes the measured elevation/60Hz collision contract.
  const forward=options.lookAhead;
  let facing=null;
  if(forward!==undefined){
   const length=forward&&typeof forward==='object'&&!Array.isArray(forward)?
    Math.hypot(forward.x,forward.z):NaN;
   if(!validFinite(forward?.x)||!validFinite(forward?.z)||
      !validFinite(length)||length<1e-6)
    throw new RangeError('Invalid civilian terrain look-ahead direction');
   facing={x:forward.x/length,z:forward.z/length};
  }
  // Window streaming must scale with the visible tile RADIUS, not the size
  // of the full-city registry. Walking one block must not scan potentially
  // 25,000 licensed height tiles on every rendered frame.
  const desired=[],unresolved=[];
  for(let ring=0;ring<=radius;ring++)
   for(let dx=-ring;dx<=ring;dx++)
    for(let dz=-ring;dz<=ring;dz++)
     if(Math.max(Math.abs(dx),Math.abs(dz))===ring){
      const tx=origin.tx+dx,tz=origin.tz+dz;
      const key=tileKey(tx,tz),tile=registry.get(key);
      if(tile)desired.push({key,tile,ring});
      else unresolved.push(key);
     }
  // Preserve deterministic spatial priority across reloads. A budget-limited
  // tile is DEFERRED, never mislabeled as missing geography or surveyed data.
  const forwardScore=tile=>{
   const dx=tile.tx-origin.tx,dz=tile.tz-origin.tz;
   return Math.hypot(dx,dz)-.7*(dx*facing.x+dz*facing.z);
  };
  desired.sort((a,b)=>{
   if(facing){
    // Preserve the local 3×3 60Hz walking footprint even if the viewer
    // looks far across a still-unloaded original fictional district.
    const nearbyA=a.ring<=1,nearbyB=b.ring<=1;
    if(nearbyA!==nearbyB)return nearbyA?-1:1;
    if(!nearbyA){
     const directional=forwardScore(a.tile)-forwardScore(b.tile);
     if(Math.abs(directional)>1e-12)return directional;
    }
   }
   return a.ring-b.ring||
    Math.hypot(a.tile.tx-origin.tx,a.tile.tz-origin.tz)-
    Math.hypot(b.tile.tx-origin.tx,b.tile.tz-origin.tz)||
    a.key.localeCompare(b.key);
  });
  const active=desired.slice(0,maxLoaded).map(o=>o.key),set=new Set(active),
   existing=new Set(loadedKeys),deferred=desired.slice(maxLoaded).map(o=>o.key);
  return Object.freeze({origin:origin.key,
   active:Object.freeze(active),load:Object.freeze(active.filter(k=>!existing.has(k))),
   keep:Object.freeze(active.filter(k=>existing.has(k))),
   unload:Object.freeze([...existing].filter(k=>!set.has(k)).sort()),
   unresolved:Object.freeze(unresolved),deferred:Object.freeze(deferred),
   completeCity:false, // Even a full local window is not whole-city coverage.
   streamedWorldMetresPerUnit:METRES_PER_UNIT});
 }
 return Object.freeze({METRES_PER_UNIT,TILE_METRES,UE_CENTIMETRES,
  DISTRICTS,SOURCE_SCOPE,point,tileKey,parseTileKey,tileFor,tileBounds,
  validateSource,createHeightTile,heightAt,auditSeam,auditRegistrySeams,importHeightDataset,buildTerrainMesh,heightOnTerrainMesh,terrainSurface,createRegistry,mergeHeightRegistries,planStreaming});
});
