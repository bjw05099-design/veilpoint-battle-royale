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
    const raw=Story.serialize(state);
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
      if(priorState.phase!=='failed'&&priorState.phase!=='complete'&&
         !storage.set(BACKUP_KEY,previous))
        return protectDisk('이전 체크포인트 백업 실패');
    }
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
    cancelPreviousRestore();
    // Pausing after a choice or during clearance must not roll back elapsed world state.
    if(running&&state.phase!=='complete'&&state.phase!=='failed')persist();
    running=false;lockAttempt++;pointerLockPendingSince=null;aimLockObserved=false;
    desktopUi.cancel();clearInput();touchLookId=null;previous=null;clock.reset();limiter.reset();
    if(saveFailed)text=(text||'일시정지')+' · 저장 실패: 새로고침하면 현재 진행 상황이 사라질 수 있습니다.';
    if(text)$('menuText').textContent=text;
    menu.classList.remove('hidden');choices.classList.add('hidden');
    $('fieldJournal').classList.add('hidden');
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    const completed=state.phase==='complete'||state.phase==='failed';
    $('continue').textContent=state.phase==='failed'?'마지막 체크포인트 재시도':
      state.phase==='complete'?'미션 다시 플레이':'이어하기';
    $('saveExit').classList.toggle('hidden',!sessionStarted||completed);
    $('saveCheckpoint').classList.toggle('hidden',!sessionStarted||completed);
    $('restorePrevious').classList.toggle('hidden',!sessionStarted||completed);
    // PC keyboard users must not remain focused on the now-hidden game canvas.
    // The dialog's primary action is the safe focus target after an Esc pause.
    if(!$('continue').disabled)$('continue').focus();
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
        {raw:storage.get(BACKUP_KEY),primary:false}
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
          }
          recovered=candidate;
          break;
        }catch(_){} // Corrupt/unavailable slots are never deleted by retry.
      }
      state=recovered||Story.createState($('storyWeapon').value);
      $('storyWeapon').value=state.world.player.weaponId;
      guidanceId=null;shotSavePending=false;firstShotSaved=false;
      lastAutosaveAt=state.world.elapsed;
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
      let resetVerified=false,observedPrimary=diskGeneration;
      try{
        // Protect a *newer valid* save written by another PC tab. Explicit
        // New Game must still be able to discard an already-corrupt checkpoint
        // or intentionally restart after an external deletion, as before.
        const latest=global.localStorage.getItem(SAVE_KEY);
        observedPrimary=latest;
        global.localStorage.getItem(BACKUP_KEY);
        if(latest!==diskGeneration&&latest!==null){
          try{Story.restore(latest);staleReset=true;}
          catch(_){} // An invalid primary can be explicitly reset by New Game.
        }
        if(!staleReset){
          storage.remove(BACKUP_KEY);
          if(global.localStorage.getItem(BACKUP_KEY)===null)
            storage.remove(SAVE_KEY);
          resetVerified=global.localStorage.getItem(SAVE_KEY)===null&&
            global.localStorage.getItem(BACKUP_KEY)===null;
          if(resetVerified)storage.remove(PREVIEW_KEY);
        }
      }catch(_){resetVerified=false;}
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
  function interact(){
    if(!canAct()||state.phase==='complete')return;
    const result=Story.interact(state);
    if(!result.ok){
      // A physically blocked cargo exit changes the mission subtitle/message
      // even though it must not save a false completion or play a success cue.
      if(['cargo_handoff_required','guide_not_arrived','guide_not_at_muster'].includes(result.reason))updateHud();
      return;
    }
    guidanceId=null;
    audio.play(state.phase==='complete'?'complete':'interact');
    persist();
    if(state.phase==='decision'||result.event==='reconsider'){showChoices();return;}
    if(state.phase==='complete'){
      const report=recordCompletion();
      menuOpen('CH01 완료 — '+state.subtitle+' '+(report?report.summary+' ':'')+
        (saveFailed?'현재 완료 기록은 저장되지 않았습니다. 이 탭을 닫으면 이전 체크포인트로 돌아갈 수 있습니다. ':'')+
        '현재는 짧은 브라우저 스토리 프리뷰이며, 12시간 캠페인은 아직 제작 중입니다.');
    }
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
    const live=state,oldCheckpoint=checkpoint,oldAutosaveAt=lastAutosaveAt;
    state=restored;
    // persist() validates/rotates the latest primary and reads back the exact
    // restored v2 world. Do not discard the live session if the commit fails.
    if(!persist('이전 체크포인트 복구')){
      state=live;
      checkpoint=oldCheckpoint;
      lastAutosaveAt=oldAutosaveAt;
      $('menuText').textContent='이전 체크포인트의 저장을 확인하지 못해 기존 진행으로 돌아왔습니다. 브라우저 저장 공간을 확인하세요.';
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
  function renderFieldJournal(){
    const rows=global.VeilpointFieldJournal.entries(state);
    const panel=$('fieldJournalEntries');
    panel.textContent='';
    for(const entry of rows){
      const paragraph=document.createElement('p');
      paragraph.textContent=entry.title+' — '+entry.detail;
      panel.appendChild(paragraph);
    }
    $('fieldJournal').classList.remove('hidden');
    $('fieldJournalClose').focus();
  }
  $('fieldJournalOpen').addEventListener('click',renderFieldJournal);
  $('fieldJournalClose').addEventListener('click',()=>{
    $('fieldJournal').classList.add('hidden');
    $('fieldJournalOpen').focus();
  });
  $('pauseButton').addEventListener('click',()=>menuOpen('일시정지됨. 이어하기를 누르면 현재 체크포인트부터 재개합니다.'));
  $('choiceEvac').addEventListener('click',()=>decide('evacuation'));
  $('choiceVerified').addEventListener('click',()=>decide('verification'));
  $('choiceBack').addEventListener('click',()=>{
    if(state.phase==='exit'){resume();return;}
    if(Story.backToRecords(state).ok){guidanceId=null;persist();resume();}
  });
  global.addEventListener('keydown',e=>{
    if(desktopUi.captureKey(e))return;
     if(Desktop.isGameplayShortcut(e)){clearInput();return;}
    // Route-choice keys are owned by the visible dialog, even when the
    // focused target is one of its accessible buttons. Previously the generic
    // focused-button guard swallowed all three actions.
    if(!$('fieldJournal').classList.contains('hidden')){
      if(e.code==='Escape'){e.preventDefault();$('fieldJournalClose').click();}
      return;
    }
    if(!choices.classList.contains('hidden')){
      if(e.repeat)return; // One physical key press selects at most one branch.
      if(e.code==='Digit1'){e.preventDefault();decide('evacuation');}
      else if(e.code==='Digit2'){e.preventDefault();decide('verification');}
      else if(e.code==='Escape'){e.preventDefault();$('choiceBack').click();}
      return;
    }
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
      // Keep targeting the same public objective when optional markers are
      // inserted/removed in the live 60Hz mission world. A missing target
      // safely returns to automatic nearest-marker guidance.
      guidanceId=Navigation.nextMarkerId(Story.markers(state),guidanceId);
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
    const bindings=desktopUi.get().bindings;
    const interactLabel=Desktop.keyLabel(bindings.interact);
    const reloadLabel=Desktop.keyLabel(bindings.reload);
    const reportLabel=Desktop.keyLabel(bindings.support);
    const interactPrompt='['+interactLabel+']';
    // Every visible CH01 prompt must reflect the actual remapped PC controls,
    // including a guide's wait/resume cue restored from a disk checkpoint.
    const controlText=text=>text
      .replaceAll('E로',interactLabel+'로')
      .replaceAll('E를',interactLabel+'를')
      .replaceAll('E 누르',interactLabel+' 누르')
      .replaceAll('R키',reloadLabel+'키')
      .replaceAll('R 재장전',reloadLabel+' 재장전')
      .replaceAll('Q 상황 보고',reportLabel+' 상황 보고');
    $('objective').textContent=controlText(Story.objective(state));
    const publicMarkers=Story.markers(state);
    const preferGuide=state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&state.guide.waiting&&!state.guide.arrived&&
      publicMarkers.some(marker=>marker.id==='guideControl');
    const primaryTarget=state.phase==='exit'
      ?preferGuide?'guideControl':state.choice==='evacuation'?'exitEvac':'exitVerify'
      :null;
    if(Navigation&&$('navigation'))$('navigation').textContent=Navigation.story(
      state.world.player,publicMarkers,Navigation.markerIndex(publicMarkers,guidanceId),
      state.world.obstacles,primaryTarget)+
      (publicMarkers.length>1?' · ['+
         (Desktop.actionFor('KeyN',desktopUi.get())==='guidance'
           ?'N':desktopUi.get().bindings.guidance.replace(/^Key/,''))+
         '] 표식 변경 / 자동 선택':'');
    $('status').textContent=controlText(state.message)+' · 경과 '+Math.floor(state.world.elapsed)+'초'+
      (state.world.player.sprintExhausted?' · 지구력 회복 중: 25까지 회복해야 다시 달릴 수 있습니다.':'');
    $('subtitle').textContent=controlText(state.subtitle);
    const lampKey=Desktop.actionFor('KeyF',desktopUi.get())==='headlamp'
       ?'F':desktopUi.get().bindings.headlamp.replace(/^Key/,'');
     $('flashlightStatus').textContent=Story.situation(state).headlamp+' · ['+lampKey+'] 켜기/끄기';
    const situation=Story.situation(state);
    const guideSpacing=Number.isFinite(situation.visibleEscortDistance)
      ?' · 시야 내 안내원 간격 '+situation.visibleEscortDistance.toFixed(1)+'m'+
        (!state.guide.waiting&&situation.visibleEscortDistance>=5?' · 천천히 이동해 동행 유지':'')
      :'';
    $('routeStatus').textContent=situation.route+(state.phase==='exit'&&state.choice==='verification'&&!situation.eastGateOpen?' · 통제문 대기 약 '+Math.ceil(situation.eastGateRemainingSeconds)+'초':'')+(situation.routeReviewAvailable?' · 결정 콘솔에서 경로 재선택 가능':'')+' · '+situation.civilianConsequence+(state.choice==='evacuation'?' · '+situation.guideStatus+guideSpacing:'')+' · '+situation.radio+' · '+situation.warning+
      (state.choice==='evacuation'?' · '+situation.aidSupply:'');
    $('routeStatus').textContent=controlText($('routeStatus').textContent);
    // Compact route progress is an observation of existing 60Hz/interactive
    // state, never a second completion system. Optional tasks remain optional.
    const tasks=Story.missionTasks(state);
    const tracker=$('taskTracker');
    tracker.classList.toggle('hidden',tasks.length===0);
    if(tasks.length){
      const status={done:'완료',available:'진행 가능',following:'동행 중',
        waiting:'현장 대기',staged:'임시 적재',carrying:'운반 중',
        blocked:'선행 목표 필요',locked:'준비 중'};
      tracker.textContent=tasks.map(task=>
        (task.status==='done'?'✓ ':'○ ')+task.label+
        (task.optional?' (선택)':'')+' · '+status[task.status]).join('\n');
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
      :nearby.id==='guideControl'?interactPrompt+' '+nearby.label+' · 현장 안내원 위치에서 동행 상태 변경'
      :nearby.id==='guideRelease'||nearby.id==='guideTransfer'?interactPrompt+' '+nearby.label+' · 안내원 현장 인계'
      :nearby.id==='aidPickup'?interactPrompt+' '+nearby.label+' 들기 · 운반 중 달리기 제한'
      :nearby.id==='aidDrop'?interactPrompt+' '+nearby.label+' 인계'
      :nearby.id==='aidStage'?interactPrompt+' '+nearby.label+'에 내려놓기 · 이동 제한 해제'
      :nearby.id==='aidResume'?interactPrompt+' '+nearby.label+' 다시 들기'
       :nearby.id==='gateLog'?interactPrompt+' '+nearby.label+' 열람 · 최초 수신/재전송 대조'
      :nearby.id==='reportDesk'?interactPrompt+' '+nearby.label+'에 현장 기록 전달'
      :nearby.id==='beacon'?interactPrompt+' '+nearby.label+(state.beaconEnabled?' 끄기':' 작동')+' · 현장 수동 스위치'
      :interactPrompt+' '+nearby.label+' 조사';
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
    if(renderer&&limiter.shouldRender(now))renderer.draw(state.world);
    if(now-lastHud>180){lastHud=now;updateHud();}
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
