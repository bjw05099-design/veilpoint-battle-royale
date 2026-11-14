/* VEILPOINT BR96 — PC-first, local combat prototype street view.
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
 const EYE_STANDING=1.65,EYE_CROUCH=0.96,EYE_SEATED=0.91;
 // Read-only camera pitch, deliberately bounded to avoid impossible upside-down
 // viewpoints. Walking direction and world snapshot remain server-authored.
 const MAX_PITCH=0.44;
 function clampPitch(pitch){
  if(!Number.isFinite(pitch))throw new RangeError('invalid_view_pitch');
  return Math.max(-MAX_PITCH,Math.min(MAX_PITCH,pitch));
 }
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
 // Determine the exact public wall face already intersected by an existing
 // ray. This does not generate new collision geometry, players or remote data.
 // For an eye inside a room, rayBox returns the outward exit face.
 function wallFace(eye,dir,box,distance){
  if(!box||!Number.isFinite(distance)||distance<=0)return null;
  const hitX=eye.x+dir.x*distance,hitZ=eye.z+dir.z*distance;
  const candidates=[
   ['west',Math.abs(hitX-(box.x-box.w/2))],
   ['east',Math.abs(hitX-(box.x+box.w/2))],
   ['north',Math.abs(hitZ-(box.z-box.d/2))],
   ['south',Math.abs(hitZ-(box.z+box.d/2))]
  ];
  candidates.sort((a,b)=>a[1]-b[1]);
  return candidates[0][0];
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
 function shade(type,depth,visibleDistance=95,weatherCode='clear',lampLit=false,surfaceFace=null){
  const tint=String(type||'');
  const base=tint.includes('warehouse')||tint.includes('building')?[113,127,126]:
    tint.includes('wall')||tint.includes('shutter')?[118,130,128]:
    tint.includes('bench')||tint.includes('counter')?[158,139,108]:[113,119,111];
  // Directional surface illumination is fixed in this *fictional* street
  // coordinate system, independent of client camera rotation. Adjacent
  // brick faces can finally have different brightness without changing
  // range, hit geometry or server-authorized visibility.
  const exposure=surfaceFace==='east'?1.07:
    surfaceFace==='west'?.79:surfaceFace==='north'?.93:
    surfaceFace==='south'?1.13:1;
  const factor=Math.max(.36,1-depth/135)*exposure*
    (lampLit&&depth<24?1+.42*(1-depth/24):1),
     fog=weatherFogFraction(depth,visibleDistance,weatherCode);
  const horizon=weatherCode==='sea-haze'?[102,123,126]:
    weatherCode==='gusty'?[107,127,134]:[112,139,146];
  return 'rgb('+base.map((v,i)=>Math.min(255,Math.round(v*factor*(1-fog)+horizon[i]*fog))).join(',')+')';
 }
 // Project public, non-colliding civic ground onto the actual player-local
 // 1st-person horizon. Near-plane polygon clipping keeps the ground stable
 // even when a player stands ON the pavement. Never use it for actor sight.
 function civicGroundPolygons(subject,yaw,pitch,pavements,width,height,eyeHeight,
   maxDistance=MAX_DISTANCE){
  if(!Array.isArray(pavements)||pavements.length>32)
   throw new RangeError('invalid_public_pavements');
  const angle=wrap(yaw),horizon=height*.52+Math.tan(clampPitch(pitch))*height*.68,
   focal=height*.68,near=.65;
  const output=[];
  for(const ground of pavements){
   if(!ground||![ground.x,ground.z,ground.w,ground.d].every(Number.isFinite)||
      ground.w<=0||ground.d<=0||ground.w>60||ground.d>60||
      !/^#[0-9a-f]{6}$/i.test(ground.canvas||''))
      throw new RangeError('invalid_public_pavement');
   if(Math.hypot(ground.x-subject.x,ground.z-subject.z)>
      maxDistance+Math.hypot(ground.w,ground.d))continue;
   const verts=[
    [-1,-1],[1,-1],[1,1],[-1,1]
   ].map(([u,v])=>{
    const dx=ground.x+u*ground.w/2-subject.x,
      dz=ground.z+v*ground.d/2-subject.z;
    return {side:dx*Math.cos(angle)+dz*Math.sin(angle),
      depth:dx*Math.sin(angle)-dz*Math.cos(angle)};
   });
   const clipped=[];
   for(let i=0;i<verts.length;i++){
    const a=verts[i],b=verts[(i+1)%verts.length],
      aIn=a.depth>=near,bIn=b.depth>=near;
    if(aIn)clipped.push(a);
    if(aIn!==bIn){
     const part=(near-a.depth)/(b.depth-a.depth);
     clipped.push({side:a.side+part*(b.side-a.side),depth:near});
    }
   }
   if(clipped.length<3)continue;
   const points=clipped.map(v=>Object.freeze({
     x:Math.max(-width*4,Math.min(width*5,width/2+v.side*focal/v.depth)),
     y:Math.max(horizon,Math.min(height*5,horizon+eyeHeight*focal/v.depth))
   }));
   output.push(Object.freeze({id:ground.id||null,
     canvas:ground.canvas,points:Object.freeze(points)}));
  }
  return Object.freeze(output);
 }
 // Conservative view-cone broadphase. A public AABB is bounded by its
 // enclosing circle; only genuinely outside-cone boxes are excluded from
 // CPU wall-ray tests. Unlike distance-only culling, this cannot erase a
 // nearby facade whose edge (rather than its center) crosses the screen.
 // No hidden actor or private client location is consulted.
 function visibleRaySolids(subject,yaw,solids){
  const angle=wrap(yaw),half=FOV/2+FOV/COLUMNS;
  return solids.filter(box=>{
   const dx=box.x-subject.x,dz=box.z-subject.z;
   const distance=Math.hypot(dx,dz),radius=Math.hypot(box.w,box.d)/2;
   if(distance<=radius+.05)return true;
   const center=wrap(Math.atan2(dx,-dz)-angle);
   return Math.abs(center)<=half+
     Math.asin(Math.min(1,(radius+.05)/distance));
  });
 }
 function frame({subject,yaw=0,pitch=0,obstacles=[],civicGate=null,handcart=null,
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
  // Filter public WORLD geometry, never the authenticated people list.
  // The 210-ray reference remains exactly the same at every visible hit.
  const rayCandidates=visibleRaySolids(subject,angle,solids);
  // Fixed equal-angle ray columns: depth and sprite masking are read-only.
  const eyeHeight=subject.benchResting===true?EYE_SEATED:
    subject.crouched===true?EYE_CROUCH:EYE_STANDING;
  const rays=Array.from({length:COLUMNS},(_,index)=>{
   const alpha=((index+.5)/COLUMNS-.5)*FOV;
   const heading=angle+alpha;
   const direction={x:Math.sin(heading),z:-Math.cos(heading)};
   const layers=[];
   for(const solid of rayCandidates){
    const contact=rayBox(subject,direction,solid),distance=contact*Math.cos(alpha);
    if(distance<=maxDistance)layers.push(Object.freeze({distance,
      height:Number.isFinite(solid.h)?Math.max(.2,Math.min(30,solid.h)):2.7,
      type:solid.type||'building',face:wallFace(subject,direction,solid,contact)}));
   }
   layers.sort((a,b)=>a.distance-b.distance);
   const nearest=layers[0]||{distance:Infinity,height:2.7,type:'building',face:null};
   return Object.freeze({...nearest,layers:Object.freeze(layers)});
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
      Math.abs(relative)>FOV/2||col<0||col>=COLUMNS)return null;
   // An ultra-thin facade may lie BETWEEN the 210 diagnostic ray columns.
   // Test the person's true centre line against actual public geometry too,
   // rather than publishing a wall-hidden human silhouette/seat label.
   const direct={x:dx/distance,z:dz/distance};
   let occludedBelowHeight=-Infinity;
   for(const solid of solids){
    const entry=rayBox(subject,direct,solid);
    if(entry>=distance-.2)continue;
    const exit=distance-rayBox(p,{x:-direct.x,z:-direct.z},solid);
    const wallHeight=Number.isFinite(solid.h)?solid.h:2.7;
    // The top projects highest from the near face above eye level, and
    // from the far face below it. This also catches sub-column thin walls.
    const edge=Math.max(.001,wallHeight>=eyeHeight?entry:exit);
    occludedBelowHeight=Math.max(occludedBelowHeight,
      eyeHeight+(wallHeight-eyeHeight)*distance/edge);
   }
   const bodyHeight=p.benchResting?.95:p.crouched?1.22:1.75;
   if(occludedBelowHeight>=bodyHeight)return null;
   // Only server-published, actually visible squadmates carry a local seat
   // label. Never infer a hidden rival's squad, identity or location.
   return Object.freeze({kind:p.kind,id:p.id,col,depth,occludedBelowHeight,
    // Pose is from the authenticated server movement snapshot, not the map.
    facing:Number.isFinite(p.facing)?wrap(p.facing):null,
    moving:p.moving===true,crouched:p.crouched===true,
    benchResting:p.benchResting===true,
    waving:p.waving===true,
    stepOverProgress:Number.isFinite(p.stepOverProgress)&&
      p.stepOverProgress>=0&&p.stepOverProgress<=1?p.stepOverProgress:null,
    slot:p.kind==='squad'&&Number.isInteger(p.slot)&&p.slot>=1&&p.slot<=6?p.slot:null});
  }).filter(Boolean).sort((a,b)=>b.depth-a.depth);
  return Object.freeze({rays:Object.freeze(rays),seen:Object.freeze(seen),
    angle,pitch:clampPitch(pitch),heading:viewHeading(angle),columns:COLUMNS,maxDistance,
    rayCandidateCount:rayCandidates.length,
    eyeHeight});
 }
 function draw(ctx,{width,height,subject,yaw,pitch=0,obstacles,civicGate,handcart,squad,visible,
   visibilityMeters,weather,pavements=[],showLabels=true}={}){
  if(!ctx||!Number.isInteger(width)||!Number.isInteger(height)||
    width<200||height<120||width>8192||height>8192)
   throw new RangeError('invalid_street_view_canvas');
  const model=frame({subject,yaw,pitch,obstacles,civicGate,handcart,squad,visible,visibilityMeters});
  const haze=weather?.code==='sea-haze',gusty=weather?.code==='gusty',
    horizon=height*.52+Math.tan(model.pitch)*height*.68;
  ctx.fillStyle=haze?'#667b7e':gusty?'#6b848b':'#708b92';
  ctx.fillRect(0,0,width,horizon);
  ctx.fillStyle=haze?'#424c4b':gusty?'#414846':'#3d4340';ctx.fillRect(0,horizon,width,height-horizon);
  ctx.fillStyle='#9aa19a';ctx.fillRect(0,horizon-1,width,2);
  // Actual original city plazas and quay pavements are continuous flat ground
  // below existing raycast buildings, never painted OVER an opaque wall.
  const ground=civicGroundPolygons(subject,yaw,pitch,pavements,
    width,height,model.eyeHeight,model.maxDistance);
  for(const patch of ground){
   ctx.fillStyle=patch.canvas;ctx.beginPath();
   for(let i=0;i<patch.points.length;i++){
    const vertex=patch.points[i];
    if(i===0)ctx.moveTo(vertex.x,vertex.y);
    else ctx.lineTo(vertex.x,vertex.y);
   }
   ctx.closePath();ctx.fill();
  }
  const strip=width/model.columns,focal=height*.68;
  for(let i=0;i<model.columns;i++){
   for(const ray of model.rays[i].layers.slice().reverse()){
   const d=Math.max(.3,ray.distance);
   // Project the visible wall relative to a standing/crouching eye plane.
   // A low wall becomes taller on screen when the authenticated body crouches.
   const wallHeight=Math.min(height*4,ray.height*focal/d);
   const baseY=horizon+model.eyeHeight*focal/d,y=baseY-wallHeight;
   // The headlamp brightens only real, already raycast public wall surfaces
   // in the local forward cone; it never grants seeing an unseen rival.
   const lit=subject.headlampOn===true&&d<24&&
     Math.abs((i+.5)/model.columns-.5)<.22;
   ctx.fillStyle=shade(ray.type,d,model.maxDistance,weather?.code,lit,ray.face);
   ctx.fillRect(i*strip,y,strip+1,wallHeight);
   ctx.fillStyle='#405158';ctx.fillRect(i*strip,y,strip+1,Math.max(1,wallHeight*.018));
   }
  }
  for(const person of model.seen){
   const bodyHeight=person.benchResting?0.95:person.crouched?1.22:1.75;
   const size=Math.min(height*2,bodyHeight*focal/person.depth);
   const px=(person.col+.5)*strip;
   const fog=weatherFogFraction(person.depth,model.maxDistance,weather?.code);
   ctx.globalAlpha=1-fog;
   ctx.fillStyle=person.kind==='squad'?'#a2cbdf':'#d4aa99';
   // The server's own 60Hz bench transition supplies a finite rise and
   // landing arc, not a fabricated jump or client-invented actor altitude.
   const lift=person.stepOverProgress===null?0:
      .8*Math.sin(Math.PI*person.stepOverProgress);
   const visibleBottom=Number.isFinite(person.occludedBelowHeight)
     ?horizon+(model.eyeHeight-person.occludedBelowHeight)*focal/person.depth:Infinity;
   const bodyRect=(x,y,w,h)=>{
    const clipped=Math.min(y+h,visibleBottom)-y;
    if(clipped>0)ctx.fillRect(x,y,w,clipped);
   };
   const feetY=horizon+(model.eyeHeight-lift)*focal/person.depth;
   // Body shape is read-only; moving into a wall cannot rotate the server pose.
   const broadness=person.facing===null?.32:
     .23+.10*Math.abs(Math.cos(person.facing-model.angle));
   bodyRect(px-size*broadness/2,feetY-size*.78,size*broadness,size*.59);
   bodyRect(px-size*.10,feetY-size,size*.20,size*.20);
   if(person.waving){
    // Deliberate human-scale arm movement without a bright floating icon.
    // The server owns the finite pose; FOV and wall ray masking remain intact.
    bodyRect(px+size*.15,feetY-size*.90,size*.085,size*.42);
    bodyRect(px+size*.15,feetY-size*1.10,size*.085,size*.25);
   }
   if(person.benchResting){
    // Bend both feet beside the already-authoritative public bench; visual
    // comfort never moves the physical capsule inside solid furniture.
    bodyRect(px-size*.23,feetY-size*.15,size*.18,size*.15);
    bodyRect(px+size*.05,feetY-size*.15,size*.18,size*.15);
   }else if(person.moving){
    bodyRect(px-size*.13,feetY-size*.19,size*.09,size*.19);
    bodyRect(px+size*.04,feetY-size*.28,size*.09,size*.28);
   }else bodyRect(px-size*.11,feetY-size*.19,size*.22,size*.19);
   ctx.globalAlpha=1;
   if(person.kind==='squad'&&person.slot!==null){
    ctx.fillStyle='#dff4eb';ctx.font='11px system-ui';
    ctx.fillText('아군 '+person.slot+' · '+Math.round(person.depth)+'m',
      Math.max(3,px-size*.6),Math.max(14,feetY-size-5));
   }
  }
  ctx.strokeStyle='#d6e9e2';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(width/2-8,height*.52);ctx.lineTo(width/2+8,height*.52);
  ctx.moveTo(width/2,height*.52-8);ctx.lineTo(width/2,height*.52+8);ctx.stroke();
  // The embedded PC screen already has controls and instructions around
  // this canvas. Avoid painting duplicate diagnostics beneath those buttons.
  if(showLabels){
  ctx.fillStyle='#f1f5ed';ctx.font='14px system-ui';
  ctx.fillText('LOCAL STREET VIEW · SERVER SNAPSHOT ONLY',14,25);
  ctx.font='12px system-ui';
  ctx.fillText('화면 클릭: 마우스 상하좌우 시야 · WASD: 시야 기준 이동 · Esc: 포인터 해제',14,47);
  ctx.fillText('자세: '+(subject.benchResting===true?'벤치에서 휴식':
    subject.crouched===true?'낮은 자세':'보통')+' · 관찰 높이 '+model.eyeHeight.toFixed(2)+'m',14,91);
  ctx.fillText(width<440?'시야 방향 '+model.heading.cardinal:
    '가상 지도 방향 '+model.heading.cardinal+' · '+model.heading.degrees+'°',14,69);
  }
  return model;
 }
 return Object.freeze({FOV,MAX_DISTANCE,COLUMNS,EYE_STANDING,EYE_CROUCH,EYE_SEATED,MAX_PITCH,
  civicGroundPolygons,visibleRaySolids,clampPitch,wrap,viewHeading,relativeMovement,weatherFogFraction,shade,rayBox,wallFace,frame,draw});
});
