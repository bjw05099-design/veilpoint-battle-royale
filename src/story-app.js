/* VEILPOINT CH01 first-person browser integration; separate from offline BR.
 * Story state and checkpoint logic live in story-slice.js.
 */
(function (global) {
  'use strict';
  const $=id=>document.getElementById(id);
  const Story=global.VeilpointStorySlice;
  const Navigation=global.VeilpointNavigation;
  const Graphics=global.VeilpointGraphics;
  const Sim=global.VeilpointSim;
  const Audio=global.VeilpointStoryAudio;
  const Desktop=global.VeilpointDesktopControls;
  const SAVE_KEY='veilpoint.story.ch01';
  const BACKUP_KEY='veilpoint.story.ch01.previous';
  const PREVIEW_KEY='veilpoint.story.ch01PreviewCompleted';
  const canvas=$('scene'),menu=$('menu'),choices=$('choices'),quality=$('quality');
  const clock=global.VeilpointClock.createClock({hz:60,maxFrameSeconds:.25,maxSteps:8});
  const limiter=global.VeilpointFPS.createFrameLimiter(60);
  const input={forward:false,back:false,left:false,right:false,sprint:false,crouch:false,fireHeld:false};
  global.VeilpointInput=input;
  let state=Story.createState(),renderer=null,running=false,graphicsContextLost=false,last=performance.now(),lastHud=0;
  let checkpoint=null,saveFailed=false,sessionStarted=false,recoveredFromBackup=false;
  // N cycles only already-published mission markers; it never reveals hidden actors.
  let guidanceIndex=null;
  // Checkpoint quiet movement and elapsed route progress without writing at 60Hz.
  const AUTOSAVE_SECONDS=5;
  // Keep CH01 automatic volleys from synchronously serializing the whole
  // mission on every fixed-step shot. Pausing and phase changes still flush.
  // Story preview uses a shorter checkpoint window than BR to bound progress loss.
  const SHOT_SAVE_INTERVAL_SECONDS=0.45;
  let lastAutosaveAt=0,shotSavePending=false;
  if(!Object.prototype.hasOwnProperty.call(Sim.FIREARMS,$('storyWeapon').value))$('storyWeapon').value='carbine';
  // Hybrid Windows PCs can report coarse primary input despite a connected mouse.
  // Require desktop pointer lock when any fine pointer is available.
  const isWindows=Desktop.isWindowsPC(global.navigator);
  const isTouch=!isWindows && global.matchMedia('(pointer:coarse)').matches &&
    !global.matchMedia('(any-pointer:fine)').matches;
  // A Windows convertible must not show the old coarse-pointer mobile overlay.
  if(isWindows)$('mobile').style.display='none';
  let lockAttempt=0,pointerLockPendingSince=null,aimLockObserved=false;
  const POINTER_LOCK_TIMEOUT_MS=4000;
  // A desktop player cannot aim without pointer lock; no hostile 60Hz tick or
  // player action may advance while permission is pending, denied or lost.
  const canAct=()=>running&&!graphicsContextLost&&!!renderer&&!document.hidden&&(isTouch||document.pointerLockElement===canvas);
  const trigger=Desktop.createTriggerLatch();
  const clearInput=()=>{trigger.clear();for(const key in input)input[key]=false;};
  // A denied localStorage getter must not prevent offline CH01 from launching.
  const desktopStorage=(()=>{try{return global.localStorage;}catch(_){return null;}})();
  const desktopUi=Desktop.attach(document,desktopStorage,clearInput);
  const storage={
    get(key){try{return global.localStorage.getItem(key);}catch(_){return null;}},
    set(key,value){try{global.localStorage.setItem(key,value);return true;}catch(_){return false;}},
    remove(key){try{global.localStorage.removeItem(key);}catch(_){}}
  };
  function readCheckpoint(){
    const primary=storage.get(SAVE_KEY),backup=storage.get(BACKUP_KEY);
    try{
      const recovered=Story.recoverCheckpoint(primary,backup);
      if(!recovered)return null;
      if(recovered.source==='backup'){
        recoveredFromBackup=true;
        // Restore the last validated checkpoint to the primary slot, even if
        // its newest generation was truncated by an interrupted disk write.
        storage.set(SAVE_KEY,backup);
      }
      return recovered.state;
    }catch(_){
      storage.remove(SAVE_KEY);storage.remove(BACKUP_KEY);return null;
    }
  }
  $('saveStatus').classList.add('hidden');
  function persist(reason=''){
    const raw=Story.serialize(state);
    const previous=storage.get(SAVE_KEY);
    // Keep the prior valid playable generation before updating the primary.
    // A corrupt current slot must never be copied into the safety slot.
    if(previous&&previous!==raw){
      try{
        const priorState=Story.restore(previous);
        if(priorState.phase!=='failed'&&priorState.phase!=='complete')
          storage.set(BACKUP_KEY,previous);
      }catch(_){}
    }
    const saved=storage.set(SAVE_KEY,raw);
    // A failed browser write is not a checkpoint. Keep the last successful
    // autosave boundary so the next live frame retries instead of silently
    // postponing recovery for another five simulated seconds.
    if(saved){
      lastAutosaveAt=state.world.elapsed;
      shotSavePending=false;
    }
    saveFailed=!saved;
    // Keep the last alive checkpoint in memory even when browser storage is denied.
    // A failed mission must never overwrite this recovery point.
    checkpoint=raw;
    const notice=$('saveStatus');
    notice.textContent=saved?(reason?'체크포인트 저장 · '+reason:''):'체크포인트 저장 실패 · 새로고침하면 현재 진행 상황이 사라질 수 있습니다.';
    notice.classList.toggle('hidden',saved&&!reason);
    return saved;
  }
  function persistShot(){
    if(state.phase!=='engagement'||state.world.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS)
      persist();
    else shotSavePending=true;
  }
  function recordCompletion(){
    // A bounded, evidence-based CH01 handoff, not a completed 50-minute M01.
    // This separate preview key must never unlock competitive or campaign content.
    const report=Story.debrief(state);
    if(report)storage.set(PREVIEW_KEY,JSON.stringify(report));
    return report;
  }
  const audio=Audio.create({AudioContextClass:global.AudioContext||global.webkitAudioContext,
    enabled:storage.get('veilpoint.story.audio')!=='off'});
  $('soundEnabled').checked=audio.enabled();
  $('soundEnabled').addEventListener('change',()=>{
    audio.setEnabled($('soundEnabled').checked);
    storage.set('veilpoint.story.audio',audio.enabled()?'on':'off');
  });
  let settings=Graphics.fromPreset('balanced');
  try{const raw=storage.get('veilpoint.graphics');if(raw)settings=Graphics.deserialize(raw);}catch(_){}
  function applyQuality(){
    limiter.setLimit(settings.fpsCap);limiter.reset();
    if(renderer)renderer.setGraphicsQuality(settings);
    quality.value=settings.preset;
    storage.set('veilpoint.graphics',Graphics.serialize(settings));
  }
  quality.addEventListener('change',()=>{
    try{
      if(quality.value==='custom')settings=Graphics.customize(settings,'fpsCap',settings.fpsCap);
      else settings=Graphics.fromPreset(quality.value);
      applyQuality();
    }catch(_){quality.value=settings.preset;}
  });
  $('reducedMotion').checked=global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('reducedMotion').addEventListener('change',()=>{
    $('app').classList.toggle('reduced',$('reducedMotion').checked);
  });
  function initializeRenderer(){
    // WebGL restoration invalidates the old GPU resources; rebuild them.
    renderer=new global.VeilpointRenderer(canvas);applyQuality();
  }
  try{initializeRenderer();}
  catch(err){
    renderer=null;$('menuText').textContent='3D 렌더러를 초기화할 수 없습니다: '+String(err.message);
    $('continue').disabled=true;$('newGame').disabled=true;
  }
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();graphicsContextLost=true;
    menuOpen('그래픽 장치 연결이 끊어졌습니다. 복구될 때까지 CH01 진행이 중단됩니다.');
    renderer=null;$('continue').disabled=true;$('newGame').disabled=true;
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    if(!graphicsContextLost)return;
    try{
      initializeRenderer();graphicsContextLost=false;
      $('continue').disabled=false;$('newGame').disabled=false;
      clearInput();clock.reset();limiter.reset();last=performance.now();
      $('menuText').textContent='그래픽 장치가 복구되었습니다. 이어하기를 눌러 현재 체크포인트부터 재개하세요.';
    }catch(err){
      renderer=null;
      $('menuText').textContent='그래픽 복구 실패 · 새로고침이 필요합니다: '+String(err.message);
    }
  });
  function menuOpen(text){
    // Pausing after a choice or during clearance must not roll back elapsed world state.
    if(running&&state.phase!=='complete'&&state.phase!=='failed')persist();
    running=false;lockAttempt++;pointerLockPendingSince=null;aimLockObserved=false;
    desktopUi.cancel();clearInput();touchLookId=null;previous=null;clock.reset();limiter.reset();
    if(saveFailed)text=(text||'일시정지')+' · 저장 실패: 새로고침하면 현재 진행 상황이 사라질 수 있습니다.';
    if(text)$('menuText').textContent=text;
    menu.classList.remove('hidden');choices.classList.add('hidden');
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    const completed=state.phase==='complete'||state.phase==='failed';
    $('continue').textContent=state.phase==='failed'?'마지막 체크포인트 재시도':
      state.phase==='complete'?'미션 다시 플레이':'이어하기';
  }
  function requestAimLock(){
    if(isTouch)return;
    const attempt=++lockAttempt;
    pointerLockPendingSince=performance.now();aimLockObserved=false;
    const unavailable=()=>menuOpen('마우스 포인터 잠금이 거부되었거나 지원되지 않습니다. 권한을 허용한 뒤 이어하기를 눌러 재시도하세요.');
    if(typeof canvas.requestPointerLock!=='function'){unavailable();return;}
    try{
      const result=Desktop.requestPrecisionPointerLock(canvas,()=>attempt===lockAttempt&&running);
      if(result&&typeof result.catch==='function')result.catch(()=>{
        if(attempt===lockAttempt&&running&&document.pointerLockElement!==canvas)unavailable();
      });
    }catch(_){unavailable();}
  }
  function resume(){
    if(!renderer||graphicsContextLost)return;
    if(state.phase==='failed'){
      // Death is not a checkpoint. Retry the latest *alive* fixed-step state,
      // preserving finite rounds, injury, actor positions and the mission phase.
      let recovered=null;
      for(const raw of [checkpoint,storage.get(SAVE_KEY),storage.get(BACKUP_KEY)]){
        if(!raw)continue;
        try{
          const candidate=Story.restore(raw);
          if(candidate.phase!=='failed'&&candidate.phase!=='complete'){
            recovered=candidate;break;
          }
        }catch(_){} // A corrupt or historical failed save cannot trap the menu.
      }
      state=recovered||Story.createState($('storyWeapon').value);
      $('storyWeapon').value=state.world.player.weaponId;
      guidanceIndex=null;shotSavePending=false;
      lastAutosaveAt=state.world.elapsed;
    }else if(state.phase==='complete'){
      state=Story.createState($('storyWeapon').value);
      lastAutosaveAt=state.world.elapsed;
    }
    if(state.phase==='decision'){showChoices();return;}
    menu.classList.add('hidden');choices.classList.add('hidden');
    running=true;desktopUi.cancel();clock.reset();limiter.reset();last=performance.now();clearInput();
    Desktop.focusGameplay(document,canvas);
    requestAimLock();
    updateHud();
  }
  function begin(fromCheckpoint){
    if(!renderer||graphicsContextLost)return;
    if(fromCheckpoint){
      const loaded=readCheckpoint();
      state=loaded&&loaded.phase!=='complete'?loaded:Story.createState($('storyWeapon').value);
      if(loaded&&loaded.phase==='complete'){
        // Explicit replay begins a fresh mission; an old completed world must
        // not reappear as a resumable checkpoint after an interrupted restart.
        storage.remove(SAVE_KEY);storage.remove(BACKUP_KEY);storage.remove(PREVIEW_KEY);
      }
      checkpoint=storage.get(SAVE_KEY);
    }else{
      state=Story.createState($('storyWeapon').value);
      storage.remove(SAVE_KEY);storage.remove(BACKUP_KEY);storage.remove(PREVIEW_KEY);checkpoint=null;
      recoveredFromBackup=false;
    }
    $('reviewCompleted').classList.add('hidden');
    $('debriefReview').classList.add('hidden');
    $('storyWeapon').value=state.world.player.weaponId;
    sessionStarted=true;guidanceIndex=null;
    lastAutosaveAt=state.world.elapsed;
    shotSavePending=false;
    saveFailed=false;
    $('saveStatus').textContent='';
    $('saveStatus').classList.add('hidden');
    resume();
  }
  function showChoices(){
    running=false;lockAttempt++;clearInput();clock.reset();
    choices.classList.remove('hidden');menu.classList.add('hidden');
    const canVerify=state.found.length===2;
    $('choiceVerified').disabled=!canVerify;
    const revisiting=state.phase==='exit';
    $('choiceBack').textContent=revisiting?'취소 · 기존 경로 유지':'돌아가서 조사';
    $('choiceHint').textContent=revisiting
      ?'현재 '+(state.choice==='verification'?'동쪽 확인 경로':'남쪽 대피 경로')+' · '+(state.choice==='verification'&&!Story.situation(state).eastGateOpen?'통제문 개방까지 약 '+Math.ceil(Story.situation(state).eastGateRemainingSeconds)+'초 · ':'')+'현장 콘솔에서 변경할 수 있습니다. 취소하면 현재 경로와 진행 상태를 유지합니다.'
      :canVerify?'기록 2/2: 항구 04:12 · 대피소 04:07. 두 경로 모두 선택할 수 있습니다.'
      :'기록 '+state.found.length+'/2: 대피 우선은 즉시 선택 가능하며, 추가 확인 경로는 기록 2개가 필요합니다.';
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    updateHud();
  }
  function decide(option){
    const result=Story.choose(state,option);
    if(!result.ok){$('choiceHint').textContent='경로를 변경할 수 없습니다. 현장 콘솔 접근과 진행 상태를 확인하세요.';return;}
    guidanceIndex=null;persist();resume();
  }
  function interact(){
    if(!canAct()||state.phase==='complete')return;
    const result=Story.interact(state);
    if(!result.ok){
      // A physically blocked cargo exit changes the mission subtitle/message
      // even though it must not save a false completion or play a success cue.
      if(['cargo_handoff_required','guide_not_arrived','guide_not_at_muster'].includes(result.reason))updateHud();
      return;
    }
    guidanceIndex=null;
    audio.play(state.phase==='complete'?'complete':'interact');
    persist();
    if(state.phase==='decision'||result.event==='reconsider'){showChoices();return;}
    if(state.phase==='complete'){
      const report=recordCompletion();
      menuOpen('CH01 완료 — '+state.subtitle+' '+(report?report.summary+' ':'')+'현재는 짧은 브라우저 스토리 프리뷰이며, 12시간 캠페인은 아직 제작 중입니다.');
    }
    updateHud();
  }
  function fire(){
    if(!canAct())return;
    const result=Story.fire(state,input.crouch);
    if(result.ok){audio.play('shot');persist();updateHud();}
  }
  function reload(){
    if(!canAct()||state.phase!=='engagement')return;
    const result=Sim.reload(state.world);
    if(result.reason==='recovery_not_ready'){
      state.subtitle='이수혁 대위: 장전 동작이 안정되면 R키 또는 장전 버튼을 다시 눌러 복구할 수 있습니다.';
      updateHud();return;
    }
    if(result.ok){audio.play('reload');persist();updateHud();}
  }
  function toggleReloadAssist(){
    if(!canAct())return;
    Sim.setReloadAssist(state.world,!state.world.player.reloadAssist);
    persist();updateHud();
  }
  function support(){
    if(!canAct())return;
    const result=Story.support(state);
    if(result.ok){audio.play('report');persist();updateHud();}
  }
  // Disk checkpoints are for a fresh page load. A paused session must resume
  // its live world even when storage is denied, full or contains an older save.
  $('continue').addEventListener('click',()=>sessionStarted?resume():begin(true));
  $('newGame').addEventListener('click',()=>begin(false));
  $('reviewCompleted').addEventListener('click',()=>{
    if(running||sessionStarted||graphicsContextLost||!renderer)return;
    try{
      const reviewed=Story.reviewCompletedMission(storage.get(SAVE_KEY));
      // This does not advance the world clock, grant ammunition or start play.
      // The scene and debrief reflect one validated completed CH01 snapshot.
      state=reviewed.state;
      const report=reviewed.report;
      $('debriefReview').textContent='CH01 완료 · 경로: '+
        (report.route==='verification'?'동쪽 기록 검증':'남쪽 대피')+
        ' · 조사 기록 '+report.records.length+'/2 · '+report.summary;
      $('debriefReview').classList.remove('hidden');
      $('menuText').textContent='저장된 CH01 종료 당시의 세계 상태와 분기 결과를 확인 중입니다. 결과를 확인한 뒤 새 미션을 시작할 수 있습니다.';
      $('continue').textContent='CH01 다시 시작';
      updateHud();
    }catch(_){
      $('reviewCompleted').classList.add('hidden');
      $('debriefReview').classList.add('hidden');
      $('menuText').textContent='완료 기록을 검증할 수 없습니다. 처음부터 다시 시작할 수 있습니다.';
    }
  });
  $('pauseButton').addEventListener('click',()=>menuOpen('일시정지됨. 이어하기를 누르면 현재 체크포인트부터 재개합니다.'));
  $('choiceEvac').addEventListener('click',()=>decide('evacuation'));
  $('choiceVerified').addEventListener('click',()=>decide('verification'));
  $('choiceBack').addEventListener('click',()=>{
    if(state.phase==='exit'){resume();return;}
    if(Story.backToRecords(state).ok){guidanceIndex=null;persist();resume();}
  });
  global.addEventListener('keydown',e=>{
    if(desktopUi.captureKey(e))return;
     if(Desktop.isGameplayShortcut(e)){clearInput();return;}
    // Focused menu and settings controls own their keyboard events.
    if(Desktop.isInteractiveTarget(e.target))return;
    const repeatAction=Desktop.actionFor(e.code,desktopUi.get());
    // Do not let OS key-repeat frequency decide finite shots or one-shot actions.
    // A future held-fire mode belongs in the deterministic 60Hz simulation.
    if(e.repeat){if(repeatAction)e.preventDefault();return;}
    if(choices.classList.contains('hidden')===false){
      if(e.code==='Digit1'){e.preventDefault();decide('evacuation');}
      if(e.code==='Digit2'){e.preventDefault();decide('verification');}
      if(e.code==='Escape'){e.preventDefault();$('choiceBack').click();}
      return;
    }
    if(e.code==='Escape'){
      e.preventDefault();
      if(e.repeat)return;
      if(running){menuOpen('일시정지됨. Esc 또는 이어하기를 눌러 재개하세요.');}
      else if(sessionStarted&&!menu.classList.contains('hidden')&&
        choices.classList.contains('hidden')&&state.phase!=='failed'&&state.phase!=='complete'&&
        !graphicsContextLost&&renderer){
        // Escape resumes only a paused, already-started CH01 session. Never
        // bypass the opening menu, mission result or graphics recovery.
        resume();
      }
      return;
    }
    if(!canAct())return;
    const action=Desktop.actionFor(e.code,desktopUi.get());
    if(action&&Object.prototype.hasOwnProperty.call(input,action)){e.preventDefault();input[action]=true;}
    if(action==='interact'){e.preventDefault();interact();}
    if(action==='fire'){e.preventDefault();fire();if(Sim.FIREARMS[state.world.player.weaponId].automatic)input.fireHeld=trigger.press('keyboard');}
    if(action==='support'){e.preventDefault();support();}
    if(action==='reload'){e.preventDefault();reload();}
    if(action==='assist'){e.preventDefault();toggleReloadAssist();}
    if(action==='headlamp'){
      e.preventDefault();
      if(Story.toggleFlashlight(state).ok){audio.play('interact');persist();}
      updateHud();
    }
    if(action==='guidance'){
      e.preventDefault();
      const count=Story.markers(state).length;
      guidanceIndex=count===0||guidanceIndex===count-1?null:guidanceIndex===null?0:guidanceIndex+1;
      updateHud();
    }
  });
  global.addEventListener('keyup',e=>{
    const action=Desktop.actionFor(e.code,desktopUi.get());
    if(action&&Object.prototype.hasOwnProperty.call(input,action))input[action]=false;
    if(action==='fire')input.fireHeld=trigger.release('keyboard');
  });
  // Losing focus must not leave the player exposed to hostile volleys or advance
  // a timed route while they cannot control the game. Persist at the pause boundary.
  function pauseForBackground(){
    clearInput();clock.reset();limiter.reset();last=performance.now();
    if(running)menuOpen('창이 비활성화되어 자동 일시정지했습니다. 이어하기를 눌러 재개하세요.');
  }
  global.addEventListener('blur',pauseForBackground);
  global.addEventListener('pagehide',pauseForBackground);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)pauseForBackground();
    else {clearInput();clock.reset();limiter.reset();last=performance.now();}
  });
  document.addEventListener('pointerlockchange',()=>{
    if(isTouch)return;
    if(!running&&document.pointerLockElement===canvas){document.exitPointerLock();return;}
    if(running&&document.pointerLockElement!==canvas)
      menuOpen('마우스 포인터 잠금이 해제되었습니다. 이어하기를 눌러 재개하세요.');
  });
  // Some desktop browsers emit pointerlockerror without rejecting the request
  // Promise. Pause and checkpoint instead of leaving CH01 apparently running.
  document.addEventListener('pointerlockerror',()=>{
    if(!isTouch&&running&&document.pointerLockElement!==canvas)
      menuOpen('마우스 포인터 잠금 요청이 거부되었습니다. 이어하기를 눌러 재시도하세요.');
  });
  function look(dx,dy){
    const p=state.world.player;
    const delta=Desktop.mouseDelta(dx,dy,desktopUi.get());
    p.yaw+=delta.yaw;p.pitch=Math.max(-.33,Math.min(.35,p.pitch+delta.pitch));
  }
  global.addEventListener('mousemove',e=>{if(canAct()&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
  canvas.addEventListener('click',()=>{
    if(!running||isTouch)return;
    if(document.pointerLockElement!==canvas)requestAimLock();
  });
  canvas.addEventListener('mousedown',e=>{
    if(e.button!==0||!canAct()||isTouch||document.pointerLockElement!==canvas)return;
    fire();
    if(Sim.FIREARMS[state.world.player.weaponId].automatic)input.fireHeld=trigger.press('mouse');
  });
  global.addEventListener('mouseup',e=>{if(e.button===0)input.fireHeld=trigger.release('mouse');});
  let touchLookId=null,previous=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!isTouch||!canAct())return;
    touchLookId=e.pointerId;previous={x:e.clientX,y:e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(touchLookId!==e.pointerId||!previous||!canAct())return;
    look(e.clientX-previous.x,e.clientY-previous.y);
    previous={x:e.clientX,y:e.clientY};
  });
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{
    if(touchLookId===e.pointerId){touchLookId=null;previous=null;}
  });
  for(const button of document.querySelectorAll('[data-move]')){
    const name=button.dataset.move;
    button.addEventListener('pointerdown',e=>{e.preventDefault();if(!canAct())return;input[name]=true;button.setPointerCapture(e.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])
      button.addEventListener(event,()=>{input[name]=false;});
  }
  $('touchInteract').addEventListener('click',interact);
  $('touchFire').addEventListener('click',fire);
  $('touchReload').addEventListener('click',reload);
  $('touchAssist').addEventListener('click',toggleReloadAssist);
  $('touchSupport').addEventListener('click',support);
  $('touchSprint').addEventListener('pointerdown',e=>{e.preventDefault();if(!canAct())return;input.sprint=true;$('touchSprint').setPointerCapture(e.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])
    $('touchSprint').addEventListener(event,()=>{input.sprint=false;});
  function minimap(){
    const c=$('minimap'),ctx=c.getContext('2d');
    if(!ctx)return;
    const w=c.width,h=c.height,tx=x=>(x+75)/150*w,tz=z=>(z+90)/130*h;
    ctx.fillStyle='#0b2326';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#3c5552';ctx.lineWidth=1;
    for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(w*i/6,0);ctx.lineTo(w*i/6,h);ctx.stroke();}
    for(const o of state.world.obstacles){
      ctx.fillStyle='#637874';ctx.fillRect(tx(o.x-o.w/2),tz(o.z-o.d/2),o.w/150*w,o.d/130*h);
    }
    for(const m of Story.markers(state)){
      ctx.fillStyle=m.kind==='evac'?'#91f0ad':(m.kind==='evidence'||m.kind==='verify')?'#8ec6ff':'#ffcb7c';
      ctx.beginPath();ctx.arc(tx(m.x),tz(m.z),4.5,0,Math.PI*2);ctx.fill();
    }
    // The local walking guide is a known companion, but only shown when the
    // captain can directly observe them; never plot unseen opponents or actors.
    const escort=state.world.guide,player=state.world.player;
    if(escort&&Math.hypot(escort.x-player.x,escort.z-player.z)<20&&
       !Sim.lineBlocked(player.x,player.z,escort.x,escort.z,state.world.obstacles)){
      ctx.fillStyle='#c6d4de';ctx.beginPath();ctx.arc(tx(escort.x),tz(escort.z),3.6,0,Math.PI*2);ctx.fill();
    }
    // Map depicts accessible objectives and the player's location, not unseen opponents.
    const p=state.world.player;
    ctx.fillStyle='#faffd4';ctx.beginPath();ctx.arc(tx(p.x),tz(p.z),4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#faffd4';ctx.beginPath();ctx.moveTo(tx(p.x),tz(p.z));
    ctx.lineTo(tx(p.x)+Math.sin(p.yaw)*12,tz(p.z)-Math.cos(p.yaw)*12);ctx.stroke();
  }
  function updateHud(){
    $('objective').textContent=Story.objective(state);
    if(Navigation&&$('navigation'))$('navigation').textContent=Navigation.story(state.world.player,Story.markers(state),guidanceIndex)+
      (Story.markers(state).length>1?' · ['+
         (Desktop.actionFor('KeyN',desktopUi.get())==='guidance'
           ?'N':desktopUi.get().bindings.guidance.replace(/^Key/,''))+
         '] 표식 변경 / 자동 선택':'');
    $('status').textContent=state.message+' · 경과 '+Math.floor(state.world.elapsed)+'초'+
      (state.world.player.sprintExhausted?' · 지구력 회복 중: 25까지 회복해야 다시 달릴 수 있습니다.':'');
    $('subtitle').textContent=state.subtitle;
    const lampKey=Desktop.actionFor('KeyF',desktopUi.get())==='headlamp'
       ?'F':desktopUi.get().bindings.headlamp.replace(/^Key/,'');
     $('flashlightStatus').textContent=Story.situation(state).headlamp+' · ['+lampKey+'] 켜기/끄기';
    const situation=Story.situation(state);
    $('routeStatus').textContent=situation.route+(state.phase==='exit'&&state.choice==='verification'&&!situation.eastGateOpen?' · 통제문 대기 약 '+Math.ceil(situation.eastGateRemainingSeconds)+'초':'')+(situation.routeReviewAvailable?' · 결정 콘솔에서 경로 재선택 가능':'')+' · '+situation.civilianConsequence+(state.choice==='evacuation'?' · '+situation.guideStatus:'')+' · '+situation.radio+' · '+situation.warning+
      (state.choice==='evacuation'?' · '+situation.aidSupply:'');
    const combatActive=state.phase==='engagement';
    const p=state.world.player;
    // Self-condition is knowable to the player; never reveal hidden enemy state
    // or claim an exact source/direction for incoming shots.
    const healthVisible=combatActive||p.health<100;
    $('healthStatus').classList.toggle('hidden',!healthVisible);
    if(healthVisible){
      const condition=p.health===0?'임무 수행 불가':p.health<=30?'위급':p.health<70?'부상':p.health<100?'경미한 부상':'안정';
      $('healthStatus').textContent='건강 상태 '+Math.round(p.health)+'/100 · '+condition;
    }
    $('combatStatus').classList.toggle('hidden',!combatActive);
    if(combatActive){
      const p=state.world.player;
      $('touchAssist').textContent=p.reloadAssist?'장전 보조 ON':'장전 보조 OFF';
      $('combatStatus').textContent='장비 '+Sim.FIREARMS[p.weaponId].label+' · 무장 대치자 '+state.world.bots.filter(b=>b.alive).length+'/3 · 탄창 '+p.loaded+' / 예비 '+(p.charges-p.loaded)+(p.reloadRemaining>0?(p.reloadHesitation?' · 장전 지연 · R/장전 다시 눌러 복구':' · 재장전 중'):'')+' · 긴장 '+Math.round(p.stress||0)+' · 이동 능력 '+Math.round(Sim.injuryMobility(p)*100)+'% · 장전 보조 '+(p.reloadAssist?'켜짐':'꺼짐')+' · 동료 보고 '+(state.combat.supportUsed?'확인 완료':'Q 확인 가능')+' · 보급 '+(state.combat.supplyRemaining===0?'소진':p.charges>=p.maxCharges?'휴대 한도 도달 · 상자 잔량 '+state.combat.supplyRemaining+'발':'상자 잔량 '+state.combat.supplyRemaining+'발 · 접근 후 E 확보');
    }
    const entries=state.found.map(id=>Story.RECORDS[id]);
    $('records').textContent=entries.length
      ?entries.map(r=>r.title+' / '+r.time).join(' · ')+(entries.length===2?(state.gateLogReviewed?' / 현장 재전송 로그 확인':' / 시각 차이 확인'):'')
      :'기록 0/2 · 조사하지 않아도 대피할 수 있습니다.';
    const nearby=running?Story.nearest(state):null;
    $('interaction').classList.toggle('hidden',!nearby);
    if(nearby)$('interaction').textContent=nearby.kind==='ammo'
      ?nearby.label+' · 잔량 '+state.combat.supplyRemaining+'발 · '+
        (p.charges>=p.maxCharges?'탄약 휴대 한도 도달':'[E] 필요한 만큼 확보')
      :nearby.id==='decision'&&state.phase==='exit'?'[E] '+nearby.label+' · 경로 다시 선택 (현재 '+(state.choice==='verification'?'동쪽 확인':'남쪽 대피')+')'
      :nearby.id==='guideControl'?'[E] '+nearby.label+' · 현장 안내원 위치에서 동행 상태 변경'
      :nearby.id==='aidPickup'?'[E] '+nearby.label+' 들기 · 운반 중 달리기 제한'
      :nearby.id==='aidDrop'?'[E] '+nearby.label+' 인계'
      :nearby.id==='aidStage'?'[E] '+nearby.label+'에 내려놓기 · 이동 제한 해제'
      :nearby.id==='aidResume'?'[E] '+nearby.label+' 다시 들기'
       :nearby.id==='gateLog'?'[E] '+nearby.label+' 열람 · 최초 수신/재전송 대조'
      :nearby.id==='reportDesk'?'[E] '+nearby.label+'에 현장 기록 전달'
      :nearby.id==='beacon'?'[E] '+nearby.label+(state.beaconEnabled?' 끄기':' 작동')+' · 현장 수동 스위치'
      :'[E] '+nearby.label+' 조사';
    const f=limiter.stats();
    $('fps').textContent='FPS: '+(f.actualFps||'--')+' / 상한 '+f.cap+' · 시뮬레이션 60Hz'+(renderer&&renderer.lastStaticVisibilityStats?' · 정적 지형 '+renderer.lastStaticVisibilityStats.submittedVertices+'/'+renderer.lastStaticVisibilityStats.totalVertices+' 버텍스':'');
    minimap();
  }
  function frame(now){
    global.requestAnimationFrame(frame);
    // Some PC browsers silently leave permission pending forever or drop a
    // previously granted mouse lock without dispatching pointerlockchange.
    // Pause before any 60Hz world step; do not let unseen opponents progress.
    if(running&&!isTouch){
      if(document.pointerLockElement===canvas){
        pointerLockPendingSince=null;aimLockObserved=true;
      }else if(aimLockObserved||(pointerLockPendingSince!==null&&
          now-pointerLockPendingSince>=POINTER_LOCK_TIMEOUT_MS)){
        menuOpen('마우스 포인터 잠금이 응답하지 않거나 해제되었습니다. 이어하기를 눌러 다시 시도하세요.');
      }
    }
    const dt=Math.min(Math.max((now-last)/1000,0),.25);last=now;
    const gatePending=running&&state.phase==='exit'&&state.choice==='verification'&&
      !Story.situation(state).eastGateOpen;
    const healthBefore=state.world.player.health;
    const guideArrivedBefore=state.guide.arrived;
    const shotsBefore=running&&state.phase==='engagement'
      ?state.world.bots.reduce((total,hostile)=>total+hostile.shots,0):0;
    if(canAct()&&state.phase!=='complete'&&state.phase!=='failed')clock.advance(dt,step=>{
      Story.step(state,step,input);
      if(input.fireHeld&&state.phase==='engagement'&&Story.autoFire(state,true,input.crouch).ok){
        audio.play('shot');persistShot();
      }
    });
    // Flush a dirty held-fire checkpoint on its bounded clock even if the
    // most recent shot happened just before the 450ms deadline.
    if(running&&shotSavePending&&state.phase==='engagement'&&
       state.world.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS)persist();
    // A finite hostile shot must survive refresh even when it misses. Persist
    // only on an actual shot or injury, not every fixed simulation tick.
    const hostileFired=running&&state.phase==='engagement'&&
      state.world.bots.some(hostile=>hostile.shots>0)&&
      state.world.bots.reduce((total,hostile)=>total+hostile.shots,0)>shotsBefore;
    if(running&&state.phase==='engagement'&&
       (state.world.player.health<healthBefore||hostileFired)){
      if(state.world.player.health<healthBefore)audio.play('impact');
      persist();
    }
    // The civilian reaching the courtyard is an irreversible optional branch
    // milestone. Write it immediately, rather than losing it to a crash before
    // the normal five-second traversal autosave. The transition is one-shot.
    if(running&&Story.escortArrivalCheckpoint(guideArrivedBefore,state))
      persist('안내원 안뜰 도착');
    // Persist the actual world transition once, rather than writing every 60Hz tick.
    if(gatePending&&Story.situation(state).eastGateOpen)persist();
    // A browser crash or refresh during quiet traversal must not rewind an entire
    // mission segment. This uses simulated time, so paused/background tabs cannot
    // generate repeated writes or advance hostile attacks.
    if(running&&state.phase!=='complete'&&state.phase!=='failed'&&
       state.world.elapsed-lastAutosaveAt>=AUTOSAVE_SECONDS)persist();
    if(running&&state.phase==='failed'){
      // Never replace a viable save with a terminal failed state. The primary
      // action now retries the last alive checkpoint; New Game still resets all.
      menuOpen('교전 중 임무가 중단되었습니다. 마지막 체크포인트에서 재시도하거나 처음부터 다시 시작할 수 있습니다.');
    }
    // The existing finite damageFlash timer is already advanced by the fixed
    // 60Hz story step. Present a brief non-directional edge cue (no enemy radar).
    $('damageIndicator').style.opacity=String(running?Math.min(.65,Math.max(0,state.world.damageFlash/.45*.65)):0);
    if(renderer&&limiter.shouldRender(now))renderer.draw(state.world);
    if(now-lastHud>180){lastHud=now;updateHud();}
  }
  const loaded=readCheckpoint();
  checkpoint=storage.get(SAVE_KEY);
  if(loaded&&loaded.phase!=='complete'){
    $('continue').textContent='체크포인트 이어하기';
    $('menuText').textContent=recoveredFromBackup
      ?'최근 저장 파일이 손상되어 이전 정상 체크포인트를 복구했습니다. 이어하기로 임무를 계속하세요.'
      :'이전 진행 기록이 있습니다. 이어하기를 누르면 마지막 자동 저장 위치부터 시작합니다.';
  }else if(loaded&&loaded.phase==='complete'){
    // Completion is terminal. Never auto-respawn or interpret its world as an
    // active checkpoint. Review is a deliberate read-only PC menu action.
    $('continue').textContent='CH01 새 미션 시작';
    $('reviewCompleted').classList.remove('hidden');
    $('menuText').textContent='이전 CH01 임무의 완료 기록이 있습니다. 결과 다시 보기를 선택하면 당시의 실제 세계 상태와 분기 결과를 확인할 수 있습니다.';
  }
  $('app').classList.toggle('reduced',$('reducedMotion').checked);
  updateHud();global.requestAnimationFrame(frame);
})(globalThis);
