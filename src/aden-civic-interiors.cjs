'use strict';
/* VEILPOINT ORIGINAL civilian interiors for the separate 1:1 terrain lab.
 * Fictional local-metre spaces only. These are NOT measured Aden interiors,
 * operational facilities, actual protected sites, or navigational intelligence.
 */
const FINISHES=Object.freeze(new Set([
 'salt-plaster','weathered-stone','ochre-plaster','stone-paving',
 'light-terracotta','canvas-shade'
]));
const finite=Number.isFinite;
const CLEAR_HALF_WIDTH=1.55; // 3.1m uninterrupted wheelchair/pedestrian aisle.
function createInteriors(quarter){
 if(!quarter||quarter.format!=='veilpoint-original-civilian-quarter-v1'||
    quarter.coordinateSystem!=='local-metre-unreferenced'||
    quarter.actualAdenCoverageVerified!==false||
    !Array.isArray(quarter.buildings)||quarter.buildings.length!==3)
   throw new TypeError('Original, unverified three-building civic quarter required');
 const parts=[],interiors=[];
 for(const building of quarter.buildings){
  const {id,x,z,w,d,doorWidthMetres:door,groundMetres:ground,type}=building;
  if(!id||![x,z,w,d,door,ground].every(finite)||
     door<3.5||w<door+4||d<8||w>26||d>18)
    throw new RangeError('Civic interior entrance/dimensions not verified');
  const base=ground+.20,front=z-d/2,back=z+d/2;
  let localCount=0;
  function cube(role,dx,dz,bottom,width,depth,height,finish,solid=true){
   if(![dx,dz,bottom,width,depth,height].every(finite)||
      !FINISHES.has(finish)||typeof solid!=='boolean'||
      width<.10||depth<.10||height<.05||height>5.0)
    throw new RangeError('Invalid civic interior component');
   if(Math.abs(dx)+width/2>w/2-.40||
      Math.abs(dz)+depth/2>d/2-.40)
    throw new RangeError('Civic interior component penetrates exterior wall');
   // A solid fixture never blocks the pedestrian entrance and 3.1m continuous
   // aisle. Non-solid ceiling fixtures may pass overhead, not at head height.
   if(solid&&Math.abs(dx)-width/2<CLEAR_HALF_WIDTH&&
      dz+depth/2>front-z+.4&&dz-depth/2<back-z-.4)
    throw new RangeError('Pedestrian corridor blocked: '+role);
   if(!solid&&Math.abs(dx)-width/2<CLEAR_HALF_WIDTH&&
      bottom<base+2.55)
    throw new RangeError('Overhead element too low: '+role);
   parts.push(Object.freeze({id:id+'-interior-'+role+'-'+localCount++,
     owner:id,role,x:x+dx,z:z+dz,y:bottom+height/2,w:width,
     d:depth,h:height,finish,solid}));
  }
  // Four short solid partitions produce TWO distinct room openings of 1.9m,
  // rather than trapping the entire west/east rear rooms behind solid walls.
  // The south-to-north central aisle itself stays at least 3.1m wide.
  const innerEdge=CLEAR_HALF_WIDTH+.10,outerEdge=w/2-.45;
  const alcoveOpen=1.9,partitionLength=(outerEdge-innerEdge-alcoveOpen)/2;
  if(partitionLength<.45)throw new RangeError('Public side-room entrance too narrow');
  for(const side of [-1,1]){
   const prefix=side<0?'west':'east';
   cube(prefix+'-alcove-inner-divider',side*(innerEdge+partitionLength/2),.8,
     base,partitionLength,.20,2.25,'salt-plaster');
   cube(prefix+'-alcove-outer-divider',side*(outerEdge-partitionLength/2),.8,
     base,partitionLength,.20,2.25,'salt-plaster');
  }
  for(const side of [-1,1]){
   const sideName=side<0?'west':'east';
   const shelfX=side*(w/2-1.2);
   cube(sideName+'-shelf-base',shelfX,-d/2+1.9,base,
     .75,1.65,.65,'weathered-stone');
   cube(sideName+'-shelf-middle',shelfX,-d/2+1.9,base+1.25,
     .75,1.65,.13,'light-terracotta');
   cube(sideName+'-shelf-upright',shelfX,-d/2+1.9,base,
     .24,1.65,1.8,'ochre-plaster');
   cube(sideName+'-bench',side*(w/2-1.55),d/2-1.75,base,
     1.3,.68,.52,'stone-paving');
   cube(sideName+'-bench-back',side*(w/2-1.55),d/2-1.36,base+.5,
     1.3,.12,.5,'light-terracotta');
   cube(sideName+'-wall-display',side*(w/2-.57),-d/2+3.85,
     base+1.3,.10,1.25,.82,'canvas-shade',false);
  }
  // Ordinary lit public interiors, not empty clones: per-building use is
  // reflected in distinct fixtures, without inventing real site floorplans.
  if(type==='public-market'){
   cube('market-west-crates',-w/2+2.35,-.9,base,1.15,1.15,.54,'light-terracotta');
   cube('market-east-produce-rack',w/2-2.25,-.8,base,1.45,.70,1.4,'ochre-plaster');
  }else if(type==='community-craft'){
   cube('craft-worktable-west',-w/2+2.8,-.8,base,2.5,1.0,.83,'weathered-stone');
   cube('craft-community-display-east',w/2-2.4,-.9,base,1.7,.65,1.6,'salt-plaster');
  }else if(type==='residential-arcade'){
   cube('arcade-public-seat-west',-w/2+2.65,-.8,base,2.2,.70,.56,'stone-paving');
   cube('arcade-community-table-east',w/2-2.9,-.9,base,2.1,1.1,.77,'light-terracotta');
  }else throw new RangeError('Unknown fictional civic interior use');
  for(const dz of [-d/3,d/3])
   cube('ceiling-light-'+Math.round(dz*10),0,dz,base+2.85,
     .85,.50,.11,'light-terracotta',false);
  interiors.push(Object.freeze({id,kind:type,sourceBuilding:id,
   entrance:'south',walkableCentreAisleMetres:2*CLEAR_HALF_WIDTH,
   doorWidthMetres:door,publicInterior:true,localHeightMetres:ground,
   parts:localCount}));
 }
 const ids=parts.map(p=>p.id);
 if(new Set(ids).size!==ids.length)throw new Error('Duplicate original interior actor IDs');
 return Object.freeze({format:'veilpoint-original-civic-interiors-v1',
  coordinateSystem:'local-metre-unreferenced',realAdenInteriorsVerified:false,
  sourceQuarterFormat:quarter.format,sourceR16Sha256:quarter.sourceR16Sha256||null,
  usesFictionalCivilianBuildings:true,interiors:Object.freeze(interiors),
  parts:Object.freeze(parts)});
}
module.exports={createInteriors,CLEAR_HALF_WIDTH};
