/* VEILPOINT / original, non-georeferenced civilian harbor hall geometry.
 * Story-first playable venue. All AABB solids enter the CH01 60Hz world and
 * the renderer from one source. BR reuse is planned AFTER story release:
 * do not spawn the hall in existing BR checkpoint revisions yet.
 * These are fictional public civilian structures, NOT a surveyed Aden site.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointPublicHall=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const FORMAT='veilpoint-original-public-hall-v1';
 const PARTS=Object.freeze([
  Object.freeze({id:'harbor-hall-west',x:20,z:34,w:.55,d:16,h:3.8,type:'story-public-hall-wall'}),
  Object.freeze({id:'harbor-hall-east',x:36,z:34,w:.55,d:16,h:3.8,type:'story-public-hall-wall'}),
  Object.freeze({id:'harbor-hall-north',x:28,z:42,w:16,d:.55,h:3.8,type:'story-public-hall-wall'}),
  // Two real southern wall segments, with an 8m open pedestrian entrance.
  Object.freeze({id:'harbor-hall-southwest',x:22,z:26,w:4,d:.55,h:3.8,type:'story-public-hall-wall'}),
  Object.freeze({id:'harbor-hall-southeast',x:34,z:26,w:4,d:.55,h:3.8,type:'story-public-hall-wall'}),
  Object.freeze({id:'harbor-hall-help-counter',x:32.8,z:39,w:2.2,d:1.1,h:1.05,type:'story-public-hall-counter'}),
  Object.freeze({id:'harbor-hall-side-bench',x:22.6,z:35,w:1.0,d:3.3,h:.68,type:'story-public-hall-seat'})
 ]);
 const PUBLIC_ENTRY=Object.freeze({x:28,z:26});
 const INNER_COURT=Object.freeze({x:28,z:34});
 // Deterministic static geometry. The same contract can later be consumed
 // by the independent BR server after release, not by current BR matches.
 function walkable(x,z,r=.85){
  if(![x,z,r].every(Number.isFinite)||r<=0||r>2)return false;
  return !PARTS.some(o=>{
   const dx=Math.max(0,Math.abs(x-o.x)-o.w/2),
         dz=Math.max(0,Math.abs(z-o.z)-o.d/2);
   return dx*dx+dz*dz<r*r;
  });
 }
 return Object.freeze({FORMAT,PARTS,PUBLIC_ENTRY,INNER_COURT,walkable,
  geographicAccuracyVerified:false,sharedAfterStoryRelease:true});
});
