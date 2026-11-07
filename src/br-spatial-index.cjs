'use strict';
// Deterministic 2D broadphase for the local BR world. This index only returns
// *candidate* positions: real circle distance and occlusion remain enforced by
// the server's existing collision/visibility predicates. No network clients
// can supply or alter these buckets.
class BrSpatialIndex {
 constructor(actors,cellSize=6){
  if(!Array.isArray(actors)||!Number.isFinite(cellSize)||cellSize<=0||cellSize>100)
   throw new RangeError('invalid_spatial_index');
  this.cellSize=cellSize;
  this.buckets=new Map();
  for(let i=0;i<actors.length;i++){
   const actor=actors[i];
   if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.z))
    throw new RangeError('invalid_spatial_actor');
   const key=this.key(actor.x,actor.z);
   if(!this.buckets.has(key))this.buckets.set(key,[]);
   this.buckets.get(key).push({actor,order:i});
  }
 }
 key(x,z){return Math.floor(x/this.cellSize)+','+Math.floor(z/this.cellSize);}
 nearby(x,z,radius){
  if(!Number.isFinite(x)||!Number.isFinite(z)||
     !Number.isFinite(radius)||radius<0||radius>1000)
   throw new RangeError('invalid_spatial_query');
  const minX=Math.floor((x-radius)/this.cellSize),maxX=Math.floor((x+radius)/this.cellSize);
  const minZ=Math.floor((z-radius)/this.cellSize),maxZ=Math.floor((z+radius)/this.cellSize);
  const hits=[];
  for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){
   const bucket=this.buckets.get(ix+','+iz);
   if(!bucket)continue;
   for(const entry of bucket){
    const p=entry.actor;
    if(Math.abs(p.x-x)<=radius&&Math.abs(p.z-z)<=radius)hits.push(entry);
   }
  }
  hits.sort((a,b)=>a.order-b.order);
  return hits.map(h=>h.actor);
 }
}
module.exports={BrSpatialIndex};
