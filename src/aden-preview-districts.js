/* VEILPOINT: original non-georeferenced civilian NEIGHBORHOODS.
 * 1 engine metre = 1 local metre, but this is a fictional preview scene,
 * NOT measured Aden geography or an actual gameplay/collision world.
 * Architectural positions are stable authored data to extend the visible
 * 512m terrain streaming experiment beyond the original three blocks.
 */
(function(root,factory){
 const api=factory(root.VeilpointAdenCityTiles||
  (typeof module==='object'&&module.exports?require('./aden-citywide-tiles.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAdenPreviewDistricts=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tiles){
 'use strict';
 if(!Tiles)throw new Error('Validated 512m terrain tile sampler required');
 const NEIGHBORHOODS=Object.freeze([
  Object.freeze({id:'fictional-west-shore',x:-700,z:-170,kind:'coastal',palette:0}),
  Object.freeze({id:'fictional-south-wharf',x:-165,z:-650,kind:'coastal',palette:1}),
  Object.freeze({id:'fictional-central-arcade',x:185,z:-360,kind:'artisan',palette:2}),
  Object.freeze({id:'fictional-east-crafts',x:690,z:-210,kind:'artisan',palette:3}),
  Object.freeze({id:'fictional-eastern-gardens',x:790,z:350,kind:'residential',palette:0}),
  Object.freeze({id:'fictional-ridge-courts',x:335,z:800,kind:'residential',palette:1}),
  Object.freeze({id:'fictional-northern-neighborhood',x:-155,z:850,kind:'terrace',palette:2}),
  Object.freeze({id:'fictional-west-terraces',x:-760,z:700,kind:'terrace',palette:3})
 ]);
 const PALETTES=Object.freeze([
  Object.freeze(['#d3c1a6','#a9a99b','#bba58b','#c6b69f']),
  Object.freeze(['#c4b49d','#aaa18f','#d5c3a5','#b7ae99']),
  Object.freeze(['#b5a38a','#d2b697','#b3afa5','#c5ad91']),
  Object.freeze(['#c9bca9','#a7a99f','#c0a78f','#cbb99d'])
 ]);
 function street(id,width,coords){
  return Object.freeze({id,width,points:Object.freeze(coords.map(([x,z])=>
   Object.freeze({x,z})))});
 }
 function createPlan(){
  const buildings=[],streets=[],courtyards=[];
  for(const [n,quarter] of NEIGHBORHOODS.entries()){
   const {id,x,z}=quarter,palette=PALETTES[quarter.palette];
   // 6 x 5 varied civilian households; two facing central parcels remain
   // OPEN as a small communal plaza. Adjacent public lanes are real gaps
   // between the fixed 24m x 28m parcels, not placed through buildings.
   for(let row=0;row<5;row++)for(let col=0;col<6;col++){
    if(row===2&&(col===2||col===3))continue;
    const i=row*6+col,px=x+(col-2.5)*24,pz=z+(row-2)*28;
    const width=10.5+((i+n)%4)*1.2,
     depth=12.2+((i+row+n)%4)*1.1,
     height=7+((i*5+n*3)%12);
    buildings.push(Object.freeze({id:id+'-house-'+i,district:id,
     x:px,z:pz,w:width,d:depth,h:height,color:palette[(i+n)%4],
     kind:quarter.kind,roofStyle:(i+n)%3===0?'parapet':'flat',
     actualAdenArchitectureVerified:false}));
   }
   for(let row=0;row<4;row++){
    const lineZ=z+(row-1.5)*28;
    streets.push(street(id+'-cross-'+row,5.8,
     [[x-76,lineZ],[x+76,lineZ]]));
   }
   for(let col=0;col<5;col++){
    const lineX=x+(col-2)*24;
    streets.push(street(id+'-lane-'+col,5.6,
     [[lineX,z-70],[lineX,z+70]]));
   }
   // The two unbuilt parcels form a walk-through communal public court;
   // it uses the same terrain-grounded triangulated ribbon as other lanes.
   streets.push(street(id+'-public-court',10,
    [[x-18,z],[x+18,z]]));
   courtyards.push(Object.freeze({id:id+'-public-court',
    x,z,width:36,depth:18,physicallyVerified:false}));
  }
  return Object.freeze({buildings:Object.freeze(buildings),
   streets:Object.freeze(streets),courtyards:Object.freeze(courtyards)});
 }
 const PLAN=createPlan();
 // Sample all four foundation corners plus centre on the currently loaded
 // triangle mesh. If a corner is under water or unknown, the whole building
 // is omitted rather than painted as a floating structure across tile gaps.
 function buildingFoundation(building,registry,cache,visibleKeys){
  if(!building||!(registry instanceof Map)||!(cache instanceof Map)||
     !(visibleKeys instanceof Set))throw new TypeError('Invalid fictional building foundation');
  const corners=[[0,0],[-1,-1],[-1,1],[1,-1],[1,1]];
  const heights=[];
  for(const [dx,dz] of corners){
   const x=building.x+dx*building.w/2,
    z=building.z+dz*building.d/2,key=Tiles.tileFor(x,z).key;
   if(!visibleKeys.has(key))return null;
   const tile=registry.get(key),cached=cache.get(key);
   if(!tile||!cached||cached.sourceTile!==tile||!cached.mesh)return null;
   const y=Tiles.heightOnTerrainMesh(cached.mesh,x,z);
   if(!Number.isFinite(y)||y<0)return null;
   heights.push(y);
  }
  const high=Math.max(...heights),low=Math.min(...heights);
  // No houses precariously pinned to near-vertical sampled cliff edges.
  if(high-low>6)return null;
  // An illustrated plinth joins the elevated entry level to the lowest
  // local physical corner. No geometry or collision is silently invented.
  return Object.freeze({baseMetres:high,plinthMetres:high-low,
   centreMetres:heights[0],lowMetres:low,
   actualSurveyVerified:false});
 }
 function visibleStreets(visibleKeys){
  if(!(visibleKeys instanceof Set))throw new TypeError('Visible tile keys required');
  if(visibleKeys.size===0)return [];
  const rectangles=[...visibleKeys].map(key=>{
   const {tx,tz}=Tiles.parseTileKey(key);return Tiles.tileBounds(tx,tz);
  });
  return PLAN.streets.filter(route=>{
   const xs=route.points.map(p=>p.x),zs=route.points.map(p=>p.z);
   const minX=Math.min(...xs)-route.width/2,
    maxX=Math.max(...xs)+route.width/2,
    minZ=Math.min(...zs)-route.width/2,
    maxZ=Math.max(...zs)+route.width/2;
   return rectangles.some(r=>maxX>=r.minX&&minX<=r.maxX&&
    maxZ>=r.minZ&&minZ<=r.maxZ);
  });
 }
 return Object.freeze({NEIGHBORHOODS,PLAN,buildingFoundation,
  visibleStreets,verifiedAdenCityBuildings:0,
  authoredOnly:true,collisionAuthored:false});
});
