/* VEILPOINT · original public-court geometry, authored in UE centimetres.
 * Static version of scripts/ch01-original-public-court.json, projected to
 * browser metres. This scene is story-first. Reusing its geometry in future
 * BR requires separate round-authority and save-compatibility verification.
 * Fictional non-georeferenced civilian architecture only.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryPublicCourt=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const FORMAT='veilpoint-ch01-original-public-court-v1';
 const RAW=Object.freeze([
   {
     "id": "public-court-stone-paving",
     "x": 110,
     "z": -37,
     "y": 0.015,
     "w": 24,
     "d": 16,
     "h": 0.03,
     "solid": false,
     "kind": "walkable-paving"
   },
   {
     "id": "public-court-west-north-column",
     "x": 99,
     "z": -43,
     "y": 1.55,
     "w": 0.38,
     "d": 0.38,
     "h": 3.1,
     "solid": true,
     "kind": "structural-column"
   },
   {
     "id": "public-court-west-south-column",
     "x": 99,
     "z": -31,
     "y": 1.55,
     "w": 0.38,
     "d": 0.38,
     "h": 3.1,
     "solid": true,
     "kind": "structural-column"
   },
   {
     "id": "public-court-east-north-column",
     "x": 121,
     "z": -43,
     "y": 1.55,
     "w": 0.38,
     "d": 0.38,
     "h": 3.1,
     "solid": true,
     "kind": "structural-column"
   },
   {
     "id": "public-court-east-south-column",
     "x": 121,
     "z": -31,
     "y": 1.55,
     "w": 0.38,
     "d": 0.38,
     "h": 3.1,
     "solid": true,
     "kind": "structural-column"
   },
   {
     "id": "public-court-high-canopy",
     "x": 110,
     "z": -37,
     "y": 3.28,
     "w": 22.4,
     "d": 12.4,
     "h": 0.18,
     "solid": true,
     "kind": "raised-canopy"
   },
   {
     "id": "public-court-west-bench",
     "x": 103,
     "z": -37,
     "y": 0.42,
     "w": 1.2,
     "d": 2,
     "h": 0.84,
     "solid": true,
     "kind": "street-furniture"
   },
   {
     "id": "public-court-east-bench",
     "x": 117,
     "z": -37,
     "y": 0.42,
     "w": 1.2,
     "d": 2,
     "h": 0.84,
     "solid": true,
     "kind": "street-furniture"
   },
   {
     "id": "public-court-west-side-shelf",
     "x": 101,
     "z": -35,
     "y": 0.58,
     "w": 1.4,
     "d": 0.6,
     "h": 1.16,
     "solid": true,
     "kind": "street-furniture"
   },
   {
     "id": "public-court-east-side-shelf",
     "x": 119,
     "z": -35,
     "y": 0.58,
     "w": 1.4,
     "d": 0.6,
     "h": 1.16,
     "solid": true,
     "kind": "street-furniture"
   },
   {
     "id": "public-court-marked-centre",
     "x": 110,
     "z": -37,
     "y": 0.025,
     "w": 2.5,
     "d": 8,
     "h": 0.01,
     "solid": false,
     "kind": "nonblocking-surface"
   }
 ].map(part=>Object.freeze(part)));
 // A 2D AABB cannot represent a roof 3.19m ABOVE the player: inserting
 // the canopy or pavement as a ground collider would create an invisible
 // wall across the intended walk-through court. 8 ground-level collision
 // bodies coincide with their visible shapes, with no separate fake shell.
 const SOLIDS=Object.freeze(RAW.filter(part=>
   part.solid&&part.kind!=='raised-canopy'
 ).map(part=>Object.freeze({id:part.id,x:part.x,z:part.z,
   w:part.w,d:part.d,h:part.h,
   type:part.kind==='structural-column'?'story-public-court-column':
    'story-public-court-furniture'})));
 const FLOOR=RAW.find(part=>part.kind==='walkable-paving');
 const CANOPY=RAW.find(part=>part.kind==='raised-canopy');
 const CENTRE_MARK=RAW.find(part=>part.kind==='nonblocking-surface');
 const CENTRE=Object.freeze({x:110,z:-37});
 // One physically measured local discovery. No long-range HUD marker,
 // no auto-navigation, and no false claim that civilians have arrived.
 // This is a PURE location reading, not a mission or persistent flag.
 function withinCourt(player){
  return !!player&&Number.isFinite(player.x)&&Number.isFinite(player.z)&&
   Math.abs(player.x-CENTRE.x)<=FLOOR.w/2&&
   Math.abs(player.z-CENTRE.z)<=FLOOR.d/2;
 }
 function floorStyle(phase){
  return phase==='terminal'?'daylight':phase==='engagement'?'disrupted':'staffed';
 }
 return Object.freeze({FORMAT,RAW,SOLIDS,FLOOR,CANOPY,CENTRE_MARK,CENTRE,withinCourt,floorStyle,
   georeferenced:false,storyFirst:true});
});
