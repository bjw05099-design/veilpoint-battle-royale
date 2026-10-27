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
class Mesh {
 constructor(){this.data=[];this.buffer=null;this.capacityBytes=0;this.count=0;}
 vertex(p,n,c){this.data.push(...p,...n,...c);}
 tri(a,b,c,color){const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];const n=safeNorm([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);this.vertex(a,n,color);this.vertex(b,n,color);this.vertex(c,n,color);}
 quad(a,b,c,d,color){this.tri(a,b,c,color);this.tri(a,c,d,color);}
 box(x,y,z,w,h,d,col){const X=x-w/2,Y=y,Z=z-d/2,W=x+w/2,H=y+h,D=z+d/2;const p=[V3(X,Y,Z),V3(W,Y,Z),V3(W,H,Z),V3(X,H,Z),V3(X,Y,D),V3(W,Y,D),V3(W,H,D),V3(X,H,D)];const face=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];for(let i=0;i<6;i++){const [a,b,c,d]=face[i];const tint= i===4?1.06:i===5?0.72:i===0?0.81:i===2?0.7:1;this.quad(p[a],p[b],p[c],p[d],col.map(x=>x*tint));}}
 // Vertical low-poly plant silhouette, dark at the roots and glossy on leaves.
 tree(x,z,h,green){const r=h*0.13;this.box(x,0,z,r*0.9,h*0.45,r*0.9,[0.17,0.16,0.12]);for(let n=0;n<3;n++){const hh=h*(0.37+n*0.21),rr=h*(0.19-n*0.045);this.cone(x,hh*0.15,z,rr,hh,7,green.map(c=>c*(0.95+n*0.05)));}}
 cone(x,y,z,r,h,s,col){for(let i=0;i<s;i++){const a=i/s*Math.PI*2,b=(i+1)/s*Math.PI*2;this.tri([x+r*Math.cos(a),y,z+r*Math.sin(a)],[x+r*Math.cos(b),y,z+r*Math.sin(b)],[x,y+h,z],col);}}
 upload(gl,usage=gl.STATIC_DRAW){
  if(!this.buffer)this.buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  const vertices=new Float32Array(this.data);
  if(vertices.byteLength>this.capacityBytes){
   this.capacityBytes=Math.max(1024,2**Math.ceil(Math.log2(vertices.byteLength)));
   gl.bufferData(gl.ARRAY_BUFFER,this.capacityBytes,usage);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);
  this.count=this.data.length/9;
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
uniform float uExposure,uTime,uEffects;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 N=normalize(vNormal),L=normalize(uSun);float lambert=max(dot(N,L),0.);float sky=clamp(N.y*.5+.5,0.,1.);
vec3 diffuse=vColor*(.18+.47*sky+.68*lambert);
float highlight=pow(max(dot(reflect(-L,N),vec3(0.,.72, .69)),0.),26.);
diffuse+=vec3(1.,.87,.63)*highlight*.10;
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
 const horizon=h*(.51+Math.tan(p.pitch)*.5);const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#536b70');sky.addColorStop(.65,'#89948a');sky.addColorStop(1,'#ddd0ad');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 const ground=ctx.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,'#5b6551');ground.addColorStop(1,'#2d3b31');ctx.fillStyle=ground;ctx.fillRect(0,horizon,w,h);
 const focal=Math.min(w,h)*.98,yaw=p.yaw,sin=Math.sin(yaw),cos=Math.cos(yaw);
 const proj=(x,y,z)=>{const dx=x-p.x,dz=z-p.z,a=dx*cos+dz*sin,b=dx*sin-dz*cos,yy=y-1.55,up=yy*Math.cos(p.pitch)-b*Math.sin(p.pitch),depth=b*Math.cos(p.pitch)+yy*Math.sin(p.pitch);if(depth<.3)return null;return [w*.5+a*focal/depth,h*.5-up*focal/depth,depth];};
 const polygon=(pts,color)=>{if(pts.some(x=>!x))return;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();};
 const objects=[];
 for(const o of state.obstacles)objects.push({x:o.x,z:o.z,h:o.h,w:o.w,d:o.d,type:'building'});
 for(const {entity:b} of plan.bots)objects.push({x:b.x,z:b.z,h:1.9,w:.7,d:.7,type:'bot'});
 for(const {entity:l} of plan.loot)objects.push({x:l.x,z:l.z,h:.9,w:.75,d:.75,type:l.kind});
 for(const t of this.plants)objects.push({...t,type:'plant',w:.65,d:.65});
 objects.sort((a,b)=>(b.x-p.x)**2+(b.z-p.z)**2 - ((a.x-p.x)**2+(a.z-p.z)**2));
 for(const o of objects){const d=Math.hypot(o.x-p.x,o.z-p.z);if(d>145)continue;
 const x=o.x,z=o.z,ww=o.w*.5,dd=o.d*.5;
 if(o.type==='plant'){
  const bot=proj(x,0,z),top=proj(x,o.h,z);if(!bot||!top)continue;
  const width=Math.max(1,bot[1]-top[1]);ctx.strokeStyle='#28332b';ctx.lineWidth=Math.max(1,width*.028);ctx.beginPath();ctx.moveTo(bot[0],bot[1]);ctx.lineTo(top[0],top[1]+width*.48);ctx.stroke();
  ctx.fillStyle=d>55?'#385248':'#31583d';ctx.beginPath();ctx.moveTo(top[0],top[1]);ctx.lineTo(top[0]-width*.22,top[1]+width*.6);ctx.lineTo(top[0]+width*.22,top[1]+width*.6);ctx.closePath();ctx.fill();continue;
 }
 const p000=proj(x-ww,0,z-dd),p100=proj(x+ww,0,z-dd),p010=proj(x-ww,o.h,z-dd),p110=proj(x+ww,o.h,z-dd),p001=proj(x-ww,0,z+dd),p101=proj(x+ww,0,z+dd),p011=proj(x-ww,o.h,z+dd),p111=proj(x+ww,o.h,z+dd);
 const color=o.type==='building'?'#6e7470':o.type==='bot'?'#24352e':o.type==='med'?'#62ca9d':'#f4bc72';
 polygon([p000,p100,p110,p010],color);polygon([p101,p001,p011,p111],color);polygon([p001,p000,p010,p011],color);polygon([p100,p101,p111,p110],color);polygon([p010,p110,p111,p011],o.type==='building'?'#919b91':'#9cb09a');
 }
 const z=state.zone;if(z.radius<160){ctx.strokeStyle='#a9dcfc7e';ctx.lineWidth=2;ctx.beginPath();let started=false;for(let i=0;i<=128;i++){const a=i/128*Math.PI*2,q=proj(z.x+Math.cos(a)*z.radius,1.2,z.z+Math.sin(a)*z.radius);if(q){if(!started){ctx.moveTo(q[0],q[1]);started=true;}else ctx.lineTo(q[0],q[1]);}}ctx.stroke();}
 ctx.fillStyle='rgba(15,30,32,.08)';ctx.fillRect(0,0,w,h);
 }
}
class Renderer {
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'high-performance'});if(!this.gl){this.fallback=new SoftwareRenderer(canvas);return;}const g=this.gl;this.prog=program(g,VS,FS);g.useProgram(this.prog);this.loc={pos:g.getAttribLocation(this.prog,'aPosition'),normal:g.getAttribLocation(this.prog,'inNormal'),color:g.getAttribLocation(this.prog,'inColor'),view:g.getUniformLocation(this.prog,'uView'),projection:g.getUniformLocation(this.prog,'uProjection'),sun:g.getUniformLocation(this.prog,'uSun'),fog:g.getUniformLocation(this.prog,'uFog'),exposure:g.getUniformLocation(this.prog,'uExposure'),time:g.getUniformLocation(this.prog,'uTime'),effects:g.getUniformLocation(this.prog,'uEffects')};g.enableVertexAttribArray(this.loc.pos);g.enableVertexAttribArray(this.loc.normal);g.enableVertexAttribArray(this.loc.color);g.enable(g.DEPTH_TEST);g.depthFunc(g.LEQUAL);g.enable(g.CULL_FACE);g.cullFace(g.BACK);this.static=new Mesh();this.dynamic=new Mesh();this.lastWidth=0;this.lastHeight=0;this.resolutionScale=1;this.vegetationDensity=1;this.effects=1;this.onGpuTime=null;this.gpuTimer=global.VeilpointPerformance.createGpuTimer(g,ms=>{if(this.onGpuTime)this.onGpuTime(ms);});this.generate();}
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
 this.static.upload(this.gl);this.static.data=[];
 }
 buildDynamic(state){
 const mesh=this.dynamic,t=state.elapsed;mesh.data=[];
 const plan=Visibility.planVisible(state,this.lastWidth/Math.max(this.lastHeight,1));
 this.lastVisibilityStats=plan.stats;
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
  const f=1.2+Math.sin(t*2.4+item.id)*.19;
  const c=item.kind==='evac'?[.25,.85,.58]:(item.kind==='evidence'||item.kind==='verify')?[.32,.56,.96]:item.kind==='magazine'?[.63,.66,.61]:[.98,.69,.30];
  mesh.box(item.x,f,item.z,.75,.75,.75,c);
  if(lod==='high')mesh.box(item.x,0,item.z,1.0,.1,1.0,[.18,.23,.23]);
 }
 // Keep full geometry near the camera; remove only off-camera or distant pylons.
 for(const point of plan.zone)mesh.box(point.x,0,point.z,.19,2.5,.19,[.24,.52,.82]);
 for(const e of plan.effects){
  const c=e.type==='hit'?[1,.6,.22]:e.type==='hostile'?[.89,.20,.19]:[.67,.80,1];
  mesh.box(e.x,.8,e.z,.34,.34,.34,c);
 }
 mesh.upload(this.gl,this.gl.DYNAMIC_DRAW);mesh.data=[];
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
 draw(state){if(this.fallback){this.fallback.draw(state);return;}this.gpuTimer.poll();const timerStarted=this.gpuTimer.begin();this.resize();const g=this.gl,l=this.loc,p=state.player;
 g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
 g.useProgram(this.prog);const eye=[p.x,1.64-(global.VeilpointInput&&global.VeilpointInput.crouch?.55:0),p.z];
 const pitch=p.pitch,dir=[Math.sin(p.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(p.yaw)*Math.cos(pitch)];
 const look=[eye[0]+dir[0],eye[1]+dir[1],eye[2]+dir[2]];
 g.uniformMatrix4fv(l.projection,false,m4Perspective(Math.PI/3.25,this.lastWidth/Math.max(this.lastHeight,1),.1,460));g.uniformMatrix4fv(l.view,false,m4LookAt(eye,look,[0,1,0]));
 g.uniform3f(l.sun,-.50,.88,.20);g.uniform3f(l.fog,.34,.40,.39);g.uniform1f(l.exposure,1.35);g.uniform1f(l.time,state.elapsed);g.uniform1f(l.effects,this.effects);
 this.static.draw(g,l);this.buildDynamic(state);this.dynamic.draw(g,l);if(timerStarted)this.gpuTimer.end();
 }
}
global.VeilpointRenderer=Renderer;
})(globalThis);
