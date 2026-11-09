/* VEILPOINT BR96 — PC-first, local, non-combat street view.
 * All physical buildings come from the server's PUBLIC geometry. People are
 * drawn only from the authenticated snapshot, never from private 96-body data.
 * This is a simple CPU-rendered view, not an engine-quality FPS.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointBR96StreetView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const FOV=78*Math.PI/180,MAX_DISTANCE=95,COLUMNS=210;
 // Eye elevation is derived solely from the server's own/spectated stance.
 // It cannot move the actual collision capsule or reveal unseen actors.
 const EYE_STANDING=1.65,EYE_CROUCH=0.96;
 function wrap(yaw){
  if(!Number.isFinite(yaw))throw new RangeError('invalid_view_direction');
  return Math.atan2(Math.sin(yaw),Math.cos(yaw));
 }
 // Camera orientation is LOCAL; only a normalized walking direction goes
 // through the server's authenticated 60Hz move API. This is not a remote
 // position, free camera or way to reveal an unobserved opponent.
 // Map-relative heading is a local camera label, not a real-world bearing,
 // server-authorized position report, radar or additional observer capability.
 function viewHeading(yaw){
  const angle=(wrap(yaw)*180/Math.PI+360)%360;
  const labels=['북','북동','동','남동','남','남서','서','북서'];
  return Object.freeze({degrees:Math.round(angle)%360,
   cardinal:labels[Math.round(angle/45)%8]});
 }
 function relativeMovement(dx,dz,yaw){
  if(![dx,dz,yaw].every(Number.isFinite)||Math.hypot(dx,dz)>1+1e-8)
   throw new RangeError('invalid_camera_movement');
  const a=wrap(yaw),cos=Math.cos(a),sin=Math.sin(a);
  const x=dx*cos-dz*sin,z=dx*sin+dz*cos;
  return Object.freeze({dx:Math.abs(x)<1e-12?0:x,dz:Math.abs(z)<1e-12?0:z});
 }
 function rayBox(eye,dir,box){
  if(!box||![box.x,box.z,box.w,box.d].every(Number.isFinite)||
     box.w<=0||box.d<=0)return Infinity;
  const xMin=box.x-box.w/2,xMax=box.x+box.w/2;
  const zMin=box.z-box.d/2,zMax=box.z+box.d/2;
  let tNear=-Infinity,tFar=Infinity;
  for(const [origin,vector,min,max] of [[eye.x,dir.x,xMin,xMax],[eye.z,dir.z,zMin,zMax]]){
   if(Math.abs(vector)<1e-9){
    if(origin<min||origin>max)return Infinity;
    continue;
   }
   const a=(min-origin)/vector,b=(max-origin)/vector;
   tNear=Math.max(tNear,Math.min(a,b));
   tFar=Math.min(tFar,Math.max(a,b));
  }
  if(tFar<Math.max(0,tNear))return Infinity;
  // When inside a room the far face should be visible, not an infinite wall.
  return tNear>0.03?tNear:tFar>0.03?tFar:Infinity;
 }
 // Public round weather is used only for color/visibility. No synthetic
 // sensors, out-of-range humans or bonus target acquisition are introduced.
 function weatherFogFraction(depth,visibleDistance,weatherCode='clear'){
  if(!Number.isFinite(depth)||depth<0||!Number.isFinite(visibleDistance)||visibleDistance<=0)
   throw new RangeError('invalid_weather_fog');
  const onset=visibleDistance*(weatherCode==='sea-haze'?.18:.40);
  const fraction=Math.max(0,Math.min(1,(depth-onset)/Math.max(1,visibleDistance-onset)));
  return fraction*(weatherCode==='sea-haze'?.90:
    weatherCode==='gusty'?.70:weatherCode==='clearing'?.50:.38);
 }
 function shade(type,depth,visibleDistance=95,weatherCode='clear',lampLit=false){
  const tint=String(type||'');
  const base=tint.includes('warehouse')||tint.includes('building')?[113,127,126]:
    tint.includes('wall')||tint.includes('shutter')?[118,130,128]:
    tint.includes('bench')||tint.includes('counter')?[158,139,108]:[113,119,111];
  const factor=Math.max(.36,1-depth/135)*(lampLit&&depth<24?1+.42*(1-depth/24):1),
     fog=weatherFogFraction(depth,visibleDistance,weatherCode);
  const horizon=weatherCode==='sea-haze'?[102,123,126]:
    weatherCode==='gusty'?[107,127,134]:[112,139,146];
  return 'rgb('+base.map((v,i)=>Math.min(255,Math.round(v*factor*(1-fog)+horizon[i]*fog))).join(',')+')';
 }
 function frame({subject,yaw=0,obstacles=[],civicGate=null,handcart=null,
   squad=[],visible=[],visibilityMeters=95}={}){
  if(!subject||![subject.x,subject.z].every(Number.isFinite))
   throw new RangeError('server_subject_required');
  if(!Array.isArray(obstacles)||!Array.isArray(squad)||!Array.isArray(visible))
   throw new RangeError('invalid_public_view');
  const angle=wrap(yaw),maxDistance=Math.max(10,Math.min(MAX_DISTANCE,
    Number.isFinite(visibilityMeters)?visibilityMeters:MAX_DISTANCE));
  const solids=obstacles.filter(o=>o&&[o.x,o.z,o.w,o.d].every(Number.isFinite)&&
    o.w>0&&o.d>0&&Math.hypot(o.x-subject.x,o.z-subject.z)<MAX_DISTANCE+120);
  if(civicGate&&[civicGate.x,civicGate.z,civicGate.w,civicGate.d].every(Number.isFinite)&&
     civicGate.w>0&&civicGate.d>0)solids.push({...civicGate,type:'civic-gate'});
  // Moving harbor cart is carried by the authenticated server snapshot,
  // never by the once-per-round immutable public geometry cache.
  if(handcart&&[handcart.x,handcart.z,handcart.w,handcart.d].every(Number.isFinite)&&
     handcart.w>0&&handcart.d>0)solids.push({...handcart,type:'dock-handcart'});
  // Fixed equal-angle ray columns: depth and sprite masking are read-only.
  const rays=Array.from({length:COLUMNS},(_,index)=>{
   const alpha=((index+.5)/COLUMNS-.5)*FOV;
   const heading=angle+alpha;
   const direction={x:Math.sin(heading),z:-Math.cos(heading)};
   let best=Infinity,object=null;
   for(const solid of solids){
    const d=rayBox(subject,direction,solid);
    if(d<best){best=d;object=solid;}
   }
   const distance=best*Math.cos(alpha);
   return Object.freeze({distance:distance<=maxDistance?distance:Infinity,
     height:object&&Number.isFinite(object.h)?Math.max(.2,Math.min(18,object.h)):2.7,
     type:object?.type||'building'});
  });
  // The server decides who is visible at all. This view only narrows the
  // FOV and hides occluded sprites: it never adds a person to that snapshot.
  const persons=[...squad.filter(p=>p&&p.eligible&&p.id!==subject.id)
     .map(p=>({...p,kind:'squad'})),
    ...visible.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z))
      .map(p=>({...p,kind:'observed'}))];
  const seen=persons.map(p=>{
   const dx=p.x-subject.x,dz=p.z-subject.z;
   const distance=Math.hypot(dx,dz);
   const relative=wrap(Math.atan2(dx,-dz)-angle);
   const col=Math.floor((relative/FOV+.5)*COLUMNS);
   const depth=distance*Math.cos(relative);
   if(!Number.isFinite(distance)||distance<.4||distance>maxDistance||
      Math.abs(relative)>FOV/2||col<0||col>=COLUMNS||
      rays[col].distance<depth-.6)return null;
   // Only server-published, actually visible squadmates carry a local seat
   // label. Never infer a hidden rival's squad, identity or location.
   return Object.freeze({kind:p.kind,id:p.id,col,depth,
    // Pose is from the authenticated server movement snapshot, not the map.
    facing:Number.isFinite(p.facing)?wrap(p.facing):null,
    moving:p.moving===true,crouched:p.crouched===true,
    stepOverProgress:Number.isFinite(p.stepOverProgress)&&
      p.stepOverProgress>=0&&p.stepOverProgress<=1?p.stepOverProgress:null,
    slot:p.kind==='squad'&&Number.isInteger(p.slot)&&p.slot>=1&&p.slot<=6?p.slot:null});
  }).filter(Boolean).sort((a,b)=>b.depth-a.depth);
  return Object.freeze({rays:Object.freeze(rays),seen:Object.freeze(seen),
    angle,heading:viewHeading(angle),columns:COLUMNS,maxDistance,
    eyeHeight:subject.crouched===true?EYE_CROUCH:EYE_STANDING});
 }
 function draw(ctx,{width,height,subject,yaw,obstacles,civicGate,handcart,squad,visible,
   visibilityMeters,weather}={}){
  if(!ctx||!Number.isInteger(width)||!Number.isInteger(height)||
    width<200||height<120||width>8192||height>8192)
   throw new RangeError('invalid_street_view_canvas');
  const model=frame({subject,yaw,obstacles,civicGate,handcart,squad,visible,visibilityMeters});
  const haze=weather?.code==='sea-haze',gusty=weather?.code==='gusty',
    horizon=height*.52;
  ctx.fillStyle=haze?'#667b7e':gusty?'#6b848b':'#708b92';
  ctx.fillRect(0,0,width,horizon);
  ctx.fillStyle=haze?'#424c4b':gusty?'#414846':'#3d4340';ctx.fillRect(0,horizon,width,height-horizon);
  ctx.fillStyle='#9aa19a';ctx.fillRect(0,horizon-1,width,2);
  const strip=width/model.columns,focal=height*.68;
  for(let i=0;i<model.columns;i++){
   const ray=model.rays[i];
   if(!Number.isFinite(ray.distance))continue;
   const d=Math.max(.3,ray.distance);
   // Project the visible wall relative to a standing/crouching eye plane.
   // A low wall becomes taller on screen when the authenticated body crouches.
   const wallHeight=Math.min(height*4,ray.height*focal/d);
   const baseY=horizon+model.eyeHeight*focal/d,y=baseY-wallHeight;
   // The headlamp brightens only real, already raycast public wall surfaces
   // in the local forward cone; it never grants seeing an unseen rival.
   const lit=subject.headlampOn===true&&d<24&&
     Math.abs((i+.5)/model.columns-.5)<.22;
   ctx.fillStyle=shade(ray.type,d,model.maxDistance,weather?.code,lit);
   ctx.fillRect(i*strip,y,strip+1,wallHeight);
   ctx.fillStyle='#405158';ctx.fillRect(i*strip,y,strip+1,Math.max(1,wallHeight*.018));
  }
  for(const person of model.seen){
   const bodyHeight=person.crouched?1.22:1.75;
   const size=Math.min(height*2,bodyHeight*focal/person.depth);
   const px=(person.col+.5)*strip;
   const fog=weatherFogFraction(person.depth,model.maxDistance,weather?.code);
   ctx.globalAlpha=1-fog;
   ctx.fillStyle=person.kind==='squad'?'#a2cbdf':'#d4aa99';
   // The server's own 60Hz bench transition supplies a finite rise and
   // landing arc, not a fabricated jump or client-invented actor altitude.
   const lift=person.stepOverProgress===null?0:
      .8*Math.sin(Math.PI*person.stepOverProgress);
   const feetY=horizon+(model.eyeHeight-lift)*focal/person.depth;
   // Body shape is read-only; moving into a wall cannot rotate the server pose.
   const broadness=person.facing===null?.32:
     .23+.10*Math.abs(Math.cos(person.facing-model.angle));
   ctx.fillRect(px-size*broadness/2,feetY-size*.78,size*broadness,size*.59);
   ctx.fillRect(px-size*.10,feetY-size,size*.20,size*.20);
   if(person.moving){
    ctx.fillRect(px-size*.13,feetY-size*.19,size*.09,size*.19);
    ctx.fillRect(px+size*.04,feetY-size*.28,size*.09,size*.28);
   }else ctx.fillRect(px-size*.11,feetY-size*.19,size*.22,size*.19);
   ctx.globalAlpha=1;
   if(person.kind==='squad'&&person.slot!==null){
    ctx.fillStyle='#dff4eb';ctx.font='11px system-ui';
    ctx.fillText('아군 '+person.slot+' · '+Math.round(person.depth)+'m',
      Math.max(3,px-size*.6),Math.max(14,feetY-size-5));
   }
  }
  ctx.strokeStyle='#d6e9e2';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(width/2-8,height/2);ctx.lineTo(width/2+8,height/2);
  ctx.moveTo(width/2,height/2-8);ctx.lineTo(width/2,height/2+8);ctx.stroke();
  ctx.fillStyle='#f1f5ed';ctx.font='14px system-ui';
  ctx.fillText('LOCAL STREET VIEW · SERVER SNAPSHOT ONLY',14,25);
  ctx.font='12px system-ui';
  ctx.fillText('화면 클릭: 마우스 시야 회전 · WASD: 보는 방향 기준 이동 · Esc: 포인터 해제',14,47);
  ctx.fillText('자세: '+(subject.crouched===true?'낮은 자세':'보통')+' · 관찰 높이 '+model.eyeHeight.toFixed(2)+'m',14,91);
  ctx.fillText(width<440?'시야 방향 '+model.heading.cardinal:
    '가상 지도 방향 '+model.heading.cardinal+' · '+model.heading.degrees+'°',14,69);
  return model;
 }
 return Object.freeze({FOV,MAX_DISTANCE,COLUMNS,EYE_STANDING,EYE_CROUCH,wrap,viewHeading,relativeMovement,weatherFogFraction,shade,rayBox,frame,draw});
});
