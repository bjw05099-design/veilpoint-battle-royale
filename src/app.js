(function(global){
'use strict';
const $=id=>document.getElementById(id);
const Game=global.VeilpointSim;
const clock=global.VeilpointClock.createClock({hz:60,maxFrameSeconds:0.25,maxSteps:8});
const fpsLimiter=global.VeilpointFPS.createFrameLimiter(60);
const graphics=global.VeilpointGraphics;
const perf=global.VeilpointPerformance;
const Desktop=global.VeilpointDesktopControls;
const telemetry=perf.createTelemetry();
let governor=null,autoResolution=false,lastGovernorCheck=0,lastRenderTime=null;
try{autoResolution=global.localStorage.getItem('veilpoint.autoResolution')==='true';}catch(_){}
let graphicsSettings=graphics.fromPreset('hyperreal165');
try{const saved=global.localStorage.getItem('veilpoint.graphics');if(saved)graphicsSettings=graphics.deserialize(saved);}catch(_){}
const fpsSelect=$('fpsLimit');
const profileSelect=$('graphicsPreset');
const resolutionSelect=$('renderScale');
const vegetationSelect=$('vegetation');
const effectsSelect=$('effects');
const autoResolutionCheckbox=$('autoResolution');autoResolutionCheckbox.checked=autoResolution;
const soundEnabledCheckbox=$('soundEnabled');
let soundEnabled=true;
try{soundEnabled=global.localStorage.getItem('veilpoint.br.audio')!=='off';}catch(_){}
function setSoundEnabled(enabled){
 soundEnabled=!!enabled;soundEnabledCheckbox.checked=soundEnabled;
 try{global.localStorage.setItem('veilpoint.br.audio',soundEnabled?'on':'off');}catch(_){}
}
soundEnabledCheckbox.checked=soundEnabled;
soundEnabledCheckbox.addEventListener('change',()=>setSoundEnabled(soundEnabledCheckbox.checked));
function saveGraphics(){try{global.localStorage.setItem('veilpoint.graphics',graphics.serialize(graphicsSettings));}catch(_){}}
function applyGraphicsSettings(){
 fpsLimiter.setLimit(graphicsSettings.fpsCap);
 governor=perf.createResolutionGovernor({minScale:Math.min(.7,graphicsSettings.resolutionScale),maxScale:graphicsSettings.resolutionScale,initialScale:graphicsSettings.resolutionScale,targetFps:graphicsSettings.fpsCap});
 telemetry.clear();lastRenderTime=null;lastGovernorCheck=0;
 if(renderer&&renderer.setGraphicsQuality)renderer.setGraphicsQuality(graphicsSettings);
 profileSelect.value=graphicsSettings.preset;
 fpsSelect.value=String(graphicsSettings.fpsCap);
 resolutionSelect.value=String(graphicsSettings.resolutionScale);
 vegetationSelect.value=String(graphicsSettings.vegetationDensity);
 effectsSelect.value=String(graphicsSettings.effects);
 $('fpsMeter').textContent='-- / '+graphicsSettings.fpsCap+' FPS';
 $('qualityInfo').textContent=graphicsSettings.preset==='hyperreal165'
  ?'화질과 165Hz 대응을 함께 최우선합니다. 실제 165FPS 달성은 GPU/모니터에 따라 달라집니다.'
  :'성능은 사용 중인 장치에서 실제 측정해야 합니다.';
 saveGraphics();
}
profileSelect.addEventListener('change',()=>{
 // Selecting Custom must actually enter editable, persisted custom mode while
 // preserving the current independent FPS, scale, vegetation and effects.
 graphicsSettings=profileSelect.value==='custom'
  ?graphics.customize(graphicsSettings,'fpsCap',graphicsSettings.fpsCap)
  :graphics.fromPreset(profileSelect.value);
 applyGraphicsSettings();
});
for(const [node,field] of [[fpsSelect,'fpsCap'],[resolutionSelect,'resolutionScale'],[vegetationSelect,'vegetationDensity'],[effectsSelect,'effects']]){
 node.addEventListener('change',()=>{try{graphicsSettings=graphics.customize(graphicsSettings,field,Number(node.value));applyGraphicsSettings();}catch(_){applyGraphicsSettings();}});
}
autoResolutionCheckbox.addEventListener('change',()=>{autoResolution=autoResolutionCheckbox.checked;applyGraphicsSettings();try{global.localStorage.setItem('veilpoint.autoResolution',String(autoResolution));}catch(_){}});
$('graphicsOpen').addEventListener('click',()=>{
 const panel=$('graphicsPanel');panel.classList.toggle('hidden');
 if(!panel.classList.contains('hidden')&&canAct())suspendMatch();
});
$('graphicsClose').addEventListener('click',()=>{$('graphicsPanel').classList.add('hidden');desktopUi.cancel();});

const loadoutSelect=$('weaponClass');
try{const saved=global.localStorage.getItem('veilpoint.weaponClass');loadoutSelect.value=Object.prototype.hasOwnProperty.call(Game.FIREARMS,saved)?saved:'carbine';}
catch(_){loadoutSelect.value='carbine';}
loadoutSelect.addEventListener('change',()=>{
 if(!Object.prototype.hasOwnProperty.call(Game.FIREARMS,loadoutSelect.value))loadoutSelect.value='carbine';
 try{global.localStorage.setItem('veilpoint.weaponClass',loadoutSelect.value);}catch(_){}
});
const canvas=$('scene');let renderer=null,simulation=Game.newMatch(20261027,18),running=false,suspended=false,last=performance.now(),lastHud=0,shake=0;
const input={forward:false,back:false,left:false,right:false,sprint:false,crouch:false,fireHeld:false};global.VeilpointInput=input;
const trigger=Desktop.createTriggerLatch();
function clearInput(){trigger.clear();for(const k in input)input[k]=false;}
const desktopUi=Desktop.attach(document,global.localStorage,clearInput);
// Pausing freezes both fixed-step simulation and every player-authored action.
// The live world still has status 'playing' while the pause overlay is open.
let pointerLockAttempt=0;
// A desktop player without pointer lock cannot aim; freeze both fire and the
// 60Hz world while permission is pending or the browser refuses the lock.
const canAct=()=>running&&!suspended&&!document.hidden&&simulation.status==='playing'&&
  (isTouch||document.pointerLockElement===canvas);
const MATCH_SAVE_KEY='veilpoint.brCheckpoint.v1';
let lastAutosaveElapsed=0,lastSavedHealth=100,saveWarning=false;
// LocalStorage JSON serialization is synchronous. Keep automatic fire responsive:
// save at most once per second during a volley, and always flush on pause/pagehide.
const SHOT_SAVE_INTERVAL_SECONDS=1;
const SHOT_HUD_INTERVAL_SECONDS=0.25;
let lastShotHudElapsed=-Infinity,shotFeedbackSerial=0;
function clearStoredMatch(){
 try{if(typeof global.localStorage.removeItem==='function')global.localStorage.removeItem(MATCH_SAVE_KEY);
 else global.localStorage.setItem(MATCH_SAVE_KEY,'');}catch(_){}
}
function persistMatch(){
 if(!running)return;
 if(simulation.status!=='playing'){clearStoredMatch();return;}
 try{global.localStorage.setItem(MATCH_SAVE_KEY,Game.snapshotMatch(simulation));
  lastAutosaveElapsed=simulation.elapsed;lastSavedHealth=simulation.player.health;saveWarning=false;
 }catch(_){if(!saveWarning){simulation.message='OFFLINE SAVE FAILED · THIS MATCH MAY NOT RESUME';simulation.messageTime=4;saveWarning=true;}}
}
function storedMatch(){
 try{const raw=global.localStorage.getItem(MATCH_SAVE_KEY);return raw?Game.restoreMatch(raw):null;}
 catch(_){clearStoredMatch();return null;}
}

function collectAmmo(){if(!canAct())return;Game.pickup(simulation);persistMatch();updateHud();}
function reloadWeapon(){if(!canAct())return;Game.reload(simulation);persistMatch();updateHud();}
function toggleReloadAssist(){if(!canAct())return;Game.setReloadAssist(simulation,!simulation.player.reloadAssist);persistMatch();updateHud();}
try { renderer=new global.VeilpointRenderer(canvas);
 renderer.onGpuTime=ms=>telemetry.record('gpu',ms);
 applyGraphicsSettings();
 if(!renderer.gpuTimer||!renderer.gpuTimer.supported){autoResolution=false;autoResolutionCheckbox.checked=false;autoResolutionCheckbox.disabled=true;autoResolutionCheckbox.title='이 브라우저에서 WebGL2 GPU 타이머 확장을 지원하지 않습니다';}
 }
catch(err){$('play').textContent='WebGL2를 지원하지 않습니다';$('play').disabled=true;$('message').textContent=String(err.message);}
// A Windows hybrid touchscreen can also have a real mouse. Prefer PC pointer
// lock whenever ANY fine pointer exists; coarse alone must not bypass aim lock.
const isTouch=!Desktop.isWindowsPC(global.navigator) &&
  matchMedia('(pointer:coarse)').matches && !matchMedia('(any-pointer:fine)').matches;
function requestAimLock(){
 if(isTouch)return;
 const attempt=++pointerLockAttempt;
 if(typeof canvas.requestPointerLock!=='function'){
  suspendMatch('pointer');resetInactiveClock();return;
 }
 try{
  const result=Desktop.requestPrecisionPointerLock(canvas,()=>attempt===pointerLockAttempt&&running&&!suspended);
  // Modern browsers reject a Promise on permission/user-gesture failure.
  // An older attempt must never pause a newer successful resume.
  if(result&&typeof result.catch==='function')result.catch(()=>{
   if(attempt===pointerLockAttempt&&running&&!suspended&&
      document.pointerLockElement!==canvas){
    suspendMatch('pointer');resetInactiveClock();
   }
  });
 }catch(_){suspendMatch('pointer');resetInactiveClock();}
}
function start(){
 clearStoredMatch();saveWarning=false;
 const weaponId=Object.prototype.hasOwnProperty.call(Game.FIREARMS,loadoutSelect.value)?loadoutSelect.value:'carbine';
 simulation=Game.newMatch(20261027+(Math.random()*10000|0),18,weaponId);simulation.status='playing';running=true;suspended=false;
 // A new round cannot inherit held keyboard, sprint, touch or look pointers.
 desktopUi.cancel();resetInactiveClock();$('overlay').classList.add('hidden');$('graphicsPanel').classList.add('hidden');
 $('mobileControls').classList.toggle('active',isTouch);updateHud();
 Desktop.focusGameplay(document,canvas);
 requestAimLock();
 persistMatch();
}
function resumeStoredMatch(){
 const restored=storedMatch();
 if(!restored){start();return;}
 simulation=restored;loadoutSelect.value=restored.player.weaponId;
 running=true;suspended=false;saveWarning=false;lastAutosaveElapsed=simulation.elapsed;lastSavedHealth=simulation.player.health;
 // A restored checkpoint must also start with neutral physical input.
 desktopUi.cancel();resetInactiveClock();
 $('overlay').classList.add('hidden');$('graphicsPanel').classList.add('hidden');
 $('mobileControls').classList.toggle('active',isTouch);updateHud();
 // A restored match must reclaim keyboard focus just like a new match.
 // Otherwise the still-focused Resume button consumes Space/arrow controls.
 Desktop.focusGameplay(document,canvas);
 requestAimLock();
}
if(storedMatch())$('play').textContent='저장 경기 이어하기';
// Never silently restart a paused match: the same match resumes only by user action.
function resumeMatch(){
 if(!running||!suspended)return;
 suspended=false;desktopUi.cancel();resetInactiveClock();
 $('overlay').classList.add('hidden');$('graphicsPanel').classList.add('hidden');
 $('mobileControls').classList.toggle('active',isTouch);
 Desktop.focusGameplay(document,canvas);
 requestAimLock();
}
$('play').addEventListener('click',()=>{if(running&&suspended)resumeMatch();else if(!running&&storedMatch())resumeStoredMatch();else start();});
$('newMatch').addEventListener('click',start);
addEventListener('keydown',e=>{
 if(desktopUi.captureKey(e))return;
 // Escape must cancel even a pending/denied mouse-capture request. The game
 // cannot act until locked, but the player must always be able to pause.
 if(e.code==='Escape'&&running&&!suspended){
  e.preventDefault();suspendMatch();resetInactiveClock();return;
 }
 // Menu/settings focus must never start a match or fire a round. In particular,
 // Enter on a focused button is already handled by its native click action.
 if(Desktop.isInteractiveTarget(e.target))return;
 const action=Desktop.actionFor(e.code,desktopUi.get());
 // Physical keydown is a discrete action: OS repeat rate must never determine
 // fire cadence, ammo use, menu toggles or remapped movement. Future held-fire
 // must be driven by the fixed 60Hz simulation, not keyboard auto-repeat.
 if(e.repeat){if(action)e.preventDefault();return;}
 if(action&&Object.prototype.hasOwnProperty.call(input,action)){e.preventDefault();if(canAct())input[action]=true;}
 if(e.code==='KeyG'){
  e.preventDefault();const panel=$('graphicsPanel');panel.classList.toggle('hidden');
  if(!panel.classList.contains('hidden')&&canAct())suspendMatch();
  else desktopUi.cancel();
 }
 if(action==='interact'){e.preventDefault();collectAmmo();}
 if(action==='reload'){e.preventDefault();reloadWeapon();}
 if(action==='assist'){e.preventDefault();toggleReloadAssist();}
 if(e.code==='KeyM'){e.preventDefault();setSoundEnabled(!soundEnabled);}
 if(action==='fire'){e.preventDefault();if(canAct()){fire();if(Game.FIREARMS[simulation.player.weaponId].automatic)input.fireHeld=trigger.press('keyboard');}}
 if(e.code==='Enter'&&simulation.status!=='playing'&&renderer){if(storedMatch())resumeStoredMatch();else start();}
});
addEventListener('keyup',e=>{
 const action=Desktop.actionFor(e.code,desktopUi.get());
 if(action&&Object.prototype.hasOwnProperty.call(input,action))input[action]=false;
 if(action==='fire')input.fireHeld=trigger.release('keyboard');
});
// Background throttling must never simulate hostile fire against an unfocused player.
function suspendMatch(reason='background'){
 if(!running||suspended)return;
 persistMatch();suspended=true;pointerLockAttempt++;
 $('overlay').classList.remove('hidden');
 $('mobileControls').classList.remove('active');
 $('play').textContent='이어하기';
 document.querySelector('.eyebrow').textContent='MATCH PAUSED';
 document.querySelector('h1').textContent='PAUSED.';
 document.querySelector('.tagline').textContent=reason==='pointer'
  ?'마우스 포인터 잠금이 해제되었거나 거부되었습니다. 화면을 클릭해 권한을 허용한 뒤 이어하기를 누르세요.'
  :'경기가 일시중지되었습니다. 이어하기를 눌러 같은 경기로 복귀하세요.';
 if(document.pointerLockElement===canvas)document.exitPointerLock();
}
function resetInactiveClock(){
 clearInput();lastShotHudElapsed=-Infinity;shotFeedbackSerial++;
 // A lost touch pointer may never emit pointerup; discard held stick and camera
 // gestures so resuming cannot move or rotate the player without fresh input.
 joyId=null;lookId=null;previousLook=null;thumb.x=0;thumb.y=0;nub.style.transform='';
 clock.reset();fpsLimiter.reset();telemetry.clear();lastRenderTime=null;last=performance.now();
 updateHud();
}
addEventListener('blur',()=>{suspendMatch();resetInactiveClock();});
addEventListener('pagehide',()=>{suspendMatch();resetInactiveClock();});
addEventListener('focus',resetInactiveClock);
// Escape or browser UI can release pointer lock without blurring the window.
// Do not leave the 60Hz hostile simulation running while the player cannot aim.
document.addEventListener('pointerlockchange',()=>{
 if(isTouch)return;
 // If a pending permission request succeeds after pausing, release it again.
 if(suspended&&document.pointerLockElement===canvas){document.exitPointerLock();return;}
 if(running&&!suspended&&document.pointerLockElement!==canvas){
  suspendMatch('pointer');resetInactiveClock();
 }
});
// Legacy browsers may report a failed pointer-lock request only by event,
// without a rejected Promise or pointerlockchange. Never strand the player in
// a hidden menu with a frozen but apparently active PC match.
document.addEventListener('pointerlockerror',()=>{
 if(!isTouch&&running&&!suspended&&document.pointerLockElement!==canvas){
  suspendMatch('pointer');resetInactiveClock();
 }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendMatch();resetInactiveClock();});
function look(mx,my){const delta=Desktop.mouseDelta(mx,my,desktopUi.get());simulation.player.yaw+=delta.yaw;simulation.player.pitch=Math.max(-.33,Math.min(.35,simulation.player.pitch+delta.pitch));}
addEventListener('mousemove',e=>{if(canAct()&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
canvas.addEventListener('click',()=>{if(!canAct()||isTouch)return;if(document.pointerLockElement!==canvas)requestAimLock();});
canvas.addEventListener('mousedown',e=>{
 if(e.button!==0||!canAct()||isTouch||document.pointerLockElement!==canvas)return;
 fire();
 if(Game.FIREARMS[simulation.player.weaponId].automatic)input.fireHeld=trigger.press('mouse');
});
addEventListener('mouseup',e=>{if(e.button===0)input.fireHeld=trigger.release('mouse');});
let audio=null;
function tone(freq=560,duration=.08){if(!soundEnabled)return;try{if(!audio)audio=new (global.AudioContext||global.webkitAudioContext)();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(freq*.5,audio.currentTime+duration);gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.00001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch(e){}}
function fire(){if(!canAct())return;const result=Game.tag(simulation);if(!result.ok)return;shotFeedback();}
function shotFeedback(){
 // A fixed-step held trigger may fire several times per second. Avoid a
 // synchronous full-world snapshot and minimap redraw for every round.
 // Normal 15s autosave, explicit inventory actions and pause still flush state.
 if(simulation.elapsed-lastAutosaveElapsed>=SHOT_SAVE_INTERVAL_SECONDS)persistMatch();
 if(simulation.elapsed-lastShotHudElapsed>=SHOT_HUD_INTERVAL_SECONDS){
  updateHud();lastShotHudElapsed=simulation.elapsed;
 }
 const firearm=Game.FIREARMS[simulation.player.weaponId];
 tone(firearm.cueHz,firearm.cueSeconds);shake=.55;
 $('hitText').textContent='SHOT FIRED';
 // Older feedback timers must never clear the newest shot's indicator.
 const serial=++shotFeedbackSerial;
 setTimeout(()=>{if(serial===shotFeedbackSerial)$('hitText').textContent='READY';},300);
}
// Mobile thumbstick and free-look gesture handlers.
const stick=$('stick'),nub=$('nub');let joyId=null,lookId=null,previousLook=null;
const thumb={x:0,y:0};
stick.addEventListener('pointerdown',e=>{if(!canAct())return;joyId=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});
stick.addEventListener('pointermove',e=>{if(canAct()&&e.pointerId===joyId)updateStick(e);});
function updateStick(e){const b=stick.getBoundingClientRect(),cx=b.x+b.width/2,cy=b.y+b.height/2;thumb.x=Math.max(-1,Math.min(1,(e.clientX-cx)/44));thumb.y=Math.max(-1,Math.min(1,(e.clientY-cy)/44));nub.style.transform=`translate(${thumb.x*36}px,${thumb.y*36}px)`;}
function stopStick(e){if(joyId===e.pointerId){joyId=null;thumb.x=0;thumb.y=0;nub.style.transform='';}}
stick.addEventListener('pointerup',stopStick);stick.addEventListener('pointercancel',stopStick);
canvas.addEventListener('pointerdown',e=>{if(!isTouch||!canAct())return;lookId=e.pointerId;previousLook={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!canAct()||lookId!==e.pointerId||!previousLook)return;look(e.clientX-previousLook.x,e.clientY-previousLook.y);previousLook={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{if(e.pointerId===lookId){lookId=null;previousLook=null;}});
$('tagButton').addEventListener('pointerdown',e=>{e.preventDefault();fire();});$('reloadButton').addEventListener('pointerdown',e=>{e.preventDefault();reloadWeapon();});$('lootButton').addEventListener('pointerdown',e=>{e.preventDefault();collectAmmo();});
$('assistButton').addEventListener('pointerdown',e=>{e.preventDefault();toggleReloadAssist();});
$('sprintButton').addEventListener('pointerdown',e=>{e.preventDefault();if(canAct())input.sprint=true;});
for(const e of ['pointerup','pointercancel'])$('sprintButton').addEventListener(e,()=>input.sprint=false);
function minimap(){const c=$('minimap'),ctx=c.getContext('2d'),w=c.width,h=c.height,z=Game.WORLD,tx=x=>(x+z)/(2*z)*w,tz=v=>(v+z)/(2*z)*h;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#102a2b';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#42615d';ctx.lineWidth=.5;
 for(let i=0;i<9;i++){let a=w*i/8;ctx.beginPath();ctx.moveTo(a,0);ctx.lineTo(a,h);ctx.moveTo(0,a);ctx.lineTo(w,a);ctx.stroke();}
 ctx.strokeStyle='#a8d8fc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx(simulation.zone.x),tz(simulation.zone.z),simulation.zone.radius/z*w/2,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#758785';for(const o of simulation.obstacles)ctx.fillRect(tx(o.x-o.w/2),tz(o.z-o.d/2),o.w/z*w/2,o.d/z*h/2);
 // No omniscient opponent positions: the map is a local map, not a live enemy tracker.
 const p=simulation.player;ctx.fillStyle='#eaffbd';ctx.beginPath();ctx.arc(tx(p.x),tz(p.z),4.8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#eaffbd';ctx.beginPath();ctx.moveTo(tx(p.x),tz(p.z));ctx.lineTo(tx(p.x)+Math.sin(p.yaw)*15,tz(p.z)-Math.cos(p.yaw)*15);ctx.stroke();
}
function updateHud(){const s=simulation,p=s.player;$('alive').textContent=Game.getAliveCount(s);$('phase').innerHTML=String(s.zone.phase+1).padStart(2,'0')+' <span class="unit">/ 06</span>';
 let tt=Math.max(0,Math.ceil(s.zone.phaseRemaining));$('time').textContent=String((tt/60)|0).padStart(2,'0')+':'+String(tt%60).padStart(2,'0');
 for(const k of ['health','stamina']){$(k+'Num').textContent=Math.round(p[k]);$(k+'Bar').style.width=p[k]+'%';}
 $('weaponName').textContent=Game.FIREARMS[p.weaponId].label;
 $('charges').innerHTML=p.loaded+'<span> / '+(p.charges-p.loaded)+'</span>';
 $('ammoStatus').textContent=(p.reloadRemaining>0?(p.reloadHesitation?'HESITATION · R TO CORRECT':'RELOADING'):'READY')+' · STRESS '+Math.round(p.stress||0)+' · MOBILITY '+Math.round(Game.injuryMobility(p)*100)+'% · ASSIST '+(p.reloadAssist?'ON':'OFF');
  $('assistButton').textContent=p.reloadAssist?'ASSIST ON':'ASSIST OFF';$('elims').textContent=String(s.kills).padStart(2,'0')+' ELIMINATIONS';
 $('damage').style.opacity=Math.min(.85,s.damageFlash);
 $('compass').textContent=['N','NE','E','SE','S','SW','W','NW'][((Math.round((p.yaw%(2*Math.PI)+Math.PI*2)/(Math.PI/4)))%8)]+' '+String(((p.yaw*180/Math.PI)%360+360)%360|0).padStart(3,'0')+'°';
 const boundary=Game.boundaryStatus(s);
 const eventMessage=s.messageTime>0?s.message:p.sprintExhausted?'EXHAUSTED · WALK UNTIL STAMINA 25':'';
 // Every published phase, including the last one, has a real deadline.
 const deadline=s.zone.phaseRemaining>0?' · DEADLINE '+tt+'s':' · FINAL LIMIT ACTIVE';
 const boundaryMessage=boundary.outside?'OUTSIDE MATCH BOUNDARY · RETURN '+boundary.meters+'m'+deadline:
   boundary.near?'BOUNDARY NEARBY · '+boundary.meters+'m'+deadline:'';
 // Keep reload and other event feedback readable alongside the boundary warning.
 $('message').textContent=suspended&&running?'창 비활성 · 시뮬레이션 일시중지':
   [boundaryMessage,eventMessage].filter(Boolean).join(' · ');
 const nearby=Game.nearestReachablePickup(s);
 $('pickupPrompt').style.display=nearby?'block':'none';
 if(nearby)$('pickupPrompt').textContent=nearby.weaponId!==p.weaponId?'INCOMPATIBLE AMMUNITION'
  :p.charges>=p.maxCharges?'AMMUNITION FULL':'[E] COLLECT '+Game.FIREARMS[p.weaponId].label+' AMMO · '+(nearby.remaining??(nearby.kind==='ammo'?12:24))+' ROUNDS LEFT';
 minimap();
}
function end(){clearStoredMatch();running=false;$('overlay').classList.remove('hidden');$('mobileControls').classList.remove('active');$('play').textContent='다시 시작';
 const won=simulation.status==='won';document.querySelector('.eyebrow').textContent=won?'LAST SIGNAL / CHAMPION':'SIGNAL LOST / MATCH FINISHED';
 document.querySelector('h1').innerHTML=won?'VICT<span>ORY.</span>':'RE<span>DEPLOY.</span>';
 document.querySelector('.tagline').textContent=(won?'최후의 생존자가 되었습니다. ':'이번 라운드는 종료되었습니다. ')+`생존 ${Math.floor(simulation.elapsed)}초 · 제거 ${simulation.kills}명 · 순위 ${Game.getFinalPlacement(simulation)}위`;
 if(document.pointerLockElement===canvas)document.exitPointerLock();
}
function frame(now){requestAnimationFrame(frame);let dt=Math.min(Math.max((now-last)/1000,0),.25);last=now;
 if(renderer){if(canAct()){
  if(joyId!==null){input.left=thumb.x<-.25;input.right=thumb.x>.25;input.forward=thumb.y<-.25;input.back=thumb.y>.25;}
  clock.advance(dt,step=>{
   if(simulation.status!=='playing')return;
   Game.tick(simulation,step,input);
   if(input.fireHeld&&simulation.status==='playing'&&Game.autoFire(simulation,true).ok)shotFeedback();
  });
  if(simulation.status==='playing'&&(simulation.elapsed-lastAutosaveElapsed>=15 ||
    (simulation.player.health<lastSavedHealth-.5&&simulation.elapsed-lastAutosaveElapsed>=1)))persistMatch();
 }
 // Resolve terminal states even when they change between simulation ticks.
 if(running&&simulation.status!=='playing')end();
 if(!suspended&&fpsLimiter.shouldRender(now)){
  if(lastRenderTime!==null)telemetry.record('raf',now-lastRenderTime);
  lastRenderTime=now;
  const cpuStart=performance.now();renderer.draw(simulation);
  telemetry.record('cpu',performance.now()-cpuStart);
  if(autoResolution&&renderer.gpuTimer&&renderer.gpuTimer.supported&&now-lastGovernorCheck>=1250){
   const gpu=telemetry.stats('gpu'),cpu=telemetry.stats('cpu');
   renderer.setAdaptiveResolution(governor.update({nowMs:now,gpuP95:gpu.p95,cpuP95:cpu.p95,gpuSamples:gpu.count,cpuSamples:cpu.count}));
   lastGovernorCheck=now;
  }
 }}
 if(now-lastHud>250){updateHud();const f=fpsLimiter.stats();$('fpsMeter').textContent=(f.actualFps||'--')+' / '+f.cap+' FPS';
 const cpu=telemetry.stats('cpu'),gpu=telemetry.stats('gpu'),raf=telemetry.stats('raf');
 const fmt=v=>v===null?'측정 불가':v.toFixed(2)+'ms';
 const scale=renderer?(renderer.adaptiveScale||(renderer.fallback&&renderer.fallback.adaptiveScale)||graphicsSettings.resolutionScale):graphicsSettings.resolutionScale;
 const timings=(label,stats)=>label+' (n='+stats.count+') P50/P95/P99: '+
   [stats.p50,stats.p95,stats.p99].map(fmt).join(' / ');
 // These are browser callback/draw/timer-query samples, not end-to-end input latency.
 $('perfDetails').textContent=[timings('렌더 CPU',cpu),timings('GPU 타이머',gpu),
   timings('표시 콜백 간격',raf),'현재 내부 렌더 배율: '+Math.round(scale*100)+'%'+
   (renderer&&renderer.lastVisibilityStats?' · 동적 버텍스: '+renderer.lastVisibilityStats.estimatedDynamicVertices+' / 봇: '+renderer.lastVisibilityStats.botsVisible+'/'+renderer.lastVisibilityStats.botsTotal:'')].join('\n');
 lastHud=now;}
}
requestAnimationFrame(frame);
})(globalThis);
