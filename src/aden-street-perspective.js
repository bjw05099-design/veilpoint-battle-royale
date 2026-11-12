/* VEILPOINT civilian terrain preview: eye-level software projection.
 * Renders ONLY the triangles already loaded from the local, licensed-or-art
 * terrain registry. This is not Unreal, real Aden imagery or a GPU benchmark.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenStreetPerspective=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const NEAR=.4,FAR=310,EYE_HEIGHT=1.65,FOV=Math.PI*72/180;
 function cameraPoint(eye,yaw,x,y,z,pitch=0){
  const dx=x-eye.x,dz=z-eye.z,s=Math.sin(yaw),c=Math.cos(yaw);
  const forward=dx*s-dz*c,vertical=y-eye.y;
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  // Rotate the real depth/up basis, never the terrain mesh or a fake horizon.
  return {right:dx*c+dz*s,up:vertical*cp-forward*sp,
   depth:forward*cp+vertical*sp};
 }
 function clipNear(vertices,near=NEAR){
  const out=[];
  for(let i=0;i<vertices.length;i++){
   const a=vertices[i],b=vertices[(i+1)%vertices.length];
   const ai=a.depth>=near,bi=b.depth>=near;
   if(ai)out.push(a);
   if(ai!==bi){
    const t=(near-a.depth)/(b.depth-a.depth);
    out.push({right:a.right+(b.right-a.right)*t,
     up:a.up+(b.up-a.up)*t,depth:near});
   }
  }
  return out;
 }
 function project(eye,yaw,world,width,height,far=FAR,pitch=0){
  if(!world||![eye?.x,eye?.y,eye?.z,yaw,world.x,world.y,world.z,
    width,height,far,pitch].every(Number.isFinite)||width<=0||height<=0||
    far<=NEAR||Math.abs(pitch)>Math.PI/3)
   return null;
  const p=cameraPoint(eye,yaw,world.x,world.y,world.z,pitch);
  if(p.depth<NEAR||p.depth>far)return null;
  const focal=Math.min(width/(2*Math.tan(FOV/2)),height/(2*Math.tan(FOV/2)));
  return Object.freeze({x:width/2+p.right*focal/p.depth,
   y:height/2-p.up*focal/p.depth,depth:p.depth});
 }
 function draw(canvas,registry,cache,walker,yaw,buildings=[],pitch=0){
  if(!canvas||typeof canvas.getContext!=='function'||
     !(registry instanceof Map)||!(cache instanceof Map)||
     !walker||![walker.x,walker.y,walker.z,yaw,pitch].every(Number.isFinite)||
     Math.abs(pitch)>Math.PI/3||!Array.isArray(buildings))
   throw new TypeError('Invalid civilian street camera');
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new TypeError('Canvas 2D unavailable');
  const width=canvas.width,height=canvas.height;
  if(!(width>0&&height>0))throw new RangeError('Invalid street viewport');
  const eye={x:walker.x,y:walker.y+EYE_HEIGHT,z:walker.z};
  const camera=(x,y,z)=>cameraPoint(eye,yaw,x,y,z,pitch);
  const focal=Math.min(width,height)/(2*Math.tan(FOV/2));
  const faces=[],meshByKey=new Map();
  let terrainTiles=0,trianglesConsidered=0;
  function face(vertices,color){
   const clipped=clipNear(vertices);
   if(clipped.length<3||clipped.every(p=>p.depth>FAR))return;
   const projected=clipped.map(p=>({
    x:width/2+p.right*focal/p.depth,
    y:height/2-p.up*focal/p.depth
   }));
   if(projected.every(p=>p.x<-40)||projected.every(p=>p.x>width+40)||
      projected.every(p=>p.y<-40)||projected.every(p=>p.y>height+40))return;
   const average=clipped.reduce((n,p)=>n+p.depth,0)/clipped.length;
   faces.push({projected,average,color});
  }
  // The walker's current streamed mesh is the authority. Missing tiles,
  // detached revisions or missing triangulation remain open sky, not
  // visually fabricated ground.
  for(const [key,slot] of cache){
   const tile=registry.get(key);
   if(!tile||slot?.sourceTile!==tile||!slot.mesh)continue;
   const dx=(tile.tx+.5)*512-eye.x,dz=(tile.tz+.5)*512-eye.z;
   if(Math.hypot(dx,dz)>FAR+375)continue;
   const mesh=slot.mesh,p=mesh.positions,index=mesh.triangles;
   if(!Array.isArray(p)||!Array.isArray(index))continue;
   meshByKey.set(key,mesh);terrainTiles++;
   for(let i=0;i<index.length;i+=3){
    trianglesConsidered++;
    const v=[index[i],index[i+1],index[i+2]];
    if(v.some(k=>!Number.isSafeInteger(k)||k<0||k*3+2>=p.length))continue;
    const vertices=v.map(k=>camera(p[k*3],p[k*3+1],p[k*3+2]));
    const depth=vertices.map(t=>t.depth);
    if(Math.max(...depth)<NEAR||Math.min(...depth)>FAR)continue;
    const averageY=v.reduce((n,k)=>n+p[k*3+1],0)/3;
    // Color is relief-inspired, not a remote aerial photograph.
    const shade=Math.max(0,Math.min(1,(averageY+20)/220));
    const light=Math.round(36+shade*21);
    face(vertices,'hsl(49 17% '+light+'%)');
   }
  }
  let civilianFacades=0;
  // Original non-georeferenced public facades actually occlude terrain
  // from the same perspective. Their foundations are sampled on the SAME
  // loaded mesh as the road; missing DEM cannot spawn floating buildings.
  const tiles=typeof globalThis!=='undefined'?globalThis.VeilpointAdenCityTiles:null;
  const Tile=tiles||(typeof require==='function'?require('./aden-citywide-tiles.js'):null);
  for(const b of buildings){
   if(!b||![b.x,b.z,b.w,b.d,b.h].every(Number.isFinite)||
      b.w<=0||b.d<=0||b.h<=0||Math.hypot(b.x-eye.x,b.z-eye.z)>FAR+40)continue;
   const key=Tile?.tileFor(b.x,b.z).key,mesh=meshByKey.get(key);
   if(!mesh)continue;
   let y;
   try{y=Tile.heightOnTerrainMesh(mesh,b.x,b.z);}catch(_){continue;}
   if(!Number.isFinite(y)||y<0)continue;
   const minX=b.x-b.w/2,maxX=b.x+b.w/2,minZ=b.z-b.d/2,maxZ=b.z+b.d/2;
   const walls=[
    [[minX,minZ],[maxX,minZ]],
    [[maxX,minZ],[maxX,maxZ]],
    [[maxX,maxZ],[minX,maxZ]],
    [[minX,maxZ],[minX,minZ]]
   ];
   for(const [a,c] of walls){
    face([camera(a[0],y,a[1]),
      camera(c[0],y,c[1]),
      camera(c[0],y+b.h,c[1]),
      camera(a[0],y+b.h,a[1])],b.color||'#a99b84');
   }
   civilianFacades++;
  }
  // The painter sorts real view-space depths: distant ground/facades before
  // nearby ones. There is no world-depth stencil or WebGL timing claim.
  faces.sort((a,b)=>b.average-a.average);
  // Missing terrain remains visibly empty sky. An artificial horizon
  // rectangle would falsely claim ground where no local mesh is loaded.
  ctx.fillStyle='#b5c7cd';ctx.fillRect(0,0,width,height);
  let visibleFaces=0;
  for(const f of faces){
   ctx.fillStyle=f.color;ctx.beginPath();
   f.projected.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
   ctx.closePath();ctx.fill();visibleFaces++;
  }
  return Object.freeze({mode:'original-street-perspective',terrainTiles,
   trianglesConsidered,visibleFaces,civilianFacades,
   eyeHeightMetres:EYE_HEIGHT,metresPerWorldUnit:1,
   geographicallyVerified:false,unrealNative:false,measuredGpuFps:null});
 }
 return Object.freeze({draw,project,clipNear,NEAR,FAR,EYE_HEIGHT});
});
