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
 function exposure(phase,x,z){
   if(phase==='terminal'||!Number.isFinite(x)||!Number.isFinite(z))return 0;
   const dx=Math.abs(x-PATCH.x),dz=Math.abs(z-PATCH.z);
   if(dx>=PATCH.w/2||dz>=PATCH.d/2)return 0;
   // A two-metre feather avoids an unnatural speed jump at water's edge.
   return Math.min(1,(PATCH.w/2-dx)/2,(PATCH.d/2-dz)/2);
 }
 function mobility(phase,x,z){return 1-0.28*exposure(phase,x,z);}
 function visible(phase){return phase!=='terminal';}
 return Object.freeze({PATCH,exposure,mobility,visible});
});
