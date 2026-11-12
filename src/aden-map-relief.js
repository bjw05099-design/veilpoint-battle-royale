/* VEILPOINT civil terrain / elevation visualization.
 * Physically based surface gradient from metre-space triangle vertices.
 * No downloaded aerial images, operational overlays or remote data sources.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenRelief=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 // Work in local metres: p is [x,elevation,z]. Sun is a stylised static
 // northwest daylight vector, not a historical meteorological assertion.
 function surfaceNormal(a,b,c){
  if(![...a,...b,...c].every(finite))
   throw new RangeError('Nonfinite terrain vertex');
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],
   vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const len=Math.hypot(nx,ny,nz);
  if(len<1e-10)return Object.freeze({x:0,y:1,z:0,slope:0});
  nx/=len;ny/=len;nz/=len;
  // Winding is not an instruction for lighting direction. Keep 'up' positive.
  if(ny<0){nx=-nx;ny=-ny;nz=-nz;}
  return Object.freeze({x:nx,y:ny,z:nz,slope:Math.atan2(Math.hypot(nx,nz),ny)});
 }
 function triangleColor(a,b,c){
  const n=surfaceNormal(a,b,c),e=(a[1]+b[1]+c[1])/3,
   sun={x:-.46,y:.81,z:-.36},
   lit=clamp((n.x*sun.x+n.y*sun.y+n.z*sun.z+.22)/1.22,.24,1),
   shade=.58+.42*lit;
  const base=e<0?[43,89,111]:
   e<7?[177,161,123]:
   e<55?[174,144,106]:
   e<130?[140,113,90]:[113,104,98];
  return 'rgb('+base.map(v=>Math.round(clamp(v*shade,0,255))).join(',')+')';
 }
 function project(p,center,width,height,zoom,relief=.38){
  if(![...p,center.x,center.z,width,height,zoom,relief].every(finite)||
    zoom<=0||relief<0||relief>1)
   throw new RangeError('Invalid terrain projection');
  return Object.freeze([width/2+(p[0]-center.x)*zoom,
   height/2+(p[2]-center.z)*zoom-p[1]*zoom*relief]);
 }
 // Draw at most twelve real isohypses per triangle. On very steep
 // surfaces, spread the chosen contour levels across the WHOLE observed
 // elevation range instead of drawing only the lowest twelve; every
 // retained point still lies on an actual triangle edge.
 function contours(a,b,c,interval=25){
  if(!Array.isArray(a)||!Array.isArray(b)||!Array.isArray(c)||
    ![...a,...b,...c,interval].every(finite)||
    interval<5||interval>100)
   throw new RangeError('Invalid terrain contour request');
  const min=Math.min(a[1],b[1],c[1]),
   max=Math.max(a[1],b[1],c[1]);
  const result=[],vertices=[a,b,c],edges=[[0,1],[1,2],[2,0]];
  const firstIndex=Math.ceil(min/interval),lastIndex=Math.floor(max/interval),
   levels=lastIndex-firstIndex+1;
  if(!Number.isSafeInteger(levels))
   throw new RangeError('Terrain contour elevation range too large');
  // The per-triangle twelve-contour render budget is stable even for a cliff.
  // Subsampling level INDICES keeps the advertised interval exact and avoids
  // an upper contour disappearing merely because its elevation is high.
  const skip=levels>12?Math.ceil(levels/12):1;
  for(let i=0;i<levels;i+=skip){
   const level=(firstIndex+i)*interval;
   const on=p=>Math.abs(p[1]-level)<1e-10;
   // When an entire triangle is level, no unique isoline can be drawn.
   if(vertices.every(on))continue;
   // Two vertices exactly on one contour form a real physical edge, not a
   // vanished crossing. The previous t>=1 test silently omitted that edge.
   const levelEdge=edges.find(([i,j])=>on(vertices[i])&&on(vertices[j]));
   if(levelEdge){
    // Zero-height coastline is rendered from the same terrain triangles by
    // shorelineSegments(); emitting it again as a 25m contour duplicates the
    // sea-level boundary. Other exact-level edges remain genuine isohypses.
    if(level===0)continue;
    const from=vertices[levelEdge[0]],to=vertices[levelEdge[1]];
    if(Math.hypot(from[0]-to[0],from[2]-to[2])>.0001)
     result.push(Object.freeze({level,from:Object.freeze([...from]),to:Object.freeze([...to])}));
    continue;
   }
   const hits=[];
   for(const [i,j] of edges){
    const p=vertices[i],q=vertices[j],delta=q[1]-p[1];
    if(Math.abs(delta)<1e-10)continue;
    const t=(level-p[1])/delta;
    if(t<0||t>1)continue;
    const hit=Object.freeze([p[0]+t*(q[0]-p[0]),level,p[2]+t*(q[2]-p[2])]);
    // Endpoint intersections belong to two edges; draw a vertex only once.
    if(!hits.some(v=>Math.hypot(v[0]-hit[0],v[2]-hit[2])<1e-9))hits.push(hit);
   }
   if(hits.length===2&&Math.hypot(
    hits[0][0]-hits[1][0],hits[0][2]-hits[1][2])>.0001)
    result.push(Object.freeze({level,from:hits[0],to:hits[1]}));
  }
  return Object.freeze(result);
 }
 return Object.freeze({surfaceNormal,triangleColor,project,contours});
});
