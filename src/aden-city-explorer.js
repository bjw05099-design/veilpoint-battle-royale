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
  (typeof module==='object'&&module.exports?require('./aden-map-relief.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenCityExplorer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tiles,Relief){
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
  const plan=Tiles.planStreaming(state.x,state.z,registry,[...cache.keys()],
   {radius:2,maxLoaded:25});
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
   visibleTiles:visible,culledTiles,
   housesVisible:houses,shorelineSegments:shoreline,
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
 function attach(doc=typeof document!=='undefined'?document:null){
  if(!doc)return null;
  const canvas=doc.getElementById('terrainCanvas'),
   info=doc.getElementById('tileStatus');
  if(!canvas||!info)return null;
  let registry=createPreviewRegistry(),activeDataset=null;
  const cache=new Map();
  let state=viewState(),fileSelectionRevision=0;
  function refresh(){
   const legend=doc.getElementById('mapLegendTitle'),
    houses=doc.getElementById('fictionalHouseLegend');
   if(legend)legend.textContent=activeDataset?
    '입력한 로컬 고도 · 출처 외부 검증 전':'원본 창작 지형 · 축척 검증';
   if(houses)houses.hidden=!!activeDataset;
   const width=Math.max(320,canvas.clientWidth||canvas.width||960),
     height=Math.max(200,canvas.clientHeight||canvas.height||600);
   const dpr=Math.max(1,Math.min(2,(typeof devicePixelRatio==='number'?devicePixelRatio:1)));
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   // State in world metres, zoom in CSS pixels => convert to bitmap pixels.
   const zoomState={...state,zoom:state.zoom*dpr};
   const stats=draw(canvas,registry,zoomState,cache,{
    imported:!!activeDataset,showFictionalBuildings:!activeDataset});
   const inspectedElevation=stats.centerElevationMetres===null
    ?'중심 표고 자료 없음'
    :'현재 메시 표면 '+stats.centerElevationMetres.toFixed(2)+'m · 경사 '+stats.centerSlopeDegrees.toFixed(1)+'° (로컬 미터 · 현지 해발 미검증)';
   info.textContent=(activeDataset?
    '로컬 자료 입력 (출처·권리·정확도 외부 검증 전): '+activeDataset.title+
    ' / '+activeDataset.tilesImported+'개 타일 · ':
    '원본: 창작 아트 테스트 (실측 아덴 0타일) · ')+
    stats.origin+' · '+inspectedElevation+' · 불러온 '+stats.active+'개 / 누락 '+stats.unresolved+
    '개 · 1:1 미터 좌표 · 삼각형 '+stats.triangles+'개 · 실제 아덴 검증 0타일';
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
  // Commit validated local tiles without touching the selection revision.
  // File input already reserved its revision before async File.text(). An
  // additional increment here would suppress the user's validation error.
  function commitDataset(value){
   const parsed=Tiles.importHeightDataset(value);
   const focus=importedTerrainFocus(parsed.registry);
   const centered=viewState({x:focus.x,z:focus.z});
   // Failed imports do not replace the previous registry or current view.
   registry=parsed.registry;activeDataset=parsed;
   state=centered;cache.clear();refresh();
   return parsed;
  }
  function loadDataset(value){
   // External API imports cancel any pending File.text(), even when invalid.
   fileSelectionRevision++;
   return commitDataset(value);
  }
  function resetSample(){
   // Reset is a newer user decision, not an intermediate render. Never let
   // an older File.text() promise resurrect an imported dataset afterward.
   fileSelectionRevision++;
   registry=createPreviewRegistry();activeDataset=null;
   state=viewState();cache.clear();refresh();
  }
  const fileInput=doc.getElementById('heightFile');
  if(fileInput)fileInput.addEventListener('change',async event=>{
   const selection=++fileSelectionRevision;
   const file=event.target?.files?.[0];
   if(!file)return;
   if(file.size>4*1024*1024){
    info.textContent='입력 실패: 파일은 4MB 이하만 허용합니다';return;
   }
   try{
    const contents=await file.text();
    // File I/O completes out of order. Never replace a newer dataset or
    // a reset view, including when the older file was perfectly valid.
    if(selection!==fileSelectionRevision)return;
    commitDataset(JSON.parse(contents));
   }catch(error){
    if(selection===fileSelectionRevision)
     info.textContent='지형 입력 거부: '+error.message;
   }
  });
  const resetButton=doc.getElementById('resetSample');
  if(resetButton)resetButton.addEventListener('click',resetSample);
  for(const id of ['north','south','east','west','zoomIn','zoomOut','reset','relief','contours']){
   const button=doc.getElementById(id);
   if(button)button.addEventListener('click',()=>action(id));
  }
  if(typeof window!=='undefined'){
   window.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||
       /^(input|textarea|select)$/i.test(event.target?.tagName||''))return;
    const key=event.key.toLowerCase(),
     which={arrowup:'north',w:'north',arrowdown:'south',s:'south',
      arrowleft:'west',a:'west',arrowright:'east',d:'east',
      '+':'zoomIn','=':'zoomIn','-':'zoomOut',r:'reset',h:'relief',c:'contours'}[key];
    if(which){event.preventDefault();action(which);}
   });
   window.addEventListener('resize',refresh);
  }
  refresh();
  return Object.freeze({getState:()=>state,getRegistry:()=>registry,
   getDataset:()=>activeDataset,action,refresh,loadDataset,resetSample});
 }
 return Object.freeze({SOURCE,fictionalHeight,createPreviewRegistry,
  CIVIC_SHELLS,viewState,pan,setZoom,setRelief,setContours,shorelineSegments,terrainTileVisible,draw,
  importedTerrainFocus,attach});
});
