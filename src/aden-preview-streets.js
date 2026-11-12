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
 // The drawn ribbon must follow the actual loaded mesh, not appear as
 // a false bridge across a missing surface or a cliff. This is a visual
 // civilian-road constraint only; 60Hz collision still comes from terrain.
 const MAX_ROAD_SLOPE_DEGREES=20;
 const MAX_ROAD_GRADE=Math.tan(MAX_ROAD_SLOPE_DEGREES*Math.PI/180);
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
   // The previous average-tangent offset pinched a 6m road to ~4.24m
   // through a 90-degree bend. Intersect the actual offset edges instead:
   // the corner's miter projects to half the width on BOTH road segments.
   // Long hairpin miters are bounded so no pavement spikes cross homes.
   const backX=p.x-a.x,backZ=p.z-a.z,
    foreX=b.x-p.x,foreZ=b.z-p.z;
   const backLen=Math.hypot(backX,backZ),foreLen=Math.hypot(foreX,foreZ);
   const inX=backLen>=.001?backX/backLen:foreX/foreLen,
    inZ=backLen>=.001?backZ/backLen:foreZ/foreLen,
    outX=foreLen>=.001?foreX/foreLen:inX,
    outZ=foreLen>=.001?foreZ/foreLen:inZ;
   if(![inX,inZ,outX,outZ].every(Number.isFinite))
    throw new RangeError('Invalid street tangent');
   const normalIn={x:-inZ,z:inX},normalOut={x:-outZ,z:outX},
    summedX=normalIn.x+normalOut.x,summedZ=normalIn.z+normalOut.z,
    size=Math.hypot(summedX,summedZ);
   if(size<.001)throw new RangeError('Reversing street segment');
   const miterX=summedX/size,miterZ=summedZ/size,
    projection=miterX*normalIn.x+miterZ*normalIn.z;
   if(projection<.625)throw new RangeError('Street corner too sharp for physical width');
   const offset=half/projection;
   const ox=miterX*offset,oz=miterZ*offset;
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
  const ground=Tiles.terrainSurface(slot.mesh,p.x,p.z);
  if(ground.elevationMetres<0||ground.slopeDegrees>MAX_ROAD_SLOPE_DEGREES)
   return null; // sea, missing mesh and steep cliffs never imply roads
  return Object.freeze([p.x,ground.elevationMetres+ELEVATION_OFFSET,p.z]);
 }
 function supportedSegment(prev,next,registry,cache,active){
  // Check the two physical road edges AND the centre between stations.
  // A painted road whose endpoints alone are valid can otherwise bridge a
  // missing terrain triangle or a severe change in height at the midpoint.
  const a=prev[0],b=prev[1],c=next[0],d=next[1];
  const grade=(u,v)=>Math.abs(u[1]-v[1])<=
   Math.hypot(u[0]-v[0],u[2]-v[2])*MAX_ROAD_GRADE+1e-8;
  if(!grade(a,b)||!grade(c,d)||!grade(a,c)||!grade(b,d))return false;
  const midpoint={x:(a[0]+b[0]+c[0]+d[0])/4,
   z:(a[2]+b[2]+c[2]+d[2])/4};
  const ground=sample(midpoint,registry,cache,active);
  if(!ground)return false;
  // No floating slab: middle ground must agree with the corner footprint.
  const expected=(a[1]+b[1]+c[1]+d[1])/4;
  return Math.abs(ground[1]-expected)<=.65;
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
    if(prev&&prev.every(Boolean)&&next.every(Boolean)&&
       supportedSegment(prev,next,registry,cache,active)){
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
 return Object.freeze({QUARTERS,ROUTES,ELEVATION_OFFSET,MAX_ROAD_SLOPE_DEGREES,
  stations,edges,triangulate,
  geographicAccuracyVerified:false,hasGameCollision:false});
});
