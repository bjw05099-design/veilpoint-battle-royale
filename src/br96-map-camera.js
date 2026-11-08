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
 function create({width,height,follow=false,subject=null}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||
     width<=0||height<=0||width>8192||height>8192)
   throw new RangeError('invalid_canvas_size');
  const valid=subject&&Number.isFinite(subject.x)&&Number.isFinite(subject.z);
  const nearby=follow===true&&!!valid;
  // The nearest view is read only from the caller's self/spectator snapshot.
  // No opponent, hidden teammate, client GPS or arbitrary camera target.
  const centerX=nearby?subject.x:0,centerZ=nearby?subject.z:0;
  const span=nearby?FOLLOW_SPAN:WORLD_SPAN;
  const scale=Math.min(width,height)/span;
  const x=v=>width/2+(v-centerX)*scale;
  const z=v=>height/2+(v-centerZ)*scale;
  return Object.freeze({
   mode:nearby?'follow':'overview',span,scale,centerX,centerZ,
   x,z,rect:(cx,cz,w,d)=>({x:x(cx-w/2),y:z(cz-d/2),
    width:w*scale,height:d*scale}),
   unproject:(px,py)=>({x:centerX+(px-width/2)/scale,
    z:centerZ+(py-height/2)/scale})
  });
 }
 return Object.freeze({WORLD_SPAN,FOLLOW_SPAN,create});
});