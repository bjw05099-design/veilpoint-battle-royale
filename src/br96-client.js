/* VEILPOINT BR96 local Windows PC field-test client.
 * Authenticated server snapshots are authoritative; never infer hidden rivals.
 * The page is a top-down movement diagnostic, not a finished FPS renderer.
 */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const canvas=el('map'),ctx=canvas.getContext('2d');
const SESSION='veilpoint.br96.tabSession';
// No sound without an explicit, foreground player click; the soundtrack is
// synthesized locally from the authenticated player's own environment only.
const mapCamera=window.VeilpointBR96MapCamera;
const harborAudio=window.VeilpointBR96Audio?.create({
 AudioContextClass:window.AudioContext||window.webkitAudioContext||null
})||null;
const AudioPrefs=window.VeilpointAudioPreferences||null;
const localAudioStorage=(()=>{try{return window.localStorage;}catch(_){return null}})();
const audioControls=AudioPrefs?.attach(document,localAudioStorage,prefs=>{
 harborAudio?.setVolume(AudioPrefs.gain(prefs,'ambience'));
 if(!prefs.enabled)harborAudio?.disable();
})||null;
// Default-ON never means bypassing browser autoplay protection. The first
// ordinary *player* pointer/keyboard gesture unlocks an opt-in local graph.
function unlockDefaultAudio(){
 if(!harborAudio?.available()||harborAudio.enabled()||
   (audioControls&&!audioControls.get().enabled))return;
 if(harborAudio.enable()&&active())
  harborAudio.update(currentWorld().self.surface,currentWorld().coastalWeather);
}
document.addEventListener('pointerdown',unlockDefaultAudio,true);
document.addEventListener('keydown',event=>{
 if(!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey)unlockDefaultAudio();
},true);

const keys=new Set();
let token=null,state=null,seq=0,moveBusy=false,pollBusy=false;
let sprintIntent=false,lastSprint=null,lastCrouch=null,lastWorldTick=-1,lastStatus='';
let consecutiveErrors=0;
let publicGeometry=null,publicEnvironment=null,geometryBusy=false;
let withdrawArmedUntil=0,watchOptionsSignature='',mapFollow=false,mapZoomLevel=0;
try{const stored=sessionStorage.getItem(SESSION);if(stored&&/^[a-f0-9]{64}$/.test(stored))token=stored;}catch(_){}
function message(value){if(value!==lastStatus){lastStatus=value;el('status').textContent=value;}}
function cleanSession(){
 harborAudio?.disable();
 token=null;state=null;seq=0;lastWorldTick=-1;lastSprint=null;lastCrouch=null;sprintIntent=false;keys.clear();
 publicGeometry=null;publicEnvironment=null;geometryBusy=false;
 withdrawArmedUntil=0;watchOptionsSignature='';mapFollow=false;mapZoomLevel=0;
 el('standingsPanel').hidden=true;
 el('standingsToggle').setAttribute('aria-expanded','false');
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
 // An explicitly consented new round resets the server tick to zero.
 // Compare (roundNumber,tick), never reject a valid replay as a stale poll.
 if(state&&Number.isInteger(state.roundNumber)&&Number.isInteger(next.roundNumber)){
  if(next.roundNumber<state.roundNumber)return;
  if(next.roundNumber>state.roundNumber){
   seq=0;lastWorldTick=-1;lastSprint=null;lastCrouch=null;sprintIntent=false;
   keys.clear();withdrawArmedUntil=0;mapFollow=false;mapZoomLevel=0;
   message('전원 동의로 새 BR96 라운드가 시작됐습니다.');
  }
 }
 if(next.world&&next.world.tick<lastWorldTick)return;
 if(next.world){
   lastWorldTick=next.world.tick;
   // Recover the current server sequence after a legitimate tab reload:
   // a freshly loaded page must not be trapped sending stale seq=1 forever.
   if(Number.isSafeInteger(next.world.self?.seq))
     seq=Math.max(seq,next.world.self.seq);
 }
 state=next;consecutiveErrors=0;
 render();
}
function currentWorld(){return state&&state.world&&state.world.mode==='br-96-traversal-prototype'?state.world:null;}
function active(){const w=currentWorld();return !!token&&!!w&&w.phase==='moving'&&w.self?.eligible;}
function render(){
 const w=currentWorld();
 if(w&&!publicGeometry&&!geometryBusy)loadPublicGeometry();
 if(active()&&harborAudio?.enabled())harborAudio.update(w.self.surface,w.coastalWeather);
 const soundWanted=audioControls?audioControls.get().enabled:!!harborAudio?.enabled();
 el('soundToggle').disabled=!harborAudio?.available();
 el('soundToggle').textContent=soundWanted?'소리 ON':'소리 OFF';
 el('soundToggle').setAttribute('aria-pressed',String(soundWanted));
 el('mapFollow').disabled=!w;
 el('mapFollow').setAttribute('aria-pressed',String(mapFollow&&!!w));
 el('mapFollow').title=mapFollow?'M: 전체 지도 · +/−: 내 위치 지도 확대/축소':'M: 내 위치 따라가기';
 el('mapFollow').textContent=mapFollow&&w?
   (w.spectatorView?'M · 아군 추적':'M · 내 위치 확대'):'M · 주변 지도';
 el('join').disabled=!!token;
 el('invite').disabled=!token||state?.phase!=='assembling';
 el('leave').disabled=!token||state?.phase!=='assembling';
 el('ready').disabled=!token||state?.phase!=='assembling';
 el('ready').textContent=state?.self?.ready?'준비 취소':'준비';
 el('replayConsent').disabled=!token||w?.phase!=='finished';
 el('replayConsent').textContent=(state?.replay?.own?'재경기 동의 취소':'새 경기 동의')+
   (state?.replay?' '+state.replay.requested+'/'+state.replay.required:'');
 const entryOptions=state?.entry?.options||[];
 const selectedEntry=entryOptions.find(o=>o.id===state?.entry?.selfChoice);
 el('entryVote').disabled=!token||state?.phase!=='assembling'||!!state?.self?.ready;
 el('entryVote').textContent='출발 투표: '+(selectedEntry?.label||'미선택');
 for(const id of ['regroup','location','sprint','civicGate'])el(id).disabled=!active();
 // A withdrawn player may watch only the server's own eligible squad mates.
 // Build select entries with textContent, never insert untrusted names as HTML.
 const retired=!!w&&w.phase==='moving'&&!w.self.eligible;
 const eligibleMates=retired?w.squad.filter(p=>p.id!==w.self.id&&p.eligible):[];
 const signature=eligibleMates.map(p=>p.slot+':'+p.id).join('|');
 const select=el('watchSlot');
 if(signature!==watchOptionsSignature){
  const previous=select.value;
  const first=document.createElement('option');first.value='';first.textContent='선택';
  const entries=eligibleMates.map(p=>{
   const option=document.createElement('option');
   option.value=String(p.slot);option.textContent=p.slot+'번 분대원';
   return option;
  });
  select.replaceChildren(first,...entries);
  if(entries.some(option=>option.value===previous))select.value=previous;
  else if(w.spectatorView&&
    entries.some(option=>option.value===String(w.spectatorView.slot)))
    select.value=String(w.spectatorView.slot);
  else if(entries.length)select.value=entries[0].value;
  watchOptionsSignature=signature;
 }
 select.disabled=!retired||eligibleMates.length===0;
 el('spectate').disabled=select.disabled;
 el('withdraw').disabled=!active();
 el('withdraw').textContent=Date.now()<withdrawArmedUntil?'다시 누르면 경기 포기':'경기 포기';
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
   '\n단계: '+state.phase+(state.roundNumber?' · '+state.roundNumber+'회차':'')+
   (state.entry?'\n분대 출발 예정: '+
     (state.entry.options.find(o=>o.id===state.entry.choice)?.label||'기본 접근로')+
     ' · 득표 '+state.entry.options.map(o=>o.label+' '+(state.entry.tally[o.id]||0)).join(' / '):'')+
   (w?'\n서버 틱 '+w.tick+' · 남은 분대 '+w.remainingSquads+
    '\n체력/탄약: 현재 BR96 이동 프로토타입에 없음'+
    '\n지구력 '+Math.round(w.self.stamina)+'/100'+(w.self.resting?' · 휴식 회복 중':'')+' · 자세 '+(w.self.crouched?'낮춘 자세':'서기')+' · 경계 '+w.playableArea.stage+
    (w.playableArea.changing?' · 다음 경계 '+Math.round(w.playableArea.ticksUntilChange/60)+'초 후':'')+
    '\n우리 분대 발견 장소 '+(w.squadLandmarks?.length||0)+
    (w.self.surface?.wet?('\n바닥: '+(w.self.surface.waveActive?'잔물결 유입':'젖은 적재장')+
      ' · 이동 효율 '+Math.round(w.self.surface.mobility*100)+'%'):'')+
    (w.civicGate?'\n여객 문: '+w.civicGate.state:'')+
    (w.squadRoute?'\n분대 이동 합의: '+(w.squadRoute.target?.label||'투표 진행 중')+
      ' · 투표 '+Object.values(w.squadRoute.tally).reduce((sum,n)=>sum+n,0)+'/'+w.squadRoute.eligibleMembers+
      (w.squadRoute.target?' · 현장 도착 '+w.squadRoute.arrived+'명':''):'')+
    '\n현재 참가 '+(w.standings?.[self.squad-1]?.eligibleMembers??'?')+'/6'+
    (w.standings?.[self.squad-1]?.placement!==null&&
     w.standings?.[self.squad-1]?.placement!==undefined
     ?' · 확정 '+w.standings[self.squad-1].placement+'위':'')+
    (w.spectatorView?'\n관전 대상: '+w.spectatorView.slot+'번 분대원'+
      (w.spectatorView.automaticFallback?' · 기존 대상 퇴장으로 자동 전환':''):
      retired?'\n본인 경기 포기 · 아군 관전 선택 가능':'')+
    (w.squadSignal?'\n분대 신호: '+w.squadSignal.kind:'')+
    (w.matchOutcome?'\n최종 결과: '+
     (w.matchOutcome.kind==='shared_tie'?'모든 분대 동시 종료 · 공동 순위':
       w.matchOutcome.kind==='squad_win'?'우리 분대 우승':
       '우리 분대 '+w.matchOutcome.ownSquadPlacement+'위')+
     (w.matchOutcome.winningSquad===null?'':' · 우승 분대 '+w.matchOutcome.winningSquad):''):'\n96명 전원 준비 시 이동 시작')
  :'접속 전';
 draw(w);
 renderStandings(w);
}
function renderStandings(w){
 // Only the server's 16-slot public standings may assign a placement.
 // In-progress teams have no guessed ranking, even if they are outnumbered.
 const entries=Array.isArray(w?.standings)&&w.standings.length===16?w.standings:null;
 const tiles=el('standingsGrid').querySelectorAll('.standings-tile');
 for(let i=0;i<16;i++){
  const tile=tiles[i],entry=entries?.[i];
  if(!tile)continue;
  const valid=entry&&entry.squad===i+1&&
   Number.isInteger(entry.eligibleMembers)&&entry.eligibleMembers>=0&&
   entry.eligibleMembers<=6&&
   (entry.placement===null||
    (Number.isInteger(entry.placement)&&entry.placement>=1&&entry.placement<=16));
  tile.classList.toggle('own',w?.self?.squad===i+1);
  const label=tile.children[1];
  if(!label)continue;
  label.textContent=valid
   ?(entry.placement===null?'진행 중':'확정 '+entry.placement+'위')+
     ' · '+entry.eligibleMembers+'/6명'
   :'시작 전 · 미확정';
 }
}
function toggleStandings(open){
 const panel=el('standingsPanel'),next=typeof open==='boolean'?open:panel.hidden;
 panel.hidden=!next;
 el('standingsToggle').setAttribute('aria-expanded',String(next));
 if(next){
  // A player checking the score must not keep moving while the keyboard
  // focus belongs to the visible overlay; the next 180ms input is neutral.
  keys.clear();sprintIntent=false;lastSprint=null;
  renderStandings(currentWorld());
  el('standingsClose').focus({preventScroll:true});
 }else el('standingsToggle').focus({preventScroll:true});
}
function draw(w){
 const width=canvas.width,height=canvas.height;
 ctx.clearRect(0,0,width,height);
 ctx.fillStyle='#12262c';ctx.fillRect(0,0,width,height);
 // Follow ONLY the authenticated self, or the server-authorized same-squad
 // spectatorView. Never center on enemy markers or client-supplied positions.
 const followSubject=w?.spectatorView||w?.self||null;
 const view=mapCamera.create({width,height,follow:mapFollow,subject:followSubject,zoomLevel:mapZoomLevel});
 const scale=view.scale,x=view.x,z=view.z;
 ctx.strokeStyle='#304c53';ctx.lineWidth=1;
 for(let m=-150;m<=150;m+=50){
  ctx.beginPath();ctx.moveTo(x(m),z(-175));ctx.lineTo(x(m),z(175));ctx.stroke();
  ctx.beginPath();ctx.moveTo(x(-175),z(m));ctx.lineTo(x(175),z(m));ctx.stroke();
 }
 if(!w)return;
 // The fictional loading apron is the SAME named ground footprint that
 // changes the 60Hz movement budget. The player can see why their walking
 // pace changes instead of encountering an invisible slowdown.
 if(publicEnvironment?.wetLoadingPad){
  const pad=publicEnvironment.wetLoadingPad;
  ctx.fillStyle='#285961';
  ctx.fillRect(x(pad.x-pad.width/2),z(pad.z-pad.depth/2),
    pad.width*scale,pad.depth*scale);
  ctx.strokeStyle='#79a9a9';ctx.lineWidth=1.5;
  ctx.strokeRect(x(pad.x-pad.width/2),z(pad.z-pad.depth/2),
    pad.width*scale,pad.depth*scale);
 }
 // Draw the same PUBLIC fictional building footprints used by server-owned
 // 60Hz collision: wide sidewalks remain visible, walls are not magic.
 // Static urban objects are downloaded once per valid match, never mixed into
 // private rival snapshots or invented from the 2D canvas renderer.
 if(publicGeometry){
  for(const solid of publicGeometry){
   if(!Number.isFinite(solid.x)||!Number.isFinite(solid.z)||
      !Number.isFinite(solid.w)||!Number.isFinite(solid.d)||
      solid.w<=0||solid.d<=0)continue;
   ctx.fillStyle=solid.type==='building'||solid.type==='dock-warehouse'?'#526970':
     solid.type?.includes('wall')?'#4d6265':
     solid.type?.includes('counter')||solid.type?.includes('bench')?'#a28c67':'#405358';
   ctx.fillRect(x(solid.x-solid.w/2),z(solid.z-solid.d/2),
     solid.w*scale,solid.d*scale);
  }
 }
 // The public sliding panel is NOT in the once-downloaded map. Its actual
 // position is simulated by the server each 60Hz tick for all 96 players.
 if(w.civicGate){
   const g=w.civicGate;
   ctx.fillStyle=g.state==='closed'?'#dcb573':'#9dcdbb';
   ctx.fillRect(x(g.x-g.w/2),z(g.z-g.d/2),g.w*scale,Math.max(2,g.d*scale));
 }
 // Only public rule geometry and the authenticated, already-filtered
 // snapshot are drawn. The client does NOT know unobserved opponents.
 ctx.strokeStyle='#99cfd5';ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(x(w.playableArea.cx),z(w.playableArea.cz),w.playableArea.radius*scale,0,Math.PI*2);ctx.stroke();
 // Dashed public destination is announced by the same server schedule.
 // It is not an opponent tracker, GPS marker, or client-generated objective.
 if(w.playableArea.changing&&w.playableArea.target){
  const t=w.playableArea.target;
  ctx.save();ctx.setLineDash([7,5]);ctx.lineWidth=1.5;
  ctx.strokeStyle='#e9c58b';
  ctx.beginPath();ctx.arc(x(t.cx),z(t.cz),t.radius*scale,0,Math.PI*2);ctx.stroke();
  ctx.restore();
 }
 function dot(p,color,r){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(p.x),z(p.z),r,0,Math.PI*2);ctx.fill();
 }
 for(const site of w.squadLandmarks||[])dot(site,'#9eabb2',4);
 if(w.squadRoute?.target){
  dot(w.squadRoute.target,'#c9aef6',9);
  ctx.fillStyle='#e6d7fb';ctx.font='12px system-ui';
  ctx.fillText('SQUAD ROUTE',x(w.squadRoute.target.x)+11,z(w.squadRoute.target.z)-10);
 }
 for(const rival of w.visible||[])dot(rival,'#ef897e',6);
 for(const mate of w.squad||[])if(mate.id!==w.self.id)dot(mate,'#8cb6e6',6);
 if(w.squadSignal)dot(w.squadSignal,'#e7d189',8);
 if(w.spectatorView){
  dot(w.spectatorView,'#e9d093',9);
  ctx.strokeStyle='#f4e0a3';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(x(w.spectatorView.x),z(w.spectatorView.z),13,0,Math.PI*2);ctx.stroke();
 }
 dot(w.self,w.self.eligible?'#b7eca9':'#6f7e83',w.self.eligible?8:4);
 ctx.fillStyle='#d7e9e8';ctx.font='15px system-ui';
 ctx.fillText('AUTHORITY / SERVER TICK '+w.tick,14,26);
 ctx.font='13px system-ui';
 ctx.fillText(view.mode==='follow'?'NEARBY 110m · LOCAL VERIFIED VIEW':
   'FULL CITY 350m · SERVER PUBLIC GEOMETRY',14,47);
 // Real 20-metre ruler in both camera modes, not a fake fixed-pixel bar.
 ctx.strokeStyle='#bdd7d4';ctx.lineWidth=3;
 const rulerY=height-19;
 ctx.beginPath();ctx.moveTo(14,rulerY);ctx.lineTo(14+20*scale,rulerY);ctx.stroke();
 ctx.fillStyle='#bdd7d4';ctx.fillText('20m',14,rulerY-7);
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
async function voteEntry(){
 if(!token||state?.phase!=='assembling'||state?.self?.ready)return;
 const options=state?.entry?.options||[];
 if(!options.length)return;
 const current=options.findIndex(o=>o.id===state.entry.selfChoice);
 const choice=options[(current+1)%options.length].id;
 const result=await command('/entry-vote',{choice},null);
 if(result?.ok)message('우리 분대 출발 위치 투표를 기록했습니다. 준비 전에 다시 누르면 변경할 수 있습니다.');
}
async function replayConsent(){
 if(!token||currentWorld()?.phase!=='finished')return;
 const ready=!state.replay?.own,previousRound=state.roundNumber;
 const response=await command('/replay-consent',{ready},null);
 if(response?.ok)message(response.roundNumber>previousRound?
   '모든 참가자가 동의해 새 라운드가 시작됐습니다.':
   ready?'새 경기 참가에 동의했습니다. 모든 96명이 동의해야 시작합니다.':
    '재경기 동의를 취소했습니다.');
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
async function voteLiveRoute(){
 if(!active())return;
 // Server determines the real majority and only publishes this squad's vote.
 const choices=['ferry','shade','civic'];
 const current=choices.indexOf(currentWorld().self.routeChoice);
 const choice=choices[(current+1)%choices.length];
 const result=await command('/route-vote',{choice},null);
 if(result?.ok)message('우리 분대 이동 후보: '+(result.route?.target?.label||choice)+
   ' · 최종 합의는 실제 참가자 과반으로 결정됩니다.');
}
function toggleMapFollow(){
 if(!currentWorld())return;
 mapFollow=!mapFollow;
 // Camera manipulation must never leave a held movement or sprint input.
 keys.clear();sprintIntent=false;lastSprint=null;
 render();
}
function changeMapZoom(delta){
 // View-only manipulation. Never send camera changes to the server.
 if(!mapFollow||!currentWorld()||!Number.isInteger(delta))return;
 const next=Math.max(-1,Math.min(1,mapZoomLevel+delta));
 if(next===mapZoomLevel)return;
 mapZoomLevel=next;
 keys.clear();sprintIntent=false;lastSprint=null;
 render();
 message('현장 지도 확대 단계 '+(mapZoomLevel+2)+'/3 · M 전체 지도 · +/− 확대 조절');
}
function toggleHarborAudio(){
 if(!harborAudio)return;
 if(audioControls){
  const next=!audioControls.get().enabled;
  audioControls.set({...audioControls.get(),enabled:next});
  if(next)unlockDefaultAudio();
  message(next?'게임 소리 켜짐 · 환경음은 현재 음량 설정으로 재생합니다.':'게임 소리 꺼짐 · 자막과 상태 정보는 유지됩니다.');
 }else if(harborAudio.enabled())harborAudio.disable();
 else harborAudio.enable();
 render();
}
function setAudioPanel(open){
 const panel=el('vpAudioPanel');
 panel.hidden=!open;
 el('soundSettings').setAttribute('aria-expanded',String(open));
 keys.clear();sprintIntent=false;lastSprint=null;lastCrouch=null;
 if(open)el('vpAudioEnabled').focus({preventScroll:true});
 else el('soundSettings').focus({preventScroll:true});
 render();
}
async function operateGate(){
 if(!active())return;
 const result=await command('/civic-gate',{},null);
 if(result?.ok)message('공공 여객 출입문 동작 시작 · 문은 실제로 서서히 움직입니다.');
}
// Two explicit clicks are required: the first is a warning, the second
// authenticates a permanent withdrawal. There is no self-revival endpoint.
async function withdraw(){
 if(!active())return;
 if(Date.now()>=withdrawArmedUntil){
  withdrawArmedUntil=Date.now()+8000;
  message('경기 포기를 확정하려면 8초 내에 버튼을 한 번 더 누르세요.');
  render();return;
 }
 withdrawArmedUntil=0;
 const result=await command('/withdraw',{},null);
 if(result?.ok){
  keys.clear();sprintIntent=false;lastSprint=null;
  message('경기에서 나왔습니다. 활동 가능한 같은 분대원만 관전할 수 있습니다.');
  render();
 }
}
async function spectate(){
 const w=currentWorld(),slot=Number(el('watchSlot').value);
 if(!w||w.phase!=='moving'||w.self.eligible||
    !w.squad.some(p=>p.slot===slot&&p.id!==w.self.id&&p.eligible))return;
 const result=await command('/spectate',{slot},null);
 if(result?.ok)message(slot+'번 분대원의 실제 시야를 관전합니다.');
}
function canUseKeyboard(event){
 return !event.ctrlKey&&!event.metaKey&&!event.altKey&&
   !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
}
document.addEventListener('keydown',event=>{
 if(!el('vpAudioPanel').hidden){
  if(event.code==='Escape'){event.preventDefault();setAudioPanel(false);}
  return;
 }
 if(!canUseKeyboard(event))return;
 const key=event.code;
 if(!event.repeat&&key==='KeyV'){event.preventDefault();toggleStandings();return;}
 if(!event.repeat&&key==='KeyM'&&el('standingsPanel').hidden){
   event.preventDefault();toggleMapFollow();return;
 }
 if(!el('standingsPanel').hidden){
  if(key==='Escape'){event.preventDefault();toggleStandings(false);}
  // Scoreboard focus takes priority over walking/sprinting/field controls.
  return;
 }
 if(!event.repeat&&mapFollow&&currentWorld()&&
    ['Equal','NumpadAdd','Minus','NumpadSubtract'].includes(key)){
   event.preventDefault();changeMapZoom(key==='Equal'||key==='NumpadAdd'?1:-1);return;
 }
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight','KeyC'].includes(key)){
  keys.add(key);event.preventDefault();
 }else if(!event.repeat&&key==='KeyQ'&&active()){event.preventDefault();signal('regroup');}
 else if(!event.repeat&&key==='KeyE'&&active()){event.preventDefault();signal('location');}
 else if(!event.repeat&&key==='KeyF'&&active()){event.preventDefault();operateGate();}
 else if(!event.repeat&&key==='KeyR'&&active()){event.preventDefault();voteLiveRoute();}
});
document.addEventListener('keyup',event=>{keys.delete(event.code);});
function resetKeys(){keys.clear();sprintIntent=false;lastSprint=null;lastCrouch=null;render();}
window.addEventListener('blur',resetKeys);
window.addEventListener('pagehide',()=>harborAudio?.dispose());
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetKeys();});
function direction(){
 if(document.hidden||!document.hasFocus()||!el('standingsPanel').hidden)
  return {dx:0,dz:0};
 if(!el('vpAudioPanel').hidden)return {dx:0,dz:0};
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
  const newCrouch=keys.has('KeyC');
  if(newSprint!==lastSprint||newCrouch!==lastCrouch){
   // A stance is a server-owned movement intent, not client-set velocity.
   await request('/pace',{sprint:newSprint,crouch:newCrouch});
   lastSprint=newSprint;lastCrouch=newCrouch;
  }
 }catch(error){
  consecutiveErrors++;
  if(consecutiveErrors>=2)message('이동 서버 연결 확인 필요 · 입력을 재시도합니다.');
 }finally{moveBusy=false;}
}
async function loadPublicGeometry(){
 if(!token||geometryBusy||publicGeometry)return;
 geometryBusy=true;
 const currentToken=token;
 try{
  const record=await request('/world-geometry');
  if(token!==currentToken)return;
  if(record.schema!=='veilpoint-br96-public-geometry-v1'||!Array.isArray(record.obstacles)||
     record.obstacles.length>4000)throw Error('invalid_public_world');
  const valid=record.obstacles.every(o=>o&&typeof o.type==='string'&&
    [o.x,o.z,o.w,o.d].every(Number.isFinite)&&o.w>0&&o.d>0);
  const pad=record.environment?.wetLoadingPad;
  if(!valid||!pad||![pad.x,pad.z,pad.width,pad.depth].every(Number.isFinite)||
     pad.width<=0||pad.depth<=0||pad.width>350||pad.depth>350)
    throw Error('invalid_public_geometry');
  publicGeometry=record.obstacles;
  publicEnvironment={wetLoadingPad:pad};
  render();
 }catch(error){
  // The server may transition from lobby to world after the previous poll.
  // A subsequent authenticated poll can retry; never display fake colliders.
  if(token===currentToken&&error.message!=='round_not_started')
   message('공공 도시 지형을 불러오지 못했습니다. 서버 재연결 후 다시 확인하세요.');
 }finally{geometryBusy=false;}
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
el('replayConsent').addEventListener('click',replayConsent);
el('entryVote').addEventListener('click',voteEntry);
el('leave').addEventListener('click',leave);
el('invite').addEventListener('click',invite);
el('regroup').addEventListener('click',()=>signal('regroup'));
el('location').addEventListener('click',()=>signal('location'));
el('civicGate').addEventListener('click',operateGate);
el('soundToggle').addEventListener('click',toggleHarborAudio);
el('soundSettings').addEventListener('click',()=>setAudioPanel(true));
el('vpAudioClose').addEventListener('click',()=>setAudioPanel(false));
el('standingsToggle').addEventListener('click',()=>toggleStandings());
el('mapFollow').addEventListener('click',toggleMapFollow);
el('standingsClose').addEventListener('click',()=>toggleStandings(false));
el('sprint').addEventListener('click',()=>{sprintIntent=!sprintIntent;render();});
el('withdraw').addEventListener('click',withdraw);
el('spectate').addEventListener('click',spectate);
render();if(token)poll();
setInterval(poll,400);
setInterval(movement,180);
})();