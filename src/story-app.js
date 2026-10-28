/* VEILPOINT CH01 first-person browser integration; separate from offline BR.
 * Story state and checkpoint logic live in story-slice.js.
 */
(function (global) {
  'use strict';
  const $=id=>document.getElementById(id);
  const Story=global.VeilpointStorySlice;
  const Graphics=global.VeilpointGraphics;
  const Sim=global.VeilpointSim;
  const Audio=global.VeilpointStoryAudio;
  const SAVE_KEY='veilpoint.story.ch01';
  const PREVIEW_KEY='veilpoint.story.ch01PreviewCompleted';
  const canvas=$('scene'),menu=$('menu'),choices=$('choices'),quality=$('quality');
  const clock=global.VeilpointClock.createClock({hz:60,maxFrameSeconds:.25,maxSteps:8});
  const limiter=global.VeilpointFPS.createFrameLimiter(60);
  const input={forward:false,back:false,left:false,right:false,sprint:false,crouch:false};
  global.VeilpointInput=input;
  let state=Story.createState(),renderer=null,running=false,last=performance.now(),lastHud=0;
  let checkpoint=null;
  if(!Object.prototype.hasOwnProperty.call(Sim.FIREARMS,$('storyWeapon').value))$('storyWeapon').value='carbine';
  const isTouch=global.matchMedia('(pointer:coarse)').matches;
  const clearInput=()=>{for(const key in input)input[key]=false;};
  const storage={
    get(key){try{return global.localStorage.getItem(key);}catch(_){return null;}},
    set(key,value){try{global.localStorage.setItem(key,value);return true;}catch(_){return false;}},
    remove(key){try{global.localStorage.removeItem(key);}catch(_){}}
  };
  function readCheckpoint(){
    const saved=storage.get(SAVE_KEY);
    if(!saved)return null;
    try{return Story.restore(saved);}catch(_){storage.remove(SAVE_KEY);return null;}
  }
  function persist(){
    const raw=Story.serialize(state);
    checkpoint=raw;
    return storage.set(SAVE_KEY,raw);
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
  try{
    renderer=new global.VeilpointRenderer(canvas);
    applyQuality();
  }catch(err){
    $('menuText').textContent='3D 렌더러를 초기화할 수 없습니다: '+String(err.message);
    $('continue').disabled=true;$('newGame').disabled=true;
  }
  function menuOpen(text){
    // Pausing after a choice or during clearance must not roll back elapsed world state.
    if(running&&state.phase!=='complete'&&state.phase!=='failed')persist();
    running=false;clearInput();touchLookId=null;previous=null;clock.reset();limiter.reset();
    if(text)$('menuText').textContent=text;
    menu.classList.remove('hidden');choices.classList.add('hidden');
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    const completed=state.phase==='complete'||state.phase==='failed';
    $('continue').textContent=completed?'미션 다시 플레이':'이어하기';
  }
  function resume(){
    if(!renderer)return;
    if(state.phase==='complete'||state.phase==='failed')state=Story.createState($('storyWeapon').value);
    if(state.phase==='decision'){showChoices();return;}
    menu.classList.add('hidden');choices.classList.add('hidden');
    running=true;clock.reset();limiter.reset();last=performance.now();clearInput();
    if(!isTouch&&canvas.requestPointerLock){
      try{const p=canvas.requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(_){}
    }
    updateHud();
  }
  function begin(fromCheckpoint){
    if(!renderer)return;
    if(fromCheckpoint){
      const loaded=readCheckpoint();
      state=loaded&&loaded.phase!=='complete'?loaded:Story.createState($('storyWeapon').value);
    }else{
      state=Story.createState($('storyWeapon').value);storage.remove(SAVE_KEY);checkpoint=null;
    }
    $('storyWeapon').value=state.world.player.weaponId;
    resume();
  }
  function showChoices(){
    running=false;clearInput();clock.reset();
    choices.classList.remove('hidden');menu.classList.add('hidden');
    const canVerify=state.found.length===2;
    $('choiceVerified').disabled=!canVerify;
    $('choiceHint').textContent=canVerify
      ?'기록 2/2: 항구 04:12 · 대피소 04:07. 두 경로 모두 선택할 수 있습니다.'
      :'기록 '+state.found.length+'/2: 대피 우선은 즉시 선택 가능하며, 추가 확인 경로는 기록 2개가 필요합니다.';
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    updateHud();
  }
  function decide(option){
    const result=Story.choose(state,option);
    if(!result.ok){$('choiceHint').textContent='아직 기록이 부족합니다. 조사로 돌아가거나 대피 우선을 선택하세요.';return;}
    persist();resume();
  }
  function interact(){
    if(!running||state.phase==='complete')return;
    const result=Story.interact(state);
    if(!result.ok)return;
    audio.play(state.phase==='complete'?'complete':'interact');
    persist();
    if(state.phase==='decision'){showChoices();return;}
    if(state.phase==='complete'){
      const report=recordCompletion();
      menuOpen('CH01 완료 — '+state.subtitle+' '+(report?report.summary+' ':'')+'현재는 짧은 브라우저 스토리 프리뷰이며, 12시간 캠페인은 아직 제작 중입니다.');
    }
    updateHud();
  }
  function fire(){
    if(!running)return;
    const result=Story.fire(state);
    if(result.ok){audio.play('shot');persist();updateHud();}
  }
  function reload(){
    if(!running||state.phase!=='engagement')return;
    const result=Sim.reload(state.world);
    if(result.reason==='recovery_not_ready'){
      state.subtitle='이수혁 대위: 장전 동작이 안정되면 R키 또는 장전 버튼을 다시 눌러 복구할 수 있습니다.';
      updateHud();return;
    }
    if(result.ok){audio.play('reload');persist();updateHud();}
  }
  function toggleReloadAssist(){
    if(!running)return;
    Sim.setReloadAssist(state.world,!state.world.player.reloadAssist);
    persist();updateHud();
  }
  function support(){
    if(!running)return;
    const result=Story.support(state);
    if(result.ok){audio.play('report');persist();updateHud();}
  }
  $('continue').addEventListener('click',()=>begin(true));
  $('newGame').addEventListener('click',()=>begin(false));
  $('pauseButton').addEventListener('click',()=>menuOpen('일시정지됨. 이어하기를 누르면 현재 체크포인트부터 재개합니다.'));
  $('choiceEvac').addEventListener('click',()=>decide('evacuation'));
  $('choiceVerified').addEventListener('click',()=>decide('verification'));
  $('choiceBack').addEventListener('click',()=>{
    if(Story.backToRecords(state).ok){persist();resume();}
  });
  const commands={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',
    KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',
    ShiftLeft:'sprint',ShiftRight:'sprint',KeyC:'crouch'};
  global.addEventListener('keydown',e=>{
    if(choices.classList.contains('hidden')===false){
      if(e.code==='Digit1'){e.preventDefault();decide('evacuation');}
      if(e.code==='Digit2'){e.preventDefault();decide('verification');}
      if(e.code==='Escape'){e.preventDefault();$('choiceBack').click();}
      return;
    }
    if(e.code==='Escape'&&running){e.preventDefault();menuOpen('일시정지됨. 이어하기를 눌러 재개하세요.');return;}
    if(!running)return;
    if(commands[e.code]){e.preventDefault();input[commands[e.code]]=true;}
    if(e.code==='KeyE'){e.preventDefault();interact();}
    if(e.code==='Space'){e.preventDefault();fire();}
    if(e.code==='KeyQ'){e.preventDefault();support();}
    if(e.code==='KeyR'){e.preventDefault();reload();}
    if(e.code==='KeyH'){e.preventDefault();toggleReloadAssist();}
  });
  global.addEventListener('keyup',e=>{if(commands[e.code])input[commands[e.code]]=false;});
  // Losing focus must not leave the player exposed to hostile volleys or advance
  // a timed route while they cannot control the game. Persist at the pause boundary.
  function pauseForBackground(){
    clearInput();clock.reset();limiter.reset();last=performance.now();
    if(running)menuOpen('창이 비활성화되어 자동 일시정지했습니다. 이어하기를 눌러 재개하세요.');
  }
  global.addEventListener('blur',pauseForBackground);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)pauseForBackground();
    else {clearInput();clock.reset();limiter.reset();last=performance.now();}
  });
  document.addEventListener('pointerlockchange',()=>{
    if(!isTouch&&running&&document.pointerLockElement!==canvas)menuOpen('일시정지됨. 이어하기를 눌러 재개하세요.');
  });
  function look(dx,dy){
    const p=state.world.player;
    p.yaw+=dx*.0023;p.pitch=Math.max(-.33,Math.min(.35,p.pitch-dy*.00165));
  }
  global.addEventListener('mousemove',e=>{if(running&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
  canvas.addEventListener('click',()=>{
    if(!running||isTouch)return;
    if(document.pointerLockElement===canvas)fire();
    else if(canvas.requestPointerLock)canvas.requestPointerLock();
  });
  let touchLookId=null,previous=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!isTouch||!running)return;
    touchLookId=e.pointerId;previous={x:e.clientX,y:e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(touchLookId!==e.pointerId||!previous||!running)return;
    look(e.clientX-previous.x,e.clientY-previous.y);
    previous={x:e.clientX,y:e.clientY};
  });
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{
    if(touchLookId===e.pointerId){touchLookId=null;previous=null;}
  });
  for(const button of document.querySelectorAll('[data-move]')){
    const name=button.dataset.move;
    button.addEventListener('pointerdown',e=>{e.preventDefault();input[name]=true;button.setPointerCapture(e.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])
      button.addEventListener(event,()=>{input[name]=false;});
  }
  $('touchInteract').addEventListener('click',interact);
  $('touchFire').addEventListener('click',fire);
  $('touchReload').addEventListener('click',reload);
  $('touchAssist').addEventListener('click',toggleReloadAssist);
  $('touchSupport').addEventListener('click',support);
  $('touchSprint').addEventListener('pointerdown',e=>{e.preventDefault();input.sprint=true;$('touchSprint').setPointerCapture(e.pointerId);});
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
    // Map depicts accessible objectives and the player's location, not unseen opponents.
    const p=state.world.player;
    ctx.fillStyle='#faffd4';ctx.beginPath();ctx.arc(tx(p.x),tz(p.z),4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#faffd4';ctx.beginPath();ctx.moveTo(tx(p.x),tz(p.z));
    ctx.lineTo(tx(p.x)+Math.sin(p.yaw)*12,tz(p.z)-Math.cos(p.yaw)*12);ctx.stroke();
  }
  function updateHud(){
    $('objective').textContent=Story.objective(state);
    $('status').textContent=state.message+' · 경과 '+Math.floor(state.world.elapsed)+'초'+
      (state.world.player.sprintExhausted?' · 지구력 회복 중: 25까지 회복해야 다시 달릴 수 있습니다.':'');
    $('subtitle').textContent=state.subtitle;
    const situation=Story.situation(state);
    $('routeStatus').textContent=situation.route+' · '+situation.civilianConsequence;
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
      $('combatStatus').textContent='장비 '+Sim.FIREARMS[p.weaponId].label+' · 무장 대치자 '+state.world.bots.filter(b=>b.alive).length+'/3 · 탄창 '+p.loaded+' / 예비 '+(p.charges-p.loaded)+(p.reloadRemaining>0?(p.reloadHesitation?' · 장전 지연 · R/장전 다시 눌러 복구':' · 재장전 중'):'')+' · 긴장 '+Math.round(p.stress||0)+' · 이동 능력 '+Math.round(Sim.injuryMobility(p)*100)+'% · 장전 보조 '+(p.reloadAssist?'켜짐':'꺼짐')+' · 동료 보고 '+(state.combat.supportUsed?'확인 완료':'Q 확인 가능')+' · 보급 '+(state.combat.supplyUsed?'사용 완료':'E 1회 가능');
    }
    const entries=state.found.map(id=>Story.RECORDS[id]);
    $('records').textContent=entries.length
      ?entries.map(r=>r.title+' / '+r.time).join(' · ')+(entries.length===2?' / 시간 불일치 확인':'')
      :'기록 0/2 · 조사하지 않아도 대피할 수 있습니다.';
    const nearby=running?Story.nearest(state):null;
    $('interaction').classList.toggle('hidden',!nearby);
    if(nearby)$('interaction').textContent='[E] '+nearby.label+(nearby.kind==='ammo'?' 보급':' 조사');
    const f=limiter.stats();
    $('fps').textContent='FPS: '+(f.actualFps||'--')+' / 상한 '+f.cap+' · 시뮬레이션 60Hz';
    minimap();
  }
  function frame(now){
    global.requestAnimationFrame(frame);
    const dt=Math.min(Math.max((now-last)/1000,0),.25);last=now;
    const gatePending=running&&state.phase==='exit'&&state.choice==='verification'&&
      !Story.situation(state).eastGateOpen;
    const healthBefore=state.world.player.health;
    if(running&&state.phase!=='complete'&&state.phase!=='failed')clock.advance(dt,step=>Story.step(state,step,input));
    // A hostile hit is a durable gameplay consequence. Save once per actual
    // damage event, never every 60Hz tick; terminal failure saves below.
    if(running&&state.phase==='engagement'&&state.world.player.health<healthBefore){
      audio.play('impact');persist();
    }
    // Persist the actual world transition once, rather than writing every 60Hz tick.
    if(gatePending&&Story.situation(state).eastGateOpen)persist();
    if(running&&state.phase==='failed'){
      persist();menuOpen('교전 중 임무가 중단되었습니다. 처음부터 다시 시작할 수 있습니다.');
    }
    // The existing finite damageFlash timer is already advanced by the fixed
    // 60Hz story step. Present a brief non-directional edge cue (no enemy radar).
    $('damageIndicator').style.opacity=String(running?Math.min(.65,Math.max(0,state.world.damageFlash/.45*.65)):0);
    if(renderer&&limiter.shouldRender(now))renderer.draw(state.world);
    if(now-lastHud>180){lastHud=now;updateHud();}
  }
  checkpoint=storage.get(SAVE_KEY);
  const loaded=readCheckpoint();
  if(loaded&&loaded.phase!=='complete'){
    $('continue').textContent='체크포인트 이어하기';
    $('menuText').textContent='이전 진행 기록이 있습니다. 이어하기를 누르면 마지막 자동 저장 위치부터 시작합니다.';
  }
  $('app').classList.toggle('reduced',$('reducedMotion').checked);
  updateHud();global.requestAnimationFrame(frame);
})(globalThis);
