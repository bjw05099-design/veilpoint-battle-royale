'use strict';
/* Original local-only Aden-inspired civilian street appearance.
 * Reference categories: mixed Indo-Arab climate-adapted commercial facade,
 * wooden shading, plastered arcades and human-scale sidewalks. NO image or
 * architectural survey is reproduced; not a geographic Aden building map.
 * All coordinates are metres relative to an optional standalone UE5 lab.
 */
const SCENE_FORMAT='veilpoint-original-civil-street-v1';
const MATERIALS=Object.freeze({
 'warm-lime':Object.freeze([.76,.69,.57]),
 'sandstone-edge':Object.freeze([.54,.48,.40]),
 'aged-wood':Object.freeze([.37,.28,.20]),
 'painted-lattice':Object.freeze([.48,.38,.27]),
 'muted-glass':Object.freeze([.25,.34,.33]),
 'cloth-cream':Object.freeze([.71,.62,.46]),
 'terra-frieze':Object.freeze([.61,.43,.31]),
 'street-paving':Object.freeze([.50,.48,.43]),
 'street-edge':Object.freeze([.37,.36,.34])
});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function buildStreet(quarter,elevationAt){
 if(!quarter||quarter.format!=='veilpoint-original-civilian-quarter-v1'||
  quarter.coordinateSystem!=='local-metre-unreferenced'||
  quarter.actualAdenCoverageVerified!==false||
  !Array.isArray(quarter.buildings)||quarter.buildings.length!==3||
  typeof elevationAt!=='function')
  throw new TypeError('Requires original three-building civilian quarter and local metre terrain');
 const parts=[],streetTiles=[],entries=[];
 function add(owner,role,x,z,base,w,d,h,finish,solid=false){
  if(typeof owner!=='string'||!/^[-a-z0-9]+$/.test(owner)||
   typeof role!=='string'||!/^[-a-z0-9]+$/.test(role)||
   !Object.hasOwn(MATERIALS,finish)||typeof solid!=='boolean'||
   ![x,z,base,w,d,h].every(finite)||
   ![w,d,h].every(n=>n>.015&&n<=30)||
   x<0||x>512||z<0||z>512||base<-500||base>3000)
   throw new RangeError('Invalid civilian street geometry');
  const id=owner+'-'+role+'-'+parts.length;
  const p=Object.freeze({id,owner,role,
   x,z,y:base+h/2,w,d,h,finish,solid});
  parts.push(p);return p;
 }
 function elevation(x,z){
  const e=elevationAt(x,z);
  if(!finite(e)||e<-500||e>3000)
   throw new RangeError('Invalid original civic street ground height');
  return e;
 }
 // A coherent public pedestrian street across the three ordinary shops.
 // 4m paving slices carry no new player collider; the existing R16
 // physical terrain remains authoritative, preventing floating walkway steps.
 for(let x=50;x<=178;x+=4){
  const ground=elevation(x,57);
  const slab=add('public-promenade','walk-paver',x,57,ground+.015,
    4.02,4.20,.045,'street-paving',false);
  streetTiles.push(Object.freeze({id:slab.id,x,z:57,groundMetres:ground}));
  // Low-color joint accents on the south edge, entirely visual.
  add('public-promenade','edge-stone',x,54.84,ground+.02,
   4.02,.11,.075,'street-edge',false);
 }
 // A continuous, clear lateral walk between building entrances.
 for(const b of quarter.buildings){
  const {id,x,z,w,d,doorWidthMetres:door,groundMetres:ground}=b;
  if(![x,z,w,d,door,ground].every(finite)||door<4.4)
   throw new RangeError('Unusable original civilian entry');
  const front=z-d/2,base=ground+.2,wall=b.id==='civic-market-shop'?3.10:
   b.id==='public-craft-hall'?3.25:3.40;
  const roadPoint={x,z:57},frontPoint={x,z:front},insidePoint={x,z:z+1.0};
  entries.push(Object.freeze({
   id,publicFrontMetres:Object.freeze(frontPoint),
   publicStreetMetres:Object.freeze(roadPoint),
   publicInteriorMetres:Object.freeze(insidePoint),
   doorwayMetres:door,clearWalkingRadiusMetres:.85
  }));
  // Short 3.2m wide pavement from the linear shared street to each doorway.
  // Use 2m spacing and do NOT place solid ramps on uneven art DEM.
  for(let sidewalkZ=60;sidewalkZ<=front-1.2;sidewalkZ+=2){
   add(id,'entry-paver',x,sidewalkZ,elevation(x,sidewalkZ)+.012,
    3.20,2.05,.045,'street-paving',false);
  }
  // Raised roof parapet follows each building's original source height.
  // Separate top courses remain above the accessible ground floor.
  const roofBase=base+wall+.22;
  add(id,'roof-front',x,front+.11,roofBase,w+.28,.26,.48,'sandstone-edge',true);
  add(id,'roof-back',x,z+d/2-.11,roofBase,w+.28,.26,.48,'sandstone-edge',true);
  add(id,'roof-left',x-w/2+.11,z,roofBase,.26,d,.48,'sandstone-edge',true);
  add(id,'roof-right',x+w/2-.11,z,roofBase,.26,d,.48,'sandstone-edge',true);
  // Entrance transom and signage are more than 2.7m above ground.
  // They do NOT close the physical >4m wall gap.
  add(id,'entry-frieze',x,front-.24,base+wall-.35,
    door+.7,.16,.17,'terra-frieze',false);
  add(id,'plain-shop-identity',x,front-.36,base+wall-.49,
    door*.72,.08,.17,'aged-wood',false);
  // Pilasters and screened-window panels sit on the *solid sides* of the
  // real front wall, never in its central pedestrian opening.
  for(const sign of [-1,1]){
   const center=x+sign*(door/2+(w-door)/4);
   add(id,sign<0?'front-left-pilaster':'front-right-pilaster',
    x+sign*(w/2-.17),front-.19,base,.25,.18,wall,'warm-lime',false);
   add(id,sign<0?'left-wood-screen':'right-wood-screen',
    center,front-.26,base+.98,.91,.14,1.15,
    b.id==='covered-civil-arcade'?'painted-lattice':'aged-wood',false);
   for(let i=0;i<4;i++)
    add(id,sign<0?'left-louver':'right-louver',
     center,front-.38,base+1.07+i*.27,.96,.055,.075,
     'painted-lattice',false);
   add(id,sign<0?'left-screen-head':'right-screen-head',
    center,front-.3,base+2.15,1.2,.16,.15,'sandstone-edge',false);
  }
  // Different civic typologies get distinctive *visual* elaboration,
  // not measured Aden facades or tactical building interiors.
  if(b.id==='civic-market-shop'){
   for(let i=-2;i<=2;i++)
    add(id,'market-canopy-stripe',x+i*.86,front-1.05,
     base+wall-.69,.19,2.1,.04,
     i%2===0?'cloth-cream':'terra-frieze',false);
   for(let i=-1;i<=1;i++)
    add(id,'market-display-rail',x+i*1.02,front-.45,
     base+2.50,.1,.28,.19,'aged-wood',false);
  }else if(b.id==='public-craft-hall'){
   for(let i=-2;i<=2;i++)
    add(id,'stone-vent-cornice',x+i*1.27,front-.23,
     base+wall-.12,.68,.24,.14,'sandstone-edge',false);
   for(let i=-2;i<=2;i++)
    add(id,'artisanal-wood-detail',x+i*1.24,front-.38,
     base+2.38,.40,.07,.10,'aged-wood',false);
  }else{
   // Simplified layered arch *suggestion* above the accessible entrance,
   // not an accurate monument tracing or structural stone arch.
   for(let i=-3;i<=3;i++){
    const t=Math.abs(i)/3;
    add(id,'arcade-upper-arch-trim',
     x+i*.62,front-.42,base+2.65+(.18*(1-t*t)),
     .55,.08,.11,'warm-lime',false);
   }
   for(let i=-2;i<=2;i++)
    add(id,'projected-wood-screen',x+i*.82,front-.65,
     base+2.16,.18,.30,.47,'aged-wood',false);
  }
 }
 // Four ordinary non-operational street lamps as authored civic scenery.
 // Keep their tiny columns well away from the paved pedestrian centerline.
 for(const x of [55,95,135,177]){
  const base=elevation(x,50);
  add('public-promenade','lamp-base',x,50,base,.55,.55,.26,'sandstone-edge',true);
  add('public-promenade','lamp-column',x,50,base+.26,
   .17,.17,3.2,'aged-wood',true);
  add('public-promenade','lamp-head',x,50,base+3.46,
   .64,.64,.24,'cloth-cream',false);
 }
 const ids=new Set(parts.map(p=>p.id));
 if(ids.size!==parts.length)throw new Error('Duplicate civic detail piece');
 return Object.freeze({
  format:SCENE_FORMAT,
  coordinateSystem:'local-metre-unreferenced',
  originalArchitectureOnly:true,actualAdenCoverageVerified:false,
  yearAccuracyVerified:false,sensitiveOperationalSites:false,
  civilBuildings:3,
  sharedPedestrianStreet:true,
  materials:MATERIALS,
  streets:Object.freeze(streetTiles),
  entrances:Object.freeze(entries),
  parts:Object.freeze(parts)
 });
}
module.exports={SCENE_FORMAT,MATERIALS,buildStreet};
