/* VEILPOINT story-first PC minimap: real player-following local geometry.
 * This is a fictional, unguided *local view*, never surveyed Aden or a
 * map-wide tracker. It draws only public mission markers supplied by the
 * story UI and only an escort explicitly observed at close range.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryLocalMinimap=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SPAN_X_METRES=120,GRID_METRES=20;
 const DEFAULT_WIDTH=240,DEFAULT_HEIGHT=150;
 function frameFor(player,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT){
  if(!player||![player.x,player.z,width,height].every(Number.isFinite)||
     width<=0||height<=0) return null;
  const scale=width/SPAN_X_METRES;
  const spanZ=height/scale;
  const left=player.x-SPAN_X_METRES/2,top=player.z-spanZ/2;
  return Object.freeze({left,top,right:left+SPAN_X_METRES,
   bottom:top+spanZ,width,height,scale,
   playerX:player.x,playerZ:player.z});
 }
 function point(f,x,z){
  if(!f||![x,z].every(Number.isFinite))return null;
  return Object.freeze({x:(x-f.left)*f.scale,y:(z-f.top)*f.scale});
 }
 function contains(f,x,z,margin=0){
  return !!f&&[x,z,margin].every(Number.isFinite)&&margin>=0&&
    x>=f.left-margin&&x<=f.right+margin&&
    z>=f.top-margin&&z<=f.bottom+margin;
 }
 function rectangle(f,obj){
  if(!f||!obj||![obj.x,obj.z,obj.w,obj.d].every(Number.isFinite)||
     obj.w<=0||obj.d<=0)return null;
  const left=Math.max(f.left,obj.x-obj.w/2),right=Math.min(f.right,obj.x+obj.w/2),
    top=Math.max(f.top,obj.z-obj.d/2),bottom=Math.min(f.bottom,obj.z+obj.d/2);
  if(left>=right||top>=bottom)return null;
  const a=point(f,left,top);
  return Object.freeze({x:a.x,y:a.y,w:(right-left)*f.scale,
   h:(bottom-top)*f.scale});
 }
 // Liang–Barsky clipping keeps route strokes inside the real local viewport,
 // even when the route begins far outside the visible player's street.
 function segment(f,a,b){
  if(!f||!a||!b||![a.x,a.z,b.x,b.z].every(Number.isFinite))return null;
  const dx=b.x-a.x,dz=b.z-a.z;
  let t0=0,t1=1;
  for(const [p,q] of [
   [-dx,a.x-f.left],[dx,f.right-a.x],
   [-dz,a.z-f.top],[dz,f.bottom-a.z]
  ]){
   if(Math.abs(p)<1e-12){if(q<0)return null;continue;}
   const r=q/p;
   if(p<0)t0=Math.max(t0,r);else t1=Math.min(t1,r);
   if(t0>t1)return null;
  }
  if(t1-t0<1e-10)return null;
  return Object.freeze({from:point(f,a.x+dx*t0,a.z+dz*t0),
   to:point(f,a.x+dx*t1,a.z+dz*t1)});
 }
 function draw(ctx,canvas,{player,obstacles=[],markers=[],walkRoute=null,escort=null}={}){
  if(!ctx||!canvas||!Number.isFinite(canvas.width)||!Number.isFinite(canvas.height))
   return null;
  const f=frameFor(player,canvas.width,canvas.height);
  if(!f)return null;
  ctx.fillStyle='#0b2326';ctx.fillRect(0,0,f.width,f.height);
  ctx.strokeStyle='#365450';ctx.lineWidth=1;
  // Grid lines are anchored to ACTUAL fictional-world metres, not UI pixels.
  for(let x=Math.ceil(f.left/GRID_METRES)*GRID_METRES;x<f.right;x+=GRID_METRES){
   const p=point(f,x,f.top);
   ctx.beginPath();ctx.moveTo(p.x,0);ctx.lineTo(p.x,f.height);ctx.stroke();
  }
  for(let z=Math.ceil(f.top/GRID_METRES)*GRID_METRES;z<f.bottom;z+=GRID_METRES){
   const p=point(f,f.left,z);
   ctx.beginPath();ctx.moveTo(0,p.y);ctx.lineTo(f.width,p.y);ctx.stroke();
  }
  if(Array.isArray(obstacles)){
   ctx.fillStyle='#637874';
   for(const o of obstacles){
    const r=rectangle(f,o);
    if(r)ctx.fillRect(r.x,r.y,r.w,r.h);
   }
  }
  if(walkRoute?.kind==='detour'&&Array.isArray(walkRoute.points)&&walkRoute.points.length>=2){
   ctx.strokeStyle='#d2e5a9';ctx.lineWidth=2;
   ctx.setLineDash?.([4,3]);
   for(let i=1;i<walkRoute.points.length;i++){
    const clipped=segment(f,walkRoute.points[i-1],walkRoute.points[i]);
    if(!clipped)continue;
    ctx.beginPath();ctx.moveTo(clipped.from.x,clipped.from.y);
    ctx.lineTo(clipped.to.x,clipped.to.y);ctx.stroke();
   }
   ctx.setLineDash?.([]);
  }
  if(Array.isArray(markers))for(const m of markers){
   if(!m||!contains(f,m.x,m.z))continue;
   const p=point(f,m.x,m.z);
   ctx.fillStyle=m.kind==='evac'?'#91f0ad':
     m.kind==='evidence'||m.kind==='verify'?'#8ec6ff':'#ffcb7c';
   ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();
  }
  // Caller must prove line of sight + <=20m for the guide; this module
  // separately rejects any escort outside this camera rectangle.
  if(escort&&contains(f,escort.x,escort.z)){
   const p=point(f,escort.x,escort.z);
   ctx.fillStyle='#c6d4de';ctx.beginPath();ctx.arc(p.x,p.y,3.6,0,Math.PI*2);ctx.fill();
  }
  const p=point(f,player.x,player.z);
  ctx.fillStyle='#faffd4';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();
  const yaw=Number.isFinite(player.yaw)?player.yaw:0;
  ctx.strokeStyle='#faffd4';ctx.beginPath();ctx.moveTo(p.x,p.y);
  ctx.lineTo(p.x+Math.sin(yaw)*12,p.y-Math.cos(yaw)*12);ctx.stroke();
  return f;
 }
 return Object.freeze({SPAN_X_METRES,GRID_METRES,frameFor,point,contains,
   rectangle,segment,draw});
});
