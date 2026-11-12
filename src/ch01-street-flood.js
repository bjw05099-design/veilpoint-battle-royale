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
   // Cleaning the real drain gradually frees the existing walking surface:
   // the same saved 60Hz work ticks already fade the leaves in both renderers.
   // A boolean is retained for old callers; the optional world-owned patch
   // carries the *same* progress as the current playable F interaction.
   const isPatch=drained&&typeof drained==='object'&&
     drained.x===PATCH.x&&drained.z===PATCH.z&&
     drained.w===PATCH.w&&drained.d===PATCH.d;
   const cleared=drained===true||(isPatch&&drained.cleared===true);
   const fraction=cleared?1:isPatch&&Number.isFinite(drained.repairProgress)
     ?Math.max(0,Math.min(1,drained.repairProgress)):0;
   return 1-(.28-.20*fraction)*exposure(phase,x,z);
 }
 function visible(phase){return phase!=='terminal';}
 // Tiny original public street fixtures are visual ground dressing only:
 // never feed them into 60Hz obstacles or change the original walkable route.
 // The metal drain is an actual drawn object, rather than a HUD-only marker.
 // No photographed/surveyed Aden geometry is asserted.
 const streetPart=(id,x,z,w,d,h,y,rgb,canvas)=>Object.freeze({
   id,x,z,w,d,h,y,rgb:Object.freeze(rgb),canvas
 });
 const BASE_DETAILS=Object.freeze([
   streetPart('drain-rim',DRAIN.x,DRAIN.z,1.22,.82,.016,.055,
     [.31,.32,.33],'#52585a'),
   streetPart('drain-inset',DRAIN.x,DRAIN.z,1.00,.59,.008,.069,
     [.075,.105,.12],'#222f33'),
   ...[-.38,-.23,-.08,.07,.22,.37].map((dx,i)=>
     streetPart('drain-bar-'+i,DRAIN.x+dx,DRAIN.z,.043,.54,.014,.078,
       [.29,.31,.31],'#687071')),
   streetPart('drain-road-edge-west',PATCH.x-PATCH.w/2+.08,PATCH.z,
     .12,PATCH.d,.011,.04,[.31,.36,.35],'#53615f'),
   streetPart('drain-road-edge-east',PATCH.x+PATCH.w/2-.08,PATCH.z,
     .12,PATCH.d,.011,.04,[.31,.36,.35],'#53615f')
 ]);
 const LEAF_DETAILS=Object.freeze([
   streetPart('drain-leaf-1',DRAIN.x-.26,DRAIN.z-.14,.27,.11,.006,.092,
     [.34,.27,.14],'#75633b'),
   streetPart('drain-leaf-2',DRAIN.x+.12,DRAIN.z+.14,.20,.17,.006,.092,
     [.26,.27,.13],'#5d603b'),
   streetPart('drain-leaf-3',DRAIN.x+.34,DRAIN.z-.08,.22,.10,.006,.092,
     [.39,.27,.12],'#867044')
 ]);
 const DETAIL_STAGES=Object.freeze(Array.from({length:4},(_,stage)=>
   Object.freeze([...BASE_DETAILS,...LEAF_DETAILS.slice(0,3-stage)])));
 function details(wet){
   if(!wet||wet.x!==PATCH.x||wet.z!==PATCH.z||
      wet.w!==PATCH.w||wet.d!==PATCH.d)return Object.freeze([]);
   const progress=wet.cleared===true?1:
     Number.isFinite(wet.repairProgress)?Math.min(1,Math.max(0,wet.repairProgress)):0;
   return DETAIL_STAGES[Math.min(3,Math.floor(progress*3))];
 }
 return Object.freeze({PATCH,DRAIN,CLEAR_TICKS,exposure,mobility,visible,details});
});
