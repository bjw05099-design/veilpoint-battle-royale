/* VEILPOINT 1:1 full-city terrain viewer: an ACTUAL local, standalone
 * browser preview of tile streaming, metre heights, triangular terrain,
 * and original NON-GEOREFERENCED civilian city art. Never treat generated
 * sample tiles as surveyed Aden, public facility locations or a playable
 * 96-person BR server.
 */
(function(root,factory){
 const api=factory(root.VeilpointAdenCityTiles||
  (typeof module==='object'&&module.exports?require('./aden-citywide-tiles.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenCityExplorer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tiles){
 'use strict';
 if(!Tiles)throw new Error('Requires src/aden-citywide-tiles.js');
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
  const x=options.x??0,z=options.z??0,zoom=options.zoom??.63;
  Tiles.point(x,z);
  if(!Number.isFinite(zoom)||zoom<.22||zoom>2.5)
   throw new RangeError('Invalid city preview zoom');
  return Object.freeze({x,z,zoom});
 }
 function pan(state,dx,dz){
  if(!Number.isFinite(dx)||!Number.isFinite(dz))throw new RangeError('Invalid pan');
  return viewState({x:state.x+dx,z:state.z+dz,zoom:state.zoom});
 }
 function setZoom(state,next){
  return viewState({x:state.x,z:state.z,zoom:Math.min(2.5,Math.max(.22,next))});
 }
 function draw(canvas,registry,state,cache=new Map()){
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
   if(!slot||slot.lod!==lod)
    cache.set(key,{lod,mesh:Tiles.buildTerrainMesh(registry.get(key),lod)});
  }
  ctx.fillStyle='#183139';ctx.fillRect(0,0,w,h);
  // Never display triangles for an unresolved tile: missing geodata remains
  // a distinctly unknown region, not invented "verified" topology.
  let triangles=0,visible=0;
  const toScreen=(x,z)=>[
   w/2+(x-state.x)*state.zoom,
   h/2+(z-state.z)*state.zoom];
  for(const key of plan.active){
   const mesh=cache.get(key).mesh,p=mesh.positions,indices=mesh.triangles;
   for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,
     a2=toScreen(p[a],p[a+2]),b2=toScreen(p[b],p[b+2]),
     c2=toScreen(p[c],p[c+2]);
    if((a2[0]<-10&&b2[0]<-10&&c2[0]<-10)||
       (a2[0]>w+10&&b2[0]>w+10&&c2[0]>w+10)||
       (a2[1]<-10&&b2[1]<-10&&c2[1]<-10)||
       (a2[1]>h+10&&b2[1]>h+10&&c2[1]>h+10))continue;
    const y=(p[a+1]+p[b+1]+p[c+1])/3,
     vx=p[b]-p[a],vz=p[b+2]-p[a+2],
     wx=p[c]-p[a],wz=p[c+2]-p[a+2],
     area=Math.abs(vx*wz-vz*wx)||1,
     slope=Math.min(1,Math.abs((p[b+1]-p[a+1])*wz-
                  (p[c+1]-p[a+1])*vz)/area*3);
    const light=Math.max(0,Math.min(21,Math.round((y+30)/7))),
     shadow=Math.round(slope*30);
    ctx.fillStyle=y<=0?'#315f72':y>100?'#887568':
     'rgb('+Math.min(205,110+light*3)+','+
      Math.max(80,125+light-shadow)+','+
      Math.max(64,99+light-shadow)+')';
    ctx.beginPath();ctx.moveTo(...a2);ctx.lineTo(...b2);ctx.lineTo(...c2);
    ctx.closePath();ctx.fill();triangles++;
   }
   const tile=registry.get(key),b=Tiles.tileBounds(tile.tx,tile.tz),
    ul=toScreen(b.minX,b.minZ),br=toScreen(b.maxX,b.maxZ);
   ctx.strokeStyle='#d8dbd338';ctx.lineWidth=1;ctx.strokeRect(
    ul[0],ul[1],br[0]-ul[0],br[1]-ul[1]);
   visible++;
  }
  // Visual-only conceptual civic building shells. They do not participate
  // in the existing arena, BR96 authoritative world or legacy save format.
  let houses=0;
  for(const home of CIVIC_SHELLS){
   const key=Tiles.tileFor(home.x,home.z).key;
   if(!plan.active.includes(key))continue;
   const [px,pz]=toScreen(home.x,home.z),
    ww=home.w*state.zoom,dd=home.d*state.zoom;
   if(px+ww/2<0||px-ww/2>w||pz+dd/2<0||pz-dd/2>h)continue;
   ctx.fillStyle='#34454b';ctx.fillRect(px-ww/2+2,pz-dd/2+3,ww,dd);
   ctx.fillStyle=home.color;ctx.fillRect(px-ww/2,pz-dd/2,ww,dd);
   ctx.fillStyle='#948778';ctx.fillRect(px-ww/2,pz-dd/2,ww,Math.max(1,state.zoom));
   houses++;
  }
  const origin=Tiles.tileFor(state.x,state.z);
  const axis=toScreen(state.x,state.z);
  ctx.strokeStyle='#ffe2a0';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(axis[0]-7,axis[1]);ctx.lineTo(axis[0]+7,axis[1]);
  ctx.moveTo(axis[0],axis[1]-7);ctx.lineTo(axis[0],axis[1]+7);ctx.stroke();
  return Object.freeze({origin:origin.key,active:visible,triangles,
   housesVisible:houses,unresolved:plan.unresolved.length,lodStep:lod,
   zoom:state.zoom,provenance:'artist-blockout',realAdenTilesLoaded:0});
 }
 function attach(doc=typeof document!=='undefined'?document:null){
  if(!doc)return null;
  const canvas=doc.getElementById('terrainCanvas'),
   info=doc.getElementById('tileStatus');
  if(!canvas||!info)return null;
  const registry=createPreviewRegistry(),cache=new Map();
  let state=viewState();
  function refresh(){
   const width=Math.max(320,canvas.clientWidth||canvas.width||960),
     height=Math.max(200,canvas.clientHeight||canvas.height||600);
   const dpr=Math.max(1,Math.min(2,(typeof devicePixelRatio==='number'?devicePixelRatio:1)));
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   // State in world metres, zoom in CSS pixels => convert to bitmap pixels.
   const stats=draw(canvas,registry,setZoom(state,state.zoom*dpr),cache);
   info.textContent='원본: 창작 아트 테스트 (실측 아덴 0타일) · '+
    stats.origin+' · 불러온 '+stats.active+'개 / 누락 '+stats.unresolved+
    '개 · 실제 1:1 미터 좌표 · 지형 삼각형 '+stats.triangles+'개';
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
   refresh();
  }
  for(const id of ['north','south','east','west','zoomIn','zoomOut','reset']){
   const button=doc.getElementById(id);
   if(button)button.addEventListener('click',()=>action(id));
  }
  if(typeof window!=='undefined'){
   window.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const key=event.key.toLowerCase(),
     which={arrowup:'north',w:'north',arrowdown:'south',s:'south',
      arrowleft:'west',a:'west',arrowright:'east',d:'east',
      '+':'zoomIn','=':'zoomIn','-':'zoomOut',r:'reset'}[key];
    if(which){event.preventDefault();action(which);}
   });
   window.addEventListener('resize',refresh);
  }
  refresh();
  return Object.freeze({getState:()=>state,action,refresh,registry});
 }
 return Object.freeze({SOURCE,fictionalHeight,createPreviewRegistry,
  CIVIC_SHELLS,viewState,pan,setZoom,draw,attach});
});
