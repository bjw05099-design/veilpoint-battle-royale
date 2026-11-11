/* VEILPOINT browser renderer: dependency-free WebGL2, procedural world meshes,
 * filmic tone mapping, atmospheric distance, dynamic characters and ring.
 * Quality ceiling is a technical prototype, not equivalent to Unreal Engine 5.
 */
(function(global){
'use strict';
const V3=(x,y,z)=>[x,y,z];
const Visibility=global.VeilpointVisibility;
const PublicFootpaths=global.VeilpointPublicFootpaths;
const HallLights=global.VeilpointHallLights;
const StoryCourt=global.VeilpointStoryPublicCourt;
// Three fictional, human-scale civic ceilings enrich the SAME walkable
// neighborhoods in BR and CH01. Roofs are ABOVE the walking capsule: they
// never create collision blocks, require new saves or reproduce a real site.
// One authored array drives both WebGL and the Canvas fallback.
const SHARED_PUBLIC_CANOPIES=Object.freeze([
 Object.freeze({x:28,z:147,w:22,d:17,roofY:3.58,h:.16,
   type:'shared-public-canopy',color:Object.freeze([.64,.52,.38]),canvas:'#b39b79'}),
 Object.freeze({x:-107,z:128,w:26,d:23,roofY:3.60,h:.15,
   type:'shared-public-canopy',color:Object.freeze([.47,.45,.41]),canvas:'#928a78'}),
 Object.freeze({x:134,z:125,w:29,d:20,roofY:3.30,h:.15,
   type:'shared-public-canopy',color:Object.freeze([.49,.53,.49]),canvas:'#99aa9e'})
]);
// Keep the three original public canopies unchanged: legacy contracts and
// test scenes depend on their identities. New craft roofs have a separate
// generated collection, loaded only on the current revision-1 city.
const CRAFT_PUBLIC_CANOPIES=Object.freeze([
 // Craft hall has two independent roofed rooms, with an open-air central
 // walking aisle. A third shade cloth belongs to the adjoining forecourt.
 Object.freeze({x:-75,z:35,w:9,d:26,roofY:3.65,h:.16,
   type:'shared-public-canopy',color:Object.freeze([.65,.56,.44]),canvas:'#ad9576'}),
 Object.freeze({x:-51,z:35,w:9,d:26,roofY:3.65,h:.16,
   type:'shared-public-canopy',color:Object.freeze([.54,.58,.53]),canvas:'#98a092'}),
 Object.freeze({x:-63,z:60.5,w:28,d:7,roofY:3.27,h:.15,
   type:'shared-public-canopy',color:Object.freeze([.62,.52,.39]),canvas:'#b09a76'})
]);
// A second pair of original walk-in public shop roofs: the entire ten-metre
// middle street remains open to sky and on-foot navigation. Neither mesh
// creates an extra solid world-body or changes the three legacy civic roofs.
const MARKET_LANE_ROOFS=Object.freeze([
 Object.freeze({x:-45.5,z:105,w:10,d:16,roofY:3.53,h:.16,
   type:'shared-public-canopy',color:Object.freeze([.61,.49,.38]),canvas:'#a89478'}),
 Object.freeze({x:-24.5,z:105,w:10,d:16,roofY:3.53,h:.16,
   type:'shared-public-canopy',color:Object.freeze([.53,.55,.47]),canvas:'#929883'})
]);
// Crater-inspired public rain court. Lintelled roofs only cover the SIDE
// terraces; an unobstructed 8m-wide north/south pedestrian axis is open to sky.
const RAINCOURT_CANOPIES=Object.freeze([
 Object.freeze({x:-130,z:50,w:10,d:20,roofY:3.74,h:.15,
  type:'shared-public-canopy',color:Object.freeze([.56,.48,.38]),canvas:'#998672'}),
 Object.freeze({x:-110,z:50,w:10,d:20,roofY:3.74,h:.15,
  type:'shared-public-canopy',color:Object.freeze([.61,.55,.45]),canvas:'#a79a80'})
]);
const rand=(seed)=>{let x=seed|0;return()=>{x=(Math.imul(x,1664525)+1013904223)|0;return(x>>>0)/4294967296;};};
// Visible actor orientation is sourced only from an actually rendered 60Hz
// opponent, never from an invisible opponent/radar or inferred client target.
function actorFacing(actor) {
 const yaw=Number.isFinite(actor?.angle)?Math.atan2(Math.sin(actor.angle),Math.cos(actor.angle)):0;
 const x=actor?.x||0,z=actor?.z||0,c=Math.cos(yaw),s=Math.sin(yaw);
 const place=(dx,dz)=>({x:x+dx*c-dz*s,z:z+dx*s+dz*c});
 return {yaw,left:place(-.18,0),right:place(.18,0),front:place(0,-.28)};
}
const safeNorm=(a)=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
// A physical warning lamp blinks gently at ~0.63 Hz while powered.
// Timing comes from saved 60Hz CH01 world elapsed time, so pause, restore,
// WebGL and Canvas agree. This is a fixture only, not an enemy locator.
function beaconLightLevel(state){
 if(!state||state.scene!=='nahrin'||state.relayRestored!==true||
    state.beaconEnabled!==true||!Number.isFinite(state.elapsed))return 0;
 return state.elapsed%1.6<.9?1:0;
}
function civicStreetLampLevel(state){
 return state?.scene==='nahrin'&&state.publicStreetPowered===true?1:0;
}
// A small original street-front transition, located ON an existing solid
// fictional harbor facade (east building x34..50, northern wall z=-28).
// The open shop frontage becomes a lowered shutter after the actual witnessed
// CH01 event. It NEVER creates ghost collision, an enterable fake doorway, a
// document objective or an unearned second event. The same visible geometry
// is consumed by both WebGL and the 2D software fallback, including on restore.
function storyStreetFrontage(state){
 if(!state||state.scene!=='nahrin')return Object.freeze([]);
 const changed=Array.isArray(state.obstacles)&&state.obstacles.some(o=>
   o.routeId==='story-fallen-awning');
 const frontage=[
  {x:39.4,y:2.52,z:-27.78,w:4.6,h:.22,d:.09,
   color:changed?[.28,.29,.29]:[.75,.63,.43],
   canvas:changed?'#52534e':'#cfac75'},
  {x:39.4,y:.08,z:-27.73,w:3.72,h:changed?2.44:1.95,d:.075,
   color:changed?[.34,.36,.37]:[.19,.33,.34],
   canvas:changed?'#676c6d':'#406467'}
 ];
 // The roll in the ordinary scene is raised above the viewing window;
 // after escalation, the same solid building wall is visibly shuttered.
 if(!changed){
  frontage[1].y=.37;
  frontage.push({x:39.4,y:2.36,z:-27.66,w:4.0,h:.16,d:.095,
   color:[.82,.63,.33],canvas:'#c69a56'});
 }else{
  frontage.push({x:39.4,y:1.04,z:-27.62,w:3.7,h:.065,d:.09,
   color:[.28,.30,.31],canvas:'#52595b'});
  frontage.push({x:39.4,y:1.75,z:-27.62,w:3.7,h:.065,d:.09,
   color:[.28,.30,.31],canvas:'#52595b'});
 }
 return Object.freeze(frontage.map(part=>Object.freeze(part)));
}
function m4Perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),a=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*a,-1,0,0,2*far*near*a,0]);}
function m4LookAt(e,c,up){let z=safeNorm([e[0]-c[0],e[1]-c[1],e[2]-c[2]]),x=safeNorm([up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]]),y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1]);}
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
// Fixed winding of the six faces, shared by every static and dynamic box.
const BOX_FACES=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
class Mesh {
 constructor(){this.data=[];this.buffer=null;this.capacityBytes=0;this.count=0;this.cpuBuffer=null;this.faceColor=[0,0,0];}
 vertex(p,n,c){this.data.push(...p,...n,...c);}
 tri(a,b,c,color){
  // A dynamic box calls this twelve times per frame. Avoid allocating three
  // transient vectors and invoking vertex() three times for every triangle.
  // Preserve the exact cross-product winding, normal and interleaved layout.
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
  const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const magnitude=Math.hypot(nx,ny,nz)||1;
  nx/=magnitude;ny/=magnitude;nz/=magnitude;
  const r=color[0],g=color[1],bl=color[2];
  this.data.push(
   a[0],a[1],a[2],nx,ny,nz,r,g,bl,
   b[0],b[1],b[2],nx,ny,nz,r,g,bl,
   c[0],c[1],c[2],nx,ny,nz,r,g,bl
  );
 }
 quad(a,b,c,d,color){this.tri(a,b,c,color);this.tri(a,c,d,color);}
 box(x,y,z,w,h,d,col){
  const X=x-w/2,Y=y,Z=z-d/2,W=x+w/2,H=y+h,D=z+d/2;
  const p=[V3(X,Y,Z),V3(W,Y,Z),V3(W,H,Z),V3(X,H,Z),V3(X,Y,D),V3(W,Y,D),V3(W,H,D),V3(X,H,D)];
  // Face topology is identical for every prop; the tint scratch is consumed
  // synchronously by tri() and never retained in vertex data.
  const tinted=this.faceColor;
  for(let i=0;i<6;i++){
   const [a,b,c,d]=BOX_FACES[i],tint=i===4?1.06:i===5?0.72:i===0?0.81:i===2?0.7:1;
   tinted[0]=col[0]*tint;tinted[1]=col[1]*tint;tinted[2]=col[2]*tint;
   this.quad(p[a],p[b],p[c],p[d],tinted);
  }
 }
 // All visible corners share the physical vehicle heading. The ordinary
 // AABB Mesh.box remains unchanged for every other scene object.
 boxYaw(x,y,z,w,h,d,yaw,col){
  const c=Math.cos(yaw),sn=Math.sin(yaw);
  const v=(dx,dy,dz)=>V3(x+dx*c-dz*sn,y+dy,z+dx*sn+dz*c);
  const p=[v(-w/2,0,-d/2),v(w/2,0,-d/2),
    v(w/2,h,-d/2),v(-w/2,h,-d/2),
    v(-w/2,0,d/2),v(w/2,0,d/2),
    v(w/2,h,d/2),v(-w/2,h,d/2)];
  const tinted=this.faceColor;
  for(let i=0;i<6;i++){
   const [a,b,c,d]=BOX_FACES[i],tint=i===4?1.06:i===5?.72:i===0?.81:i===2?.7:1;
   tinted[0]=col[0]*tint;tinted[1]=col[1]*tint;tinted[2]=col[2]*tint;
   this.quad(p[a],p[b],p[c],p[d],tinted);
  }
 }
 // Vertical low-poly plant silhouette, dark at the roots and glossy on leaves.
 tree(x,z,h,green){const r=h*0.13;this.box(x,0,z,r*0.9,h*0.45,r*0.9,[0.17,0.16,0.12]);for(let n=0;n<3;n++){const hh=h*(0.37+n*0.21),rr=h*(0.19-n*0.045);this.cone(x,hh*0.15,z,rr,hh,7,green.map(c=>c*(0.95+n*0.05)));}}
 cone(x,y,z,r,h,s,col){for(let i=0;i<s;i++){const a=i/s*Math.PI*2,b=(i+1)/s*Math.PI*2;this.tri([x+r*Math.cos(a),y,z+r*Math.sin(a)],[x+r*Math.cos(b),y,z+r*Math.sin(b)],[x,y+h,z],col);}}
 upload(gl,usage=gl.STATIC_DRAW){
  if(!this.buffer)this.buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  // Dynamic geometry changes every rendered frame. Reuse the CPU staging
  // allocation instead of allocating a large Float32Array on every draw.
  // WebGL2's srcOffset/length overload uploads only the populated prefix.
  const floats=this.data.length,usedBytes=floats*Float32Array.BYTES_PER_ELEMENT;
  let vertices;
  if(usage===gl.DYNAMIC_DRAW){
   if(!this.cpuBuffer||this.cpuBuffer.length<floats)
    this.cpuBuffer=new Float32Array(Math.max(256,2**Math.ceil(Math.log2(Math.max(1,floats)))));
   this.cpuBuffer.set(this.data);
   vertices=this.cpuBuffer;
  }else vertices=new Float32Array(this.data);
  if(usedBytes>this.capacityBytes){
   this.capacityBytes=Math.max(1024,2**Math.ceil(Math.log2(usedBytes)));
   gl.bufferData(gl.ARRAY_BUFFER,this.capacityBytes,usage);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices,0,floats);
  this.count=floats/9;
 }
 bind(gl,p){if(!this.buffer)return false;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.vertexAttribPointer(p.pos,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(p.normal,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(p.color,3,gl.FLOAT,false,36,24);return true;}
 draw(gl,p){if(this.bind(gl,p))gl.drawArrays(gl.TRIANGLES,0,this.count);}
}
// Reorder complete interleaved triangles into contiguous spatial ranges inside
// one static GPU buffer. Full vertex bounds prevent long walls from disappearing.
function partitionStaticTriangles(data,cell=56){
 if(!Array.isArray(data)||data.length%27!==0||!Number.isFinite(cell)||cell<=0)
  throw new RangeError('Invalid static mesh');
 const buckets=new Map();
 for(let i=0;i<data.length;i+=27){
  const cx=(data[i]+data[i+9]+data[i+18])/3;
  const cz=(data[i+2]+data[i+11]+data[i+20])/3;
  const key=Math.floor(cx/cell)+','+Math.floor(cz/cell);
  let bucket=buckets.get(key);
  if(!bucket){bucket={data:[],minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};buckets.set(key,bucket);}
  for(let v=0;v<27;v++)bucket.data.push(data[i+v]);
  for(const v of [i,i+9,i+18]){
   const x=data[v],z=data[v+2];
   bucket.minX=Math.min(bucket.minX,x);bucket.maxX=Math.max(bucket.maxX,x);
   bucket.minZ=Math.min(bucket.minZ,z);bucket.maxZ=Math.max(bucket.maxZ,z);
  }
 }
 const packed=[],chunks=[];
 for(const bucket of buckets.values()){
  const first=packed.length/9;
  for(const value of bucket.data)packed.push(value);
  const x=(bucket.minX+bucket.maxX)/2,z=(bucket.minZ+bucket.maxZ)/2;
  chunks.push({first,count:bucket.data.length/9,x,z,
   radius:Math.hypot(bucket.maxX-x,bucket.maxZ-z)+1});
 }
 return {packed,chunks};
}
// Ocean haze varies slowly with actual simulation time, not shrinking safe
// zones or scored points. This is cosmetic only: no visibility, collision
// or gameplay rules read this density.
function atmosphereDensity(state){
 if(state&&state.scene==='nahrin')return .009;
 // When a 96-human server-controlled weather snapshot is available, the
 // existing WebGL fog shader AND Canvas fallback depict the same sea haze.
 // Server visibility remains authoritative; a renderer cannot alter range,
 // player position or wall occlusion. Default offline BR haze is unchanged.
 const coastal=state&&state.coastalWeather;
 if(coastal&&typeof coastal==='object'){
  const target=coastal.code==='sea-haze'?.035:
    coastal.code==='gusty'?.021:
    coastal.code==='clearing'?.009:
    coastal.code==='clear'?.009:null;
  if(target!==null){
   // A new 60Hz server weather stage is gradual, rather than one frame
   // abruptly increasing the rendered fog density. The shader and Canvas
   // fallback both read this exact interpolated value. Older offline
   // snapshots without a transition retain their previous visual contract.
   const previous=coastal.code==='sea-haze'?.009:
     coastal.code==='gusty'?.035:
     coastal.code==='clearing'?.021:.009;
   const progress=coastal.transitionProgress;
   if(Number.isFinite(progress)&&progress>=0&&progress<=1)
    return previous+(target-previous)*progress;
   return coastal.code==='clearing'?.013:target;
  }
 }
 const elapsed=state&&state.elapsed;
 return Number.isFinite(elapsed)&&elapsed>=0
  ? (state.lighting==='dusk'?.012:.009)+.0011*(1-Math.cos(elapsed/36))/2:.009;
}
const VS=`#version 300 es
precision highp float;
in vec3 aPosition,inNormal,inColor;
uniform mat4 uView,uProjection;
out vec3 vNormal,vColor,vWorld;
out float vDistance;
void main(){vNormal=inNormal;vColor=inColor;vWorld=aPosition;vec4 pos=uView*vec4(aPosition,1.);vDistance=length(pos.xyz);gl_Position=uProjection*pos;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vNormal,vColor,vWorld;
in float vDistance;
uniform vec3 uSun,uFog;
uniform float uExposure,uTime,uEffects,uNight,uRelayOn,uCivicOn,uBeaconOn,uHallOn,uFlashOn,uFogDensity;
uniform vec3 uFlashEye,uFlashDir;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 N=normalize(vNormal),L=normalize(uSun);float lambert=max(dot(N,L),0.);float sky=clamp(N.y*.5+.5,0.,1.);
vec3 diffuse=vColor*mix(.18+.47*sky+.68*lambert,.12+.14*sky+.10*lambert,uNight);
float highlight=pow(max(dot(reflect(-L,N),vec3(0.,.72, .69)),0.),26.);
diffuse+=vec3(1.,.87,.63)*highlight*mix(.10,.025,uNight);
// Two occupied public street lamps were working at arrival. The sudden
// local blackout changes the SAME visible world the captain just walked.
// The emergency relay restores a separate pair of lamps, not grid power.
// Finite pools of warm light are a visual change, never enemy detection.
if(uNight>.5&&uCivicOn>.5){
 vec3 streetLamps[2]=vec3[2](vec3(-7.,3.4,-18.),vec3(7.,3.4,-18.));
 for(int i=0;i<2;i++){
  vec3 offset=streetLamps[i]-vWorld;
  float d=length(offset);
  float facing=max(dot(N,normalize(offset)),0.);
  diffuse+=vColor*vec3(1.,.79,.51)*facing*1.55/(1.+.07*d*d);
 }
}
// Two original, fixed wall luminaires illuminate the harbor only after the
// player physically restores the civilian relay. Inverse-square-like falloff,
// surface-facing response and bounded range prevent an omnipresent glow.
if(uNight>.5&&uRelayOn>.5){
 vec3 lamps[2]=vec3[2](vec3(-42.,3.2,-27.82),vec3(42.,3.2,-27.82));
 for(int i=0;i<2;i++){
  vec3 delta=lamps[i]-vWorld;
  float distanceToLamp=length(delta);
  float attenuation=1./(1.+.035*distanceToLamp*distanceToLamp);
  diffuse+=vColor*vec3(1.,.74,.43)*max(dot(N,normalize(delta)),0.)*2.*attenuation;
 }
}
// Four wall-mounted lights illuminate only the physical civilian hall after
// the player restores this particular local low-voltage circuit. The shader
// has no shadow map: bound the contribution to the existing interior walls.
if(uNight>.5&&uHallOn>.5){
 vec3 hallLamps[4]=vec3[4](
  vec3(20.34,2.76,30.5),vec3(20.34,2.76,38.4),
  vec3(35.66,2.76,30.5),vec3(35.66,2.76,38.4));
 for(int i=0;i<4;i++){
  vec3 delta=hallLamps[i]-vWorld;
  float d=length(delta);
  float room=step(21.,vWorld.x)*step(vWorld.x,35.)*
   step(26.,vWorld.z)*step(vWorld.z,42.);
  diffuse+=vColor*vec3(1.,.84,.63)*max(dot(N,normalize(delta)),0.)*
   (1.25/(1.+.16*d*d))*room;
 }
}
// A manually enabled, facade-mounted warning light has a small local pool
// of warm illumination. It cannot activate without restored relay power.
if(uNight>.5&&uBeaconOn>.5){
 vec3 delta=vec3(-42.,4.1,-27.82)-vWorld;
 float distanceToBeacon=length(delta);
 diffuse+=vColor*vec3(1.,.55,.16)*max(dot(N,normalize(delta)),0.)*1.1/
  (1.+.16*distanceToBeacon*distanceToBeacon);
}
// Player-carried finite-battery headlamp: camera-facing cone on visible surfaces.
// Prototype forward shading does not yet cast occlusion shadows.
if(uFlashOn>.5){
 vec3 beamVec=vWorld-uFlashEye;
 float beamDistance=length(beamVec);
 if(beamDistance>.05&&beamDistance<18.){
  vec3 beamDir=beamVec/beamDistance;
  float cone=smoothstep(.88,.96,dot(beamDir,normalize(uFlashDir)));
  float facing=max(dot(N,-beamDir),0.);
  float falloff=1./(1.+.035*beamDistance*beamDistance);
  diffuse+=vColor*vec3(1.,.94,.78)*cone*facing*2.4*falloff;
 }
}
float grain=(hash(gl_FragCoord.xy+uTime*23.)-.5)*.035*uEffects;
diffuse+=grain;
float fogFactor=1.-exp(-pow(vDistance*uFogDensity,1.7));
// Regional scenery lies outside the +/-175m playable map. In clear
// weather, avoid erasing the distinctive volcano/bay silhouette with 97%
// fog. Real opponents/interactive buildings remain fully fogged and subject
// to the existing authoritative visibility planner. During sea haze this
// special case is disabled so weather stays visually meaningful.
float distantScenery=step(175.5,max(abs(vWorld.x),abs(vWorld.z)));
float clearAir=1.-step(.014,uFogDensity);
fogFactor=mix(fogFactor,min(fogFactor,.74),distantScenery*clearAir);
vec3 linear=mix(diffuse,uFog,clamp(fogFactor,0.,.97));
vec3 graded=aces(linear*uExposure);
graded=pow(graded,vec3(.96));
outColor=vec4(graded,1.);}`;
// Canvas2D software fallback: slow but playable on devices without GPU WebGL2.
class SoftwareRenderer {
 constructor(canvas){this.canvas=canvas;this.verticalFov=55;this.ctx=canvas.getContext('2d');this.random=rand(5101);this.plants=Array.from({length:150},()=>({x:(this.random()-.5)*325,z:(this.random()-.5)*325,h:3+this.random()*5}));}
 resize(){const c=this.canvas;const ratio=this.adaptiveScale||(this.quality?this.quality.resolutionScale:1);const w=Math.max(1,Math.floor(c.clientWidth*ratio)),h=Math.max(1,Math.floor(c.clientHeight*ratio));if(c.width!==w||c.height!==h){c.width=w;c.height=h;}return {w,h};}
 draw(state){const {w,h}=this.resize(),ctx=this.ctx,p=state.player;
 const plan=Visibility.planVisible(state,w/Math.max(h,1),this.verticalFov*Math.PI/180);this.lastVisibilityStats=plan.stats;
 const beaconLit=beaconLightLevel(state)>0.5;
 const horizon=h*(.51+Math.tan(p.pitch)*.5);const sky=ctx.createLinearGradient(0,0,0,horizon);const harborNight=state.scene==='nahrin';const dusk=!harborNight&&state.lighting==='dusk';
 sky.addColorStop(0,harborNight?'#192a35':dusk?'#46505e':'#536b70');
 sky.addColorStop(.65,harborNight?'#3b4b52':dusk?'#776b70':'#89948a');
 sky.addColorStop(1,harborNight?'#6a6a63':dusk?'#c39d83':'#ddd0ad');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 const ground=ctx.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,harborNight?'#343c3d':dusk?'#495253':'#5b6551');
 ground.addColorStop(1,harborNight?'#1e292c':dusk?'#2b343c':'#2d3b31');ctx.fillStyle=ground;ctx.fillRect(0,horizon,w,h);
 const focal=Math.min(w,h)*.98*Math.tan(55*Math.PI/360)/
   Math.tan(this.verticalFov*Math.PI/360),yaw=p.yaw,sin=Math.sin(yaw),cos=Math.cos(yaw);
 const eyeHeight=1.64-(global.VeilpointInput&&global.VeilpointInput.crouch?.55:0);
 const proj=(x,y,z)=>{const dx=x-p.x,dz=z-p.z,a=dx*cos+dz*sin,b=dx*sin-dz*cos,yy=y-eyeHeight,up=yy*Math.cos(p.pitch)-b*Math.sin(p.pitch),depth=b*Math.cos(p.pitch)+yy*Math.sin(p.pitch);if(depth<.3)return null;return [w*.5+a*focal/depth,h*.5-up*focal/depth,depth];};
 const polygon=(pts,color)=>{if(pts.some(x=>!x))return;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();};
 // Every point of this public footpath comes from collision-checked walkable
 // geometry. Only draw the surface; no new invisible collider or mission gate.
 if((state.terrainRevision===1||harborNight)&&PublicFootpaths){
  if(this.footpathWorld!==state.obstacles){
   this.footpathWorld=state.obstacles;
   this.footpaths=PublicFootpaths.planAll(state.obstacles);
   this.localFootpaths=PublicFootpaths.planLocalPaths(state.obstacles);
  }
  for(const road of [...(this.footpaths||[]),...(this.localFootpaths||[])])
   for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i];
   const length=Math.hypot(b.x-a.x,b.z-a.z);
   if(length<.1)continue;
   const px=-(b.z-a.z)/length*PublicFootpaths.WIDTH*.5,
     pz=(b.x-a.x)/length*PublicFootpaths.WIDTH*.5;
   polygon([proj(a.x-px,.07,a.z-pz),proj(a.x+px,.07,a.z+pz),
     proj(b.x+px,.07,b.z+pz),proj(b.x-px,.07,b.z-pz)],
     harborNight?'#545249':'#898474');
  }
 }
 // Distant regional geography is drawn behind gameplay objects. Canvas
 // uses the same mountain profiles and western bay as WebGL, without relying
 // on an online panoramic image or revealing nonvisible competitors.
 if(state.terrainRevision===1||harborNight){
  const vista=global.VeilpointSim.ADEN_GEOGRAPHIC_VISTA,sea=vista.ocean,
   left=sea.x-sea.w/2,right=sea.x+sea.w/2,
   bottom=sea.z-sea.d/2,top=sea.z+sea.d/2;
  // Coarse scenic tessellation avoids requiring all four huge ocean-plane
  // corners to fall in front of the camera at once.
  for(let x=left;x<right;x+=65)for(let z=bottom;z<top;z+=65)
   polygon([proj(x,sea.y,z),proj(Math.min(right,x+65),sea.y,z),
     proj(Math.min(right,x+65),sea.y,Math.min(top,z+65)),
     proj(x,sea.y,Math.min(top,z+65))],'#345b66');
  for(const ridge of [...vista.ridges].sort((a,b)=>b.z-a.z))
   for(let i=1;i<ridge.peaks.length;i++){
    const a=ridge.peaks[i-1],b=ridge.peaks[i];
    polygon([proj(a.x,-.08,ridge.baseZ),proj(b.x,-.08,ridge.baseZ),
      proj(b.x,b.h,ridge.z),proj(a.x,a.h,ridge.z)],ridge.canvas);
   }
 }
 const objects=[];
 if(state.terrainRevision===1||harborNight)
  for(const home of global.VeilpointSim.ADEN_GEOGRAPHIC_VISTA.buildings)
   objects.push({...home,type:'aden-vista-building'});
 // The low quay apron shows shallow waves only during the same phase that
 // affects actual traction in the offline BR fixed-step movement model.
 if(state.scene!=='nahrin'&&global.VeilpointSim.harborWaveWash(state.elapsed).active){
  const pad=global.VeilpointSim.WET_LOADING_PAD;
  objects.push({x:pad.x,z:pad.z,w:pad.width,d:pad.depth,h:.09,type:'harbor-wash'});
 }
 // After the witnessed CH01 city disruption, the damaged public drain leaves
 // a shallow visible street patch. Its exact rectangle also controls 60Hz
 // footing; unlike a solid wall, it cannot block a route or strand old saves.
 if(harborNight&&state.streetFlood){
  const wet=state.streetFlood,hw=wet.w/2,hd=wet.d/2;
  polygon([proj(wet.x-hw,.025,wet.z-hd),proj(wet.x+hw,.025,wet.z-hd),
   proj(wet.x+hw,.025,wet.z+hd),proj(wet.x-hw,.025,wet.z+hd)],
   wet.cleared?'#596966':'#426d74');
  // True 60Hz repair progress remains local to the visible drain, not
  // a mission waypoint or magical instant-dry surface.
  if(wet.repairProgress>0){
   const f=Math.max(0,Math.min(1,wet.repairProgress));
   polygon([proj(-12,.06,-17.4),proj(-12+2.3*f,.06,-17.4),
    proj(-12+2.3*f,.06,-17.15),proj(-12,.06,-17.15)],'#d6c28b');
  }
  // This code was independently merged as PR #787. Preserve its visible
  // metal grate and locally earned leaf clearing across this map/lighting rebase.
  for(const d of global.VeilpointStreetFlood?.details?.(wet)||[]){
   const y=d.y+d.h;
   polygon([proj(d.x-d.w/2,y,d.z-d.d/2),proj(d.x+d.w/2,y,d.z-d.d/2),
    proj(d.x+d.w/2,y,d.z+d.d/2),proj(d.x-d.w/2,y,d.z+d.d/2)],d.canvas);
  }
 }
 // Four public ground-level district surfaces are original walkable
 // street dressing. They use the SAME authored coordinates as the
 // 60Hz collision world, but introduce zero new invisible colliders.
 if(state.terrainRevision===1||harborNight){
  for(const pavement of global.VeilpointSim.PUBLIC_CITY_PAVEMENTS){
   if(Math.hypot(p.x-pavement.x,p.z-pavement.z)>100)continue;
   const x=pavement.x,z=pavement.z,ww=pavement.w/2,dd=pavement.d/2;
   polygon([proj(x-ww,.08,z-dd),proj(x+ww,.08,z-dd),
     proj(x+ww,.08,z+dd),proj(x-ww,.08,z+dd)],pavement.canvas);
  }
 }
 // Fictional crafts hall: muted stone paving connects the open southern
 // entrance, both physical side rooms and the open-air northern public yard.
 // Canvas and WebGL use the same ground footprints; no extra collisions.
 if(state.terrainRevision===1||harborNight){
  for(const floor of [
   {x:-63,z:36,w:31.6,d:27.8,color:'#857967'},
   {x:-63,z:60.6,w:27,d:9,color:'#9a8970'},
   {x:-34.9,z:107,w:33,d:23,color:'#8b816c'},
   {x:-120,z:50,w:31,d:27,color:'#a2927c'}
  ]){
   const hw=floor.w/2,hd=floor.d/2;
   polygon([proj(floor.x-hw,.09,floor.z-hd),
     proj(floor.x+hw,.09,floor.z-hd),
     proj(floor.x+hw,.09,floor.z+hd),
     proj(floor.x-hw,.09,floor.z+hd)],floor.color);
  }
 }
 // Story-first public court: ground markings are non-solid, while eight
 // original columns/benches/shelves come from real 60Hz story obstacles.
 // This is a LOCAL fictional plaza, not the historical Aden street plan.
 if(harborNight&&StoryCourt&&
    state.obstacles.some(o=>o.id==='public-court-west-north-column')){
  const f=StoryCourt.FLOOR,m=StoryCourt.CENTRE_MARK;
  polygon([proj(f.x-f.w/2,.04,f.z-f.d/2),proj(f.x+f.w/2,.04,f.z-f.d/2),
   proj(f.x+f.w/2,.04,f.z+f.d/2),proj(f.x-f.w/2,.04,f.z+f.d/2)],'#8b806c');
  polygon([proj(m.x-m.w/2,.065,m.z-m.d/2),
   proj(m.x+m.w/2,.065,m.z-m.d/2),
   proj(m.x+m.w/2,.065,m.z+m.d/2),
   proj(m.x-m.w/2,.065,m.z+m.d/2)],'#b0a184');
 }
 // Hall light pools share the saved physical circuit with WebGL and are
 // painted on the real interior floor, not through surrounding facade walls.
 if(HallLights?.level(state)>0){
  for(const f of HallLights.FIXTURES){
   const x=f.x<28?22.25:33.75,z=f.z,hw=1.15,hd=1.10;
   polygon([proj(x-hw,.09,z-hd),proj(x+hw,.09,z-hd),
    proj(x+hw,.09,z+hd),proj(x-hw,.09,z+hd)],'#766d54');
  }
 }
 // The software renderer shows the same two finite civic light pools as
 // WebGL before the witnessed outage. The ground remains walkable and its
 // physical colliders are unchanged when the lamps fail.
 if(civicStreetLampLevel(state)>0){
  for(const x of [-7,7]){
   polygon([proj(x-2,.085,-20),proj(x+2,.085,-20),
    proj(x+2,.085,-16),proj(x-2,.085,-16)],'#82724b');
  }
 }
 for(const o of state.obstacles){
  // Driver camera occupies the vehicle cabin; no duplicate opaque box
  // should obscure the actual road during first-person travel.
  if(o.routeId==='br-yard-shuttle'&&state.vehicle?.driver)continue;
  objects.push({x:o.x,z:o.z,h:o.h,w:o.w,d:o.d,
   type:o.type==='yard-service-vehicle'?'yard-service-vehicle':
     o.type.startsWith('aden-laneshop-')?o.type:
     o.type.startsWith('aden-raincourt-')?o.type:
     o.type.startsWith('aden-craft-')?o.type:
     o.type.startsWith('aden-ferry-hall-')?o.type:
     o.type.startsWith('aden-seafront-market-')?o.type:
     o.type.startsWith('aden-transit-court-')?o.type:
     o.type.startsWith('aden-fishhall-')?o.type:
     o.type==='aden-shade-post'||o.type==='aden-shade-seat'?o.type:
     o.type==='dock-handcart'?'dock-handcart':
     o.type==='story-civil-transport'?'story-civil-transport':
     o.type==='story-building'?'story-building':
     o.type==='story-warehouse'?'story-warehouse':
     o.type==='story-office-wall'?'story-office-wall':
     o.type==='story-office-desk'?'story-office-desk':
     o.type==='story-public-hall-wall'?'story-public-hall-wall':
     o.type==='story-public-hall-counter'?'story-public-hall-counter':
     o.type==='story-public-hall-seat'?'story-public-hall-seat':
     o.type.startsWith('story-public-court-')?o.type:
     o.type==='story-fallen-awning'?'story-fallen-awning':
     o.type==='story-water-kiosk'?'story-water-kiosk':
     o.type==='story-drydock-hull'?'story-drydock-hull':
     o.type==='story-rescue-locker'?'story-rescue-locker':
     o.type==='volcanic-outcrop'?'volcanic-outcrop':
     o.type==='story-desk'?'report-desk':o.type==='yard-gate'?'yard-gate':
     o.type==='yard-fence'?'yard-fence':'building'});
 }
 if(harborNight&&StoryCourt&&
    state.obstacles.some(o=>o.id==='public-court-west-north-column')){
  const roof=StoryCourt.CANOPY;
  objects.push({x:roof.x,z:roof.z,w:roof.w,d:roof.d,
    h:roof.h,roofY:roof.y-roof.h/2,type:'shared-public-canopy',
    canvas:'#9b8b6c'});
 }
 if(!harborNight){
  // The roof is an elevated surface, not a fictitious ground-level cube.
  const hut=global.VeilpointSim.INSPECTION_SHELTER;
  objects.push({x:hut.x,z:hut.z,h:.2,w:hut.width,d:hut.depth,
    roofY:hut.roofHeight,type:'dock-inspection-roof'});
  const pad=global.VeilpointSim.WET_LOADING_PAD;
  objects.push({x:pad.x,z:pad.z,h:.035,w:pad.width,d:pad.depth,type:'wet-apron'});
  objects.push({x:30,z:-21.8,h:1.3,w:.55,d:.4,type:'yard-switch'});
 }
 // A lived-in facade changes after the same incident that modifies the
 // collision world. No invisible replacement building is introduced.
 for(const part of storyStreetFrontage(state))
  objects.push({...part,type:'story-shop-frontage'});
 for(const part of HallLights?.visibleFixtures(state)||[])
  objects.push({...part,h:.28,w:.12,d:.38,type:'story-hall-luminaire'});
 if(state.terrainRevision===1){
  for(const roof of SHARED_PUBLIC_CANOPIES)objects.push(roof);
  for(const roof of CRAFT_PUBLIC_CANOPIES)objects.push(roof);
  for(const roof of MARKET_LANE_ROOFS)objects.push(roof);
  for(const roof of RAINCOURT_CANOPIES)objects.push(roof);
  objects.push({x:43,z:75,h:.22,w:18,d:18,roofY:3.28,type:'aden-shade-roof'});
  objects.push({x:-45,z:135,h:.18,w:22,d:20,roofY:3.35,type:'aden-ferry-roof'});
 }
 for(const mark of plan.trailMarkers||[])objects.push({x:mark.x,z:mark.z,h:.95,w:.22,d:.22,type:'trail-marker'});
 for(const {entity:b} of plan.bots)objects.push({x:b.x,z:b.z,angle:b.angle,h:1.9,w:.7,d:.7,type:'bot'});
 for(const {entity:g} of plan.guides||[])objects.push({x:g.x,z:g.z,h:1.75,w:.55,d:.55,type:'guide'});
 for(const {entity:w} of plan.witnesses||[]){
  // The existing civilian/witness render contract stays unchanged. The
  // separately identified character takes a distinct visual branch.
  if(w.role==='jo-hyunji')
   objects.push({x:w.x,z:w.z,angle:w.angle,h:1.78,w:.55,d:.55,type:'liaison'});
  else if(w.role==='mara')
   objects.push({x:w.x,z:w.z,angle:w.angle,h:1.78,w:.55,d:.55,type:'market-resident'});
  else if(w.role==='kim-jiyoon')
   objects.push({x:w.x,z:w.z,angle:w.angle,h:1.8,w:.56,d:.55,type:'field-companion'});
  else if(w.role==='civic-crossing-resident')
   objects.push({x:w.x,z:w.z,angle:w.angle,h:1.73,w:.55,d:.55,type:'crossing-resident'});
  else objects.push({x:w.x,z:w.z,h:1.78,w:.55,d:.55,type:'witness'});
 }
 for(const {entity:w} of plan.workers||[])objects.push({x:w.x,z:w.z,h:1.74,w:.55,d:.55,type:'worker'});
 for(const {entity:l} of plan.loot)objects.push({x:l.x,z:l.z,h:l.fieldPouch ? .24 : .9,
  w:l.fieldPouch ? .4 : .75,d:l.fieldPouch ? .32 : .75,type:l.fieldPouch?'field-pouch':l.kind});
  if(harborNight)objects.push({x:27,z:-66,h:1.25,w:.9,d:.55,type:'gate-log'});
 for(const t of this.plants)objects.push({...t,type:'plant',w:.65,d:.65});
 objects.sort((a,b)=>(b.x-p.x)**2+(b.z-p.z)**2 - ((a.x-p.x)**2+(a.z-p.z)**2));
 for(const o of objects){const d=Math.hypot(o.x-p.x,o.z-p.z);
  // Keep distant precision silhouettes in the Canvas fallback as well as
  // WebGL. Do not extend foliage, buildings or cache geometry unnecessarily.
  if(d>145&&!(o.type==='aden-vista-building'&&d<365)&&!(o.type==='bot'&&
    (p.weaponId==='precision'||p.weaponId==='marksman')&&
    d<=Visibility.actorViewDistance(p.weaponId)))continue;
 const x=o.x,z=o.z,ww=o.w*.5,dd=o.d*.5;
 if(o.type==='plant'){
  const bot=proj(x,0,z),top=proj(x,o.h,z);if(!bot||!top)continue;
  const width=Math.max(1,bot[1]-top[1]);ctx.strokeStyle='#28332b';ctx.lineWidth=Math.max(1,width*.028);ctx.beginPath();ctx.moveTo(bot[0],bot[1]);ctx.lineTo(top[0],top[1]+width*.48);ctx.stroke();
  ctx.fillStyle=d>55?'#385248':'#31583d';ctx.beginPath();ctx.moveTo(top[0],top[1]);ctx.lineTo(top[0]-width*.22,top[1]+width*.6);ctx.lineTo(top[0]+width*.22,top[1]+width*.6);ctx.closePath();ctx.fill();continue;
 }
 if(o.type==='story-hall-luminaire'){
  // Behind a solid wall, the indoor fitting is not a remote luminous marker.
  const sim=global.VeilpointSim;
  if(sim?.lineBlocked?.(p.x,p.z,x,z,state.obstacles))continue;
  const y=o.y,half=o.d/2;
  polygon([proj(x,y-.14,z-half),proj(x,y-.14,z+half),
   proj(x,y+.14,z+half),proj(x,y+.14,z-half)],
   o.lit?'#e2c991':'#5e615d');
  continue;
 }
 if(o.type==='story-shop-frontage'){
  // Painted panel lies directly on the existing solid building facade.
  polygon([proj(x-ww,o.y,z),proj(x+ww,o.y,z),
    proj(x+ww,o.y+o.h,z),proj(x-ww,o.y+o.h,z)],o.canvas);
  continue;
 }
 if(o.type==='aden-vista-building'){
  // Skyline houses have flat parapets, not a single featureless slab.
  const roof=proj(x,Math.max(0,o.h-.17),z);
  if(roof){ctx.fillStyle='#9b968a';
   ctx.fillRect(roof[0]-1,roof[1]-1,2,2);}
 }
 if(o.type==='shared-public-canopy'){
  const top=o.roofY+o.h;
  polygon([proj(x-ww,top,z-dd),proj(x+ww,top,z-dd),
    proj(x+ww,top,z+dd),proj(x-ww,top,z+dd)],o.canvas);
  continue;
 }
 if(o.type==='aden-ferry-roof'){
  const top=o.roofY+o.h;
  polygon([proj(x-ww,top,z-dd),proj(x+ww,top,z-dd),
    proj(x+ww,top,z+dd),proj(x-ww,top,z+dd)],'#9a896d');
  continue;
 }
 if(o.type==='aden-shade-roof'){
  const top=o.roofY+o.h;
  polygon([proj(x-ww,top,z-dd),proj(x+ww,top,z-dd),
    proj(x+ww,top,z+dd),proj(x-ww,top,z+dd)],'#a08b72');
  continue;
 }
 if(o.type==='dock-inspection-roof'){
  const top=o.roofY+o.h;
  polygon([proj(x-ww,top,z-dd),proj(x+ww,top,z-dd),
    proj(x+ww,top,z+dd),proj(x-ww,top,z+dd)],'#43555b');
  continue;
 }
 // Canvas fallback projects each *visible* bot's real direction in 3D,
 // matching the WebGL character and the 60Hz server/solo simulation.
 const heading=(o.type==='bot'||(Number.isFinite(o.angle)&&
  ['liaison','market-resident','field-companion','crossing-resident'].includes(o.type)))
  ?actorFacing(o):null;
 const cc=heading?Math.cos(heading.yaw):1,ss=heading?Math.sin(heading.yaw):0;
 const corner=(dx,dy,dz)=>proj(x+dx*cc-dz*ss,dy,z+dx*ss+dz*cc);
 const p000=corner(-ww,0,-dd),p100=corner(ww,0,-dd),
  p010=corner(-ww,o.h,-dd),p110=corner(ww,o.h,-dd),
  p001=corner(-ww,0,dd),p101=corner(ww,0,dd),
  p011=corner(-ww,o.h,dd),p111=corner(ww,o.h,dd);
 let color=o.type==='aden-vista-building'?
   ['#afa394','#9e9b91','#b8a08a','#8c8b86'][o.tone]:
   o.type==='yard-gate'?(global.VeilpointSim.gateMotorActive(state)?'#dca650':'#b6a16c'):o.type==='yard-fence'?'#596866':
   o.type==='aden-seafront-market-wall'?'#a28c77':o.type==='aden-seafront-market-counter'?'#8c6848':
   o.type==='aden-transit-court-wall'?'#aa9481':o.type==='aden-transit-court-bench'?'#867867':
   o.type.includes('aden-laneshop-outer-wall')?'#a4947c':
   o.type.includes('aden-laneshop-inner-wall')?'#9e927f':
   o.type.includes('aden-laneshop-back-wall')?'#a4947c':
   o.type.includes('aden-laneshop-shelf')?'#80674e':
   o.type.includes('aden-laneshop-counter')?'#b09572':
   o.type.includes('aden-laneshop-post')?'#96836d':
   o.type.includes('aden-laneshop-public-tap')?'#6d8787':
   o.type==='aden-raincourt-wall'?'#b3a48c':
   o.type==='aden-raincourt-dry-basin'?'#7e7567':
   o.type==='aden-raincourt-seat'?'#99846f':
   o.type==='aden-raincourt-post'?'#b2a084':
   o.type==='aden-craft-hall-wall'?'#a9997e':
   o.type==='aden-craft-hall-divider'?'#897d6c':
   o.type==='aden-craft-hall-shelf'?'#846e54':
   o.type==='aden-craft-hall-table'?'#9b7654':
   o.type==='aden-craft-court-post'?'#8b8b79':
   o.type==='aden-craft-court-seat'?'#8b7862':
   o.type==='aden-fishhall-wall'?'#afa18d':o.type==='aden-fishhall-counter'?'#79634d':
   o.type==='aden-ferry-hall-wall'?'#a89a83':o.type==='aden-ferry-hall-bench'?'#857668':o.type==='aden-ferry-hall-notice'?'#756754':
   o.type==='story-public-court-column'?'#bba98d':
   o.type==='story-public-court-furniture'?'#7f705e':
   o.type==='aden-civic-wall'?'#978774':o.type==='aden-civic-stall'?'#746957':
   o.type==='aden-arcade-wall'?'#998677':o.type==='aden-arcade-water'?'#717d80':
   o.type==='aden-shade-post'?'#8e7961':o.type==='aden-shade-seat'?'#7c6b58':
   o.type==='aden-pedestrian-bench'?'#8a7661':o.type==='aden-pedestrian-post'?'#827f72':o.type==='yard-switch'?(global.VeilpointSim.serviceGateStatus(state).obstructed?'#d65045':global.VeilpointSim.gateMotorActive(state)?'#e5a748':global.VeilpointSim.serviceGateStatus(state).open?'#54b977':'#89a2a5'):o.type==='story-civil-transport'?'#657d87':o.type==='story-building'?'#88786a':o.type==='story-warehouse'?'#6e7066':o.type==='story-office-wall'?'#91816a':o.type==='story-office-desk'?'#776351':o.type==='story-public-hall-wall'?'#ad9780':o.type==='story-public-hall-counter'?'#806954':o.type==='story-public-hall-seat'?'#8e7d6c':o.type==='story-fallen-awning'?'#b58c65':o.type==='story-water-kiosk'?'#8d7b64':o.type==='story-drydock-hull'?'#53656c':o.type==='story-rescue-locker'?'#b85b44':o.type==='volcanic-outcrop'?'#464644':o.type==='building'?'#6e7470':o.type==='bot'?'#24352e':o.type==='guide'?'#7c8c96':o.type==='liaison'?'#627b94':o.type==='market-resident'?'#b18f66':o.type==='field-companion'?'#6f858d':
    o.type==='crossing-resident'?'#a48a69':o.type==='witness'?'#7d8c77':o.type==='worker'?'#a18c72':o.type==='gate-log'?(state.gateLogReviewed?'#4d8c73':'#8e7651'):o.type==='report-desk'?(state.logHandedOff?'#487e67':'#9a8465'):o.type==='trail-marker'?'#d4ac48':o.type==='field-pouch'?'#77756c':o.type==='dock-handcart'?'#567078':o.type==='yard-service-vehicle'?'#4e6470':o.type==='dock-inspection-wall'?'#546467':o.type==='harbor-wash'?'#527e88':o.type==='wet-apron'?'#344b52':o.type==='med'?'#62ca9d':'#f4bc72';
 // Low-fidelity Canvas fallback: brighten nearby prop faces in the
 // headlamp's forward cone without drawing a screen-space magic glow.
 if((harborNight&&state.flashlightOn&&state.flashlightTicks>0)||
    (dusk&&state.brHeadlamp?.on&&state.brHeadlamp.ticks>0)){
  const dx=x-p.x,dz=z-p.z,range=Math.hypot(dx,dz);
  if(range>0&&range<18&&(dx*Math.sin(yaw)-dz*Math.cos(yaw))/range>.90){
   const lift=.35*(1-range/18),value=parseInt(color.slice(1),16);
   const channel=v=>Math.round(v+(255-v)*lift).toString(16).padStart(2,'0');
   color='#'+channel((value>>16)&255)+channel((value>>8)&255)+channel(value&255);
  }
 }
 polygon([p000,p100,p110,p010],color);polygon([p101,p001,p011,p111],color);polygon([p001,p000,p010,p011],color);polygon([p100,p101,p111,p110],color);polygon([p010,p110,p111,p011],o.type==='building'?'#919b91':o.type==='wet-apron'?'#516a72':'#9cb09a');
 // Canvas fallback preserves the two historic harbor building profiles.
 // Front windows are not shown from behind a solid wall.
 if((o.type==='story-building'||o.type==='story-warehouse')&&p.z>o.z+o.d/2){
  const front=o.z+o.d/2+.06,older=o.type==='story-building';
  for(let level=1;level<=(older?3:2);level++){
   const y=1.15+level*(older?1.55:2.2);
   if(y+.85>=o.h-.35)continue;
   for(const side of [-1,1]){
    const x=o.x+side*o.w*.27;
    const a=proj(x-.625,y+.92,front),b=proj(x+.625,y,front);
    if(a&&b){ctx.fillStyle='#283638';ctx.fillRect(Math.min(a[0],b[0]),
     Math.min(a[1],b[1]),Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));}
   }
  }
 }
 if(heading){
  // Physical uniform front panel, not a UI marker or through-wall indicator.
  const q=proj(heading.front.x,1.40,heading.front.z);
  if(q&&q[2]>.3){ctx.fillStyle='#222d29';ctx.fillRect(q[0]-2,q[1]-3,4,6);}
 }
 }
 // The Canvas fallback also shows the two physical facade fixtures. Only draw
 // their front faces from the harbor-road side; do not reveal a light through
 // the rear of a solid building. This is a low-fidelity fallback, not ray tracing.
 if(harborNight&&p.z>=-28){
  for(const x of [-42,42]){
   const q=proj(x,3.15,-27.72);
   if(!q||q[2]>90||q[0]<0||q[0]>w||q[1]<0||q[1]>h)continue;
   const radius=Math.max(1.5,Math.min(10,45/q[2]));
   if(state.relayRestored){
    ctx.fillStyle='rgba(246,187,97,.16)';
    ctx.fillRect(q[0]-radius*3,q[1]-radius*3,radius*6,radius*6);
   }
   ctx.fillStyle=state.relayRestored?'#ffdfa2':'#303d3d';
   ctx.fillRect(q[0]-radius,q[1]-radius,radius*2,radius*2);
  }
 }
 // The separate manual warning lamp is attached to the existing west facade;
 // the fallback never shows its lens from behind the solid wall.
 if(harborNight&&p.z>=-28){
  const q=proj(-42,4.1,-27.72);
  if(q&&q[2]<=90&&q[0]>=0&&q[0]<=w&&q[1]>=0&&q[1]<=h){
   const radius=Math.max(1.5,Math.min(10,45/q[2]));
   ctx.fillStyle=beaconLit?'#f5b55b':'#343c3b';
   ctx.fillRect(q[0]-radius,q[1]-radius,radius*2,radius*2);
  }
  const switchFace=proj(-42,1.1,-27.65);
  if(switchFace&&switchFace[2]<=90&&switchFace[0]>=0&&switchFace[0]<=w&&switchFace[1]>=0&&switchFace[1]<=h){
   ctx.fillStyle=state.beaconEnabled?'#d99b49':'#3a4543';
   ctx.fillRect(switchFace[0]-2,switchFace[1]-3,4,6);
   ctx.fillStyle='#b2b1a2';
   ctx.fillRect(switchFace[0]-1,switchFace[1]+(state.beaconEnabled?-4:0),2,3);
  }
 }
 // Eligibility boundaries remain visible on the 2D minimap and in HUD warnings,
 // not as a floating ring drawn across the physical game world.
 // Apply the same lower ambient level to fallback props, not just its sky.
 // This is applied to the game canvas only: DOM HUD contrast stays unchanged.
 if(dusk){ctx.fillStyle='rgba(22,24,36,.22)';ctx.fillRect(0,0,w,h);}
 const haze=Math.min(.16,Math.max(0,(atmosphereDensity(state)-.009)*22));
 if(!harborNight&&haze>0){
  ctx.fillStyle='rgba(153,178,169,'+haze.toFixed(3)+')';
  ctx.fillRect(0,0,w,h);
 }
 ctx.fillStyle='rgba(15,30,32,.08)';ctx.fillRect(0,0,w,h);
 }
}
class Renderer {
 constructor(canvas){this.canvas=canvas;this.verticalFov=55;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'high-performance'});if(!this.gl){this.fallback=new SoftwareRenderer(canvas);return;}const g=this.gl;this.prog=program(g,VS,FS);g.useProgram(this.prog);this.loc={pos:g.getAttribLocation(this.prog,'aPosition'),normal:g.getAttribLocation(this.prog,'inNormal'),color:g.getAttribLocation(this.prog,'inColor'),view:g.getUniformLocation(this.prog,'uView'),projection:g.getUniformLocation(this.prog,'uProjection'),sun:g.getUniformLocation(this.prog,'uSun'),fog:g.getUniformLocation(this.prog,'uFog'),fogDensity:g.getUniformLocation(this.prog,'uFogDensity'),exposure:g.getUniformLocation(this.prog,'uExposure'),time:g.getUniformLocation(this.prog,'uTime'),effects:g.getUniformLocation(this.prog,'uEffects'),night:g.getUniformLocation(this.prog,'uNight'),relayOn:g.getUniformLocation(this.prog,'uRelayOn'),civicOn:g.getUniformLocation(this.prog,'uCivicOn'),beaconOn:g.getUniformLocation(this.prog,'uBeaconOn'),hallOn:g.getUniformLocation(this.prog,'uHallOn'),flashOn:g.getUniformLocation(this.prog,'uFlashOn'),flashEye:g.getUniformLocation(this.prog,'uFlashEye'),flashDir:g.getUniformLocation(this.prog,'uFlashDir')};g.enableVertexAttribArray(this.loc.pos);g.enableVertexAttribArray(this.loc.normal);g.enableVertexAttribArray(this.loc.color);g.enable(g.DEPTH_TEST);g.depthFunc(g.LEQUAL);g.enable(g.CULL_FACE);g.cullFace(g.BACK);this.static=new Mesh();this.dynamic=new Mesh();this.lastWidth=0;this.lastHeight=0;this.resolutionScale=1;this.vegetationDensity=1;this.effects=1;this.onGpuTime=null;this.onGpuInvalidated=null;this.gpuTimer=global.VeilpointPerformance.createGpuTimer(g,(ms,issuedAt)=>{if(this.onGpuTime)this.onGpuTime(ms,issuedAt);},()=>{if(this.onGpuInvalidated)this.onGpuInvalidated();});this.sceneMode='br';this.worldTerrainRevision=1;this.sceneObstacles=[];this.staticChunks=[];this.lastStaticVisibilityStats=null;this.generate();}
 generate(){const m=this.static,r=rand(19771),sz=175;
 // Fully procedural ground: physically plausible earth palette, fine geometry.
 const step=7;const height=(x,z)=>0.10*Math.sin(x*.12+z*.05)+0.13*Math.sin(z*.17-x*.08);
 for(let x=-sz;x<sz;x+=step){for(let z=-sz;z<sz;z+=step){const jitter=r()*.11,base=[.19+jitter,.235+jitter*.7,.177+jitter*.5];m.quad([x,height(x,z),z],[x,height(x,z+step),z+step],[x+step,height(x+step,z+step),z+step],[x+step,height(x+step,z),z],base);}}
 // Main surface paths, worn patches, concrete roads and runway.
 for(const v of [-2.2,2.2])m.box(0,-.025,v,350,.025,2.5,[.20,.21,.20]);
 for(let z=-175;z<175;z+=15)m.box(0,.006,z,0.20,.02,5.2,[.67,.59,.40]);
 for(let x=-175;x<175;x+=15)m.box(x,-.01,0,5.2,.024,.18,[.54,.48,.33]);
 // Public stone paving in four Aden-referenced fictional civilian districts.
 // Tessellated surfaces follow the authored ground relief; they are not
 // ghost colliders or an exact surveyed current street map.
 if(this.worldTerrainRevision===1)for(const pavement of global.VeilpointSim.PUBLIC_CITY_PAVEMENTS){
  const minX=pavement.x-pavement.w/2,maxX=pavement.x+pavement.w/2;
  const minZ=pavement.z-pavement.d/2,maxZ=pavement.z+pavement.d/2;
  for(let x=minX;x<maxX;x+=3)for(let z=minZ;z<maxZ;z+=3){
   const x2=Math.min(maxX,x+3),z2=Math.min(maxZ,z+3),y=.045;
   m.quad([x,height(x,z)+y,z],[x,height(x,z2)+y,z2],
     [x2,height(x2,z2)+y,z2],[x2,height(x2,z)+y,z],
     pavement.color);
  }
 }
 // Visible waterlogged apron has the same footprint as the fixed-step
 // player and rival traction rule. No hidden or unrendered movement modifier.
 if(this.sceneMode==='br'){
  const pad=global.VeilpointSim.WET_LOADING_PAD;
  m.box(pad.x,.045,pad.z,pad.width,.038,pad.depth,[.16,.24,.27]);
  for(const offset of [-4,0,4])
   m.box(pad.x+offset,.068,pad.z+2,1.2,.006,7,[.20,.30,.33]);
 }
 // NASA/UNESCO-grounded ADEN REGIONAL VISTA, beyond the small playable
 // demo: mountains behind dense low-rise port streets; sheltered water off
 // the western seafront. It uses the SAME immutable Sim source as native UE5.
 // Never turn distant mountain, sea or houses into client-side colliders.
 if(this.worldTerrainRevision===1){
  const vista=global.VeilpointSim.ADEN_GEOGRAPHIC_VISTA,ocean=vista.ocean;
  const sea=[.125,.245,.29],west=ocean.x-ocean.w/2,east=ocean.x+ocean.w/2,
    south=ocean.z-ocean.d/2,north=ocean.z+ocean.d/2;
  for(let x=west;x<east;x+=44)for(let z=south;z<north;z+=44){
   const x2=Math.min(east,x+44),z2=Math.min(north,z+44),
     glint=.01*(1+Math.sin(x*.021+z*.013));
   m.quad([x,ocean.y,z],[x,ocean.y,z2],
     [x2,ocean.y,z2],[x2,ocean.y,z],
     sea.map((v,i)=>v+glint*(i===2?1.5:1)));
  }
  // Geological silhouette arcs are fully outside 175m movement bounds.
  // Each adjacent pair forms two sloping rock triangles, with alternating
  // weathered basalt strata; no big cuboid mountain occludes the whole sky.
  for(const ridge of vista.ridges)for(let i=1;i<ridge.peaks.length;i++){
   const a=ridge.peaks[i-1],b=ridge.peaks[i],
     footA=[a.x,-.08,ridge.baseZ],footB=[b.x,-.08,ridge.baseZ],
     peakA=[a.x,a.h,ridge.z],peakB=[b.x,b.h,ridge.z],
     tint=i%3===0?1.10:i%3===1?.91:1.0,
     stone=ridge.tone.map(v=>v*tint);
   m.tri(footA,peakB,footB,stone);
   m.tri(footA,peakA,peakB,stone.map(v=>v*.9));
  }
  const limestone=[[.66,.61,.54],[.57,.54,.49],
    [.68,.56,.46],[.50,.49,.47]];
  for(const home of vista.buildings){
   const stone=limestone[home.tone];
   m.box(home.x,0,home.z,home.w,home.h,home.d,stone);
   m.box(home.x,home.h-.28,home.z,home.w+.18,.28,home.d+.18,
     stone.map(v=>Math.min(.9,v*1.07)));
   // Public skyline window recesses: multiple narrow vertical bands
   // instead of a huge flat generic industrial block.
   const front=home.z-home.d/2-.025,levels=Math.floor(home.h/3.1);
   for(let level=1;level<=Math.min(levels,4);level++)
    for(const side of [-1,1]){
     const x=home.x+side*home.w*.23,y=level*2.8-.2;
     m.box(x,y,front,home.w*.17,1.2,.05,[.25,.27,.29]);
    }
  }
 }
 const sim=global.VeilpointSim.newMatch(1,0,'carbine',false,'central','day',this.worldTerrainRevision);
 // Distinct civic districts become one pedestrian environment. Plan the
 // actual collision-clear route instead of drawing an implausible straight
 // connector through houses. BR and CH01 share identical base colliders.
 if(this.worldTerrainRevision===1&&PublicFootpaths){
  this.publicRoads=PublicFootpaths.planAll(sim.obstacles);
  this.localPublicRoads=PublicFootpaths.planLocalPaths(sim.obstacles);
  for(const road of [...this.publicRoads,...this.localPublicRoads])
   for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],
     length=Math.hypot(b.x-a.x,b.z-a.z);
   if(length<.01)continue;
   const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,
     sx=-uz*PublicFootpaths.WIDTH*.5,sz=ux*PublicFootpaths.WIDTH*.5;
   for(let t=0;t<length;t+=2){
    const end=Math.min(length,t+2),ax=a.x+ux*t,az=a.z+uz*t,
      bx=a.x+ux*end,bz=a.z+uz*end;
    m.quad([ax-sx,height(ax-sx,az-sz)+.052,az-sz],
      [ax+sx,height(ax+sx,az+sz)+.052,az+sz],
      [bx+sx,height(bx+sx,bz+sz)+.052,bz+sz],
      [bx-sx,height(bx-sx,bz-sz)+.052,bz-sz],
      [.39,.37,.33]);
   }
  }
 }
 sim.obstacles.forEach((o,i)=>{
  // A sliding gate must not remain as a solid closed panel in the static mesh:
  // it is drawn once from the live world by the dynamic geometry planner.
  if(o.routeId==='br-service-gate'||o.routeId==='br-dock-handcart')return;
  if(o.routeId==='br-yard-shuttle')return;
  if(o.type==='yard-fence'){
   if(this.sceneMode==='br')m.box(o.x,0,o.z,o.w,o.h,o.d,[.23,.30,.29]);
   return;
  }
  if(o.type==='volcanic-outcrop'){
   // A solid rock mass fills its exact collision footprint. Its smaller,
   // irregular tiers and weathered dark faces never extend beyond it.
   if(this.sceneMode==='br'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.27,.27,.26]);
    m.box(o.x,o.h*.68,o.z,o.w*.86,o.h*.24,o.d*.89,[.33,.32,.29]);
    m.box(o.x-.17,o.h*.86,o.z+.11,o.w*.69,o.h*.13,o.d*.67,[.24,.25,.25]);
   }
   return;
  }
  // East dock architecture is driven by the same simulation obstacle array:
  // the facade and crane are visible, but all additional detail stays inside
  // each existing solid footprint (no invisible movement barriers).
  if(o.type==='aden-shade-post'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.54,.47,.38]);
   m.box(o.x,o.h-.22,o.z,o.w,.22,o.d,[.68,.58,.47]);
   return;
  }
  if(o.type==='aden-shade-seat'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.48,.42,.36]);
   m.box(o.x,o.h-.12,o.z,o.w,.12,o.d,[.62,.55,.47]);
   return;
  }
  if(o.type==='aden-pedestrian-bench'){
   // Grounded low seats occupy only the actual 60Hz AABBs.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.49,.41,.34]);
   m.box(o.x,o.h-.12,o.z,o.w,.14,o.d,[.60,.51,.41]);
   return;
  }
  if(o.type==='aden-pedestrian-post'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.45,.44,.40]);
   m.box(o.x,o.h-.18,o.z,o.w,.20,o.d,[.57,.54,.48]);
   return;
  }
  // Public ferry approach shops are real interiors, not an opaque closed
  // cuboid. Color/fascia are drawn INSIDE each actual collision footprint.
  if(o.type.startsWith('aden-laneshop-')){
   const wall=o.type.endsWith('wall'),post=o.type.endsWith('post'),
     tap=o.type.endsWith('public-tap');
   const base=wall?[.61,.54,.44]:post?[.53,.48,.40]:
     tap?[.34,.47,.48]:o.type.endsWith('shelf')?[.42,.33,.25]:[.52,.40,.28];
   m.box(o.x,0,o.z,o.w,o.h,o.d,base);
   if(wall||post)
    m.box(o.x,o.h-.17,o.z,o.w,.17,o.d,base.map(v=>Math.min(1,v*1.17)));
   else if(!tap)
    m.box(o.x,o.h-.12,o.z,o.w+.07,.12,o.d+.07,[.66,.51,.35]);
   return;
  }
  if(o.type.startsWith('aden-raincourt-')){
   // Separate physical wall segments, stone basin, seat and columns; none
   // seals the north/south entries or exposes any real protected water site.
   const wall=o.type==='aden-raincourt-wall',
    basin=o.type==='aden-raincourt-dry-basin',
    seat=o.type==='aden-raincourt-seat';
   const body=wall?[.66,.59,.49]:
    basin?[.39,.41,.39]:seat?[.56,.44,.33]:[.57,.49,.39];
   m.box(o.x,0,o.z,o.w,o.h,o.d,body);
   if(wall)m.box(o.x,o.h-.2,o.z,o.w+.05,.2,o.d+.05,[.76,.69,.56]);
   if(basin){
    // Dry public court decorative basin: a visually inset *dry* channel.
    // Its only gameplay collider is the original shallow solid body.
    m.box(o.x,o.h-.11,o.z,o.w+.2,.12,o.d+.2,[.55,.51,.43]);
    m.box(o.x,o.h-.065,o.z,o.w-.35,.035,o.d-.35,[.30,.35,.36]);
   }
   if(seat)m.box(o.x,o.h-.12,o.z,o.w+.06,.12,o.d+.06,[.69,.56,.40]);
   return;
  }
  // All craft-hall details use the exact collision body from Sim. No
  // opaque exterior cube seals the two playable interior rooms.
  if(o.type==='aden-craft-hall-wall'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.62,.56,.45]);
   m.box(o.x,o.h-.20,o.z,o.w,.2,o.d,[.72,.64,.51]);return;
  }
  if(o.type==='aden-craft-hall-divider'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.55,.51,.45]);return;
  }
  if(o.type==='aden-craft-hall-shelf'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.45,.34,.24]);
   m.box(o.x,o.h*.52,o.z,o.w+.04,.08,o.d+.04,[.64,.49,.33]);return;
  }
  if(o.type==='aden-craft-hall-table'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.50,.39,.29]);
   m.box(o.x,o.h-.10,o.z,o.w+.08,.10,o.d+.08,[.71,.55,.38]);return;
  }
  if(o.type==='aden-craft-court-post'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.51,.51,.44]);
   m.box(o.x,o.h-.18,o.z,o.w,.18,o.d,[.67,.65,.55]);return;
  }
  if(o.type==='aden-craft-court-seat'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.49,.40,.33]);
   m.box(o.x,o.h-.12,o.z,o.w,.12,o.d,[.64,.53,.40]);return;
  }
  if(o.type==='aden-gallery-post'){
   // Open gallery supports are real 60Hz solids; no invisible arch wall.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.61,.54,.44]);
   m.box(o.x,o.h-.18,o.z,o.w,.18,o.d,[.75,.65,.52]);
   return;
  }
  if(o.type==='aden-gallery-counter'){
   // Two merchant counters are shallow, separate, physically walk-around.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.43,.36,.28]);
   m.box(o.x,o.h-.15,o.z,o.w,.15,o.d,[.67,.55,.39]);
   return;
  }
  if(o.type==='aden-promenade-post'){
   // Real fixed-step columns are drawn at their exact collision footprints.
   // A roof can be represented separately without becoming a ground barrier.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.53,.48,.40]);
   m.box(o.x,o.h-.18,o.z,o.w,.18,o.d,[.68,.61,.51]);
   return;
  }
  if(o.type==='aden-promenade-seat'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.46,.41,.34]);
   m.box(o.x,o.h-.12,o.z,o.w,.12,o.d,[.63,.57,.47]);
   return;
  }
  if(o.type==='aden-transit-court-wall'){
   // Exactly one visible wall for each shared collision body.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.62,.54,.46]);
   m.box(o.x,o.h-.17,o.z,o.w,.17,o.d,[.71,.63,.53]);
   return;
  }
  if(o.type==='aden-transit-court-bench'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.49,.44,.37]);
   m.box(o.x,o.h-.13,o.z,o.w,.13,o.d,[.60,.54,.45]);
   return;
  }
  if(o.type==='aden-fishhall-wall'){
   // Original stone public hall; visible geometry mirrors 60Hz collision.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.65,.59,.51]);
   m.box(o.x,o.h-.18,o.z,o.w,.18,o.d,[.76,.68,.57]);
   return;
  }
  if(o.type==='aden-fishhall-counter'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.46,.36,.27]);
   m.box(o.x,o.h-.13,o.z,o.w+.10,.13,o.d+.10,[.65,.53,.41]);
   return;
  }
  if(o.type==='aden-ferry-hall-wall'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.60,.53,.44]);
   m.box(o.x,o.h-.20,o.z,o.w,.20,o.d,[.72,.63,.51]);
   return;
  }
  if(o.type==='aden-ferry-hall-bench'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.46,.37,.30]);
   m.box(o.x,o.h-.13,o.z,o.w+.12,.13,o.d+.1,[.64,.52,.42]);
   return;
  }
  if(o.type==='aden-ferry-hall-notice'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.44,.36,.28]);
   m.box(o.x,o.h*.45,o.z+.02,o.w+.08,.62,.06,[.75,.72,.58]);
   return;
  }
  if(o.type==='aden-seafront-market-wall'){
   // Visible shopfront masonry is the exact collision footprint.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.64,.54,.43]);
   m.box(o.x,o.h-.22,o.z,o.w,.22,o.d,[.73,.63,.51]);
   return;
  }
  if(o.type==='aden-seafront-market-counter'){
   // Waist-high public market counters: real cover, no invisible roof/body.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.55,.41,.28]);
   m.box(o.x,o.h-.17,o.z,o.w,.17,o.d,[.69,.52,.36]);
   return;
  }
  if(o.type==='aden-arcade-wall'){
   // Solid masonry matches the 60Hz AABB, with no invented pass-through.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.59,.52,.43]);
   m.box(o.x,o.h-.21,o.z,o.w,.22,o.d,[.68,.60,.49]);
   return;
  }
  if(o.type==='aden-arcade-water'){
   // A visible low public spout, not a fictional teleporting supply source.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.39,.46,.47]);
   m.box(o.x,o.h-.3,o.z,o.w*.75,.20,o.d*.65,[.60,.63,.60]);
   return;
  }
  if(o.type==='aden-civic-wall'){
   // ONE geometry source shared by the BR and CH01 fixed-step worlds.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.57,.49,.39]);
   m.box(o.x,o.h-.18,o.z,o.w,.20,o.d,[.66,.58,.45]);
   return;
  }
  if(o.type==='aden-civic-stall'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.38,.32,.27]);
   m.box(o.x,o.h-.14,o.z,o.w,.18,o.d,[.54,.46,.34]);
   return;
  }
  if(o.type==='dock-inspection-wall'){
   // Static collision walls and visible material are generated from one
   // world obstacle. The front entrance remains fully open.
   if(this.sceneMode==='br')m.box(o.x,0,o.z,o.w,o.h,o.d,[.29,.38,.39]);
   return;
  }
  if(o.type==='dock-breakwater'){
   // Visible solid waterfront walls use precisely the BR AABB footprints.
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.31,.37,.39]);
   m.box(o.x,o.h-.25,o.z,o.w,.35,o.d,[.44,.48,.48]);
   return;
  }
  if(o.type==='dock-bollard'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.35,.35,.31]);
   m.box(o.x,o.h-.2,o.z,o.w+.25,.3,o.d+.25,[.55,.48,.32]);
   return;
  }
  if(o.type==='dock-warehouse'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.35,.36,.34]);
   m.box(o.x,o.h-.18,o.z,o.w+.4,.3,o.d+.4,[.23,.26,.27]);
   const front=o.z+o.d/2+.02;
   for(const offset of [-7,0,7]){
    m.box(o.x+offset,1.8,front,3.5,3.5,.08,[.15,.19,.20]);
    m.box(o.x+offset,3.45,front+.07,3.5,.14,.08,[.52,.47,.32]);
   }
   m.box(o.x,o.h-.75,front+.04,17,.5,.09,[.47,.48,.43]);
   return;
  }
  if(o.type==='dock-container'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.22,.31,.32]);
   for(let x=-3.5;x<=3.5;x+=.7)
    m.box(o.x+x,0,o.z+o.d/2+.045,.09,o.h,.06,[.16,.24,.25]);
   return;
  }
  if(o.type==='dock-crane'){
   m.box(o.x,0,o.z,o.w,o.h,o.d,[.43,.42,.32]);
   m.box(o.x,o.h-1,o.z,4.8,.65,4.8,[.27,.29,.28]);
   // Upper structure is architectural scenery, not a climbable platform.
   return;
  }
  const isContainer=o.type==='container',isShed=o.type==='shed';const col=isContainer?[.20,.25,.25]:isShed?[.37,.34,.29]:[.43,.44,.39];m.box(o.x,0,o.z,o.w,o.h,o.d,col);if(!isContainer){m.box(o.x,o.h,o.z,o.w+1,.36,o.d+1,[.20,.21,.20]);for(let n=-1;n<=1;n+=2){const xx=o.x+n*o.w*.24,front=o.z+o.d/2+.03;m.box(xx,o.h*.45,front,2.1,2.3,.13,[.12,.17,.18]);m.box(xx,o.h*.45,front+.09,1.5,1.7,.08,[.29,.42,.45]);}m.box(o.x-.2,o.h*.21,o.z-o.d/2-.06,2.8,o.h*.42,.1,[.16,.17,.17]);}
 if(i%3===0){m.box(o.x+o.w/2+1,0,o.z,1.6,o.h*.55,2,[.24,.26,.26]);}}
 );
 // Shared craft hall and adjacent public court use walkable flooring only;
 // no raised solid roof is ever added to the 60Hz obstacle collection.
 if(this.worldTerrainRevision===1){
  const floors=[{x:-78.8,z:22.1,w:31.6,d:27.8,col:[.43,.39,.31]},
    {x:-76.5,z:56.1,w:27,d:9,col:[.47,.42,.34]},
    {x:-51.4,z:95.5,w:33,d:23,col:[.43,.40,.34]},
    {x:-135.5,z:36.5,w:31,d:27,col:[.56,.49,.39]}];
  for(const floor of floors){
   const x1=floor.x,x2=floor.x+floor.w,z1=floor.z,z2=floor.z+floor.d;
   for(let x=x1;x<x2;x+=2.5)for(let z=z1;z<z2;z+=2.5){
    const xx=Math.min(x2,x+2.5),zz=Math.min(z2,z+2.5);
    m.quad([x,height(x,z)+.058,z],[x,height(x,zz)+.058,zz],
      [xx,height(xx,zz)+.058,zz],[xx,height(xx,z)+.058,z],floor.col);
   }
  }
 }
 // Separate stone terraces surround the open central walking passage.
 // These roofs sit above the human capsule and never enter Sim.obstacles.
 if(this.worldTerrainRevision===1)for(const roof of RAINCOURT_CANOPIES)
  m.box(roof.x,roof.roofY,roof.z,roof.w,roof.h,roof.d,roof.color);
 // Public market-lane shop roofs belong to two ACTUALLY enterable rooms.
 // Their separate collection preserves the legacy three-canopy contract.
 if(this.worldTerrainRevision===1)for(const roof of MARKET_LANE_ROOFS)
  m.box(roof.x,roof.roofY,roof.z,roof.w,roof.h,roof.d,roof.color);
 // Distinct market, western-court and transit roofs bring visible depth to
 // three PUBLIC ground-level areas. Canopy trim remains inside their authored
 // elevated footprint, so every existing BR/CH01 pedestrian entrance stays open.
 if(this.worldTerrainRevision===1)for(const roof of SHARED_PUBLIC_CANOPIES){
  m.box(roof.x,roof.roofY,roof.z,roof.w,roof.h,roof.d,roof.color);
  for(const side of [-1,1])
   m.box(roof.x+side*(roof.w/2-.14),roof.roofY-.11,roof.z,
     .24,.11,roof.d,roof.color.map(v=>v*.78));
 }
 // New craft roofs are independent from the original three canopies;
 // both renderer paths use the same authored raised roof dimensions.
 if(this.worldTerrainRevision===1)for(const roof of CRAFT_PUBLIC_CANOPIES){
  m.box(roof.x,roof.roofY,roof.z,roof.w,roof.h,roof.d,roof.color);
 }
 // Shared waterfront passenger hall: walk-in south entry and north doorway
 // have no roof-level collision; the two low benches are ordinary solid props.
 if(this.worldTerrainRevision===1){
  m.box(-45,3.35,135,22,.18,20,[.52,.46,.38]);
  m.box(-45,3.54,135,22.3,.075,20.3,[.62,.56,.46]);
  m.box(-45,-.009,135,20.7,.015,19.4,[.37,.34,.30]);
  for(const z of [127,133,139,143])
   m.box(-45,.011,z,14,.006,.12,[.52,.46,.36]);
 }
 // The shared public shade court has a roof above the player, not a phantom
 // solid that blocks entering. The benches and posts alone are colliders.
 if(this.worldTerrainRevision===1){
  m.box(43,3.28,75,18,.22,18,[.49,.42,.35]);
  m.box(43,3.48,75,18.2,.065,18.2,[.61,.53,.44]);
  m.box(43,-.006,75,15.5,.012,15.5,[.40,.36,.30]);
  for(const z of [69,75,81])m.box(43,.009,z,11,.005,.12,[.53,.47,.39]);
 }
 // Roof and paved forecourt of the COMMON urban block in both modes.
 // The overhead surface is above the walking capsule; only the authored
 // perimeter and stall collide. Do not generate a solid filler cuboid.
 if(this.worldTerrainRevision===1){
  m.box(77,4.02,125,26,.20,18,[.42,.39,.34]);
  m.box(77,-.008,125,24,.016,17,[.36,.32,.28]);
  for(const z of [117,125,132])
   m.box(77,.015,z,17,.006,.14,[.49,.44,.37]);
  // Same second block exists in BR and CH01 without another collision map.
  // The first person may walk through the west entrance beneath its roof.
  m.box(136,3.84,85,24,.17,18,[.41,.39,.35]);
  m.box(136,-.008,85,23,.016,17,[.37,.34,.29]);
  m.box(102,.002,83,20,.006,3,[.37,.35,.32]);
  for(const z of [79,85,91])
   m.box(136,.01,z,17,.006,.14,[.49,.45,.38]);
  // Open pedestrian route between the two existing neighborhoods. Surface
  // paint is non-solid, while adjacent benches and post use shared AABBs.
  // Neither mode gets a duplicate city or invented inaccessible street.
  for(const [x,z] of [[82,112],[92,107],[102,101],[112,95],[121,89]])
   m.box(x,-.007,z,10,.015,5,[.37,.34,.29]);
  for(const [x,z] of [[90,109],[108,97],[119,89]])
   m.box(x,.012,z,2,.006,.12,[.52,.49,.41]);
 }
 if(this.sceneMode==='br'){
  // Roof is separate elevated scenery over the actual three-sided shelter:
  // it must never fill the entrance or add invisible ground collision.
  const hut=global.VeilpointSim.INSPECTION_SHELTER;
  m.box(hut.x,hut.roofHeight-.11,hut.z,hut.width,.22,hut.depth,[.24,.31,.33]);
  m.box(hut.x,hut.roofHeight+.04,hut.z,hut.width+.4,.08,hut.depth+.4,[.33,.36,.35]);
  // The service gate is opened by a grounded, fixed wall-mounted control.
  m.box(30,0,-21.8,.55,1.3,.4,[.28,.31,.29]);
  m.box(30,1.12,-21.54,.37,.14,.07,[.80,.57,.23]);
 }
 // Aden-referenced BR coast should not resemble a temperate pine forest.
 // The optional sparse scrub is below knee height, offers no solid cover and
 // changes neither 60Hz movement nor AI visibility. CH01 vegetation is kept
 // on its own existing authored scene until its district gets a full pass.
 if(this.sceneMode==='br'){
  for(let i=0;i<Math.round(165*this.vegetationDensity);i++){
   const x=(r()-.5)*340,z=(r()-.5)*340;
   if(Math.abs(x)<12||Math.abs(z)<12)continue;
   if(sim.obstacles.some(o=>Math.abs(x-o.x)<o.w/2+3&&Math.abs(z-o.z)<o.d/2+3))continue;
   const h=.18+r()*.42;
   m.box(x,0,z,.4+r()*.3,h,.45+r()*.3,[.28+r()*.04,.31+r()*.05,.21+r()*.03]);
  }
 }else{
  for(let i=0;i<Math.round(330*this.vegetationDensity);i++){
   const x=(r()-.5)*340,z=(r()-.5)*340;
   if(Math.abs(x)<15||Math.abs(z)<14)continue;
   if(sim.obstacles.some(o=>Math.abs(x-o.x)<o.w/2+6&&Math.abs(z-o.z)<o.d/2+6))continue;
   const h=4+r()*9,leaf=[.085+r()*.08,.16+r()*.10,.12+r()*.05];
   m.tree(x,z,h,leaf);
  }
 }
 for(let i=0;i<Math.round((this.sceneMode==='br'?260:500)*this.vegetationDensity);i++){
  const x=(r()-.5)*344,z=(r()-.5)*344;
  if(Math.abs(x)<4||Math.abs(z)<5)continue;
  const h=r()*.23+.08;
  m.box(x,0,z,h*1.1,h,h*.6,[.25+r()*.08,.28+r()*.08,.20]);
 }
 // Original Nahrin harbor district: fixed, authored structures are shared with
 // the story collision map. No external textures, logos or remote dependencies.
 if(this.sceneMode==='nahrin'){
  m.box(0,-.018,-55,160,.025,54,[.30,.29,.27]); // Worn harbor road surface.
  // Original ground-painted evacuation wayfinding. The paint is a thin surface
  // layer (not a solid collider), so it never blocks first-person movement.
  // Static geometry is rebuilt only when the scene or graphics preset changes.
  const roadPaint=[.61,.57,.43],musterPaint=[.66,.55,.32];
  for(let z=-76;z<=-28;z+=8)m.box(-2,.008,z,.16,.005,3.4,roadPaint);
  for(let x=-5;x<=5;x+=2)m.box(x,.008,-58,1,.005,2.1,[.58,.57,.51]);
  m.box(-9,.008,-56.6,3.4,.005,.12,musterPaint);
  m.box(-9,.008,-53.4,3.4,.005,.12,musterPaint);
  m.box(-10.7,.008,-55,.12,.005,3.3,musterPaint);
  m.box(-7.3,.008,-55,.12,.005,3.3,musterPaint);
  // Both fixtures are wall-mounted on existing solid buildings, so their
  // physical support never creates invisible collision or obstructs objectives.
  for(const x of [-42,42]){
   m.box(x,3.02,-27.86,1.3,.28,.24,[.24,.26,.25]);
   m.box(x,3.31,-27.87,.14,.34,.14,[.27,.28,.26]);
  }
  // Fixed warning-lamp housing sits on the existing west building wall.
  // The nearby sidewalk switch is a separate E interaction, not a remote HUD toggle.
  m.box(-42,4.05,-27.86,1,.65,.2,[.25,.26,.25]);
  // A waist-height, hand-operated switch is visibly reachable from the street.
  m.box(-42,.88,-27.76,.34,.50,.15,[.24,.27,.27]);
  // The separate aid staging pad exists before the crate arrives and remains
  // after it leaves. Flat paint has no fictional solid collision footprint.
  m.box(-7,.012,-55,1.3,.012,1.05,[.45,.40,.30]);
   // East checkpoint transmission cabinet: a grounded, authored physical prop.
   // Its small footprint is outside the traversable route, not a solid wall.
   m.box(27,0,-66,.9,1.25,.55,[.35,.37,.36]);
   m.box(27,1.1,-65.69,.7,.18,.07,[.20,.24,.25]);
   // Open-door public office: a raised roof is visual overhead only.
   // The five walls below, not an invisible solid cuboid, handle 60Hz
   // collision; the middle of the south facade stays open for entry.
   m.box(87,4.02,25,14,.20,16,[.43,.40,.35]);
   m.box(87,.004,25,13.2,.008,15.2,[.35,.34,.30]);
   // Optional story-first hall has a REAL open 8m southern doorway in
   // fixed-step collision. Only its overhead roof, floor and lintel are
   // visual: adding a full-height fake shell would trap the player.
   const hall=global.VeilpointPublicHall;
   if(hall&&this.sceneObstacles.some(o=>o.id==='harbor-hall-north')){
    const center=hall.INNER_COURT;
    m.box(center.x,3.81,center.z,16.4,.18,16.4,[.40,.39,.35]);
    m.box(center.x,.003,center.z,15.1,.006,15.1,[.43,.41,.36]);
    m.box(center.x,3.33,26,8.0,.24,.18,[.72,.60,.48]);
    // Fittings are visual-only. All five original collision walls and the
    // unobstructed south entrance remain exactly the same as before.
    for(const f of HallLights?.FIXTURES||[]){
     m.box(f.x,f.y,f.z,.15,.32,.41,[.41,.42,.38]);
     m.box(f.x+(f.x<28?.07:-.07),f.y,f.z,.045,.23,.30,
       [.72,.65,.50]);
    }
   }
  // One authored source drives the native-editor and browser scene. Floor,
  // painted centre and roof never acquire phantom ground-level AABBs.
  if(StoryCourt&&this.sceneObstacles.some(o=>o.id==='public-court-west-north-column')){
   const f=StoryCourt.FLOOR,mark=StoryCourt.CENTRE_MARK,roof=StoryCourt.CANOPY;
   m.box(f.x,.001,f.z,f.w,.026,f.d,[.52,.47,.39]);
   m.box(mark.x,.028,mark.z,mark.w,.012,mark.d,[.73,.65,.50]);
   m.box(roof.x,roof.y-roof.h/2,roof.z,roof.w,roof.h,roof.d,[.57,.49,.38]);
   m.box(roof.x,roof.y+roof.h*.40,roof.z,
     roof.w+.2,.045,roof.d+.2,[.66,.57,.44]);
  }
  for(const o of this.sceneObstacles){
   if(o.type==='story-public-court-column'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.69,.62,.51]);
    m.box(o.x,o.h-.18,o.z,o.w+.08,.18,o.d+.08,[.79,.71,.57]);
    continue;
   }
   if(o.type==='story-public-court-furniture'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.43,.35,.27]);
    m.box(o.x,o.h-.11,o.z,o.w+.08,.11,o.d+.08,[.64,.53,.40]);
    continue;
   }
   if(o.type==='story-public-hall-wall'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.64,.53,.41]);
    m.box(o.x,o.h-.20,o.z,o.w,.22,o.d,[.77,.65,.51]);
    continue;
   }
   if(o.type==='story-public-hall-counter'||o.type==='story-public-hall-seat'){
    const seat=o.type==='story-public-hall-seat';
    m.box(o.x,0,o.z,o.w,o.h,o.d,seat?[.53,.43,.35]:[.45,.39,.31]);
    m.box(o.x,o.h-.11,o.z,o.w,.12,o.d,seat?[.70,.55,.40]:[.65,.55,.43]);
    continue;
   }
   if(o.type==='story-office-wall'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.57,.51,.43]);
    m.box(o.x,o.h-.20,o.z,o.w,.22,o.d,[.67,.61,.50]);
    continue;
   }
   if(o.type==='story-office-desk'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.40,.36,.31]);
    m.box(o.x,o.h-.13,o.z,o.w,.16,o.d,[.54,.48,.39]);
    continue;
   }
   if(o.type==='story-drydock-hull'){
    // Dry workboat, permanently ashore: all silhouette geometry stays inside
    // its 60Hz solid footprint rather than suggesting traversable decks.
    m.box(o.x,0,o.z,o.w,o.h*.66,o.d,[.25,.33,.38]);
    m.box(o.x,o.h*.66,o.z,o.w*.88,.24,o.d*.9,[.70,.69,.62]);
    m.box(o.x,o.h*.45,o.z,o.w*.68,.12,o.d*.55,[.43,.48,.49]);
    continue;
   }
   if(o.type==='story-rescue-locker'){
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.68,.29,.22]);
    m.box(o.x,.55,o.z+o.d/2,o.w*.68,.62,.02,[.91,.88,.72]);
    m.box(o.x,.23,o.z+o.d/2,.10,.12,.04,[.29,.29,.27]);
    continue;
   }
   if(o.type==='story-fallen-awning'){
    // Fallen canvas and loose timber, the whole solid footprint matches the
    // existing 60Hz body. No invisible full-height wall or scripted teleport.
    m.box(o.x,0,o.z,o.w,.12,o.d,[.42,.33,.24]);
    m.box(o.x,.12,o.z,o.w-.16,.12,o.d-.16,[.65,.45,.32]);
    for(const x of [o.x-o.w/2+.14,o.x+o.w/2-.14])
     m.box(x,0,o.z,.13,o.h,o.d,[.31,.27,.23]);
    continue;
   }
   if(o.type==='story-water-kiosk'){
     // Hand-built waterfront masonry, with roof and front recess entirely
     // inside the existing 60Hz solid footprint (no decorative ghost walls).
     m.box(o.x,0,o.z,o.w,o.h,o.d,[.55,.48,.39]);
     m.box(o.x,o.h-.20,o.z,o.w,.25,o.d,[.37,.35,.31]);
     m.box(o.x,o.h*.40,o.z+o.d/2-.025,.72,.64,.05,[.24,.29,.31]);
     m.box(o.x-.7,.65,o.z+o.d/2-.02,.35,.8,.05,[.34,.38,.38]);
     continue;
    }
    if(o.type==='story-desk'){
    // This counter uses the same solid footprint as the 60Hz collision body.
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.37,.34,.30]);
    m.box(o.x,o.h-.10,o.z,o.w+.10,.12,o.d+.10,[.48,.44,.36]);
    continue;
   }
   const container=o.type==='story-container',crane=o.type==='story-crane';
   const oldCity=o.type==='story-building',portWare=o.type==='story-warehouse';
   // Original, Aden-inspired plaster residential facades contrast with
   // industrial harbor fronts. This is not a replica of a real building.
   const col=container?[.30,.34,.33]:crane?[.42,.39,.29]:
     portWare?[.42,.41,.37]:oldCity?[.55,.50,.43]:[.51,.47,.40];
   m.box(o.x,0,o.z,o.w,o.h,o.d,col);
   if(crane){
    m.box(o.x-5,o.h-1.3,o.z,18,.75,1.4,[.43,.41,.31]);
    m.box(o.x-12,o.h-3.8,o.z,.16,5,.16,[.26,.26,.24]);
   }else if(container){
    for(let n=-5;n<=5;n+=2)m.box(o.x+n,0,o.z+o.d/2+.035,.10,o.h,.07,[.24,.28,.28]);
   }else{
    m.box(o.x,o.h-.3,o.z,o.w+.45,.36,o.d+.45,[.30,.29,.28]);
    const front=o.z+o.d/2+.05;
    m.box(o.x,0,front,2.1,2.5,.12,[.21,.23,.22]);
    for(const sign of [-1,1]){
     const x=o.x+sign*o.w*.28;
     m.box(x,o.h*.42,front,1.8,1.9,.13,[.17,.22,.24]);
     m.box(x,o.h*.42,front+.09,1.4,1.5,.07,[.27,.36,.38]);
    }
    if(oldCity||portWare){
     // Window surface trim extends <10cm outside its existing collider.
     // No invented climbable balcony or collision discrepancy is introduced.
     const frontSurface=o.z+o.d/2+.025;
     const floors=oldCity?3:2;
     for(let level=1;level<=floors;level++){
      const y=1.15+level*(oldCity?1.55:2.2);
      if(y+.85>=o.h-.35)continue;
      for(const side of [-1,1]){
       const x=o.x+side*o.w*.27;
       m.box(x,y,frontSurface,1.25,.92,.07,[.19,.23,.24]);
       m.box(x,y+.53,frontSurface,1.45,.12,.08,
         oldCity?[.63,.58,.50]:[.50,.49,.44]);
      }
     }
     // Recessed parapets do not protrude beyond solid building footprints.
     for(const side of [-1,1])
      m.box(o.x+side*(o.w/2-.22),o.h-.40,o.z,.20,.36,o.d-.14,
        oldCity?[.61,.55,.45]:[.39,.38,.35]);
    }
   }
  }
 }
 const partitioned=partitionStaticTriangles(m.data);m.data=partitioned.packed;
 this.staticChunks=partitioned.chunks;
 this.static.upload(this.gl);this.static.data=[];
 }
 buildDynamic(state){
 const mesh=this.dynamic,t=state.elapsed;mesh.data.length=0;
 // The one authored crate occupies exactly one physical place: pickup pad,
 // captain's hands, staging pad, or the aid-team handoff point.
 if(state.scene!=='nahrin'&&global.VeilpointSim.harborWaveWash(t).active){
  const pad=global.VeilpointSim.WET_LOADING_PAD;
  mesh.box(pad.x,.085,pad.z,pad.width,.012,pad.depth,[.27,.44,.51]);
  for(const offset of [-4,0,4])
   mesh.box(pad.x+offset,.102,pad.z+2,.8,.006,6,[.51,.62,.65]);
 }
 if(state.scene==='nahrin'&&state.streetFlood){
  const wet=state.streetFlood;
  mesh.box(wet.x,.027,wet.z,wet.w,.012,wet.d,
    wet.cleared?[.31,.38,.36]:[.20,.36,.41]);
  // Drain clearing leaves a thin damp sheen rather than magically drying a
  // city street. No new invisible colliders or texture dependencies.
  for(const xOffset of [-3.1,0,3.1])
   mesh.box(wet.x+xOffset,.046,wet.z+.9,.4,.005,wet.d*.58,
    wet.cleared?[.39,.44,.43]:[.34,.48,.52]);
  if(wet.repairProgress>0){
   const progress=Math.max(0,Math.min(1,wet.repairProgress));
   mesh.box(-12+1.15*progress,.062,-17.3,2.3*progress,.02,.28,[.79,.66,.37]);
  }
  // Preserve PR #787's physical drain housing and remaining debris renderer.
  for(const d of global.VeilpointStreetFlood?.details?.(wet)||[])
   mesh.box(d.x,d.y,d.z,d.w,d.h,d.d,d.rgb);
 }
 if(state.scene==='nahrin'&&!state.aidPickedUp){
  mesh.box(-7,.25,-47,.62,.5,.48,[.46,.40,.31]);
 }
 if(state.scene==='nahrin'&&state.aidDelivered){
  mesh.box(-12,.25,-60,.62,.5,.48,[.46,.40,.31]);
 }
 if(state.scene==='nahrin'&&state.carryingAid){
  const p=state.player;
  mesh.box(p.x+Math.sin(p.yaw)*.9,.72,p.z-Math.cos(p.yaw)*.9,
    .62,.4,.48,[.46,.40,.31]);
 }
 // A staged crate rests on the ground pad, never simultaneously in hand.
 if(state.scene==='nahrin'&&state.aidStaged){
  mesh.box(-7,.25,-55,.62,.5,.48,[.46,.40,.31]);
 }
 if(state.scene==='nahrin'){
  for(const part of storyStreetFrontage(state))
   mesh.box(part.x,part.y,part.z,part.w,part.h,part.d,part.color);
  // The paper receipt remains on the local counter. Its ink/status strip
  // changes only after the player physically submits the verified log.
  mesh.box(18,1.055,-42.53,.6,.035,.20,
    state.logHandedOff?[.22,.49,.35]:[.60,.46,.27]);
  // Inspecting the physical log changes the cabinet's local status indicator.
  mesh.box(27,1.03,-65.63,.55,.1,.05,
    state.gateLogReviewed?[.23,.48,.36]:[.58,.42,.25]);
  // The harbor warning light stays off until the captain physically operates
  // its switch after restoring power; it is not an automatic rescue effect.
  mesh.box(-42,4.1,-27.72,.7,.35,.13,
    beaconLightLevel(state)>0?[1.4,.78,.26]:[.18,.19,.18]);
  mesh.box(-42,1.13,-27.66,.16,.09,.04,
    beaconLightLevel(state)>0?[.92,.58,.25]:[.20,.23,.22]);
  // The same manual switch has a visible lever position in both states.
  mesh.box(-42,state.beaconEnabled?1.19:1.06,-27.59,.08,.16,.09,
    beaconLightLevel(state)>0?[.80,.70,.42]:[.39,.42,.41]);
  // A dark fixture remains visibly unpowered until the relay interaction;
  // this changes in the same render frame as the saved mission state.
  for(const x of [-42,42])mesh.box(x,3.08,-27.73,1.05,.15,.13,
    state.relayRestored?[1.45,1.12,.65]:[.16,.17,.17]);
 }
 const plan=Visibility.planVisible(state,this.lastWidth/Math.max(this.lastHeight,1),this.verticalFov*Math.PI/180);
  // The moving civilian vehicle is never baked into the static mesh. Live
  // geometry derives directly from the world collision body's saved pose.
  if(state.scene==='nahrin'&&state.transportVan&&
     Math.hypot(state.player.x-state.transportVan.x,state.player.z-state.transportVan.z)<115){
    const v=state.transportVan;
    mesh.box(v.x,0,v.z,2.4,1.45,3.8,[.35,.45,.49]);
    mesh.box(v.x,1.45,v.z,2.25,.82,3.35,[.36,.46,.51]);
    // A roadside request changes the actual driven body's 60Hz motion.
    // Reuse the existing rear panel as an observable brake-light cue without
    // adding invisible geometry or pretending passengers were evacuated.
    mesh.box(v.x,1.46,v.z+1.71,1.60,.53,.045,
      v.yielding?[.72,.19,.13]:[.18,.27,.31]);
    mesh.box(v.x,2.28,v.z,2.2,.08,3.3,[.47,.50,.46]);
  }
 this.lastVisibilityStats=plan.stats;
 // BR gate collision and the visible 3D panel share the same live X position.
 // Culling already budgets this exact one-box dynamic mesh contribution.
 for(const gate of plan.serviceGates||[])mesh.box(gate.x,0,gate.z,
   gate.w,gate.h,gate.d,global.VeilpointSim.gateMotorActive(state)?[.75,.49,.19]:[.55,.47,.32]);
 // One physical light on the actual local gate control panel. The culling
 // planner accounts for exactly one dynamic box whenever it is visible.
 for(const lamp of plan.yardIndicators||[]){
  const status=global.VeilpointSim.serviceGateStatus(state);
  mesh.box(lamp.x,1.17,lamp.z,.22,.14,.22,
    status.obstructed?[.81,.20,.14]:status.motorActive?[.96,.59,.18]:
      status.open?[.21,.70,.36]:[.43,.62,.65]);
 }
 // Player-operated handcart: draw the SAME obstacle that blocks all actors.
 // Do not leave a permanent second static cart at its original loading pad.
 for(const cart of plan.handcarts||[])
   mesh.box(cart.x,0,cart.z,cart.w,cart.h,cart.d,[.28,.37,.40]);
 // One original port vehicle, with the real wheelbase and heading from
 // the fixed-step world state. Eight boxes are budgeted in visibility.js.
 for(const v of plan.vehicles||[]){
  const at=(lx,lz)=>[v.x+lx*Math.cos(v.yaw)-lz*Math.sin(v.yaw),
    v.z+lx*Math.sin(v.yaw)+lz*Math.cos(v.yaw)];
  mesh.boxYaw(v.x,.35,v.z,2.05,.58,4.1,v.yaw,[.26,.34,.37]);
  const cab=at(0,-.8);
  mesh.boxYaw(cab[0],.85,cab[1],1.83,.85,1.7,v.yaw,[.30,.41,.44]);
  mesh.boxYaw(cab[0],1.68,cab[1],1.85,.18,1.75,v.yaw,[.25,.31,.33]);
  for(const x of [-.95,.95])for(const z of [-1.4,1.4]){
   const wheel=at(x,z);
   mesh.boxYaw(wheel[0],.15,wheel[1],.28,.55,.52,v.yaw,[.10,.11,.11]);
  }
  const bumper=at(0,-2.07);
  mesh.boxYaw(bumper[0],.37,bumper[1],1.95,.22,.16,v.yaw,[.42,.43,.42]);
  // Two real rear stop lamps, mechanically linked to the 60Hz driver
  // brake input. Never a glowing directional marker or through-wall hint.
  for(const side of [-.79,.79]){
   const rear=at(side,2.04);
   mesh.boxYaw(rear[0],.59,rear[1],.29,.16,.10,v.yaw,
     state.vehicleBrake===true?[1.25,.08,.05]:[.27,.045,.04]);
  }
 }
 // A single physical navigation sign follows the saved match world state.
 // Its narrow post and cloth flag require two cull-accounted boxes.
 for(const mark of plan.trailMarkers||[]){
  mesh.box(mark.x,0,mark.z,.11,.9,.11,[.42,.37,.30]);
  mesh.box(mark.x,.67,mark.z,.55,.24,.09,[.69,.53,.19]);
 }
 // Static geometry is generated from the BR base world. Story-specific route
 // blockers must also be rendered from the live world or the player collides
 // with an invisible checkpoint. A cleared route removes this mesh on the
 // same frame as its collision body; do not cache a stale gate in static GPU data.
 for(const obstacle of state.obstacles){
  if(obstacle.routeId==='east-checkpoint')
   mesh.box(obstacle.x,0,obstacle.z,obstacle.w,obstacle.h,obstacle.d,[.30,.35,.36]);
 }
 // One original neutral-color civilian guide, drawn at the exact 60Hz
 // collision position and only while visible behind solid harbor occluders.
 for(const {entity:g} of plan.guides||[]){
  mesh.box(g.x,.05,g.z,.55,1.18,.4,[.39,.46,.51]);
  mesh.box(g.x,1.36,g.z,.42,.43,.40,[.58,.48,.39]);
 }
 // Real local CH01 human NPC rather than a bright HUD-only objective.
 for(const {entity:w} of plan.witnesses||[]){
  const liaison=w.role==='jo-hyunji',marketResident=w.role==='mara',
    companion=w.role==='kim-jiyoon',crossing=w.role==='civic-crossing-resident';
  // Grounded civilian body orientation follows witnessed 60Hz movement.
  // No offscreen marker or checkpoint-specific orientation is inferred.
  const angle=Number.isFinite(w.angle)?w.angle:0;
  mesh.boxYaw(w.x,.05,w.z,.56,1.20,.45,angle,liaison?[.34,.42,.51]:
    marketResident?[.57,.43,.27]:companion?[.37,.47,.53]:
    crossing?[.55,.46,.33]:[.42,.49,.38]);
  mesh.boxYaw(w.x,1.39,w.z,.42,.42,.40,angle,[.60,.48,.37]);
  if(Number.isFinite(w.angle)){
   const front=actorFacing(w).front;
   mesh.boxYaw(front.x,.98,front.z,.24,.14,.07,angle,[.28,.30,.29]);
  }
 }
 // Mobile street-life silhouette is drawn only from visible 60Hz CH01
 // physical coordinates; no radar marker or static ghost is left behind.
 for(const {entity:w} of plan.workers||[]){
  mesh.box(w.x,.04,w.z,.56,1.18,.40,[.48,.42,.33]);
  mesh.box(w.x,1.35,w.z,.42,.42,.39,[.55,.46,.37]);
 }
 for(const {entity:b,lod} of plan.bots){
  const c=[.24,.29,.26],x=b.x,z=b.z,facing=actorFacing(b),angle=facing.yaw;
  mesh.boxYaw(x,0.06,z,.7,1.3,.45,angle,c);
  if(lod==='low')continue;
  mesh.boxYaw(x,1.37,z,.48,.45,.46,angle,[.24,.20,.17]);
  mesh.boxYaw(facing.left.x,0,facing.left.z,.24,.65,.27,angle,[.19,.20,.19]);
  if(lod==='medium')continue;
  mesh.boxYaw(facing.right.x,0,facing.right.z,.24,.65,.27,angle,[.19,.20,.19]);
  mesh.boxYaw(facing.front.x,1.03,facing.front.z,.7,.13,.15,angle,[.18,.21,.23]);
  mesh.boxYaw(facing.front.x,1.49,facing.front.z,.55,.12,.22,angle,[.10,.12,.12]);
 }
 for(const {entity:item,lod} of plan.loot){
  if(item.fieldPouch){
   // Small, grounded cloth-equipment proxy; never a hovering loot marker.
   mesh.box(item.x,.045,item.z,.4,.09,.32,[.35,.35,.31]);
   if(lod==='high')mesh.box(item.x,.105,item.z,.28,.035,.22,[.23,.24,.22]);
   continue;
  }
  // Grounded, stationary physical prop placeholders. Hovering neon cubes
  // would contradict the project's realism-only rule in every mode.
  const c=item.kind==='evac'?[.38,.44,.37]:(item.kind==='evidence'||item.kind==='verify')?[.34,.39,.43]:item.kind==='magazine'?[.40,.42,.39]:[.49,.43,.34];
  mesh.box(item.x,.09,item.z,.65,.18,.45,c);
  // The visible stack is a physical proxy for the finite stock remaining in
  // this same world cache. Rival scavenging and player collection change it
  // immediately, without glowing icons or a remote information overlay.
  if(Number.isFinite(item.remaining)){
   const capacity=item.kind==='ammo'?12:24;
   const fraction=Math.max(0,Math.min(1,item.remaining/capacity));
   if(fraction>0)mesh.box(item.x,.28,item.z,.48*fraction,.07,.27,[.32,.31,.27]);
  }
  if(lod==='high')mesh.box(item.x,0,item.z,.85,.06,.65,[.24,.25,.23]);
 }
 // No 3D eligibility pylons: the boundary is a published rule, not a wall.
 for(const e of plan.effects){
  // The prototype previously drew glowing blue/red cubes in mid-air. Replace
  // them with brief muted ground debris or a small warm muzzle cue; no
  // persistent energy projectiles, magical hit markers or neon impact boxes.
  if(e.type==='hit')mesh.box(e.x,.025,e.z,.22,.06,.22,[.36,.33,.28]);
  else if(e.type==='hostile')mesh.box(e.x,1.18,e.z,.16,.12,.16,[.68,.45,.24]);
 }
 mesh.upload(this.gl,this.gl.DYNAMIC_DRAW);mesh.data.length=0;
 }
 // Display-only vertical camera preference, completely separate from
 // physical enemy visibility, ammo and saved 60Hz game state.
 setFieldOfView(degrees){
  const options=global.VeilpointCameraView?.OPTIONS||[48,55,63,70,78];
  if(typeof degrees!=='number'||!options.includes(degrees))
   throw new RangeError('Unsupported vertical camera FOV');
  this.verticalFov=degrees;
  if(this.fallback)this.fallback.verticalFov=degrees;
  return degrees;
 }
 // Temporary, explicit first-person environment observation view. It alters
 // only display projection, not collision, hidden-actor discovery, world time,
 // opponent AI or durable graphics preferences. Restores configured FOV on
 // release, pause or next unzoomed draw (works in WebGL and Canvas fallback).
 setObservationZoom(held,configuredFov){
  const options=global.VeilpointCameraView?.OPTIONS||[48,55,63,70,78];
  if(!options.includes(configuredFov)||typeof held!=='boolean')
   throw new RangeError('Invalid observation camera parameters');
  const angle=held?Math.max(28,Math.round(configuredFov*0.58)):configuredFov;
  this.verticalFov=angle;
  if(this.fallback)this.fallback.verticalFov=angle;
  return angle;
 }
 setAdaptiveResolution(scale){
  if(!Number.isFinite(scale)||scale<.5||scale>1.25)throw new RangeError('Invalid adaptive resolution');
  if(this.fallback){this.fallback.adaptiveScale=scale;return;}
  this.adaptiveScale=scale;
 }
 setGraphicsQuality(settings){
 const quality=global.VeilpointGraphics.validate(settings);
 if(this.fallback){this.fallback.quality=quality;this.fallback.adaptiveScale=quality.resolutionScale;return;}
 this.resolutionScale=quality.resolutionScale;this.adaptiveScale=quality.resolutionScale;
 this.effects=quality.effects;
 this.lastWidth=0;this.lastHeight=0;
 if(this.vegetationDensity!==quality.vegetationDensity){
  this.vegetationDensity=quality.vegetationDensity;
  if(this.static.buffer)this.gl.deleteBuffer(this.static.buffer);
  this.static=new Mesh();this.generate();
 }
 }
 resize(){const c=this.canvas,g=this.gl;const density=Math.min(devicePixelRatio||1,1.4)*(this.adaptiveScale||this.resolutionScale);const w=Math.floor(c.clientWidth*density),h=Math.floor(c.clientHeight*density);if(w!==this.lastWidth||h!==this.lastHeight){c.width=w;c.height=h;g.viewport(0,0,w,h);this.lastWidth=w;this.lastHeight=h;}}
 draw(state){if(this.fallback){this.fallback.draw(state);return;}
 const scene=state.scene==='nahrin'?'nahrin':'br';
 const terrainRevision=scene==='br'&&state.terrainRevision===0?0:1;
 if(scene!==this.sceneMode||terrainRevision!==this.worldTerrainRevision){
  this.sceneMode=scene;
  this.worldTerrainRevision=terrainRevision;
  this.sceneObstacles=scene==='nahrin'?state.obstacles.filter(o=>o.type&&o.type.startsWith('story-')&&o.routeId!=='story-civil-transport').map(o=>({...o})):[];
  if(this.static.buffer)this.gl.deleteBuffer(this.static.buffer);
  this.static=new Mesh();this.generate();
 }
 this.gpuTimer.poll(global.performance&&typeof global.performance.now==='function'?global.performance.now():null);const timerStarted=this.gpuTimer.begin(global.performance&&typeof global.performance.now==='function'?global.performance.now():null);this.resize();const g=this.gl,l=this.loc,p=state.player;
 g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
 g.useProgram(this.prog);const eye=[p.x,1.64-(global.VeilpointInput&&global.VeilpointInput.crouch?.55:0),p.z];
 const pitch=p.pitch,dir=[Math.sin(p.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(p.yaw)*Math.cos(pitch)];
 const look=[eye[0]+dir[0],eye[1]+dir[1],eye[2]+dir[2]];
 g.uniformMatrix4fv(l.projection,false,m4Perspective(this.verticalFov*Math.PI/180,
    this.lastWidth/Math.max(this.lastHeight,1),.1,460));g.uniformMatrix4fv(l.view,false,m4LookAt(eye,look,[0,1,0]));
 const night=scene==='nahrin',dusk=!night&&state.lighting==='dusk';
 g.uniform3f(l.sun,night?-.35:dusk?-.75:-.50,night?.28:dusk?.40:.88,night?.10:dusk?.18:.20);
 g.uniform3f(l.fog,night?.065:dusk?.23:.34,night?.085:dusk?.26:.40,night?.11:dusk?.29:.39);
 g.uniform1f(l.fogDensity,atmosphereDensity(state));
 g.uniform1f(l.exposure,night?1.25:dusk?1.18:1.35);
 // Dusk uses reduced daylight without enabling CH01-only powered lamps.
 g.uniform1f(l.night,night?1:dusk?.44:0);
 g.uniform1f(l.relayOn,night&&state.relayRestored?1:0);
 g.uniform1f(l.civicOn,civicStreetLampLevel(state));
 g.uniform1f(l.beaconOn,night?beaconLightLevel(state):0);
 g.uniform1f(l.hallOn,night?(HallLights?.level(state)||0):0);
 g.uniform1f(l.flashOn,(night&&state.flashlightOn&&state.flashlightTicks>0)||
    (dusk&&state.brHeadlamp?.on&&state.brHeadlamp.ticks>0)?1:0);
 g.uniform3f(l.flashEye,eye[0],eye[1],eye[2]);
 g.uniform3f(l.flashDir,dir[0],dir[1],dir[2]);
 g.uniform1f(l.time,state.elapsed);g.uniform1f(l.effects,this.effects);
 // One VBO with many conservative subranges. Chunk culling changes only
 // rasterization, never simulated cover, player physics or saved world state.
 const halfFov=Visibility.halfHorizontalFov(this.lastWidth/Math.max(this.lastHeight,1),this.verticalFov*Math.PI/180);
 let submittedVertices=0,visibleChunks=0;
 if(this.static.bind(g,l)){
  for(const chunk of this.staticChunks){
   if(!Visibility.inView(p,chunk.x,chunk.z,chunk.radius,460,halfFov))continue;
   g.drawArrays(g.TRIANGLES,chunk.first,chunk.count);
   visibleChunks++;submittedVertices+=chunk.count;
  }
 }
 this.lastStaticVisibilityStats={visibleChunks,totalChunks:this.staticChunks.length,
  submittedVertices,totalVertices:this.static.count};
 this.buildDynamic(state);this.dynamic.draw(g,l);if(timerStarted)this.gpuTimer.end();
 }
}
global.VeilpointHallLightLevel=state=>HallLights?.level(state)||0;
global.VeilpointCivicStreetLamp=civicStreetLampLevel;
global.VeilpointSharedPublicCanopies=SHARED_PUBLIC_CANOPIES;
global.VeilpointStaticChunker=Object.freeze({partitionStaticTriangles});
global.VeilpointBeaconLight=beaconLightLevel;
global.VeilpointStoryStreetFrontage=storyStreetFrontage;
global.VeilpointRenderer=Renderer;
global.VeilpointActorFacing=actorFacing;
})(globalThis);
