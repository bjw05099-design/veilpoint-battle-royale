(function(global){
'use strict';
const $=id=>document.getElementById(id);
const Game=global.VeilpointSim;
const Navigation=global.VeilpointNavigation;
const clock=global.VeilpointClock.createClock({hz:60,maxFrameSeconds:0.25,maxSteps:8});
const fpsLimiter=global.VeilpointFPS.createFrameLimiter(60);
const graphics=global.VeilpointGraphics;
const perf=global.VeilpointPerformance;
const Desktop=global.VeilpointDesktopControls;
const Challenge=global.VeilpointBRChallenge;
const telemetry=perf.createTelemetry();
const gpuEvidenceGate=perf.createGpuEvidenceGate();
const benchmark=global.VeilpointBenchmark?global.VeilpointBenchmark.createBenchmark():null;
const benchmarkStart=$('benchmarkStart'),benchmarkStop=$('benchmarkStop'),benchmarkExport=$('benchmarkExport'),benchmarkStatus=$('benchmarkStatus'),benchmarkQuickExport=$('benchmarkQuickExport');
const benchmarkCopy=$('benchmarkCopy'),benchmarkRawJson=$('benchmarkRawJson'),
 benchmarkRawLabel=$('benchmarkRawLabel'),benchmarkExportHelp=$('benchmarkExportHelp');
const defaultBenchmarkHelp='파일 저장이 차단되면 JSON 직접 보기·복사를 사용하세요. Ctrl+C로 복사하여 .json 파일로 보관할 수 있습니다.';
function benchmarkUi(){
 if(!benchmark){benchmarkStart.disabled=true;benchmarkStop.disabled=true;benchmarkExport.disabled=true;benchmarkCopy.disabled=true;benchmarkStatus.textContent='측정 모듈을 불러오지 못했습니다.';return;}
 const info=benchmark.getStatus(),active=info.state==='armed'||info.state==='running';
 benchmarkStart.disabled=active;benchmarkStop.disabled=!active;
 const canExport=info.state==='finished'&&info.frames>=2;
 benchmarkExport.disabled=!canExport;
 benchmarkCopy.disabled=!canExport;
 if(!canExport){
  benchmarkRawJson.value='';
  benchmarkRawJson.classList.add('hidden');
  benchmarkRawLabel.classList.add('hidden');
  benchmarkExportHelp.textContent=defaultBenchmarkHelp;
 }
 benchmarkQuickExport.classList.toggle('hidden',!canExport);
 benchmarkQuickExport.textContent=info.reason==='completed'?'120초 측정 JSON 저장':'부분 측정 JSON 저장';
 const seconds=Math.min(info.durationMs/1000,Math.max(0,Math.floor((info.elapsedMs-info.warmupMs)/1000)));
 benchmarkStatus.textContent=info.state==='armed'?'준비됨 · 설정을 닫고 게임 시작/이어하기를 누르면 자동 측정됩니다.':
  info.state==='running'?'측정 중 · '+seconds+'/'+info.durationMs/1000+'초 (초기 예열 제외)':
  info.state==='finished'?(info.reason==='completed'
   ?'측정 완료 · '+info.durationMs/1000+'초 · JSON을 저장하세요.'
   :'측정 종료 · 부분 측정 · '+seconds+'/'+info.durationMs/1000+'초 · 중단 원인: '+info.reason+' · 120초 결과가 아닙니다. JSON 저장 또는 다시 측정하세요.'):
  '미측정 · 클릭해서 준비한 뒤 게임을 플레이하세요. 측정 데이터는 외부 전송되지 않습니다.';
}
if(benchmark){
benchmarkStart.addEventListener('click',()=>{
 benchmark.arm({graphicsPreset:graphicsSettings.preset,fpsCap:graphicsSettings.fpsCap,
  chosenRenderScale:graphicsSettings.resolutionScale,autoResolution,
  viewportCssPixels:{width:global.innerWidth,height:global.innerHeight},devicePixelRatio:global.devicePixelRatio,
  browserUserAgent:(global.navigator&&global.navigator.userAgent)||'unavailable',gpuTimerSupported:!!(renderer&&renderer.gpuTimer&&renderer.gpuTimer.supported),
  referenceHardware:'RTX 3070 / 16 GB system RAM / QHD 165 Hz (owner reported; NOT browser verified)'});
 benchmarkUi();
});
benchmarkStop.addEventListener('click',()=>{benchmark.finish('manual');benchmarkUi();});
// A file:// browser or a locked-down Windows WebView can block Blob URL
// downloads entirely. Keep every verified local measurement retrievable with
// a selectable plain-text JSON fallback; never upload the result to a server.
function revealBenchmarkJson(downloadBlocked=false){
 if(benchmark.getStatus().state!=='finished'||benchmark.getStatus().frames<2)return false;
 if($('graphicsPanel').classList.contains('hidden'))
  setGraphicsPanelOpen(true,$('graphicsPauseOpen'));
 // Opening settings defaults to the visual tab. A finished benchmark's
 // emergency JSON copy must activate its own visible, bounded PC page
 // before selecting text, even when invoked from the paused-game shortcut.
 setGraphicsSettingsScreen('benchmark');
 benchmarkRawJson.value=JSON.stringify(benchmark.report(),null,2)+'\n';
 benchmarkRawJson.classList.remove('hidden');
 benchmarkRawLabel.classList.remove('hidden');
 benchmarkExportHelp.textContent=downloadBlocked
  ?'파일 저장을 브라우저가 차단했습니다. 아래 원본 JSON을 Ctrl+C로 복사하고 .json 파일로 저장하세요. 부분 측정은 완료 결과가 아닙니다.'
  :'아래 측정 결과 JSON을 Ctrl+C로 복사해 .json 파일로 저장할 수 있습니다. 파일은 자동 전송되지 않습니다.';
 if(typeof benchmarkRawJson.focus==='function')benchmarkRawJson.focus();
 if(typeof benchmarkRawJson.select==='function')benchmarkRawJson.select();
 return true;
}
const saveBenchmark=()=>{
 if(benchmark.getStatus().state!=='finished'||benchmark.getStatus().frames<2)return;
 const report=benchmark.report();
 let url=null;
 try{
  const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
  url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=report.completed?'veilpoint-browser-benchmark.json':'veilpoint-browser-benchmark-partial.json';
  document.body.appendChild(a);a.click();a.remove();
  const blobUrl=url;
  setTimeout(()=>URL.revokeObjectURL(blobUrl),2000);
 }catch(_){
  if(url){try{URL.revokeObjectURL(url);}catch(_){}}
  revealBenchmarkJson(true);
 }
};
benchmarkCopy.addEventListener('click',()=>revealBenchmarkJson());
benchmarkExport.addEventListener('click',saveBenchmark);
benchmarkQuickExport.addEventListener('click',saveBenchmark);
}
benchmarkUi();
let governor=null,autoResolution=false,lastGovernorCheck=0,lastRenderTime=null;
try{autoResolution=global.localStorage.getItem('veilpoint.autoResolution')==='true';}catch(_){}
let graphicsSettings=graphics.fromPreset('hyperreal165');
try{const saved=global.localStorage.getItem('veilpoint.graphics');if(saved)graphicsSettings=graphics.deserialize(saved);}catch(_){}
const fpsSelect=$('fpsLimit');
const profileSelect=$('graphicsPreset');
const resolutionSelect=$('renderScale');
const vegetationSelect=$('vegetation');
const effectsSelect=$('effects');
const Camera=global.VeilpointCameraView||Object.freeze({
 read:()=>55,validate:value=>{
  if(![48,55,63,70,78].includes(value))throw new RangeError('Invalid camera FOV');
  return value;
 },persist:()=>false
});
const cameraSelect=$('cameraFov');
const cameraStorage=()=>{try{return global.localStorage;}catch(_){return null;}};
let cameraFov=Camera.read(cameraStorage());
cameraSelect.value=String(cameraFov);
cameraSelect.addEventListener('change',()=>{
 try{
  cameraFov=Camera.validate(Number(cameraSelect.value));
  if(renderer&&typeof renderer.setFieldOfView==='function')renderer.setFieldOfView(cameraFov);
  if(!Camera.persist(cameraStorage(),cameraFov))
   $('qualityInfo').textContent='카메라 시야각 적용됨 · 이 탭에만 적용 (저장 실패)';
 }catch(_){cameraSelect.value=String(cameraFov);}
});
const autoResolutionCheckbox=$('autoResolution');autoResolutionCheckbox.checked=autoResolution;
const soundEnabledCheckbox=$('soundEnabled');
let soundEnabled=true;
let motorSound=null;
let windSound=null;
let footstepSound=null;
try{soundEnabled=global.localStorage.getItem('veilpoint.br.audio')!=='off';}catch(_){}
function setSoundEnabled(enabled){
 soundEnabled=!!enabled;soundEnabledCheckbox.checked=soundEnabled;
 try{global.localStorage.setItem('veilpoint.br.audio',soundEnabled?'on':'off');}catch(_){}
 if(!soundEnabled){
  if(motorSound)motorSound.stop();
  if(windSound)windSound.stop();if(footstepSound)footstepSound.stop();
 }else if(motorSound||windSound||footstepSound)syncMotorSound(true);
}
// One broad volume profile is shared across offline BR, CH01 and BR96.
const AudioPrefs=global.VeilpointAudioPreferences;
let audioMix=null;
if(AudioPrefs){
 // Preserve a deliberate old mute when migrating to the shared bus profile.
 let existing=null;
 try{existing=cameraStorage()?.getItem(AudioPrefs.KEY)}catch(_){}
 if(existing===null){
  try{if(global.localStorage.getItem('veilpoint.br.audio')==='off')
   AudioPrefs.persist(cameraStorage(),{...AudioPrefs.DEFAULT,enabled:false});}catch(_){}
 }
}
const audioControls=AudioPrefs&&$('vpAudioEnabled')
 ?AudioPrefs.attach(document,cameraStorage(),prefs=>{
   audioMix=prefs;setSoundEnabled(prefs.enabled);
   motorSound?.setVolume?.(AudioPrefs.gain(prefs,'effects'));
   windSound?.setVolume?.(AudioPrefs.gain(prefs,'ambience'));
   footstepSound?.setVolume?.(AudioPrefs.gain(prefs,'effects'));
 }):null;
soundEnabledCheckbox.checked=soundEnabled;
soundEnabledCheckbox.addEventListener('change',()=>{
 if(audioControls)audioControls.set({...audioControls.get(),enabled:soundEnabledCheckbox.checked});
 else setSoundEnabled(soundEnabledCheckbox.checked);
});
function saveGraphics(){
 try{
  const serialized=graphics.serialize(graphicsSettings);
  global.localStorage.setItem('veilpoint.graphics',serialized);
  // A denied or silently discarded write must not be presented as a saved
  // quality preset. An existing identical generation still counts as durable.
  return global.localStorage.getItem('veilpoint.graphics')===serialized;
 }catch(_){return false;}
}
function applyGraphicsSettings(){
 if(benchmark&&['armed','running'].includes(benchmark.getStatus().state))benchmark.finish('graphics-settings-changed');
 fpsLimiter.setLimit(graphicsSettings.fpsCap);
 governor=perf.createResolutionGovernor({minScale:Math.min(.7,graphicsSettings.resolutionScale),maxScale:graphicsSettings.resolutionScale,initialScale:graphicsSettings.resolutionScale,targetFps:graphicsSettings.fpsCap});
 telemetry.clear();gpuEvidenceGate.reset(performance.now());lastRenderTime=null;lastGovernorCheck=0;
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
 if(!saveGraphics())$('qualityInfo').textContent='화질 적용됨 · 저장 확인 실패 (현재 탭 전용)';
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
// Desktop pointer lock prevents clicking the topbar while aiming. The pause
// menu and G shortcut must open the same settings panel without advancing
// the 60Hz world. A close action never resumes gameplay implicitly.
let graphicsReturnFocus=null;
// Keep the PC options in three bounded, non-scrolling screens. Changing a
// category never resumes a paused world or saves/reset the user's preferences.
function setGraphicsSettingsScreen(screen='visual'){
 const names={visual:['graphicsVisualPage','graphicsTabVisual'],
  controls:['graphicsControlsPage','graphicsTabControls'],
  audio:['graphicsAudioPage','graphicsTabAudio'],
  benchmark:['graphicsBenchmarkPage','graphicsTabBenchmark']};
 if(!Object.prototype.hasOwnProperty.call(names,screen))return;
 for(const [name,[panelId,tabId]] of Object.entries(names)){
  const selected=name===screen;
  const panel=$(panelId);
  if(!panel)continue; // Isolated legacy PC harnesses may omit the new sound page.
  panel.classList.toggle('hidden',!selected);
  const tab=$(tabId);
  if(!tab)continue;
  if(typeof tab.setAttribute==='function')
   tab.setAttribute('aria-selected',String(selected));
  tab.tabIndex=selected?0:-1;
 }
 // Abandon an unfinished remap when its controls screen is no longer visible.
 if(screen!=='controls'&&typeof desktopUi!=='undefined')desktopUi.cancel();
}
const graphicsTabScreens=[['graphicsTabVisual','visual'],
 ['graphicsTabControls','controls'],['graphicsTabAudio','audio'],
 ['graphicsTabBenchmark','benchmark']];
for(const [id,screen] of graphicsTabScreens){
 const tab=$(id);
 if(!tab)continue;
 tab.addEventListener('click',()=>setGraphicsSettingsScreen(screen));
 tab.addEventListener('keydown',event=>{
  const keys=['ArrowRight','ArrowLeft','Home','End'];
  if(!keys.includes(event.key))return;
  // WAI-ARIA tab navigation stays within this settings screen and never
  // forwards arrow keys to the paused 60Hz simulation.
  event.preventDefault();
  event.stopPropagation();
  const current=graphicsTabScreens.findIndex(([tabId])=>tabId===id);
  const next=event.key==='Home'?0:event.key==='End'?graphicsTabScreens.length-1:
   (current+(event.key==='ArrowRight'?1:-1)+graphicsTabScreens.length)%graphicsTabScreens.length;
  const [nextId,nextScreen]=graphicsTabScreens[next];
  setGraphicsSettingsScreen(nextScreen);
  $(nextId).focus();
 });
}
// The PC settings window is a keyboard modal while visible. Without a focus
// boundary, Tab can reach the hidden-under-dialog Resume/New Match controls
// and Enter could activate gameplay underneath the settings screen.
function visibleGraphicsDialogControls(){
 const panel=$('graphicsPanel');
 return [...panel.querySelectorAll('button,select,input,textarea,a[href],[tabindex]')]
  .filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length>0&&
   getComputedStyle(node).visibility!=='hidden');
}
function containGraphicsDialogFocus(event){
 const panel=$('graphicsPanel');
 if(panel.classList.contains('hidden'))return;
 if(event.type==='focusin'){
  // Roving-tabindex PC tabs may intentionally use tabIndex=-1 while their
  // visible button still accepts direct focus. Tab traversal excludes them,
  // but focusin must not reject an active, visible programmatic target.
  // Hidden/disabled descendants remain invalid even inside the modal DOM.
  const targets=[...panel.querySelectorAll('button,select,input,textarea,a[href],[tabindex]')]
   .filter(node=>!node.disabled&&node.getClientRects().length>0&&
    getComputedStyle(node).visibility!=='hidden');
  if(!targets.some(node=>node===event.target||
     (typeof node.contains==='function'&&node.contains(event.target))))
   $('graphicsClose').focus({preventScroll:true});
  return;
 }
 if(event.key!=='Tab')return;
 const controls=visibleGraphicsDialogControls();
 if(!controls.length){
  event.preventDefault();$('graphicsClose').focus({preventScroll:true});return;
 }
 const index=controls.indexOf(document.activeElement);
 if(index<0||(event.shiftKey?index===0:index===controls.length-1)){
  event.preventDefault();
  controls[event.shiftKey?controls.length-1:0].focus({preventScroll:true});
 }
}
document.addEventListener('keydown',containGraphicsDialogFocus,true);
document.addEventListener('focusin',containGraphicsDialogFocus,true);
function setGraphicsPanelOpen(open,opener=null){
 if(open&&running&&!suspended){
  suspendMatch();
  resetInactiveClock();
 }
 const panel=$('graphicsPanel');
 if(open)setGraphicsSettingsScreen('visual');
 panel.classList.toggle('hidden',!open);
 for(const id of ['graphicsOpen','graphicsPauseOpen']){
  const control=$(id);
  if(typeof control.setAttribute==='function')
   control.setAttribute('aria-expanded',String(!!open));
 }
 if(open){
  graphicsReturnFocus=opener||$('graphicsPauseOpen');
  if(typeof $('graphicsClose').focus==='function')$('graphicsClose').focus();
 }else{
  desktopUi.cancel();
  const restore=graphicsReturnFocus;graphicsReturnFocus=null;
  if(restore&&(suspended||!running)&&typeof restore.focus==='function')restore.focus();
 }
}
$('graphicsOpen').addEventListener('click',()=>setGraphicsPanelOpen(
 $('graphicsPanel').classList.contains('hidden'),$('graphicsOpen')));
$('graphicsPauseOpen').addEventListener('click',()=>setGraphicsPanelOpen(
 $('graphicsPanel').classList.contains('hidden'),$('graphicsPauseOpen')));
$('graphicsClose').addEventListener('click',()=>setGraphicsPanelOpen(false));

const loadoutSelect=$('weaponClass');
const rosterSelect=$('brRoster');
const entrySelect=$('brEntrySite');
const lightingSelect=$('brLighting');
const selectedLighting=()=>Object.prototype.hasOwnProperty.call(Game.BR_LIGHTING,lightingSelect.value)?lightingSelect.value:'day';
const selectedEntry=()=>Object.prototype.hasOwnProperty.call(Game.ENTRY_SITES,entrySelect.value)?entrySelect.value:'central';
const selectedRoster=()=>[1,4,18].includes(Number(rosterSelect.value))?Number(rosterSelect.value):18;
try{const saved=global.localStorage.getItem('veilpoint.weaponClass');loadoutSelect.value=Object.prototype.hasOwnProperty.call(Game.FIREARMS,saved)?saved:'carbine';}
catch(_){loadoutSelect.value='carbine';}
loadoutSelect.addEventListener('change',()=>{
 if(!Object.prototype.hasOwnProperty.call(Game.FIREARMS,loadoutSelect.value))loadoutSelect.value='carbine';
 try{global.localStorage.setItem('veilpoint.weaponClass',loadoutSelect.value);}catch(_){}
});
const canvas=$('scene');let stillRequested=false;let renderer=null,simulation=Game.newMatch(20261027,18),running=false,suspended=false,graphicsContextLost=false,last=performance.now(),lastHud=0,shake=0;
const input={forward:false,back:false,left:false,right:false,sprint:false,crouch:false,fireHeld:false,observe:false};global.VeilpointInput=input;
const trigger=Desktop.createTriggerLatch();
function clearInput(){trigger.clear();for(const k in input)input[k]=false;}
// file:// and privacy-restricted desktop browsers may throw on the storage getter.
// Control defaults must still initialize so an offline match can start.
const desktopStorage=(()=>{try{return global.localStorage;}catch(_){return null;}})();
const desktopUi=Desktop.attach(document,desktopStorage,clearInput);
// Pausing freezes both fixed-step simulation and every player-authored action.
// The live world still has status 'playing' while the pause overlay is open.
// A browser may never resolve or reject a pointer-lock permission request.
// Fail closed to a visible, resumable pause rather than leaving a hidden frozen game.
const POINTER_LOCK_TIMEOUT_MS=4000;
let pointerLockAttempt=0,pointerLockPendingSince=null,aimLockObserved=false;
// A desktop player without pointer lock cannot aim; freeze both fire and the
// 60Hz world while permission is pending or the browser refuses the lock.
const canAct=()=>running&&!suspended&&!graphicsContextLost&&!!renderer&&!document.hidden&&simulation.status==='playing'&&
  (isTouch||document.pointerLockElement===canvas);
const MATCH_SAVE_KEY='veilpoint.brCheckpoint.v1';
const MATCH_BACKUP_KEY='veilpoint.brCheckpoint.v1.previous';
const FIELD_BOOKMARK_KEY='veilpoint.brFieldBookmark.v1';
const LAST_RESULT_KEY='veilpoint.brLastResult.v1';
let lastAutosaveElapsed=0,lastSavedHealth=100,saveWarning=false,nextMatchSaveRetryAt=0;
// A storage conflict must remain visible in the HUD after its transient toast fades.
let saveIssue=null;
let bookmarkIssue=null;
// The exact BR generation this PC session last read or successfully wrote.
// Do not let an older browser tab silently replace a newer offline round.
let matchDiskGeneration=null;
function ownsStoredMatch(){
 try{return (global.localStorage.getItem(MATCH_SAVE_KEY)||null)===(matchDiskGeneration||null);}
 catch(_){return false;}
}
// All automatic BR checkpoint writes share the same bounded retry window.
// Explicit PC Save & Exit remains immediate even while retry is pending.
function canAutoPersistMatch(){return simulation.elapsed>=nextMatchSaveRetryAt;}
let lastFinishedMatch=null; // Same-arena retry metadata, never an active checkpoint.
function clearLastResult(){
 try{global.localStorage.removeItem(LAST_RESULT_KEY);}
 catch(_){try{global.localStorage.setItem(LAST_RESULT_KEY,'');}catch(_){}}
}
function readLastResult(){
 // An invalid read or privacy-policy denial is not permission to erase a
 // shared report that a different tab may have just updated.
 try{const raw=global.localStorage.getItem(LAST_RESULT_KEY);
  return raw?Game.restoreLastResult(raw):null;
 }catch(_){return null;}
}
function archiveLastResult(){
 // A terminal archive is factual only if the exact report bytes persist.
 // The saved result is not an active checkpoint and cannot restore gameplay.
 if(running&&simulation.status!=='playing'&&!ownsStoredMatch())return null;
 try{
  const report=Game.createLastResult(simulation),raw=JSON.stringify(report);
  global.localStorage.setItem(LAST_RESULT_KEY,raw);
  if(global.localStorage.getItem(LAST_RESULT_KEY)!==raw)return null;
  if(running&&simulation.status!=='playing'&&!ownsStoredMatch())return null;
  return report;
 }catch(_){return null;}
}
let pauseRestartArmed=false,forfeitArmed=false,manualCheckpoint=null;
// Keep the optional P-key field bookmark separately from the newest autosave.
// It is restored only for the same active arena and cleared on a new/ended match.
function clearFieldBookmark(explicitReset=false){
 // In-session bookmark repair (even while still playing) must not erase a
 // newer browser tab's durable field bookmark. Explicit New Match is the
 // one intentionally destructive operation and can reset every generation.
 manualCheckpoint=null;
 if(!explicitReset&&!ownsStoredMatch())return false;
 try{global.localStorage.removeItem(FIELD_BOOKMARK_KEY);}
 catch(_){try{global.localStorage.setItem(FIELD_BOOKMARK_KEY,'');}catch(_){}}
 return true;
}
function loadFieldBookmark(){
 // Reading can fail transiently when a browser extension or privacy policy
 // locks localStorage. That is NOT evidence that the saved bookmark is invalid:
 // do not invoke the destructive clear path on a read failure.
 let saved;
 try{saved=global.localStorage.getItem(FIELD_BOOKMARK_KEY);}
 catch(_){
  bookmarkIssue='write-failed';
  return null;
 }
 if(!saved)return null;
 try{
  Game.restoreFieldBookmark(simulation,saved);
  return saved;
 }catch(_){
  // Another tab can replace a corrupt bookmark while its contents are being
  // validated. Only repair the generation we actually read, never its successor.
  try{
   if(global.localStorage.getItem(FIELD_BOOKMARK_KEY)!==saved){
    bookmarkIssue='conflict';
    return null;
   }
  }catch(_readError){bookmarkIssue='write-failed';return null;}
  // localStorage has no atomic compare-and-delete. Even matching bytes can
  // be replaced between this check and removeItem by another running tab.
  // Never destroy the disk generation during an automatic failed read;
  // explicit New Match and a later verified P-key save own replacement.
  bookmarkIssue='write-failed';
  return null;
 }
}
function recordFieldBookmark(){
 let raw;
 try{raw=Game.snapshotMatch(simulation);}
 catch(_){
  // A malformed in-memory snapshot must not crash the PC P-key handler or
  // discard the last playable manual bookmark.
  bookmarkIssue='write-failed';
  return false;
 }
 manualCheckpoint=raw;
 if(memoryOnlyMatch)return false; // The local bookmark is NOT durable.
 // Never overwrite the save owned by another tab. Browser localStorage
 // offers no atomic compare-and-swap, so also recheck after the write.
 if(!ownsStoredMatch()){
  saveWarning=true;saveIssue='conflict';
  bookmarkIssue='conflict';
  nextMatchSaveRetryAt=simulation.elapsed+1;
  return false;
 }
 try{
  global.localStorage.setItem(FIELD_BOOKMARK_KEY,raw);
  // A quota shim or privacy extension can silently ignore setItem, or a
  // competing tab can replace its result before the read. Only exact bytes
  // establish that the bookmark really survived in persistent storage.
  if(global.localStorage.getItem(FIELD_BOOKMARK_KEY)!==raw){
   bookmarkIssue='write-failed';
   return false;
  }
  if(!ownsStoredMatch()){
   saveWarning=true;saveIssue='conflict';
   bookmarkIssue='conflict';
   nextMatchSaveRetryAt=simulation.elapsed+1;
   return false;
  }
  bookmarkIssue=null;
  return true;
 }catch(_){
  // Bookmark failure is distinct from the main checkpoint; the bookmark
  // remains usable in this tab without claiming it was persisted.
  bookmarkIssue='write-failed';
  return false;
 }
}
// LocalStorage JSON serialization is synchronous. Keep automatic fire responsive:
// save at most once per second during a volley, and always flush on pause/pagehide.
const SHOT_SAVE_INTERVAL_SECONDS=1;
const SHOT_HUD_INTERVAL_SECONDS=0.25;
let lastShotHudElapsed=-Infinity,shotFeedbackSerial=0;
function clearStoredMatch(){
 // A stale finished tab must never remove a different tab's checkpoint.
 if(running&&simulation.status!=='playing'&&!ownsStoredMatch())return false;
 // A failed explicit reset must not discard the only previous recoverable
 // checkpoint. Keep its exact bytes, even when the primary is corrupt.
 let originalPrimary,originalBackup;
 try{
  originalPrimary=global.localStorage.getItem(MATCH_SAVE_KEY);
  originalBackup=global.localStorage.getItem(MATCH_BACKUP_KEY);
 }catch(_){return false;}
 const restoreOriginalBackup=()=>{
  if(originalBackup===null||originalBackup==='')return;
  try{
   // A newer backup from another PC tab takes precedence over our rollback.
   const current=global.localStorage.getItem(MATCH_BACKUP_KEY);
   if(current!==null&&current!=='')return;
   global.localStorage.setItem(MATCH_BACKUP_KEY,originalBackup);
  }catch(_){}
 };
 const clearGeneration=key=>{
  let removed=false;
  try{
   if(typeof global.localStorage.removeItem==='function'){
    global.localStorage.removeItem(key);removed=true;
   }
  }catch(_){}
  if(!removed){
   try{global.localStorage.setItem(key,'');}
   catch(_){return false;}
  }
  try{
   const remaining=global.localStorage.getItem(key);
   return remaining===null||remaining==='';
  }catch(_){return false;}
 };
 try{
  // This is a best-effort compare-before-delete guard. Browser localStorage
  // cannot provide a cross-tab transaction or atomic compare-and-swap.
  if(global.localStorage.getItem(MATCH_SAVE_KEY)!==originalPrimary||
     global.localStorage.getItem(MATCH_BACKUP_KEY)!==originalBackup)return false;
  if(!clearGeneration(MATCH_BACKUP_KEY))return false;
  // Another tab might update the primary while the backup is being cleared.
  if(global.localStorage.getItem(MATCH_SAVE_KEY)!==originalPrimary){
   restoreOriginalBackup();return false;
  }
  if(!clearGeneration(MATCH_SAVE_KEY)){
   restoreOriginalBackup();return false;
  }
  if(global.localStorage.getItem(MATCH_SAVE_KEY)||
     global.localStorage.getItem(MATCH_BACKUP_KEY)){
   restoreOriginalBackup();return false;
  }
  matchDiskGeneration=null;
  return true;
 }catch(_){
  restoreOriginalBackup();return false;
 }
}
function persistMatch(){
 if(!running||memoryOnlyMatch)return false;
 if(simulation.status!=='playing'){clearStoredMatch();return false;}
 try{
  const raw=Game.snapshotMatch(simulation);
  // Fail closed on storage read denial or a changed primary generation.
  // localStorage has no cross-tab transaction; this is a best-effort
  // compare-before-write guard, not an atomic distributed lock.
  const previous=global.localStorage.getItem(MATCH_SAVE_KEY)||null;
  if(previous!==(matchDiskGeneration||null)){
   nextMatchSaveRetryAt=simulation.elapsed+1;
   if(!saveWarning){
    simulation.message='OFFLINE SAVE CONFLICT · ANOTHER TAB CHANGED CHECKPOINT';
    simulation.messageTime=4;
   }
   saveWarning=true;saveIssue='conflict';
   return false;
  }
  if(previous&&previous!==raw){
   // If the old primary cannot be validated or backed up, do not erase it.
   Game.restoreMatch(previous);
   global.localStorage.setItem(MATCH_BACKUP_KEY,previous);
   // A storage shim may silently discard a successful setItem. Do not
   // replace the only validated primary until its exact previous generation
   // survives in the backup slot. Another tab changing primary during this
   // rotation also invalidates the pending overwrite.
   const verifiedBackup=global.localStorage.getItem(MATCH_BACKUP_KEY);
   const verifiedPrimary=global.localStorage.getItem(MATCH_SAVE_KEY);
   if(verifiedBackup!==previous||verifiedPrimary!==previous){
    nextMatchSaveRetryAt=simulation.elapsed+1;
    saveWarning=true;
    saveIssue=verifiedPrimary!==previous?'conflict':'write-failed';
    simulation.message=saveIssue==='conflict'
     ?'OFFLINE SAVE CONFLICT · MATCH CHANGED DURING BACKUP'
     :'OFFLINE SAVE FAILED · PREVIOUS CHECKPOINT BACKUP NOT VERIFIED';
    simulation.messageTime=4;
    return false;
   }
  }
  global.localStorage.setItem(MATCH_SAVE_KEY,raw);
  // Storage shims, privacy extensions and competing tabs can acknowledge a
  // write without leaving its bytes in the active slot. Treat a checkpoint as
  // durable only after readback matches this exact serialized generation.
  // localStorage has no cross-tab CAS: this closes silent-drop/replace cases,
  // but cannot guarantee atomicity after the final read.
  const verified=global.localStorage.getItem(MATCH_SAVE_KEY);
  if(verified!==raw){
   nextMatchSaveRetryAt=simulation.elapsed+1;
   saveIssue=verified!==previous?'conflict':'write-failed';
   saveWarning=true;
   simulation.message=saveIssue==='conflict'
    ?'OFFLINE SAVE CONFLICT · CHECKPOINT CHANGED DURING WRITE'
    :'OFFLINE SAVE FAILED · STORAGE DID NOT RETAIN CHECKPOINT';
   simulation.messageTime=4;
   return false;
  }
  matchDiskGeneration=raw;
  lastAutosaveElapsed=simulation.elapsed;lastSavedHealth=simulation.player.health;
  nextMatchSaveRetryAt=0;
  if(saveWarning){
   simulation.message='OFFLINE CHECKPOINT RESTORED · MATCH SAVE AVAILABLE';
   simulation.messageTime=2;
  }
  saveWarning=false;saveIssue=null;
  return true;
 }catch(_){
  nextMatchSaveRetryAt=simulation.elapsed+1;
  saveIssue='write-failed';
  if(!saveWarning){simulation.message='OFFLINE SAVE FAILED · THIS MATCH MAY NOT RESUME';simulation.messageTime=4;saveWarning=true;}
  return false;
 }
}
// A temporary privacy/storage read exception must not delete a valid match.
// Read failure and a structurally corrupt checkpoint are distinct outcomes.
let checkpointReadUnavailable=false,checkpointInvalidStored=false,memoryOnlyMatch=false;
function storedMatch(){
 let primary=null,backup=null;
 // A new menu invocation can retry a prior denied backup promotion. Only this
 // explicit fresh read may exit the earlier temporary memory-only session.
 memoryOnlyMatch=false;
 try{
  primary=global.localStorage.getItem(MATCH_SAVE_KEY);
  backup=global.localStorage.getItem(MATCH_BACKUP_KEY);
 }catch(_){checkpointReadUnavailable=true;checkpointInvalidStored=false;return null;}
 checkpointReadUnavailable=false;
 checkpointInvalidStored=false;
 try{
  const result=Game.recoverMatch(primary,backup);
  if(!result)return null;
  if(result.source==='backup'){
   let current,currentBackup;
   try{
    current=global.localStorage.getItem(MATCH_SAVE_KEY);
    currentBackup=global.localStorage.getItem(MATCH_BACKUP_KEY);
   }catch(_){
    // The validated backup is still playable, but must not risk a blind
    // overwrite while access to disk generations is unavailable.
    checkpointReadUnavailable=true;memoryOnlyMatch=true;
    return result.state;
   }
   if(current!==primary){
    // Another PC tab saved or deleted a new primary during validation.
    // Prefer the most recent *validated* active round over the old fallback.
    try{
     const latest=Game.restoreMatch(current);
     matchDiskGeneration=current;
     return latest;
    }catch(_){
     checkpointInvalidStored=true;memoryOnlyMatch=true;
     return result.state;
    }
   }
   if(currentBackup!==backup){
    // A second tab can rotate the backup slot while the primary stays corrupt.
    // Never promote stale backup bytes or silently discard a newer generation.
    // Allow a newly validated backup only in a non-overwriting, temporary round.
    checkpointInvalidStored=true;memoryOnlyMatch=true;
    try{return Game.restoreMatch(currentBackup);}
    catch(_){return result.state;}
   }
   matchDiskGeneration=primary||null;
   try{
    global.localStorage.setItem(MATCH_SAVE_KEY,backup);
    // A browser extension/storage shim can acknowledge setItem and silently
    // ignore it, or another tab may replace a slot during this recovery.
    // Only exact readback of BOTH generations permits later autosaving.
    if(global.localStorage.getItem(MATCH_SAVE_KEY)!==backup||
       global.localStorage.getItem(MATCH_BACKUP_KEY)!==backup){
     checkpointInvalidStored=true;memoryOnlyMatch=true;
     matchDiskGeneration=null;
    }else matchDiskGeneration=backup||null;
   }catch(_){
    // An unverified promotion cannot auto-save over a corrupt primary.
    // Preserve both slots and play this validated world in memory only.
    checkpointInvalidStored=true;memoryOnlyMatch=true;
    matchDiskGeneration=null;
   }
  }else matchDiskGeneration=primary||null;
  return result.state;
 }catch(_){
  // Invalid bytes are not proof the player intended to erase a saved match.
  // Keep both generations unchanged for later/manual recovery. Continue only
  // into a distinct offline memory-only round unless New Match is explicit.
  checkpointInvalidStored=primary!==null||backup!==null;
  return null;
 }
}

function collectAmmo(){
 if(!canAct())return;
 // The same PC E interaction operates a physical service-yard control when
 // the player stands beside it. Otherwise E retains normal finite loot use.
 const vehicle=Game.operateYardShuttle(simulation);
 if(vehicle.ok){persistMatch();updateHud();return;}
 if(['vehicle_moving','exit_obstructed','hands_occupied'].includes(vehicle.reason)){
  simulation.message=vehicle.reason==='vehicle_moving'
    ?'PARK VEHICLE BEFORE EXIT'
    :vehicle.reason==='exit_obstructed'
      ?'DOORWAY BLOCKED · STOP AT A CLEAR SPACE'
      :'RELEASE HANDCART BEFORE ENTERING VEHICLE';
  simulation.messageTime=2;updateHud();return;
 }
 const gate=Game.operateServiceGate(simulation);
 if(gate.ok){syncMotorSound(true);persistMatch();updateHud();return;}
 const cart=Game.operateHandcart(simulation);
 if(cart.ok){persistMatch();updateHud();return;}
 Game.pickup(simulation);persistMatch();updateHud();
}
function reloadWeapon(){if(!canAct())return;Game.reload(simulation);persistMatch();updateHud();}
function toggleReloadAssist(){if(!canAct())return;Game.setReloadAssist(simulation,!simulation.player.reloadAssist);persistMatch();updateHud();}
function initializeRenderer(){
 const next=new global.VeilpointRenderer(canvas);
 next.onGpuTime=(ms,issuedAt)=>{
  if(gpuEvidenceGate.accepts(issuedAt))telemetry.record('gpu',ms);
  if(benchmark)benchmark.gpu(ms,issuedAt);
 };
 next.onGpuInvalidated=()=>{
  telemetry.clear();gpuEvidenceGate.reset(performance.now());
  if(benchmark)benchmark.invalidateGpu();if(governor)governor.resetEvidence();
 };
 renderer=next;applyGraphicsSettings();
 if(typeof renderer.setFieldOfView==='function')renderer.setFieldOfView(cameraFov);
 const supported=!!(renderer.gpuTimer&&renderer.gpuTimer.supported);
 autoResolutionCheckbox.disabled=!supported;
 autoResolutionCheckbox.title=supported?'':'이 브라우저에서 WebGL2 GPU 타이머 확장을 지원하지 않습니다';
 if(!supported){autoResolution=false;autoResolutionCheckbox.checked=false;}
}
try{initializeRenderer();}
catch(err){renderer=null;$('play').textContent='WebGL2를 지원하지 않습니다';$('play').disabled=true;$('newMatch').disabled=true;$('message').textContent=String(err.message);}
canvas.addEventListener('webglcontextlost',event=>{
 if(benchmark)benchmark.finish('graphics-context-lost');
 event.preventDefault();
 graphicsContextLost=true;suspendMatch('graphics');resetInactiveClock();
 renderer=null; // Context loss invalidates all previous GPU buffers, shaders and queries.
 $('play').disabled=true;$('newMatch').disabled=true;
 $('message').textContent='GRAPHICS CONTEXT LOST · WAIT FOR RECOVERY';
 // Disabling a currently focused Resume/New Match button otherwise sends
 // keyboard focus to the document behind the paused UI. Keep one usable
 // PC menu control focused while the GPU is unavailable.
 // Preserve the user's current foreground menu focus. Only relocate
 // focus when disabling a control or hiding the live canvas invalidates it.
 const active=document.activeElement;
 // Real Document exposes activeElement. In minimal/offline harnesses that
 // omit it, defer the single focus handoff to the successful renderer
 // restoration instead of issuing duplicate focus events.
 const stranded=('activeElement' in document)&&(!active||active===canvas||
  active===$('play')||active===$('newMatch')||active.disabled===true);
 if(stranded){
  const node=$('graphicsPanel').classList.contains('hidden')
   ?$('brViewMore'):$('graphicsClose');
  if(!$('overlay').classList.contains('hidden')||
     !$('graphicsPanel').classList.contains('hidden'))
   if(typeof node.focus==='function')node.focus({preventScroll:true});
 }
});
canvas.addEventListener('webglcontextrestored',()=>{
 if(!graphicsContextLost)return;
 try{
  initializeRenderer();graphicsContextLost=false;
  $('play').disabled=false;$('newMatch').disabled=false;
  resetInactiveClock();
  if(running&&suspended){
   document.querySelector('.tagline').textContent=
    '그래픽 장치가 복구되었습니다. 이어하기를 눌러 같은 경기를 재개하세요.';
   // A paused Windows graphics panel is still a foreground keyboard dialog.
   // A GPU reset must not focus Resume behind that visible panel or resume
   // the 60Hz game without an explicit action.
   const focusNode=$('graphicsPanel').classList.contains('hidden')
    ?$('play'):$('graphicsClose');
   if(document.activeElement!==focusNode&&typeof focusNode.focus==='function')
    focusNode.focus({preventScroll:true});
  }else if(!$('overlay').classList.contains('hidden')){
   // The pre-match menu is also a usable PC screen after a renderer rebuild.
   // Restore its focus without silently creating or resuming a BR match.
   const focusNode=$('graphicsPanel').classList.contains('hidden')
    ?$('play'):$('graphicsClose');
   if(document.activeElement!==focusNode&&typeof focusNode.focus==='function')
    focusNode.focus({preventScroll:true});
  }
 }catch(err){
  renderer=null;
  $('message').textContent='GRAPHICS RECOVERY FAILED · RELOAD REQUIRED: '+String(err.message);
 }
});
// A Windows hybrid touchscreen can also have a real mouse. Prefer PC pointer
// lock whenever ANY fine pointer exists; coarse alone must not bypass aim lock.
const isTouch=!Desktop.isWindowsPC(global.navigator) &&
  matchMedia('(pointer:coarse)').matches && !matchMedia('(any-pointer:fine)').matches;
function requestAimLock(){
 if(isTouch)return;
 const attempt=++pointerLockAttempt;
 pointerLockPendingSince=performance.now();aimLockObserved=false;
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
// A fresh offline BR round must not accidentally recreate an earlier exact
// checkpoint when two Math.random draws collide (or return a fixed test value).
// Keep this bounded to the current PC tab: explicit same-seed retry is still
// available, while cross-tab checkpoint ownership remains independently checked.
const issuedMatchSeeds=new Set();
function nextFreshMatchSeed(){
 let seed=20261027+(Math.random()*10000|0);
 while(issuedMatchSeeds.has(seed))seed++;
 issuedMatchSeeds.add(seed);
 return seed;
}
// The pause menu has fixed-height screens, not one long scrollable overlay.
function setBRMenuView(view='main',restoreFocus=false){
 const overlay=$('overlay');
 for(const name of ['more','load','export'])
  overlay.classList.toggle('menu-view-'+name,view===name);
 $('brViewMore').classList.toggle('hidden',view!=='main');
 $('brViewBack').classList.toggle('hidden',view==='main');
 // A click on More/Back hides its former focused button. Move keyboard focus
 // onto the new active screen; initialization/reset does not steal focus.
 if(restoreFocus&&!overlay.classList.contains('hidden')){
  const target={main:'brViewMore',more:'brViewBack',
   load:'brImportText',export:'brExportText'}[view];
  if(target&&typeof $(target).focus==='function')
   $(target).focus({preventScroll:true});
 }
}
// A visible BR pause/menu page owns keyboard focus. Without this boundary,
// Tab can escape into obscured HUD or desktop controls while the game is paused.
// Graphics has its own higher-priority focus boundary and must remain separate.
function containBRMenuFocus(event){
 const overlay=$('overlay'),settings=$('graphicsPanel');
 if(overlay.classList.contains('hidden')||!settings.classList.contains('hidden'))return;
 // Non-navigation keys must not enumerate the menu or interfere with
 // Escape, remapped gameplay input or the native desktop controls.
 if(event.type!=='focusin'&&event.key!=='Tab')return;
 const controls=[...overlay.querySelectorAll('button,select,input,textarea,a[href]')]
  .filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length>0&&
   getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden');
 if(!controls.length)return;
 if(event.type==='focusin'){
  // A control can remain in the menu DOM after its screen is hidden or
  // disabled. Containment alone is not proof of a usable keyboard target.
  if(!controls.some(node=>node===event.target||
     (typeof node.contains==='function'&&node.contains(event.target))))
   controls[0].focus({preventScroll:true});
  return;
 }
 if(event.key!=='Tab')return;
 const index=controls.indexOf(document.activeElement);
 if(index<0||(event.shiftKey?index===0:index===controls.length-1)){
  event.preventDefault();
  controls[event.shiftKey?controls.length-1:0].focus({preventScroll:true});
 }
}
document.addEventListener('keydown',containBRMenuFocus,true);
document.addEventListener('focusin',containBRMenuFocus,true);

// Portable loading never assumes ownership of a browser's disk generations.
// On any menu transition, discard async reads and pending replacement consent.
let brFileReadSerial=0,brReplacementArmed=null;
function resetPortableMatchExport(){
 setBRMenuView('main');
 brFileReadSerial++;brReplacementArmed=null;
 $('brExport').classList.add('hidden');
 $('brExportPanel').classList.add('hidden');
 $('brExportText').value='';
 $('brImportPanel').classList.add('hidden');
 $('brImportText').value='';
 $('brImportFile').value='';
}
function start(seedOverride=null,weaponOverride=null,rosterOverride=null,offlineOnly=false,entryOverride=null,lightingOverride=null){
 if(graphicsContextLost||!renderer)return;
 resetPortableMatchExport();
 // A stale Windows BR tab may request New Match while another tab already
 // committed a newer VALID match. Never erase that tab's checkpoint, backup,
 // field bookmark or debrief. The older tab can play a fresh isolated round.
 // Explicit reset of corrupt or externally removed saves remains available.
 let newerMatchProtected=false;
 if(!offlineOnly){
  try{
   const current=global.localStorage.getItem(MATCH_SAVE_KEY)||null;
   if(current!==(matchDiskGeneration||null)&&current){
    try{Game.restoreMatch(current);newerMatchProtected=true;}
    catch(_){} // Explicit New Match may discard an invalid old primary.
   }
  }catch(_){newerMatchProtected=true;}
  if(newerMatchProtected)offlineOnly=true;
 }
 // Storage access may fail temporarily. Keep all existing disk generations
 // untouched while allowing a separate memory-only local PC match.
 // Failed/ignored reset is not permission to reuse the old save slot.
 // The previous match stays readable while this tab plays a separate round.
 const resetBlocked=!offlineOnly&&!clearStoredMatch();
 if(resetBlocked)offlineOnly=true;
 if(!offlineOnly){clearFieldBookmark(true);clearLastResult();checkpointInvalidStored=false;}
 memoryOnlyMatch=offlineOnly;saveWarning=offlineOnly;
 nextMatchSaveRetryAt=0;
 saveIssue=offlineOnly?(newerMatchProtected?'conflict':'write-failed'):null;
 bookmarkIssue=null;lastAutosaveElapsed=0;lastSavedHealth=100;
 const selected=Object.prototype.hasOwnProperty.call(Game.FIREARMS,loadoutSelect.value)?loadoutSelect.value:'carbine';
 const weaponId=Object.prototype.hasOwnProperty.call(Game.FIREARMS,weaponOverride)?weaponOverride:selected;
 const seed=Number.isInteger(seedOverride)?seedOverride:nextFreshMatchSeed();
 issuedMatchSeeds.add(seed); // Replay overrides remain exact but reserve the ID.
 const rivals=[1,4,18].includes(rosterOverride)?rosterOverride:selectedRoster();
 const sector=typeof entryOverride==='string'&&
  Object.prototype.hasOwnProperty.call(Game.ENTRY_SITES,entryOverride)?entryOverride:selectedEntry();
 const lighting=typeof lightingOverride==='string'&&
  Object.prototype.hasOwnProperty.call(Game.BR_LIGHTING,lightingOverride)?lightingOverride:selectedLighting();
 simulation=Game.newMatch(seed,rivals,weaponId,rivals===1,sector,lighting);
 simulation.status='playing';running=true;suspended=false;
 rosterSelect.value=String(rivals);entrySelect.value=sector;lightingSelect.value=lighting;
 lastFinishedMatch=null;pauseRestartArmed=false;forfeitArmed=false;manualCheckpoint=null;loadoutSelect.value=weaponId;
 $('saveExit').classList.add('hidden');$('forfeitMatch').classList.add('hidden');$('retryArena').classList.add('hidden');
 $('restoreCheckpoint').classList.add('hidden');$('restartArena').classList.add('hidden');
 // A new round cannot inherit held keyboard, sprint, touch or look pointers.
 desktopUi.cancel();resetInactiveClock();$('overlay').classList.add('hidden');setGraphicsPanelOpen(false);
 $('mobileControls').classList.toggle('active',isTouch);updateHud();
 Desktop.focusGameplay(document,canvas);
 requestAimLock();
 if(memoryOnlyMatch){
  simulation.message=newerMatchProtected
   ?'OTHER PC TAB UPDATED THE SAVE · MEMORY-ONLY MATCH · NEWER ROUND PRESERVED'
   :resetBlocked?'NEW MATCH RESET NOT VERIFIED · MEMORY-ONLY · SAVED ROUND PROTECTED'
   :'OFFLINE MEMORY-ONLY MATCH · SAVED ROUND KEPT';
  simulation.messageTime=6;
 }else persistMatch();
}
function resumeStoredMatch(restored){
 if(graphicsContextLost||!renderer||!restored)return;
 resetPortableMatchExport();
 // A later explicit New Match must differ from this restored generation, too.
 issuedMatchSeeds.add(restored.seed);
 simulation=restored;loadoutSelect.value=restored.player.weaponId;
 entrySelect.value=restored.entrySite||'central';lightingSelect.value=restored.lighting||'day';
 if([1,4,18].includes(restored.bots.length))rosterSelect.value=String(restored.bots.length);
 running=true;suspended=false;saveWarning=memoryOnlyMatch;nextMatchSaveRetryAt=0;lastAutosaveElapsed=simulation.elapsed;saveIssue=memoryOnlyMatch?'write-failed':null;bookmarkIssue=null;lastSavedHealth=simulation.player.health;
 if(memoryOnlyMatch){
  simulation.message='OFFLINE BACKUP RECOVERED · MEMORY ONLY · PREVIOUS DISK RECORD PRESERVED';
  simulation.messageTime=6;
 }
 lastFinishedMatch=null;pauseRestartArmed=false;forfeitArmed=false;manualCheckpoint=loadFieldBookmark();$('saveExit').classList.add('hidden');$('forfeitMatch').classList.add('hidden');$('retryArena').classList.add('hidden');
 $('restoreCheckpoint').classList.add('hidden');$('restartArena').classList.add('hidden');
 // A restored checkpoint must also start with neutral physical input.
 desktopUi.cancel();resetInactiveClock();
 $('overlay').classList.add('hidden');setGraphicsPanelOpen(false);
 $('mobileControls').classList.toggle('active',isTouch);updateHud();
 // A restored match must reclaim keyboard focus just like a new match.
 // Otherwise the still-focused Resume button consumes Space/arrow controls.
 Desktop.focusGameplay(document,canvas);
 requestAimLock();
}
if(storedMatch())$('play').textContent='저장 경기 이어하기';
else if(checkpointReadUnavailable||checkpointInvalidStored){
 $('play').textContent=checkpointInvalidStored?'기록 보존 · 임시 경기 시작':'저장소 없이 플레이';
 document.querySelector('.tagline').textContent=checkpointInvalidStored
  ?'BR 저장 기록을 복구할 수 없습니다. 기존 기록을 그대로 보존하며 임시 경기를 시작합니다. 새 경기를 명시적으로 선택하면 이전 기록을 초기화합니다.'
  :'저장소를 읽을 수 없습니다. 기존 저장 데이터는 보존하고, 이번 경기는 저장되지 않는 임시 세션으로 실행할 수 있습니다.';
}else {
 const archived=readLastResult();
 if(archived){
  lastFinishedMatch={seed:archived.seed,weaponId:archived.weaponId,rivals:archived.rivals};
  $('play').textContent='새 경기 시작';
  $('retryArena').classList.remove('hidden');
  document.querySelector('.eyebrow').textContent='OFFLINE BR / LAST RESULT';
  document.querySelector('.tagline').textContent=
   '지난 경기 '+(archived.outcome==='won'?'승리':archived.outcome==='draw'?'공동 종료':'종료')+
   ' · 생존 '+Math.floor(archived.elapsed)+'초 · 제거 '+archived.kills+'명'+
   (archived.placement===null?' · 공동 종료':' · 순위 '+archived.placement+'위')+
   ' · 같은 경기장 다시 도전 또는 새 경기 시작';
 }
}
// Never silently restart a paused match: the same match resumes only by user action.
function resumeMatch(){
 if(!running||!suspended||graphicsContextLost||!renderer)return;
 resetPortableMatchExport();
 suspended=false;pauseRestartArmed=false;desktopUi.cancel();resetInactiveClock();
 $('restoreCheckpoint').classList.add('hidden');$('restartArena').classList.add('hidden');$('saveExit').classList.add('hidden');
 $('overlay').classList.add('hidden');setGraphicsPanelOpen(false);
 $('mobileControls').classList.toggle('active',isTouch);
 Desktop.focusGameplay(document,canvas);
 requestAimLock();
}
$('play').addEventListener('click',()=>{
 if(running&&suspended)resumeMatch();
 // A terminal result always means a fresh round, even if deletion was denied
 // and a stale but syntactically valid local checkpoint is still readable.
 else if(!running&&lastFinishedMatch){
  if(memoryOnlyMatch)start(null,null,null,true);
  else start();
 }
 else if(!running){
  const saved=storedMatch();
  if(saved)resumeStoredMatch(saved);
  else if(checkpointReadUnavailable||checkpointInvalidStored){
   // An unreadable or invalid disk generation may still contain recoverable
   // progress: only explicit New Match may discard it.
   start(null,null,null,true);
  }else start();
 }
 syncMotorSound(true);
});
$('newMatch').addEventListener('click',start);
// Public, reproducible offline match configurations can be shared as a short
// string. This never imports an untrusted saved match or starts a network room.
let challengeArmed=null;
const challengeCode=$('brChallengeCode'),challengeStatus=$('brChallengeStatus');
const clearChallengeArm=()=>{
 challengeArmed=null;
 $('brChallengeApply').textContent='코드로 경기 시작';
};
challengeCode.addEventListener('input',()=>{
 clearChallengeArm();
 challengeStatus.textContent='코드 확인 전 기존 경기와 저장 상태는 변경되지 않습니다.';
});
$('brChallengeGenerate').addEventListener('click',()=>{
 if($('overlay').classList.contains('hidden'))return;
 clearChallengeArm();
 try{
  const active=running&&simulation.status==='playing';
  const settings=active
   ?{seed:simulation.seed,roster:simulation.bots.length,weapon:simulation.player.weaponId,
     site:simulation.entrySite,lighting:simulation.lighting}
   :{seed:nextFreshMatchSeed(),roster:selectedRoster(),weapon:loadoutSelect.value,
     site:selectedEntry(),lighting:selectedLighting()};
  challengeCode.value=Challenge.encode(settings);
  challengeCode.focus({preventScroll:true});
  challengeCode.select();
  challengeStatus.textContent='같은 조건의 새 오프라인 경기를 시작하는 코드입니다. Ctrl+C로 복사 가능합니다.';
 }catch(_){challengeStatus.textContent='이 경기 구성은 공유 코드를 지원하지 않습니다.';}
});
$('brChallengeApply').addEventListener('click',()=>{
 if($('overlay').classList.contains('hidden')||graphicsContextLost||!renderer)return;
 let settings;
 try{settings=Challenge.decode(challengeCode.value);}
 catch(_){clearChallengeArm();challengeStatus.textContent='올바른 VP1 도전 코드를 확인해 주세요. 기존 저장 상태는 유지됩니다.';return;}
 const code=challengeCode.value;
 const live=running&&simulation.status==='playing';
 if(live&&challengeArmed!==code){
  challengeArmed=code;
  $('brChallengeApply').textContent='새 경기 시작 재확인';
  challengeStatus.textContent='현재 진행 중인 경기는 종료됩니다. 같은 코드로 한 번 더 눌러 확정하세요.';
  return;
 }
 clearChallengeArm();
 start(settings.seed,settings.weapon,settings.roster,false,settings.site,settings.lighting);
 // Existing start() owns checkpoint generation and offline fallback rules.
});
resetPortableMatchExport();
$('brViewMore').addEventListener('click',()=>{
 if($('overlay').classList.contains('hidden'))return;
 setBRMenuView('more',true);
});
$('brViewBack').addEventListener('click',()=>{
 if($('overlay').classList.contains('hidden'))return;
 const wasMore=$('overlay').classList.contains('menu-view-more');
 brFileReadSerial++;brReplacementArmed=null;
 $('brImportPanel').classList.add('hidden');
 $('brExportPanel').classList.add('hidden');
 $('brImportText').value='';$('brImportFile').value='';
 $('brExportText').value='';
 setBRMenuView(wasMore?'main':'more',true);
});
$('brImport').addEventListener('click',()=>{
 if($('overlay').classList.contains('hidden')||(running&&!suspended)||
    graphicsContextLost||!renderer)return;
 brFileReadSerial++;brReplacementArmed=null;
 $('brExportPanel').classList.add('hidden');
 $('brImportPanel').classList.remove('hidden');
 setBRMenuView('load');
 $('brImportText').value='';$('brImportFile').value='';
 $('brImportStatus').textContent='저장된 BR JSON을 선택하거나 붙여넣으세요. 검증 전에는 게임과 저장 파일을 변경하지 않습니다.';
 if(typeof $('brImportText').focus==='function')$('brImportText').focus();
});
$('brImportText').addEventListener('input',()=>{
 // A manual paste wins over a late file.text() completion.
 brFileReadSerial++;brReplacementArmed=null;
});
$('brImportFile').addEventListener('change',async event=>{
 if($('overlay').classList.contains('hidden')||(running&&!suspended)||
    $('brImportPanel').classList.contains('hidden'))return;
 const file=event?.target?.files?.[0];
 if(!file)return;
 const serial=++brFileReadSerial;brReplacementArmed=null;
 try{
  if(!Number.isFinite(file.size)||file.size>131072||
     typeof file.text!=='function')throw new RangeError('file too large');
  const raw=await file.text();
  if(serial!==brFileReadSerial||$('overlay').classList.contains('hidden')||
     $('brImportPanel').classList.contains('hidden')||(running&&!suspended))return;
  if(typeof raw!=='string'||!raw.trim()||raw.length>65536)
   throw new RangeError('snapshot too large');
  // File bytes are untrusted until the explicit Apply button validates them.
  $('brImportText').value=raw;
  $('brImportStatus').textContent='파일 읽기 완료 · 검증 후 임시 경기로 불러오기를 누르세요. 기존 저장 파일은 변경되지 않았습니다.';
 }catch(_){
  if(serial===brFileReadSerial&&!$('brImportPanel').classList.contains('hidden'))
   $('brImportStatus').textContent='파일 읽기 실패 · 128KB 이하의 올바른 JSON 파일을 선택하세요. 현재 진행은 변경되지 않았습니다.';
 }
});
$('brImportApply').addEventListener('click',()=>{
 if($('overlay').classList.contains('hidden')||(running&&!suspended)||
    $('brImportPanel').classList.contains('hidden')||graphicsContextLost||!renderer)return;
 let candidate,canonical;
 try{
  const text=String($('brImportText').value||'').trim();
  if(!text||text.length>65536)throw new RangeError('snapshot length');
  candidate=Game.restoreMatch(text);
  canonical=Game.snapshotMatch(candidate);
  if(candidate.status!=='playing')throw new RangeError('not resumable');
 }catch(_){
  brReplacementArmed=null;
  $('brImportStatus').textContent='불러오기 거부 · BR 체크포인트가 손상되었거나 현재 버전과 호환되지 않습니다. 기존 게임은 유지됩니다.';
  return;
 }
 if(running&&simulation.status==='playing'){
  let current;
  try{current=Game.snapshotMatch(simulation);}
  catch(_){
   brReplacementArmed=null;
   $('brImportStatus').textContent='현재 BR 경기의 체크포인트 검증 실패 · 교체를 중단했습니다.';
   return;
  }
  if(current!==canonical&&brReplacementArmed!==canonical){
   brReplacementArmed=canonical;
   $('brImportStatus').textContent='진행 중인 BR 경기가 교체됩니다. 현재 경기를 JSON으로 백업한 뒤, 같은 내용으로 다시 눌러 확정하세요. 디스크 저장 파일은 그대로 유지합니다.';
   return;
  }
 }
 // A validated portable game is only a temporary session: never mutate the
 // primary/backup/bookmark slots or impersonate the other tab that owns them.
 brReplacementArmed=null;
 issuedMatchSeeds.add(candidate.seed);
 simulation=candidate;running=true;suspended=true;memoryOnlyMatch=true;
 entrySelect.value=candidate.entrySite||'central';lightingSelect.value=candidate.lighting||'day';
 matchDiskGeneration=null;manualCheckpoint=null;lastFinishedMatch=null;
 saveWarning=true;saveIssue='write-failed';bookmarkIssue=null;
 nextMatchSaveRetryAt=0;lastAutosaveElapsed=candidate.elapsed;
 lastSavedHealth=candidate.player.health;lastShotHudElapsed=-Infinity;
 pauseRestartArmed=false;forfeitArmed=false;
 loadoutSelect.value=candidate.player.weaponId;
 if([1,4,18].includes(candidate.bots.length))
  rosterSelect.value=String(candidate.bots.length);
 resetPortableMatchExport();
 $('overlay').classList.remove('hidden');
 $('mobileControls').classList.remove('active');
 $('play').textContent='가져온 BR 이어하기';
 $('saveExit').classList.add('hidden');
 $('restoreCheckpoint').classList.add('hidden');
 $('restartArena').classList.add('hidden');
 $('forfeitMatch').classList.add('hidden');
 $('retryArena').classList.add('hidden');
 $('brExport').classList.remove('hidden');
 document.querySelector('.eyebrow').textContent='OFFLINE BR / PORTABLE SESSION';
 document.querySelector('h1').textContent='BR IMPORTED.';
 document.querySelector('.tagline').textContent='BR 체크포인트 검증 완료 · 기존 저장 기록은 보호됩니다. 이 임시 경기는 현재 탭에서만 진행되므로 종료 전에 JSON을 백업하세요.';
 if(motorSound)motorSound.stop();if(windSound)windSound.stop();if(footstepSound)footstepSound.stop();
 desktopUi.cancel();resetInactiveClock();updateHud();
});
$('brExport').addEventListener('click',()=>{
 if(!running||!suspended||simulation.status!=='playing'||
    $('overlay').classList.contains('hidden'))return;
 try{
  const raw=Game.snapshotMatch(simulation);
  const verified=Game.restoreMatch(raw);
  if(verified.seed!==simulation.seed||verified.status!=='playing')
    throw new RangeError('checkpoint mismatch');
  $('brExportText').value=raw;
  brFileReadSerial++;brReplacementArmed=null;
  $('brImportPanel').classList.add('hidden');
  $('brExportPanel').classList.remove('hidden');
  setBRMenuView('export');
  $('brExportStatus').textContent='현재 탭의 검증된 BR 경기 상태입니다. 저장 기록은 변경하지 않습니다. 직접 복사하거나 JSON 파일을 저장하세요.';
  if(typeof $('brExportText').select==='function')$('brExportText').select();
 }catch(_){
  $('brExportPanel').classList.add('hidden');
  setBRMenuView('more',true);
  $('brExportStatus').textContent='경기 백업 검증 실패 · 현재 진행은 그대로 유지합니다.';
  document.querySelector('.tagline').textContent='BR JSON 백업 검증에 실패했습니다. 현재 게임은 그대로 유지됩니다.';
 }
});
$('brExportDownload').addEventListener('click',()=>{
 if(!running||!suspended||simulation.status!=='playing'||
    $('brExportPanel').classList.contains('hidden'))return;
 const raw=$('brExportText').value;
 let url=null;
 try{
  if(!raw||raw!==Game.snapshotMatch(simulation))
    throw new RangeError('checkpoint changed');
  if(typeof global.Blob!=='function'||!global.URL||
     typeof global.URL.createObjectURL!=='function')
    throw new Error('download unavailable');
  url=global.URL.createObjectURL(new global.Blob([raw],
    {type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download='VEILPOINT-BR-checkpoint.json';
  // An attached link is more consistently honored by restricted offline PC
  // browsers. Removal is guaranteed even when the download click throws.
  if(document.body&&typeof document.body.appendChild==='function'){
   document.body.appendChild(link);
   try{link.click();}finally{link.remove();}
  }else link.click();
  $('brExportStatus').textContent='JSON 파일 저장 요청 완료 · 다운로드 목록을 확인하세요.';
 }catch(_){
  $('brExportStatus').textContent='파일 저장이 불가능합니다. 위 JSON을 직접 복사해 별도 텍스트 파일로 보관하세요.';
  const field=$('brExportText');
  if(typeof field.focus==='function')field.focus({preventScroll:true});
  if(typeof field.select==='function')field.select();
 }finally{
  if(url&&global.URL&&typeof global.URL.revokeObjectURL==='function'){
   const revoke=()=>{try{global.URL.revokeObjectURL(url);}catch(_){}};
   if(typeof global.setTimeout==='function')global.setTimeout(revoke,1000);
   else revoke();
  }
 }
});
// Explicit PC save-and-exit is only possible after a durable local checkpoint.
// If browser storage is blocked, stay paused and let the player resume instead.
$('saveExit').addEventListener('click',()=>{
 if(!running||!suspended||simulation.status!=='playing')return;
 if(!persistMatch()){
  document.querySelector('.tagline').textContent=saveIssue==='conflict'
   ?'다른 창에서 저장된 경기가 변경되었습니다. 이 창의 진행을 덮어쓰지 않고 메뉴로 나가지 않았습니다. 이어하기는 가능합니다.'
   :'저장 공간에 기록할 수 없어 메뉴로 나가지 않았습니다. 이어하기로 경기를 계속할 수 있습니다.';
  return;
 }
 // The checkpoint writer verified its own write, but a second PC tab
 // can replace or remove the slot before the Save & Exit navigation gate.
 // Recheck the exact current generation before discarding this live round.
 let confirmed=false;
 try{
  confirmed=!!matchDiskGeneration&&
   global.localStorage.getItem(MATCH_SAVE_KEY)===matchDiskGeneration;
 }catch(_){}
 if(!confirmed){
  saveWarning=true;saveIssue='conflict';
  document.querySelector('.tagline').textContent=
   '저장 기록이 확인 직후 변경되거나 읽을 수 없게 되었습니다. 현재 진행을 유지하고 메뉴 이동을 중단했습니다.';
  return;
 }
 running=false;suspended=false;
 resetPortableMatchExport();
 if(motorSound)motorSound.stop();if(windSound)windSound.stop();if(footstepSound)footstepSound.stop();
 desktopUi.cancel();resetInactiveClock();
 $('saveExit').classList.add('hidden');$('forfeitMatch').classList.add('hidden');$('retryArena').classList.add('hidden');
 $('restoreCheckpoint').classList.add('hidden');$('restartArena').classList.add('hidden');
 $('play').textContent='저장 경기 이어하기';
 document.querySelector('.eyebrow').textContent='OFFLINE CHECKPOINT / SAVED';
 document.querySelector('h1').textContent='VEILPOINT.';
 document.querySelector('.tagline').textContent='경기가 저장되었습니다. 이어하기는 같은 경기로, 새 경기는 처음부터 시작합니다.';
});
// Switching from BR to CH01 is navigation, not a loss/forfeit of the
// current offline arena. The overlay's direct link previously skipped the
// verified Save & Exit gate and could discard an unsaved 60Hz round.
// An inactive/finished round can use the ordinary anchor; an active round
// must be explicitly paused and successfully saved before leaving.
$('storyModeLink').addEventListener('click',event=>{
 if(!running||simulation.status!=='playing')return;
 event.preventDefault();
 if(!suspended)return; // Hidden overlay cannot navigate during live play.
 $('saveExit').click(); // Reuse existing generation conflict + readback gate.
 if(running)return; // Save refused: keep the original paused world playable.
 try{global.location.assign('story.html');}
 catch(_){
  document.querySelector('.tagline').textContent=
   'BR 체크포인트는 저장되었습니다. 스토리 메뉴로 이동하지 못했습니다. 이 화면에서 저장 경기를 이어할 수 있습니다.';
 }
});
// Rewind a paused offline round to the explicit in-session field bookmark. Never
// silently replace the current round when the saved data is missing/invalid.
$('restoreCheckpoint').addEventListener('click',()=>{
 if(!running||!suspended||simulation.status!=='playing')return;
 let checkpoint=null;
 try{checkpoint=manualCheckpoint?Game.restoreFieldBookmark(simulation,manualCheckpoint):null;}catch(_){checkpoint=null;clearFieldBookmark();}
 if(!checkpoint||checkpoint.seed!==simulation.seed){
  document.querySelector('.tagline').textContent='이 경기에서 P키로 기록한 지점이 없습니다. 현재 경기를 유지합니다.';
  return;
 }
 // Rewind is a tentative world-state transition until it is made durable.
 // Another PC tab can replace our primary checkpoint between the P-key press
 // and this pause-menu action. Never abandon the current in-memory world on a
 // verified generation conflict: the user can keep playing it unchanged.
 const previousSimulation=simulation;
 const previousAutosave=lastAutosaveElapsed,previousSavedHealth=lastSavedHealth;
 simulation=checkpoint;
 const saved=persistMatch();
 // P-key rewind is a real world transition. A second Windows tab may replace
 // the primary AFTER persistMatch() verified the saved bookmark. Check the
 // final recorded generation before claiming the rewind is durable, otherwise
 // protect the old in-memory round as on a detected generation conflict.
 let finalVerified=!saved;
 if(saved){
  try{finalVerified=!!matchDiskGeneration&&
    global.localStorage.getItem(MATCH_SAVE_KEY)===matchDiskGeneration;}
  catch(_){finalVerified=false;}
 }
 if((!saved&&saveIssue==='conflict')||(saved&&!finalVerified)){
  simulation=previousSimulation;
  lastAutosaveElapsed=previousAutosave;lastSavedHealth=previousSavedHealth;
  if(saved&&!finalVerified){
   saveWarning=true;saveIssue='conflict';
   nextMatchSaveRetryAt=simulation.elapsed+1;
   simulation.message='OFFLINE SAVE CONFLICT · BOOKMARK REWIND NOT COMMITTED';
   simulation.messageTime=4;
  }
  pauseRestartArmed=false;desktopUi.cancel();resetInactiveClock();updateHud();
  document.querySelector('.tagline').textContent=saved
   ?'P키 현장 복원 직후 저장 기록이 변경되거나 읽을 수 없어 복원을 취소했습니다. 현재 경기는 변경하지 않았습니다.'
   :'다른 창에서 저장 기록이 변경되어 P키 현장 복원을 취소했습니다. 현재 경기는 변경하지 않았습니다. 이어하기로 계속할 수 있습니다.';
  return;
 }
 lastAutosaveElapsed=simulation.elapsed;lastSavedHealth=simulation.player.health;
 pauseRestartArmed=false;desktopUi.cancel();resetInactiveClock();updateHud();
 document.querySelector('.tagline').textContent=saved
  ?'P키로 기록한 현장 지점으로 복원했습니다. 현재 상태도 저장했습니다. 이어하기를 누르면 진행합니다.'
  :'P키의 현장 지점으로 복원했지만 저장 공간이 거부되었습니다. 이 탭에서는 계속할 수 있으나 새로고침하면 복원 이전 상태가 열릴 수 있습니다.';
});
// A deliberate two-click confirmation prevents accidental loss of an active
// offline round. Restart reuses the arena seed and original loadout, not ammo.
$('restartArena').addEventListener('click',()=>{
 if(!running||!suspended||simulation.status!=='playing')return;
 if(!pauseRestartArmed){
  pauseRestartArmed=true;
  document.querySelector('.tagline').textContent='같은 경기장을 처음부터 다시 시작하려면 버튼을 한 번 더 누르세요. 현재 진행은 삭제됩니다.';
  return;
 }
 const seed=simulation.seed,weapon=simulation.player.weaponId,rivals=simulation.bots.length;
 start(seed,weapon,rivals,false,simulation.entrySite||'central',simulation.lighting||'day');
});
$('forfeitMatch').addEventListener('click',()=>{
 if(!running||!suspended||simulation.status!=='playing')return;
 if(!forfeitArmed){
  forfeitArmed=true;pauseRestartArmed=false;
  document.querySelector('.tagline').textContent='경기 포기는 저장된 진행을 삭제하고 현재 순위로 종료합니다. 포기 버튼을 다시 누르면 확정됩니다.';
  return;
 }
 const result=Game.forfeitMatch(simulation);
 if(result.ok){end();document.querySelector('.tagline').textContent='경기를 자발적으로 포기했습니다. '+`순위 ${result.placement}위 · 제거 ${simulation.kills}명`+' · 같은 경기장 재도전 또는 새 경기 시작이 가능합니다.';}
});
$('retryArena').addEventListener('click',()=>{
 if(running||!lastFinishedMatch||simulation.status==='playing')return;
 // A retry of a memory-only match must never erase an unrelated saved
 // disk round if storage permission becomes available during play.
 start(lastFinishedMatch.seed,lastFinishedMatch.weaponId,lastFinishedMatch.rivals,
  memoryOnlyMatch,lastFinishedMatch.entrySite,lastFinishedMatch.lighting);
});
addEventListener('keydown',e=>{
 if(desktopUi.captureKey(e))return;
    // A Ctrl/Alt/Meta browser or OS chord cannot fire, move, interact,
    // open game settings or leave an earlier held input latched.
    if(Desktop.isModifiedGameplayKey(e)){clearInput();return;}
  if(Desktop.isGameplayShortcut(e)){clearInput();return;}
 // F8 records ONLY the next actually drawn bodycam frame, with no separate
 // spectator camera or 60 Hz simulation pause. Never hijack desktop menus.
 if(e.code==='F8'&&!e.repeat&&canAct()){
  e.preventDefault();stillRequested=true;return;
 }
 // The pre-match/end menu can open settings too. Escape dismisses that panel
 // without starting gameplay or requiring a mouse click on its Close button.
 if(e.code==='Escape'&&!running&&!$('graphicsPanel').classList.contains('hidden')){
  e.preventDefault();
  if(!e.repeat)setGraphicsPanelOpen(false);
  return;
 }
 // Escape navigates backward through a visible BR menu screen instead of
 // accidentally resuming the 60Hz game. Graphics dialog retains priority.
 if(e.code==='Escape'&&!$('overlay').classList.contains('hidden')&&
    $('graphicsPanel').classList.contains('hidden')&&
    ['menu-view-more','menu-view-load','menu-view-export'].some(
      name=>$('overlay').classList.contains(name))){
  e.preventDefault();
  if(!e.repeat)$('brViewBack').click();
  return;
 }
 // Escape must cancel even a pending/denied mouse-capture request. The game
 // cannot act until locked, but the player must always be able to pause.
 if(e.code==='Escape'&&running){
  e.preventDefault();
  if(e.repeat)return;
  if(suspended){
   // First Escape closes the graphics dialog without silently resuming a match.
   // The following Escape can reclaim mouse lock only when the dialog is gone.
   if(!$('graphicsPanel').classList.contains('hidden')){
    setGraphicsPanelOpen(false);
   }else if(!graphicsContextLost&&renderer)resumeMatch();
  }else{suspendMatch();resetInactiveClock();}
  return;
 }
 // G closes settings from ordinary buttons, but must not steal G as
 // native select typeahead or text input while editing a PC menu control.
 // The remapping/capture handler above retains priority.
 if(e.code==='KeyG'&&!e.repeat&&!$('graphicsPanel').classList.contains('hidden')&&
    !Desktop.isTextEntryTarget(e.target)){
  e.preventDefault();setGraphicsPanelOpen(false);return;
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
 // O is an optional held optical observation key, but never steals a user
 // remap or text-field focus. No global actor markers or 60Hz state changes.
 if(e.code==='KeyO'&&!action&&canAct()){
  e.preventDefault();input.observe=true;updateHud();
 }
 if(e.code==='KeyG'){
  e.preventDefault();
  setGraphicsPanelOpen($('graphicsPanel').classList.contains('hidden'),$('graphicsPauseOpen'));
  return;
 }
 if(action==='interact'){e.preventDefault();collectAmmo();}
 // V is a separate physical cache action, not a shortcut that creates rounds.
 if(e.code==='KeyV'&&!action&&canAct()){
  e.preventDefault();const result=Game.depositReserve(simulation);
  if(result.ok){persistMatch();updateHud();}
 }
 // This dedicated, remappable PC action cannot collide with the default
 // H reload-assist key. Only physically reachable cached stock can move.
 if(action==='cacheMove'&&canAct()){
  e.preventDefault();const moved=Game.repositionCache(simulation);
  if(moved.ok){persistMatch();updateHud();}
  else if(moved.reason==='path_blocked'){
   simulation.message='CACHE SHIFT BLOCKED · CLEAR NEARBY PASSAGE';
   simulation.messageTime=2;updateHud();
  }
 }
 if(action==='reload'){e.preventDefault();reloadWeapon();}
 if(action==='assist'){e.preventDefault();toggleReloadAssist();}
  if(action==='headlamp'&&canAct()){
   e.preventDefault();const result=Game.toggleBrHeadlamp(simulation);
   if(result.ok){persistMatch();updateHud();}
  }
 if(e.code==='KeyM'){e.preventDefault();
  if(audioControls)audioControls.set({...audioControls.get(),enabled:!soundEnabled});
  else setSoundEnabled(!soundEnabled);}
 // Do not steal P from a user-remapped movement or interaction action.
 if(e.code==='KeyJ'&&!action&&canAct()){
  e.preventDefault();
  const result=Game.toggleTrailMarker(simulation);
  if(result.ok){persistMatch();updateHud();}
  else if(result.reason==='out_of_reach'){
   simulation.message='ROUTE SIGN TOO FAR · WALK BACK TO RETRIEVE';simulation.messageTime=2;updateHud();
  }
 }
 if(e.code==='KeyP'&&!action&&canAct()){
  e.preventDefault();const durable=recordFieldBookmark();
  simulation.message=durable?'FIELD BOOKMARK RECORDED · SAVED FOR RESUME'
    :saveIssue==='conflict'?'FIELD BOOKMARK IN MEMORY ONLY · ANOTHER TAB OWNS SAVE'
    :'FIELD BOOKMARK IN MEMORY ONLY · STORAGE UNAVAILABLE';simulation.messageTime=3;
  persistMatch();updateHud();
 }
 if(action==='fire'){e.preventDefault();if(canAct()){fire();if(Game.FIREARMS[simulation.player.weaponId].automatic)input.fireHeld=trigger.press('keyboard');}}
 // Enter from an unfocused Windows menu follows the *same* verified resume
 // route as the Play button, including storage denial and backup recovery.
 // Never start a new round when Enter is pressed during an active match.
 if(e.code==='Enter'&&!running&&renderer&&
    !$('overlay').classList.contains('hidden')){
  e.preventDefault();$('play').click();
 }
});
addEventListener('keyup',e=>{
 const action=Desktop.actionFor(e.code,desktopUi.get());
 if(action&&Object.prototype.hasOwnProperty.call(input,action))input[action]=false;
 if(e.code==='KeyO')input.observe=false;
 if(action==='fire')input.fireHeld=trigger.release('keyboard');
});
// Background throttling must never simulate hostile fire against an unfocused player.
function suspendMatch(reason='background'){
 // An armed sample has not rendered its first frame: hiding the browser
 // must cancel it too, rather than silently starting a new test on return.
 if(benchmark&&['armed','running'].includes(benchmark.getStatus().state))
  benchmark.finish(reason==='background'?'paused-or-hidden':reason);
 if(!running||suspended)return;
 if(motorSound)motorSound.stop();if(windSound)windSound.stop();if(footstepSound)footstepSound.stop();
 const checkpointSaved=persistMatch();suspended=true;pauseRestartArmed=false;forfeitArmed=false;pointerLockAttempt++;pointerLockPendingSince=null;aimLockObserved=false;
 $('overlay').classList.remove('hidden');
 $('mobileControls').classList.remove('active');
 $('play').textContent='이어하기';
 resetPortableMatchExport();
 $('saveExit').classList.remove('hidden');$('brExport').classList.remove('hidden');$('forfeitMatch').classList.remove('hidden');$('retryArena').classList.add('hidden');
 $('restoreCheckpoint').classList.remove('hidden');$('restartArena').classList.remove('hidden');
 document.querySelector('.eyebrow').textContent='MATCH PAUSED';
 document.querySelector('h1').textContent='PAUSED.';
 document.querySelector('.tagline').textContent=(reason==='graphics'?'그래픽 장치가 끊어졌습니다. 복구 후 이어하기를 누르세요.':reason==='pointer'
  ?'마우스 포인터 잠금이 해제되었거나 거부되었습니다. 화면을 클릭해 권한을 허용한 뒤 이어하기를 누르세요.'
  :'경기가 일시중지되었습니다. 이어하기를 눌러 같은 경기로 복귀하세요.')+
  (simulation.status!=='playing'||checkpointSaved?'':saveIssue==='conflict'
   ?' · 다른 창의 최신 체크포인트를 보호하고 있습니다. 이 창의 진행은 저장되지 않았습니다.'
   :memoryOnlyMatch?' · 임시 경기이므로 현재 진행은 저장되지 않습니다.'
   :' · 체크포인트 저장 실패: 저장 공간을 확인하세요. 현재 진행은 이 창에만 남아 있습니다.');
 if(document.pointerLockElement===canvas)document.exitPointerLock();
}
function resetInactiveClock(){
 clearInput();lastShotHudElapsed=-Infinity;shotFeedbackSerial++;
 // A lost touch pointer may never emit pointerup; discard held stick and camera
 // gestures so resuming cannot move or rotate the player without fresh input.
 joyId=null;lookId=null;previousLook=null;thumb.x=0;thumb.y=0;nub.style.transform='';
 clock.reset();fpsLimiter.reset();telemetry.clear();gpuEvidenceGate.reset(performance.now());if(governor)governor.resetEvidence();lastRenderTime=null;last=performance.now();
 updateHud();
}
addEventListener('blur',()=>{suspendMatch();resetInactiveClock();});
addEventListener('pagehide',()=>{suspendMatch();resetInactiveClock();});
// A back-forward cache return is not a new round and must not implicitly
// restart the paused 60Hz world. Keyboard users need a visible, focused resume
// action instead of the hidden pointer-locked canvas after navigation.
addEventListener('pageshow',event=>{
 if(!event.persisted)return;
 resetInactiveClock();
 if(!running||simulation.status!=='playing')return;
 if(!suspended)suspendMatch(); // Defensive: pagehide may have been skipped.
 $('overlay').classList.remove('hidden');
 $('play').textContent='이어하기';
 // A visible graphics settings panel owns keyboard focus until the user
 // explicitly closes it. Otherwise bfcache return would silently focus the
 // underlying Resume button and Enter could leave settings unexpectedly.
 const panelOpen=!$('graphicsPanel').classList.contains('hidden');
 const target=panelOpen?$('graphicsClose'):$('play');
 if(typeof target.focus==='function')target.focus();
});
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
// While the desktop camera owns pointer lock, a browser context menu must
// not steal mouse focus and strand a live 60Hz BR round. Preserve the normal
// browser menu everywhere else, including paused and unlocked canvases.
canvas.addEventListener('contextmenu',e=>{
 if(!isTouch&&canAct()&&document.pointerLockElement===canvas)e.preventDefault();
});
canvas.addEventListener('mousedown',e=>{
 // OS-level Ctrl/Alt/Meta clicks must not invoke gameplay actions or leave held input.
 if(Desktop.isModifiedGameplayKey(e)){clearInput();return;}
 if(e.button!==0||!canAct()||isTouch||document.pointerLockElement!==canvas)return;
 fire();
 if(Game.FIREARMS[simulation.player.weaponId].automatic)input.fireHeld=trigger.press('mouse');
});
addEventListener('mouseup',e=>{if(e.button===0)input.fireHeld=trigger.release('mouse');});
let audio=null;
function ensureAudio(){
 if(!soundEnabled)return null;
 try{
  if(!audio)audio=new (global.AudioContext||global.webkitAudioContext)();
  if(audio.state==='suspended'&&typeof audio.resume==='function'){
   const result=audio.resume();if(result&&typeof result.catch==='function')result.catch(()=>{});
  }
  return audio;
 }catch(_){return null;}
}
motorSound=global.VeilpointGateMotorAudio.createGateMotorAudio(()=>audio);
// Legacy embedded WebView test pages may omit the optional ambience module;
// the normal offline page bundles it before app.js.
windSound=global.VeilpointCoastalWindAudio&&
 typeof global.VeilpointCoastalWindAudio.createCoastalWindAudio==='function'
 ?global.VeilpointCoastalWindAudio.createCoastalWindAudio(()=>audio):null;
footstepSound=global.VeilpointFootstepAudio&&
 typeof global.VeilpointFootstepAudio.createFootstepAudio==='function'
 ?global.VeilpointFootstepAudio.createFootstepAudio(()=>audio):null;
if(AudioPrefs&&audioMix){
 motorSound?.setVolume?.(AudioPrefs.gain(audioMix,'effects'));
 windSound?.setVolume?.(AudioPrefs.gain(audioMix,'ambience'));
 footstepSound?.setVolume?.(AudioPrefs.gain(audioMix,'effects'));
}
function syncMotorSound(unlock=false){
 if(!motorSound)return;
 const gate=Game.serviceGateStatus(simulation);
 const distance=Math.hypot(simulation.player.x-gate.x,simulation.player.z-gate.z);
 // A valid PC interaction can unlock the ambient context. rAF updates never
 // create a new AudioContext by themselves or resume a paused match.
 if(unlock&&soundEnabled&&canAct()&&
   (windSound||(gate.motorActive&&
      distance<global.VeilpointGateMotorAudio.HEARING_RADIUS)))ensureAudio();
 motorSound.sync({enabled:soundEnabled,playable:canAct(),active:gate.motorActive,distance});
 if(windSound)windSound.sync({enabled:soundEnabled,playable:canAct(),
   elapsed:simulation.elapsed,
   exposure:global.VeilpointCoastalWindAudio.localWindExposure(
     simulation.player,simulation.obstacles,Game.lineBlocked)});
}
function tone(freq=560,duration=.08){if(!soundEnabled)return;
 const volume=AudioPrefs&&audioMix?AudioPrefs.gain(audioMix,'effects'):1;
 if(volume===0)return;
 try{if(!ensureAudio())return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(freq*.5,audio.currentTime+duration);gain.gain.setValueAtTime(.06*volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.00001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch(e){} }
function fire(){if(!canAct())return;const result=Game.tag(simulation,input.crouch);if(!result.ok)return;shotFeedback(true);}
function shotFeedback(immediateSave=false){
 // A fixed-step held trigger may fire several times per second. Avoid a
 // synchronous full-world snapshot and minimap redraw for every round.
 // Normal 15s autosave, explicit inventory actions and pause still flush state.
 if((immediateSave||simulation.elapsed-lastAutosaveElapsed>=SHOT_SAVE_INTERVAL_SECONDS)&&
  canAutoPersistMatch())persistMatch();
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
 // The service yard is fixed public map infrastructure, not enemy tracking.
 const gate=Game.serviceGateStatus(simulation);
 if(!simulation.scene){
  ctx.fillStyle=gate.open?'#89c6a1':'#d5b478';
  ctx.fillRect(tx(gate.x)-3,tz(gate.z)-3,6,6);
 }
 // Nearby, directly visible local caches support exploration without
 // revealing hidden/distant loot or any enemy location. Never mark caches
 // outside the actual view cone or behind physical structures.
 if(Navigation){
  const visibleCaches=Navigation.visibleLocalCaches(
    simulation.player,simulation.loot,simulation.obstacles,simulation.player.weaponId);
  for(const cache of visibleCaches){
   ctx.fillStyle=cache.compatible?'#8ecfb3':'#d9a97b';
   ctx.beginPath();ctx.arc(tx(cache.x),tz(cache.z),2.6,0,Math.PI*2);ctx.fill();
  }
 }
 // Visiting a public site with actual line-of-sight reveals its name.
 // Unvisited sites and all other players remain unmarked.
 for(const site of Game.visitedLandmarks(simulation)){
  const x=tx(site.x),y=tz(site.z);
  ctx.fillStyle='#80dbd0';ctx.fillRect(x-3,y-3,6,6);
  ctx.font='9px sans-serif';ctx.textAlign='left';
  ctx.fillText(site.label.slice(0,18),Math.min(w-105,x+6),Math.max(12,y-5));
 }
 // Show only the survivor's own manually placed physical navigation sign.
 if(simulation.trailMarker){
  ctx.fillStyle='#e7b852';ctx.beginPath();
  ctx.arc(tx(simulation.trailMarker.x),tz(simulation.trailMarker.z),3.6,0,Math.PI*2);ctx.fill();
 }
 // When outside the public circle, mark the nearest point just INSIDE
 // the present safe zone. This is not an all-clear route: use an amber dot
 // when the straight segment crosses locally authored cover geometry.
 if(Navigation){
  const entry=Navigation.zoneEntry(simulation.player,simulation.zone,simulation.obstacles);
  if(entry){
   ctx.fillStyle=entry.straightLineBlocked===true?'#e8ad67':'#a3eed0';
   ctx.beginPath();ctx.arc(tx(entry.x),tz(entry.z),3.5,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#0b2825';ctx.lineWidth=1;ctx.stroke();
  }
 }
 // No omniscient opponent positions: the map is a local map, not a live enemy tracker.
 const p=simulation.player;ctx.fillStyle='#eaffbd';ctx.beginPath();ctx.arc(tx(p.x),tz(p.z),4.8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#eaffbd';ctx.beginPath();ctx.moveTo(tx(p.x),tz(p.z));ctx.lineTo(tx(p.x)+Math.sin(p.yaw)*15,tz(p.z)-Math.cos(p.yaw)*15);ctx.stroke();
}
function updateHud(){const s=simulation,p=s.player;
 const bindings=desktopUi.get().bindings;
 const interactPrompt='['+Desktop.keyLabel(bindings.interact)+']';
 const reloadLabel=Desktop.keyLabel(bindings.reload);
 $('alive').textContent=Game.getAliveCount(s);$('phase').innerHTML=String(s.zone.phase+1).padStart(2,'0')+' <span class="unit">/ 06</span>';
 let tt=Math.max(0,Math.ceil(s.zone.phaseRemaining));$('time').textContent=String((tt/60)|0).padStart(2,'0')+':'+String(tt%60).padStart(2,'0');
 for(const k of ['health','stamina']){$(k+'Num').textContent=Math.round(p[k]);$(k+'Bar').style.width=p[k]+'%';}
 $('weaponName').textContent=Game.FIREARMS[p.weaponId].label;
 $('charges').innerHTML=p.loaded+'<span> / '+(p.charges-p.loaded)+'</span>';
 $('ammoStatus').textContent=(p.reloadRemaining>0?(p.reloadHesitation?'HESITATION · '+reloadLabel+' TO CORRECT':'RELOADING'):'READY')+' · STRESS '+Math.round(p.stress||0)+' · MOBILITY '+Math.round(Game.injuryMobility(p)*Game.supplyLoadMobility(p)*100)+'% · FIELD LOAD '+Math.round(Game.supplyLoadMobility(p)*100)+'% · ASSIST '+(p.reloadAssist?'ON':'OFF')+(Game.wetApronFooting(p).wet?(Game.harborWaveWash(s.elapsed,p).active?' · HARBOR WAVE WASH · FOOTING 67%':' · WET LOADING APRON · FOOTING 86%'):'')+
   (s.lighting==='dusk'?' · LAMP '+(s.brHeadlamp?.on?'ON ':'OFF ')+
    Math.ceil((s.brHeadlamp?.ticks||0)/60)+'s ['+Desktop.keyLabel(bindings.headlamp)+']':'');
  $('assistButton').textContent=p.reloadAssist?'ASSIST ON':'ASSIST OFF';$('elims').textContent=String(s.kills).padStart(2,'0')+' ELIMINATIONS';
 $('damage').style.opacity=Math.min(.85,s.damageFlash);
 $('compass').textContent=['N','NE','E','SE','S','SW','W','NW'][((Math.round((p.yaw%(2*Math.PI)+Math.PI*2)/(Math.PI/4)))%8)]+' '+String(((p.yaw*180/Math.PI)%360+360)%360|0).padStart(3,'0')+'°';
 if(Navigation&&$('navigation'))$('navigation').textContent=Navigation.zone(p,s.zone)+
  Navigation.fieldSign(p,s.trailMarker,s.obstacles)+
  ' · VISITED '+Game.visitedLandmarks(s).length+'/'+Game.LANDMARKS.length+
  (Game.publicDistrictAt(p,s.obstacles)?' · 도시 구조: '+Game.publicDistrictAt(p,s.obstacles).label:'');
 const boundary=Game.boundaryStatus(s);
 const eventMessage=s.messageTime>0?s.message:p.sprintExhausted?'EXHAUSTED · WALK UNTIL STAMINA 25':'';
 // Never let the warning expire while the latest active round is not durable.
 const saveMessage=running&&saveWarning
  ?saveIssue==='conflict'?'SAVE CONFLICT · ANOTHER TAB OWNS THE CHECKPOINT'
   :'SAVE FAILED · PROGRESS ONLY IN THIS TAB': '';
 const bookmarkMessage=running&&bookmarkIssue==='write-failed'
  ?'FIELD BOOKMARK NOT SAVED · MEMORY ONLY':running&&bookmarkIssue==='conflict'
   ?'FIELD BOOKMARK CONFLICT · ANOTHER TAB UPDATED SAVE':'';
 // Every published phase, including the last one, has a real deadline.
 const deadline=s.zone.phaseRemaining>0?' · DEADLINE '+tt+'s':' · FINAL LIMIT ACTIVE';
 const boundaryMessage=boundary.outside?'OUTSIDE MATCH BOUNDARY · RETURN '+boundary.meters+'m'+deadline:
   boundary.near?'BOUNDARY NEARBY · '+boundary.meters+'m'+deadline:'';
 // Keep reload and other event feedback readable alongside the boundary warning.
 $('message').textContent=graphicsContextLost?'GRAPHICS CONTEXT LOST · WAIT FOR RECOVERY':suspended&&running?'창 비활성 · 시뮬레이션 일시중지':
   [saveMessage,bookmarkMessage,boundaryMessage,eventMessage].filter(Boolean).join(' · ');
 if(input.observe&&canAct()&&!$('message').textContent)
  $('message').textContent='FIELD OBSERVATION · HOLD O FOR 2X DETAIL';
 const yardGate=Game.serviceGateStatus(s);
 const handcart=Game.handcartStatus(s);
 const vehicle=Game.shuttleStatus(s);
 const gateGuide=Navigation?Navigation.serviceGate(p,yardGate,Game.SERVICE_YARD,s.obstacles):'';
 const nearby=Game.nearestReachablePickup(s);
 const movable=Game.nearestRelocatableCache(s);
 const restock=s.status==='playing'&&p.charges>p.loaded&&s.loot.some(item=>
   item.weaponId===p.weaponId&&item.remaining<(item.kind==='ammo'?12:24)&&
   Math.hypot(item.x-p.x,item.z-p.z)<1.8&&
   !Game.lineBlocked(p.x,p.z,item.x,item.z,s.obstacles));
 $('pickupPrompt').style.display=vehicle.near||yardGate.near||handcart.near||nearby||restock||movable||gateGuide?'block':'none';
 if(vehicle.driving)$('pickupPrompt').textContent='PORT YARD VEHICLE · '+
   (vehicle.speed*3.6).toFixed(0)+' km/h · FUEL '+vehicle.fuel.toFixed(2)+' L · '+
   (vehicle.braking?'SERVICE BRAKE ACTIVE · ':'')+
   'W/S DRIVE · A/D TURN · ['+Desktop.keyLabel(bindings.crouch)+'] BRAKE · '+
   interactPrompt+' EXIT WHEN STOPPED';
 else if(vehicle.near)$('pickupPrompt').textContent=interactPrompt+' ENTER PARKED PORT YARD VEHICLE · HANDS ON CONTROLS';
 else if(yardGate.near)$('pickupPrompt').textContent=yardGate.obstructed
  ?'SERVICE YARD GATE STOPPED · TRACK OBSTRUCTED · CLEAR PASSAGE'
  :yardGate.closing
  ?interactPrompt+' REVERSE TO OPEN · SERVICE YARD GATE CLOSING '+Math.round(yardGate.progress*100)+'% · MOTOR AUDIBLE NEARBY'
  :yardGate.open?'SERVICE YARD GATE OPEN · PASSAGE CLEAR · '+interactPrompt+' CLOSE GATE'
  :yardGate.engaged?interactPrompt+' REVERSE TO CLOSE · SERVICE YARD GATE OPENING '+Math.round(yardGate.progress*100)+'% · MOTOR AUDIBLE NEARBY'
  :interactPrompt+' OPERATE SERVICE YARD SLIDING GATE · OPEN';
 else if(handcart.near)$('pickupPrompt').textContent=handcart.engaged
  ?interactPrompt+' RELEASE DOCK HANDCART · WALK FORWARD TO PUSH'
  :interactPrompt+' GRIP DOCK HANDCART · WALK FORWARD TO MOVE IT';
 else if(nearby)$('pickupPrompt').textContent=(nearby.weaponId!==p.weaponId?'INCOMPATIBLE AMMUNITION'
  :p.charges>=p.maxCharges?'AMMUNITION FULL':nearby.fieldPouch
   ?interactPrompt+' RECOVER FIELD POUCH · '+nearby.remaining+' CARBINE ROUNDS'
   :interactPrompt+' COLLECT '+Game.FIREARMS[p.weaponId].label+' AMMO · '+(nearby.remaining??(nearby.kind==='ammo'?12:24))+' ROUNDS LEFT')+
   (restock?' · [V] RETURN SPARE ROUNDS':'');
 else if(restock)$('pickupPrompt').textContent='[V] RETURN SPARE ROUNDS TO FIELD CACHE';
 else if(movable)$('pickupPrompt').textContent='LOCAL FIELD CACHE';
 else if(gateGuide)$('pickupPrompt').textContent=gateGuide;
 if(movable&&!yardGate.near)
  $('pickupPrompt').textContent+=' · ['+Desktop.keyLabel(bindings.cacheMove)+'] SHIFT CACHE';
 minimap();
}
function end(){if(motorSound)motorSound.stop();if(windSound)windSound.stop();if(footstepSound)footstepSound.stop();if(benchmark){benchmark.finish('match-ended');benchmarkUi();}let archivedResult=null;if(!memoryOnlyMatch){archivedResult=archiveLastResult();clearFieldBookmark();clearStoredMatch();}
 lastFinishedMatch={seed:simulation.seed,weaponId:simulation.player.weaponId,
  rivals:simulation.bots.length,entrySite:simulation.entrySite||'central',
  lighting:simulation.lighting||'day'};manualCheckpoint=null;
 running=false;$('overlay').classList.remove('hidden');$('mobileControls').classList.remove('active');$('play').textContent='다시 시작';
 $('saveExit').classList.add('hidden');$('forfeitMatch').classList.add('hidden');$('retryArena').classList.remove('hidden');
 $('restoreCheckpoint').classList.add('hidden');$('restartArena').classList.add('hidden');
 const won=simulation.status==='won',draw=simulation.status==='draw';document.querySelector('.eyebrow').textContent=won?'LAST SIGNAL / CHAMPION':draw?'FINAL DEADLINE / DRAW':'SIGNAL LOST / MATCH FINISHED';
 document.querySelector('h1').innerHTML=won?'VICT<span>ORY.</span>':draw?'DRAW.':'RE<span>DEPLOY.</span>';
 document.querySelector('.tagline').textContent=(won?'최후의 생존자가 되었습니다. ':draw?'최종 제한시간이 끝났지만 단독 생존자가 없어 공동 종료되었습니다. ':'이번 라운드는 종료되었습니다. ')+`생존 ${Math.floor(simulation.elapsed)}초 · 제거 ${simulation.kills}명`+(draw?' · 공동 종료':` · 순위 ${Game.getFinalPlacement(simulation)}위`)+(!memoryOnlyMatch&&!archivedResult?' · 경기 결과 저장 확인 실패':'');
 if(document.pointerLockElement===canvas)document.exitPointerLock();
}
function frame(now){requestAnimationFrame(frame);
 // Watch the actual browser permission state, not just a Promise: older
 // browsers can leave it pending indefinitely without an error event.
 // An acquired lock always wins even if its event has not been dispatched.
 if(running&&!suspended&&!isTouch){
  if(document.pointerLockElement===canvas){
   pointerLockPendingSince=null;aimLockObserved=true;
  }else if(aimLockObserved || (pointerLockPendingSince!==null&&
     now-pointerLockPendingSince>=POINTER_LOCK_TIMEOUT_MS)){
   // Also catch a silently released lock when pointerlockchange is lost.
   suspendMatch('pointer');resetInactiveClock();
  }
 }
 let dt=Math.min(Math.max((now-last)/1000,0),.25);last=now;
 syncMotorSound();
 if(renderer){if(canAct()){
  if(joyId!==null){input.left=thumb.x<-.25;input.right=thumb.x>.25;input.forward=thumb.y<-.25;input.back=thumb.y>.25;}
  clock.advance(dt,step=>{
   if(simulation.status!=='playing')return;
   const footX=simulation.player.x,footZ=simulation.player.z;
   Game.tick(simulation,step,input);
   if(footstepSound)footstepSound.sync({
      enabled:soundEnabled,playable:canAct(),
      distance:Math.hypot(simulation.player.x-footX,simulation.player.z-footZ),
      crouched:!!input.crouch,running:!!input.sprint&&!input.crouch,
      surface:Game.wetApronFooting(simulation.player).wet?'wet':'dry'
   });
   if(input.fireHeld&&simulation.status==='playing'&&Game.autoFire(simulation,true,input.crouch).ok)shotFeedback();
  });
  if(simulation.status==='playing'&&canAutoPersistMatch()&&
    (saveWarning||simulation.elapsed-lastAutosaveElapsed>=15 ||
    (simulation.player.health<lastSavedHealth-.5&&simulation.elapsed-lastAutosaveElapsed>=1)))persistMatch();
 }
 // Resolve terminal states even when they change between simulation ticks.
 if(running&&simulation.status!=='playing')end();
 if(!suspended&&fpsLimiter.shouldRender(now)){
  if(lastRenderTime!==null)telemetry.record('raf',now-lastRenderTime);
  lastRenderTime=now;
  const cpuStart=performance.now();
  // View-only, held optical magnification restores the user's real camera
  // preference on key release. No actor data or checkpoint fields are altered.
  if(typeof renderer.setObservationZoom==='function')
   renderer.setObservationZoom(!!input.observe&&canAct(),cameraFov);
  renderer.draw(simulation);
  const cpuMs=performance.now()-cpuStart;
  telemetry.record('cpu',cpuMs);
  if(stillRequested){
   stillRequested=false;
   if(canAct())try{
    global.VeilpointBodycamStill.saveStill({
      canvas,renderer,document,mode:'br',elapsed:simulation.elapsed
    });
   }catch(error){console.warn('VEILPOINT bodycam still failed',error);}
  }
  if(canAct()){
   const measuredScale=renderer.adaptiveScale||(renderer.fallback&&renderer.fallback.adaptiveScale)||graphicsSettings.resolutionScale;
   if(benchmark)benchmark.frame(now,cpuMs,measuredScale,{width:canvas.width,height:canvas.height});
  }
  if(autoResolution&&renderer.gpuTimer&&renderer.gpuTimer.supported&&now-lastGovernorCheck>=1250){
   const gpu=telemetry.stats('gpu'),cpu=telemetry.stats('cpu');
   const previousScale=governor.getScale();
   const nextScale=governor.update({nowMs:now,gpuP95:gpu.p95,cpuP95:cpu.p95,
     gpuSamples:gpu.count,cpuSamples:cpu.count,gpuTotal:gpu.total,cpuTotal:cpu.total});
   renderer.setAdaptiveResolution(nextScale);
   if(nextScale!==previousScale){
    // Do not apply a previous resolution's GPU costs to the next quality step.
    telemetry.clear();gpuEvidenceGate.reset(performance.now());governor.resetEvidence();
   }
   lastGovernorCheck=now;
  }
 }}
 if(now-lastHud>250){benchmarkUi();updateHud();const f=fpsLimiter.stats();$('fpsMeter').textContent=(f.actualFps||'--')+' / '+f.cap+' FPS';
 const cpu=telemetry.stats('cpu'),gpu=telemetry.stats('gpu'),raf=telemetry.stats('raf');
 const fmt=v=>v===null?'측정 불가':v.toFixed(2)+'ms';
 const scale=renderer?(renderer.adaptiveScale||(renderer.fallback&&renderer.fallback.adaptiveScale)||graphicsSettings.resolutionScale):graphicsSettings.resolutionScale;
 const timings=(label,stats)=>label+' (n='+stats.count+') P50/P95/P99: '+
   [stats.p50,stats.p95,stats.p99].map(fmt).join(' / ');
 // Only a real, sufficiently sampled callback window can make a pacing
 // statement. This is not the measured graphics-card FPS or panel refresh.
 const pacing=raf.count>=30
   ?graphics.frameBudgetStatus(raf.p95,graphicsSettings.fpsCap):'unmeasured';
 const pacingText=pacing==='unmeasured'?'관측 부족':
   pacing==='within-budget'?'설정된 예산 이내':'설정된 예산 초과';
 const callbackBudget='표시 콜백 P95 / '+graphicsSettings.fpsCap+'FPS 설정: '+
   pacingText+' (브라우저 측정값 · 모니터/실제 GPU FPS 미인증)';
 // These are browser callback/draw/timer-query samples, not end-to-end input latency.
 $('perfDetails').textContent=[timings('렌더 CPU',cpu),timings('GPU 타이머',gpu),
   timings('표시 콜백 간격',raf),callbackBudget,'현재 내부 렌더 배율: '+Math.round(scale*100)+'%'+
   (renderer&&renderer.lastVisibilityStats?' · 동적 버텍스: '+renderer.lastVisibilityStats.estimatedDynamicVertices+' / 봇: '+renderer.lastVisibilityStats.botsVisible+'/'+renderer.lastVisibilityStats.botsTotal:'')].concat(renderer&&renderer.lastStaticVisibilityStats?['정적 지형 제출: '+renderer.lastStaticVisibilityStats.submittedVertices+'/'+renderer.lastStaticVisibilityStats.totalVertices+' 버텍스 · 화면 범위 청크 '+renderer.lastStaticVisibilityStats.visibleChunks+'/'+renderer.lastStaticVisibilityStats.totalChunks]:[]).join('\n');
 lastHud=now;}
}
requestAnimationFrame(frame);
})(globalThis);
