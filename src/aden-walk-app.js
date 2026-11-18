/* VEILPOINT · offline Aden story pilot. */
(function(root){
 'use strict';
 const doc=root.document,get=id=>doc.getElementById(id);
 const game=root.VeilpointAdenWalkMission,tiles=root.VeilpointAdenCityTiles;
 const canvas=get('map'),ctx=canvas.getContext('2d');
 const data=root.VeilpointAdenPlayableData;
 let runtime;
 try{runtime=game.prepare(data);}
 catch(_){get('objective').textContent='지도 데이터를 열 수 없습니다';return;}
 const key='veilpoint.aden.story.v1';
 const controls={view:get('view'),action:get('action'),reset:get('reset')};
 let state=game.create(runtime),yaw=runtime.corridor.yaw,pitch=0;
 let eye=false,zoom=3,resetArmed=false,frame=0,last=0,accum=0,paintTicks=0;
 const held=new Set();
 const movementKeys=['KeyW','KeyA','KeyS','KeyD'];
 const bearingKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
 const byPoint=(x,z)=>runtime.world.cache.get(tiles.tileFor(x,z).key)?.mesh;
 const roadColor='#eef0de',footprintColor='#b78965',targetColor='#f5d888';
 const layer=[
  ...runtime.roads.map(points=>{
   const x=points.map(p=>p[0]),z=points.map(p=>p[1]);
   return {points,closed:false,minX:Math.min(...x),maxX:Math.max(...x),
    minZ:Math.min(...z),maxZ:Math.max(...z)};
  }),
  ...runtime.world.solids.map(lot=>({...lot,points:lot.outline,closed:true}))
 ];
 get('credit-vector').textContent=data.vectorAttribution+' · '+data.acquiredDate;
 get('credit-terrain').textContent=data.terrainAttribution;
 try{
  const raw=root.localStorage.getItem(key);
  if(raw)state=game.load(runtime,raw);
 }catch(_){get('saved').textContent='이전 저장을 불러올 수 없습니다.';}
 function save(){
  try{
   const raw=game.save(runtime,state);
   root.localStorage.setItem(key,raw);
   if(root.localStorage.getItem(key)!==raw)throw Error('Save check failed');
   get('saved').textContent='이 지점까지 자동 저장됨';
  }catch(_){get('saved').textContent='브라우저 저장 불가 · 이 탭에 진행 유지';}
 }
 function updateChapter(){
  const next=game.current(runtime,state);
  get('phase').textContent=next?'현장 확인 '+(state.events.length+1)+' / 3':'현장 인계 완료';
  get('objective').textContent=next?.label||'마지막 방송 · 임무 완료';
  get('entries').replaceChildren(...state.events.map((_,i)=>{
   const li=doc.createElement('li');li.textContent=game.SCENES[i].journal;return li;
  }));
  get('entries-count').textContent=String(state.events.length);
  get('report').hidden=true;
 }
 function interact(report){
  const result=game.interact(runtime,state,report);
  if(!result.ok){
   if(result.reason==='choose-report'){get('report').hidden=false;release();}
   if(result.reason==='unsupported-report')get('dialogue').textContent='살마: 04:07과 04:12라는 시각만으로 두 건이라고 적을 수는 없어요. 앞에서 대조한 내용을 다시 확인해 주세요.';
   return;
  }
  state=result.state;
  get('dialogue').textContent=result.line;
  updateChapter();save();paint();
 }
 function paint(){
  const w=canvas.width,h=canvas.height,player=state.walker;
  const next=game.current(runtime,state);
  const metres=next?game.distance(player,next):0;
  get('distance').textContent=next?metres.toFixed(1)+' m · '+(metres<=game.REACH?'상호작용 범위':'지점까지 직선 거리'):
   '총 이동 '+state.metres.toFixed(1)+' m';
  controls.action.disabled=!next||metres>game.REACH;
  get('scale').textContent=eye?'눈높이 · '+player.y.toFixed(1)+' m':'20 m';
  if(eye){
   const found=new Map([...runtime.world.cache].filter(([k])=>{
    const {tx,tz}=tiles.parseTileKey(k);
    return Math.hypot((tx+.5)*512-player.x,(tz+.5)*512-player.z)<550;
   }));
   const groundLines=layer.filter(l=>l.minX<=player.x+320&&l.maxX>=player.x-320&&
    l.minZ<=player.z+320&&l.maxZ>=player.z-320);
   root.VeilpointAdenStreetPerspective.draw(canvas,runtime.world.registry,found,player,yaw,[],pitch,{groundLines});
   if(next){
    const ground=tiles.heightOnTerrainMesh(byPoint(next.x,next.z),next.x,next.z);
    const camera=root.VeilpointAdenStreetPerspective;
    const point=camera.project({x:player.x,y:player.y+camera.EYE_HEIGHT,z:player.z},
     yaw,{x:next.x,y:ground+.3,z:next.z},w,h,undefined,pitch);
    if(point&&point.x>=0&&point.x<=w&&point.y>=0&&point.y<=h){
     ctx.fillStyle=targetColor;ctx.beginPath();ctx.arc(point.x,point.y,6,0,2*Math.PI);ctx.fill();
    }
   }
   return;
  }
  const xy=(x,z)=>[w/2+(x-player.x)*zoom,h/2+(z-player.z)*zoom];
  function path(points,closed){
   ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
   if(closed)ctx.closePath();
  }
  const outside=(minX,maxX,minZ,maxZ)=>minX>player.x+w/(2*zoom)||maxX<player.x-w/(2*zoom)||
    minZ>player.z+h/(2*zoom)||maxZ<player.z-h/(2*zoom);
  ctx.fillStyle='#13282d';ctx.fillRect(0,0,w,h);
  for(const {mesh,sourceTile} of runtime.world.cache.values()){
   const b=tiles.tileBounds(sourceTile.tx,sourceTile.tz);
   if(outside(b.minX,b.maxX,b.minZ,b.maxZ))continue;
   const {positions:p,triangles:t}=mesh;
   for(let i=0;i<t.length;i+=3){
    const triangle=[t[i],t[i+1],t[i+2]].map(j=>p.slice(j*3,j*3+3));
    const x=triangle.map(v=>v[0]),z=triangle.map(v=>v[2]);
    if(outside(Math.min(...x),Math.max(...x),Math.min(...z),Math.max(...z)))continue;
    ctx.fillStyle=root.VeilpointAdenMapRelief.triangleColor(...triangle);
    path(triangle.map(v=>xy(v[0],v[2])),true);ctx.fill();
   }
  }
  for(const lot of runtime.world.solids){
   if(outside(lot.minX,lot.maxX,lot.minZ,lot.maxZ))continue;
   ctx.fillStyle=footprintColor;ctx.strokeStyle='#76533a';ctx.lineWidth=1;
   path(lot.outline.map(p=>xy(...p)),true);ctx.fill();ctx.stroke();
  }
  ctx.strokeStyle=roadColor;ctx.lineWidth=1.7;
  for(const road of runtime.roads){path(road.map(p=>xy(...p)),false);ctx.stroke();}
  if(next){
   const [x,y]=xy(next.x,next.z);
   const clampedX=Math.max(16,Math.min(w-16,x)),clampedY=Math.max(18,Math.min(h-18,y));
   ctx.fillStyle=targetColor;ctx.beginPath();ctx.arc(clampedX,clampedY,6,0,2*Math.PI);ctx.fill();
  }
  ctx.fillStyle='#173d4a';ctx.strokeStyle='#e9f2ed';ctx.lineWidth=2;
  path([[0,-9],[-6,6],[6,6]].map(([x,y])=>[w/2+x*Math.cos(yaw)-y*Math.sin(yaw),
   h/2+x*Math.sin(yaw)+y*Math.cos(yaw)]),true);ctx.fill();ctx.stroke();
  ctx.strokeStyle=roadColor;ctx.lineWidth=2;
  path([[w-25-20*zoom,h-40],[w-25,h-40]],false);ctx.stroke();
 }
 function fit(){
  canvas.width=Math.max(1,Math.round(canvas.clientWidth));
  canvas.height=Math.max(1,Math.round(canvas.clientHeight));
  paint();
 }
 function view(){
  eye=!eye;
  if(!eye&&doc.pointerLockElement===canvas)doc.exitPointerLock();
  controls.view.setAttribute('aria-pressed',String(eye));
  controls.view.textContent=eye?'V · 위에서 보기':'V · 눈높이 보기';
  get('zoom-in').disabled=get('zoom-out').disabled=eye;
  paint();
 }
 function step(now){
  frame=0;
  if(!held.size||doc.hidden)return;
  if(last)accum+=Math.min(75,now-last);
  last=now;
  while(accum>=1000/60){
   accum-=1000/60;paintTicks++;
   yaw+=(Number(held.has('ArrowRight'))-Number(held.has('ArrowLeft')))*.035;
   pitch=Math.max(-.85,Math.min(.85,pitch+(Number(held.has('ArrowUp'))-Number(held.has('ArrowDown')))*.022));
   const angle=eye?yaw:0;
   const lateral=Number(held.has('KeyD'))-Number(held.has('KeyA'));
   const longitudinal=Number(held.has('KeyS'))-Number(held.has('KeyW'));
   const magnitude=Math.max(1,Math.hypot(lateral,longitudinal));
   const side=lateral/magnitude,back=longitudinal/magnitude;
   state=game.move(runtime,state,{east:side*Math.cos(angle)-back*Math.sin(angle),
    south:side*Math.sin(angle)+back*Math.cos(angle)});
  }
  if(paintTicks>=(eye?5:2)){paintTicks=0;paint();}
  frame=root.requestAnimationFrame(step);
 }
 function release(){
  if(frame)root.cancelAnimationFrame(frame);
  held.clear();frame=0;last=0;accum=0;
  paint();
 }
 doc.addEventListener('keydown',e=>{
  if(e.altKey||e.metaKey||e.ctrlKey||e.target?.closest?.('button,summary,a,input'))return;
  if(!e.repeat&&!get('report').hidden&&['Digit1','Digit2','Escape'].includes(e.code)){
   e.preventDefault();
   if(e.code==='Escape')get('report').hidden=true;
   else interact(e.code==='Digit1'?'retransmission':'separate');
   return;
  }
  if(!e.repeat&&e.code==='KeyV'){e.preventDefault();view();return;}
  if(!e.repeat&&e.code==='KeyF'){e.preventDefault();interact();return;}
  if(!movementKeys.includes(e.code)&&!(eye&&bearingKeys.includes(e.code)))return;
  e.preventDefault();get('report').hidden=true;held.add(e.code);
  if(!frame)frame=root.requestAnimationFrame(step);
 });
 doc.addEventListener('keyup',e=>{if(held.delete(e.code)&&!held.size)release();});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)release();});
 root.addEventListener('blur',release);
 doc.addEventListener('pointerlockchange',()=>{if(doc.pointerLockElement!==canvas)release();});
 doc.addEventListener('mousemove',e=>{
  if(!eye||doc.pointerLockElement!==canvas)return;
  yaw+=e.movementX*.003;pitch=Math.max(-.85,Math.min(.85,pitch-e.movementY*.002));
  if(!held.size)paint();
 });
 canvas.addEventListener('click',()=>{
  canvas.focus();
  if(eye&&doc.pointerLockElement!==canvas)try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch(_){}
 });
 get('zoom-in').addEventListener('click',()=>{zoom=Math.min(9,zoom*1.3);canvas.focus();paint();});
 get('zoom-out').addEventListener('click',()=>{zoom=Math.max(.2,zoom/1.3);canvas.focus();paint();});
 controls.view.addEventListener('click',()=>{view();canvas.focus();});
 controls.action.addEventListener('click',()=>{interact();canvas.focus();});
 get('report-known').addEventListener('click',()=>{interact('retransmission');canvas.focus();});
 get('report-unknown').addEventListener('click',()=>{interact('separate');canvas.focus();});
 controls.reset.addEventListener('click',()=>{
  if(!resetArmed){resetArmed=true;controls.reset.textContent='한 번 더 누르면 재시작';return;}
  resetArmed=false;
  controls.reset.textContent='임무 재시작';state=game.create(runtime);yaw=runtime.corridor.yaw;pitch=0;
  get('dialogue').textContent='이수혁: 최초 수신 기록부터 확인하겠습니다.';
  release();updateChapter();save();canvas.focus();paint();
 });
 root.addEventListener('resize',fit);
 updateChapter();fit();canvas.focus();
})(globalThis);
