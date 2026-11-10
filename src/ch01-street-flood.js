/* VEILPOINT fictional CH01 harbor aftermath: a damaged street drain leaves a
 * shallow patch on an ordinary public walking route. It does not create a
 * collectible, hidden opponent sensor, damage source or route lock. The
 * existing mission phase is the saved source of truth for old v2 checkpoints.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStreetFlood=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PATCH=Object.freeze({x:-12,z:-19,w:12,d:9});
 // A fictional street-side drain is physically accessible on the public
 // walkway. The 3s clearing action is optional and never gates the mission.
 const DRAIN=Object.freeze({id:'streetDrain',x:-11,z:-17.5,kind:'objective',
   label:'가까이서 배수구 장애물 정리',radius:3});
 const CLEAR_TICKS=180;
 function exposure(phase,x,z){
   if(phase==='terminal'||!Number.isFinite(x)||!Number.isFinite(z))return 0;
   const dx=Math.abs(x-PATCH.x),dz=Math.abs(z-PATCH.z);
   if(dx>=PATCH.w/2||dz>=PATCH.d/2)return 0;
   // A two-metre feather avoids an unnatural speed jump at water's edge.
   return Math.min(1,(PATCH.w/2-dx)/2,(PATCH.d/2-dz)/2);
 }
 // Clearing debris improves footing only on the existing wet public patch.
 // Remaining damp ground still has mild traction loss; there is no instant
 // magical drying or whole-city climate effect.
 function mobility(phase,x,z,drained=false){
   return 1-(drained===true?.08:.28)*exposure(phase,x,z);
 }
 function visible(phase){return phase!=='terminal';}
 return Object.freeze({PATCH,DRAIN,CLEAR_TICKS,exposure,mobility,visible});
});
