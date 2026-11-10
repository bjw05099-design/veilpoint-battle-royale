/* VEILPOINT — original civilian quarter walking preview. All coordinates
 * are fictional local metres; NEVER real Aden surveyed routes, combat
 * navigation, or a BR server path. No 60Hz player motion is authored here.
 * Route collision uses the exact CURRENT painted terrain and pedestrian
 * probe shared with the interactive city explorer.
 */
(function(root,factory){
 'use strict';
 const api=factory(root.VeilpointAdenWalkingProbe||
  (typeof module==='object'&&module.exports?require('./aden-city-walking-probe.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointCivilianWalkRoute=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Walk){
 'use strict';
 if(!Walk)throw new Error('Civilian walking collision is required for route preview');
 const CELL_METRES=1,MAX_DISTANCE_METRES=45,MAX_EXPANSIONS=2600;
 const DELTAS=Object.freeze([[1,0],[0,1],[-1,0],[0,-1]]);
 const frozen=(status,extra={})=>Object.freeze({status,...extra,
  surveyedGeography:false,controlsPlayer:false});
 function segment(world,a,b){
  const length=Math.hypot(b.x-a.x,b.z-a.z),
   count=Math.max(1,Math.ceil(length/.25));
  let prev=Walk.probe(world,a.x,a.z);
  if(!prev)return false;
  for(let i=1;i<=count;i++){
   const u=i/count,p=Walk.probe(world,
    a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u);
   if(!p||Math.abs(p.y-prev.y)>Walk.MAX_TICK_STEP_METRES)return false;
   prev=p;
  }
  return true;
 }
 // A conservative four-neighbour grid avoids diagonal corner cutting. Node
 // candidates are only accepted after a 0.25m swept-body ground check.
 function plan(world,walker,rooms=world?.rooms){
  if(!world||!Array.isArray(world.solids)||
    !walker||![walker.x,walker.z].every(Number.isFinite)||
    !Array.isArray(rooms)||rooms.length>128)
   throw new TypeError('Invalid fictional civilian route request');
  const start=Walk.probe(world,walker.x,walker.z);
  if(!start)return frozen('invalid-start',{points:Object.freeze([])});
  const nearest=rooms.map(room=>({
    room,d:Math.hypot(walker.x-room.x,walker.z-room.z)
   })).filter(p=>p.room&&Number.isFinite(p.d)&&p.d<=MAX_DISTANCE_METRES)
    .sort((a,b)=>a.d-b.d||a.room.id.localeCompare(b.room.id))[0];
  if(!nearest)return frozen('no-nearby-public-room',{points:Object.freeze([])});
  const room=nearest.room,roomId=room.id,
   target={x:room.x,z:room.z+room.d/2-1.6};
  if(world.solids.some(b=>b.id===roomId+':door'))
   return frozen('door-closed',{roomId,points:Object.freeze([])});
  if(!Walk.probe(world,target.x,target.z))
   return frozen('room-not-walkable',{roomId,points:Object.freeze([])});
  const ix=Math.round((target.x-walker.x)/CELL_METRES),
   iz=Math.round((target.z-walker.z)/CELL_METRES);
  const heuristic=(x,z)=>Math.abs(ix-x)+Math.abs(iz-z);
  const key=(x,z)=>x+':'+z;
  const current=new Map(),closed=new Set();
  const begin={i:0,j:0,g:0,h:heuristic(0,0),parent:null};
  current.set(key(0,0),begin);
  const best=new Map([[key(0,0),begin]]);
  let goal=null,expanded=0;
  while(current.size&&expanded<MAX_EXPANSIONS){
   let node=null,nodeKey='';
   for(const [id,candidate] of current){
    if(!node||candidate.g+candidate.h<node.g+node.h||
      (candidate.g+candidate.h===node.g+node.h&&
       (candidate.h<node.h||(candidate.h===node.h&&id<nodeKey)))){
     node=candidate;nodeKey=id;
    }
   }
   current.delete(nodeKey);closed.add(nodeKey);expanded++;
   const from={x:walker.x+node.i*CELL_METRES,
    z:walker.z+node.j*CELL_METRES};
   if(Math.hypot(from.x-target.x,from.z-target.z)<=1.5&&
      segment(world,from,target)){goal=node;break;}
   for(const [di,dj] of DELTAS){
    const i=node.i+di,j=node.j+dj,k=key(i,j);
    // No speculative city-wide route or unbounded search across tiles.
    if(closed.has(k)||Math.hypot(i,j)>MAX_DISTANCE_METRES+10)continue;
    const p={x:walker.x+i*CELL_METRES,z:walker.z+j*CELL_METRES};
    if(!segment(world,from,p))continue;
    const g=node.g+CELL_METRES,old=best.get(k);
    if(old&&old.g<=g)continue;
    const next={i,j,g,h:heuristic(i,j),parent:node};
    best.set(k,next);current.set(k,next);
   }
  }
  if(!goal)return frozen('unreachable',{roomId,points:Object.freeze([]),
   explored:expanded});
  const reverse=[],end=Walk.probe(world,target.x,target.z);
  for(let node=goal;node;node=node.parent){
   const x=walker.x+node.i*CELL_METRES,
    z=walker.z+node.j*CELL_METRES,hit=Walk.probe(world,x,z);
   reverse.push(Object.freeze({x,y:hit.y,z}));
  }
  reverse.reverse();
  reverse.push(Object.freeze({x:target.x,y:end.y,z:target.z}));
  // Merge straight runs only: new sections preserve swept 0.25m collision
  // and exact LOD height at every retained turning point.
  const points=[];
  for(let i=0;i<reverse.length;i++){
   const a=reverse[i-1],b=reverse[i],c=reverse[i+1];
   if(a&&c){
    const dx=b.x-a.x,dz=b.z-a.z,
     ex=c.x-b.x,ez=c.z-b.z;
    if(Math.abs(dx*ez-dz*ex)<1e-7&&dx*ex+dz*ez>=0)
     continue;
   }
   points.push(reverse[i]);
  }
  let distance=0;
  for(let i=1;i<points.length;i++)
   distance+=Math.hypot(points[i].x-points[i-1].x,
    points[i].z-points[i-1].z);
  return frozen('planned',{roomId,
   points:Object.freeze(points),distanceMetres:distance,
   explored:expanded,originTick:walker.tick});
 }
 return Object.freeze({CELL_METRES,MAX_DISTANCE_METRES,MAX_EXPANSIONS,
  segment,plan,geographyVerified:false,autoMove:false});
});
