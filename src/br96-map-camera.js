/* VEILPOINT BR96 — player-owned, local 2D world camera.
 * Pure view transform over already authorized coordinates; no network access.
 * It neither creates enemy positions nor changes physics/simulation authority.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointBR96MapCamera=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const WORLD_SPAN=350;
 const FOLLOW_SPAN=110;
 // Three deterministic, local view levels; the default matches old sessions.
 const ZOOM_SPANS=Object.freeze([165,FOLLOW_SPAN,82.5]);
 function create({width,height,follow=false,subject=null,zoomLevel=0}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||
     width<=0||height<=0||width>8192||height>8192)
   throw new RangeError('invalid_canvas_size');
  if(!Number.isInteger(zoomLevel)||zoomLevel<-1||zoomLevel>1)
   throw new RangeError('invalid_zoom_level');
  // Corrupt or unbounded spectator coordinates must never shift the whole
  // map into an unusable off-screen transform. This is a display-only
  // fallback; the server remains the sole authority over positions.
  // Only an actual server-authorized body inside the 350m playable world
  // can own a follow camera. A corrupt spectator coordinate must not pan a
  // convincing local map into unbounded empty space.
  const HALF_WORLD=WORLD_SPAN/2;
  const valid=subject&&Number.isFinite(subject.x)&&Number.isFinite(subject.z)&&
   Math.abs(subject.x)<=HALF_WORLD&&Math.abs(subject.z)<=HALF_WORLD;
  const nearby=follow===true&&!!valid;
  const span=nearby?ZOOM_SPANS[zoomLevel+1]:WORLD_SPAN;
  // At the physical map edge, keep the entire 2D viewport over real world
  // geometry. The player stays inside that view but need not remain centered:
  // otherwise half the PC canvas becomes blank beyond the 60Hz world.
  const limit=Math.max(0,(WORLD_SPAN-span)/2);
  const bound=value=>Math.max(-limit,Math.min(limit,value));
  const centerX=nearby?bound(subject.x):0,centerZ=nearby?bound(subject.z):0;
  const scale=Math.min(width,height)/span;
  const x=v=>width/2+(v-centerX)*scale;
  const z=v=>height/2+(v-centerZ)*scale;
  return Object.freeze({
   mode:nearby?'follow':'overview',span,scale,centerX,centerZ,
   zoomLevel:nearby?zoomLevel:0,
   x,z,rect:(cx,cz,w,d)=>({x:x(cx-w/2),y:z(cz-d/2),
    width:w*scale,height:d*scale}),
   unproject:(px,py)=>({x:centerX+(px-width/2)/scale,
    z:centerZ+(py-height/2)/scale})
  });
 }
 return Object.freeze({WORLD_SPAN,FOLLOW_SPAN,ZOOM_SPANS,create});
});