/* VEILPOINT browser renderer: dependency-free WebGL2, procedural world meshes,
 * filmic tone mapping, atmospheric distance, dynamic characters and ring.
 * Quality ceiling is a technical prototype, not equivalent to Unreal Engine 5.
 */
(function(global){
'use strict';
const V3=(x,y,z)=>[x,y,z];
const Visibility=global.VeilpointVisibility;
const rand=(seed)=>{let x=seed|0;return()=>{x=(Math.imul(x,1664525)+1013904223)|0;return(x>>>0)/4294967296;};};
const safeNorm=(a)=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
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
 draw(gl,p){if(!this.buffer)return;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.vertexAttribPointer(p.pos,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(p.normal,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(p.color,3,gl.FLOAT,false,36,24);gl.drawArrays(gl.TRIANGLES,0,this.count);}
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
uniform float uExposure,uTime,uEffects,uNight,uRelayOn,uBeaconOn,uFlashOn;
uniform vec3 uFlashEye,uFlashDir;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 N=normalize(vNormal),L=normalize(uSun);float lambert=max(dot(N,L),0.);float sky=clamp(N.y*.5+.5,0.,1.);
vec3 diffuse=vColor*mix(.18+.47*sky+.68*lambert,.12+.14*sky+.10*lambert,uNight);
float highlight=pow(max(dot(reflect(-L,N),vec3(0.,.72, .69)),0.),26.);
diffuse+=vec3(1.,.87,.63)*highlight*mix(.10,.025,uNight);
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
if(uNight>.5&&uFlashOn>.5){
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
float fogFactor=1.-exp(-pow(vDistance*.009,1.7));
vec3 linear=mix(diffuse,uFog,clamp(fogFactor,0.,.97));
vec3 graded=aces(linear*uExposure);
graded=pow(graded,vec3(.96));
outColor=vec4(graded,1.);}`;
// Canvas2D software fallback: slow but playable on devices without GPU WebGL2.
class SoftwareRenderer {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.random=rand(5101);this.plants=Array.from({length:150},()=>({x:(this.random()-.5)*325,z:(this.random()-.5)*325,h:3+this.random()*5}));}
 resize(){const c=this.canvas;const ratio=this.adaptiveScale||(this.quality?this.quality.resolutionScale:1);const w=Math.max(1,Math.floor(c.clientWidth*ratio)),h=Math.max(1,Math.floor(c.clientHeight*ratio));if(c.width!==w||c.height!==h){c.width=w;c.height=h;}return {w,h};}
 draw(state){const {w,h}=this.resize(),ctx=this.ctx,p=state.player;
 const plan=Visibility.planVisible(state,w/Math.max(h,1));this.lastVisibilityStats=plan.stats;
 const horizon=h*(.51+Math.tan(p.pitch)*.5);const sky=ctx.createLinearGradient(0,0,0,horizon);const harborNight=state.scene==='nahrin';sky.addColorStop(0,harborNight?'#192a35':'#536b70');sky.addColorStop(.65,harborNight?'#3b4b52':'#89948a');sky.addColorStop(1,harborNight?'#6a6a63':'#ddd0ad');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 const ground=ctx.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,harborNight?'#343c3d':'#5b6551');ground.addColorStop(1,harborNight?'#1e292c':'#2d3b31');ctx.fillStyle=ground;ctx.fillRect(0,horizon,w,h);
 const focal=Math.min(w,h)*.98,yaw=p.yaw,sin=Math.sin(yaw),cos=Math.cos(yaw);
 const eyeHeight=1.64-(global.VeilpointInput&&global.VeilpointInput.crouch?.55:0);
 const proj=(x,y,z)=>{const dx=x-p.x,dz=z-p.z,a=dx*cos+dz*sin,b=dx*sin-dz*cos,yy=y-eyeHeight,up=yy*Math.cos(p.pitch)-b*Math.sin(p.pitch),depth=b*Math.cos(p.pitch)+yy*Math.sin(p.pitch);if(depth<.3)return null;return [w*.5+a*focal/depth,h*.5-up*focal/depth,depth];};
 const polygon=(pts,color)=>{if(pts.some(x=>!x))return;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();};
 const objects=[];
 for(const o of state.obstacles)objects.push({x:o.x,z:o.z,h:o.h,w:o.w,d:o.d,
  type:o.type==='story-desk'?'report-desk':'building'});
 for(const {entity:b} of plan.bots)objects.push({x:b.x,z:b.z,h:1.9,w:.7,d:.7,type:'bot'});
 for(const {entity:l} of plan.loot)objects.push({x:l.x,z:l.z,h:l.fieldPouch ? .24 : .9,
  w:l.fieldPouch ? .4 : .75,d:l.fieldPouch ? .32 : .75,type:l.fieldPouch?'field-pouch':l.kind});
  if(harborNight)objects.push({x:27,z:-66,h:1.25,w:.9,d:.55,type:'gate-log'});
 for(const t of this.plants)objects.push({...t,type:'plant',w:.65,d:.65});
 objects.sort((a,b)=>(b.x-p.x)**2+(b.z-p.z)**2 - ((a.x-p.x)**2+(a.z-p.z)**2));
 for(const o of objects){const d=Math.hypot(o.x-p.x,o.z-p.z);
  // Keep distant precision silhouettes in the Canvas fallback as well as
  // WebGL. Do not extend foliage, buildings or cache geometry unnecessarily.
  if(d>145&&!(o.type==='bot'&&
    (p.weaponId==='precision'||p.weaponId==='marksman')&&
    d<=Visibility.actorViewDistance(p.weaponId)))continue;
 const x=o.x,z=o.z,ww=o.w*.5,dd=o.d*.5;
 if(o.type==='plant'){
  const bot=proj(x,0,z),top=proj(x,o.h,z);if(!bot||!top)continue;
  const width=Math.max(1,bot[1]-top[1]);ctx.strokeStyle='#28332b';ctx.lineWidth=Math.max(1,width*.028);ctx.beginPath();ctx.moveTo(bot[0],bot[1]);ctx.lineTo(top[0],top[1]+width*.48);ctx.stroke();
  ctx.fillStyle=d>55?'#385248':'#31583d';ctx.beginPath();ctx.moveTo(top[0],top[1]);ctx.lineTo(top[0]-width*.22,top[1]+width*.6);ctx.lineTo(top[0]+width*.22,top[1]+width*.6);ctx.closePath();ctx.fill();continue;
 }
 const p000=proj(x-ww,0,z-dd),p100=proj(x+ww,0,z-dd),p010=proj(x-ww,o.h,z-dd),p110=proj(x+ww,o.h,z-dd),p001=proj(x-ww,0,z+dd),p101=proj(x+ww,0,z+dd),p011=proj(x-ww,o.h,z+dd),p111=proj(x+ww,o.h,z+dd);
 let color=o.type==='building'?'#6e7470':o.type==='bot'?'#24352e':o.type==='gate-log'?(state.gateLogReviewed?'#4d8c73':'#8e7651'):o.type==='report-desk'?(state.logHandedOff?'#487e67':'#9a8465'):o.type==='field-pouch'?'#77756c':o.type==='med'?'#62ca9d':'#f4bc72';
 // Low-fidelity Canvas fallback: brighten nearby prop faces in the
 // headlamp's forward cone without drawing a screen-space magic glow.
 if(harborNight&&state.flashlightOn&&state.flashlightTicks>0){
  const dx=x-p.x,dz=z-p.z,range=Math.hypot(dx,dz);
  if(range>0&&range<18&&(dx*Math.sin(yaw)-dz*Math.cos(yaw))/range>.90){
   const lift=.35*(1-range/18),value=parseInt(color.slice(1),16);
   const channel=v=>Math.round(v+(255-v)*lift).toString(16).padStart(2,'0');
   color='#'+channel((value>>16)&255)+channel((value>>8)&255)+channel(value&255);
  }
 }
 polygon([p000,p100,p110,p010],color);polygon([p101,p001,p011,p111],color);polygon([p001,p000,p010,p011],color);polygon([p100,p101,p111,p110],color);polygon([p010,p110,p111,p011],o.type==='building'?'#919b91':'#9cb09a');
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
   ctx.fillStyle=state.beaconEnabled?'#f5b55b':'#343c3b';
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
 ctx.fillStyle='rgba(15,30,32,.08)';ctx.fillRect(0,0,w,h);
 }
}
class Renderer {
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'high-performance'});if(!this.gl){this.fallback=new SoftwareRenderer(canvas);return;}const g=this.gl;this.prog=program(g,VS,FS);g.useProgram(this.prog);this.loc={pos:g.getAttribLocation(this.prog,'aPosition'),normal:g.getAttribLocation(this.prog,'inNormal'),color:g.getAttribLocation(this.prog,'inColor'),view:g.getUniformLocation(this.prog,'uView'),projection:g.getUniformLocation(this.prog,'uProjection'),sun:g.getUniformLocation(this.prog,'uSun'),fog:g.getUniformLocation(this.prog,'uFog'),exposure:g.getUniformLocation(this.prog,'uExposure'),time:g.getUniformLocation(this.prog,'uTime'),effects:g.getUniformLocation(this.prog,'uEffects'),night:g.getUniformLocation(this.prog,'uNight'),relayOn:g.getUniformLocation(this.prog,'uRelayOn'),beaconOn:g.getUniformLocation(this.prog,'uBeaconOn'),flashOn:g.getUniformLocation(this.prog,'uFlashOn'),flashEye:g.getUniformLocation(this.prog,'uFlashEye'),flashDir:g.getUniformLocation(this.prog,'uFlashDir')};g.enableVertexAttribArray(this.loc.pos);g.enableVertexAttribArray(this.loc.normal);g.enableVertexAttribArray(this.loc.color);g.enable(g.DEPTH_TEST);g.depthFunc(g.LEQUAL);g.enable(g.CULL_FACE);g.cullFace(g.BACK);this.static=new Mesh();this.dynamic=new Mesh();this.lastWidth=0;this.lastHeight=0;this.resolutionScale=1;this.vegetationDensity=1;this.effects=1;this.onGpuTime=null;this.onGpuInvalidated=null;this.gpuTimer=global.VeilpointPerformance.createGpuTimer(g,(ms,issuedAt)=>{if(this.onGpuTime)this.onGpuTime(ms,issuedAt);},()=>{if(this.onGpuInvalidated)this.onGpuInvalidated();});this.sceneMode='br';this.sceneObstacles=[];this.generate();}
 generate(){const m=this.static,r=rand(19771),sz=175;
 // Fully procedural ground: physically plausible earth palette, fine geometry.
 const step=7;const height=(x,z)=>0.10*Math.sin(x*.12+z*.05)+0.13*Math.sin(z*.17-x*.08);
 for(let x=-sz;x<sz;x+=step){for(let z=-sz;z<sz;z+=step){const jitter=r()*.11,base=[.19+jitter,.235+jitter*.7,.177+jitter*.5];m.quad([x,height(x,z),z],[x,height(x,z+step),z+step],[x+step,height(x+step,z+step),z+step],[x+step,height(x+step,z),z],base);}}
 // Main surface paths, worn patches, concrete roads and runway.
 for(const v of [-2.2,2.2])m.box(0,-.025,v,350,.025,2.5,[.20,.21,.20]);
 for(let z=-175;z<175;z+=15)m.box(0,.006,z,0.20,.02,5.2,[.67,.59,.40]);
 for(let x=-175;x<175;x+=15)m.box(x,-.01,0,5.2,.024,.18,[.54,.48,.33]);
 const sim=global.VeilpointSim.newMatch(1,0);
 sim.obstacles.forEach((o,i)=>{const isContainer=o.type==='container',isShed=o.type==='shed';const col=isContainer?[.20,.25,.25]:isShed?[.37,.34,.29]:[.43,.44,.39];m.box(o.x,0,o.z,o.w,o.h,o.d,col);if(!isContainer){m.box(o.x,o.h,o.z,o.w+1,.36,o.d+1,[.20,.21,.20]);for(let n=-1;n<=1;n+=2){const xx=o.x+n*o.w*.24,front=o.z+o.d/2+.03;m.box(xx,o.h*.45,front,2.1,2.3,.13,[.12,.17,.18]);m.box(xx,o.h*.45,front+.09,1.5,1.7,.08,[.29,.42,.45]);}m.box(o.x-.2,o.h*.21,o.z-o.d/2-.06,2.8,o.h*.42,.1,[.16,.17,.17]);}
 if(i%3===0){m.box(o.x+o.w/2+1,0,o.z,1.6,o.h*.55,2,[.24,.26,.26]);}}
 );
 // Individual forest pockets, break up skyline without blocking roads.
 for(let i=0;i<Math.round(330*this.vegetationDensity);i++){const x=(r()-.5)*340,z=(r()-.5)*340;if(Math.abs(x)<15||Math.abs(z)<14)continue;if(sim.obstacles.some(o=>Math.abs(x-o.x)<o.w/2+6&&Math.abs(z-o.z)<o.d/2+6))continue;const h=4+r()*9,leaf=[.085+r()*.08,.16+r()*.10,.12+r()*.05];m.tree(x,z,h,leaf);}
 for(let i=0;i<Math.round(500*this.vegetationDensity);i++){const x=(r()-.5)*344,z=(r()-.5)*344;if(Math.abs(x)<4||Math.abs(z)<5)continue;const h=r()*.23+.08;m.box(x,0,z,h*1.1,h,h*.6,[.25+r()*.08,.28+r()*.08,.20]);}
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
  for(const o of this.sceneObstacles){
   if(o.type==='story-desk'){
    // This counter uses the same solid footprint as the 60Hz collision body.
    m.box(o.x,0,o.z,o.w,o.h,o.d,[.37,.34,.30]);
    m.box(o.x,o.h-.10,o.z,o.w+.10,.12,o.d+.10,[.48,.44,.36]);
    continue;
   }
   const container=o.type==='story-container',crane=o.type==='story-crane';
   const col=container?[.30,.34,.33]:crane?[.42,.39,.29]:o.type==='story-warehouse'?[.44,.42,.38]:[.51,.47,.40];
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
   }
  }
 }
 this.static.upload(this.gl);this.static.data=[];
 }
 buildDynamic(state){
 const mesh=this.dynamic,t=state.elapsed;mesh.data.length=0;
 // The one authored crate occupies exactly one physical place: pickup pad,
 // captain's hands, staging pad, or the aid-team handoff point.
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
    state.beaconEnabled?[1.4,.78,.26]:[.18,.19,.18]);
  mesh.box(-42,1.13,-27.66,.16,.09,.04,
    state.beaconEnabled?[.92,.58,.25]:[.20,.23,.22]);
  // The same manual switch has a visible lever position in both states.
  mesh.box(-42,state.beaconEnabled?1.19:1.06,-27.59,.08,.16,.09,
    state.beaconEnabled?[.80,.70,.42]:[.39,.42,.41]);
  // A dark fixture remains visibly unpowered until the relay interaction;
  // this changes in the same render frame as the saved mission state.
  for(const x of [-42,42])mesh.box(x,3.08,-27.73,1.05,.15,.13,
    state.relayRestored?[1.45,1.12,.65]:[.16,.17,.17]);
 }
 const plan=Visibility.planVisible(state,this.lastWidth/Math.max(this.lastHeight,1));
 this.lastVisibilityStats=plan.stats;
 // Static geometry is generated from the BR base world. Story-specific route
 // blockers must also be rendered from the live world or the player collides
 // with an invisible checkpoint. A cleared route removes this mesh on the
 // same frame as its collision body; do not cache a stale gate in static GPU data.
 for(const obstacle of state.obstacles){
  if(obstacle.routeId==='east-checkpoint')
   mesh.box(obstacle.x,0,obstacle.z,obstacle.w,obstacle.h,obstacle.d,[.30,.35,.36]);
 }
 for(const {entity:b,lod} of plan.bots){
  const c=[.24,.29,.26],x=b.x,z=b.z;
  mesh.box(x,0.06,z,.7,1.3,.45,c);
  if(lod==='low')continue;
  mesh.box(x,1.37,z,.48,.45,.46,[.24,.20,.17]);
  mesh.box(x-.18,0,z,.24,.65,.27,[.19,.20,.19]);
  if(lod==='medium')continue;
  mesh.box(x+.18,0,z,.24,.65,.27,[.19,.20,.19]);
  mesh.box(x,1.03,z-.25,.7,.13,.15,[.18,.21,.23]);
  mesh.box(x,1.49,z-.25,.55,.12,.22,[.10,.12,.12]);
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
 if(scene!==this.sceneMode){
  this.sceneMode=scene;
  this.sceneObstacles=scene==='nahrin'?state.obstacles.filter(o=>o.type&&o.type.startsWith('story-')).map(o=>({...o})):[];
  if(this.static.buffer)this.gl.deleteBuffer(this.static.buffer);
  this.static=new Mesh();this.generate();
 }
 this.gpuTimer.poll(global.performance&&typeof global.performance.now==='function'?global.performance.now():null);const timerStarted=this.gpuTimer.begin(global.performance&&typeof global.performance.now==='function'?global.performance.now():null);this.resize();const g=this.gl,l=this.loc,p=state.player;
 g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
 g.useProgram(this.prog);const eye=[p.x,1.64-(global.VeilpointInput&&global.VeilpointInput.crouch?.55:0),p.z];
 const pitch=p.pitch,dir=[Math.sin(p.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(p.yaw)*Math.cos(pitch)];
 const look=[eye[0]+dir[0],eye[1]+dir[1],eye[2]+dir[2]];
 g.uniformMatrix4fv(l.projection,false,m4Perspective(Math.PI/3.25,this.lastWidth/Math.max(this.lastHeight,1),.1,460));g.uniformMatrix4fv(l.view,false,m4LookAt(eye,look,[0,1,0]));
 const night=scene==='nahrin';
 g.uniform3f(l.sun,night?-.35:-.50,night?.28:.88,night?.10:.20);
 g.uniform3f(l.fog,night?.065:.34,night?.085:.40,night?.11:.39);
 g.uniform1f(l.exposure,night?1.25:1.35);g.uniform1f(l.night,night?1:0);
 g.uniform1f(l.relayOn,night&&state.relayRestored?1:0);
 g.uniform1f(l.beaconOn,night&&state.beaconEnabled?1:0);
 g.uniform1f(l.flashOn,night&&state.flashlightOn&&state.flashlightTicks>0?1:0);
 g.uniform3f(l.flashEye,eye[0],eye[1],eye[2]);
 g.uniform3f(l.flashDir,dir[0],dir[1],dir[2]);
 g.uniform1f(l.time,state.elapsed);g.uniform1f(l.effects,this.effects);
 this.static.draw(g,l);this.buildDynamic(state);this.dynamic.draw(g,l);if(timerStarted)this.gpuTimer.end();
 }
}
global.VeilpointRenderer=Renderer;
})(globalThis);
