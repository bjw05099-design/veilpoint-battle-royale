/* VEILPOINT 1:1 full-city terrain viewer: an ACTUAL local, standalone
 * browser preview of tile streaming, metre heights, triangular terrain,
 * and original NON-GEOREFERENCED civilian city art. Never treat generated
 * sample tiles as surveyed Aden, public facility locations or a playable
 * 96-person BR server.
 */
(function(root,factory){
 const api=factory(root.VeilpointAdenCityTiles||
  (typeof module==='object'&&module.exports?require('./aden-citywide-tiles.js'):null),
  root.VeilpointAdenRelief||
  (typeof module==='object'&&module.exports?require('./aden-map-relief.js'):null),
  root.VeilpointAdenPreviewStreets||
  (typeof module==='object'&&module.exports?require('./aden-preview-streets.js'):null),
  root.VeilpointAdenPreviewDistricts||
  (typeof module==='object'&&module.exports?require('./aden-preview-districts.js'):null),
  root.VeilpointAdenWalkingProbe||
  (typeof module==='object'&&module.exports?require('./aden-city-walking-probe.js'):null),
  root.VeilpointCivilianWalkRoute||
  (typeof module==='object'&&module.exports?require('./aden-civilian-walk-route.js'):null),
  root.VeilpointAdenStreetPerspective||
  (typeof module==='object'&&module.exports?require('./aden-street-perspective.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenCityExplorer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tiles,Relief,Streets,Districts,Walk,Routes,StreetEye){
 'use strict';
 if(!Tiles||!Relief)throw new Error('Requires city tile and terrain relief modules');
 const SOURCE=Object.freeze({
  provider:'VEILPOINT original terrain preview',
  observedDate:'2026-11-09',license:'Original fictional art (not a real Aden DEM)',
  reference:'local original continuous analytic height function',
  scope:'public-terrain',type:'artist-blockout'
 });
 // Analytic continuous height at *metre coordinates*, used ONLY to test
 // cross-tile vertex stitching and land/sea transitions without claiming
 // licensed remote data. Future imported public DEM replaces these samples.
 function fictionalHeight(x,z){
  const hill=(cx,cz,amp,range)=>amp*Math.exp(-(
   ((x-cx)*(x-cx)+(z-cz)*(z-cz))/range));
  return 9+hill(-280,480,105,240000)+hill(630,440,76,340000)
   +hill(60,-430,34,270000)-Math.max(0,-x-560)*.095;
 }
 function createPreviewRegistry(radius=2,gridSize=33){
  if(!Number.isInteger(radius)||radius<0||radius>3||
    ![17,33,65].includes(gridSize))throw new RangeError('Invalid preview tile extent');
  const tiles=[];
  for(let tz=-radius;tz<=radius;tz++)
   for(let tx=-radius;tx<=radius;tx++){
    const n=gridSize,d=Tiles.TILE_METRES/(n-1);
    tiles.push(Tiles.createHeightTile({tx,tz,gridSize,source:SOURCE,
     samples:Array.from({length:n*n},(_,i)=>{
      const ix=i%n,iz=Math.floor(i/n);
      return fictionalHeight(tx*Tiles.TILE_METRES+ix*d,
       tz*Tiles.TILE_METRES+iz*d);
     })}));
   }
  return Tiles.createRegistry(tiles);
 }
 // Original civilian-looking geometry for the SAMPLE preview ONLY.
 // Three generic coherent street blocks; no real GPS, named modern sites,
 // exact buildings, sensitive facility geometry or combat spawn positions.
 function civilianBlockout(){
  const houses=[];
  for(const [q,cx,cz] of [[0,-140,-70],[1,330,120],[2,-450,390]])
   for(let row=0;row<5;row++)
    for(let col=0;col<7;col++){
     const i=q*35+row*7+col;
     houses.push(Object.freeze({x:cx+(col-3)*27,
      z:cz+(row-2)*30,
      w:12+((i+q)%4)*1.8,d:14+((i+row)%3)*2.2,
      h:6+((i*7+row)%11),
      color:['#bfae92','#cbbca2','#aaa596','#bca995'][i%4]}));
    }
  return Object.freeze(houses);
 }
 const CIVIC_SHELLS=civilianBlockout();
 // A new source mesh may reuse the SAME registered tile ID and LOD.
 // Snapshot references rather than trusting the string key/zoom signature.
 function terrainRevision(cache){
  return new Map([...cache].map(([key,entry])=>[key,
   {sourceTile:entry?.sourceTile,mesh:entry?.mesh,lod:entry?.lod}]));
 }
 function terrainRevisionMatches(cache,revision){
  if(!(cache instanceof Map)||!(revision instanceof Map)||cache.size!==revision.size)return false;
  for(const [key,entry] of cache){
   const prior=revision.get(key);
   if(!entry||!prior||prior.sourceTile!==entry.sourceTile||
      prior.mesh!==entry.mesh||prior.lod!==entry.lod)return false;
  }
  return true;
 }
 // Keys from nested controls belong to those controls, not the terrain
 // walker's movement/interaction dispatcher.
 function interactiveKeyTarget(target){
  let node=target;const seen=new Set();
  for(let depth=0;node&&depth<32;depth++){
   if(typeof node!=='object'||seen.has(node))return false;
   seen.add(node);
   const tag=typeof node.tagName==='string'?node.tagName.toUpperCase():'';
   if(['INPUT','TEXTAREA','SELECT','BUTTON','OPTION','SUMMARY'].includes(tag)||
      node.isContentEditable===true)return true;
   if(tag==='A'&&(typeof node.href==='string'||
      (typeof node.hasAttribute==='function'&&node.hasAttribute('href'))))return true;
   const role=typeof node.getAttribute==='function'?node.getAttribute('role'):node.role;
   if(typeof role==='string'&&/^(button|link|textbox|searchbox|combobox|spinbutton|listbox|menuitem|option|slider|checkbox|radio|switch)$/.test(role.toLowerCase().trim()))return true;
   const editable=typeof node.getAttribute==='function'?node.getAttribute('contenteditable'):null;
   if(editable!=null&&editable!=='false')return true;
   node=node.parentElement||node.parentNode||node.host||null;
  }
  return false;
 }
 function viewState(options={}){
  const x=options.x??0,z=options.z??0,zoom=options.zoom??.63,
   relief=options.relief??.38,showContours=options.showContours??true;
  Tiles.point(x,z);
  if(!Number.isFinite(zoom)||zoom<.22||zoom>2.5||
     !Number.isFinite(relief)||relief<0||relief>1||
     typeof showContours!=='boolean')
   throw new RangeError('Invalid city preview zoom');
  return Object.freeze({x,z,zoom,relief,showContours});
 }
 function pan(state,dx,dz){
  if(!Number.isFinite(dx)||!Number.isFinite(dz))throw new RangeError('Invalid pan');
  return viewState({x:state.x+dx,z:state.z+dz,zoom:state.zoom,
   relief:state.relief,showContours:state.showContours});
 }
 function setZoom(state,next){
  return viewState({x:state.x,z:state.z,zoom:Math.min(2.5,Math.max(.22,next)),
   relief:state.relief,showContours:state.showContours});
 }
 function setRelief(state,relief){
  return viewState({...state,relief});
 }
 function setContours(state,showContours){
  return viewState({...state,showContours});
 }
 // The waterline is derived from the very SAME streamed triangle samples
 // used by the terrain painter, not a cartographic guess or global overlay.
 // Exact-zero edges are included and deduplicated; all-zero triangles have
 // no uniquely defined shoreline and must not draw misleading polylines.
 function shorelineSegments(mesh,seaLevel=0){
  if(!Number.isFinite(seaLevel)||!mesh||!mesh.positions||!mesh.triangles||
    mesh.positions.length%3!==0||mesh.triangles.length%3!==0)
   throw new RangeError('Invalid shoreline mesh or sea level');
  const p=mesh.positions,indices=mesh.triangles,segments=[];
  for(let i=0;i<indices.length;i+=3){
   const v=[indices[i],indices[i+1],indices[i+2]];
   if(v.some(index=>!Number.isSafeInteger(index)||index<0||index*3+2>=p.length))
    throw new RangeError('Invalid shoreline mesh triangle');
   const heights=v.map(index=>p[index*3+1]-seaLevel);
   if(heights.every(h=>Math.abs(h)<1e-10))continue;
   const cuts=[];
   const add=(x,z)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Invalid shoreline coordinates');
    if(!cuts.some(q=>Math.hypot(q[0]-x,q[1]-z)<1e-8))cuts.push([x,z]);
   };
   for(let e=0;e<3;e++){
    const a=v[e]*3,b=v[(e+1)%3]*3,ha=heights[e],hb=heights[(e+1)%3];
    if(![p[a],p[a+1],p[a+2],p[b],p[b+1],p[b+2]].every(Number.isFinite))
     throw new RangeError('Nonfinite shoreline vertex');
    if(Math.abs(ha)<1e-10)add(p[a],p[a+2]);
    if(Math.abs(hb)<1e-10)add(p[b],p[b+2]);
    if((ha<0&&hb>0)||(ha>0&&hb<0)){
     const t=ha/(ha-hb);
     add(p[a]+(p[b]-p[a])*t,p[a+2]+(p[b+2]-p[a+2])*t);
    }
   }
   if(cuts.length===2&&Math.hypot(cuts[0][0]-cuts[1][0],cuts[0][1]-cuts[1][1])>1e-7)
    segments.push(cuts);
  }
  return segments;
 }
 // The vertical displacement is bounded by the actual streamed mesh
 // elevation extrema. Culling just the sea-level tile rectangle would hide
 // elevated cliffs that still project into the camera viewport.
 function terrainTileVisible(mesh,state,width,height,margin=70){
  if(!mesh||!Array.isArray(mesh.positions)||!Number.isFinite(width)||
     !Number.isFinite(height)||width<=0||height<=0||
     !Number.isFinite(margin)||margin<0)
   throw new TypeError('Invalid terrain visibility request');
  const p=mesh.positions;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,
      minY=Infinity,maxY=-Infinity;
  for(let i=0;i<p.length;i+=3){
   minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);
   minY=Math.min(minY,p[i+1]);maxY=Math.max(maxY,p[i+1]);
   minZ=Math.min(minZ,p[i+2]);maxZ=Math.max(maxZ,p[i+2]);
  }
  const x0=width/2+(minX-state.x)*state.zoom,
        x1=width/2+(maxX-state.x)*state.zoom;
  const y0=height/2+(minZ-state.z)*state.zoom-maxY*state.zoom*state.relief,
        y1=height/2+(maxZ-state.z)*state.zoom-minY*state.zoom*state.relief;
  return !(x1 < -margin || x0 > width+margin ||
           y1 < -margin || y0 > height+margin);
 }
 function draw(canvas,registry,state,cache=new Map(),options={}){
  if(!canvas||typeof canvas.getContext!=='function'||!(registry instanceof Map))
   throw new TypeError('Invalid terrain canvas/registry');
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas 2D unavailable');
  const w=Math.max(1,canvas.width),h=Math.max(1,canvas.height);
  // First-person public-street preview asks for a wider SOURCE window, but
  // retains the same 25-mesh GPU/CPU budget and its guaranteed near 3×3.
  const lookAhead=options.lookAhead;
  const plan=Tiles.planStreaming(state.x,state.z,registry,[...cache.keys()],
   {radius:lookAhead?3:2,maxLoaded:25,lookAhead});
  for(const key of plan.unload)cache.delete(key);
  const lod=state.zoom>=1.2?1:state.zoom>=.45?2:4;
  for(const key of plan.active){
   const slot=cache.get(key);
   const sourceTile=registry.get(key);
   // A new licensed/local DEM may reuse the same tile ID and LOD as an
   // earlier artist fixture. Geometry MUST be rebuilt from the new validated
   // source, not silently taken from a cache keyed only by coordinates.
   if(!slot||slot.lod!==lod||slot.sourceTile!==sourceTile)
   {const mesh=Tiles.buildTerrainMesh(sourceTile,lod);
    cache.set(key,{lod,sourceTile,mesh,shoreline:shorelineSegments(mesh)});}
  }
  ctx.fillStyle='#183139';ctx.fillRect(0,0,w,h);
  // Never display triangles for an unresolved tile: missing geodata remains
  // a distinctly unknown region, not invented "verified" topology.
  let triangles=0,visible=0,culledTiles=0;
  const renderedKeys=new Set();
  const toScreen=(x,z,elevation=0)=>Relief.project(
   [x,elevation,z],state,w,h,state.zoom,state.relief);
  // Draw distant/northern relief before lower/southern terrain. Streaming
  // chooses tiles by distance for caching, but that is NOT a valid painter's
  // order when oblique projection moves high contours up the screen.
  const paintOrder=[...plan.active].sort((a,b)=>{
   const at=registry.get(a),bt=registry.get(b);
   return at.tz-bt.tz||at.tx-bt.tx;
  });
  for(const key of paintOrder){
   const mesh=cache.get(key).mesh,p=mesh.positions,indices=mesh.triangles;
   if(!terrainTileVisible(mesh,state,w,h)){culledTiles++;continue;}
   renderedKeys.add(key);
   for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,
     va=[p[a],p[a+1],p[a+2]],vb=[p[b],p[b+1],p[b+2]],
     vc=[p[c],p[c+1],p[c+2]],
     a2=toScreen(...[va[0],va[2],va[1]]),
     b2=toScreen(...[vb[0],vb[2],vb[1]]),
     c2=toScreen(...[vc[0],vc[2],vc[1]]);
    if((a2[0]<-10&&b2[0]<-10&&c2[0]<-10)||
       (a2[0]>w+10&&b2[0]>w+10&&c2[0]>w+10)||
       (a2[1]<-10&&b2[1]<-10&&c2[1]<-10)||
       (a2[1]>h+10&&b2[1]>h+10&&c2[1]>h+10))continue;
    ctx.fillStyle=Relief.triangleColor(va,vb,vc);
    ctx.beginPath();ctx.moveTo(...a2);ctx.lineTo(...b2);ctx.lineTo(...c2);
    ctx.closePath();ctx.fill();triangles++;
    if(state.showContours&&state.zoom>=.48){
     const lines=Relief.contours(va,vb,vc,25);
     ctx.strokeStyle='#f5ecd180';ctx.lineWidth=Math.max(.5,state.zoom*.65);
     for(const line of lines){
      const from=toScreen(line.from[0],line.from[2],line.from[1]),
       to=toScreen(line.to[0],line.to[2],line.to[1]);
      ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();
     }
    }
   }
   const tile=registry.get(key),b=Tiles.tileBounds(tile.tx,tile.tz),
    ul=toScreen(b.minX,b.minZ),br=toScreen(b.maxX,b.maxZ);
   ctx.strokeStyle='#d8dbd338';ctx.lineWidth=1;ctx.strokeRect(
    ul[0],ul[1],br[0]-ul[0],br[1]-ul[1]);
   visible++;
  }
  // Render only contours from LOADED triangles. Unknown and missing tiles
  // have no shoreline, and the contour toggle retains its existing meaning.
  let shoreline=0;
  if(state.showContours){
   ctx.strokeStyle='#9bd3dc';ctx.lineWidth=Math.max(.7,state.zoom*1.5);
   for(const key of paintOrder){
    if(!renderedKeys.has(key))continue;
    const slot=cache.get(key);
    for(const [a,b] of slot.shoreline){
     const from=toScreen(a[0],a[1],0),to=toScreen(b[0],b[1],0);
     ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();
     shoreline++;
    }
   }
  }
  // Actually draw street ribbons over local 512m terrain using current LOD
  // vertices, not fake flat decals, and never over unknown imported tiles.
  // This visual-only original street network has no gameplay collision.
  let roadTriangles=0;
  if(Streets&&options.showFictionalBuildings!==false){
   const original=Streets.triangulate(registry,cache,renderedKeys);
   const extended=Districts?Streets.triangulate(registry,cache,renderedKeys,
    Districts.visibleStreets(renderedKeys)):[];
   for(const road of [...original,...extended]){
    const verts=road.vertices.map(p=>toScreen(p[0],p[2],p[1]));
    if(verts.every(p=>p[0]<-10)||verts.every(p=>p[0]>w+10)||
       verts.every(p=>p[1]<-10)||verts.every(p=>p[1]>h+10))continue;
    ctx.fillStyle='#6f6960';
    ctx.beginPath();ctx.moveTo(...verts[0]);ctx.lineTo(...verts[1]);
    ctx.lineTo(...verts[2]);ctx.closePath();ctx.fill();
    roadTriangles++;
   }
  }
  // Visual-only conceptual civic building shells. They do not participate
  // in the existing arena, BR96 authoritative world or legacy save format.
  let houses=0;
  for(const home of options.showFictionalBuildings===false?[]:CIVIC_SHELLS){
   const key=Tiles.tileFor(home.x,home.z).key;
   if(!plan.active.includes(key))continue;
   // Ground every conceptual facade on the same painted triangle used
   // by terrain, not a different bilinear grid interpolation.
   const mesh=cache.get(key)?.mesh;
   if(!mesh)continue;
   const elevation=Tiles.heightOnTerrainMesh(mesh,home.x,home.z),
    [px,pz]=toScreen(home.x,home.z,elevation),
    ww=home.w*state.zoom,dd=home.d*state.zoom,
    facadeHeight=home.h*state.zoom*state.relief;
   if(px+ww/2<0||px-ww/2>w||pz+dd/2<0||pz-dd/2>h)continue;
   ctx.fillStyle='#34454b';ctx.fillRect(px-ww/2+2,pz-dd/2+3,ww,dd);
   ctx.fillStyle='#716257';
   ctx.fillRect(px-ww/2,pz-dd/2-facadeHeight,ww,facadeHeight+dd);
   ctx.fillStyle=home.color;ctx.fillRect(px-ww/2,pz-dd/2-facadeHeight,ww,dd);
   ctx.fillStyle='#ddd0ae';
   ctx.fillRect(px-ww/2,pz-dd/2-facadeHeight,ww,Math.max(1,state.zoom));
   houses++;
  }
  // Eight additional original neighborhood plans (6 x 5 parcels per block,
  // two open public-court plots each). Never paint fictional geometry on
  // externally imported DEMs, unknown tiles or underwater/cliff edges.
  let districtBuildingsVisible=0;
  const visibleDistricts=new Set();
  if(Districts&&options.showFictionalBuildings!==false){
   for(const building of Districts.PLAN.buildings){
    const foundation=Districts.buildingFoundation(
     building,registry,cache,renderedKeys);
    if(!foundation)continue;
    const [px,py]=toScreen(building.x,building.z,foundation.baseMetres),
     ww=building.w*state.zoom,dd=building.d*state.zoom,
     facade=building.h*state.zoom*state.relief;
    if(px+ww/2<0||px-ww/2>w||py+dd/2<0||py-dd/2-facade>h)continue;
    // The visible plinth links the house facade to its full topographic
    // footprint rather than positioning a 2D rectangle at arbitrary sea.
    const step=Math.max(0,foundation.plinthMetres*state.zoom*state.relief);
    ctx.fillStyle='#4d4b43';
    ctx.fillRect(px-ww/2,py-dd/2,ww,dd+step);
    ctx.fillStyle='#74695e';
    ctx.fillRect(px-ww/2,py-dd/2-facade,ww,facade+dd);
    ctx.fillStyle=building.color;
    ctx.fillRect(px-ww/2,py-dd/2-facade,ww,dd);
    ctx.fillStyle=building.roofStyle==='parapet'?'#ece0c9':'#ddd1b9';
    ctx.fillRect(px-ww/2,py-dd/2-facade,ww,Math.max(1,state.zoom));
    // Readable simple shaded window recesses, not PBR or full 3D architecture.
    if(state.zoom>=.55&&ww>=8){
     ctx.fillStyle='#5a5b53';
     const unit=Math.max(1,ww*.1);
     ctx.fillRect(px-ww*.26,py-dd/2-facade+dd*.38,unit,
      Math.max(1,dd*.15));
     ctx.fillRect(px+ww*.17,py-dd/2-facade+dd*.38,unit,
      Math.max(1,dd*.15));
    }
    if(building.publicInterior){
     // Physically authored 3m public entrance faces its open courtyard.
     // The threshold is painted at ground level matching wall collision.
     const doorWidth=3*state.zoom,doorDepth=Math.max(1,state.zoom*.9);
     ctx.fillStyle='#292e2c';
     ctx.fillRect(px-doorWidth/2,py+dd/2-doorDepth,
      doorWidth,doorDepth*2);
     if(options.closedDoorIds?.has(building.id)){
      ctx.fillStyle='#a17d52';
      ctx.fillRect(px-doorWidth/2,py+dd/2-doorDepth,doorWidth,doorDepth*2);
     }
     if(options.showPublicRoom===building.id){
      // Roof cutaway reveals a single grounded original public room only
      // when the walker is already physically inside its doorway.
      const padding=Math.max(1,.35*state.zoom);
      ctx.fillStyle='#bdab8d';
      ctx.fillRect(px-ww/2+padding,py-dd/2+padding,
       Math.max(0,ww-2*padding),Math.max(0,dd-2*padding));
      ctx.strokeStyle='#574f43';ctx.lineWidth=Math.max(1,padding);
      ctx.strokeRect(px-ww/2+padding,py-dd/2+padding,
       Math.max(0,ww-2*padding),Math.max(0,dd-2*padding));
     }
    }
    districtBuildingsVisible++;
    visibleDistricts.add(building.district);
   }
  }
  const origin=Tiles.tileFor(state.x,state.z),centerTile=registry.get(origin.key);
  // The UI reticle must sample exactly the TRIANGLE we just painted,
  // not bilinear source samples when the chosen LOD is a coarse planar mesh.
  // This keeps the displayed physical elevation continuous with the current
  // actual geometry and never invents absolute/georeferenced Aden heights.
  const paintedCentre=centerTile&&cache.get(origin.key)?.sourceTile===centerTile
   ?cache.get(origin.key).mesh:null;
  const surface=paintedCentre
   ?Tiles.terrainSurface(paintedCentre,state.x,state.z):null;
  const centerElevationMetres=surface
   ?Math.round(surface.elevationMetres*100)/100:null;
  const centerSlopeDegrees=surface
   ?Math.round(surface.slopeDegrees*10)/10:null;
  // Unknown source tiles must not fabricate a surveyed ground reticle.
  if(surface){
   const axis=toScreen(state.x,state.z,surface.elevationMetres);
   ctx.strokeStyle='#ffe2a0';ctx.lineWidth=2;
   ctx.beginPath();ctx.moveTo(axis[0]-7,axis[1]);ctx.lineTo(axis[0]+7,axis[1]);
   ctx.moveTo(axis[0],axis[1]-7);ctx.lineTo(axis[0],axis[1]+7);ctx.stroke();
  }
  return Object.freeze({origin:origin.key,active:plan.active.length,triangles,
   visibleTiles:visible,culledTiles,roadTriangles,
   housesVisible:houses,districtBuildingsVisible,
   districtsVisible:visibleDistricts.size,shorelineSegments:shoreline,
   unresolved:plan.unresolved.length,lodStep:lod,
   centerElevationMetres,centerSlopeDegrees,localElevationOnly:true,centerElevationSurface:'painted-triangle',
   zoom:state.zoom,relief:state.relief,showContours:state.showContours,
   provenance:options.imported?'source-declared-unreviewed':'artist-blockout',
   realAdenTilesLoaded:0});
 }
 // Focus a newly imported local DEM on an ACTUALLY LOADED tile, not on
 // the fictional (0,0) sample. Sparse data can leave its bounding-box center
 // empty; choose the nearest real tile when local files are loaded.
 function importedTerrainFocus(registry){
  if(!(registry instanceof Map)||registry.size===0)
   throw new TypeError('No imported terrain tiles to focus');
  const tiles=[...registry.values()].map(tile=>({
   key:tile.key,x:(tile.tx+.5)*Tiles.TILE_METRES,
   z:(tile.tz+.5)*Tiles.TILE_METRES
  })).filter(tile=>{
   try{Tiles.point(tile.x,tile.z);return true;}catch(_){return false;}
  });
  if(!tiles.length)throw new RangeError('Imported terrain lies outside the viewable local coordinates');
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x)),
   minZ=Math.min(...tiles.map(t=>t.z)),maxZ=Math.max(...tiles.map(t=>t.z)),
   cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  tiles.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz)||
   a.key.localeCompare(b.key));
  return Object.freeze({x:tiles[0].x,z:tiles[0].z,key:tiles[0].key});
 }
 // Shared human-sized occupancy test for the current streamed pedestrian
 // preview. There is no network actor, teleporting, invisible wall or
 // hidden civilian state. Every step checks the actual current people.
 function civicPoseClear(pose,others,radius=Walk?.RADIUS_METRES||.55){
  if(!pose||![pose.x,pose.z,radius].every(Number.isFinite)||radius<=0||
     !Array.isArray(others))return false;
  return others.every(other=>!other||![other.x,other.z].every(Number.isFinite)||
    Math.hypot(pose.x-other.x,pose.z-other.z)>=2*radius+.10);
 }
 function publicDoorClear(world,people){
  return !!Walk&&Array.isArray(people)&&people.every(person=>
    person&&Number.isFinite(person.x)&&Number.isFinite(person.z)&&
    !!Walk.probe(world,person.x,person.z));
 }
 function attach(doc=typeof document!=='undefined'?document:null){
  if(!doc)return null;
  const canvas=doc.getElementById('terrainCanvas'),
   info=doc.getElementById('tileStatus');
  if(!canvas||!info)return null;
  let registry=createPreviewRegistry(),activeDataset=null;
  const cache=new Map();
  let state=viewState(),fileSelectionRevision=0;
  let walk=null,walkWorld=null,walkWorldKey='',walkRegistry=null,
   walkTerrainRevision=null,walkClock=null,walkAccum=0,walkFrame=0,
   idlePaintTicks=0;
  const held=new Set(),closedDoors=new Set();
  let publicRoomCursor=0,footpath=null,footpathWorld=null;
  let eyeLevel=false,eyeYaw=0,eyePitch=0;
  let civicWalkers=[];
  function releaseHeldWalk(){
   // Focused or hidden tabs can indefinitely postpone their scheduled RAF.
   // Cancel the pending callback, not just WASD: otherwise a fresh keypress
   // cannot schedule a new loop until an obsolete frame eventually fires.
   if(walkFrame&&typeof window!=='undefined'&&typeof window.cancelAnimationFrame==='function')
    window.cancelAnimationFrame(walkFrame);
   walkFrame=0;held.clear();walkClock=null;walkAccum=0;idlePaintTicks=0;
  }
  function invalidateWalking(){
   releaseHeldWalk();
   walk=null;walkWorld=null;walkWorldKey='';walkRegistry=null;
   walkTerrainRevision=null;
   eyeLevel=false;eyeYaw=0;eyePitch=0;
   const eyeButton=doc.getElementById('streetPerspective');
   if(eyeButton)eyeButton.setAttribute?.('aria-pressed','false');
   footpath=null;footpathWorld=null;civicWalkers=[];
   const btn=doc.getElementById('walkProbe');
   if(btn)btn.setAttribute?.('aria-pressed','false');
  }
  // A handful of noncombat residents use original public-room pavements.
  // Their positions are real 60Hz ground/collision states, never map pins.
  // The source is synthetic artist geography, NOT the actual Aden population.
  function civicActorsFor(world,previous=[]){
   if(!world||!Districts||!Walk)return [];
   const priorById=new Map(previous.map(a=>[a.id,a]));
   const actors=[];
   for(const room of Districts.PUBLIC_INTERIORS.slice(0,8)){
    const baseX=room.x+3.5,baseZ=room.z+room.d/2+2.0,
      prior=priorById.get(room.id),oldPose=prior?.pose;
    const floor=Walk.probe(world,oldPose?.x??baseX,oldPose?.z??baseZ);
    if(!floor||(oldPose&&Math.abs(floor.y-oldPose.y)>.35))continue;
    try{
     actors.push({id:room.id,minX:baseX,maxX:baseX+3.1,
       direction:prior?.direction??1,
       pose:oldPose?Object.freeze({...oldPose,y:floor.y}):
        Walk.initial(world,baseX,baseZ)});
    }catch(_){/* No person on an unsupported or blocked ground surface. */}
   }
   return actors;
  }
  function worldForWalking(){
   if(activeDataset||!Walk||!Districts)return null;
   const keys=[...cache.keys()].sort();
   const signature=keys.map(key=>key+':'+cache.get(key).lod).join('|')+
    '|doors:'+([...closedDoors].sort().join(','));
   if(!walkWorld||walkWorldKey!==signature||walkRegistry!==registry||
      !terrainRevisionMatches(cache,walkTerrainRevision)){
    walkWorld=Walk.createWorld(registry,cache,new Set(keys),
     [...CIVIC_SHELLS,...Districts.PLAN.buildings],closedDoors);
    walkWorldKey=signature;walkRegistry=registry;
    walkTerrainRevision=terrainRevision(cache);
    civicWalkers=civicActorsFor(walkWorld,civicWalkers);
    // A route is certified against the precise loaded mesh revision and
    // door configuration. Rebuilding the world invalidates old elevations.
    if(footpathWorld&&footpathWorld!==walkWorld){
     footpath=null;footpathWorld=null;
    }
   }
   return walkWorld;
  }
  function refresh(){
   const legend=doc.getElementById('mapLegendTitle'),
    houses=doc.getElementById('fictionalHouseLegend'),
    roads=doc.getElementById('fictionalStreetLegend'),
    districts=doc.getElementById('fictionalDistrictLegend');
   if(legend)legend.textContent=activeDataset?
    '입력한 로컬 고도 · 출처 외부 검증 전':'원본 창작 지형 · 축척 검증';
   if(houses)houses.hidden=!!activeDataset;
   if(roads)roads.hidden=!!activeDataset;
   if(districts)districts.hidden=!!activeDataset;
   const width=Math.max(320,canvas.clientWidth||canvas.width||960),
     height=Math.max(200,canvas.clientHeight||canvas.height||600);
   const dpr=Math.max(1,Math.min(2,(typeof devicePixelRatio==='number'?devicePixelRatio:1)));
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   // State in world metres, zoom in CSS pixels => convert to bitmap pixels.
   const zoomState={...state,zoom:state.zoom*dpr};
   const insideRoom=walk&&Districts?
    Districts.publicRoomAt(walk.x,walk.z):null;
   const stats=draw(canvas,registry,zoomState,cache,{
    imported:!!activeDataset,showFictionalBuildings:!activeDataset,
    showPublicRoom:insideRoom?.id||null,closedDoorIds:closedDoors,
    lookAhead:walk&&eyeLevel?{x:Math.sin(eyeYaw),z:-Math.cos(eyeYaw)}:undefined});
   if(walk&&footpathWorld)worldForWalking();
   if(walk&&eyeLevel&&StreetEye){
    StreetEye.draw(canvas,registry,cache,walk,eyeYaw,
     [...CIVIC_SHELLS,...(Districts?.PLAN?.buildings||[])],eyePitch);
   }
   if(walk&&!eyeLevel){
    const ctx=canvas.getContext('2d');
    // Render actual terrain-grounded footsteps beside public venues.
    // These visible local civilians never reveal a live BR rival position.
    for(const a of civicWalkers){
     const [cx,cz]=Relief.project([a.pose.x,a.pose.y,a.pose.z],zoomState,
       canvas.width,canvas.height,zoomState.zoom,zoomState.relief);
     ctx.fillStyle='#9ad3c4';
     ctx.fillRect(cx-3*dpr,cz-3*dpr,6*dpr,6*dpr);
    }
    // Read-only original public walking preview; drawing never changes
    // the fixed-step pedestrian or campaign story checkpoint.
    if(footpath?.status==='planned'&&footpath.points.length>1){
     ctx.strokeStyle='#f2d282';ctx.lineWidth=Math.max(2,2*dpr);
     ctx.beginPath();
     footpath.points.forEach((p,i)=>{
      const [px,pz]=Relief.project([p.x,p.y,p.z],zoomState,
       canvas.width,canvas.height,zoomState.zoom,zoomState.relief);
      if(i===0)ctx.moveTo(px,pz);else ctx.lineTo(px,pz);
     });
     ctx.stroke();
    }
    const [px,pz]=Relief.project([walk.x,walk.y,walk.z],zoomState,
     canvas.width,canvas.height,zoomState.zoom,zoomState.relief);
    ctx.fillStyle='#f5d388';ctx.fillRect(px-5,pz-5,10,10);
    ctx.strokeStyle='#241e1a';ctx.lineWidth=2;ctx.strokeRect(px-5,pz-5,10,10);
   }
   const inspectedElevation=stats.centerElevationMetres===null
    ?'중심 표고 자료 없음'
    :'현재 메시 표면 '+stats.centerElevationMetres.toFixed(2)+'m · 경사 '+stats.centerSlopeDegrees.toFixed(1)+'° (로컬 미터 · 현지 해발 미검증)';
   info.textContent=(activeDataset?
    '로컬 자료 입력 (출처·권리·정확도 외부 검증 전): '+activeDataset.title+
    ' / '+activeDataset.tilesImported+'개 타일 · '+(activeDataset.filesImported||1)+'개 파일 · ':
    '원본: 창작 아트 테스트 (실측 아덴 0타일) · ')+
    stats.origin+' · '+inspectedElevation+' · 불러온 '+stats.active+'개 / 누락 '+stats.unresolved+
    '개 · 1:1 미터 좌표 · 지형 삼각형 '+stats.triangles+
    '개 · 창작 도로 삼각형 '+stats.roadTriangles+
    '개 · 창작 확장건물 '+stats.districtBuildingsVisible+
    '개 · 실제 아덴 검증 0타일'+
    (walk?' · 창작 보행 판정 '+walk.x.toFixed(1)+','+walk.z.toFixed(1)+
     'm / '+walk.tick+'틱 · 실제 보행자 '+civicWalkers.length+'명'+
     (walk.blocked?' (통행 제한)':'')+
     (insideRoom?' · 창작 공공 실내: '+insideRoom.district:'')+
     (closedDoors.size?' · 닫힌 공공실 문 '+closedDoors.size+'개':'')+
     (eyeLevel?' · 보행자 눈높이 지형 시점 (V 전환)':'')+
     (footpath?.status==='planned'?' · 창작 공공실 경로 '+footpath.distanceMetres.toFixed(1)+'m':
      footpath?.status==='door-closed'?' · 공공실 문 닫힘 — 보행 경로 없음':
      footpath?.status==='unreachable'?' · 보행 가능 경로 없음':''):'');
  }
  function action(which){
   const speed=Tiles.TILE_METRES/4;
   if(which==='north')state=pan(state,0,-speed);
   if(which==='south')state=pan(state,0,speed);
   if(which==='east')state=pan(state,speed,0);
   if(which==='west')state=pan(state,-speed,0);
   if(which==='zoomIn')state=setZoom(state,state.zoom*1.25);
   if(which==='zoomOut')state=setZoom(state,state.zoom/1.25);
   if(which==='reset')state=viewState();
   if(which==='relief')state=setRelief(state,state.relief>0?0:.38);
   if(which==='contours')state=setContours(state,!state.showContours);
   refresh();
  }
  function toggleWalking(){
   if(walk){invalidateWalking();refresh();return false;}
   if(activeDataset||!Walk)return false;
   // Use currently drawn mesh and its exact LOD at the camera centre.
   refresh();
   const world=worldForWalking();
   if(!world)return false;
   try{walk=Walk.initial(world,state.x,state.z);}
   catch(error){info.textContent='보행 시작 불가: 현재 지형/건물 경계 확인 필요';return false;}
   const button=doc.getElementById('walkProbe');
   if(button)button.setAttribute?.('aria-pressed','true');
   refresh();
   // Live local street life continues independently of the camera operator's
   // WASD. Hidden/defocused tabs still cancel the fixed-step callback.
   scheduleWalk();
   return true;
  }
  function focusNextPublicRoom(){
   // Camera shortcut for touring eight distinct ORIGINAL public interiors.
   // Never teleports a live pedestrian through a wall or changes game saves.
   if(walk||activeDataset||!Districts)return null;
   const rooms=Districts.PUBLIC_INTERIORS;
   if(!rooms.length)return null;
   const room=rooms[publicRoomCursor%rooms.length];
   publicRoomCursor++;
   state=viewState({...state,x:room.x,z:room.z+room.d/2+2,
    zoom:Math.max(1.2,state.zoom)});
   refresh();return room.id;
  }
  function toggleStreetPerspective(){
   if(!walk||activeDataset||!StreetEye)return false;
   eyeLevel=!eyeLevel;
   const button=doc.getElementById('streetPerspective');
   if(button)button.setAttribute?.('aria-pressed',String(eyeLevel));
   refresh();return eyeLevel;
  }
  function planPublicFootpath(){
   if(!walk||activeDataset||!Routes)return null;
   // Route is a preview only; no control input, AI auto-motion or save.
   refresh();
   const world=worldForWalking();
   if(!world)return null;
   footpath=Routes.plan(world,walk);
   footpathWorld=world;
   refresh();return footpath;
  }
  function toggleNearbyDoor(){
   if(!walk||activeDataset||!Districts||!Walk)return false;
   const nearest=Districts.PUBLIC_INTERIORS.map(room=>({
    room,distance:Math.hypot(walk.x-room.x,
     walk.z-(room.z+room.d/2))
   })).sort((a,b)=>a.distance-b.distance)[0];
   if(!nearest||nearest.distance>2.5)return false;
   const room=nearest.room;
   if(closedDoors.has(room.id))closedDoors.delete(room.id);
   else{
    // A door cannot be closed THROUGH the pedestrian who currently
    // occupies its swing/threshold. Reject without mutating any state.
    const next=new Set(closedDoors);next.add(room.id);
    const candidate=Walk.createWorld(registry,cache,new Set(cache.keys()),
     [...CIVIC_SHELLS,...Districts.PLAN.buildings],next);
    // Closing a physical public door may not trap a REAL pedestrian whose
    // body is in the threshold. Test the player AND every streamed resident
    // against the prospective solid world before committing the door state.
    if(!publicDoorClear(candidate,[walk,...civicWalkers.map(a=>a.pose)]))
     return false;
    closedDoors.add(room.id);
   }
   walkWorld=null;walkWorldKey='';footpath=null;footpathWorld=null;
   refresh();return true;
  }
  function walkStep(intent,frames=1,paint=true){
   if(!walk||!Number.isInteger(frames)||frames<1||frames>120)
    return false;
   if(Number.isFinite(intent?.east)&&Number.isFinite(intent?.south)&&
      Math.hypot(intent.east,intent.south)>1e-8)
    eyeYaw=Math.atan2(intent.east,-intent.south);
   const world=worldForWalking();
   if(!world){invalidateWalking();return false;}
   for(let i=0;i<frames;i++){
    // The new civilian bodies are solid to the PLAYER as well as the other
    // way around. A swept 60Hz proposed step may not enter a standing
    // pedestrian's ordinary shared pavement footprint.
    const proposed=Walk.step(world,walk,intent);
    const occupied=civicWalkers.some(actor=>Math.hypot(
      proposed.x-actor.pose.x,proposed.z-actor.pose.z)<
      Walk.RADIUS_METRES*2+.10);
    walk=occupied?Walk.step(world,walk,{east:0,south:0}):proposed;
    for(const actor of civicWalkers){
     if((actor.direction>0&&actor.pose.x>=actor.maxX-.04)||
        (actor.direction<0&&actor.pose.x<=actor.minX+.04))
       actor.direction*=-1;
     // Probe the actual next fixed-step landing, then yield if either the
     // captain or ANOTHER currently living pedestrian occupies it.
     const proposedCivilian=Walk.step(world,actor.pose,{east:actor.direction});
     const people=[walk,...civicWalkers.filter(other=>other!==actor)
       .map(other=>other.pose)];
     const occupied=!civicPoseClear(proposedCivilian,people);
     const next=occupied?Walk.step(world,actor.pose,{east:0}):proposedCivilian;
     if(!occupied&&next.blocked)actor.direction*=-1;
     actor.pose=next;
    }
   }
   state=viewState({...state,x:walk.x,z:walk.z});
   if(paint)refresh();
   return true;
  }
  function walkFrameStep(time){
   walkFrame=0;
   if(!walk||(!held.size&&!civicWalkers.length)||doc.hidden)return;
   if(!Number.isFinite(time))return;
   if(walkClock===null)walkClock=time;
   walkAccum+=Math.max(0,Math.min(.09,(time-walkClock)/1000));
   walkClock=time;
   const fixed=1/Walk.TICKS_PER_SECOND,ticks=Math.min(5,Math.floor(walkAccum/fixed));
   if(ticks){
    walkAccum-=ticks*fixed;
    const activeMove=held.size>0;
    // Preserve the 60Hz civilian body simulation while repainting the
    // expensive 25-tile Canvas only at 10Hz when the player is stationary.
    // Eye-level software terrain traversal is deliberately repainted at
    // no more than 12Hz. Actual collision/NPC motion still advances at the
    // original deterministic 60Hz, independent of display refresh rate.
    idlePaintTicks=eyeLevel?idlePaintTicks+ticks:
      (activeMove?0:idlePaintTicks+ticks);
    const paint=eyeLevel?idlePaintTicks>=5:
      (activeMove||idlePaintTicks>=6);
    if(paint)idlePaintTicks=0;
    walkStep({east:Number(held.has('d'))-Number(held.has('a')),
     south:Number(held.has('s'))-Number(held.has('w'))},ticks,paint);
   }
   if(walk&&(held.size>0||civicWalkers.length>0)&&!doc.hidden&&
      typeof window!=='undefined'&&
      typeof window.requestAnimationFrame==='function')
    walkFrame=window.requestAnimationFrame(walkFrameStep);
  }
  function scheduleWalk(){
   if(walkFrame||!walk||doc.hidden||
      (!held.size&&!civicWalkers.length)||typeof window==='undefined'||
      typeof window.requestAnimationFrame!=='function')return;
   walkClock=null;walkAccum=0;
   walkFrame=window.requestAnimationFrame(walkFrameStep);
  }
  // A batch replaces sample art or a previous imported world only when
  // its local coordinates, source declarations and all internal seams pass.
  // File.text() handlers reserve the generation themselves; no extra token
  // may be incremented when the already selected batch is committed.
  function commitParsedDataset(parsed){
   const focus=importedTerrainFocus(parsed.registry);
   const centered=viewState({x:focus.x,z:focus.z});
   const dataset=Object.freeze({...parsed,filesImported:1});
   invalidateWalking();closedDoors.clear();publicRoomCursor=0;
   registry=parsed.registry;activeDataset=dataset;
   state=centered;cache.clear();refresh();
   return dataset;
  }
  function commitDataset(value){
   return commitParsedDataset(Tiles.importHeightDataset(value));
  }
  function commitAppendDataset(value){
   const parsed=Tiles.importHeightDataset(value);
   // Do not silently combine source-declared local DEM tiles with the 25
   // automatically generated fictional preview tiles.
   if(!activeDataset)return commitParsedDataset(parsed);
   const combined=Tiles.mergeHeightRegistries(registry,parsed.registry);
   const dataset=Object.freeze({
    ...activeDataset,registry:combined.registry,
    tilesImported:combined.tilesTotal,seams:combined.seams,
    filesImported:(activeDataset.filesImported||1)+1
   });
   // All validations succeeded; commit exactly once. Existing tile objects
   // and their cached current-LOD meshes remain valid and camera stays put.
   invalidateWalking();closedDoors.clear();publicRoomCursor=0;
   registry=combined.registry;activeDataset=dataset;refresh();
   return dataset;
  }
  function loadDataset(value){
   // An explicit API call, even invalid, cancels any older pending File.text.
   fileSelectionRevision++;
   return commitDataset(value);
  }
  function appendDataset(value){
   fileSelectionRevision++;
   return commitAppendDataset(value);
  }
  function resetSample(){
   // Reset is a newer user decision, not an intermediate render. Never let
   // an older File.text() promise resurrect an imported dataset afterward.
   fileSelectionRevision++;
   invalidateWalking();closedDoors.clear();publicRoomCursor=0;
   registry=createPreviewRegistry();activeDataset=null;
   state=viewState();cache.clear();refresh();
  }
  // Replace and append inputs share ONE revision. A delayed read from
  // either control must never overwrite a newer replace, append or reset.
  for(const [id,append] of [['heightFile',false],['appendHeightFile',true]]){
   const fileInput=doc.getElementById(id);
   if(!fileInput)continue;
   fileInput.addEventListener('change',async event=>{
    const selection=++fileSelectionRevision;
    const file=event.target?.files?.[0];
    if(!file)return;
    if(file.size>4*1024*1024){
     info.textContent='입력 실패: 파일은 4MB 이하만 허용합니다';return;
    }
    try{
     const contents=await file.text();
     // Recheck generation AFTER asynchronous local read but BEFORE any
     // validation or mutation, regardless of which input originated it.
     if(selection!==fileSelectionRevision)return;
     (append?commitAppendDataset:commitDataset)(JSON.parse(contents));
    }catch(error){
     if(selection===fileSelectionRevision)
      info.textContent='지형 입력 거부: '+error.message;
    }
   });
  }
  const resetButton=doc.getElementById('resetSample');
  if(resetButton)resetButton.addEventListener('click',resetSample);
  const walkButton=doc.getElementById('walkProbe');
  if(walkButton)walkButton.addEventListener('click',toggleWalking);
  const roomTourButton=doc.getElementById('publicRoomTour');
  if(roomTourButton)roomTourButton.addEventListener('click',focusNextPublicRoom);
  const pathButton=doc.getElementById('publicFootpath');
  if(pathButton)pathButton.addEventListener('click',planPublicFootpath);
  const eyeButton=doc.getElementById('streetPerspective');
  if(eyeButton)eyeButton.addEventListener('click',toggleStreetPerspective);
  for(const id of ['north','south','east','west','zoomIn','zoomOut','reset','relief','contours']){
   const button=doc.getElementById(id);
   if(button)button.addEventListener('click',()=>action(id));
  }
  // Focusing a PC control must stop a previously held walk even when
  // the last physical keyup was lost. A hidden tab is never driving gameplay.
  doc.addEventListener?.('focusin',event=>{
   if(interactiveKeyTarget(event.target))releaseHeldWalk();
  });
  doc.addEventListener?.('visibilitychange',()=>{
   if(doc.hidden)releaseHeldWalk();
  });
  if(typeof window!=='undefined'){
   window.addEventListener('keydown',event=>{
    if(doc.hidden||event.altKey||event.ctrlKey||event.metaKey||event.isComposing||
       interactiveKeyTarget(event.target))return;
    const key=typeof event.key==='string'?event.key.toLowerCase():'';
    if(key==='p'&&!event.repeat){event.preventDefault();toggleWalking();return;}
    if(key==='v'&&walk&&!event.repeat){
     event.preventDefault();toggleStreetPerspective();return;
    }
    if(walk&&key==='f'&&!event.repeat){
     event.preventDefault();toggleNearbyDoor();return;
    }
    if(walk&&eyeLevel&&['arrowup','arrowdown','arrowleft','arrowright'].includes(key)){
     // PC street-eye view looks without moving the physical pedestrian or
     // scrolling the browser. WASD still owns the original 60Hz footsteps.
     event.preventDefault();
     if(key==='arrowup')eyePitch=Math.min(.55,eyePitch+.1);
     if(key==='arrowdown')eyePitch=Math.max(-.55,eyePitch-.1);
     if(key==='arrowleft')eyeYaw-=.12;
     if(key==='arrowright')eyeYaw+=.12;
     refresh();return;
    }
    if(walk&&['w','a','s','d'].includes(key)){
     event.preventDefault();held.add(key);scheduleWalk();return;
    }
    const which={arrowup:'north',w:'north',arrowdown:'south',s:'south',
      arrowleft:'west',a:'west',arrowright:'east',d:'east',
      '+':'zoomIn','=':'zoomIn','-':'zoomOut',r:'reset',h:'relief',c:'contours'}[key];
    if(which){event.preventDefault();action(which);}
   });
   window.addEventListener('keyup',event=>{
    const key=typeof event.key==='string'?event.key.toLowerCase():'';
    held.delete(key);
    if(!held.size){walkClock=null;walkAccum=0;}
   });
   window.addEventListener('blur',releaseHeldWalk);
   window.addEventListener('resize',refresh);
  }
  refresh();
  return Object.freeze({getState:()=>state,getRegistry:()=>registry,
   getDataset:()=>activeDataset,getWalk:()=>walk,
   getStreetPerspective:()=>eyeLevel,
   getStreetLook:()=>Object.freeze({yaw:eyeYaw,pitch:eyePitch}),
   toggleStreetPerspective,
   getClosedDoors:()=>Object.freeze([...closedDoors].sort()),getFootpath:()=>footpath,
   getCivicWalkers:()=>Object.freeze(civicWalkers.map(a=>Object.freeze({
    id:a.id,x:a.pose.x,z:a.pose.z,y:a.pose.y,tick:a.pose.tick,
    blocked:a.pose.blocked,direction:a.direction
   }))),
   action,refresh,toggleWalking,toggleNearbyDoor,focusNextPublicRoom,planPublicFootpath,walkStep,
   loadDataset,appendDataset,resetSample});
 }
 return Object.freeze({SOURCE,fictionalHeight,createPreviewRegistry,
  CIVIC_SHELLS,viewState,pan,setZoom,setRelief,setContours,shorelineSegments,terrainTileVisible,draw,
  importedTerrainFocus,terrainRevision,terrainRevisionMatches,
  civicPoseClear,publicDoorClear,interactiveKeyTarget,attach});
});
