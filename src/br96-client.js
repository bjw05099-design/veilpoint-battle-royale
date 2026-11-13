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
const squadPanel=window.VeilpointBR96SquadPanel;
const chatGuard=squadPanel?.createDraftGuard?.()||null;
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
let token=null,state=null,seq=0,stanceSeq=0,moveBusy=false,pollBusy=false;
let sprintIntent=false,lastSprint=null,lastCrouch=null,lastWorldTick=-1,lastStatus='';
let consecutiveErrors=0;
// Idle clients previously posted a full /move world snapshot every 180ms,
// even with no keyboard movement (roughly 530 unnecessary requests/sec for
// 96 stationary players). A zero-vector handoff releases movement once;
// real 3s authenticated /heartbeat calls preserve observable presence while
// the authoritative 60Hz world and 4Hz private stream remain unchanged.
let lastSubmittedDirection=null,lastIdleHeartbeatAt=0;
const IDLE_HEARTBEAT_MS=3000;
function needMovementFrame(direction){
 if(direction.dx!==0||direction.dz!==0)return true;
 return lastSubmittedDirection===null||
   lastSubmittedDirection.dx!==0||lastSubmittedDirection.dz!==0;
}
// Each streamed snapshot is already filtered by the server for this player.
// EventSource cannot authenticate by custom headers; never put tokens in URLs.
let liveAbort=null,lastLiveAt=0,liveRetryAt=0,pollCount=0;
function stopPrivateStream(){
 if(liveAbort)liveAbort.abort();
 liveAbort=null;lastLiveAt=0;
}
let publicGeometry=null,publicEnvironment=null,geometryBusy=false;
let withdrawArmedUntil=0,watchOptionsSignature='',mapFollow=false,mapZoomLevel=0;
let streetView=false,streetYaw=0,streetPitch=0; // camera-only, never part of movement POST
let dismissedJourneyRound=null; // local UI only; server remains authoritative
try{const stored=sessionStorage.getItem(SESSION);if(stored&&/^[a-f0-9]{64}$/.test(stored))token=stored;}catch(_){}
function message(value){if(value!==lastStatus){lastStatus=value;el('status').textContent=value;}}
function cleanSession(){
 chatGuard?.reset();
 stopPrivateStream();
 harborAudio?.disable();
 token=null;state=null;seq=0;stanceSeq=0;lastWorldTick=-1;lastSprint=null;lastCrouch=null;sprintIntent=false;keys.clear();
 lastSubmittedDirection=null;lastIdleHeartbeatAt=0;
 publicGeometry=null;publicEnvironment=null;geometryBusy=false;
 withdrawArmedUntil=0;watchOptionsSignature='';mapFollow=false;mapZoomLevel=0;
 streetView=false;streetYaw=0;streetPitch=0;dismissedJourneyRound=null;
 if(document.pointerLockElement===canvas)document.exitPointerLock?.();
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
   chatGuard?.reset();
   stopPrivateStream();liveRetryAt=0;
   seq=0;stanceSeq=0;lastWorldTick=-1;lastSprint=null;lastCrouch=null;sprintIntent=false;
   lastSubmittedDirection=null;lastIdleHeartbeatAt=0;
   keys.clear();withdrawArmedUntil=0;mapFollow=false;mapZoomLevel=0;
   streetView=false;streetYaw=0;streetPitch=0;dismissedJourneyRound=null;
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
   if(Number.isSafeInteger(next.world.self?.stanceSeq))
     stanceSeq=Math.max(stanceSeq,next.world.self.stanceSeq);
 }
 state=next;consecutiveErrors=0;
 render();
}
function parsePrivateWorld(packet){
 let event='',data='',id='';
 for(const line of packet.split('\n')){
  if(line.startsWith('event: '))event=line.slice(7);
  else if(line.startsWith('data: '))data+=line.slice(6);
  else if(line.startsWith('id: '))id=line.slice(4);
 }
 if(event!=='world'||!data||data.length>65536||
    !/^[1-9][0-9]{0,8}:[0-9]{1,12}$/.test(id))return null;
 try{
  const world=JSON.parse(data);
  const [roundNumber,serverTick]=id.split(':').map(Number);
  // A stream is identified by the server's real round generation. A
  // delayed packet from the previous match must never rewind local bodies.
  return world?.mode==='br-96-traversal-prototype'&&world.self&&
    Number.isSafeInteger(world.tick)&&world.tick>=0&&
    Number.isSafeInteger(serverTick)&&world.tick===serverTick
    ?{world,roundNumber}:null;
 }catch(_){return null;}
}
async function connectPrivateWorldStream(){
 if(!token||!currentWorld()||liveAbort||document.hidden||Date.now()<liveRetryAt)return;
 const ownToken=token,ownRound=state?.roundNumber,controller=new AbortController();
 liveAbort=controller;
 try{
  // The 256-bit secret is a HEADER, never a query string, SSE event or DOM node.
  const response=await fetch('/events',{method:'GET',headers:{
    'x-player-token':ownToken,'Accept':'text/event-stream'},cache:'no-store',
    signal:controller.signal});
  if(!response.ok||!response.body?.getReader)throw new Error('private_stream_unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let pending='';
  while(!controller.signal.aborted){
   const {done,value}=await reader.read();
   if(done)break;
   pending=(pending+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');
   if(pending.length>98304)throw new Error('private_stream_overflow');
   let boundary;
   while((boundary=pending.indexOf('\n\n'))!==-1){
    const packet=pending.slice(0,boundary);
    pending=pending.slice(boundary+2);
    const frame=parsePrivateWorld(packet);
    if(!frame)continue; // malformed or mismatched tick cannot mutate a match
    if(token!==ownToken||state?.roundNumber!==ownRound){
     controller.abort();break;
    }
    if(frame.roundNumber<ownRound)continue; // never replay an older world
    if(frame.roundNumber>ownRound){
     // The server has actually begun a new match. Fetch its full
     // authenticated roster and let apply() reset input/tick/UI together;
     // a partial SSE world alone cannot author a new round.
     controller.abort();await poll();break;
    }
    lastLiveAt=Date.now();
    apply({...state,world:frame.world,roundNumber:frame.roundNumber});
   }
  }
 }catch(error){
  if(!controller.signal.aborted)message('실시간 수신이 끊겼습니다. 주기적 상태 확인으로 전환합니다.');
 }finally{
  if(liveAbort===controller){
   liveAbort=null;lastLiveAt=0;
   // Only a real new-round transition receives immediate stream resubscribe.
   // Network failures continue with the existing bounded four-second retry.
   liveRetryAt=state?.roundNumber!==ownRound?0:Date.now()+4000;
  }
 }
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
 el('mapFollow').disabled=!w||streetView;
 el('streetToggle').disabled=!w||!window.VeilpointBR96StreetView;
 el('streetToggle').setAttribute('aria-pressed',String(streetView));
 el('streetToggle').textContent=streetView?'P · 도시 지도':'P · 1인칭 시야';
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
 for(const id of ['regroup','location','sprint','civicGate','handcart','headlamp','wave','benchRest'])el(id).disabled=!active();
 el('stepOver').disabled=!active()||w?.self?.stepOverProgress!==null&&
   w?.self?.stepOverProgress!==undefined;
 el('headlamp').setAttribute('aria-pressed',String(!!w?.self?.headlampOn));
 el('headlamp').textContent='H · 헤드램프 '+(w?.self?.headlampOn?'ON':'OFF');
 el('headlamp').title='서버 배터리 '+Math.ceil((w?.self?.headlampTicks||0)/60)+'초';
 el('wave').setAttribute('aria-pressed',String(!!w?.self?.waving));
 el('benchRest').setAttribute('aria-pressed',String(!!w?.self?.benchResting));
 el('benchRest').textContent=w?.self?.benchResting?'F · 자리에서 일어나기':'F · 벤치에서 쉬기';
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
 const canChat=!!token&&(state?.phase==='assembling'||active());
 el('squadChatInput').disabled=!canChat;
 el('sendSquadChat').disabled=!canChat||!!chatGuard?.pending();
 el('sendSquadChat').textContent=chatGuard?.pending()?'전송 중':'보내기';
 const messages=state?.phase==='assembling'?state?.lobbyChat:w?.squadChat;
 el('squadChatLine').textContent=(messages?.length
  ?messages.slice(-2).map(entry=>entry.slot+'번: '+entry.text).join(' · ')
  :state?.phase==='assembling'?'분대 전용 사전 대화 · 준비 전 사용 가능':
   '분대 전용 메시지 · 경기 시작 후 사용 가능');
 el('withdraw').textContent=Date.now()<withdrawArmedUntil?'다시 누르면 경기 포기':'경기 포기';
 el('sprint').textContent=sprintIntent?'달리기 ON':'달리기 OFF';
 el('sprint').setAttribute('aria-pressed',String(sprintIntent));
 const members=Array.isArray(state?.squad)?state.squad:[];
 const self=state?.self;
 el('roster').textContent=squadPanel?.roster(state)|| (members.length
  ?'우리 분대\n'+members.map((m,i)=>(i+1)+'. '+(m?m.name+' · '+(m.ready?'준비':'대기'):'빈 좌석')).join('\n')
  :'분대 대기 중');
 el('details').textContent=state
  ?'전체 '+state.participants+'/'+state.capacity+'명 · 준비 '+state.readyCount+'/'+state.capacity+
   '\n본인 #'+self.id+' · '+self.squad+'분대 '+self.slot+'번'+
   '\n단계: '+state.phase+(state.roundNumber?' · '+state.roundNumber+'회차':'')+
   (w?'\n보기: '+(streetView?'1인칭 거리 시야 · 마우스 상하좌우 / J·L·I·K':'2D 서버 진단 지도'):'')+
   (state.entry?'\n분대 출발 예정: '+
     (state.entry.options.find(o=>o.id===state.entry.choice)?.label||'기본 접근로')+
     ' · 서버가 실제 출발 위치를 지정합니다.':'')+
   (w?'\n서버 틱 '+w.tick+' · 생존 '+Math.floor((w.self.survivalTicks||0)/60)+'초 · 남은 분대 '+w.remainingSquads+
    '\n경기 제한시간 · 서버 기준 '+Math.ceil((w.roundClock?.remainingTicks||0)/60)+'초 남음'+
    '\n체력/탄약: 현재 BR96 이동 프로토타입에 없음'+
    '\n지구력 '+Math.round(w.self.stamina)+'/100'+(w.self.benchResting?' · 공공 벤치에서 휴식 중':w.self.resting?' · 휴식 회복 중':'')+' · 자세 '+(w.self.benchResting?'앉아서 휴식':w.self.crouched?'낮춘 자세':'서기')+(w.self.pedestrianFlow?.busy?' · 보행 혼잡 '+Math.round(w.self.pedestrianFlow.mobility*100)+'%':'')+' · 경계 '+w.playableArea.stage+
    (w.playableArea.changing?' · 다음 경계 '+Math.round(w.playableArea.ticksUntilChange/60)+'초 후':'')+
    (w.self.areaReturn?' · 경계 복귀 약 '+Math.ceil(w.self.areaReturn.straightMetres)+
       'm (직선 방향 · 장애물 경로 미검증)':'')+
    '\n우리 분대 발견 장소 '+(w.squadLandmarks?.length||0)+' · 전원 직접 방문 '+(w.squadLandmarks?.filter(site=>site.wholeSquadVisited).length||0)+
    (w.self.surface?.wet?('\n바닥: '+(w.self.surface.waveActive?'잔물결 유입':'젖은 적재장')+
      ' · 이동 효율 '+Math.round(w.self.surface.mobility*100)+'%'):'')+
    '\n개인 헤드램프: '+(w.self.headlampOn?'점등':'소등')+' · 잔여 '+Math.ceil(w.self.headlampTicks/60)+'초'+
    (w.self.stepOverProgress!==null&&w.self.stepOverProgress!==undefined?
      '\n보행 장애물 통과: '+Math.round(w.self.stepOverProgress*100)+'% · 서버 60Hz':'')+
    (w.civicGate?'\n여객 문: '+w.civicGate.state:'')+
    (w.handcart?'\n항구 손수레: '+(w.handcart.heldBySelf?'직접 밀기 조작 중 · F 놓기':
      w.handcart.handoffAvailable?'가까운 분대원에게서 F로 조작 인계 가능':
      w.handcart.squadOperatorSlot?'분대 '+w.handcart.squadOperatorSlot+'번 조작 중':
      '현장 접근 시 조작 가능'):'')+
    (w.squadSignal?'\n분대 퀵마크: '+(w.squadSignal.kind==='regroup'?'현재 위치로 모이기 제안':'현재 위치 공유'):'')+
    // Only this participant's authenticated six-person server timeline is
    // rendered; opponent sessions, identities and coordinates never appear.
    (w.squadTimeline?.length?'\n분대 실제 퇴장 '+w.squadTimeline.length+'/6 · 최근 '+
      w.squadTimeline.at(-1).slot+'번 ('+
      (w.squadTimeline.at(-1).reason==='voluntary_withdrawal'?'자발적 종료':
       w.squadTimeline.at(-1).reason==='area_expiry'?'경계 시간 만료':'서버 확인')+')':'')+
    '\n현재 참가 '+(w.standings?.[self.squad-1]?.eligibleMembers??'?')+'/6'+
    (w.standings?.[self.squad-1]?.placement!==null&&
     w.standings?.[self.squad-1]?.placement!==undefined
     ?' · 확정 '+w.standings[self.squad-1].placement+'위':'')+
    (w.spectatorView?'\n관전 대상: '+w.spectatorView.slot+'번 분대원'+
      (w.spectatorView.automaticFallback?' · 기존 대상 퇴장으로 자동 전환':''):
      retired?'\n본인 경기 포기 · 아군 관전 선택 가능':'')+
    (w.matchOutcome?'\n최종 결과: '+
     (w.matchOutcome.kind==='shared_tie'?(w.matchOutcome.reason==='time_limit'?'제한시간 종료 · 남은 분대 공동 순위':'모든 분대 동시 종료 · 공동 순위'):
       w.matchOutcome.kind==='squad_win'?'우리 분대 우승':
       '우리 분대 '+w.matchOutcome.ownSquadPlacement+'위')+
     (w.matchOutcome.winningSquad===null?'':' · 우승 분대 '+w.matchOutcome.winningSquad):''):'\n96명 전원 준비 시 이동 시작')
  :'접속 전';
 draw(w);
 renderStandings(w);
 renderJourney(w);
}
// The server owns every number and only sends PERSONAL data after round end.
// No client movement estimates, rival route telemetry or invented awards.
function renderJourney(w){
 const personal=w?.phase==='finished'?w.personalRecap:null;
 const panel=el('journeyPanel');
 if(!personal||personal.schema!=='veilpoint-br96-personal-journey-v1'||
    dismissedJourneyRound===state?.roundNumber){
  panel.hidden=true;return;
 }
 const n=value=>Number.isFinite(value)&&value>=0?value.toFixed(2):'—';
 // The verified 6-person aggregate exists only after server round completion.
 // Old local protocol snapshots keep the historical personal-only report.
 const group=w?.squadJourney;
 const squad=group?.schema==='veilpoint-br96-squad-journey-v1'&&
   group.squad===personal.squad&&group.members===6&&
   group.ownSquadPlacement===personal.ownSquadPlacement&&
   Number.isInteger(group.participantsMoved)&&group.participantsMoved>=0&&
   group.participantsMoved<=6&&Number.isInteger(group.activeMembersAtFinish)&&
   group.activeMembersAtFinish>=0&&group.activeMembersAtFinish<=6&&
   [group.totalMeters,group.walkedMeters,group.sprintedMeters].every(x=>
     Number.isFinite(x)&&x>=0)?group:null;
 const rank=Number.isInteger(personal.ownSquadPlacement)?
   personal.ownSquadPlacement+'위':'공동 순위';
 el('journeyText').textContent=
   '우리 분대 '+personal.squad+' · 본인 '+personal.participantSlot+'번\n'+
   '서버 확정 순위: '+rank+'\n'+
   '실제 참가 시간: '+n(personal.activeSeconds)+'초\n'+
   '실제 보행 거리: '+n(personal.walkedMeters)+'m\n'+
   '실제 달리기 거리: '+n(personal.sprintedMeters)+'m\n'+
   '전체 이동 거리: '+n(personal.totalMeters)+'m\n'+
   '직접 방문한 지점: '+personal.locationsVisited+'개\n'+
   '종료 당시 본인 상태: '+
     (personal.ownResult==='active_at_finish'?'경기 참가 중':
      personal.ownResult==='voluntary_withdrawal'?'본인 선택으로 경기 포기':
      personal.ownResult==='area_expiry'?'경기 경계 규칙으로 종료':'종료 사유 확인 필요')+
   (squad?'\n\n우리 6인 분대의 실제 이동 기록\n'+
      '움직인 인원: '+squad.participantsMoved+'/6명 · 종료 당시 참가 '+squad.activeMembersAtFinish+'/6명\n'+
      '분대 전체 이동 거리: '+n(squad.totalMeters)+'m\n'+
      '분대 보행: '+n(squad.walkedMeters)+'m · 달리기: '+n(squad.sprintedMeters)+'m':'')+
   '\n※ 개인·분대의 서버 관측 이동만 집계하며 상대 위치, 동료별 이동 경로 및 휴식 시간은 제외합니다.';
 panel.hidden=false;
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
  if(document.pointerLockElement===canvas)document.exitPointerLock?.();
  // A player checking the score must not keep moving while the keyboard
  // focus belongs to the visible overlay; the next 180ms input is neutral.
  keys.clear();sprintIntent=false;lastSprint=null;
  renderStandings(currentWorld());
  el('standingsClose').focus({preventScroll:true});
 }else el('standingsToggle').focus({preventScroll:true});
}
function draw(w){
 const width=canvas.width,height=canvas.height;
 if(streetView&&w&&publicGeometry&&window.VeilpointBR96StreetView){
  const subject=w.spectatorView
   ?{...w.spectatorView,id:w.spectatorView.playerId}:w.self;
  // The spectator HUD uses the EXISTING same-squad roster's observed light.
  // A spectator's pose is already visible in their authenticated six-person
  // roster. Reuse that instead of changing the stable spectatorView contract.
  const watchedMate=w.spectatorView?w.squad?.find(p=>p.id===subject.id):null;
  const litSubject=w.spectatorView
    ?{...subject,headlampOn:!!watchedMate?.headlampOn,
      crouched:!!watchedMate?.crouched,benchResting:!!watchedMate?.benchResting}:subject;
  window.VeilpointBR96StreetView.draw(ctx,{width,height,
   subject:litSubject,yaw:streetYaw,pitch:streetPitch,obstacles:publicGeometry,
   civicGate:w.civicGate,handcart:w.handcart,squad:w.squad||[],visible:w.visible||[],
   visibilityMeters:w.coastalWeather?.visibilityMeters,weather:w.coastalWeather,
   pavements:publicEnvironment?.pavements||[]});
  return;
 }
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
 // The 2D diagnostic and first-person walk both show the SAME server-public
 // civic plazas without inventing live map objects or private squad positions.
 for(const patch of publicEnvironment?.pavements||[]){
  ctx.fillStyle=patch.canvas;
  ctx.fillRect(x(patch.x-patch.w/2),z(patch.z-patch.d/2),
    patch.w*scale,patch.d*scale);
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
 if(w.handcart){
   const cart=w.handcart;
   ctx.fillStyle=cart.heldBySelf?'#d5bb88':'#9db2a9';
   ctx.fillRect(x(cart.x-cart.w/2),z(cart.z-cart.d/2),cart.w*scale,cart.d*scale);
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
 for(const site of w.squadLandmarks||[])dot(site,site.wholeSquadVisited?'#d5eab5':'#9eabb2',site.wholeSquadVisited?6:4);
 for(const rival of w.visible||[])dot(rival,'#ef897e',6);
 for(const mate of w.squad||[])if(mate.id!==w.self.id)dot(mate,'#8cb6e6',6);
 if(w.squadSignal){
  const pin=w.squadSignal;
  dot(pin,pin.kind==='regroup'?'#e7d189':'#a5d5f3',8);
  ctx.fillStyle='#f3e8c9';ctx.font='12px system-ui';
  ctx.fillText(pin.kind==='regroup'?'MEET HERE?':'POSITION',
    x(pin.x)+11,z(pin.z)-10);
 }
 if(w.spectatorView){
  dot(w.spectatorView,'#e9d093',9);
  ctx.strokeStyle='#f4e0a3';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(x(w.spectatorView.x),z(w.spectatorView.z),13,0,Math.PI*2);ctx.stroke();
 }
 if(w.self.eligible&&w.self.areaReturn){
  // Draw only the server-derived own-body-to-public-edge line. It is
  // not a walkable route promise, rival tracker, or client teleport.
  const returnTo=w.self.areaReturn;
  ctx.strokeStyle='#e6c783';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x(w.self.x),z(w.self.z));
  ctx.lineTo(x(returnTo.targetX),z(returnTo.targetZ));ctx.stroke();
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
 const ownToken=token;
 try{
  const data=await request(path,body);
  // A leave/rejoin can complete while the old HTTP request is still
  // pending. Never apply its private roster or command status to a new seat.
  if(token!==ownToken)return null;
  if(data.state)apply(data.state);
  if(data.world&&state)apply({...state,world:data.world});
  if(statusText)message(statusText);
  return data;
 }catch(error){
  if(token!==ownToken)return null;
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
async function stepOverBench(){
 if(!active())return;
 const result=await command('/step-over',{},null);
 if(result?.ok)message('낮은 공공 벤치를 실제로 넘는 중 · 이동 방향과 착지 공간은 서버가 확인합니다.');
}
async function interactNearby(){
 if(!active())return;
 const result=await command('/interact',{},null);
 if(!result?.ok)return;
 if(result.kind==='bench')message(result.seated?
   '가까운 공공 벤치에 앉았습니다. 이동하면 자동으로 일어납니다.':
   '벤치에서 일어났습니다.');
 else if(result.kind==='handcart')message(result.action==='grip'?
   '가까운 손수레를 잡았습니다. F로 놓을 수 있습니다.':
   '손수레를 놓았습니다.');
 else if(result.kind==='gate')message('가까운 공용 출입문의 작동을 시작했습니다.');
}
async function benchRest(){
 if(!active())return;
 const result=await command('/bench-rest',{},null);
 if(result?.ok)message(result.seated?
   '가까운 공공 벤치에서 휴식 중 · 아무 곳에서나 지구력이 회복되지만 벤치에서는 조금 더 편히 쉽니다.':
   '벤치에서 일어났습니다. 일반 이동을 다시 할 수 있습니다.');
}
async function wave(){
 if(!active())return;
 const result=await command('/wave',{},null);
 if(result?.ok)message('짧게 손을 들어 주변 사람에게 응답했습니다. 실제로 보는 사람만 움직임을 확인합니다.');
}
async function toggleHeadlamp(){
 if(!active())return;
 const result=await command('/headlamp',{},null);
 if(result?.ok)message(result.on?'개인 헤드램프를 켰습니다. 서버 시계로 배터리가 소모됩니다.':'헤드램프를 껐습니다. 잔여 배터리가 보존됩니다.');
}
async function signal(kind){
 if(!active())return;
 const result=await command('/signal',{kind},null);
 if(result?.ok)message(kind==='regroup'
  ?'현재 위치에 집결 제안 퀵마크를 찍었습니다. 아군이 따라올지는 자유입니다.'
  :'현재 위치를 분대에 표시했습니다.');
}
async function sendSquadChat(){
 if(!token||!(state?.phase==='assembling'||active()))return;
 const input=el('squadChatInput'),draft=input.value,text=draft.trim();
 if(!text)return;
 const ownerToken=token,ownerRound=state?.roundNumber||1;
 // Once the first Enter/click submits, block a duplicate until its real
 // server acknowledgement. Continue allowing the human to TYPE a new draft.
 if(chatGuard&&!chatGuard.begin(ownerToken,ownerRound,draft))return;
 render();
 try{
  const result=await command('/squad-chat',{text},null);
  if(!result?.ok||token!==ownerToken||(state?.roundNumber??1)!==ownerRound)return;
  // Never erase a new draft typed while an older request was in flight.
  if(chatGuard?.shouldClear(ownerToken,ownerRound,input.value))input.value='';
  message('우리 분대에만 메시지가 전달됐습니다.');
 }finally{
  chatGuard?.finish(ownerToken,ownerRound);
  render();
 }
}

function toggleStreetView(){
 if(!currentWorld()||!window.VeilpointBR96StreetView)return;
 streetView=!streetView;
 mapFollow=false;mapZoomLevel=0;
 keys.clear();sprintIntent=false;lastSprint=null;lastCrouch=null;
 if(!streetView){streetPitch=0;if(document.pointerLockElement===canvas)document.exitPointerLock?.();}
 message(streetView?'1인칭 거리 시야 · 화면을 클릭해 마우스 시야 회전 · WASD는 바라보는 방향으로 걷기 · Esc 해제 · P 지도':
  '2D 서버 진단 지도로 돌아왔습니다.');
 render();
}
// Desktop mouse look is an opt-in foreground gesture on the actual canvas.
 // No mouse coordinates are sent to the server; only a bounded normalized
 // walking direction reaches the authoritative 60Hz gameplay controller.
canvas.addEventListener('click',()=>{
 if(streetView&&currentWorld()&&document.pointerLockElement!==canvas)
  canvas.requestPointerLock?.();
});
 // Middle button (pressing the wheel), not wheel scrolling or a keyboard E.
 // The server creates a quickmark at the authenticated actor's true feet.
 // In street view the canvas owns pointer lock; in the 2D diagnostic the
 // canvas is the explicitly clicked play surface.
 canvas.addEventListener('mousedown',event=>{
  if(event.button!==1)return;
  event.preventDefault(); // prevent Chrome's middle-button autoscroll
  if(!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&
     active()&&el('standingsPanel').hidden&&el('vpAudioPanel').hidden)
   signal('location');
 });
 canvas.addEventListener('auxclick',event=>{
  if(event.button===1)event.preventDefault();
 });
document.addEventListener('mousemove',event=>{
 if(document.pointerLockElement!==canvas||!streetView||
    !currentWorld()||!el('standingsPanel').hidden||
    !el('vpAudioPanel').hidden)return;
 if(!Number.isFinite(event.movementX)||!Number.isFinite(event.movementY))return;
 streetYaw=window.VeilpointBR96StreetView.wrap(
  streetYaw+Math.max(-160,Math.min(160,event.movementX))*.0025);
 streetPitch=window.VeilpointBR96StreetView.clampPitch(
  streetPitch-Math.max(-160,Math.min(160,event.movementY))*.0025);
 render();
});
function turnStreetPitch(delta){
 if(!streetView||!Number.isFinite(delta)||!window.VeilpointBR96StreetView)return;
 streetPitch=window.VeilpointBR96StreetView.clampPitch(streetPitch+delta);
 keys.clear();sprintIntent=false;lastSprint=null;lastCrouch=null;
 render();
}
function turnStreetView(delta){
 if(!streetView||!Number.isFinite(delta)||!window.VeilpointBR96StreetView)return;
 streetYaw=window.VeilpointBR96StreetView.wrap(streetYaw+delta);
 // Heading is pure local rendering; do not send a fake look direction.
 keys.clear();sprintIntent=false;lastSprint=null;lastCrouch=null;
 render();
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
async function operateHandcart(){
 if(!active())return;
 const result=await command('/handcart',{},null);
 if(result?.ok)message(result.action==='grip'
   ?'항구 손수레를 잡았습니다. 손수레 방향으로 걸으면 실제로 함께 이동합니다. T로 놓기.'
   :'항구 손수레를 내려놓았습니다.');
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
// A single keyboard gesture cycles ONLY still-active members of our own
// authenticated six-human squad. The normal /spectate endpoint verifies the
// selected slot. There is no enemy camera, observer teleport or new server
// command with client-authored world coordinates.
async function cycleSpectator(){
 const w=currentWorld();
 if(!w||w.phase!=='moving'||w.self.eligible)return;
 const eligible=w.squad.filter(p=>p.eligible&&p.id!==w.self.id)
   .map(p=>p.slot).sort((a,b)=>a-b);
 if(!eligible.length){message('관전할 활동 중인 분대원이 없습니다.');return;}
 const current=w.spectatorView?.slot||0;
 const next=eligible.find(slot=>slot>current)||eligible[0];
 const result=await command('/spectate',{slot:next},null);
 if(result?.ok){
  el('watchSlot').value=String(next);
  message(next+'번 분대원의 실제 시야를 관전합니다.');
 }
}
function textEntryFocused(target=document.activeElement){
 return !!target&&(target.isContentEditable===true||
   ['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
}
function canUseKeyboard(event){
 return !event.ctrlKey&&!event.metaKey&&!event.altKey&&
   !textEntryFocused()&&!textEntryFocused(event.target);
}
document.addEventListener('keydown',event=>{
 if(!el('vpAudioPanel').hidden){
  if(event.code==='Escape'){event.preventDefault();setAudioPanel(false);}
  return;
 }
 if(!canUseKeyboard(event))return;
 const key=event.code;
 if(!event.repeat&&key==='KeyV'){event.preventDefault();toggleStandings();return;}
 if(!event.repeat&&key==='KeyP'&&el('standingsPanel').hidden){
  event.preventDefault();toggleStreetView();return;
 }
 if(streetView&&currentWorld()&&['KeyI','KeyK'].includes(key)){
  event.preventDefault();turnStreetPitch(key==='KeyI'?Math.PI/36:-Math.PI/36);return;
 }
 if(streetView&&currentWorld()&&['KeyJ','KeyL'].includes(key)){
  event.preventDefault();turnStreetView(key==='KeyJ'?-Math.PI/24:Math.PI/24);return;
 }
 if(!event.repeat&&key==='KeyM'&&el('standingsPanel').hidden){
   event.preventDefault();toggleMapFollow();return;
 }
 if(!el('standingsPanel').hidden){
  if(key==='Escape'){event.preventDefault();toggleStandings(false);}
  // Scoreboard focus takes priority over walking/sprinting/field controls.
  return;
 }
 if(!event.repeat&&key==='KeyN'&&currentWorld()&&!currentWorld().self.eligible){
  event.preventDefault();cycleSpectator();return;
 }
 if(!event.repeat&&mapFollow&&currentWorld()&&
    ['Equal','NumpadAdd','Minus','NumpadSubtract'].includes(key)){
   event.preventDefault();changeMapZoom(key==='Equal'||key==='NumpadAdd'?1:-1);return;
 }
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight','KeyC'].includes(key)){
  keys.add(key);event.preventDefault();
 }else if(!event.repeat&&key==='KeyQ'&&active()){event.preventDefault();signal('regroup');}
 // Middle mouse button owns location-only quickmark (no keyboard E).
 else if(!event.repeat&&key==='KeyF'&&active()){event.preventDefault();interactNearby();}
 else if(!event.repeat&&key==='KeyH'&&active()){event.preventDefault();toggleHeadlamp();}
 else if(!event.repeat&&key==='KeyG'&&active()){event.preventDefault();stepOverBench();}
 else if(!event.repeat&&key==='KeyB'&&active()){event.preventDefault();wave();}
 // F is the single default nearby interaction key; R/T are unbound
 // and E is free. Press the wheel to mark one's true server position.
});
document.addEventListener('keyup',event=>{keys.delete(event.code);});
function resetKeys(){
 keys.clear();sprintIntent=false;lastSprint=null;lastCrouch=null;
 if(document.pointerLockElement===canvas)document.exitPointerLock?.();
 render();
}
window.addEventListener('blur',resetKeys);
// Moving into squad chat must release a previously held W/Shift too. Merely
// ignoring NEW keystrokes leaves the old server movement lease renewed while
// the player types. Clear it on focus and send the ordinary neutral handoff.
document.addEventListener('focusin',event=>{
 if(!textEntryFocused(event.target))return;
 resetKeys();
 void movement();
});
window.addEventListener('pagehide',()=>{stopPrivateStream();harborAudio?.dispose();});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){resetKeys();stopPrivateStream();}
 else if(token)poll();
});
function direction(){
 if(document.hidden||!document.hasFocus()||!el('standingsPanel').hidden)
  return {dx:0,dz:0};
 if(textEntryFocused())return {dx:0,dz:0};
 if(!el('vpAudioPanel').hidden)return {dx:0,dz:0};
 const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
 const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
 const len=Math.hypot(dx,dz)||1;
 const intent={dx:dx/len,dz:dz/len};
 return streetView&&window.VeilpointBR96StreetView
  ?window.VeilpointBR96StreetView.relativeMovement(intent.dx,intent.dz,streetYaw)
  :intent;
}
async function movement(){
 if(!active()||moveBusy)return;
 const ownToken=token,ownRound=state?.roundNumber;
 const stillCurrent=()=>token===ownToken&&state?.roundNumber===ownRound;
 const dir=direction(),newSprint=sprintIntent||keys.has('ShiftLeft')||keys.has('ShiftRight'),
  newCrouch=keys.has('KeyC'),
  // Changing sprint/crouch while not actually moving is still an intentional
  // PC action. Send pace to authoritative server without fake displacement.
  stanceChanged=newSprint!==lastSprint||newCrouch!==lastCrouch;
 const needsMove=needMovementFrame(dir),now=Date.now(),
  needsHeartbeat=!needsMove&&now-lastIdleHeartbeatAt>=IDLE_HEARTBEAT_MS;
 if(!needsMove&&!stanceChanged&&!needsHeartbeat)return;
 moveBusy=true;
 try{
  if(needsMove){
   // The first neutral move after the keys stop releases the server lease.
   // Do not predict actor position or move the 60Hz world in the browser.
   await request('/move',{...dir,seq:++seq});
   if(!stillCurrent())return;
   lastSubmittedDirection={dx:dir.dx,dz:dir.dz};
   lastIdleHeartbeatAt=Date.now();
  }
  if(stanceChanged){
   await request('/pace',{sprint:newSprint,crouch:newCrouch,seq:++stanceSeq});
   if(!stillCurrent())return;
   lastSprint=newSprint;lastCrouch=newCrouch;
   lastIdleHeartbeatAt=Date.now();
  }
  if(needsHeartbeat&&!needsMove&&!stanceChanged){
   // An authenticated server heartbeat is a liveness hint, NOT a move,
   // extra participant, new session, or score-affecting time update.
   await request('/heartbeat',{});
   if(!stillCurrent())return;
   lastIdleHeartbeatAt=Date.now();
  }
 }catch(error){
  // A late rejection from an abandoned session cannot warn or reset a new
  // authenticated player. The new round owns its own sequence and HUD.
  if(!stillCurrent())return;
  // Retry a failed zero-vector handoff next cycle. If a request was
  // already accepted, a duplicate neutral frame has no displacement.
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
  // Reject forged/malformed public pavement payloads before using either
  // 2D or street projection. The server is the sole author of these surfaces.
  const pavements=record.pavements;
  if(!Array.isArray(pavements)||pavements.length!==4||
     new Set(pavements.map(p=>p?.id)).size!==4||
     !pavements.every(p=>p&&['tawahi','mualla','crater','khormaksar'].includes(p.id)&&
      [p.x,p.z,p.w,p.d].every(Number.isFinite)&&
      p.w>0&&p.d>0&&p.w<=60&&p.d<=60&&
      /^#[0-9a-f]{6}$/i.test(p.canvas||'')))
    throw Error('invalid_public_pavements');
  publicGeometry=record.obstacles;
  publicEnvironment={wetLoadingPad:pad,pavements};
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
 const ownToken=token;
 pollBusy=true;
 try{
  const snapshot=await request('/state');
  if(token!==ownToken)return;
  apply(snapshot);
  if(currentWorld())connectPrivateWorldStream();
 }
 catch(error){
  if(token!==ownToken)return;
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
el('sendSquadChat').addEventListener('click',sendSquadChat);
el('squadChatInput').addEventListener('keydown',event=>{
 if(event.key==='Enter'&&!event.isComposing){event.preventDefault();sendSquadChat();}
});
el('civicGate').addEventListener('click',operateGate);
el('handcart').addEventListener('click',operateHandcart);
el('headlamp').addEventListener('click',toggleHeadlamp);
el('stepOver').addEventListener('click',stepOverBench);
el('wave').addEventListener('click',wave);
el('benchRest').addEventListener('click',benchRest);
el('soundToggle').addEventListener('click',toggleHarborAudio);
el('soundSettings').addEventListener('click',()=>setAudioPanel(true));
el('vpAudioClose').addEventListener('click',()=>setAudioPanel(false));
el('journeyDismiss').addEventListener('click',()=>{
 dismissedJourneyRound=state?.roundNumber??0;
 el('journeyPanel').hidden=true;
});
el('standingsToggle').addEventListener('click',()=>toggleStandings());
el('mapFollow').addEventListener('click',toggleMapFollow);
el('streetToggle').addEventListener('click',toggleStreetView);
el('standingsClose').addEventListener('click',()=>toggleStandings(false));
el('sprint').addEventListener('click',()=>{sprintIntent=!sprintIntent;render();});
el('withdraw').addEventListener('click',withdraw);
el('spectate').addEventListener('click',spectate);
render();if(token)poll();
setInterval(()=>{
 if(!token)return;
 pollCount++;
 const healthy=!!liveAbort&&lastLiveAt>0&&Date.now()-lastLiveAt<2000;
 // Poll lobby/round data occasionally while private 4Hz SSE is healthy.
 // If the stream stalls or disconnects, keep the existing 400ms fallback.
 if(!healthy||pollCount%8===0)poll();
},400);
setInterval(movement,180);
})();
