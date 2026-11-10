/* VEILPOINT ORIGINAL civilian city street samples. 1m=1 world unit.
 * Creative unreferenced scene only, NOT real Aden roads or tactical routes.
 * Street surfaces are grounded on exact currently painted LOD triangles,
 * and disappear over missing/underwater tiles. No collision is authored.
 */
(function(root,factory){
 const api=factory(root.VeilpointAdenCityTiles||
  (typeof module==='object'&&module.exports?require('./aden-citywide-tiles.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenPreviewStreets=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tiles){
 'use strict';
 if(!Tiles)throw new Error('City terrain tiles required');
 const QUARTERS=Object.freeze([
  Object.freeze({id:'original-harbor-quarter',x:-140,z:-70}),
  Object.freeze({id:'original-market-quarter',x:330,z:120}),
  Object.freeze({id:'original-upper-quarter',x:-450,z:390})
 ]);
 function road(id,width,coords){
  return Object.freeze({id,width,points:Object.freeze(coords.map(([x,z])=>Object.freeze({x,z})))});
 }
 const ROUTES=Object.freeze((()=>{
  const list=[];
  for(const {id,x,z} of QUARTERS){
   // 7 x 5 already-visible buildings: streets are in actual empty gaps.
   for(let row=0;row<4;row++){
    const lineZ=z+(row-1.5)*30;
    list.push(road(id+'-cross-'+row,6,[[x-104,lineZ],[x+104,lineZ]]));
   }
   for(let col=0;col<6;col++){
    const lineX=x+(col-2.5)*27;
    list.push(road(id+'-lane-'+col,5.8,[[lineX,z-82],[lineX,z+82]]));
   }
  }
  // Fictional district connections, not contemporary Aden surveyed paths.
  list.push(road('fictional-harbor-to-market',7,
   [[-36,-55],[12,-55],[12,35],[225,35],[225,105],[262.5,105]]));
  list.push(road('fictional-harbor-to-upper',7,
   [[-207.5,12],[-207.5,230],[-517.5,230],[-517.5,308]]));
  return list;
 })());
 const ELEVATION_OFFSET=.045;
 function stations(path,step=6){
  if(!path||!Array.isArray(path.points)||path.points.length<2||
     !Number.isFinite(path.width)||path.width<3||path.width>12||
     !Number.isFinite(step)||step<2||step>32)
   throw new RangeError('Invalid original street path');
  const out=[];
  for(let i=0;i<path.points.length-1;i++){
   const a=path.points[i],b=path.points[i+1];
   Tiles.point(a.x,a.z);Tiles.point(b.x,b.z);
   const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
   if(d<.001)throw new RangeError('Zero-length street segment');
   const count=Math.ceil(d/step);
   for(let j=0;j<count;j++){
    const t=j/count;
    out.push({x:a.x+dx*t,z:a.z+dz*t});
   }
  }
  out.push({...path.points.at(-1)});
  return out;
 }
 function edges(path,step=6){
  const nodes=stations(path,step),half=path.width/2,out=[];
  for(let i=0;i<nodes.length;i++){
   const p=nodes[i],a=nodes[Math.max(0,i-1)],
    b=nodes[Math.min(nodes.length-1,i+1)];
   const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
   if(len<.001)throw new RangeError('Invalid street tangent');
   // One averaged tangent per station shares each road edge across
   // adjoining triangles, including at ordinary civilian street corners.
   const ox=-dz/len*half,oz=dx/len*half;
   out.push(Object.freeze([
    Object.freeze({x:p.x+ox,z:p.z+oz}),
    Object.freeze({x:p.x-ox,z:p.z-oz})
   ]));
  }
  return Object.freeze(out);
 }
 function sample(p,registry,cache,active){
  const key=Tiles.tileFor(p.x,p.z).key;
  if(!active.has(key))return null;
  const tile=registry.get(key),slot=cache.get(key);
  if(!tile||!slot||slot.sourceTile!==tile||!slot.mesh)return null;
  const height=Tiles.heightOnTerrainMesh(slot.mesh,p.x,p.z);
  if(height<0)return null; // no speculative road over sea or missing land
  return Object.freeze([p.x,height+ELEVATION_OFFSET,p.z]);
 }
 function triangulate(registry,cache,active,routes=ROUTES){
  if(!(registry instanceof Map)||!(cache instanceof Map)||
     !(active instanceof Set)||!Array.isArray(routes)||routes.length>256)
   throw new TypeError('Invalid terrain street mesh request');
  const out=[];
  for(const route of routes){
   const path=edges(route);
   let prev=null;
   for(const endpoints of path){
    const next=endpoints.map(p=>sample(p,registry,cache,active));
    if(prev&&prev.every(Boolean)&&next.every(Boolean)){
     const a=prev[0],b=prev[1],c=next[0],d=next[1];
     out.push(Object.freeze({roadId:route.id,
      vertices:Object.freeze([a,b,c])}));
     out.push(Object.freeze({roadId:route.id,
      vertices:Object.freeze([b,d,c])}));
    }
    prev=next;
   }
  }
  return Object.freeze(out);
 }
 return Object.freeze({QUARTERS,ROUTES,ELEVATION_OFFSET,stations,edges,triangulate,
  geographicAccuracyVerified:false,hasGameCollision:false});
});
