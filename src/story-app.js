/* VEILPOINT CH01 first-person browser integration; separate from offline BR.
 * Story state and checkpoint logic live in story-slice.js.
 */
(function (global) {
  'use strict';
  const $=id=>document.getElementById(id);
  const Story=global.VeilpointStorySlice;
  const Navigation=global.VeilpointNavigation;
  const Pedestrian=global.VeilpointStoryPedestrianGuidance;
  const Graphics=global.VeilpointGraphics;
  const Sim=global.VeilpointSim;
  const Audio=global.VeilpointStoryAudio;
  const Ambient=global.VeilpointStoryHarborAmbience;
  const Footfalls=global.VeilpointStoryFootfall;
  const Comms=global.VeilpointStoryComms;
  const PublicCourt=global.VeilpointStoryPublicCourt;
  const Desktop=global.VeilpointDesktopControls;
  const SAVE_KEY='veilpoint.story.ch01';
  const BACKUP_KEY='veilpoint.story.ch01.previous';
  const PREVIEW_KEY='veilpoint.story.ch01PreviewCompleted';
  const canvas=$('scene'),menu=$('menu'),choices=$('choices'),quality=$('quality');
  const clock=global.VeilpointClock.createClock({hz:60,maxFrameSeconds:.25,maxSteps:8});
  const limiter=global.VeilpointFPS.createFrameLimiter(60);
  const input={forward:false,back:false,left:false,right:false,sprint:false,crouch:false,fireHeld:false};
  global.VeilpointInput=input;
  let stillRequested=false;
  let state=Story.createState(),renderer=null,running=false,graphicsContextLost=false,last=performance.now(),lastHud=0;
  // G is reserved by the PC input binder. It focuses the existing story
  // settings inside the pause menu without permitting any 60Hz world step.
  let graphicsMenuFocused=false;
  // A GPU reset can interrupt a paused route-choice dialog without resetting the mission.
  let restoreRouteDialogAfterGraphics=false;
  let restoreJournalAfterGraphics=false;
  let checkpoint=null,saveFailed=false,sessionStarted=false,recoveredFromBackup=false;
  // Rewinding to an older world discards new unsaved progress. Require a
  // deliberate second action for the EXACT validated backup generation.
  let previousRestoreArmed=null;
  function cancelPreviousRestore(){
    previousRestoreArmed=null;
    $('restorePrevious').textContent='이전 체크포인트 복구';
  }
  // Primary generation last observed by this PC session. An older browser tab
  // cannot silently overwrite a newer save created by another live tab.
  let diskGeneration=null;
  // An explicitly replayed completion retires its old debrief only after the
  // new first checkpoint reaches disk, including after transient write errors.
  let pendingReplayReset=false;
  // N cycles only already-published mission markers; it never reveals hidden actors.
  let guidanceId=null;
  // Checkpoint quiet movement and elapsed route progress without writing at 60Hz.
  const AUTOSAVE_SECONDS=5;
  // Keep CH01 automatic volleys from synchronously serializing the whole
  // mission on every fixed-step shot. Pausing and phase changes still flush.
  // Story preview uses a shorter checkpoint window than BR to bound progress loss.
  const SHOT_SAVE_INTERVAL_SECONDS=0.45;
  let lastAutosaveAt=0,shotSavePending=false,nextSaveRetryAt=0;
  // Persist the first actual shot immediately; later held shots use the 450ms queue.
  let firstShotSaved=false;
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
  // A transient read error is not evidence of corrupted checkpoint data.
  // Preserve both generations and allow a non-persisting offline session.
  let checkpointReadUnavailable=false,checkpointInvalidStored=false,memoryOnlyStory=false;
  function readCheckpoint(){
    let primary=null,backup=null;
    try{
      primary=global.localStorage.getItem(SAVE_KEY);
      backup=global.localStorage.getItem(BACKUP_KEY);
    }catch(_){checkpointReadUnavailable=true;checkpointInvalidStored=false;return null;}
    checkpointReadUnavailable=false;
    checkpointInvalidStored=false;
    recoveredFromBackup=false;
    try{
      const recovered=global.VeilpointCheckpointRecovery.recover(primary,backup,Story.recoverCheckpoint);
      if(!recovered){
        // Never overwrite unreadable saved generations through an implicit Continue.
        // Only an explicit New Game action may discard them.
        checkpointInvalidStored=primary!==null||backup!==null;
        return null;
      }
      if(recovered.source==='backup'){
        recoveredFromBackup=true;
        // Recovery must not replace a checkpoint another tab wrote while the
        // primary/backup pair was being validated. Failed recovery writes also
        // must not turn an unreadable primary into permission to autosave.
        let currentPrimary,currentBackup;
        try{
          currentPrimary=global.localStorage.getItem(SAVE_KEY);
          currentBackup=global.localStorage.getItem(BACKUP_KEY);
        }catch(_){checkpointReadUnavailable=true;return recovered.state;}
        if(currentPrimary!==primary){
          // A different tab committed a newer generation during recovery.
          // Resume that generation only after full world validation.
          try{
            const latest=Story.restore(currentPrimary);
            recoveredFromBackup=false;
            return latest;
          }catch(_){
            checkpointInvalidStored=true;
            return recovered.state;
          }
        }
        if(currentBackup!==backup){
          // A backup is also a mutable generation. Never promote stale backup
          // bytes; newer validated data is playable without disk writes.
          checkpointInvalidStored=true;
          try{return Story.restore(currentBackup);}
          catch(_){return recovered.state;}
        }
        if(!storage.set(SAVE_KEY,backup)){
          checkpointInvalidStored=true;
          return recovered.state;
        }
        // A storage shim or extension may acknowledge a write and silently
        // discard/replace it. The recovered world is only durable after the
        // EXACT v2 backup bytes survive a fresh read, and the backup has not
        // been rotated by a second tab during promotion. A failed verification
        // must never turn an invalid primary into permission to autosave.
        try{
          if(global.localStorage.getItem(SAVE_KEY)!==backup||
             global.localStorage.getItem(BACKUP_KEY)!==backup){
            checkpointInvalidStored=true;
            return recovered.state;
          }
        }catch(_){
          checkpointReadUnavailable=true;
          return recovered.state;
        }
      }
      return recovered.state;
    }catch(_){
      // Preserve both slots for manual recovery: never destroy data on parse failure.
      checkpointInvalidStored=primary!==null||backup!==null;
      return null;
    }
  }
  $('saveStatus').classList.add('hidden');
  function persist(reason=''){
    // A malformed in-memory state must not crash the PC frame loop or erase a
    // playable disk checkpoint. Do not touch either persisted generation until
    // the entire v2 snapshot has passed the story validator.
    let raw;
    try{raw=Story.serialize(state);}
    catch(_){
      saveFailed=true;
      nextSaveRetryAt=(Number.isFinite(state?.world?.elapsed)?state.world.elapsed:0)+1;
      const notice=$('saveStatus');
      notice.textContent='체크포인트 저장 검증 실패 · 기존 기록은 변경하지 않았습니다. 현재 탭의 진행 상태를 확인하세요.';
      notice.classList.remove('hidden');
      return false;
    }
    if(memoryOnlyStory){
      // Do not overwrite a previous disk mission if browser permissions
      // return while this independent, temporary mission is in progress.
      checkpoint=raw;
      lastAutosaveAt=state.world.elapsed;
      nextSaveRetryAt=0;
      shotSavePending=false;
      saveFailed=true;
      const notice=$('saveStatus');
      notice.textContent='저장 실패 · 임시 CH01 세션: 현재 진행은 이 탭에서만 보존됩니다. 기존 저장 기록은 변경하지 않았습니다.';
      notice.classList.remove('hidden');
      return false;
    }
    // Refuse an implicit overwrite when the previously saved generation
    // cannot be read or validated. A transient browser permission or quota
    // failure must not destroy the only known playable checkpoint.
    const protectDisk=(detail)=>{
      checkpoint=raw;
      saveFailed=true;
      nextSaveRetryAt=state.world.elapsed+1;
      const notice=$('saveStatus');
      notice.textContent='체크포인트 저장 보류 · '+detail+' · 이전 기록은 보존했습니다.';
      notice.classList.remove('hidden');
      return false;
    };
    let previous;
    try{previous=global.localStorage.getItem(SAVE_KEY);}
    catch(_){return protectDisk('기존 저장 기록 읽기 불가');}
    if(previous!==diskGeneration)
      return protectDisk('다른 창에서 체크포인트 변경 감지');
    // Always validate a previously stored generation before replacing it.
    // A rejected primary or failed backup rotation is not permission to
    // discard the saved file. The player can continue in this live tab.
    if(previous&&previous!==raw){
      let priorState;
      try{priorState=Story.restore(previous);}
      catch(_){return protectDisk('기존 저장 기록 복구 필요');}
      if(priorState.phase!=='failed'&&priorState.phase!=='complete'){
        if(!storage.set(BACKUP_KEY,previous))
          return protectDisk('이전 체크포인트 백업 실패');
        // A storage extension may acknowledge the backup write but silently
        // discard or replace it. Never overwrite the last validated primary
        // until the exact old world survives in the backup slot.
        try{
          if(global.localStorage.getItem(BACKUP_KEY)!==previous)
            return protectDisk('이전 체크포인트 백업 검증 실패');
        }catch(_){return protectDisk('이전 체크포인트 백업 읽기 실패');}
      }
    }
    // A different tab can update the primary while this tab rotates backup.
    // This is best-effort protection, not an atomic cross-tab transaction.
    try{
      if(global.localStorage.getItem(SAVE_KEY)!==previous)
        return protectDisk('다른 창에서 체크포인트 변경 감지');
    }catch(_){return protectDisk('기존 저장 기록 재확인 실패');}
    const wrote=storage.set(SAVE_KEY,raw);
    // A browser extension or storage shim can acknowledge setItem but discard
    // or replace the bytes. The checkpoint is durable only if the exact world
    // generation survives an immediate readback. This does not claim to be
    // atomic with respect to an external tab after the final read.
    let saved=false;
    if(wrote){
      try{saved=global.localStorage.getItem(SAVE_KEY)===raw;}
      catch(_){saved=false;}
    }
    // A failed browser write is not a checkpoint. Keep the last successful
    // autosave boundary so the next live frame retries instead of silently
    // postponing recovery for another five simulated seconds.
    if(saved){
      diskGeneration=raw;
      if(pendingReplayReset){
        storage.remove(PREVIEW_KEY);
        storage.remove(BACKUP_KEY);
        pendingReplayReset=false;
      }
      lastAutosaveAt=state.world.elapsed;
      nextSaveRetryAt=0;
      shotSavePending=false;
    }else{
      // A denied/quota-limited storage slot must not be hammered at 60Hz.
      // Retry once per simulated second while the game remains active.
      nextSaveRetryAt=state.world.elapsed+1;
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
    if((state.phase!=='engagement'||!firstShotSaved||
        state.world.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS)&&
       state.world.elapsed>=nextSaveRetryAt){
      firstShotSaved=true;
      // A failed first shot write must remain dirty until an actual successful
      // checkpoint, even if the user releases the trigger immediately.
      // The 60Hz flush respects the existing one-second storage backoff.
      if(!persist()&&!memoryOnlyStory)shotSavePending=true;
    }else if(!memoryOnlyStory)shotSavePending=true;
  }
  function recordCompletion(){
    // A bounded, evidence-based CH01 handoff, not a completed 50-minute M01.
    // This separate preview key must never unlock competitive or campaign content.
    const report=Story.debrief(state);
    // A debrief summary must not claim to be the newest persisted result
    // if the corresponding completed checkpoint never reached disk.
    // Revalidate the exact durable CH01 generation, not stale UI memory.
    if(report&&!memoryOnlyStory&&!saveFailed&&
       storage.get(SAVE_KEY)===Story.serialize(state))
      storage.set(PREVIEW_KEY,JSON.stringify(report));
    return report;
  }
  const audio=Audio.create({AudioContextClass:global.AudioContext||global.webkitAudioContext,
    enabled:storage.get('veilpoint.story.audio')!=='off'});
  const ambience=Ambient?.create({AudioContextClass:global.AudioContext||global.webkitAudioContext})||null;
  const footfalls=Footfalls?.create({AudioContextClass:global.AudioContext||global.webkitAudioContext})||null;
  const AudioPrefs=global.VeilpointAudioPreferences;
  // Preserve an explicit old mute preference on the first upgrade.
  if(AudioPrefs&&!storage.get(AudioPrefs.KEY)&&storage.get('veilpoint.story.audio')==='off')
    AudioPrefs.persist(desktopStorage,{...AudioPrefs.DEFAULT,enabled:false});
  const audioControls=AudioPrefs?.attach(document,desktopStorage,prefs=>{
    audio.setEnabled(prefs.enabled);
    audio.setVolume(AudioPrefs.gain(prefs,'effects'));
    ambience?.setVolume(AudioPrefs.gain(prefs,'ambience'));
    footfalls?.setVolume(AudioPrefs.gain(prefs,'effects'));
    if(!prefs.enabled){ambience?.disable();footfalls?.disable();}
    $('soundEnabled').checked=prefs.enabled;
    storage.set('veilpoint.story.audio',prefs.enabled?'on':'off');
  })||null;
  $('soundEnabled').checked=audio.enabled();
  $('soundEnabled').addEventListener('change',()=>{
    if(audioControls)audioControls.set({...audioControls.get(),enabled:$('soundEnabled').checked});
    else{
      audio.setEnabled($('soundEnabled').checked);
      if(!audio.enabled()){ambience?.disable();footfalls?.disable();}
      else if(ambience?.enable())ambience.update(state,running);
      storage.set('veilpoint.story.audio',audio.enabled()?'on':'off');
    }
  });
  // No continuous sound is permitted before a DIRECT player gesture.
  // Mouse/keyboard unlocks only the optional sound graph, never game input.
  function unlockHarborAmbience(){
    // Audio starts only after an actual mouse/key gesture. This enables the
    // original atmosphere and the new character's local movement sounds;
    // neither feature unmutes a previously disabled player preference.
    if(!audio.enabled())return;
    if(ambience&&!ambience.enabled()&&ambience.enable())
      ambience.update(state,canAct());
    if(footfalls&&!footfalls.enabled())footfalls.enable();
  }
  document.addEventListener('pointerdown',unlockHarborAmbience,true);
  document.addEventListener('keydown',event=>{
    if(!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey)
      unlockHarborAmbience();
  },true);
  const Camera=global.VeilpointCameraView||Object.freeze({
   read:()=>55,validate:value=>{
    if(![48,55,63,70,78].includes(value))throw new RangeError('Invalid camera FOV');
    return value;
   },persist:()=>false
  });
  const cameraSelect=$('storyCameraFov');
  const cameraStorage=()=>{try{return global.localStorage;}catch(_){return null;}};
  let cameraFov=Camera.read(cameraStorage());
  cameraSelect.value=String(cameraFov);
  cameraSelect.addEventListener('change',()=>{
    try{
      cameraFov=Camera.validate(Number(cameraSelect.value));
      if(renderer&&typeof renderer.setFieldOfView==='function')renderer.setFieldOfView(cameraFov);
      if(!Camera.persist(cameraStorage(),cameraFov))
        cameraSelect.title='현재 화면에만 적용 · 설정 저장 실패';
      else cameraSelect.title='BR과 CH01에 공유되는 시야각';
    }catch(_){cameraSelect.value=String(cameraFov);}
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
    if(typeof renderer.setFieldOfView==='function')renderer.setFieldOfView(cameraFov);
  }
  try{initializeRenderer();}
  catch(err){
    renderer=null;$('menuText').textContent='3D 렌더러를 초기화할 수 없습니다: '+String(err.message);
    $('continue').disabled=true;$('newGame').disabled=true;
  }
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    // If an accessible route decision was open, the generic pause menu must
    // not permanently erase it (including an exit-route reconsideration).
    restoreRouteDialogAfterGraphics=restoreRouteDialogAfterGraphics||
      !choices.classList.contains('hidden');
    restoreJournalAfterGraphics=restoreJournalAfterGraphics||
      !($('fieldJournal').classList.contains('hidden'));
    // GPU reset invalidates rendering, not the already-paused records dialogue.
    graphicsContextLost=true;
    menuOpen('그래픽 장치 연결이 끊어졌습니다. 복구될 때까지 CH01 진행이 중단됩니다.');
    renderer=null;$('continue').disabled=true;$('newGame').disabled=true;
    // Disabling the focused Continue control after a GPU loss can strand
    // Windows keyboard users on <body>. Keep focus inside the usable pause
    // menu while no rendering or 60Hz simulation can resume.
    if(!menu.classList.contains('hidden')&&typeof $('storyMenuMore').focus==='function')
      $('storyMenuMore').focus({preventScroll:true});
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    if(!graphicsContextLost)return;
    try{
      initializeRenderer();graphicsContextLost=false;
      $('continue').disabled=false;$('newGame').disabled=false;
      clearInput();clock.reset();limiter.reset();last=performance.now();
      if(restoreRouteDialogAfterGraphics&&
         (state.phase==='decision'||state.phase==='exit')){
        restoreRouteDialogAfterGraphics=false;
        restoreJournalAfterGraphics=false;
        showChoices(); // The visible decision regains PC keyboard focus.
      }else if(restoreJournalAfterGraphics){
        restoreRouteDialogAfterGraphics=false;
        restoreJournalAfterGraphics=false;
        renderFieldJournal(); // Rebuild factual rows and return to the close control.
      }else{
        restoreRouteDialogAfterGraphics=false;
        $('menuText').textContent='그래픽 장치가 복구되었습니다. 이어하기를 눌러 현재 체크포인트부터 재개하세요.';
        // A real GPU rebuild re-enables Continue but does not by itself
        // restore keyboard focus removed when it was disabled.
        if(!menu.classList.contains('hidden')&&typeof $('continue').focus==='function')
          $('continue').focus({preventScroll:true});
      }
    }catch(err){
      renderer=null;
      $('menuText').textContent='그래픽 복구 실패 · 새로고침이 필요합니다: '+String(err.message);
    }
  });
  // A fixed-size PC ending dialog uses an existing button to move through
  // the four verified, route-specific character lines. This is not a second
  // quest, a timed auto-scroll, or a new screen that overflows 1024x600.
  let closingSceneIndex=0;
  function closingSceneText(report,index){
    const scene=report.closingScene;
    return 'CH01 완료 · '+(report.route==='evacuation'?'남쪽 대피':'동쪽 통로')+
      ' · 현장 후속 대화 '+(index+1)+'/'+scene.lines.length+' — '+
      scene.lines[index]+(index===scene.lines.length-1?' '+scene.nextChapter:'');
  }
  const storyMenuViews=['tools','settings','audio','im'+'port','about'];
  function setStoryMenuView(view='main',focus=false){
    for(const name of storyMenuViews)
      menu.classList.toggle('menu-view-'+name,view===name);
    if(focus&&!menu.classList.contains('hidden')){
      const first={main:'continue',tools:'storyMenuBack',settings:'quality',audio:'vpAudioEnabled',
        import:'checkpointTransferText',about:'storyMenuBack'}[view];
      if(first&&typeof $(first).focus==='function')
        $(first).focus({preventScroll:true});
    }
  }
  // A visible PC menu is a modal interaction boundary. Tab never advances
  // gameplay or a hidden menu page; no additional 60Hz step is generated.
  function containStoryMenuFocus(event){
    if(menu.classList.contains('hidden')||!choices.classList.contains('hidden')||
       !$('fieldJournal').classList.contains('hidden')||
       !global.getComputedStyle||typeof menu.querySelectorAll!=='function')return;
    const nodes=[...menu.querySelectorAll('button,select,input,textarea,a[href]')]
      .filter(node=>!node.disabled&&node.tabIndex>=0&&
        node.getClientRects().length>0&&
        global.getComputedStyle(node).visibility!=='hidden'&&
        global.getComputedStyle(node).display!=='none');
    if(!nodes.length)return;
    if(event.type==='focusin'){
      // Old screen controls may still be descendants of the pause menu but
      // are disabled or clipped when a different page is active.
      if(!nodes.some(node=>node===event.target||
         (typeof node.contains==='function'&&node.contains(event.target))))
        nodes[0].focus({preventScroll:true});
      return;
    }
    if(event.key!=='Tab')return;
    const index=nodes.indexOf(document.activeElement);
    if(index<0||(event.shiftKey?index===0:index===nodes.length-1)){
      event.preventDefault();
      nodes[event.shiftKey?nodes.length-1:0].focus({preventScroll:true});
    }
  }
  document.addEventListener('keydown',containStoryMenuFocus,true);
  document.addEventListener('focusin',containStoryMenuFocus,true);
  $('storyMenuMore').addEventListener('click',()=>setStoryMenuView('tools',true));
  // Menu-only harnesses predate the optional sound page.
  if($('storyAudioOpen'))$('storyAudioOpen').addEventListener('click',()=>setStoryMenuView('audio',true));
  $('storyMenuAbout').addEventListener('click',()=>{
    // The About page also runs in isolated PC-menu harnesses that do not
    // instantiate a story world. Retain the ordinary About action there.
    if(typeof state!=='undefined'&&state?.phase==='complete'){
      const report=Story.debrief(state);
      if(report&&closingSceneIndex+1<report.closingScene.lines.length){
        closingSceneIndex++;
        $('menuText').textContent=closingSceneText(report,closingSceneIndex)+
          (saveFailed?' · 완료 기록은 저장되지 않았습니다.':'');
        $('storyMenuAbout').textContent=closingSceneIndex===report.closingScene.lines.length-1
          ?'CH01 설명 전체 보기':'다음 대화 ('+(closingSceneIndex+2)+'/'+report.closingScene.lines.length+')';
        return;
      }
    }
    setStoryMenuView('about',true);
  });
  $('storyMenuBack').addEventListener('click',()=>{
    if(menu.classList.contains('hidden'))return;
    if(menu.classList.contains('menu-view-im'+'port')){
      checkpointFileRequest++;portableImportArmed=null;
      $('checkpointTransferPanel').classList.add('hidden');
      $('checkpointTransferText').value='';$('checkpointFile').value='';
    }
    graphicsMenuFocused=false;
    setStoryMenuView('main',true);
  });
  function menuOpen(text){
    graphicsMenuFocused=false;
    cancelPreviousRestore();
    // Pausing after a choice or during clearance must not roll back elapsed world state.
    if(running&&state.phase!=='complete'&&state.phase!=='failed')persist();
    running=false;lockAttempt++;pointerLockPendingSince=null;aimLockObserved=false;
    desktopUi.cancel();clearInput();touchLookId=null;previous=null;clock.reset();limiter.reset();
    if(saveFailed)text=(text||'일시정지')+' · 저장 실패: 새로고침하면 현재 진행 상황이 사라질 수 있습니다.';
    if(text)$('menuText').textContent=text;
    if(state.phase!=='complete'){
      closingSceneIndex=0;
      $('storyMenuAbout').textContent='CH01 설명 전체 보기';
    }
    setStoryMenuView('main');
    menu.classList.remove('hidden');choices.classList.add('hidden');
    $('fieldJournal').classList.add('hidden');
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    const completed=state.phase==='complete'||state.phase==='failed';
    $('continue').textContent=state.phase==='failed'?'마지막 체크포인트 재시도':
      state.phase==='complete'?'미션 다시 플레이':'이어하기';
    $('saveExit').classList.toggle('hidden',!sessionStarted||completed);
    $('saveCheckpoint').classList.toggle('hidden',!sessionStarted||completed);
    $('restorePrevious').classList.toggle('hidden',!sessionStarted||completed);
    $('checkpointExport').classList.toggle('hidden',!sessionStarted||completed);
    // Do not leave a previous portable snapshot or an untrusted paste visible
    // when a new pause/menu session begins.
    checkpointFileRequest++;
    portableImportArmed=null;
    $('checkpointTransferPanel').classList.add('hidden');
    $('checkpointTransferText').value='';
    $('checkpointFile').value='';
    $('checkpointDownload').classList.add('hidden');
    // PC keyboard users must not remain focused on the now-hidden game canvas.
    // The dialog's primary action is the safe focus target after an Esc pause.
    if(!$('continue').disabled)$('continue').focus();
  }
  function openStoryGraphicsSettings(){
    // Route choices and field journal own their dialogs; a settings shortcut
    // must never bypass the current decision or restore active gameplay.
    if(!choices.classList.contains('hidden')||
       !$('fieldJournal').classList.contains('hidden'))return;
    if(running)menuOpen('그래픽·PC 설정 · 메뉴에서 조정한 뒤 이어하기를 눌러 미션을 재개하세요.');
    if(menu.classList.contains('hidden'))return;
    graphicsMenuFocused=true;
    setStoryMenuView('settings',true);
    if(typeof $('quality').focus==='function')$('quality').focus();
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
    graphicsMenuFocused=false;
    cancelPreviousRestore();
    if(!renderer||graphicsContextLost)return;
    if(state.phase==='failed'){
      // Death is not a checkpoint. Retry the latest *alive* fixed-step state,
      // preserving finite rounds, injury, actor positions and the mission phase.
      let recovered=null;
      // Retry the latest verified disk generation first, then fall back to the
      // live session checkpoint and the older backup if necessary. Only an
      // explicitly chosen valid primary can become this tab's expected disk
      // generation. Future concurrent writes are still rejected by persist().
      const candidates=[
        {raw:storage.get(SAVE_KEY),primary:true},
        {raw:checkpoint,primary:false},
        {raw:storage.get(BACKUP_KEY),primary:false,backup:true}
      ];
      for(const entry of candidates){
        if(!entry.raw)continue;
        try{
          const candidate=Story.restore(entry.raw);
          if(candidate.phase==='failed'||candidate.phase==='complete')continue;
          if(entry.primary){
            // A second tab may replace the primary during validation. Adopt
            // only the exact generation still present, never stale bytes.
            if(storage.get(SAVE_KEY)!==entry.raw)continue;
            diskGeneration=entry.raw;
            checkpoint=entry.raw;
          }else if(entry.backup){
            // A different Windows tab can rotate the previous generation
            // while this session validates it. Never adopt a backup that
            // disappeared or changed between read and restore.
            if(storage.get(BACKUP_KEY)!==entry.raw)continue;
          }
          recovered=candidate;
          break;
        }catch(_){} // Corrupt/unavailable slots are never deleted by retry.
      }
      state=recovered||Story.createState($('storyWeapon').value);
      $('storyWeapon').value=state.world.player.weaponId;
      guidanceId=null;shotSavePending=false;firstShotSaved=false;
      lastAutosaveAt=state.world.elapsed;
      // A retry can select an older verified backup or create a fresh state
      // when the last live mission failed. Commit that playable state before
      // returning keyboard/mouse control, instead of leaving a terminal
      // generation on disk until the next five-second autosave window.
      // persist() protects newer tabs and rejects damaged disk generations.
      persist('CH01 재시도 시작');
    }else if(state.phase==='complete'){
      // The replay button starts a new real CH01 session, not a temporary HUD
      // reset above a completed checkpoint. Commit the fresh 60Hz world before
      // allowing movement so a reload cannot reopen the previous finale.
      // Only retire the old debrief/backup after this new generation is durable.
      state=Story.createState($('storyWeapon').value);
      guidanceId=null;shotSavePending=false;firstShotSaved=false;
      lastAutosaveAt=state.world.elapsed;
      pendingReplayReset=true;
      persist('새 CH01 시작');
    }
    if(state.phase==='decision'){showChoices();return;}
    menu.classList.add('hidden');choices.classList.add('hidden');
    running=true;desktopUi.cancel();clock.reset();limiter.reset();last=performance.now();clearInput();
    Desktop.focusGameplay(document,canvas);
    requestAimLock();
    updateHud();
  }
  function begin(fromCheckpoint){
    cancelPreviousRestore();
    if(!renderer||graphicsContextLost)return;
    pendingReplayReset=false;
    let replayCompleted=false,staleReset=false;
    if(fromCheckpoint){
      const loaded=readCheckpoint();
      memoryOnlyStory=checkpointReadUnavailable||checkpointInvalidStored;
      state=loaded&&loaded.phase!=='complete'?loaded:Story.createState($('storyWeapon').value);
      // After a browser refresh, "Replay" is an explicit restart but must not
      // erase the finished mission until the new playable checkpoint is durable.
      // The old generation remains the expected disk generation for persist().
      replayCompleted=!memoryOnlyStory&&!!loaded&&loaded.phase==='complete';
      diskGeneration=memoryOnlyStory?null:storage.get(SAVE_KEY);
      checkpoint=diskGeneration;
    }else{
      // New Game is explicitly allowed to reset old progress, but an
      // inaccessible/ignored storage deletion must never strand the player
      // in a session that silently overwrites another valid checkpoint.
      // Clear backup first; if that fails, keep the primary untouched so
      // the old save can still be resumed after this temporary session.
      state=Story.createState($('storyWeapon').value);
      let resetVerified=false,observedPrimary=diskGeneration,originalBackup=null;
      // Keep the old backup recoverable if any storage read/delete throws
      // after clearing it. A newer checkpoint from another PC tab always wins.
      const restoreResetBackup=()=>{
        if(originalBackup===null)return;
        try{
          if(global.localStorage.getItem(BACKUP_KEY)!==null)return;
          if(!storage.set(BACKUP_KEY,originalBackup))return false;
          return global.localStorage.getItem(BACKUP_KEY)===originalBackup;
        }catch(_){}
      };
      try{
        // Protect a *newer valid* save written by another PC tab. Explicit
        // New Game must still be able to discard an already-corrupt checkpoint
        // or intentionally restart after an external deletion, as before.
        const latest=global.localStorage.getItem(SAVE_KEY);
        observedPrimary=latest;
        originalBackup=global.localStorage.getItem(BACKUP_KEY);
        if(latest!==diskGeneration&&latest!==null){
          try{Story.restore(latest);staleReset=true;}
          catch(_){} // An invalid primary can be explicitly reset by New Game.
        }
        if(!staleReset){
          storage.remove(BACKUP_KEY);
          if(global.localStorage.getItem(BACKUP_KEY)===null){
            // Recheck the observed primary after backup rotation. An external
            // tab may have saved new progress while the reset was underway.
            if(global.localStorage.getItem(SAVE_KEY)===latest)
              storage.remove(SAVE_KEY);
            else staleReset=true;
          }
          resetVerified=!staleReset&&
            global.localStorage.getItem(SAVE_KEY)===null&&
            global.localStorage.getItem(BACKUP_KEY)===null;
          if(!resetVerified)restoreResetBackup();
          if(resetVerified)storage.remove(PREVIEW_KEY);
        }
      }catch(_){
        resetVerified=false;
        // A transient SecurityError after backup deletion must not destroy
        // both generations or silently permit a durable new-game session.
        restoreResetBackup();
      }
      memoryOnlyStory=!resetVerified;
      checkpointInvalidStored=false;
      // A denied reset can be retried after storage permissions recover. Keep
      // the generation just verified by the old tab until the reset succeeds.
      // Never adopt a conflicting live generation from a different tab.
      if(resetVerified)diskGeneration=null;
      else if(!staleReset)diskGeneration=observedPrimary;
      checkpoint=null;
      recoveredFromBackup=false;
    }
    $('reviewCompleted').classList.add('hidden');
    $('debriefReview').classList.add('hidden');
    $('storyWeapon').value=state.world.player.weaponId;
    sessionStarted=true;guidanceId=null;
    lastAutosaveAt=state.world.elapsed;
    shotSavePending=false;firstShotSaved=false;
    saveFailed=memoryOnlyStory;
    $('saveStatus').textContent=memoryOnlyStory
      ?(staleReset
        ?'다른 창의 최신 CH01 체크포인트 보호 중 · 임시 세션으로 진행하며 자동 저장은 비활성화됩니다.'
        :'임시 CH01 세션 · 기존 진행 기록 보호 중 · 자동 저장 비활성화'):'';
    $('saveStatus').classList.toggle('hidden',!memoryOnlyStory);
    if(replayCompleted){
      pendingReplayReset=true;
      persist('새 CH01 시작');
    }
    resume();
  }
  // The choice screen is a real PC dialog: Tab must not reach a button on
  // the hidden pause menu or the game canvas while a mission decision is open.
  function routeDialogControls(){
    return ['choiceEvac','choiceVerified','choiceBack'].map($)
      .filter(node=>node&&!node.disabled&&
        (typeof node.getClientRects!=='function'||node.getClientRects().length>0));
  }
  function containRouteDialogFocus(event){
    if(choices.classList.contains('hidden'))return;
    // Only usable, visible route actions can own focus. A disabled route can
    // remain in the DOM but must never become a keyboard destination.
    const controls=routeDialogControls();
    if(!controls.length)return;
    if(event.type==='focusin'){
      if(controls.some(node=>node===event.target||
         (typeof node.contains==='function'&&node.contains(event.target))))return;
      controls[0].focus({preventScroll:true});
      return;
    }
    // Keep browser/OS command chords intact; the dialog is paused game UI.
    if(event.ctrlKey||event.altKey||event.metaKey)return;
    const forward=event.key==='ArrowRight'||event.key==='ArrowDown';
    const backward=event.key==='ArrowLeft'||event.key==='ArrowUp';
    if(forward||backward){
      event.preventDefault();
      const current=controls.indexOf(document.activeElement);
      const next=current<0?(backward?controls.length-1:0):
        (current+(forward?1:-1)+controls.length)%controls.length;
      controls[next].focus({preventScroll:true});
      return;
    }
    if(event.key!=='Tab')return;
    const current=controls.indexOf(document.activeElement);
    if(current<0||(event.shiftKey?current===0:current===controls.length-1)){
      event.preventDefault();
      controls[event.shiftKey?controls.length-1:0].focus({preventScroll:true});
    }
  }
  document.addEventListener('keydown',containRouteDialogFocus,true);
  document.addEventListener('focusin',containRouteDialogFocus,true);
  function showChoices(){
    running=false;lockAttempt++;clearInput();clock.reset();
    choices.classList.remove('hidden');menu.classList.add('hidden');
    // East passage requires local physical clearance, not two mandatory
    // document pickups. Reconsideration is still guarded by Story.choose.
    $('choiceVerified').disabled=false;
    const revisiting=state.phase==='exit';
    $('choiceBack').textContent=revisiting?'취소 · 기존 경로 유지':'돌아가서 조사';
    $('choiceHint').textContent=revisiting
      ?'현재 '+(state.choice==='verification'?'동쪽 확인 경로':'남쪽 대피 경로')+' · '+(state.choice==='verification'&&!Story.situation(state).eastGateOpen?'통제문 개방까지 약 '+Math.ceil(Story.situation(state).eastGateRemainingSeconds)+'초 · ':'')+'현장 콘솔에서 변경할 수 있습니다. 취소하면 현재 경로와 진행 상태를 유지합니다.'
      :'남쪽 구조단 대피 지원과 동쪽 통로 현장 확인 모두 선택할 수 있습니다. 실제 통제문 개방에는 시간이 필요하며 기록 검토는 선택 사항입니다.';
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    // Keyboard focus belongs to the visible decision dialog, not the hidden
    // movement canvas. Number shortcuts still work while a choice has focus.
    $('choiceEvac').focus();
    updateHud();
  }
  function decide(option){
    const result=Story.choose(state,option);
    if(!result.ok){$('choiceHint').textContent='경로를 변경할 수 없습니다. 현장 콘솔 접근과 진행 상태를 확인하세요.';return;}
    guidanceId=null;persist();resume();
  }
  // One completion presentation is shared by E and genuine on-foot arrival.
  // Never claim the preview was durably completed before the save read-back.
  function presentCompletion(){
    const report=recordCompletion();
    closingSceneIndex=0;
    menuOpen(report?closingSceneText(report,0)+
      (saveFailed?' 완료 기록은 저장되지 않았습니다. 이 탭을 닫으면 이전 체크포인트로 돌아갈 수 있습니다.':''):
      'CH01 완료 — '+state.subtitle);
    $('storyMenuAbout').textContent=report?'다음 대화 (2/'+report.closingScene.lines.length+')':
      'CH01 설명 전체 보기';
  }
  function interact(){
    if(!canAct()||state.phase==='complete')return;
    const result=Story.interact(state);
    if(!result.ok){
      // A physically blocked cargo exit changes the mission subtitle/message
      // even though it must not save a false completion or play a success cue.
      if(['cargo_handoff_required','guide_not_arrived','guide_not_at_muster','awaiting_clearance'].includes(result.reason))updateHud();
      return;
    }
    guidanceId=null;
    audio.play(state.phase==='complete'?'complete':'interact');
    persist();
    if(state.phase==='decision'||result.event==='reconsider'){showChoices();return;}
    if(state.phase==='complete')presentCompletion();
    updateHud();
  }
  function fire(){
    if(!canAct())return;
    const result=Story.fire(state,input.crouch);
    if(result.ok){audio.play('shot');persistShot();updateHud();}
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
  $('saveCheckpoint').addEventListener('click',()=>{
    cancelPreviousRestore();
    // A manual retry is safe even when automatic saves were suppressed by
    // temporary quota/permission errors. Never switch save generations, grant
    // resources, advance the 60Hz clock or leave the current game.
    if(!sessionStarted||menu.classList.contains('hidden')||
       !choices.classList.contains('hidden')||
       state.phase==='complete'||state.phase==='failed')return;
    if(!persist('수동 체크포인트 저장')){
      $('menuText').textContent='체크포인트 저장 실패 · 다른 창의 최신 기록이나 브라우저 저장 공간을 확인하세요. 현재 진행은 이 탭에 유지됩니다.';
      return;
    }
    let verified=false;
    try{verified=global.localStorage.getItem(SAVE_KEY)===Story.serialize(state);}
    catch(_){}
    $('menuText').textContent=verified
      ?'체크포인트 저장 확인 완료 · 이어하기로 현재 위치부터 계속하거나 모드 선택으로 나갈 수 있습니다.'
      :'체크포인트 재확인 실패 · 현재 진행을 유지하고 메뉴 이동을 보류하세요.';
  });
  // Restore the PREVIOUS verified checkpoint on an explicit PC pause-menu
  // action. Pausing automatically writes the current checkpoint; the rotated
  // backup is the last safe recovery point if a route becomes unplayable.
  // Never roll back another tab's newer primary, or grant an unverified world.
  // Portable CH01 snapshots allow offline backup when Windows browser/file
  // origins differ. Export never reads or overwrites another tab's disk slot.
  // Imports are always schema-validated. If any existing generation is present
  // or storage cannot be read, the candidateState world stays memory-only.
  // A pending file read can finish after Escape/Continue or a transfer-menu reset.
  // Only the current explicitly open input session may receive its text.
  let checkpointFileRequest=0;
  // Replacing an already-running CH01 world is deliberately two-step. The
  // confirmation is tied to the exact validated snapshot, not only a button.
  let portableImportArmed=null;
  $('checkpointExport').addEventListener('click',()=>{
    if(!sessionStarted||running||menu.classList.contains('hidden')||
       !choices.classList.contains('hidden')||
       state.phase==='complete'||state.phase==='failed')return;
    let raw;
    try{raw=Story.serialize(state);}
    catch(_){
      $('menuText').textContent='체크포인트 백업 실패 · 현재 진행 상태를 검증할 수 없습니다.';
      return;
    }
    const panel=$('checkpointTransferPanel'),field=$('checkpointTransferText');
    checkpointFileRequest++;
    portableImportArmed=null;
    $('checkpointFile').value='';
    field.value=raw;field.readOnly=true;
    panel.classList.remove('hidden');
    setStoryMenuView('im'+'port',true);
    $('checkpointDownload').classList.remove('hidden');
    $('checkpointApply').classList.add('hidden');
    $('checkpointTransferStatus').textContent='현재 탭의 검증된 CH01 JSON입니다. 전체 선택해 별도 텍스트 파일에 보관하세요. 기존 저장 파일은 변경되지 않습니다.';
    if(typeof field.focus==='function')field.focus();
    if(typeof field.select==='function')field.select();
  });
  $('checkpointImport').addEventListener('click',()=>{
    if(running||menu.classList.contains('hidden')||
       !choices.classList.contains('hidden')||
       !$('fieldJournal').classList.contains('hidden'))return;
    checkpointFileRequest++;
    portableImportArmed=null;
    $('checkpointFile').value='';
    const field=$('checkpointTransferText');
    field.value='';field.readOnly=false;
    $('checkpointTransferPanel').classList.remove('hidden');
    setStoryMenuView('im'+'port',true);
    $('checkpointDownload').classList.add('hidden');
    $('checkpointApply').classList.remove('hidden');
    $('checkpointTransferStatus').textContent='검증된 CH01 JSON을 붙여넣으세요. 기존 저장이 있으면 덮어쓰지 않고 이 탭에서만 불러옵니다.';
    if(typeof field.focus==='function')field.focus();
  });
  $('checkpointDownload').addEventListener('click',()=>{
    const panel=$('checkpointTransferPanel'),field=$('checkpointTransferText');
    if(!sessionStarted||running||menu.classList.contains('hidden')||
       panel.classList.contains('hidden')||!field.readOnly||
       $('checkpointDownload').classList.contains('hidden'))return;
    let url=null;
    try{
      const current=Story.serialize(state);
      if(field.value!==current)throw new Error('stale checkpoint');
      if(typeof global.Blob!=='function'||!global.URL||
         typeof global.URL.createObjectURL!=='function')
        throw new Error('file download unsupported');
      const blob=new global.Blob([current],{type:'application/json;charset=utf-8'});
      url=global.URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download='VEILPOINT-CH01-checkpoint.json';
      // Offline Windows WebViews can require a connected anchor element.
      // Always detach it afterward, including a browser-rejected click.
      if(document.body&&typeof document.body.appendChild==='function'){
        document.body.appendChild(link);
        try{link.click();}finally{link.remove();}
      }else link.click();
      $('checkpointTransferStatus').textContent='검증된 JSON 파일 저장 요청 완료 · 다운로드 목록에서 파일을 확인하세요.';
    }catch(_){
      $('checkpointTransferStatus').textContent='파일 저장을 시작할 수 없습니다. 위 JSON을 전체 선택하여 텍스트 파일로 별도 보관하세요.';
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
  $('checkpointTransferText').addEventListener('input',()=>{
    // The user owns typed/pasted JSON, even when an older file.text() is late.
    checkpointFileRequest++;
    portableImportArmed=null;
  });
  $('checkpointFile').addEventListener('change',async event=>{
    const panel=$('checkpointTransferPanel'),field=$('checkpointTransferText');
    if(running||menu.classList.contains('hidden')||
       panel.classList.contains('hidden')||field.readOnly||
       !choices.classList.contains('hidden'))return;
    const file=event?.target?.files?.[0];
    if(!file)return;
    const request=++checkpointFileRequest;
    portableImportArmed=null;
    try{
      if(!Number.isFinite(file.size)||file.size>16384||
         typeof file.text!=='function')throw new RangeError('file size/type');
      const raw=await file.text();
      if(request!==checkpointFileRequest||running||
         menu.classList.contains('hidden')||
         panel.classList.contains('hidden')||field.readOnly)return;
      if(typeof raw!=='string'||!raw.trim()||raw.length>8192)
        throw new RangeError('file content');
      // This is still UNTRUSTED text. Only the existing explicit Apply action
      // calls Story.restore, validates the snapshot and checks disk ownership.
      portableImportArmed=null;
      field.value=raw;
      $('checkpointTransferStatus').textContent='파일 읽기 완료 · 검증 후 이 탭으로 가져오기를 눌러주세요. 기존 저장은 아직 변경되지 않았습니다.';
    }catch(_){
      if(request===checkpointFileRequest&&!panel.classList.contains('hidden'))
        $('checkpointTransferStatus').textContent='JSON 파일 읽기 실패 · 최대 16KB 파일만 선택할 수 있습니다. 기존 저장과 현재 게임은 변경되지 않았습니다.';
    }
  });
  $('checkpointApply').addEventListener('click',()=>{
    if(running||menu.classList.contains('hidden')||
       $('checkpointTransferPanel').classList.contains('hidden')||
       $('checkpointApply').classList.contains('hidden')||
       !choices.classList.contains('hidden'))return;
    const text=String($('checkpointTransferText').value||'').trim();
    let candidateState,raw;
    try{
      if(!text||text.length>8192)throw new RangeError('checkpoint length');
      candidateState=Story.restore(text);
      if(candidateState.phase==='complete'||candidateState.phase==='failed')
        throw new RangeError('terminal checkpoint cannot resume');
      raw=Story.serialize(candidateState);
    }catch(_){
      portableImportArmed=null;
      $('checkpointTransferStatus').textContent='가져오기 실패 · CH01 형식이나 진행 상태가 올바르지 않습니다. 현재 미션과 저장 파일은 변경되지 않았습니다.';
      return;
    }
    // A valid external snapshot can still erase unsaved progress in THIS tab.
    // Require two explicit Apply clicks for a different live world, and arm
    // only the exact canonical snapshot that was just validated. Neither
    // checking nor arming changes the 60Hz world or the disk generations.
    if(sessionStarted){
      let current;
      try{current=Story.serialize(state);}
      catch(_){
        portableImportArmed=null;
        $('checkpointTransferStatus').textContent='현재 미션의 체크포인트 검증 실패 · 가져오기를 보류했습니다.';
        return;
      }
      if(raw!==current&&portableImportArmed!==raw){
        portableImportArmed=raw;
        $('checkpointTransferStatus').textContent='현재 CH01 진행 상태를 교체합니다. 기존 진행을 JSON으로 백업한 뒤 같은 파일로 검증 후 가져오기를 다시 눌러 확정하세요. 기존 디스크 기록은 덮어쓰지 않습니다.';
        return;
      }
    }
    portableImportArmed=null;
    // Storage getters can be denied or race with another tab. Only a truly
    // empty primary+backup permits automatic first-save of an candidateState world.
    let emptyDisk=false;
    try{
      emptyDisk=global.localStorage.getItem(SAVE_KEY)===null&&
        global.localStorage.getItem(BACKUP_KEY)===null;
    }catch(_){}
    state=candidateState;sessionStarted=true;memoryOnlyStory=!emptyDisk;
    checkpoint=raw;pendingReplayReset=false;recoveredFromBackup=false;
    guidanceId=null;shotSavePending=false;firstShotSaved=false;
    lastAutosaveAt=state.world.elapsed;
    $('storyWeapon').value=state.world.player.weaponId;
    running=false;clearInput();clock.reset();limiter.reset();last=performance.now();
    let saved=false;
    if(emptyDisk){
      diskGeneration=null;checkpointInvalidStored=false;
      saved=persist('가져온 CH01 체크포인트');
    }
    saveFailed=memoryOnlyStory||!saved;
    if(memoryOnlyStory){
      const notice=$('saveStatus');
      notice.textContent='임시 가져오기 · 현재 CH01 진행은 이 탭에만 보존됩니다. 종료 전에 JSON을 백업하세요.';
      notice.classList.remove('hidden');
    }
    $('continue').textContent='가져온 CH01 이어하기';
    $('saveExit').classList.toggle('hidden',memoryOnlyStory);
    $('saveCheckpoint').classList.toggle('hidden',memoryOnlyStory);
    $('restorePrevious').classList.toggle('hidden',memoryOnlyStory);
    $('checkpointExport').classList.remove('hidden');
    checkpointFileRequest++;
    portableImportArmed=null;
    $('checkpointTransferText').value='';
    $('checkpointFile').value='';
    $('checkpointDownload').classList.add('hidden');
    $('checkpointTransferPanel').classList.add('hidden');
    setStoryMenuView('main',true);
    $('menuText').textContent=memoryOnlyStory
      ?'CH01 가져오기 완료 · 기존 저장 기록은 보호했습니다. 이번 미션은 이 탭에서만 진행되므로 종료 전에 JSON을 별도로 백업하세요.'
      :saved?'CH01 가져오기 및 저장 확인 완료 · 이어하기를 눌러 진행하세요.'
        :'CH01 가져오기 완료 · 디스크 저장을 확인할 수 없습니다. 현재 탭의 진행을 보호하고 JSON을 별도로 백업하세요.';
    updateHud();
  });
  $('restorePrevious').addEventListener('click',()=>{
    if(!sessionStarted||menu.classList.contains('hidden')||
       !choices.classList.contains('hidden')||
       state.phase==='complete'||state.phase==='failed')return;
    let primary,backup;
    try{
      primary=global.localStorage.getItem(SAVE_KEY);
      backup=global.localStorage.getItem(BACKUP_KEY);
    }catch(_){
      $('menuText').textContent='이전 체크포인트 읽기 실패 · 현재 진행을 유지합니다.';
      return;
    }
    if(primary!==diskGeneration){
      $('menuText').textContent='다른 창의 최신 저장 기록이 있습니다. 덮어쓰지 않고 현재 진행을 유지합니다.';
      return;
    }
    if(!backup){
      $('menuText').textContent='이전에 저장된 정상 체크포인트가 없어 현재 진행을 유지합니다.';
      return;
    }
    let restored;
    try{
      restored=Story.restore(backup);
      if(restored.phase==='failed'||restored.phase==='complete')throw new RangeError('terminal backup');
      if(global.localStorage.getItem(BACKUP_KEY)!==backup||
         global.localStorage.getItem(SAVE_KEY)!==primary)
        throw new RangeError('checkpoint changed during recovery');
    }catch(_){
      $('menuText').textContent='이전 체크포인트를 검증할 수 없거나 다른 창에서 변경했습니다. 현재 진행을 유지합니다.';
      return;
    }
    if(previousRestoreArmed!==backup){
      // A different tab may rotate only the backup while primary is unchanged.
      // Never accept a second click as consent to restore a different world.
      const changed=previousRestoreArmed!==null;
      previousRestoreArmed=backup;
      $('restorePrevious').textContent='이전 체크포인트 복구 확정 (다시 클릭)';
      $('menuText').textContent=changed
        ?'이전 백업 기록이 변경되었습니다. 복구하려면 현재 기록을 다시 확인해 주세요.'
        :'이전 체크포인트로 돌아가면 현재 미션 진행이 되돌아갑니다. 같은 버튼을 한 번 더 눌러 복구를 확정하세요.';
      return;
    }
    cancelPreviousRestore();
    const live=state,oldCheckpoint=checkpoint,oldAutosaveAt=lastAutosaveAt,
      oldShotPending=shotSavePending,oldFirstShotSaved=firstShotSaved;
    state=restored;
    // Persist may succeed before another PC tab replaces the newly restored
    // primary or its rotated backup. Verify both generations again BEFORE
    // replacing the live in-memory mission with the restored world.
    const targetGeneration=Story.serialize(restored);
    const wrote=persist('이전 체크포인트 복구');
    let committed=false;
    if(wrote){
      try{
        committed=global.localStorage.getItem(SAVE_KEY)===targetGeneration&&
          global.localStorage.getItem(BACKUP_KEY)===primary;
      }catch(_){}
    }
    if(!committed){
      state=live;
      checkpoint=oldCheckpoint;
      lastAutosaveAt=oldAutosaveAt;
      shotSavePending=oldShotPending;
      firstShotSaved=oldFirstShotSaved;
      saveFailed=true;
      nextSaveRetryAt=state.world.elapsed+1;
      const notice=$('saveStatus');
      notice.textContent='이전 체크포인트 복구 재확인 실패 · 다른 창의 기록 변경 또는 저장소 읽기 오류가 발생했습니다. 현재 진행은 이 탭에 유지됩니다.';
      notice.classList.remove('hidden');
      $('menuText').textContent='이전 체크포인트 복구 확정 후 저장 세대가 변경되거나 확인할 수 없어 기존 진행으로 돌아왔습니다. 다른 게임 창과 저장 공간을 확인하세요.';
      updateHud();
      return;
    }
    $('storyWeapon').value=state.world.player.weaponId;
    guidanceId=null;shotSavePending=false;firstShotSaved=false;
    lastAutosaveAt=state.world.elapsed;
    clearInput();clock.reset();limiter.reset();last=performance.now();
    $('menuText').textContent='검증된 이전 체크포인트를 복구했습니다. 이어하기를 눌러 복구 위치부터 재개하세요.';
    updateHud();
  });
  $('saveExit').addEventListener('click',()=>{
    cancelPreviousRestore();
    // Save & Exit is an explicit navigation request, never an implicit
    // consequence of losing focus, pressing Esc or a failed localStorage write.
    if(!sessionStarted||menu.classList.contains('hidden')||
       !choices.classList.contains('hidden')||
       state.phase==='complete'||state.phase==='failed')return;
    if(!persist('메뉴로 돌아가기')){
      $('menuText').textContent='체크포인트가 안전하게 저장되지 않았습니다. 기존 기록을 보호하기 위해 이동하지 않았습니다. 저장 공간과 다른 게임 창을 확인한 뒤 다시 시도하세요.';
      return;
    }
    let verified=false;
    try{verified=global.localStorage.getItem(SAVE_KEY)===Story.serialize(state);}
    catch(_){}
    if(!verified){
      $('menuText').textContent='저장 기록을 다시 확인할 수 없어 메뉴 이동을 중단했습니다. 현재 CH01 세션은 유지됩니다.';
      return;
    }
    // Another Windows tab may replace the slot after persist() has passed
    // its first readback. Do not navigate away from a live CH01 world unless
    // the generation still equals the exact one owned by this session.
    let latestGeneration;
    try{latestGeneration=global.localStorage.getItem(SAVE_KEY);}
    catch(_){latestGeneration=null;}
    if(!latestGeneration||latestGeneration!==diskGeneration){
      saveFailed=true;
      $('menuText').textContent='저장 확인 직후 다른 창의 기록 변경 또는 읽기 오류가 발생했습니다. 기존 CH01 진행을 유지하고 메뉴 이동을 취소했습니다.';
      $('saveStatus').textContent='체크포인트 재확인 실패 · 현재 진행은 이 탭에 보존됩니다.';
      $('saveStatus').classList.remove('hidden');
      return;
    }
    try{global.location.assign('index.html');}
    catch(_){
      $('menuText').textContent='체크포인트 저장 완료 · 메인 메뉴 이동에 실패했습니다. 이 탭에서 이어할 수 있습니다.';
    }
  });
  // The always-visible menu link must not bypass Save & Exit after a mission
  // starts. In a live CH01 session, the exact same verified checkpoint and
  // second readback are required before switching to the offline BR menu.
  // Before gameplay and after a terminal result the ordinary link stays free.
  $('modeSelectLink').addEventListener('click',e=>{
    if(!sessionStarted||state.phase==='complete'||state.phase==='failed')return;
    e.preventDefault();
    // The link belongs to the visible pause menu; keep choices and the
    // running 60Hz world protected from hidden/offscreen navigation events.
    if(menu.classList.contains('hidden')||
       !choices.classList.contains('hidden'))return;
    $('saveExit').click();
  });
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
        (report.route==='verification'?'동쪽 통로 확인':'남쪽 대피 지원')+
        ' · '+report.closingScene.lines[0]+' '+report.summary;
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
  let fieldJournalReturnView='main',journalPage=0;
  const JOURNAL_PAGE_SIZE=2;
  function paintFieldJournal(){
    // Each page is bounded: the last earned record never slips under the
    // controls on a short PC window. Entries remain derived from live state.
    const rows=global.VeilpointFieldJournal.entries(state);
    const pages=Math.max(1,Math.ceil(rows.length/JOURNAL_PAGE_SIZE));
    journalPage=Math.min(Math.max(0,journalPage),pages-1);
    const panel=$('fieldJournalEntries');
    panel.textContent='';
    for(const entry of rows.slice(journalPage*JOURNAL_PAGE_SIZE,
      (journalPage+1)*JOURNAL_PAGE_SIZE)){
      const paragraph=document.createElement('p');
      paragraph.textContent=entry.title+' — '+entry.detail;
      panel.appendChild(paragraph);
    }
    $('fieldJournalPageStatus').textContent=
      '기록 '+(journalPage+1)+' / '+pages+' · 전체 '+rows.length+'건';
    $('fieldJournalPrev').disabled=journalPage===0;
    $('fieldJournalNext').disabled=journalPage+1>=pages;
  }
  function journalFocusControls(){
    // Only enabled, genuinely visible buttons take part in the journal's
    // keyboard cycle. The first/last pages disable opposite arrows.
    return ['fieldJournalPrev','fieldJournalNext','fieldJournalClose']
      .map($).filter(node=>node&&!node.disabled&&
        typeof node.getClientRects==='function'&&node.getClientRects().length>0&&
        (!global.getComputedStyle||
          (global.getComputedStyle(node).display!=='none'&&
           global.getComputedStyle(node).visibility!=='hidden')));
  }
  function containJournalFocus(event){
    if($('fieldJournal').classList.contains('hidden'))return;
    const controls=journalFocusControls();
    if(!controls.length)return;
    if(event.type==='focusin'){
      // A pointer click or another dialog must not leave focus behind the
      // visible journal. Do not interfere with an allowed journal button.
      if(controls.includes(event.target))return;
      $('fieldJournalClose').focus({preventScroll:true});
      return;
    }
    if(event.key!=='Tab')return;
    const index=controls.indexOf(document.activeElement);
    if(index<0||(event.shiftKey?index===0:index===controls.length-1)){
      event.preventDefault();
      controls[event.shiftKey?controls.length-1:0].focus({preventScroll:true});
    }
  }
  document.addEventListener('keydown',containJournalFocus,true);
  document.addEventListener('focusin',containJournalFocus,true);
  function renderFieldJournal(){
    // J from live play returns to Main for the next Escape; the menu
    // button returns to Tools, where its focus target is visible.
    fieldJournalReturnView=menu.classList.contains('menu-view-tools')?'tools':'main';
    if(!menu.classList.contains('hidden'))setStoryMenuView('tools');
    journalPage=0;
    paintFieldJournal();
    $('fieldJournal').classList.remove('hidden');
    $('fieldJournalClose').focus({preventScroll:true});
  }
  $('fieldJournalOpen').addEventListener('click',renderFieldJournal);
  $('fieldJournalPrev').addEventListener('click',()=>{
    if($('fieldJournal').classList.contains('hidden')||journalPage===0)return;
    journalPage--;paintFieldJournal();
    $('fieldJournalPrev').disabled?$('fieldJournalNext').focus():$('fieldJournalPrev').focus();
  });
  $('fieldJournalNext').addEventListener('click',()=>{
    if($('fieldJournal').classList.contains('hidden')||
       $('fieldJournalNext').disabled)return;
    journalPage++;paintFieldJournal();
    $('fieldJournalNext').disabled?$('fieldJournalPrev').focus():$('fieldJournalNext').focus();
  });
  $('fieldJournalClose').addEventListener('click',()=>{
    $('fieldJournal').classList.add('hidden');
    if(!menu.classList.contains('hidden'))
      setStoryMenuView(fieldJournalReturnView,true);
    if(fieldJournalReturnView==='tools')
      $('fieldJournalOpen').focus({preventScroll:true});
  });
  $('pauseButton').addEventListener('click',()=>menuOpen('일시정지됨. 이어하기를 누르면 현재 체크포인트부터 재개합니다.'));
  $('storyGraphicsOpen').addEventListener('click',openStoryGraphicsSettings);
  $('choiceEvac').addEventListener('click',()=>decide('evacuation'));
  $('choiceVerified').addEventListener('click',()=>decide('verification'));
  $('choiceBack').addEventListener('click',()=>{
    if(state.phase==='exit'){resume();return;}
    if(Story.backToRecords(state).ok){guidanceId=null;persist();resume();}
  });
  global.addEventListener('keydown',e=>{
    if(desktopUi.captureKey(e))return;
    // An OS command chord cannot also dispatch a remapped game action or
    // leave a held movement/trigger latch active in the fixed-step world.
    if(Desktop.isModifiedGameplayKey(e)){clearInput();return;}
     if(Desktop.isGameplayShortcut(e)){clearInput();return;}
    if(e.code==='F8'&&!e.repeat&&canAct()){
      e.preventDefault();stillRequested=true;return;
    }
    // Route-choice keys are owned by the visible dialog, even when the
    // focused target is one of its accessible buttons. Previously the generic
    // focused-button guard swallowed all three actions.
    if(!$('fieldJournal').classList.contains('hidden')){
      if(e.code==='Escape'){e.preventDefault();$('fieldJournalClose').click();}
      else if(e.code==='ArrowRight'&&!e.repeat){e.preventDefault();$('fieldJournalNext').click();}
      else if(e.code==='ArrowLeft'&&!e.repeat){e.preventDefault();$('fieldJournalPrev').click();}
      return;
    }
    if(!choices.classList.contains('hidden')){
      if(e.repeat)return; // One physical key press selects at most one branch.
      // Full-size PC keyboards may use either number row or numpad.
      // Both routes retain Story.choose's existing authorization checks.
      if(e.code==='Digit1'||e.code==='Numpad1'){e.preventDefault();decide('evacuation');}
      else if(e.code==='Digit2'||e.code==='Numpad2'){e.preventDefault();decide('verification');}
      else if(e.code==='Escape'){e.preventDefault();$('choiceBack').click();}
      return;
    }
    // ESC returns from CH01's page-sized tools, settings, file loading and about
    // views before the ordinary paused-game Escape shortcut can resume play.
    if(e.code==='Escape'&&!e.repeat&&!menu.classList.contains('hidden')&&
       storyMenuViews.some(name=>menu.classList.contains('menu-view-'+name))){
      e.preventDefault();$('storyMenuBack').click();return;
    }
    // Typing JSON or changing a PC setting must not fire global J/G shortcuts
    // and unexpectedly discard the currently edited menu page.
    if((e.code==='KeyJ'||e.code==='KeyG')&&
       Desktop.isTextEntryTarget(e.target))return;
    // J opens the field journal through the existing protected pause path.
    // Do not steal the key when the player remapped J to a gameplay action.
    // The explicit menu button remains available for all binding layouts.
    if(e.code==='KeyJ'&&!e.repeat&&sessionStarted&&
       !Desktop.actionFor('KeyJ',desktopUi.get())){
      e.preventDefault();
      if(running)menuOpen('현장 기록 열람 · 일시정지됨. Esc로 기록을 닫고 이어하기로 복귀하세요.');
      if(!menu.classList.contains('hidden'))renderFieldJournal();
      return;
    }
    // The globally reserved G key can pause from pointer-locked gameplay
    // and focus the story's existing graphics select. When already focused,
    // another G returns to Continue without resuming or stepping the world.
    if(e.code==='KeyG'&&!e.repeat){
      e.preventDefault();
      if(graphicsMenuFocused&&!menu.classList.contains('hidden')){
        graphicsMenuFocused=false;
        setStoryMenuView('main',true);
      }else openStoryGraphicsSettings();
      return;
    }
    // First Escape exits settings focus; only a later explicit Escape or
    // Continue can resume the existing session and reclaim pointer lock.
    if(e.code==='Escape'&&!e.repeat&&graphicsMenuFocused&&
       !menu.classList.contains('hidden')){
      e.preventDefault();graphicsMenuFocused=false;
      if(typeof $('continue').focus==='function')$('continue').focus();
      return;
    }
    // Escape is a PC menu command even when a visible menu button has focus.
    // Handle it BEFORE the generic interactive-target guard; no held movement
    // or gameplay input is dispatched from this branch.
    const escape=Desktop.pcMenuEscape(e,{
      running,
      mayResume:sessionStarted&&!menu.classList.contains('hidden')&&
        choices.classList.contains('hidden')&&state.phase!=='failed'&&
        state.phase!=='complete'&&!graphicsContextLost&&!!renderer
    });
    if(escape!==null){
      e.preventDefault();
      if(escape==='pause')menuOpen('일시정지됨. Esc 또는 이어하기를 눌러 재개하세요.');
      else if(escape==='resume')resume();
      return;
    }
    // Focused controls keep their native keys; no gameplay command can leak.
    if(Desktop.isInteractiveTarget(e.target))return;
    const repeatAction=Desktop.actionFor(e.code,desktopUi.get());
    // Do not let OS key-repeat frequency decide finite shots or one-shot actions.
    if(e.repeat){if(repeatAction)e.preventDefault();return;}
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
      // Only one deliberate N-key action per physical press; Windows key
      // repeat must not cycle past multiple public objectives unexpectedly.
      if(e.repeat)return;
      // Shift+the remapped guidance key cycles backward, independent of the
      // currently published array index; neither shortcut moves the world.
      // Initial cycling is limited to physically observed local prompts and
      // the current route. After opting into a secondary non-paper marker,
      // the old stable non-evidence cycle remains available deliberately.
      const observed=visibleMissionMarkers();
      const optedIn=guidanceId!==null&&
        !['terminal','decision','exitEvac','exitVerify'].includes(guidanceId)&&
        observed.some(marker=>marker.id===guidanceId);
      const cycle=optedIn?Story.markers(state).filter(marker=>
        marker.kind!=='evidence'||marker.id===guidanceId):observed;
      if(e.shiftKey)
        guidanceId=Navigation.previousMarkerId(cycle,guidanceId);
      else
        guidanceId=Navigation.nextMarkerId(cycle,guidanceId);
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
  // pagehide must flush while the current fixed-step world is still running.
  // Calling pauseForBackground first would set running=false and skip this
  // explicit exit checkpoint. Pause the UI only after the write so bfcache
  // and keyboard users still return to the existing visible resume menu.
  global.addEventListener('pagehide',()=>{
    // The route-choice dialog is already paused and has its own keyboard
    // focus. Do not replace it with the generic resume menu during bfcache
    // navigation: doing so can silently lose a pending route decision.
    const routeDialogOpen=!choices.classList.contains('hidden');
    const journalOpen=!$('fieldJournal').classList.contains('hidden');
    if(sessionStarted&&running&&state.phase!=='failed'&&state.phase!=='complete')
      persist('종료 직전 저장');
    // Never leave held movement or a trigger latched after bfcache restoration.
    running=false;
    clearInput();
    clock.reset();
    limiter.reset();
    // Share the existing authoritative pagehide save/pause boundary.
    // A second listener could run after an uncommitted checkpoint.
    ambience?.dispose();
    if(!routeDialogOpen&&!journalOpen&&state.phase!=='complete'&&state.phase!=='failed')
      menuOpen('창이 비활성화되어 자동 일시정지했습니다. 이어하기를 눌러 재개하세요.');
  });
  // A Windows player can close or navigate away while the page remains
  // visible. The normal five-second checkpoint window would otherwise lose
  // the last movement/escort state. pagehide is synchronous and preserves
  // the existing cross-tab generation/readback safeguards in persist().
  // It is not a guarantee against crashes, forced process termination or
  // storage-denied browsers.

  // Back-forward cache restoration is not a fresh game launch: keep the
  // mission paused and require an explicit Windows mouse-lock reacquisition.
  global.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    clearInput();
    clock.reset();
    limiter.reset();
    last=performance.now();
    // The dialog still owns choice inputs after a bfcache round-trip.
    // Mission-complete/failed menus likewise retain their factual report.
    if(!choices.classList.contains('hidden')){
      if(typeof $('choiceEvac').focus==='function')$('choiceEvac').focus();
      return;
    }
    if(!$('fieldJournal').classList.contains('hidden')){
      if(typeof $('fieldJournalClose').focus==='function')$('fieldJournalClose').focus();
      return;
    }
    if(state.phase==='complete'||state.phase==='failed')return;
    menuOpen('이전 페이지에서 복귀했습니다. 이어하기를 눌러 마우스 잠금을 다시 허용하세요.');
  });
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
  // Only the pointer-locked Windows story camera owns right mouse input.
  // Paused menus and unlocked scenes retain ordinary browser context menus.
  canvas.addEventListener('contextmenu',e=>{
    if(!isTouch&&canAct()&&document.pointerLockElement===canvas)e.preventDefault();
  });
  canvas.addEventListener('mousedown',e=>{
    // OS-level Ctrl/Alt/Meta clicks must not invoke gameplay actions or leave held input.
    if(Desktop.isModifiedGameplayKey(e)){clearInput();return;}
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
  // Optional papers and notices become map-visible only when actually
  // encountered on foot. Their original mission state, E interactions, saved
  // evidence and the public exit/relay markers remain untouched. This removes
  // cross-harbor checklist chasing without inventing new access gates.
  function visibleMissionMarkers(){
    // Side interactions are shown only in the player's immediate vicinity.
    // Preserve an already *explicitly selected* marker as remembered guidance
    // when the player walks away; this maintains historic N/B cycle identity,
    // without publishing every other distant paper or staff position.
    const local=new Set(Story.navigationMarkers(state).map(marker=>marker.id));
    return Story.markers(state).filter(marker=>
      local.has(marker.id)||marker.id===guidanceId);
  }
  function minimap(walkRoute=null){
    const c=$('minimap'),ctx=c.getContext('2d');
    if(!ctx)return;
    const w=c.width,h=c.height,tx=x=>(x+75)/150*w,tz=z=>(z+90)/130*h;
    ctx.fillStyle='#0b2326';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#3c5552';ctx.lineWidth=1;
    for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(w*i/6,0);ctx.lineTo(w*i/6,h);ctx.stroke();}
    for(const o of state.world.obstacles){
      ctx.fillStyle='#637874';ctx.fillRect(tx(o.x-o.w/2),tz(o.z-o.d/2),o.w/150*w,o.d/130*h);
    }
    // Exactly the verified fictional street collision segments; no
    // arrow through buildings, hidden civilian locations or server telemetry.
    if(walkRoute?.kind==='detour'&&walkRoute.points.length>=2){
      ctx.strokeStyle='#d2e5a9';ctx.lineWidth=2;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.moveTo(tx(walkRoute.points[0].x),tz(walkRoute.points[0].z));
      for(const point of walkRoute.points.slice(1))
        ctx.lineTo(tx(point.x),tz(point.z));
      ctx.stroke();ctx.setLineDash([]);
    }
    for(const m of visibleMissionMarkers()){
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
    const bindings=desktopUi.get().bindings;
    const interactLabel=Desktop.keyLabel(bindings.interact);
    const reloadLabel=Desktop.keyLabel(bindings.reload);
    const reportLabel=Desktop.keyLabel(bindings.support);
    const interactPrompt='['+interactLabel+']';
    // The shared PC binder owns the same remapped keys as actual input:
    // including the encounter's keyboard fire key, not a stale SPACE hint.
    const controlText=text=>Desktop.storyHintText(text,bindings);
    $('objective').textContent=controlText(Story.objective(state));
    const situation=Story.situation(state);
    const publicMarkers=visibleMissionMarkers();
    // Once the optional escort is accepted, the exit is physically locked
    // until the guide arrives or is handed to local staff. Show the actually
    // observed guide whenever possible; otherwise show a recovery instruction
    // rather than pretending the blocked exit is immediately reachable.
    const escortIncomplete=state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&!state.guide.arrived&&!state.guide.released;
    const preferGuide=escortIncomplete&&
      publicMarkers.some(marker=>marker.id==='guideControl');
    const primaryTarget=state.phase==='exit'
      ?escortIncomplete?(preferGuide?'guideControl':null):
        state.choice==='evacuation'?'exitEvac':'exitVerify'
      :null;
    const escortHint=escortIncomplete?situation.guideStatus:null;
    // Reuse the same SELECTED public marker as the text compass, with a
    // bounded actual A* street check only when the straight line is blocked.
    // No new quest, AI target tracking or checkpoint field is created.
    const walkTarget=Pedestrian?.targetFor(state.world.player,publicMarkers,
      guidanceId,primaryTarget,escortIncomplete&&!preferGuide&&guidanceId===null);
    const walkRoute=walkTarget?Pedestrian.plan(state.world.player,
      walkTarget,state.world.obstacles):null;
    if(Navigation&&$('navigation'))$('navigation').textContent=Navigation.story(
      state.world.player,publicMarkers,Navigation.markerIndex(publicMarkers,guidanceId),
      state.world.obstacles,primaryTarget,escortHint)+
      (walkRoute?.kind==='detour'?Pedestrian.instruction(walkRoute):'')+
      (publicMarkers.length>1?' · ['+
         (Desktop.actionFor('KeyN',desktopUi.get())==='guidance'
           ?'N':Desktop.keyLabel(bindings.guidance))+
         '] 표식 변경 / 자동 선택 · [SHIFT+'+
         Desktop.keyLabel(bindings.guidance)+'] 역순':'')+
      (Sim.publicDistrictAt(state.world.player,state.world.obstacles)?
       ' · 도시 구조: '+Sim.publicDistrictAt(state.world.player,state.world.obstacles).label:'');
    // A factual pre-departure/arrival recap plays over actual controllable
    // movement. It has no pause, checklist, investigation or unlock gate.
    // Historic saves in later phases never replay the opening.
    const opening=Story.openingBeat(state);
    // Physical, local-only public space identification; no invented map-wide
    // quest marker, civilian arrival, emergency order or new save key.
    const courtLabel=PublicCourt?.withinCourt(state.world.player)
      ?' · 현장 위치: 시민 공공 안뜰 · 출입 가능 · 주민 인원 확인 전':'';
    $('status').textContent=(opening?(opening.location.startsWith('출국 전')?'회상 · ':'현재 · ')+opening.location+' · ':'')+
      controlText(state.message)+' · 경과 '+Math.floor(state.world.elapsed)+'초'+
      (state.world.player.sprintExhausted?' · 지구력 회복 중: 25까지 회복해야 다시 달릴 수 있습니다.':'')+
      courtLabel;
    // Immediate reload feedback takes precedence over optional opening narration.
    // The briefing keeps its fixed timeline and never blocks gameplay.
    const urgentReload=state.world.player.reloadHesitation && /안정되면/.test(state.subtitle);
    $('subtitle').textContent=controlText(urgentReload?state.subtitle:(opening?opening.subtitle:state.subtitle));
    if(Comms&&$('fieldRadio')){
      const radio=Comms.fieldRadio(state,Story.localPublicAddress(state));
      // Text-only original dialogue. Never interpolate user data into HTML.
      $('fieldRadio').textContent=radio.speaker+' / '+radio.message;
      $('fieldRadio').title=$('fieldRadio').textContent;
    }
    const lampKey=Desktop.actionFor('KeyF',desktopUi.get())==='headlamp'
       ?'F':Desktop.keyLabel(bindings.headlamp);
     $('flashlightStatus').textContent=Story.situation(state).headlamp+' · ['+lampKey+'] 켜기/끄기';
    const guideSpacing=Number.isFinite(situation.visibleEscortDistance)
      ?' · 시야 내 안내원 간격 '+situation.visibleEscortDistance.toFixed(1)+'m'+
        (!state.guide.waiting&&situation.visibleEscortDistance>=5?' · 천천히 이동해 동행 유지':'')
      :'';
    // Show the actual remapped crouch key only while the player can see the
    // following civilian; never reveal an unseen civilian's whereabouts.
    const paceHelp=situation.escortPaceAvailable
      ?' · ['+Desktop.keyLabel(bindings.crouch)+'] 낮은 자세로 동행 보폭 맞추기'
      :'';
    $('routeStatus').textContent=situation.route+(state.phase==='exit'&&state.choice==='verification'&&!situation.eastGateOpen?(situation.eastGateObstructed?' · 통제문 안전 정지 · 이동 경로를 비워 주세요':' · 통제문 대기 약 '+Math.ceil(situation.eastGateRemainingSeconds)+'초'):'')+(situation.routeReviewAvailable?' · 결정 콘솔에서 경로 재선택 가능':'')+' · '+situation.civilianConsequence+(state.choice==='evacuation'?' · '+situation.guideStatus+guideSpacing+paceHelp:'')+' · '+situation.radio+' · '+situation.warning+
      (state.choice==='evacuation'?' · '+situation.aidSupply:'');
    $('routeStatus').textContent=controlText($('routeStatus').textContent);
    // CH01 is a lived event, not a document checklist. Keep optional
    // actions and historical mission-task audits intact for old checkpoints,
    // but show only the active route's actual physical progress on the HUD.
    const tasks=Story.missionTasks(state);
    const primary=tasks.find(task=>!task.optional);
    const tracker=$('taskTracker');
    tracker.classList.toggle('hidden',!primary);
    if(primary){
      const progress={done:'현장 도착',available:'직접 이동 가능',
        waiting:'현지 담당자가 개방 중',blocked:'현장 이동 확인 필요'};
      tracker.textContent=(state.choice==='evacuation'?'남쪽 대피':'동쪽 통로')+
        ' · '+primary.label+' · '+(progress[primary.status]||'진행 중')+
        (primary.status==='blocked'&&situation.exitReadiness?.label
          ?' · '+situation.exitReadiness.label:'');
    }else tracker.textContent='';
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
      $('combatStatus').textContent='장비 '+Sim.FIREARMS[p.weaponId].label+' · 무장 대치자 '+state.world.bots.filter(b=>b.alive).length+'/3 · 탄창 '+p.loaded+' / 예비 '+(p.charges-p.loaded)+(p.reloadRemaining>0?(p.reloadHesitation?' · 장전 지연 · '+reloadLabel+'/장전 다시 눌러 복구':' · 재장전 중'):'')+' · 긴장 '+Math.round(p.stress||0)+' · 이동 능력 '+Math.round(Sim.injuryMobility(p)*100)+'% · 장전 보조 '+(p.reloadAssist?'켜짐':'꺼짐')+' · 동료 보고 '+(state.combat.supportUsed?'확인 완료':reportLabel+' 확인 가능')+' · 보급 '+(state.combat.supplyRemaining===0?'소진':p.charges>=p.maxCharges?'휴대 한도 도달 · 상자 잔량 '+state.combat.supplyRemaining+'발':'상자 잔량 '+state.combat.supplyRemaining+'발 · 접근 후 '+interactLabel+' 확보');
    }
    const entries=state.found.map(id=>Story.RECORDS[id]);
    $('records').textContent=entries.length
      ?entries.map(r=>r.title+' / '+r.time).join(' · ')+(entries.length===2?(state.gateLogReviewed?' / 현장 재전송 로그 확인':' / 시각 차이 확인'):'')
      :'기록 0/2 · 조사하지 않아도 대피할 수 있습니다.';
    const nearby=running?Story.nearest(state):null;
    $('interaction').classList.toggle('hidden',!nearby);
    if(nearby)$('interaction').textContent=nearby.kind==='ammo'
      ?nearby.label+' · 잔량 '+state.combat.supplyRemaining+'발 · '+
        (p.charges>=p.maxCharges?'탄약 휴대 한도 도달':interactPrompt+' 필요한 만큼 확보')
      :nearby.id==='decision'&&state.phase==='exit'?interactPrompt+' '+nearby.label+' · 경로 다시 선택 (현재 '+(state.choice==='verification'?'동쪽 확인':'남쪽 대피')+')'
      :nearby.id==='exitVerify'&&!situation.eastGateOpen
        ?(situation.eastGateObstructed
          ?'동쪽 통제문 안전 정지 · 이동 경로에서 벗어나면 개방 재개'
          :'동쪽 통제문 개방 대기 · 약 '+Math.ceil(situation.eastGateRemainingSeconds)+
            '초 · 현지 구조단 승인 후 통과할 수 있습니다')
      :nearby.id==='exitVerify'
        ?interactPrompt+' '+nearby.label+' · 동쪽 통로 통과'
      :nearby.id==='exitEvac'&&state.world.carryingAid
        ?'출구 통과 보류 · 운반 중인 물품을 현장 인계하거나 임시 적재대에 내려놓으세요'
      :nearby.id==='exitEvac'&&state.guide.active&&!state.guide.arrived
        ?'출구 통과 보류 · 안내원의 실제 안뜰 도착 또는 현지 구조단 인계가 필요합니다'+
          (state.guide.waiting&&situation.guideStatus.includes('F로 동행 재개 가능')
            ?' · '+interactPrompt+' 가까운 안내원 동행 재개':'')
      :nearby.id==='guideControl'?interactPrompt+' '+nearby.label+' · 현장 안내원 위치에서 동행 상태 변경'
      :nearby.id==='guideRelease'||nearby.id==='guideTransfer'?interactPrompt+' '+nearby.label+' · 안내원 현장 인계'
      :nearby.id==='aidPickup'?interactPrompt+' '+nearby.label+' 들기 · 운반 중 달리기 제한'
      :nearby.id==='aidDrop'?interactPrompt+' '+nearby.label+' 인계'
      :nearby.id==='aidStage'?interactPrompt+' '+nearby.label+'에 내려놓기 · 이동 제한 해제'
      :nearby.id==='aidResume'?interactPrompt+' '+nearby.label+' 다시 들기'
       :nearby.id==='harborWorker'?interactPrompt+' 항구 작업자에게 직접 목격 상황을 묻기'
      :nearby.id==='gateLog'?interactPrompt+' '+nearby.label+' 열람 · 최초 수신/재전송 대조'
      :nearby.id==='reportDesk'?interactPrompt+' '+nearby.label+'에 현장 기록 전달'
      :nearby.id==='beacon'?interactPrompt+' '+nearby.label+(state.beaconEnabled?' 끄기':' 작동')+' · 현장 수동 스위치'
      :interactPrompt+' '+nearby.label+' 조사';
    const f=limiter.stats();
    $('fps').textContent='FPS: '+(f.actualFps||'--')+' / 상한 '+f.cap+' · 시뮬레이션 60Hz'+(renderer&&renderer.lastStaticVisibilityStats?' · 정적 지형 '+renderer.lastStaticVisibilityStats.submittedVertices+'/'+renderer.lastStaticVisibilityStats.totalVertices+' 버텍스':'');
    minimap(walkRoute);
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
    const civicReachedBefore=Story.civicCrossingReached(state);
    const completeBefore=state.phase==='complete';
    const recordsBefore=state.phase==='records';
    const shotsBefore=running&&state.phase==='engagement'
      ?state.world.bots.reduce((total,hostile)=>total+hostile.shots,0):0;
    if(canAct()&&state.phase!=='complete'&&state.phase!=='failed')clock.advance(dt,step=>{
      if(state.phase==='decision')return; // Freeze pending route choice during a catch-up frame.
      Story.step(state,step,input);
      if(input.fireHeld&&state.phase==='engagement'&&Story.autoFire(state,true,input.crouch).ok){
        audio.play('shot');persistShot();
      }
    });
    // Footfalls are driven by resolved 60Hz displacement, not pressed keys.
    // Paused/loading/blocked motion must remain silent; no new save fields.
    footfalls?.update(state,canAct(),input.crouch,input.sprint);
    // Actual arrival near the local route fork now opens the original
    // keyboard-accessible choice overlay automatically. The old E marker
    // remains functional for previously saved checkpoints in the area.
    if(running&&recordsBefore&&state.phase==='decision'){
      guidanceId=null;
      persist('현장 경로 분기 도착');
      showChoices();
    }
    // Physical courtyard/clearance arrival is a real fixed-step CH01 ending,
    // not a UI-only marker state. Persist it before displaying the debrief.
    if(running&&!completeBefore&&state.phase==='complete'){
      guidanceId=null;
      audio.play('complete');
      persist('현장 실제 도착');
      presentCompletion();
      updateHud();
    }
    // Flush a dirty held-fire checkpoint on its bounded clock even if the
    // most recent shot happened just before the 450ms deadline.
    if(running&&shotSavePending&&state.phase==='engagement'&&
       state.world.elapsed-lastAutosaveAt>=SHOT_SAVE_INTERVAL_SECONDS&&
       state.world.elapsed>=nextSaveRetryAt)persist();
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
    // A civilian arriving at the observed public crossing is a real fixed-step
    // result, not an F-press success or an invented city-wide evacuation.
    // Commit this one-shot state immediately; ordinary traversal keeps its
    // existing bounded autosave fallback and older saves remain readable.
    if(running&&Story.civicCrossingArrivalCheckpoint(civicReachedBefore,state))
      persist('주민의 실제 건널목 도착');
    // Persist the actual world transition once, rather than writing every 60Hz tick.
    if(gatePending&&Story.situation(state).eastGateOpen)persist();
    // A browser crash or refresh during quiet traversal must not rewind an entire
    // mission segment. This uses simulated time, so paused/background tabs cannot
    // generate repeated writes or advance hostile attacks.
    if(running&&state.phase!=='complete'&&state.phase!=='failed'&&
       state.world.elapsed-lastAutosaveAt>=AUTOSAVE_SECONDS&&
       state.world.elapsed>=nextSaveRetryAt)persist();
    if(running&&state.phase==='failed'){
      // Never replace a viable save with a terminal failed state. The primary
      // action now retries the last alive checkpoint; New Game still resets all.
      menuOpen('교전 중 임무가 중단되었습니다. 마지막 체크포인트에서 재시도하거나 처음부터 다시 시작할 수 있습니다.');
    }
    // The existing finite damageFlash timer is already advanced by the fixed
    // 60Hz story step. Present a brief non-directional edge cue (no enemy radar).
    $('damageIndicator').style.opacity=String(running?Math.min(.65,Math.max(0,state.world.damageFlash/.45*.65)):0);
    if(renderer&&limiter.shouldRender(now)){
      renderer.draw(state.world);
      if(stillRequested){
        stillRequested=false;
        if(canAct())try{
          global.VeilpointBodycamStill.saveStill({
            canvas,renderer,document,mode:'ch01',elapsed:state.world.elapsed
          });
        }catch(error){console.warn('VEILPOINT bodycam still failed',error);}
      }
    }
    if(now-lastHud>180){lastHud=now;ambience?.update(state,canAct());updateHud();}
  }
  const loaded=readCheckpoint();
  diskGeneration=loaded?storage.get(SAVE_KEY):null;
  checkpoint=diskGeneration;
  if(checkpointReadUnavailable){
    $('continue').textContent='저장소 없이 임시 CH01 시작';
    $('menuText').textContent='이 브라우저에서 저장된 미션을 읽을 수 없습니다. 기존 임무 기록을 보존하며, 별도 임시 세션으로 플레이할 수 있습니다. 저장소 접근이 복구되면 기존 기록을 다시 불러올 수 있습니다.';
  }else if(checkpointInvalidStored){
    $('continue').textContent='기록 보존 · 임시 CH01 시작';
    $('menuText').textContent='CH01 저장 기록을 복원할 수 없습니다. 이어하기는 기존 데이터를 변경하지 않는 임시 플레이로 시작됩니다. 저장 기록을 버리고 새로 시작할 때만 새 게임을 선택하세요.';
  }else if(loaded&&loaded.phase!=='complete'){
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
