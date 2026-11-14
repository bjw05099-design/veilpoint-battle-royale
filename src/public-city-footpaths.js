/* VEILPOINT - original fictional pedestrian street connections.
 * Continuity is computed against the same public-world solids used by 60Hz
 * offline BR and CH01. This is NOT a georeferenced road or security map.
 */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?
   require('./simulation.js'):root.VeilpointSim);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointPublicFootpaths=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Sim){
 'use strict';
 const STEP=2,WIDTH=1.3,CLEARANCE=1.05,MAX_VISITS=11000;
 const DIRECTIONS=Object.freeze([[1,0],[0,1],[-1,0],[0,-1],
   [1,1],[-1,1],[-1,-1],[1,-1]]);
 function heapPush(heap,node){
  let i=heap.length;heap.push(node);
  while(i){const p=(i-1)>>1;if(heap[p].f<=node.f)break;
   heap[i]=heap[p];i=p;}heap[i]=node;
 }
 function heapPop(heap){
  const top=heap[0],tail=heap.pop();
  if(heap.length){
   let i=0;
   while(i*2+1<heap.length){
    let c=i*2+1;
    if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;
    if(heap[c].f>=tail.f)break;
    heap[i]=heap[c];i=c;
   }
   heap[i]=tail;
  }
  return top;
 }
 function segmentClear(a,b,inflated){
  return !Sim.lineBlocked(a.x,a.z,b.x,b.z,inflated);
 }
 function plan(from,to,obstacles,options={}){
  // An NPC's 60Hz update cannot spend an unbounded A* search budget on a
  // remote or fully blocked destination. Normal city preview links retain
  // the original full budget; story companions request a smaller budget.
  const maxVisits=options?.maxVisits??MAX_VISITS;
  if(!Number.isSafeInteger(maxVisits)||maxVisits<1||maxVisits>MAX_VISITS)
   throw new RangeError('Invalid pedestrian search budget');
  const clearance=options?.clearance??CLEARANCE,step=options?.step??STEP;
  if(!Number.isFinite(clearance)||clearance<.55||clearance>CLEARANCE||
     !Number.isFinite(step)||step<1||step>STEP)
   throw new RangeError('Invalid pedestrian body or grid');
  if(!from||!to||!Array.isArray(obstacles)||
     ![from.x,from.z,to.x,to.z].every(Number.isFinite))return null;
  // Visual-only canvas roofs, awnings and pavement have no physical body.
  // An authored collision body without an explicit solid flag stays solid;
  // ignore ONLY geometry explicitly marked non-solid. This prevents public
  // pedestrians being routed around a drawable roof as if it were a wall.
  const blockers=obstacles.filter(o=>o?.solid!==false);
  // Fast straight-line paths must enforce the SAME player-circle world edge
  // as the A* fallback, rather than returning a route outside the playable map.
  const worldEdge=175-clearance;
  if([from.x,from.z,to.x,to.z].some(n=>Math.abs(n)>worldEdge)||
     Sim.blocked(from.x,from.z,clearance,blockers)||
     Sim.blocked(to.x,to.z,clearance,blockers))return null;
  // Circle-body clearance also protects the swept width of the visible
  // paving; no painted route may cut through an existing playable wall.
  const solids=blockers.map(o=>({...o,w:o.w+2*clearance,d:o.d+2*clearance}));
  if(segmentClear(from,to,solids))return Object.freeze([from,to].map(p=>Object.freeze({x:p.x,z:p.z})));
  const minX=Math.max(-169,Math.min(from.x,to.x)-32),
    maxX=Math.min(169,Math.max(from.x,to.x)+32),
    minZ=Math.max(-169,Math.min(from.z,to.z)-32),
    maxZ=Math.min(169,Math.max(from.z,to.z)+32);
  const key=(i,j)=>i+','+j,points=new Map(),scores=new Map(),closed=new Set();
  const start={i:0,j:0,x:from.x,z:from.z,g:0,
    f:Math.hypot(to.x-from.x,to.z-from.z)};
  const open=[];heapPush(open,start);
  scores.set(key(0,0),0);points.set(key(0,0),{...start,prev:null});
  let visited=0,goal=null;
  while(open.length&&visited<maxVisits){
   const n=heapPop(open),id=key(n.i,n.j);
   // Replaced heap entries are not distinct physical locations. Charge the
   // bounded NPC search budget only for a genuinely expanded grid cell.
   if(closed.has(id))continue;
   closed.add(id);visited++;
   if(Math.hypot(n.x-to.x,n.z-to.z)<=step*.75&&
      segmentClear(n,to,solids)){goal=id;break;}
   for(const [di,dj] of DIRECTIONS){
    const i=n.i+di,j=n.j+dj,x=from.x+i*step,z=from.z+j*step,
      nextKey=key(i,j);
    if(x<minX||x>maxX||z<minZ||z>maxZ||closed.has(nextKey)||
       Sim.blocked(x,z,clearance,blockers))continue;
    if(!segmentClear(n,{x,z},solids))continue;
    const g=n.g+step*Math.hypot(di,dj);
    if(g>= (scores.get(nextKey)??Infinity)-1e-9)continue;
    scores.set(nextKey,g);
    const next={i,j,x,z,g,f:g+Math.hypot(to.x-x,to.z-z)};
    points.set(nextKey,{...next,prev:id});heapPush(open,next);
   }
  }
  if(!goal)return null;
  const path=[{x:to.x,z:to.z}];
  for(let id=goal;id;id=points.get(id).prev){
   const p=points.get(id);path.push({x:p.x,z:p.z});
  }
  path.reverse();
  const smoothed=[path[0]];
  for(let i=1;i<path.length;){
   let far=i;
   for(let j=path.length-1;j>=i;j--){
    if(segmentClear(smoothed[smoothed.length-1],path[j],solids)){
     far=j;break;
    }
   }
   smoothed.push(path[far]);i=far+1;
  }
  return Object.freeze(smoothed.map(p=>Object.freeze(p)));
 }
 function planAll(obstacles){
  const districts=Sim.PUBLIC_CITY_DISTRICTS;
  return Object.freeze(Sim.PUBLIC_CITY_ADJACENCY.map(link=>{
   const from=districts.find(p=>p.id===link.from),to=districts.find(p=>p.id===link.to);
   const points=plan(from,to,obstacles);
   return Object.freeze({from:link.from,to:link.to,
     points:points||Object.freeze([]),walkable:!!points});
  }));
 }
 // Public walking links between three actual *new* street-level spaces.
 // Split at physically accessible crossroads: this guarantees the visible
 // paving enters the shop lane instead of choosing a distant shortcut.
 // These are fictional gameplay coordinates, not real street navigation.
 const LOCAL_MAP_LINKS=Object.freeze([
  Object.freeze({id:'craft-to-promenade',
    from:Object.freeze({x:-63,z:66}),to:Object.freeze({x:-28,z:80})}),
  Object.freeze({id:'promenade-to-shop-street',
    from:Object.freeze({x:-28,z:90}),to:Object.freeze({x:-35,z:96})}),
  Object.freeze({id:'shop-street-through',
    from:Object.freeze({x:-35,z:96}),to:Object.freeze({x:-35,z:116})}),
  Object.freeze({id:'shop-street-to-ferry',
    from:Object.freeze({x:-35,z:116}),to:Object.freeze({x:-45,z:121})})
 ]);
 function planLocalPaths(obstacles){
  if(!Array.isArray(obstacles)||!obstacles.some(o=>o.type==='aden-craft-hall-wall')||
    !obstacles.some(o=>o.type==='aden-laneshop-outer-wall'))return Object.freeze([]);
  return Object.freeze(LOCAL_MAP_LINKS.map(link=>{
   const points=plan(link.from,link.to,obstacles);
   return Object.freeze({id:link.id,from:link.from,to:link.to,
    points:points||Object.freeze([]),walkable:!!points});
  }));
 }
 return Object.freeze({STEP,WIDTH,CLEARANCE,plan,planAll,planLocalPaths,LOCAL_MAP_LINKS});
});
