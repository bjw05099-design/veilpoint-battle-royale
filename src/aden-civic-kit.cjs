'use strict';
/* Three ORIGINAL, non-georeferenced civilian architectural archetypes for
 * the OPT-IN standalone UE5 terrain laboratory. Not a representation of
 * named real Aden buildings, protected sites, tactical structures or
 * actual city coverage. Local metre positions and walk-in door openings.
 */
const CATALOG=Object.freeze([
 Object.freeze({id:'civic-market-shop',type:'public-market',x:70,z:74,
  w:12,d:10,wall:3.10,door:4.4,finish:'salt-plaster'}),
 Object.freeze({id:'public-craft-hall',type:'community-craft',x:111,z:77,
  w:16,d:12,wall:3.25,door:4.8,finish:'weathered-stone'}),
 Object.freeze({id:'covered-civil-arcade',type:'residential-arcade',x:156,z:74,
  w:20,d:12,wall:3.40,door:5.2,finish:'ochre-plaster'})
]);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function makeQuarter(elevationAt){
 if(typeof elevationAt!=='function')throw new TypeError('Grounding requires actual R16 elevation lookup');
 const parts=[], buildings=[];
 function block(owner,role,x,z,bottom,w,d,h,finish,solid=true){
  if(![x,z,bottom,w,d,h].every(finite)||w<.1||w>30||d<.1||d>30||
   h<.05||h>8||Math.abs(x)>512||Math.abs(z)>512)
   throw new RangeError('Invalid original civil architectural block');
  parts.push(Object.freeze({id:owner+'-'+role+'-'+parts.length,
   owner,role,x,z,y:bottom+h/2,w,d,h,finish,solid}));
 }
 for(const item of CATALOG){
  const ground=elevationAt(item.x,item.z);
  if(!finite(ground)||ground<-500||ground>3000)
   throw new RangeError('Invalid civilian building foundation height');
  const {id,x,z,w,d,wall,door,finish}=item;
  const floor=.2,back=z+d/2,front=z-d/2,base=ground+floor,
   thickness=.34,sideSpan=(w-door)/2,roof=.22;
  // Each floor is a real physical base. The south-facing entrance is
  // open across >4m so a 0.85m-radius pedestrian can enter WITHOUT
  // crossing or clipping collision geometry.
  block(id,'floor',x,z,ground,w,d,floor,'stone-paving');
  block(id,'rear-wall',x,back-thickness/2,base,w,thickness,wall,finish);
  block(id,'west-wall',x-w/2+thickness/2,z,base,thickness,d,wall,finish);
  block(id,'east-wall',x+w/2-thickness/2,z,base,thickness,d,wall,finish);
  block(id,'front-west',x-(door/2+sideSpan/2),front+thickness/2,
   base,sideSpan,thickness,wall,finish);
  block(id,'front-east',x+(door/2+sideSpan/2),front+thickness/2,
   base,sideSpan,thickness,wall,finish);
  block(id,'entrance-lintel',x,front+thickness/2,
   base+wall-.52,door,thickness,.52,'light-terracotta');
  block(id,'flat-roof',x,z,base+wall,w+.22,d+.22,roof,'stone-paving');
  // Side awnings/corner columns make human scale legible while keeping
  // the central 4-5m pedestrian lane genuinely clear.
  block(id,'entry-awning',x,front-1.05,base+wall-.85,
   door+1.2,2.15,.16,'canvas-shade',false);
  for(const side of [-1,1]){
   block(id,side<0?'exterior-west-post':'exterior-east-post',
    x+side*(door/2+.7),front-.85,base,.42,.42,wall-.8,'weathered-stone');
  }
  // These are ordinary civilian fixtures; neither tactical cover nor
  // operational access to actual buildings is inferred from this kit.
  block(id,'interior-service-counter',
   x-w/2+1.5,z+d/2-2.2,base,2.0,1.0,.84,'light-terracotta');
  block(id,'street-seat',x+w/2+1.6,front-2.2,ground,
   2.2,.7,.55,'stone-paving');
  buildings.push(Object.freeze({
   id,type:item.type,finish,x,z,w,d,doorWidthMetres:door,
   groundMetres:ground,openPublicEntrance:'south',
   sourcedRealArchitecture:false
  }));
 }
 const known=new Set(parts.map(p=>p.id));
 if(known.size!==parts.length)throw new RangeError('Duplicate civil block ID');
 return Object.freeze({
  format:'veilpoint-original-civilian-quarter-v1',
  coordinateSystem:'local-metre-unreferenced',
  provenance:'original fictional civilian architectural blockout',
  actualAdenCoverageVerified:false,
  restrictedFacilityModel:false,
  architectureComplete:false,
  buildings:Object.freeze(buildings),
  parts:Object.freeze(parts)
 });
}
module.exports={CATALOG,makeQuarter};
