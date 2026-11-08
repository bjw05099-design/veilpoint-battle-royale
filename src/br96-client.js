/* VEILPOINT BR96 local Windows PC field-test client.
 * Authenticated server snapshots are authoritative; never infer hidden rivals.
 * The page is a top-down movement diagnostic, not a finished FPS renderer.
 */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const canvas=el('map'),ctx=canvas.getContext('2d');
const SESSION='veilpoint.br96.tabSession';
const keys=new Set();
let token=null,state=null,seq=0,moveBusy=false,pollBusy=false;
let sprintIntent=false,lastSprint=null,lastWorldTick=-1,lastStatus='';
let consecutiveErrors=0;
try{const stored=sessionStorage.getItem(SESSION);if(stored&&/^[a-f0-9]{64}$/.test(stored))token=stored;}catch(_){}
function message(value){if(value!==lastStatus){lastStatus=value;el('status').textContent=value;}}
function cleanSession(){
 token=null;state=null;seq=0;lastWorldTick=-1;lastSprint=null;sprintIntent=false;keys.clear();
 try{sessionStorage.removeItem(SESSION);}catch(_){}
 render();
}
async function request(path,payload=null,authenticated=true){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
 try{
  const response=await fetch(path,{method:payload===null?'GET':'POST',
   headers:{...(payload===null?{}:{'content-type':'application/json'}),
    ...(authenticated&&token?{'x-player-token':token}:{})},
   ...(payload===null?{}:{body:JSON.stringify(payload)}),signal:controller.signal,
   cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||data.reason||('HTTP '+response.status));
  return data;
 }finally{clearTimeout(timer);}
}
function apply(next){
 if(!next||typeof next!=='object'||!next.self)return;
 // Polls or returned commands can be delivered out of order. Never roll
 // an authenticated 60Hz snapshot backward to an older world tick.
 if(next.world&&next.world.tick<lastWorldTick)return;
 if(next.world)lastWorldTick=next.world.tick;
 state=next;consecutiveErrors=0;
 render();
}
function currentWorld(){return state&&state.world&&state.world.mode==='br-96-traversal-prototype'?state.world:null;}
function active(){const w=currentWorld();return !!token&&!!w&&w.phase==='moving'&&w.self?.eligible;}
function render(){
 const w=currentWorld();
 el('join').disabled=!!token;
 el('invite').disabled=!token||state?.phase!=='assembling';
 el('leave').disabled=!token||state?.phase!=='assembling';
 el('ready').disabled=!token||state?.phase!=='assembling';
 el('ready').textContent=state?.self?.ready?'준비 취소':'준비';
 for(const id of ['regroup','location','sprint'])el(id).disabled=!active();
 el('sprint').textContent=sprintIntent?'달리기 ON':'달리기 OFF';
 el('sprint').setAttribute('aria-pressed',String(sprintIntent));
 const members=Array.isArray(state?.squad)?state.squad:[];
 const self=state?.self;
 el('roster').textContent=members.length
  ?'우리 분대\n'+members.map((m,i)=>(i+1)+'. '+(m?m.name+' · '+(m.ready?'준비':'대기'):'빈 좌석')).join('\n')
  :'분대 대기 중';
 el('details').textContent=state
  ?'전체 '+state.participants+'/'+state.capacity+'명 · 준비 '+state.readyCount+'/'+state.capacity+
   '\n본인 #'+self.id+' · '+self.squad+'분대 '+self.slot+'번'+
   '\n단계: '+state.phase+
   (w?'\n서버 틱 '+w.tick+' · 남은 분대 '+w.remainingSquads+
    '\n체력/탄약: 현재 BR96 이동 프로토타입에 없음'+
    '\n지구력 '+Math.round(w.self.stamina)+'/100 · 경계 '+w.playableArea.stage+
    '\n우리 분대 발견 장소 '+(w.squadLandmarks?.length||0)+
    (w.squadSignal?'\n분대 신호: '+w.squadSignal.kind:''):'\n96명 전원 준비 시 이동 시작')
  :'접속 전';
 draw(w);
}
function draw(w){
 const width=canvas.width,height=canvas.height;
 ctx.clearRect(0,0,width,height);
 ctx.fillStyle='#12262c';ctx.fillRect(0,0,width,height);
 const scale=Math.min(width,height)/350;
 const x=v=>width/2+v*scale,z=v=>height/2+v*scale;
 ctx.strokeStyle='#304c53';ctx.lineWidth=1;
 for(let m=-150;m<=150;m+=50){
  ctx.beginPath();ctx.moveTo(x(m),z(-175));ctx.lineTo(x(m),z(175));ctx.stroke();
  ctx.beginPath();ctx.moveTo(x(-175),z(m));ctx.lineTo(x(175),z(m));ctx.stroke();
 }
 if(!w)return;
 // Only public rule geometry and the authenticated, already-filtered
 // snapshot are drawn. The client does NOT know unobserved opponents.
 ctx.strokeStyle='#99cfd5';ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(x(w.playableArea.cx),z(w.playableArea.cz),w.playableArea.radius*scale,0,Math.PI*2);ctx.stroke();
 function dot(p,color,r){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(p.x),z(p.z),r,0,Math.PI*2);ctx.fill();
 }
 for(const site of w.squadLandmarks||[])dot(site,'#9eabb2',4);
 for(const rival of w.visible||[])dot(rival,'#ef897e',6);
 for(const mate of w.squad||[])if(mate.id!==w.self.id)dot(mate,'#8cb6e6',6);
 if(w.squadSignal)dot(w.squadSignal,'#e7d189',8);
 dot(w.self,'#b7eca9',8);
 ctx.fillStyle='#d7e9e8';ctx.font='15px system-ui';
 ctx.fillText('AUTHORITY / SERVER TICK '+w.tick,14,26);
}
async function join(){
 if(token)return;
 el('join').disabled=true;
 try{
  const name=el('name').value.trim(),invite=el('inviteCode').value.trim();
  if(!name)throw Error('이름을 입력하세요');
  const body=invite?{name,inviteCode:invite}:{name};
  const data=await request('/join',body,false);
  token=data.token;
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('잘못된 세션 응답');
  try{sessionStorage.setItem(SESSION,token);}catch(_){}
  apply(data.state);message('서버 입장 완료 · 준비 버튼으로 참여 의사를 표시하세요.');
 }catch(error){message('입장 실패: '+error.message);render();}
}
async function command(path,body,statusText){
 if(!token)return;
 try{
  const data=await request(path,body);
  if(data.state)apply(data.state);
  if(data.world&&state)apply({...state,world:data.world});
  if(statusText)message(statusText);
  return data;
 }catch(error){
  if(error.message==='unknown_session'){cleanSession();message('세션 만료 · 새로 입장하세요.');}
  else message('서버 응답: '+error.message);
  return null;
 }
}
async function ready(){
 if(state?.phase!=='assembling')return;
 await command('/ready',{ready:!state.self.ready},'준비 상태를 서버에 전달했습니다.');
}
async function leave(){
 if(state?.phase!=='assembling')return;
 const answer=await command('/leave',{},null);
 if(answer?.ok){cleanSession();message('대기실에서 퇴장했습니다.');}
}
async function invite(){
 const answer=await command('/squad-invite',{},null);
 if(answer?.ok)message('우리 분대 초대 코드: '+answer.code+' · 함께 참가할 사람에게만 전달하세요.');
}
async function signal(kind){if(active())await command('/signal',{kind},'실제 현재 위치 기반 분대 신호를 요청했습니다.');}
function canUseKeyboard(event){
 return !event.ctrlKey&&!event.metaKey&&!event.altKey&&
   !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
}
document.addEventListener('keydown',event=>{
 if(!canUseKeyboard(event))return;
 const key=event.code;
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight'].includes(key)){
  keys.add(key);event.preventDefault();
 }else if(!event.repeat&&key==='KeyQ'&&active()){event.preventDefault();signal('regroup');}
 else if(!event.repeat&&key==='KeyE'&&active()){event.preventDefault();signal('location');}
});
document.addEventListener('keyup',event=>{keys.delete(event.code);});
function resetKeys(){keys.clear();sprintIntent=false;lastSprint=null;render();}
window.addEventListener('blur',resetKeys);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetKeys();});
function direction(){
 if(document.hidden||!document.hasFocus())return {dx:0,dz:0};
 const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
 const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
 const len=Math.hypot(dx,dz)||1;
 return {dx:dx/len,dz:dz/len};
}
async function movement(){
 if(!active()||moveBusy)return;
 moveBusy=true;
 try{
  const dir=direction();
  await request('/move',{...dir,seq:++seq});
  const newSprint=sprintIntent||keys.has('ShiftLeft')||keys.has('ShiftRight');
  if(newSprint!==lastSprint){
   lastSprint=newSprint;
   await request('/pace',{sprint:newSprint});
  }
 }catch(error){
  consecutiveErrors++;
  if(consecutiveErrors>=2)message('이동 서버 연결 확인 필요 · 입력을 재시도합니다.');
 }finally{moveBusy=false;}
}
async function poll(){
 if(!token||pollBusy)return;
 pollBusy=true;
 try{apply(await request('/state'));}
 catch(error){
  consecutiveErrors++;
  if(error.message==='unknown_session'){cleanSession();message('세션이 유효하지 않습니다. 다시 참가하세요.');}
  else if(consecutiveErrors>=2)message('서버 응답 지연 · 재연결을 확인하세요.');
 }finally{pollBusy=false;}
}
el('join').addEventListener('click',join);
el('ready').addEventListener('click',ready);
el('leave').addEventListener('click',leave);
el('invite').addEventListener('click',invite);
el('regroup').addEventListener('click',()=>signal('regroup'));
el('location').addEventListener('click',()=>signal('location'));
el('sprint').addEventListener('click',()=>{sprintIntent=!sprintIntent;render();});
render();if(token)poll();
setInterval(poll,400);
setInterval(movement,180);
})();