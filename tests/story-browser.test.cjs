'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(sharedStore=new Map(),touch=false,pointerLock='granted',finePointer=!touch,windows=false,storageBlocked=false,checkpointReadFailures=0,audioContext=null){
  const listeners=new Map(),nodes=new Map();
  let grantPointerLock=null;
  const ctx2d={fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
  const makeClassList=hidden=>{
    const classes=new Set(hidden?['hidden']:[]);
    return {add:v=>classes.add(v),remove:v=>classes.delete(v),
      toggle:(v,force)=>{if(force===true)classes.add(v);else if(force===false)classes.delete(v);else if(classes.has(v))classes.delete(v);else classes.add(v);},
      contains:v=>classes.has(v)};
  };
  function element(id){
    if(nodes.has(id))return nodes.get(id);
    const events=new Map();
    const el={
      id,style:{},dataset:{},textContent:'',value:'',checked:false,disabled:false,
      width:240,height:150,clientWidth:960,clientHeight:540,
      classList:makeClassList(['choices','fieldJournal','interaction','reviewCompleted','debriefReview','saveExit','saveCheckpoint','restorePrevious'].includes(id)),
      addEventListener:(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);},
      dispatch:(name,event={})=>{for(const fn of events.get(name)||[])fn({preventDefault(){},pointerId:1,...event});},
      click(){this.dispatch('click');},
      appendChild(child){this.children=this.children||[];this.children.push(child);},
      getContext:()=>ctx2d,
      setPointerCapture(){},
      focus(){document.activeElement=this;},
      blur(){if(document.activeElement===this)document.activeElement=null;},
      requestPointerLock(options){
        this.lastPointerLockOptions=options;
        this.ownerDocument=document;
        if(pointerLock==='late')return new Promise(resolve=>{
          grantPointerLock=()=>{document.pointerLockElement=this;resolve();};
        });
        if(pointerLock==='throw')throw new Error('pointer lock denied');
        if(pointerLock==='denied')return Promise.reject(new Error('pointer lock denied'));
        if(pointerLock==='pending')return new Promise(()=>{});
        document.pointerLockElement=this;return Promise.resolve();
      }
    };
    nodes.set(id,el);return el;
  }
  const mobileButtons=['forward','back','left','right'].map(name=>{
    const el=element('mobile-'+name);el.dataset.move=name;return el;
  });
  const document={
    activeElement:null,
    pointerLockElement:null,
    getElementById:element,
    createElement:tag=>({tagName:tag,textContent:''}),
    querySelectorAll:()=>mobileButtons,
    addEventListener:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
    exitPointerLock(){this.pointerLockElement=null;}
  };
  let remainingCheckpointReadFailures=checkpointReadFailures;
  const store={
    getItem:k=>{
      if(k==='veilpoint.story.ch01'&&remainingCheckpointReadFailures-->0)
        throw new Error('temporary_story_checkpoint_read_denial');
      return sharedStore.has(k)?sharedStore.get(k):null;
    },
    setItem:(k,v)=>sharedStore.set(k,String(v)),
    removeItem:k=>sharedStore.delete(k)
  };
  let now=0,frameCallback=null;
  const navigations=[];
  const context={
    document,localStorage:store,AudioContext:audioContext,
    location:{assign:url=>navigations.push(url)},
    performance:{now:()=>now},
    matchMedia:query=>({matches:query==='(any-pointer:fine)'?finePointer:touch}),
    navigator:windows?{platform:'Win32',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}:undefined,
    requestAnimationFrame:fn=>{frameCallback=fn;},
    addEventListener:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
    console,
    VeilpointRenderer:class{constructor(canvas){if(this.constructor.failNext){this.constructor.failNext=false;throw new Error('GPU restore unavailable');}this.canvas=canvas;}setGraphicsQuality(){}draw(){}}
  };
  context.globalThis=context;
  if(storageBlocked)Object.defineProperty(context,'localStorage',{
    get(){throw new Error('storage_denied');}
  });
  const scripts=['src/simulation.js','src/visibility.js','src/performance.js',
    'src/graphics.js','src/clock.js','src/fps.js','src/campaign.js','src/navigation.js',
    'src/ch01-civic-recovery.js','src/ch01-street-flood.js','src/story-slice.js','src/story-audio.js','src/desktop-controls.js',
    'src/checkpoint-recovery.js','src/field-journal.js','src/story-app.js'];
  for(const script of scripts){
    const source=fs.readFileSync(path.join(__dirname,'..',script),'utf8');
    vm.runInNewContext(source,context,{filename:script,timeout:1500});
  }
  return {
    element,store:sharedStore,context,navigations,
    grantPointerLock(){assert.equal(typeof grantPointerLock,'function');grantPointerLock();},
    emit(name,event){for(const fn of listeners.get(name)||[])fn({preventDefault(){},...event});},
    frame(ms){now=ms;const callback=frameCallback;assert.equal(typeof callback,'function');callback(ms);},
    moveForward(startFrame,count){
      context.VeilpointInput.forward=true;
      for(let i=1;i<=count;i++)this.frame((startFrame+i)*1000/60);
      context.VeilpointInput.forward=false;
    },
    interact(){this.emit('keydown',{code:'KeyF'});},
    clearEncounter(startFrame){
      // Real UI input path: pointer-locked mouse aim + SPACE, paced by the 60Hz clock.
      let frame=startFrame,yaw=0,shots=0;
      const aim=next=>{this.emit('mousemove',{movementX:(next-yaw)/.0023,movementY:0});yaw=next;};
      for(const next of [0,Math.atan2(15,15.5),Math.atan2(-15,15.5)]){
        aim(next);
        for(let shot=0;shot<2;shot++){
          // Actual pointer-locked mouse input counteracts the previous finite
          // camera kick, instead of letting an automated script aim magically.
          if(shots>0)this.emit('mousemove',{movementX:0,
            movementY:this.context.VeilpointSim.FIREARMS.carbine.recoilPitch/.00165});
          this.emit('keydown',{code:'Space'});
          shots++;
          for(let tick=0;tick<15;tick++){frame++;this.frame(frame*1000/60);}
        }
      }
      aim(0);
      assert.match(this.element('objective').textContent,/기록/,JSON.stringify(JSON.parse(this.store.get('veilpoint.story.ch01')||'null')));
      return frame;
    }
  };
}

test('browser story app initializes with objective, menu and 60Hz clock',()=>{
  const app=boot();
  assert.match(app.element('objective').textContent,/중계기/);
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  assert.equal(app.element('quality').value,'balanced');
  assert.match(app.element('fps').textContent,/60Hz/);
});
test('PC F directly activates a physically reached CH01 relay and checkpoints the changed world',()=>{
 const app=boot();
 app.element('continue').click();
 const desktop=app.context.VeilpointDesktopControls;
 assert.equal(desktop.actionFor('KeyF',desktop.load(app.context.localStorage)),
  'interact');
 assert.equal(app.context.document.pointerLockElement,app.element('scene'),
  'the active canvas owns PC aim before F interaction');
 app.moveForward(0,300);
 app.interact();
 assert.match(app.element('objective').textContent,/무장 대치자/,
  'only a real terminal interaction can transition the mission phase');
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).phase,'engagement',
  'successful F interaction must persist the physical mission transition');
});
test('end-to-end CH01 browser UI: start, relay, optional evacuation, exit and save',()=>{
  const app=boot();
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  app.moveForward(0,300);
  app.interact();
  assert.match(app.element('objective').textContent,/무장 대치자/);
  assert.ok(app.store.has('veilpoint.story.ch01'));
  const frame=app.clearEncounter(300);
  app.moveForward(frame,225);
  app.interact();
  assert.equal(app.element('choices').classList.contains('hidden'),false);
  assert.equal(app.element('choiceVerified').disabled,false);
  app.element('choiceEvac').click();
  assert.match(app.element('objective').textContent,/안뜰/);
  app.moveForward(frame+225,193);
  app.interact();
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  assert.match(app.element('menuText').textContent,/CH01 완료/);
  const save=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(save.phase,'complete');
  assert.equal(save.choice,'evacuation');
  assert.equal(app.store.has('veilpoint.campaignProgress'),false);
  const report=JSON.parse(app.store.get('veilpoint.story.ch01PreviewCompleted'));
  assert.equal(report.route,'evacuation');
  assert.equal(report.previewOnly,true);
  assert.equal(report.campaignUnlocked,false);
  assert.equal(report.civilianOutcome,'south-evacuation-prioritized');
  assert.match(app.element('menuText').textContent,/남쪽 대피/);
});
test('completed CH01 reads four consequence-specific lines via existing PC menu without scrolling or state changes',()=>{
 const app=boot();
 app.element('continue').click();app.moveForward(0,300);app.interact();
 const frame=app.clearEncounter(300);
 app.moveForward(frame,225);app.interact();app.element('choiceEvac').click();
 app.moveForward(frame+225,193);app.interact();
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.match(app.element('menuText').textContent,/남쪽 대피.*대화 1\/4.*유수프/);
 assert.equal(app.element('storyMenuAbout').textContent,'다음 대화 (2/4)');
 const checkpoint=app.store.get('veilpoint.story.ch01');
 const preview=app.store.get('veilpoint.story.ch01PreviewCompleted');
 for(const [n,name] of [[2,'조현지'],[3,'김지윤'],[4,'이수혁']]){
  app.element('storyMenuAbout').click();
  assert.match(app.element('menuText').textContent,new RegExp('대화 '+n+'/4.*'+name));
  assert.equal(app.store.get('veilpoint.story.ch01'),checkpoint,
    'post-scene dialogue must not rewrite or advance a completed 60Hz world');
  assert.equal(app.store.get('veilpoint.story.ch01PreviewCompleted'),preview);
 }
 assert.equal(app.element('storyMenuAbout').textContent,'CH01 설명 전체 보기');
 app.element('storyMenuAbout').click();
 assert.equal(app.element('menu').classList.contains('menu-view-about'),true);
 assert.equal(app.store.has('veilpoint.campaignProgress'),false);
});

test('story checkpoint survives new browser context and does not modify BR settings',()=>{
  const shared=new Map();
  const app=boot(shared);
  app.element('continue').click();
  app.moveForward(0,300);
  app.interact();
  const reloaded=boot(shared);
  assert.match(reloaded.element('menuText').textContent,/이전 진행 기록/);
  reloaded.element('continue').click();
  assert.match(reloaded.element('objective').textContent,/무장 대치자/);
  reloaded.element('pauseButton').click();
  assert.equal(reloaded.element('menu').classList.contains('hidden'),false);
  reloaded.element('newGame').click();
  assert.match(reloaded.element('objective').textContent,/중계기/);
  assert.equal(shared.has('veilpoint.campaignProgress'),false);
});
test('story graphics preset is shared and remains user-selectable',()=>{
  const shared=new Map();
  const app=boot(shared);
  const quality=app.element('quality');
  quality.value='hyperreal165';quality.dispatch('change');
  assert.equal(JSON.parse(shared.get('veilpoint.graphics')).fpsCap,165);
  const reload=boot(shared);
  assert.equal(reload.element('quality').value,'hyperreal165');
  reload.element('quality').value='eco';reload.element('quality').dispatch('change');
  assert.equal(JSON.parse(shared.get('veilpoint.graphics')).fpsCap,60);
});

test('choice overlay can return to investigation and reopen without soft-lock',()=>{
  const app=boot();
  app.element('continue').click();
  app.moveForward(0,300);
  app.interact();
  const frame=app.clearEncounter(300);
  app.moveForward(frame,225);
  app.interact();
  assert.equal(app.element('choices').classList.contains('hidden'),false);
  app.element('choiceBack').click();
  assert.equal(app.element('choices').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/기록/);
  app.interact();
  assert.equal(app.element('choices').classList.contains('hidden'),false);
  app.element('choiceEvac').click();
  assert.equal(app.element('choices').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/안뜰/);
});

test('CH01 pause persists elapsed progress outside combat rather than rewinding it',()=>{
  const app=boot();app.element('continue').click();app.moveForward(0,300);app.interact();
  const frame=app.clearEncounter(300);
  const savedBefore=JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed;
  app.moveForward(frame,60);
  app.element('pauseButton').click();
  const savedAfter=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(savedAfter.phase,'records');
  assert.ok(savedAfter.elapsed>savedBefore);
  const reloaded=boot(app.store);reloaded.element('continue').click();
  assert.match(reloaded.element('objective').textContent,/기록/);
});
test('CH01 timed clearance is persisted by browser clock and survives reload without repeating wait',()=>{
  const Story=require('../src/story-slice.js');
  const state=Story.createState();
  state.phase='decision';state.found=['recordA','recordB'];
  state.combat.started=true;state.combat.cleared=true;
  // Completed encounters retain a valid physical pose in the new checkpoint schema.
  state.world.bots=[{x:0,z:-28},{x:15,z:-34},{x:-15,z:-34}].map(({x,z},id)=>
    ({id,x,z,angle:Math.PI,health:0,alive:false,shots:12}));
  assert.equal(Story.choose(state,'verification').ok,true);
  const shared=new Map([['veilpoint.story.ch01',Story.serialize(state)]]);
  const app=boot(shared);app.element('continue').click();
  assert.match(app.element('objective').textContent,/개방 작업 중/);
  for(let i=1;i<=510;i++)app.frame(i*1000/60);
  const saved=Story.restore(shared.get('veilpoint.story.ch01'));
  assert.equal(Story.situation(saved).eastGateOpen,true);
  assert.ok(saved.world.elapsed>=Story.GATE_CLEARANCE_SECONDS);
  const reloaded=boot(shared);reloaded.element('continue').click();
  assert.match(reloaded.element('objective').textContent,/추가 확인 경로/);
});

test('CH01 focus loss pauses hostile time, persists progress and resumes without a time jump',()=>{
  const app=boot();
  app.element('continue').click();app.moveForward(0,300);app.interact();
  app.frame(301*1000/60);
  app.emit('blur');
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  assert.match(app.element('menuText').textContent,/자동 일시정지/);
  const paused=JSON.parse(app.store.get('veilpoint.story.ch01'));
  for(let i=302;i<=800;i++)app.frame(i*1000/60);
  app.element('continue').click();
  app.frame(801*1000/60);
  app.element('pauseButton').click();
  const resumed=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.ok(resumed.elapsed-paused.elapsed<0.05,'hidden frames cannot advance enemy attacks or timers');
  assert.equal(resumed.player.health,paused.player.health);
  app.element('continue').click();
  app.context.document.hidden=true;app.emit('visibilitychange');
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  const hidden=JSON.parse(app.store.get('veilpoint.story.ch01'));
  for(let i=802;i<=1000;i++)app.frame(i*1000/60);
  assert.equal(app.store.get('veilpoint.story.ch01'),JSON.stringify(hidden));
});

test('CH01 automatically checkpoints actual hostile damage before browser refresh',()=>{
  const app=boot();
  app.element('continue').click();app.moveForward(0,300);app.interact();
  const before=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(before.player.health,100);
  for(let i=301;i<=540;i++)app.frame(i*1000/60);
  const after=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(after.phase,'engagement');
  assert.ok(after.player.health<before.player.health,'hostile damage must persist without manual pause');
  assert.ok(after.combat.drones.some(hostile=>hostile.shots>0));
  const refreshed=boot(app.store);refreshed.element('continue').click();
  refreshed.element('pauseButton').click();
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.health,after.player.health);
});

test('CH01 discards stale touch-look pointer after pausing without blocking fresh gestures',()=>{
  const app=boot(new Map(),true);
  app.element('continue').click();
  const scene=app.element('scene');
  scene.dispatch('pointerdown',{pointerId:7,clientX:100,clientY:100});
  scene.dispatch('pointermove',{pointerId:7,clientX:120,clientY:100});
  app.emit('blur');
  const paused=JSON.parse(app.store.get('veilpoint.story.ch01')).player.yaw;
  app.element('continue').click();
  scene.dispatch('pointermove',{pointerId:7,clientX:500,clientY:100});
  app.element('pauseButton').click();
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.yaw,paused,
    'stale pointer movement after resume cannot rotate the camera');
  app.element('continue').click();
  scene.dispatch('pointerdown',{pointerId:8,clientX:100,clientY:100});
  scene.dispatch('pointermove',{pointerId:8,clientX:130,clientY:100});
  app.element('pauseButton').click();
  assert.notEqual(JSON.parse(app.store.get('veilpoint.story.ch01')).player.yaw,paused,
    'a new gesture must still control the camera');
});
test('CH01 browser menu selects a real finite firearm class, persists it and respects explicit new-game changes',()=>{
  const app=boot();
  assert.equal(app.element('storyWeapon').value,'carbine');
  app.element('storyWeapon').value='compact';
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  let saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(saved.player.weaponId,'compact');
  assert.equal(saved.player.loaded,18);
  assert.equal(saved.player.charges,54);
  assert.match(app.element('combatStatus').textContent,/COMPACT.*탄창 18/);
  app.element('pauseButton').click();
  const resumed=boot(app.store);
  resumed.element('storyWeapon').value='marksman'; // saved mission must win over menu choice
  resumed.element('continue').click();
  assert.equal(resumed.element('storyWeapon').value,'compact');
  assert.match(resumed.element('combatStatus').textContent,/COMPACT/);
  resumed.element('pauseButton').click();
  resumed.element('storyWeapon').value='marksman';
  resumed.element('newGame').click();
  resumed.moveForward(0,300);resumed.interact();
  saved=JSON.parse(resumed.store.get('veilpoint.story.ch01'));
  assert.equal(saved.player.weaponId,'marksman');
  assert.equal(saved.player.loaded,8);
  assert.equal(saved.player.charges,32);
  assert.match(resumed.element('combatStatus').textContent,/MARKSMAN.*탄창 8/);
});

test('real CH01 keyboard and touch reload inputs correct stress hesitation after a short delay',()=>{
 const Story=require('../src/story-slice.js');
 for(const touch of [false,true]){
  const state=Story.createState('marksman');
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).ok,true);
  state.world.player.loaded=2;state.world.player.stress=90;
  const shared=new Map([['veilpoint.story.ch01',Story.serialize(state)]]);
  const app=boot(shared,touch);
  app.element('continue').click();
  const press=()=>touch?app.element('touchReload').click():app.emit('keydown',{code:'KeyR'});
  press();
  const initial=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.equal(initial.player.reloadHesitation,true);
  press();
  assert.match(app.element('subtitle').textContent,/안정되면/);
  for(let i=1;i<=18;i++)app.frame(i*1000/60);
  press();
  const recovered=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.equal(recovered.player.reloadHesitation,false);
  assert.ok(recovered.player.reloadRemaining>=0.25);
  assert.ok(recovered.player.reloadRemaining<initial.player.reloadRemaining);
  assert.equal(recovered.player.charges,initial.player.charges);
  assert.equal(recovered.player.loaded,initial.player.loaded);
  press();
  assert.equal(shared.get('veilpoint.story.ch01'),JSON.stringify(recovered),'repeat correction must not alter saved rounds');
  const reloaded=boot(shared,touch);
  reloaded.element('continue').click();
  assert.match(reloaded.element('combatStatus').textContent,/재장전 중/);
  assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).player.charges,initial.player.charges);
 }
});

test('CH01 real browser input path exposes injury state and transient non-omniscient damage cue',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
  assert.match(html,/id="healthStatus"/);
  assert.match(html,/id="damageIndicator" aria-hidden="true"/);
  const app=boot();
  assert.equal(app.element('healthStatus').classList.contains('hidden'),true);
  app.element('continue').click();app.moveForward(0,300);app.interact();
  assert.match(app.element('healthStatus').textContent,/건강 상태 100\/100.*안정/);
  let flashed=false;
  for(let i=301;i<=540;i++){
    app.frame(i*1000/60);
    if(Number(app.element('damageIndicator').style.opacity)>0)flashed=true;
  }
  assert.equal(flashed,true,'a real hostile hit must be perceivable without revealing an enemy position');
  const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.ok(saved.player.health<100);
  assert.match(app.element('healthStatus').textContent,/건강 상태 [0-9]+\/100.*부상/);
  const restored=boot(app.store);restored.element('continue').click();
  assert.match(restored.element('healthStatus').textContent,new RegExp('건강 상태 '+saved.player.health+'/100'));
  restored.element('pauseButton').click();restored.frame(10000);
  assert.equal(Number(restored.element('damageIndicator').style.opacity),0);
});

test('CH01 restored exhaustion displays understandable recovery guidance in the real HUD path',()=>{
 const StoryRules=require('../src/story-slice.js');
 const state=StoryRules.createState();
 state.world.player.stamina=10;state.world.player.sprintExhausted=true;
 const store=new Map([['veilpoint.story.ch01',StoryRules.serialize(state)]]);
 const app=boot(store);app.element('continue').click();
 assert.match(app.element('status').textContent,/지구력 회복 중.*25/);
 const fresh=boot();fresh.element('continue').click();
 assert.doesNotMatch(fresh.element('status').textContent,/지구력 회복 중/);
});

test('CH01 sound option persists across refresh and does not affect the BR save',()=>{
  const store=new Map();
  const first=boot(store);
  assert.equal(first.element('soundEnabled').checked,true);
  first.element('soundEnabled').checked=false;
  first.element('soundEnabled').dispatch('change');
  assert.equal(store.get('veilpoint.story.audio'),'off');
  const second=boot(store);
  assert.equal(second.element('soundEnabled').checked,false);
  second.element('soundEnabled').checked=true;
  second.element('soundEnabled').dispatch('change');
  assert.equal(store.get('veilpoint.story.audio'),'on');
  assert.equal(store.has('veilpoint.campaignProgress'),false);
});


test('CH01 finite supply UI reports partial stock, carrying limit and checkpoint recovery',()=>{
  const Story=require('../src/story-slice.js');
  const state=Story.createState('carbine');
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).ok,true);
  state.world.player.x=Story.POINTS.supply.x;
  state.world.player.z=Story.POINTS.supply.z;
  state.world.player.charges=state.world.player.maxCharges-1;
  const store=new Map([['veilpoint.story.ch01',Story.serialize(state)]]);
  const app=boot(store);
  app.element('continue').click();
  assert.match(app.element('combatStatus').textContent,/상자 잔량 12발.*접근 후 F/);
  assert.match(app.element('interaction').textContent,/잔량 12발.*필요한 만큼 확보/);
  app.interact();
  let saved=JSON.parse(store.get('veilpoint.story.ch01'));
  assert.equal(saved.combat.supplyRemaining,11);
  assert.equal(saved.combat.supplyUsed,false);
  assert.match(app.element('combatStatus').textContent,/휴대 한도 도달.*11발/);
  assert.match(app.element('interaction').textContent,/잔량 11발.*휴대 한도 도달/);
  assert.doesNotMatch(app.element('interaction').textContent,/\[F\]/);
  const resumed=boot(store);
  resumed.element('continue').click();
  assert.match(resumed.element('combatStatus').textContent,/휴대 한도 도달.*11발/);
  const rules=Story.restore(store.get('veilpoint.story.ch01'));
  rules.world.player.charges-=11;
  store.set('veilpoint.story.ch01',Story.serialize(rules));
  const final=boot(store);final.element('continue').click();
  assert.match(final.element('interaction').textContent,/잔량 11발.*\[F\]/);
  final.interact();
  saved=JSON.parse(store.get('veilpoint.story.ch01'));
  assert.equal(saved.combat.supplyRemaining,0);
  assert.equal(saved.combat.supplyUsed,true);
  assert.match(final.element('combatStatus').textContent,/보급 소진/);
  assert.equal(final.element('interaction').classList.contains('hidden'),true);
});

test('CH01 a missed hostile shot persists finite ammunition without a phantom injury',()=>{
  const Story=require('../src/story-slice.js');
  const state=Story.createState();
  state.world.player.x=Story.POINTS.terminal.x;
  state.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(state).ok,true);
  const [left,shooter,right]=state.world.bots;
  for(const hostile of [left,right]){hostile.health=0;hostile.alive=false;}
  state.world.player.x=15;state.world.player.z=-18;
  state.combat.nextPulseAt=0; // One scheduled, visible hostile volley.
  const shared=new Map([['veilpoint.story.ch01',Story.serialize(state)]]);
  const app=boot(shared);app.element('continue').click();
  // Actual lateral movement widens the physical shot spread; a held key with
  // no travel would not grant a fictitious dodge bonus.
  app.context.VeilpointInput.right=true;
  app.frame(1000/60);
  const saved=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.equal(saved.phase,'engagement');
  assert.equal(saved.player.health,100,'the physically traced hostile round misses');
  assert.equal(saved.combat.drones[1].shots,1,'missed rounds are still spent');
  assert.equal(saved.combat.drones[0].shots,0);
  assert.equal(saved.combat.drones[2].shots,0);
  assert.equal(Story.restore(JSON.stringify(saved)).world.bots[1].shots,1);
  const reloaded=boot(shared);reloaded.element('continue').click();
  assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).combat.drones[1].shots,1);
});


test('CH01 periodically checkpoints quiet first-person traversal and restores the actual pose',()=>{
  const shared=new Map(),app=boot(shared);
  app.element('continue').click();
  app.context.VeilpointInput.forward=true;
  for(let i=1;i<=240;i++)app.frame(i*1000/60);
  assert.equal(shared.has('veilpoint.story.ch01'),false,'no per-frame save before the five-second interval');
  for(let i=241;i<=360;i++)app.frame(i*1000/60);
  app.context.VeilpointInput.forward=false;
  const saved=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.equal(saved.phase,'terminal');
  assert.ok(saved.elapsed>=5&&saved.elapsed<=6.01);
  assert.ok(saved.player.z<12,'actual player traversal must survive refresh');
  const reloaded=boot(shared);reloaded.element('continue').click();
  reloaded.element('pauseButton').click();
  const resumed=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.equal(resumed.player.z,saved.player.z);
  assert.equal(resumed.player.stamina,saved.player.stamina);
  assert.equal(resumed.player.charges,saved.player.charges);
});

test('CH01 autosave is bounded, pauses with the game and resets after a new mission',()=>{
  class CountingStore extends Map{
    writes=0;
    set(key,value){if(key==='veilpoint.story.ch01')this.writes++;return super.set(key,value);}
  }
  const shared=new CountingStore(),app=boot(shared);
  app.element('continue').click();
  for(let i=1;i<=360;i++)app.frame(i*1000/60);
  assert.equal(shared.writes,1,'one periodic save for six seconds of gameplay');
  for(let i=361;i<=720;i++)app.frame(i*1000/60);
  assert.equal(shared.writes,2,'the next periodic save is spaced by simulated time');
  app.element('pauseButton').click();
  const pausedWrites=shared.writes;
  for(let i=721;i<=1200;i++)app.frame(i*1000/60);
  assert.equal(shared.writes,pausedWrites,'paused frames must not write or advance time');
  app.element('newGame').click();
  assert.equal(shared.has('veilpoint.story.ch01'),false,'new mission removes old checkpoint');
  for(let i=1201;i<=1320;i++)app.frame(i*1000/60);
  assert.equal(shared.has('veilpoint.story.ch01'),false,'new mission cannot inherit old autosave deadline');
});


test('CH01 reports blocked offline checkpoint storage and clears warning after a successful retry',()=>{
  class FailingStore extends Map{
    fail=true;
    set(key,value){if(this.fail&&key==='veilpoint.story.ch01')throw new Error('storage quota or privacy block');return super.set(key,value);}
  }
  const shared=new FailingStore(),app=boot(shared);
  app.element('continue').click();
  for(let i=1;i<=360;i++)app.frame(i*1000/60);
  assert.equal(shared.has('veilpoint.story.ch01'),false);
  assert.equal(app.element('saveStatus').classList.contains('hidden'),false);
  assert.match(app.element('saveStatus').textContent,/저장 실패.*새로고침/);
  app.element('pauseButton').click();
  assert.match(app.element('menuText').textContent,/저장 실패.*새로고침/);
  shared.fail=false;
  app.element('continue').click();
  for(let i=361;i<=720;i++)app.frame(i*1000/60);
  assert.equal(shared.has('veilpoint.story.ch01'),true);
  assert.equal(app.element('saveStatus').classList.contains('hidden'),true);
  assert.equal(app.element('saveStatus').textContent,'');
  assert.equal(shared.has('veilpoint.campaignProgress'),false);
});

test('CH01 freezes hostile clock and keyboard actions while desktop pointer lock is pending',()=>{
  const app=boot(new Map(),false,'pending');
  app.element('continue').click();
  app.moveForward(0,120);
  app.interact();
  app.emit('keydown',{code:'Space'});
  app.emit('blur');
  const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(saved.elapsed,0);
  assert.equal(saved.player.z,12,'initial CH01 spawn must not move without pointer lock');
  assert.equal(saved.phase,'terminal','pending lock cannot activate the relay');
  app.element('continue').click();
  app.context.document.pointerLockElement=app.element('scene');
  app.moveForward(120,10);
  app.element('pauseButton').click();
  assert.ok(JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed>0);
});

test('CH01 rejected pointer lock opens explicit checkpoint pause rather than live hostile combat',async()=>{
  const app=boot(new Map(),false,'denied');
  app.element('continue').click();
  app.frame(1000);
  await Promise.resolve();await Promise.resolve();
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  assert.match(app.element('menuText').textContent,/포인터 잠금/);
  const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(saved.elapsed,0);
  app.frame(2000);
  assert.equal(app.store.get('veilpoint.story.ch01'),JSON.stringify(saved));
});

test('CH01 handles unavailable and throwing pointer-lock APIs without dropping mission state',()=>{
  for(const mode of ['missing','throw']){
    const app=boot(new Map(),false,mode);
    if(mode==='missing')delete app.element('scene').requestPointerLock;
    app.element('continue').click();
    assert.equal(app.element('menu').classList.contains('hidden'),false,mode);
    assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed,0,mode);
  }
});

test('CH01 pagehide pauses mission and persists its elapsed checkpoint',()=>{
  const app=boot();
  app.element('continue').click();
  app.moveForward(0,12);
  app.emit('pagehide');
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
  app.frame(1000);
  assert.equal(app.store.get('veilpoint.story.ch01'),JSON.stringify(saved));
});

test('CH01 shares PC mouse and keyboard preferences with BR without changing story save',()=>{
 const store=new Map();
 const app=boot(store);
 app.element('desktopBindAction').value='interact';
 app.element('desktopBindKey').click();
 app.emit('keydown',{code:'KeyT'});
 app.element('desktopSensitivity').value='2';
 app.element('desktopSensitivity').dispatch('change');
 app.element('desktopInvertY').checked=true;
 app.element('desktopInvertY').dispatch('change');
 app.element('continue').click();
 const before=app.context.VeilpointInput.forward;
 app.emit('keydown',{code:'KeyW'});
 assert.equal(app.context.VeilpointInput.forward,true);
 app.emit('keyup',{code:'KeyW'});
 assert.equal(app.context.VeilpointInput.forward,false);
 const saveBefore=store.get('veilpoint.story.ch01');
 app.emit('keydown',{code:'KeyE'});
 assert.equal(store.get('veilpoint.story.ch01'),saveBefore,'old interact key cannot trigger story state');
 app.emit('mousemove',{movementX:100,movementY:10});
 app.emit('keydown',{code:'Escape'});
 const checkpoint=JSON.parse(store.get('veilpoint.story.ch01'));
 assert.ok(Math.abs(checkpoint.player.yaw-.46)<1e-9);
 assert.ok(checkpoint.player.pitch>0,'CH01 Y inversion changes saved first-person aim');
 const again=boot(store);
 assert.equal(again.element('desktopSensitivity').value,'2');
 again.element('desktopBindAction').value='interact';again.element('desktopBindAction').dispatch('change');
 assert.equal(again.element('desktopBindKey').textContent,'KeyT');
});

test('PC CH01 repeated accessibility keydown cannot reverse the chosen reload assist', () => {
  const app = boot();
  app.element('continue').click();
  app.emit('keydown', {code: 'KeyH'});
  const saved = JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(saved.player.reloadAssist, true);
  app.emit('keydown', {code: 'KeyH', repeat: true});
  const after = JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(after.player.reloadAssist, true);
});

test('CH01 PC focused settings cannot spend ammunition during an active encounter',()=>{
  const app=boot();
  app.element('continue').click();
  app.moveForward(0,300);
  app.interact();
  const before=JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges;
  app.emit('keydown',{code:'Space',target:{tagName:'SELECT'}});
  app.emit('keydown',{code:'Space',target:{tagName:'SPAN',parentElement:{tagName:'A',href:'#help'}}});
  app.emit('keydown',{code:'Space',target:{tagName:'DIV',role:'button'}});
  app.element('pauseButton').click();
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,before);
  app.element('continue').click();
  app.emit('keydown',{code:'Space'});
  app.element('pauseButton').click();
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,before-1,
    'unfocused gameplay key must still fire exactly one finite shot');
});

test('Windows coarse-only CH01 freezes the mission until PC pointer lock and hides touch overlay',()=>{
 const app=boot(new Map(),true,'pending',false,true);
 app.element('continue').click();
 assert.equal(app.element('mobile').style.display,'none');
 app.moveForward(0,15);
 app.interact();
 app.emit('keydown',{code:'Space'});
 app.element('pauseButton').click();
 const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 assert.equal(saved.elapsed,0);
 assert.equal(saved.player.z,12);
 assert.equal(saved.phase,'terminal');
 app.element('continue').click();
 app.context.document.pointerLockElement=app.element('scene');
 app.moveForward(15,12);
 app.element('pauseButton').click();
 assert.ok(JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed>0);
});

test('PC hybrid CH01 waits for mouse pointer lock and then accepts keyboard/mouse aim',()=>{
 const app=boot(new Map(),true,'pending',true);
 app.element('continue').click();
 app.frame(1000/60);
 const input=app.context.VeilpointInput;
 app.emit('keydown',{code:'KeyW'});
 app.emit('mousemove',{movementX:100,movementY:0});
 assert.equal(input.forward,false,'hybrid PC must not move before pointer lock');
 app.context.document.pointerLockElement=app.element('scene');
 app.emit('keydown',{code:'KeyW'});
 app.emit('mousemove',{movementX:100,movementY:0});
 assert.equal(input.forward,true);
 app.element('pauseButton').click();
 const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 assert.ok(saved.player.yaw>0,'mouse movement must update first-person aim');
});

test('PC CH01 Start/Resume focuses the canvas rather than a menu control',()=>{
 const app=boot();
 app.context.document.activeElement=app.element('continue');
 app.element('continue').click();
 assert.equal(app.context.document.activeElement,app.element('scene'));
 app.element('pauseButton').click();
 app.context.document.activeElement=app.element('continue');
 app.element('continue').click();
 assert.equal(app.context.document.activeElement,app.element('scene'));
});
test('PC CH01 held fire follows 60Hz cadence; keyboard repeats add no extra rounds',()=>{
 const app=boot();app.element('continue').click();
 app.moveForward(0,300);app.interact();
 let saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 const before=saved.player.charges;
 app.emit('keydown',{code:'Space'});
 saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 assert.equal(saved.player.charges,before-1);
 app.moveForward(300,30);
 saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 assert.ok(saved.player.charges<before-1,'held automatic rounds use 60Hz steps');
 const afterHeld=saved.player.charges;
 for(let i=0;i<5;i++)app.emit('keydown',{code:'Space',repeat:true});
 saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 assert.equal(saved.player.charges,afterHeld,'OS repeat without ticks is inert');
 app.emit('keyup',{code:'Space'});
 app.moveForward(330,30);
 saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
 assert.equal(saved.player.charges,afterHeld,'key release ends held fire');
});
test('PC CH01 mouse hold and release preserve finite ammunition',()=>{
 const app=boot();app.element('continue').click();
 app.moveForward(0,300);app.interact();
 const before=JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges;
 app.element('scene').dispatch('mousedown',{button:0});
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,before-1);
 app.moveForward(300,35);
 const after=JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges;
 assert.ok(after<before-1);
 app.emit('mouseup',{button:0});
 app.moveForward(335,35);
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,after);
});

test('PC CH01 simultaneous mouse and keyboard hold survives either release and clears on pause',()=>{
 const app=boot();app.element('continue').click();
 app.moveForward(0,300);app.interact();
 const p=app.context.VeilpointInput;
 app.emit('keydown',{code:'Space'});
 app.element('scene').dispatch('mousedown',{button:0});
 app.emit('keyup',{code:'Space'});
 assert.equal(p.fireHeld,true,'mouse keeps automatic fire held');
 const before=JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges;
 app.moveForward(300,30);
 const after=JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges;
 assert.ok(after<before,'finite shots continue under mouse hold');
 app.emit('mouseup',{button:0});
 assert.equal(p.fireHeld,false);
 app.moveForward(330,30);
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,after);
 app.emit('keydown',{code:'Space'});
 app.element('scene').dispatch('mousedown',{button:0});
 app.emit('mouseup',{button:0});
 assert.equal(p.fireHeld,true,'keyboard stays active when mouse releases');
 app.element('pauseButton').click();
 assert.equal(p.fireHeld,false,'pause clears trigger latch');
});

test('CH01 PC canvas requests unadjusted mouse movement while retaining player control',()=>{
 const app=boot();
 app.element('continue').click();
 assert.equal(app.element('scene').lastPointerLockOptions.unadjustedMovement,true);
 app.frame(1000/60);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
});


test('PC CH01 event-only pointer-lock denial checkpoints safely and ignores late errors', () => {
  const app = boot(new Map(), false, 'pending');
  app.element('continue').click();
  app.emit('keydown', {code: 'KeyW'});
  app.emit('pointerlockerror');
  app.frame(1000);
  assert.equal(app.element('menu').classList.contains('hidden'), false);
  assert.match(app.element('menuText').textContent, /포인터 잠금/);
  const saved = JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(saved.elapsed, 0);
  assert.equal(app.context.VeilpointInput.forward, false);
  app.context.document.pointerLockElement = app.element('scene');
  app.element('continue').click();
  app.emit('pointerlockerror');
  assert.equal(app.element('menu').classList.contains('hidden'), true,
    'a late event must not interrupt a newly acquired desktop lock');
});


test('PC CH01 late permission grant after Escape leaves the mission paused and releases the mouse',async()=>{
  const app=boot(new Map(),false,'late');
  app.element('continue').click();
  app.emit('keydown',{code:'Escape'});
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  app.grantPointerLock();
  await Promise.resolve();await Promise.resolve();
  assert.equal(app.context.document.pointerLockElement,null);
  app.frame(1000);
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed,0);
});

test('CH01 PC held-fire checkpoints are bounded and pause flushes final finite ammunition',()=>{
 const sharedStore=new Map(),originalSet=sharedStore.set.bind(sharedStore);
 let writes=0;
 sharedStore.set=(key,value)=>{
  if(key==='veilpoint.story.ch01')writes++;
  return originalSet(key,value);
 };
 const app=boot(sharedStore);
 app.element('continue').click();
 app.moveForward(0,300);
 app.interact();
 assert.match(app.element('objective').textContent,/무장 대치자/);
 const before=writes;
 app.emit('keydown',{code:'Space'});
 for(let tick=301;tick<=440;tick++)app.frame(tick*1000/60);
 app.emit('keyup',{code:'Space'});
 assert.ok(writes-before>=1,'sustained volley must still periodically checkpoint');
 assert.ok(writes-before<=7,'automatic rounds must not each serialize a full mission');
 const beforePause=JSON.parse(sharedStore.get('veilpoint.story.ch01'));
 assert.equal(beforePause.phase,'engagement');
 assert.ok(beforePause.player.charges<48,'finite ammo is spent during held fire');
 app.emit('blur');
 const flushed=JSON.parse(sharedStore.get('veilpoint.story.ch01'));
 assert.ok(flushed.elapsed>=beforePause.elapsed);
 assert.ok(flushed.player.charges<=beforePause.player.charges);
 assert.equal(flushed.player.charges,36,'pause preserves all twelve spent rounds');
 assert.equal(app.context.VeilpointInput.fireHeld,false);
});

test('PC WebGL context loss checkpoints CH01 and requires explicit resume',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,15);
 const elapsed=Number(app.element('status').textContent.match(/경과 ([0-9]+)초/)[1]);
 let prevented=false;
 app.element('scene').dispatch('webglcontextlost',{preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.element('continue').disabled,true);
 assert.equal(app.element('newGame').disabled,true);
 const saved=app.store.get('veilpoint.story.ch01');assert.ok(saved);
 app.frame(10000);assert.equal(app.store.get('veilpoint.story.ch01'),saved);
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,false);
 assert.equal(app.element('newGame').disabled,false);
 assert.match(app.element('menuText').textContent,/복구/);
 app.frame(11000);assert.equal(app.store.get('veilpoint.story.ch01'),saved);
 app.element('continue').click();app.moveForward(660,90);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.ok(Number(app.element('status').textContent.match(/경과 ([0-9]+)초/)[1])>elapsed);
});

test('CH01 GPU loss keeps PC focus on a usable menu item until renderer recovery',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();
 app.moveForward(0,15);
 app.element('scene').dispatch('webglcontextlost');
 // Pause intentionally persists the current 60Hz frame; this is the durable
 // boundary that must remain stable while the GPU is unavailable.
 const previous=app.store.get('veilpoint.story.ch01');
 assert.ok(previous);
 assert.equal(app.element('continue').disabled,true);
 assert.equal(app.context.document.activeElement,app.element('storyMenuMore'),
  'GPU loss must not strand keyboard focus on the disabled Continue button');
 app.context.VeilpointRenderer.failNext=true;
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.context.document.activeElement,app.element('storyMenuMore'),
  'a failed renderer rebuild cannot focus or enable Continue');
 assert.equal(app.element('continue').disabled,true);
 app.frame(10000);
 assert.equal(app.store.get('veilpoint.story.ch01'),previous,
  'paused world must not advance during unavailable GPU rendering');
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,false);
 assert.equal(app.context.document.activeElement,app.element('continue'),
  'successful renderer rebuild must return keyboard focus to Resume');
 assert.equal(app.element('menu').classList.contains('hidden'),false,
  'GPU restoration never auto-resumes the paused 60Hz world');
});

test('CH01 renderer recreation failure remains paused with a durable checkpoint',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,15);
 app.element('scene').dispatch('webglcontextlost');
 const saved=app.store.get('veilpoint.story.ch01');assert.ok(saved);
 app.context.VeilpointRenderer.failNext=true;
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,true);
 assert.equal(app.element('newGame').disabled,true);
 assert.match(app.element('menuText').textContent,/복구 실패/);
 app.frame(5000);assert.equal(app.store.get('veilpoint.story.ch01'),saved);
});

test('CH01 PC ignores Korean IME and OS chords but allows shifted movement',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();
 const input=app.context.VeilpointInput;
 for(const event of [
  {code:'KeyW',ctrlKey:true},{code:'KeyW',altKey:true},
  {code:'KeyW',metaKey:true},{code:'KeyW',isComposing:true},
  {code:'KeyW',key:'Process'},{code:'KeyW',keyCode:229}
 ])app.emit('keydown',event);
 assert.equal(input.forward,false);
 app.emit('keydown',{code:'KeyW',shiftKey:true});
 assert.equal(input.forward,true);
 app.emit('keyup',{code:'KeyW'});
 assert.equal(input.forward,false);
});

test('CH01 OS shortcut transition releases held PC movement',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();
 const input=app.context.VeilpointInput;
 app.emit('keydown',{code:'KeyW'});assert.equal(input.forward,true);
 app.emit('keydown',{code:'ControlLeft',ctrlKey:true});
 assert.equal(input.forward,false);
 app.emit('keyup',{code:'KeyW'});
});


test('CH01 silent desktop pointer-lock request times out to a saved, resumable pause',()=>{
 const app=boot(new Map(),false,'pending');
 app.element('continue').click();
 app.emit('keydown',{code:'KeyW'});
 app.frame(3999);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 app.frame(4000);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.match(app.element('menuText').textContent,/포인터 잠금/);
 const saved=app.store.get('veilpoint.story.ch01');
 assert.equal(JSON.parse(saved).elapsed,0,'pending lock never advances hostile 60Hz state');
 app.frame(7000);
 assert.equal(app.store.get('veilpoint.story.ch01'),saved);
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true,'a fresh user click can retry');
});

test('CH01 eventless pointer-lock success cancels the watchdog',()=>{
 const app=boot(new Map(),false,'pending');
 app.element('continue').click();
 app.context.document.pointerLockElement=app.element('scene');
 app.frame(5000);
 app.frame(5100);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 app.element('pauseButton').click();
 assert.ok(JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed>0);
});

test('CH01 silently lost desktop pointer lock pauses before the next simulation tick',()=>{
 const app=boot();
 app.element('continue').click();
 app.emit('keydown',{code:'KeyW'});
 app.frame(1000/60);
 app.frame(2000/60);
 app.context.document.pointerLockElement=null;
 app.frame(3000/60);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.context.VeilpointInput.forward,false);
 const saved=app.store.get('veilpoint.story.ch01');
 assert.ok(JSON.parse(saved).elapsed>0);
 app.frame(4000/60);
 assert.equal(app.store.get('veilpoint.story.ch01'),saved,'no hidden progress after silent loss');
});

test('CH01 late pointer-lock grant after watchdog timeout cannot recapture the mouse',async()=>{
 const app=boot(new Map(),false,'late');
 app.element('continue').click();
 app.frame(4001);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 app.grantPointerLock();
 await Promise.resolve();await Promise.resolve();
 assert.equal(app.context.document.pointerLockElement,null);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).elapsed,0);
});

test('offline CH01 still starts when browser denies the localStorage getter', () => {
  const app=boot(new Map(),false,'granted',true,true,true);
  assert.match(app.element('objective').textContent,/중계기/);
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  app.frame(1000/60);
  assert.equal(app.context.VeilpointInput.fireHeld,false);
});

test('CH01 PC pause retains the live encounter when the storage getter is denied',()=>{
 const app=boot(new Map(),false,'granted',true,true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 assert.match(app.element('objective').textContent,/무장 대치자/);
 app.element('pauseButton').click();
 assert.match(app.element('saveStatus').textContent,/저장 실패/);
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.match(app.element('objective').textContent,/무장 대치자/,
   'continuing a live mission must not restart at the relay when storage is denied');
 app.frame(301*1000/60);
 assert.match(app.element('objective').textContent,/무장 대치자/);
});

test('CH01 PC pause resumes in-memory progress instead of an older disk checkpoint',()=>{
 const Story=require('../src/story-slice.js');
 const app=boot();
 app.element('continue').click();app.moveForward(0,300);app.interact();
 assert.match(app.element('objective').textContent,/무장 대치자/);
 app.element('pauseButton').click();
 app.store.set('veilpoint.story.ch01',Story.serialize(Story.createState()));
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.match(app.element('objective').textContent,/무장 대치자/);
});

test('CH01 explicit new game still resets a storage-denied in-memory mission',()=>{
 const app=boot(new Map(),false,'granted',true,true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 assert.match(app.element('objective').textContent,/무장 대치자/);
 app.element('pauseButton').click();app.element('newGame').click();
 assert.match(app.element('objective').textContent,/중계기/);
});


test('PC CH01 cargo exit denial immediately explains the physical handoff requirement',()=>{
  const Story=require('../src/story-slice.js');
  const s=Story.createState();
  s.world.player.x=Story.POINTS.terminal.x;s.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(s).ok,true);
  for(const b of s.world.bots)for(let i=0;i<2;i++){
    s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
    s.world.player.pitch=0;s.world.elapsed+=.21;
    assert.equal(Story.fire(s).hit,true);
  }
  s.world.player.x=Story.POINTS.decision.x;s.world.player.z=Story.POINTS.decision.z;
  assert.equal(Story.interact(s).ok,true);
  assert.equal(Story.choose(s,'evacuation').ok,true);
  s.world.player.x=Story.POINTS.aidPickup.x;s.world.player.z=Story.POINTS.aidPickup.z;
  assert.equal(Story.interact(s).ok,true);
  s.world.player.x=Story.POINTS.exitEvac.x;s.world.player.z=Story.POINTS.exitEvac.z;
  const store=new Map([['veilpoint.story.ch01',Story.serialize(s)]]);
  const app=boot(store);app.element('continue').click();
  const before=store.get('veilpoint.story.ch01');
  app.interact();
  assert.match(app.element('subtitle').textContent,/상자를 든 채로/);
  assert.match(app.element('status').textContent,/인계 또는 임시 적재/);
  assert.equal(app.element('menu').classList.contains('hidden'),true,'blocked exit keeps live gameplay active');
  assert.equal(store.get('veilpoint.story.ch01'),before,'blocked exit must not forge a completion checkpoint');
});

test('CH01 defeat retries the last alive checkpoint without losing finite supplies or replaying the mission intro',()=>{
  const Story=require('../src/story-slice.js');
  const s=Story.createState('carbine');
  s.world.player.x=Story.POINTS.terminal.x;
  s.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(s).ok,true);
  // A valid near-failure save is the player's last safe checkpoint, not
  // an invented post-death recovery or a fresh mission with replenished ammo.
  s.world.player.health=4;
  s.world.player.charges=24;
  s.world.player.loaded=12;
  const saved=Story.serialize(s);
  const store=new Map([['veilpoint.story.ch01',saved]]);
  const app=boot(store);
  app.element('continue').click();
  assert.match(app.element('objective').textContent,/무장 대치자/);
  let failed=false;
  for(let i=1;i<=2400;i++){
    app.frame(i*1000/60);
    if(app.element('menuText').textContent.includes('교전 중 임무가 중단')){failed=true;break;}
  }
  assert.equal(failed,true,'a visible finite hostile encounter must be able to end the mission');
  assert.equal(app.element('continue').textContent,'마지막 체크포인트 재시도');
  assert.equal(store.get('veilpoint.story.ch01'),saved,
    'defeat must not overwrite the last alive checkpoint with an unrecoverable failed state');
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/무장 대치자/,
    'retry restores the active encounter rather than silently starting a new CH01');
  assert.match(app.element('healthStatus').textContent,/4\/100/);
  assert.match(app.element('combatStatus').textContent,/탄창 12 \/ 예비 12/,
    'retry preserves finite magazine and reserve counts');
  assert.equal(store.get('veilpoint.story.ch01'),saved,
    'retry itself must not fabricate ammunition or write a new state');
  app.element('pauseButton').click();
  app.element('newGame').click();
  assert.match(app.element('objective').textContent,/중계기/,
    'explicit New Game remains a separate full restart');
});

test('CH01 historical failed checkpoint cannot soft-lock the resume action',()=>{
  const Story=require('../src/story-slice.js');
  const s=Story.createState();
  s.world.player.x=Story.POINTS.terminal.x;
  s.world.player.z=Story.POINTS.terminal.z;
  Story.interact(s);
  s.world.player.health=0;s.world.player.alive=false;
  s.world.status='lost';s.phase='failed';
  const store=new Map([['veilpoint.story.ch01',Story.serialize(s)]]);
  const app=boot(store);
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/중계기/,
    'an old failed-only save must fall back to a fresh playable mission');
});

test('CH01 storage-denied PC browser can retry an encounter from its in-memory alive checkpoint',()=>{
  const app=boot(new Map(),false,'granted',true,true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  assert.match(app.element('objective').textContent,/무장 대치자/);
  assert.match(app.element('saveStatus').textContent,/저장 실패/);
  let failed=false;
  for(let i=301;i<=4200;i++){
    app.frame(i*1000/60);
    if(app.element('menuText').textContent.includes('교전 중 임무가 중단')){failed=true;break;}
  }
  assert.equal(failed,true,'finite hostile actions should reach a defeat state without storage');
  assert.equal(app.store.size,0,'no fake disk checkpoint was written');
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/무장 대치자/,
    'the most recent safe in-memory snapshot resumes the same mission phase');
  assert.match(app.element('healthStatus').textContent,/건강 상태 [1-9][0-9]*\/100/,
    'retry must restore a living player, not an invulnerable or failed state');
  assert.match(app.element('saveStatus').textContent,/저장 실패/,
    'storage failure must remain visible and not masquerade as durable recovery');
});

test('PC browser shows a reachable manual warning switch and preserves its HUD status after reload',()=>{
 const Story=require('../src/story-slice.js');
 const s=Story.createState();
 const go=id=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
 go('terminal');assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots)for(let i=0;i<2;i++){
   s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
   s.world.player.pitch=0;s.world.elapsed+=.21;
   assert.equal(Story.fire(s).hit,true);
 }
 for(const id of ['recordA','recordB']){go(id);assert.equal(Story.interact(s).ok,true);}
 go('relay');assert.equal(Story.interact(s).ok,true);
 go('beacon');
 const store=new Map([['veilpoint.story.ch01',Story.serialize(s)]]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 assert.match(app.element('routeStatus').textContent,/수동 경고등 소등/,
   'restored but inactive powered warning must remain visible in PC route status');
 assert.match(app.element('interaction').textContent,/경고등.*작동/,
   'the physical switch should show an action prompt, not an evidence inspection');
 app.interact();
 assert.equal(Story.restore(store.get('veilpoint.story.ch01')).beaconEnabled,true);
 assert.match(app.element('routeStatus').textContent,/수동 경고등 점등/);
 const reopened=boot(store,false,'granted',true,true);
 reopened.element('continue').click();
 assert.match(reopened.element('routeStatus').textContent,/수동 경고등 점등/,
   'reloading a valid checkpoint must retain the warning state in the live HUD');
 assert.match(reopened.element('interaction').textContent,/경고등.*끄기/,
   'the same PC E switch must offer a visible off action after a reload');
 reopened.interact();
 assert.equal(Story.restore(store.get('veilpoint.story.ch01')).beaconEnabled,false);
 assert.match(reopened.element('routeStatus').textContent,/수동 경고등 소등/);
 assert.match(reopened.element('interaction').textContent,/경고등.*작동/);
 reopened.interact();
 assert.equal(Story.restore(store.get('veilpoint.story.ch01')).beaconEnabled,true,
   'the powered switch can be operated repeatedly without duplicating resources');
});


test('PC L toggles CH01 finite headlamp and saves through the live browser controller',()=>{
 const shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();
 assert.match(app.element('flashlightStatus').textContent,/소등/);
 app.emit('keydown',{code:'KeyL'});
 assert.match(app.element('flashlightStatus').textContent,/점등/);
 assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).flashlightOn,true);
 app.frame(1000/60);
 assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).flashlightOn,true);
 app.emit('keydown',{code:'KeyL',repeat:true});
 assert.match(app.element('flashlightStatus').textContent,/점등/);
 app.emit('keydown',{code:'KeyL'});
 assert.match(app.element('flashlightStatus').textContent,/소등/);
 const loaded=boot(shared,false,'granted',true,true);
 loaded.element('continue').click();
 assert.match(loaded.element('flashlightStatus').textContent,/소등/);
 assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).flashlightOn,false);
});


test('CH01 PC Escape toggles a live paused mission without changing saved state',()=>{
 const store=new Map(),app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 const saved=store.get('veilpoint.story.ch01');
 app.emit('keydown',{code:'Escape',repeat:true});
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.equal(store.get('veilpoint.story.ch01'),saved);
});
test('CH01 Escape on the initial menu cannot bypass mission start',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('menu').classList.contains('hidden'),false);
});

test('CH01 browser recovers an earlier physically valid save after a truncated recent checkpoint',()=>{
  const store=new Map([['veilpoint.brCheckpoint.v1','separate-br-save']]),app=boot(store);
  app.element('continue').click();
  for(let i=1;i<=690;i++)app.frame(i*1000/60);
  const backup=store.get('veilpoint.story.ch01.previous');
  const newest=store.get('veilpoint.story.ch01');
  assert.ok(backup&&newest,'at least two playable automatic generations exist');
  const older=JSON.parse(backup),latest=JSON.parse(newest);
  assert.ok(older.elapsed<latest.elapsed,'backup is an earlier 60Hz world, not a duplicate');
  store.set('veilpoint.story.ch01','{interrupted-write');
  const recovered=boot(store);
  assert.match(recovered.element('menuText').textContent,/이전 정상 체크포인트를 복구/);
  assert.equal(store.get('veilpoint.story.ch01'),backup,'restore promotes validated backup');
  recovered.element('continue').click();recovered.frame(1000/60);
  const after=JSON.parse(store.get('veilpoint.story.ch01'));
  assert.equal(after.player.z,older.player.z,'same mission location remains after recovery');
  assert.equal(store.get('veilpoint.brCheckpoint.v1'),'separate-br-save','BR save is isolated');
  recovered.element('newGame').click();
  assert.equal(store.has('veilpoint.story.ch01'),false);
  assert.equal(store.has('veilpoint.story.ch01.previous'),false,'new mission deletes both generations');
});

test('CH01 malformed backup never changes a valid completed or active primary checkpoint',()=>{
  const store=new Map(),app=boot(store);
  app.element('continue').click();
  for(let i=1;i<=360;i++)app.frame(i*1000/60);
  const valid=store.get('veilpoint.story.ch01');
  store.set('veilpoint.story.ch01.previous','{invalid');
  const resumed=boot(store);
  assert.doesNotMatch(resumed.element('menuText').textContent,/손상되어/);
  resumed.element('continue').click();resumed.frame(1000/60);
  assert.equal(store.get('veilpoint.story.ch01'),valid);
});

test('CH01 PC exit interaction visibly refuses to abandon an active guide and preserves saved mission',()=>{
 const Story=require('../src/story-slice.js');
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(b.x-s.world.player.x,-(b.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 s.world.player.x=Story.POINTS.decision.x;s.world.player.z=Story.POINTS.decision.z;
 assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 s.world.player.x=Story.POINTS.muster.x;s.world.player.z=Story.POINTS.muster.z;
 assert.equal(Story.interact(s).event,'muster');
 assert.equal(Story.interact(s).event,'guide');
 s.world.player.x=Story.POINTS.exitEvac.x;s.world.player.z=Story.POINTS.exitEvac.z;
 const checkpoint=Story.serialize(s);
 const store=new Map([['veilpoint.story.ch01',checkpoint],['veilpoint.brCheckpoint.v1','br-independent']]);
 const app=boot(store);app.element('continue').click();app.interact();
 assert.match(app.element('subtitle').textContent,/안내원이 아직 안뜰/);
 assert.match(app.element('status').textContent,/안내원 도착 전/);
 assert.match(app.element('objective').textContent,/반드시 안뜰까지/);
 assert.equal(app.element('menu').classList.contains('hidden'),true,'PC must remain in active mission');
 assert.equal(store.get('veilpoint.story.ch01'),checkpoint,'early exit never writes false completion');
 assert.equal(store.has('veilpoint.story.ch01PreviewCompleted'),false);
 app.element('pauseButton').click();
 const paused=Story.restore(store.get('veilpoint.story.ch01'));
 assert.equal(paused.phase,'exit');
 assert.equal(paused.guide.active,true);
 assert.equal(paused.guide.arrived,false);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'br-independent');
});

test('CH01 PC refresh reopens the exact finished branch report without starting a new mission',()=>{
 const Story=require('../src/story-slice.js');
 const finished=Story.createState();
 const go=id=>{finished.world.player.x=Story.POINTS[id].x;finished.world.player.z=Story.POINTS[id].z;};
 go('terminal');assert.equal(Story.interact(finished).ok,true);
 for(const bot of finished.world.bots)for(let i=0;i<2;i++){
  finished.world.player.yaw=Math.atan2(bot.x-finished.world.player.x,-(bot.z-finished.world.player.z));
  finished.world.player.pitch=0;finished.world.elapsed+=.21;
  assert.equal(Story.fire(finished).hit,true);
 }
 go('decision');assert.equal(Story.interact(finished).ok,true);
 assert.equal(Story.choose(finished,'evacuation').ok,true);
 go('exitEvac');assert.equal(Story.interact(finished).ok,true);
 const saved=Story.serialize(finished),store=new Map([
  ['veilpoint.story.ch01',saved],
  ['veilpoint.story.ch01PreviewCompleted',JSON.stringify(Story.debrief(finished))],
  ['veilpoint.brCheckpoint.v1','independent-BR-checkpoint']
 ]);
 const app=boot(store,false,'granted',true,true);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.element('reviewCompleted').classList.contains('hidden'),false);
 assert.match(app.element('menuText').textContent,/완료 기록/);
 app.element('reviewCompleted').click();
 assert.match(app.element('debriefReview').textContent,/CH01 완료.*남쪽 대피/);
 assert.match(app.element('debriefReview').textContent,/유수프 구조단/);
 assert.equal(app.element('debriefReview').classList.contains('hidden'),false);
 assert.equal(app.element('menu').classList.contains('hidden'),false,'read-only review must never start game input');
 assert.equal(app.element('continue').textContent,'CH01 다시 시작');
 for(let i=1;i<=120;i++)app.frame(i*1000/60);
 assert.equal(store.get('veilpoint.story.ch01'),saved,'review does not rewrite the terminal world');
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'independent-BR-checkpoint');
 app.element('continue').click();app.frame(3000);
 assert.match(app.element('objective').textContent,/중계기/,'explicit replay begins from the first real mission objective');
 assert.equal(store.has('veilpoint.story.ch01PreviewCompleted'),false,'replay clears obsolete completion');
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'independent-BR-checkpoint');
});

test('CH01 invalidated completed save cannot present a forged review',()=>{
 const Story=require('../src/story-slice.js');
 const completed=Story.createState();
 const store=new Map([['veilpoint.story.ch01',Story.serialize(completed)]]);
 const app=boot(store,false,'granted',true,true);
 assert.equal(app.element('reviewCompleted').classList.contains('hidden'),true,
  'active checkpoint does not unlock terminal review');
 // A completed save can be deleted or invalidated by another local tab.
 store.set('veilpoint.story.ch01','{tampered');
 app.element('reviewCompleted').click();
 assert.equal(app.element('debriefReview').classList.contains('hidden'),true);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
});

test('CH01 PC E at muster returns optional guide to local team and checkpoints the ending consequence',()=>{
 const Story=require('../src/story-slice.js'),s=Story.createState();
 const go=id=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
 go('terminal');assert.equal(Story.interact(s).ok,true);
 for(const bot of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 go('decision');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 go('muster');assert.equal(Story.interact(s).event,'muster');
 assert.equal(Story.interact(s).event,'guide');
 const store=new Map([
  ['veilpoint.story.ch01',Story.serialize(s)],
  ['veilpoint.brCheckpoint.v1','unchanged-br-save']
 ]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();app.interact();
 assert.match(app.element('status').textContent,/안내원 현장 인계 완료/);
 assert.match(app.element('routeStatus').textContent,/집결지 현장 인계 완료/);
 const saved=Story.restore(store.get('veilpoint.story.ch01'));
 assert.equal(saved.guide.released,true);
 assert.equal(saved.guide.active,false);
 assert.equal(saved.world.guide,saved.guide);
 const reloaded=boot(store,false,'granted',true,true);
 reloaded.element('continue').click();
 assert.match(reloaded.element('objective').textContent,/현장 인계/);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'unchanged-br-save');
 reloaded.element('newGame').click();
 assert.match(reloaded.element('objective').textContent,/중계기/);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'unchanged-br-save');
});

test('CH01 Windows PC E toggles an observed guide hold and persists it through pause and refresh',()=>{
 const Story=require('../src/story-slice.js'),s=Story.createState();
 const go=id=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
 go('terminal');assert.equal(Story.interact(s).ok,true);
 for(const bot of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;
  assert.equal(Story.fire(s).hit,true);
 }
 go('decision');assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 go('muster');assert.equal(Story.interact(s).event,'muster');
 assert.equal(Story.interact(s).event,'guide');
 s.world.player.x=s.guide.x-1.6;s.world.player.z=s.guide.z;
 assert.equal(Story.nearest(s).id,'guideControl');
 const store=new Map([
  ['veilpoint.story.ch01',Story.serialize(s)],
  ['veilpoint.brCheckpoint.v1','br-checkpoint-unchanged']
 ]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 assert.match(app.element('interaction').textContent,/대기 지시/);
 app.interact();
 assert.match(app.element('routeStatus').textContent,/현장 대기/);
 assert.match(app.element('interaction').textContent,/동행 재개/);
 assert.equal(Story.restore(store.get('veilpoint.story.ch01')).guide.waiting,true);
 app.element('pauseButton').click();
 const again=boot(store,false,'granted',true,true);
 again.element('continue').click();
 assert.match(again.element('objective').textContent,/대기 중/);
 again.interact();
 const resumed=Story.restore(store.get('veilpoint.story.ch01'));
 assert.equal(resumed.guide.waiting,false);
 assert.equal(resumed.guide.active,true);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'br-checkpoint-unchanged');
});

test('CH01 Windows E prompt cannot remotely release an unseen guide at muster',()=>{
 const Story=require('../src/story-slice.js'),s=Story.createState();
 const go=id=>{s.world.player.x=Story.POINTS[id].x;s.world.player.z=Story.POINTS[id].z;};
 go('terminal');Story.interact(s);
 for(const bot of s.world.bots)for(let i=0;i<2;i++){
  s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
  s.world.player.pitch=0;s.world.elapsed+=.21;assert.equal(Story.fire(s).hit,true);
 }
 go('decision');Story.interact(s);Story.choose(s,'evacuation');
 go('muster');Story.interact(s);Story.interact(s);
 s.world.player.x=-6.4;s.world.player.z=-55;
 const store=new Map([['veilpoint.story.ch01',Story.serialize(s)]]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 assert.equal(app.element('interaction').classList.contains('hidden'),true);
 app.interact();
 assert.equal(Story.restore(store.get('veilpoint.story.ch01')).guide.released,false);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
});

test('CH01 temporary checkpoint read denial starts isolated playable mission and preserves disk generations',()=>{
  const shared=new Map(),original=boot(shared,false,'granted',true,true);
  original.element('continue').click();
  original.moveForward(0,300);
  original.interact();
  const stored=shared.get('veilpoint.story.ch01');
  const backup=shared.get('veilpoint.story.ch01.previous');
  assert.ok(stored,'original game has a restorable active checkpoint');
  const isolated=boot(shared,false,'granted',true,true,false,2);
  assert.match(isolated.element('menuText').textContent,/기존 임무 기록을 보존/);
  assert.match(isolated.element('continue').textContent,/임시 CH01/);
  isolated.element('continue').click();
  assert.equal(isolated.element('menu').classList.contains('hidden'),true);
  assert.match(isolated.element('objective').textContent,/중계기/,
    'a separate memory-only mission starts when existing checkpoint is inaccessible');
  isolated.moveForward(0,300);
  isolated.interact();
  assert.match(isolated.element('objective').textContent,/무장 대치자/);
  assert.match(isolated.element('saveStatus').textContent,/임시 CH01 세션/);
  assert.equal(isolated.element('saveStatus').classList.contains('hidden'),false);
  isolated.element('pauseButton').click();
  assert.equal(shared.get('veilpoint.story.ch01'),stored,
    'temporary session must never overwrite a previous saved mission');
  assert.equal(shared.get('veilpoint.story.ch01.previous'),backup,
    'the existing secondary generation is left untouched');
  const restored=boot(shared,false,'granted',true,true);
  assert.match(restored.element('menuText').textContent,/이전 진행 기록/);
  restored.element('continue').click();
  assert.match(restored.element('objective').textContent,/무장 대치자/,
    'once access returns, saved mission resumes exactly where it was');
});

test('CH01 storage read permission may recover before Continue without forcing a new mission',()=>{
  const shared=new Map(),first=boot(shared,false,'granted',true,true);
  first.element('continue').click();first.moveForward(0,300);first.interact();
  const prior=shared.get('veilpoint.story.ch01');
  const recovered=boot(shared,false,'granted',true,true,false,1);
  assert.match(recovered.element('menuText').textContent,/저장된 미션을 읽을 수 없습니다/);
  recovered.element('continue').click();
  assert.equal(recovered.element('menu').classList.contains('hidden'),true);
  assert.match(recovered.element('objective').textContent,/무장 대치자/);
  assert.equal(recovered.element('saveStatus').classList.contains('hidden'),true,
    'verified disk checkpoint is resumed rather than entering isolated mode');
  assert.equal(shared.get('veilpoint.story.ch01'),prior);
});

test('CH01 a temporary session cannot publish a completed preview over an earlier disk mission',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
  assert.match(source,/let checkpointReadUnavailable=false,checkpointInvalidStored=false,memoryOnlyStory=false/);
  assert.match(source,/catch\(_\)\{checkpointReadUnavailable=true;checkpointInvalidStored=false;return null;\}/);
  assert.match(source,/if\(memoryOnlyStory\)\{[\s\S]*?checkpoint=raw;/);
  assert.match(source,/if\(report&&!memoryOnlyStory&&!saveFailed&&[\s\S]*?storage\.set\(PREVIEW_KEY/);
  assert.match(source,/diskGeneration=memoryOnlyStory\?null:storage\.get\(SAVE_KEY\)/);
  assert.match(source,/checkpoint=diskGeneration/);
  assert.match(source,/replayCompleted=!memoryOnlyStory&&!!loaded&&loaded\.phase==='complete'/);
  assert.match(source,/if\(replayCompleted\)\{\s*pendingReplayReset=true;\s*persist\('새 CH01 시작'\);/);
  assert.match(source,/if\(fromCheckpoint\)/);
});

function enterPCStoryDecision(app){
  app.element('continue').click();
  app.moveForward(0,300);
  app.interact();
  const frame=app.clearEncounter(300);
  app.moveForward(frame,225);
  app.interact();
  assert.equal(app.element('choices').classList.contains('hidden'),false,
    'the story decision must be reached through the actual 60Hz PC controller');
}

test('CH01 PC focused decision selects an east field route without two papers while ignoring OS repeat',()=>{
  const app=boot(new Map(),false,'granted',true,true);
  enterPCStoryDecision(app);
  const choice=app.element('choiceEvac');
  assert.equal(app.context.document.activeElement,choice,
    'the decision screen must move keyboard focus from the hidden world to a visible action');
  app.emit('keydown',{code:'Digit2',repeat:true,target:choice});
  assert.equal(app.element('choices').classList.contains('hidden'),false,
    'OS repeat cannot silently select a narrative branch');
  app.emit('keydown',{code:'Digit2',target:choice});
  assert.equal(app.element('choices').classList.contains('hidden'),true);
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).choice,'verification',
    'the east on-site route is usable without collecting paper');
  assert.equal(app.context.document.activeElement,app.element('scene'),
    'keyboard focus returns to the real 60Hz first-person world');
});

test('CH01 PC Escape cancels a focused route dialog without changing story branch',()=>{
  const app=boot(new Map(),false,'granted',true,true);
  enterPCStoryDecision(app);
  const back=app.element('choiceBack');
  back.focus();
  app.emit('keydown',{code:'Escape',target:back});
  assert.equal(app.element('choices').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/기록/,
    'Escape returns to physical investigation instead of choosing a route');
  const saved=JSON.parse(app.store.get('veilpoint.story.ch01'));
  assert.equal(saved.choice,null);
  assert.equal(app.context.document.activeElement,app.element('scene'));
  // Unfocused graphics controls must still own their own keys outside choices.
  app.emit('keydown',{code:'Digit1',target:app.element('quality')});
  assert.match(app.element('objective').textContent,/기록/);
});

test('CH01 Continue quarantines two unreadable disk checkpoints for an entire playable 60Hz session',()=>{
  const primary='{truncated-current-save';
  const backup='{truncated-previous-save';
  const shared=new Map([
    ['veilpoint.story.ch01',primary],
    ['veilpoint.story.ch01.previous',backup]
  ]);
  const app=boot(shared);
  assert.match(app.element('menuText').textContent,/복원할 수 없습니다/);
  assert.match(app.element('continue').textContent,/임시/);
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  // Advance the real desktop controller beyond its normal 5-second save cadence.
  app.moveForward(0,315);
  app.interact();
  app.element('pauseButton').click();
  assert.equal(shared.get('veilpoint.story.ch01'),primary);
  assert.equal(shared.get('veilpoint.story.ch01.previous'),backup);
  assert.match(app.element('saveStatus').textContent,/기존 저장 기록/);
  // Explicitly choosing New Game, and only that choice, is allowed to reset disk.
  app.element('newGame').click();
  assert.equal(shared.has('veilpoint.story.ch01'),false);
  assert.equal(shared.has('veilpoint.story.ch01.previous'),false);
});

test('fresh CH01 Continue remains writable when no prior checkpoint generations exist',()=>{
  const shared=new Map(),app=boot(shared);
  app.element('continue').click();
  app.moveForward(0,300);
  app.interact();
  assert.equal(shared.has('veilpoint.story.ch01'),true);
  assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).phase,'engagement');
});

test('CH01 refuses to overwrite a saved game when storage reads fail after live play begins',()=>{
  const shared=new Map(),app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const key='veilpoint.story.ch01',before=shared.get(key);
  assert.equal(JSON.parse(before).phase,'engagement');
  const originalGet=app.context.localStorage.getItem;
  app.context.localStorage.getItem=k=>{
    if(k===key)throw new Error('mid_session_storage_read_denied');
    return originalGet(k);
  };
  app.moveForward(300,90);
  app.element('pauseButton').click();
  assert.equal(shared.get(key),before,'unreadable primary remains untouched');
  assert.match(app.element('saveStatus').textContent,/기존 저장 기록 읽기 불가/);
  app.context.localStorage.getItem=originalGet;
  app.element('continue').click();
  app.element('pauseButton').click();
  const recovered=JSON.parse(shared.get(key));
  assert.ok(recovered.elapsed>JSON.parse(before).elapsed,
    'the original live mission may persist again after access returns');
  assert.equal(shared.get('veilpoint.story.ch01.previous'),before);
});

test('CH01 keeps the previous playable primary intact when backup rotation is denied',()=>{
  const shared=new Map(),app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const key='veilpoint.story.ch01',oldPrimary=shared.get(key);
  const oldBackup=shared.get('veilpoint.story.ch01.previous');
  const originalSet=app.context.localStorage.setItem;
  app.context.localStorage.setItem=(k,v)=>{
    if(k==='veilpoint.story.ch01.previous')throw new Error('backup_quota_exceeded');
    return originalSet(k,v);
  };
  app.moveForward(300,90);
  app.element('pauseButton').click();
  assert.equal(shared.get(key),oldPrimary,'a failed backup must not destroy the last good primary');
  assert.equal(shared.get('veilpoint.story.ch01.previous'),oldBackup);
  assert.match(app.element('saveStatus').textContent,/이전 체크포인트 백업 실패/);
  app.context.localStorage.setItem=originalSet;
  app.element('continue').click();
  app.element('pauseButton').click();
  assert.equal(shared.get('veilpoint.story.ch01.previous'),oldPrimary);
  assert.ok(JSON.parse(shared.get(key)).elapsed>JSON.parse(oldPrimary).elapsed);
});

test('CH01 does not erase an externally corrupted primary during active gameplay',()=>{
  const shared=new Map(),app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const key='veilpoint.story.ch01',corrupt='{unexpected-truncated-primary';
  shared.set(key,corrupt);
  app.moveForward(300,90);
  app.element('pauseButton').click();
  assert.equal(shared.get(key),corrupt);
  assert.match(app.element('saveStatus').textContent,/다른 창에서 체크포인트 변경 감지/);
});

test('CH01 failed final save never publishes a false completed debrief over older progress',()=>{
  const oldReport='{"mission":"CH01","savedPrior":true}';
  const shared=new Map([['veilpoint.story.ch01PreviewCompleted',oldReport]]);
  const app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);
  app.interact();
  const frame=app.clearEncounter(300);
  app.moveForward(frame,225);
  app.interact();
  assert.equal(app.element('choices').classList.contains('hidden'),false);
  app.element('choiceEvac').click();
  app.moveForward(frame+225,193);
  const lastGood=shared.get('veilpoint.story.ch01');
  assert.equal(JSON.parse(lastGood).phase,'exit');
  const set=app.context.localStorage.setItem;
  app.context.localStorage.setItem=(k,value)=>{
    if(k==='veilpoint.story.ch01')throw new Error('disk_full_on_final_checkpoint');
    return set(k,value);
  };
  app.interact();
  assert.match(app.element('menuText').textContent,/CH01 완료/);
  assert.match(app.element('menuText').textContent,/완료 기록은 저장되지 않았습니다/);
  assert.equal(shared.get('veilpoint.story.ch01'),lastGood,
    'disk must retain the previous playable checkpoint');
  assert.equal(shared.get('veilpoint.story.ch01PreviewCompleted'),oldReport,
    'stale completion summary must not overwrite an earlier persisted record');
  const reopened=boot(shared,false,'granted',true,true);
  reopened.element('continue').click();
  assert.match(reopened.element('objective').textContent,/안뜰/,
    'a reload resumes the actual last durable exit world, never a phantom win');
});

test('CH01 Windows marker key retains selected supply objective when held guide prompt leaves range',()=>{
  const StoryRules=require('../src/story-slice.js');
  const legacy={version:1,phase:'exit',found:[],choice:'evacuation',
    player:{x:-9,z:-55,yaw:0,pitch:0,stamina:100},elapsed:12};
  const state=StoryRules.restore(JSON.stringify(legacy));
  state.world.player.x=StoryRules.POINTS.muster.x;
  state.world.player.z=StoryRules.POINTS.muster.z;
  assert.equal(StoryRules.interact(state).event,'muster');
  assert.equal(StoryRules.interact(state).event,'guide');
  state.guide.waiting=true;
  const shared=new Map([['veilpoint.story.ch01',StoryRules.serialize(state)]]);
  const app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  // An additional optional field document must not break stable marker-ID
  // navigation. Cycle to actual published supply rather than assuming the
  // authored mission will always expose exactly six markers.
  let selected=false;
  for(let i=0;i<=StoryRules.markers(state).length;i++){
    app.emit('keydown',{code:'KeyB'});
    if(/선택한 임무 표식.*민간 구조용 비상 물품 상자/.test(app.element('navigation').textContent)){
      selected=true;break;
    }
  }
  assert.equal(selected,true,'PC guidance must still reach a finite physical supply marker');
  app.moveForward(0,340);
  const saved=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.ok(Math.hypot(saved.player.x-saved.guide.x,saved.player.z-saved.guide.z)>=7,
    'actual 60Hz keyboard movement must remove the short-range guide-control prompt');
  assert.match(app.element('navigation').textContent,/선택한 임무 표식.*민간 구조용 비상 물품 상자/,
    'the HUD must not silently retarget the relay when guide-control disappears');
  app.emit('keydown',{code:'KeyB'});
  assert.match(app.element('navigation').textContent,/선택한 임무 표식.*비상 통신 중계기 전원/,
    'the next key press advances from the selected objective identity');
});

test('CH01 Windows concurrent tabs cannot silently replace a newer playable disk checkpoint',()=>{
  const shared=new Map(),key='veilpoint.story.ch01';
  const first=boot(shared,false,'granted',true,true);
  first.element('continue').click();
  first.moveForward(0,300);first.interact();
  const original=shared.get(key);
  assert.equal(JSON.parse(original).phase,'engagement');
  // A second genuine PC session resumes and commits a later 60Hz world state.
  const second=boot(shared,false,'granted',true,true);
  second.element('continue').click();
  second.moveForward(0,75);
  second.element('pauseButton').click();
  const newer=shared.get(key);
  assert.notEqual(newer,original);
  assert.ok(JSON.parse(newer).elapsed>JSON.parse(original).elapsed);
  // The stale tab must not roll back either generation on pause/autosave.
  const backup=shared.get('veilpoint.story.ch01.previous');
  first.moveForward(300,90);first.element('pauseButton').click();
  assert.equal(shared.get(key),newer);
  assert.equal(shared.get('veilpoint.story.ch01.previous'),backup);
  assert.match(first.element('saveStatus').textContent,/다른 창에서 체크포인트 변경 감지/);
  const reopened=boot(shared,false,'granted',true,true);
  reopened.element('continue').click();
  assert.match(reopened.element('objective').textContent,/무장 대치자/);
});

test('CH01 does not recreate an externally removed checkpoint without explicit New Game',()=>{
  const shared=new Map(),key='veilpoint.story.ch01';
  const app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  assert.ok(shared.has(key));
  shared.delete(key);
  app.element('pauseButton').click();
  assert.equal(shared.has(key),false,'stale session must not overwrite remote deletion');
  assert.match(app.element('saveStatus').textContent,/다른 창에서 체크포인트 변경 감지/);
  app.element('newGame').click();
  app.moveForward(300,300);app.interact();
  assert.equal(JSON.parse(shared.get(key)).phase,'engagement',
    'user-initiated New Game is the explicit reset and may write a fresh checkpoint');
});


test('CH01 a single finite shot survives a transient failed save without a second trigger',()=>{
 const app=boot();app.element('continue').click();
 app.moveForward(0,300);app.interact();
 const key='veilpoint.story.ch01';
 const old=JSON.parse(app.store.get(key)),write=app.store.set.bind(app.store);
 let denied=true,failedWrites=0;
 app.store.set=(name,value)=>{
  if(name===key&&denied){failedWrites++;throw new Error('quota denied');}
  return write(name,value);
 };
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(failedWrites,1,'first actual shot attempts one immediate checkpoint');
 assert.equal(JSON.parse(app.store.get(key)).player.charges,old.player.charges,
   'old durable snapshot remains intact on write denial');
 assert.match(app.element('saveStatus').textContent,/저장 실패/);
 for(let frame=301;frame<=348;frame++)app.frame(frame*1000/60);
 assert.equal(failedWrites,1,'60Hz frames do not hammer denied storage during one-second backoff');
 denied=false;
 for(let frame=349;frame<=374;frame++)app.frame(frame*1000/60);
 const committed=JSON.parse(app.store.get(key));
 assert.equal(committed.player.charges,old.player.charges-1,
   'the first shot is durably retried without further firing');
 assert.equal(app.element('saveStatus').classList.contains('hidden'),true);
 const replay=boot(app.store);
 replay.element('continue').click();
 assert.match(replay.element('objective').textContent,/무장 대치자/);
 assert.equal(app.store.get(key)===null,false);
});

test('CH01 a failed single-shot save flushes on pause after release, not on key repeat',()=>{
 const app=boot();app.element('continue').click();
 app.moveForward(0,300);app.interact();
 const key='veilpoint.story.ch01',write=app.store.set.bind(app.store);
 const before=JSON.parse(app.store.get(key)).player.charges;
 let deny=true;
 app.store.set=(name,value)=>{
  if(name===key&&deny)throw new Error('temporary storage restriction');
  return write(name,value);
 };
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(JSON.parse(app.store.get(key)).player.charges,before);
 deny=false;
 app.element('pauseButton').click();
 const snapshot=JSON.parse(app.store.get(key));
 assert.equal(snapshot.player.charges,before-1,
   'explicit pause still flushes the most recent playable world');
 assert.match(app.element('menuText').textContent,/일시정지/);
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
});


test('CH01 loaded PC escort handoff uses E and HUD at staffed south transfer, not guide pause',()=>{
 const Story=require('../src/story-slice.js');
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';state.musterConfirmed=true;
 state.combat.started=true;state.combat.cleared=true;
 state.world.bots=[
   {id:0,x:0,z:-28,angle:Math.PI,health:0,alive:false,shots:12},
   {id:1,x:15,z:-34,angle:Math.PI,health:0,alive:false,shots:12},
   {id:2,x:-15,z:-34,angle:Math.PI,health:0,alive:false,shots:12}
 ];
 const desk=Story.POINTS.guideTransfer;
 state.guide={active:true,arrived:false,released:false,waiting:true,
   x:desk.x+1.8,z:desk.z-.5};
 state.world.player.x=desk.x+1.4;state.world.player.z=desk.z+.9;
 const key='veilpoint.story.ch01',store=new Map([[key,Story.serialize(state)]]);
 const app=boot(store);
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.equal(Story.nearest(state)?.id,'guideTransfer');
 assert.match(app.element('interaction').textContent,/구조단|인계/);
 app.interact();
 const saved=JSON.parse(store.get(key));
 assert.equal(saved.guide.active,false,'actual E key makes the physical staff handoff');
 assert.equal(saved.guide.released,true);
 assert.equal(saved.guide.waiting,false);
 assert.equal(saved.phase,'exit','actual evacuation remains independently completable');
 const resumed=boot(store);
 resumed.element('continue').click();
 assert.match(resumed.element('objective').textContent,/인계|안뜰/);
});


test('CH01 remapped PC interaction key is displayed in HUD and operates a physical mission terminal',()=>{
 const C=require('../src/desktop-controls.js');
 const controls=C.bind(C.normalize({}),'interact','KeyT');
 assert.equal(controls.ok,true);
 const store=new Map([[C.STORAGE_KEY,JSON.stringify(controls.value)]]);
 const app=boot(store);
 app.element('continue').click();
 const Story=app.context.VeilpointStorySlice;
 const state=Story.createState();
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z+1;
 const saved=Story.serialize(state);
 store.set('veilpoint.story.ch01',saved);
 const resumed=boot(store);
 resumed.element('continue').click();
 assert.match(resumed.element('interaction').textContent,/\[T\]/);
 assert.doesNotMatch(resumed.element('interaction').textContent,/\[F\]/);
 resumed.emit('keydown',{code:'KeyE'});
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).phase,'terminal');
 resumed.emit('keydown',{code:'KeyT'});
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).phase,'engagement');
});

test('CH01 PC remapped interact displays T and actual T key operates relay while E does not',()=>{
 const Desktop=require('../src/desktop-controls.js');
 const base=Desktop.normalize({});
 const bindInteract=Desktop.bind(base,'interact','KeyT');
 assert.equal(bindInteract.ok,true);
 const remapped=Desktop.bind(bindInteract.value,'reload','KeyY');
 assert.equal(remapped.ok,true);
 const store=new Map([[Desktop.STORAGE_KEY,JSON.stringify(remapped.value)]]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 app.moveForward(0,300);
 assert.match(app.element('interaction').textContent,/\[T\]/,
   'nearby 3D world relay advertises the actual remapped interaction key');
 assert.doesNotMatch(app.element('interaction').textContent,/\[F\]/);
 const objective=app.element('objective').textContent;
 assert.doesNotMatch(objective,/E로|E를/,'mission text must not advertise a dead key');
 app.emit('keydown',{code:'KeyE'});
 assert.equal(app.element('objective').textContent,objective,
   'old E key cannot advance an input-remapped mission');
 assert.equal(store.has('veilpoint.story.ch01'),false,
   'unhandled E must not create a checkpoint before the first real interaction');
 app.emit('keydown',{code:'KeyT'});
 const saved=JSON.parse(store.get('veilpoint.story.ch01'));
 assert.equal(saved.phase,'engagement','actual remapped PC T drives interaction and persistence');
 assert.match(app.element('objective').textContent,/무장 대치자/);
});


test('CH01 backup recovery never overwrites a newer primary saved by another tab',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01', backupKey=key+'.previous';
  const older=Story.serialize(Story.createState());
  const newerState=Story.createState();newerState.world.player.x=4;
  const newer=Story.serialize(newerState);
  const shared=new Map([[key,'{interrupted-write'],[backupKey,older]]);
  const get=shared.get.bind(shared);
  let primaryReads=0;
  shared.get=(name)=>{
    if(name===key&&++primaryReads===2){
      shared.set(key,newer); // another tab finished its write during recovery
      return newer;
    }
    return get(name);
  };
  const app=boot(shared,false,'granted',true,true);
  assert.ok(primaryReads>=2);
  assert.equal(shared.get(key),newer,'recovery must not replace the newer valid generation');
  assert.equal(shared.get(backupKey),older,'preserve the validated backup');
  app.element('continue').click();
  assert.equal(shared.get(key),newer,'Continue must honor the latest valid generation');
  app.element('pauseButton').click();
  assert.equal(Story.restore(shared.get(key)).world.player.x,4);
});

test('CH01 failed backup promotion keeps disk generations intact through temporary play',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01', backupKey=key+'.previous';
  const backup=Story.serialize(Story.createState());
  const corrupted='{incomplete-primary';
  const shared=new Map([[key,corrupted],[backupKey,backup]]);
  const set=shared.set.bind(shared);
  let denied=0;
  shared.set=(name,value)=>{
    if(name===key){denied++;throw new Error('storage quota denied');}
    return set(name,value);
  };
  const app=boot(shared,false,'granted',true,true);
  assert.ok(denied>=1,'promotion of the good backup should have been attempted');
  assert.equal(shared.get(key),corrupted);
  assert.equal(shared.get(backupKey),backup);
  app.element('continue').click();
  assert.match(app.element('objective').textContent,/중계기/);
  app.element('pauseButton').click();
  assert.match(app.element('saveStatus').textContent,/임시 CH01 세션/);
  assert.equal(shared.get(key),corrupted,'temporary play must never erase corrupted primary');
  assert.equal(shared.get(backupKey),backup,'temporary play must preserve last valid backup');
});


test('CH01 live completion replay immediately checkpoints the new world and retires stale finale',()=>{
  const key='veilpoint.story.ch01',preview=key+'PreviewCompleted',backup=key+'.previous';
  const app=boot(new Map([['veilpoint.brCheckpoint.v1','unchanged']]),false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const cleared=app.clearEncounter(300);
  app.moveForward(cleared,225);app.interact();app.element('choiceEvac').click();
  app.moveForward(cleared+225,193);app.interact();
  assert.equal(JSON.parse(app.store.get(key)).phase,'complete');
  assert.equal(app.store.has(preview),true);
  app.element('continue').click(); // Live replay, not a full browser reload.
  const replay=JSON.parse(app.store.get(key));
  assert.equal(replay.phase,'terminal','replay must persist before any new movement');
  assert.equal(replay.player.z,12);
  assert.equal(app.store.has(preview),false,'old completion cannot outlive a durable replay');
  assert.equal(app.store.has(backup),false,'completed generation is not a replay backup');
  const reloaded=boot(app.store,false,'granted',true,true);
  assert.match(reloaded.element('menuText').textContent,/이전 진행 기록/);
  reloaded.element('continue').click();
  assert.match(reloaded.element('objective').textContent,/중계기/);
  assert.equal(app.store.get('veilpoint.brCheckpoint.v1'),'unchanged');
});

test('CH01 replay with temporary disk denial retires old finale only after successful 60Hz retry',()=>{
  const key='veilpoint.story.ch01',preview=key+'PreviewCompleted';
  const shared=new Map([['veilpoint.brCheckpoint.v1','br-kept']]);
  const app=boot(shared,false,'granted',true,true);
  app.element('continue').click();app.moveForward(0,300);app.interact();
  const cleared=app.clearEncounter(300);
  app.moveForward(cleared,225);app.interact();app.element('choiceEvac').click();
  app.moveForward(cleared+225,193);app.interact();
  const complete=shared.get(key);
  assert.equal(JSON.parse(complete).phase,'complete');
  const save=shared.set.bind(shared);
  let denied=0;
  shared.set=(name,value)=>{
    if(name===key){denied++;throw new Error('temporary quota denial');}
    return save(name,value);
  };
  app.element('continue').click();
  assert.ok(denied>0);
  assert.equal(shared.get(key),complete,'failed replay write preserves old complete world');
  assert.equal(shared.has(preview),true,'never retire debrief before successful checkpoint');
  assert.match(app.element('saveStatus').textContent,/저장 실패/);
  shared.set=save;
  const after=cleared+225+193;
  for(let n=1;n<=370;n++)app.frame((after+n)*1000/60);
  assert.equal(JSON.parse(shared.get(key)).phase,'terminal');
  assert.equal(shared.has(preview),false,'successful retry retires obsolete report');
  assert.equal(shared.get('veilpoint.brCheckpoint.v1'),'br-kept');
});


test('CH01 remapped Windows report and mission prompts always match the actual physical action',()=>{
 const Desktop=require('../src/desktop-controls.js');
 let config=Desktop.normalize({});
 for(const [action,code] of [['interact','KeyT'],['support','KeyU'],['reload','KeyY']]){
  const changed=Desktop.bind(config,action,code);
  assert.equal(changed.ok,true);config=changed.value;
 }
 const store=new Map([[Desktop.STORAGE_KEY,JSON.stringify(config)]]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 app.moveForward(0,300);
 app.emit('keydown',{code:'KeyT'});
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).phase,'engagement');
 assert.match(app.element('objective').textContent,/Y 재장전.*U 상황 보고/);
 assert.doesNotMatch(app.element('objective').textContent,/R 재장전|Q 상황 보고/);
 assert.match(app.element('combatStatus').textContent,/동료 보고 U 확인 가능/);
 app.emit('keydown',{code:'KeyQ'});
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).combat.supportUsed,false);
 app.emit('keydown',{code:'KeyU'});
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).combat.supportUsed,true);
 const refresh=boot(store,false,'granted',true,true);
 refresh.element('continue').click();
 assert.match(refresh.element('objective').textContent,/U 상황 보고/);
 assert.match(refresh.element('combatStatus').textContent,/동료 보고 확인 완료/);
});

test('CH01 guide waiting HUD uses the remapped PC companion action after checkpoint restore',()=>{
 const Story=require('../src/story-slice.js'),Desktop=require('../src/desktop-controls.js');
 const state=Story.createState();
 const go=id=>{state.world.player.x=Story.POINTS[id].x;state.world.player.z=Story.POINTS[id].z;};
 go('terminal');assert.equal(Story.interact(state).ok,true);
 for(const bot of state.world.bots)for(let i=0;i<2;i++){
  state.world.player.yaw=Math.atan2(bot.x-state.world.player.x,-(bot.z-state.world.player.z));
  state.world.player.pitch=0;state.world.elapsed+=.21;
  assert.equal(Story.fire(state).hit,true);
 }
 go('decision');assert.equal(Story.interact(state).ok,true);
 assert.equal(Story.choose(state,'evacuation').ok,true);
 go('muster');assert.equal(Story.interact(state).event,'muster');
 assert.equal(Story.interact(state).event,'guide');
 state.world.player.x=state.guide.x-1.6;state.world.player.z=state.guide.z;
 assert.equal(Story.nearest(state)?.id,'guideControl');
 assert.equal(Story.interact(state).event,'guideControl');
 const remapped=Desktop.bind(Desktop.normalize({}),'interact','KeyT');
 assert.equal(remapped.ok,true);
 const store=new Map([
  [Desktop.STORAGE_KEY,JSON.stringify(remapped.value)],
  ['veilpoint.story.ch01',Story.serialize(state)],
  ['veilpoint.brCheckpoint.v1','independent-BR']
 ]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 assert.match(app.element('routeStatus').textContent,/T로 재개 가능/);
 assert.doesNotMatch(app.element('routeStatus').textContent,/E로 재개 가능/);
 app.emit('keydown',{code:'KeyT'});
 const checkpoint=Story.restore(store.get('veilpoint.story.ch01'));
 assert.equal(checkpoint.guide.waiting,false);
 assert.equal(checkpoint.guide.active,true);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'independent-BR');
});


function completedBrowserReplayFixture(){
 const Story=require('../src/story-slice.js'),completed=Story.createState();
 const go=id=>{
  completed.world.player.x=Story.POINTS[id].x;
  completed.world.player.z=Story.POINTS[id].z;
 };
 go('terminal');assert.equal(Story.interact(completed).ok,true);
 for(const bot of completed.world.bots)for(let i=0;i<2;i++){
  completed.world.player.yaw=Math.atan2(bot.x-completed.world.player.x,
    -(bot.z-completed.world.player.z));
  completed.world.player.pitch=0;completed.world.elapsed+=.21;
  assert.equal(Story.fire(completed).hit,true);
 }
 go('decision');assert.equal(Story.interact(completed).ok,true);
 assert.equal(Story.choose(completed,'evacuation').ok,true);
 go('exitEvac');assert.equal(Story.interact(completed).ok,true);
 return {
  complete:Story.serialize(completed),
  debrief:JSON.stringify(Story.debrief(completed)),
  backup:Story.serialize(Story.createState())
 };
}

test('CH01 completed replay after browser refresh writes fresh first checkpoint before retiring debrief',()=>{
 const Story=require('../src/story-slice.js'),fixture=completedBrowserReplayFixture();
 const key='veilpoint.story.ch01',preview=key+'PreviewCompleted',backupKey=key+'.previous';
 const store=new Map([[key,fixture.complete],[preview,fixture.debrief],
   [backupKey,fixture.backup],['veilpoint.brCheckpoint.v1','BR-independent']]);
 const app=boot(store,false,'granted',true,true);
 assert.equal(app.element('continue').textContent,'CH01 새 미션 시작');
 assert.equal(store.get(key),fixture.complete,'read-only completion review must not write');
 app.element('continue').click();
 const replay=Story.restore(store.get(key));
 assert.equal(replay.phase,'terminal','new playable checkpoint is persisted on click');
 assert.equal(replay.world.player.z,12);
 assert.equal(replay.world.elapsed,0);
 assert.equal(store.has(preview),false,'retire old outcome after checkpoint succeeds');
 assert.equal(store.has(backupKey),false,'retire old complete generation backup');
 const refreshed=boot(store,false,'granted',true,true);
 assert.match(refreshed.element('menuText').textContent,/이전 진행 기록/);
 refreshed.element('continue').click();
 assert.match(refreshed.element('objective').textContent,/중계기/);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'BR-independent');
});

test('CH01 refreshed replay does not destroy completed snapshot when disk writes fail, retries after recovery',()=>{
 const Story=require('../src/story-slice.js'),fixture=completedBrowserReplayFixture();
 const key='veilpoint.story.ch01',preview=key+'PreviewCompleted',backupKey=key+'.previous';
 const store=new Map([[key,fixture.complete],[preview,fixture.debrief],[backupKey,fixture.backup]]);
 const app=boot(store,false,'granted',true,true);
 const originalSet=store.set.bind(store);
 let denials=0;
 store.set=(name,val)=>{
  if(name===key){denials++;throw Error('temporary storage denied');}
  return originalSet(name,val);
 };
 app.element('continue').click();
 assert.ok(denials>0);
 assert.equal(store.get(key),fixture.complete,'failed write leaves completed generation intact');
 assert.equal(store.get(preview),fixture.debrief,'readable outcome stays available until a durable replay');
 assert.equal(store.get(backupKey),fixture.backup,'previous backup remains readable');
 assert.match(app.element('saveStatus').textContent,/저장 실패/);
 assert.match(app.element('objective').textContent,/중계기/,'memory replay remains playable');
 store.set=originalSet;
 for(let i=1;i<=370;i++)app.frame(i*1000/60);
 assert.equal(Story.restore(store.get(key)).phase,'terminal','60Hz autosave retries the new generation');
 assert.equal(store.has(preview),false);
 assert.equal(store.has(backupKey),false);
});


test('CH01 recovery chooses a concurrent newer validated primary instead of stale backup mode',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backupKey=key+'.previous';
 const old=Story.serialize(Story.createState());
 const currentState=Story.createState();currentState.world.player.x=4;
 const current=Story.serialize(currentState);
 const storage=new Map([[key,'{interrupted'],[backupKey,old]]);
 const read=storage.get.bind(storage);
 let primaryReads=0;
 storage.get=name=>{
  if(name===key&&++primaryReads===2)storage.set(key,current);
  return read(name);
 };
 const app=boot(storage,false,'granted',true,true);
 assert.ok(primaryReads>=2);
 assert.equal(storage.get(key),current);
 assert.equal(storage.get(backupKey),old);
 assert.equal(app.element('continue').textContent,'체크포인트 이어하기',
  'the newer valid checkpoint must not be misreported as corrupt memory-only play');
 assert.match(app.element('menuText').textContent,/이전 진행 기록/);
 app.element('continue').click();
 app.element('pauseButton').click();
 assert.equal(Story.restore(storage.get(key)).world.player.x,4);
 assert.equal(app.element('saveStatus').classList.contains('hidden'),true);
});

test('CH01 recovery protects a backup replaced by another PC tab before promotion',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backupKey=key+'.previous';
 const first=Story.serialize(Story.createState());
 const latestState=Story.createState();latestState.world.player.x=5;
 const latest=Story.serialize(latestState),corrupt='{unfinished';
 const storage=new Map([[key,corrupt],[backupKey,first]]);
 const read=storage.get.bind(storage);
 let primaryReads=0;
 storage.get=name=>{
  if(name===key&&++primaryReads===2)storage.set(backupKey,latest);
  return read(name);
 };
 const app=boot(storage,false,'granted',true,true);
 assert.ok(primaryReads>=2);
 assert.equal(storage.get(key),corrupt,'do not promote obsolete backup bytes');
 assert.equal(storage.get(backupKey),latest,'preserve the newer validated backup');
 assert.match(app.element('menuText').textContent,/복원할 수 없습니다/,
  'a concurrent backup update cannot be claimed as a durable promotion');
 app.element('continue').click();
 assert.equal(Story.restore(storage.get(key)).world.player.x,5,
  'a fresh explicit read may safely promote the newest valid backup');
 app.element('pauseButton').click();
 assert.equal(Story.restore(storage.get(key)).world.player.x,5);
});

test('CH01 conflicting invalid backup update never destroys either disk generation',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backupKey=key+'.previous';
 const good=Story.serialize(Story.createState()),broken='{other-tab-incomplete';
 const storage=new Map([[key,'{bad-primary'],[backupKey,good]]);
 const read=storage.get.bind(storage);let reads=0;
 storage.get=name=>{
  if(name===key&&++reads===2)storage.set(backupKey,broken);
  return read(name);
 };
 const app=boot(storage,false,'granted',true,true);
 assert.equal(storage.get(key),'{bad-primary');
 assert.equal(storage.get(backupKey),broken);
 app.element('continue').click();
 assert.match(app.element('saveStatus').textContent,/임시 CH01 세션/);
 app.element('pauseButton').click();
 assert.equal(storage.get(key),'{bad-primary');
 assert.equal(storage.get(backupKey),broken);
});


test('Windows CH01 evacuation HUD shows visible guide spacing but never a remote civilian range',()=>{
 const Story=require('../src/story-slice.js');
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';state.musterConfirmed=true;
 state.combat.started=true;state.combat.cleared=true;
 state.world.bots=[{x:0,z:-28},{x:15,z:-34},{x:-15,z:-34}].map(({x,z},id)=>({
  id,x,z,angle:Math.PI,health:0,alive:false,shots:12
 }));
 state.guide={active:true,arrived:false,released:false,waiting:false,x:-10.5,z:-55};
 state.world.player.x=-5.9;state.world.player.z=-55;
  state.world.player.yaw=-Math.PI/2; // Face west toward the actual guide.
 const key='veilpoint.story.ch01',store=new Map([[key,Story.serialize(state)],
   ['veilpoint.brCheckpoint.v1','independent-BR']]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 assert.match(app.element('routeStatus').textContent,/시야 내 안내원 간격 4\.6m/);
 assert.doesNotMatch(app.element('routeStatus').textContent,/천천히 이동해 동행 유지/);
 const remote=Story.restore(Story.serialize(state));
 remote.world.player.x=0;remote.world.player.z=-35;
 const hidden=boot(new Map([[key,Story.serialize(remote)]]),false,'granted',true,true);
 hidden.element('continue').click();
 assert.doesNotMatch(hidden.element('routeStatus').textContent,/시야 내 안내원 간격|[0-9]\.\dm/);
 assert.match(hidden.element('routeStatus').textContent,/마지막으로 확인한 위치/);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'independent-BR');
});

test('CH01 PC walking pace hint appears only for a nearby visible escort who is actually following',()=>{
 const Story=require('../src/story-slice.js');
 const state=Story.createState();
 state.phase='exit';state.choice='evacuation';state.musterConfirmed=true;
 state.combat.started=true;state.combat.cleared=true;
 state.world.bots=[{x:0,z:-28},{x:15,z:-34},{x:-15,z:-34}].map(({x,z},id)=>({
  id,x,z,angle:Math.PI,health:0,alive:false,shots:12
 }));
 state.guide={active:true,arrived:false,released:false,waiting:false,x:-10.5,z:-55};
 state.world.player.x=-4.2;state.world.player.z=-55;
  state.world.player.yaw=-Math.PI/2; // PC actor looks at the civilian.
 const key='veilpoint.story.ch01';
 const moving=boot(new Map([[key,Story.serialize(state)]]),false,'granted',true,true);
 moving.element('continue').click();
 assert.match(moving.element('routeStatus').textContent,/시야 내 안내원 간격 6\.3m/);
 assert.match(moving.element('routeStatus').textContent,/천천히 이동해 동행 유지/);
 state.guide.waiting=true;
 const paused=boot(new Map([[key,Story.serialize(state)]]),false,'granted',true,true);
 paused.element('continue').click();
 assert.match(paused.element('routeStatus').textContent,/시야 내 안내원 간격 6\.3m/);
 assert.doesNotMatch(paused.element('routeStatus').textContent,/천천히 이동해 동행 유지/,
   'a waiting guide should not tell the captain to maintain a follow pace');
});


test('Windows CH01 Save & Exit verifies a durable paused checkpoint before navigating to the mode hub',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01';
 const shared=new Map([['veilpoint.brCheckpoint.v1','unchanged-BR']]);
 const app=boot(shared,false,'granted',true,true);
 assert.equal(app.element('saveExit').classList.contains('hidden'),true,
  'Save & Exit cannot be used before a playable mission begins');
 app.element('continue').click();
 app.moveForward(0,145);
 app.element('pauseButton').click();
 const elapsed=Story.restore(shared.get(key)).world.elapsed;
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.element('saveExit').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,app.element('continue'),
  'PC focus must move from the hidden scene to a visible menu action');
 assert.deepEqual(app.navigations,[]);
 app.element('saveExit').click();
 assert.deepEqual(app.navigations,['index.html'],
  'an explicit successful Save & Exit returns to the offline mode hub');
 const durable=Story.restore(shared.get(key));
 assert.equal(durable.phase,'terminal');
 assert.ok(durable.world.elapsed>=elapsed);
 const reload=boot(shared,false,'granted',true,true);
 assert.match(reload.element('menuText').textContent,/이전 진행 기록/);
 reload.element('continue').click();
 reload.element('pauseButton').click();
 assert.ok(Story.restore(shared.get(key)).world.elapsed>=durable.world.elapsed);
 assert.equal(shared.get('veilpoint.brCheckpoint.v1'),'unchanged-BR');
});

test('Windows CH01 Save & Exit refuses disk write denial without leaving or losing a valid checkpoint',()=>{
 const Story=require('../src/story-slice.js'),key='veilpoint.story.ch01';
 const shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();
 app.moveForward(0,360);
 const lastValid=shared.get(key),writer=shared.set.bind(shared);
 assert.ok(lastValid,'five-second automatic checkpoint exists before storage denial');
 let failures=0;
 shared.set=(name,value)=>{
  if(name===key){failures++;throw new Error('quota exhausted');}
  return writer(name,value);
 };
 app.element('pauseButton').click();
 app.element('saveExit').click();
 assert.ok(failures>=2,'pause and explicit exit both attempt guarded saves');
 assert.equal(shared.get(key),lastValid,'a quota error never damages the prior checkpoint');
 assert.deepEqual(app.navigations,[]);
 assert.match(app.element('menuText').textContent,/안전하게 저장되지 않았습니다/);
 assert.match(app.element('saveStatus').textContent,/저장 실패/);
 shared.set=writer;
 app.element('saveExit').click();
 assert.deepEqual(app.navigations,['index.html'],'a later successful write permits exit');
 assert.ok(Story.restore(shared.get(key)).world.elapsed>=Story.restore(lastValid).world.elapsed);
});

test('Windows CH01 Save & Exit keeps an older PC tab in the game when a newer tab owns the save',()=>{
 const key='veilpoint.story.ch01',shared=new Map();
 const old=boot(shared,false,'granted',true,true);
 old.element('continue').click();old.moveForward(0,60);
 old.element('pauseButton').click();
 const newest=boot(shared,false,'granted',true,true);
 newest.element('continue').click();newest.moveForward(0,65);
 newest.element('pauseButton').click();
 const current=shared.get(key);
 old.element('saveExit').click();
 assert.deepEqual(old.navigations,[],'the old browser tab cannot navigate on a failed save');
 assert.equal(shared.get(key),current,'the newer checkpoint remains unchanged');
 assert.match(old.element('menuText').textContent,/기존 기록을 보호/);
 assert.equal(old.context.document.activeElement,old.element('continue'));
 old.element('continue').click();
 assert.equal(old.element('menu').classList.contains('hidden'),true,
  'failed exit never softlocks the paused mission');
});


test('Windows CH01 manual checkpoint save retries a failed pause without navigating or advancing 60Hz world',()=>{
 const Story=require('../src/story-slice.js'),key='veilpoint.story.ch01';
 const shared=new Map(),app=boot(shared,false,'granted',true,true);
 assert.equal(app.element('saveCheckpoint').classList.contains('hidden'),true);
 app.element('continue').click();
 app.moveForward(0,360);
 const prior=shared.get(key),writer=shared.set.bind(shared);
 assert.ok(prior);
 shared.set=(name,value)=>{
   if(name===key)throw new Error('quota denied');
   return writer(name,value);
 };
 app.moveForward(360,35);
 app.element('pauseButton').click();
 assert.equal(app.element('saveCheckpoint').classList.contains('hidden'),false);
 app.element('saveCheckpoint').click();
 assert.deepEqual(app.navigations,[]);
 assert.equal(shared.get(key),prior);
 assert.match(app.element('menuText').textContent,/저장 실패/);
 shared.set=writer;
 app.element('saveCheckpoint').click();
 assert.match(app.element('menuText').textContent,/저장 확인 완료/);
 assert.deepEqual(app.navigations,[]);
 const restored=Story.restore(shared.get(key));
 assert.ok(restored.world.elapsed>Story.restore(prior).world.elapsed);
 const frozen=shared.get(key);
 app.element('saveCheckpoint').click();
 assert.equal(shared.get(key),frozen,'manual retry does not tick simulation or change the checkpoint');
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
});

test('Windows CH01 manual checkpoint retry cannot overwrite a newer tab or navigate',()=>{
 const key='veilpoint.story.ch01',shared=new Map();
 const old=boot(shared,false,'granted',true,true);
 old.element('continue').click();old.moveForward(0,100);old.element('pauseButton').click();
 const fresh=boot(shared,false,'granted',true,true);
 fresh.element('continue').click();fresh.moveForward(0,150);fresh.element('pauseButton').click();
 const newer=shared.get(key);
 old.element('saveCheckpoint').click();
 assert.equal(shared.get(key),newer);
 assert.deepEqual(old.navigations,[]);
 assert.match(old.element('menuText').textContent,/저장 실패/);
 old.element('continue').click();
 assert.equal(old.element('menu').classList.contains('hidden'),true);
});

test('Windows CH01 manual checkpoint retry stays inaccessible before the mission starts',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 assert.equal(app.element('saveCheckpoint').classList.contains('hidden'),true);
 app.element('saveCheckpoint').click();
 assert.deepEqual(app.navigations,[]);
 assert.equal(app.store.has('veilpoint.story.ch01'),false);
});


test('CH01 replay never retires the completed debrief after an acknowledged but discarded save',()=>{
 const Story=require('../src/story-slice.js'),fixture=completedBrowserReplayFixture();
 const key='veilpoint.story.ch01',preview=key+'PreviewCompleted',backupKey=key+'.previous';
 const shared=new Map([[key,fixture.complete],[preview,fixture.debrief],
   [backupKey,fixture.backup],['veilpoint.brCheckpoint.v1','independent-BR']]);
 const app=boot(shared,false,'granted',true,true);
 const realSet=shared.set.bind(shared);
 let discarded=0;
 shared.set=(name,val)=>{
  if(name===key){discarded++;return shared;}
  return realSet(name,val);
 };
 app.element('continue').click();
 assert.ok(discarded>0);
 assert.equal(shared.get(key),fixture.complete);
 assert.equal(shared.get(preview),fixture.debrief,
  'a replay generation is not durable merely because setItem acknowledged it');
 assert.equal(shared.get(backupKey),fixture.backup);
 assert.match(app.element('saveStatus').textContent,/저장 실패/);
 assert.match(app.element('objective').textContent,/중계기/,'replay remains playable in the tab');
 shared.set=realSet;
 for(let n=1;n<=370;n++)app.frame(n*1000/60);
 assert.equal(Story.restore(shared.get(key)).phase,'terminal');
 assert.equal(shared.has(preview),false,'completed report retires after a real successful checkpoint');
 assert.equal(shared.has(backupKey),false);
 assert.equal(shared.get('veilpoint.brCheckpoint.v1'),'independent-BR');
});

test('CH01 Save & Exit rejects silent disk-write loss and navigates only after a verified retry',()=>{
 const key='veilpoint.story.ch01',shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,360);
 const prior=shared.get(key);
 assert.ok(prior);
 const realSet=shared.set.bind(shared);
 let dropped=0;
 shared.set=(name,val)=>{
  if(name===key){dropped++;return shared;}
  return realSet(name,val);
 };
 app.element('pauseButton').click();app.element('saveExit').click();
 assert.ok(dropped>=2);
 assert.equal(shared.get(key),prior,'last durable generation remains readable');
 assert.deepEqual(app.navigations,[]);
 assert.match(app.element('menuText').textContent,/안전하게 저장되지 않았습니다/);
 assert.match(app.element('saveStatus').textContent,/저장 실패/);
 shared.set=realSet;
 app.element('saveCheckpoint').click();
 assert.match(app.element('menuText').textContent,/저장 확인 완료/);
 app.element('saveExit').click();
 assert.deepEqual(app.navigations,['index.html']);
});

test('CH01 save readback detects another PC tab replacing the generation after a successful write',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,360);
 const newest=Story.createState();newest.world.player.x=4;
 const concurrent=Story.serialize(newest);
 const realSet=shared.set.bind(shared);
 let replaced=0;
 shared.set=(name,val)=>{
  const result=realSet(name,val);
  if(name===key&&replaced++===0)realSet(key,concurrent);
  return result;
 };
 app.element('pauseButton').click();app.element('saveExit').click();
 assert.equal(shared.get(key),concurrent,'latest externally committed save must survive');
 assert.deepEqual(app.navigations,[]);
 assert.match(app.element('saveStatus').textContent,/저장 실패|보류/);
 shared.set=realSet;
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true,
  'save conflict must not strand the current mission');
});


test('CH01 Windows route status shows the physical exit without a paperwork checklist',()=>{
  const app=boot(new Map([['veilpoint.brCheckpoint.v1','unchanged']]),false,'granted',true,true);
  assert.equal(app.element('taskTracker').classList.contains('hidden'),true);
  app.element('continue').click();
  assert.equal(app.element('taskTracker').classList.contains('hidden'),true);
  app.moveForward(0,300);app.interact();
  const cleared=app.clearEncounter(300);
  app.moveForward(cleared,225);app.interact();
  app.element('choiceEvac').click();
  const tracker=app.element('taskTracker');
  assert.equal(tracker.classList.contains('hidden'),false);
  assert.match(tracker.textContent,/남쪽 대피 · 남쪽 안뜰 도착 · 직접 이동 가능/);
  assert.equal(tracker.textContent.split('\n').length,1,
    'historical optional reports remain available in state but are not shown as chores');
  assert.doesNotMatch(tracker.textContent,/장부|기록|비상 물품/);
  app.moveForward(cleared+225,193);app.interact();
  assert.match(app.element('menuText').textContent,/CH01 완료/);
  assert.match(tracker.textContent,/남쪽 안뜰 도착 · 현장 도착/);
  assert.doesNotMatch(tracker.textContent,/비상 물품 인계 완료/,
    'an optional transfer cannot be granted by the ending');
  assert.equal(app.store.get('veilpoint.brCheckpoint.v1'),'unchanged');
});

test('CH01 completed mission review shows a verified exit without recreating optional checklists',()=>{
  const fixture=completedBrowserReplayFixture(),key='veilpoint.story.ch01';
  const store=new Map([[key,fixture.complete],[key+'PreviewCompleted',fixture.debrief]]);
  const app=boot(store,false,'granted',true,true);
  assert.equal(app.element('taskTracker').classList.contains('hidden'),true);
  const before=store.get(key);
  app.element('reviewCompleted').click();
  const tracker=app.element('taskTracker');
  assert.equal(tracker.classList.contains('hidden'),false);
  assert.match(tracker.textContent,/남쪽 안뜰 도착 · 현장 도착/);
  assert.doesNotMatch(tracker.textContent,/집결지 인원 확인|선택 과제/);
  assert.equal(store.get(key),before,'read-only review does not change mission generations');
  assert.equal(app.element('menu').classList.contains('hidden'),false);
});


test('CH01 PC route navigation targets required courtyard while allowing optional manual waypoints',()=>{
  const app=boot(new Map(),false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const cleared=app.clearEncounter(300);
  app.moveForward(cleared,225);app.interact();
  app.element('choiceEvac').click();
  const navigation=app.element('navigation');
  assert.match(navigation.textContent,/주요 임무 표식.*안전한 안뜰/,
    'nearby optional supplies must not replace the required route endpoint');
  assert.match(app.element('taskTracker').textContent,/남쪽 안뜰 도착/);
  app.emit('keydown',{code:'KeyN'});
  assert.match(navigation.textContent,/선택한 임무 표식.*안전한 안뜰/);
  app.emit('keydown',{code:'KeyN'});
  assert.match(navigation.textContent,/안전한 안뜰|민간 구조용 비상 물품 상자/,
    'only the main route or a physically nearby optional supply may be selected');
  assert.doesNotMatch(navigation.textContent,/기록함|장부|급수대/,
    'optional document markers remain local discoveries rather than global chores');
  app.element('pauseButton').click();
  const saved=app.store.get('veilpoint.story.ch01');
  const refreshed=boot(app.store,false,'granted',true,true);
  refreshed.element('continue').click();
  assert.match(refreshed.element('navigation').textContent,/주요 임무 표식.*안전한 안뜰/,
    'after checkpoint reload, the default remains the route endpoint');
  assert.equal(app.store.get('veilpoint.story.ch01'),saved);
});


test('CH01 field journal reveals only discovered records and survives checkpoint restoration',()=>{
  const Story=require('../src/story-slice.js');
  const journal=require('../src/field-journal.js');
  const state=Story.createState();
  let rows=journal.entries(state);
  assert.equal(rows.length,2);
  assert.equal(rows.every(row=>!row.unlocked),true);
  assert.equal(rows.some(row=>row.detail.includes('04:07')),false);
  const restored=Story.restore(Story.serialize(state));
  restored.found=['recordB'];
  rows=journal.entries(restored);
  assert.equal(rows[0].unlocked,false);
  assert.equal(rows[1].unlocked,true);
  assert.match(rows[1].detail,/04:07/);
  state.found=['recordA','recordB'];
  rows=journal.entries(state);
  assert.equal(rows.length,3);
  assert.match(rows[2].detail,/원인은 아직 확정되지/);
  state.gateLogReviewed=true;
  state.logHandedOff=true;
  assert.match(journal.entries(state)[3].detail,/접수 완료/);
});

test('CH01 PC pause journal opens, closes on Escape and never advances mission',()=>{
  const app=boot();
  app.element('continue').click();
  app.frame(1000/60);
  app.element('pauseButton').click();
  const before=app.store.get('veilpoint.story.ch01');
  app.element('fieldJournalOpen').click();
  assert.equal(app.element('fieldJournal').classList.contains('hidden'),false);
  assert.equal(app.element('fieldJournalEntries').children.length,2);
  assert.match(app.element('fieldJournalEntries').children[0].textContent,/미확인/);
  app.emit('keydown',{code:'Escape'});
  assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
  assert.equal(app.element('menu').classList.contains('hidden'),false);
  assert.equal(app.store.get('veilpoint.story.ch01'),before);
});


test('CH01 Windows J shortcut opens field notes through a paused clock and Escape returns safely',()=>{
 const Story=require('../src/story-slice.js');
 const shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,130);
 app.emit('keydown',{code:'KeyJ'});
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,app.element('fieldJournalClose'));
 const saved=shared.get('veilpoint.story.ch01');
 const at=Story.restore(saved).world.elapsed;
 for(let i=131;i<=240;i++)app.frame(i*1000/60);
 assert.equal(Story.restore(shared.get('veilpoint.story.ch01')).world.elapsed,at,
   'journal never advances the world while the player cannot control the game');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
 assert.equal(app.element('menu').classList.contains('hidden'),false,'first Escape closes only notes');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('menu').classList.contains('hidden'),true,'second Escape resumes the mission');
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
});

test('CH01 remapped J key remains a real gameplay control instead of opening notes',()=>{
 const Desktop=require('../src/desktop-controls.js');
 const config=Desktop.bind(Desktop.normalize({}),'headlamp','KeyJ');
 assert.equal(config.ok,true);
 const shared=new Map([[Desktop.STORAGE_KEY,JSON.stringify(config.value)]]);
 const app=boot(shared,false,'granted',true,true);
 app.element('continue').click();
 app.emit('keydown',{code:'KeyJ'});
 assert.equal(app.element('menu').classList.contains('hidden'),true,
   'J must not steal a user-assigned gameplay action');
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
 app.element('pauseButton').click();
 app.element('fieldJournalOpen').click();
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),false,
   'paused menu still offers an accessible field journal with custom controls');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
});

test('CH01 field journal cannot interrupt an active route-choice dialog',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();
 app.moveForward(0,300);app.interact();
 const cleared=app.clearEncounter(300);
 app.moveForward(cleared,225);app.interact();
 assert.equal(app.element('choices').classList.contains('hidden'),false);
 app.emit('keydown',{code:'KeyJ'});
 assert.equal(app.element('choices').classList.contains('hidden'),false);
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
});



test('CH01 defeated PC session adopts a newer valid saved checkpoint and can save subsequent progress',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01';
  const oldest=Story.createState('carbine');
  oldest.world.player.x=Story.POINTS.terminal.x;
  oldest.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(oldest).ok,true);
  oldest.world.player.health=4;
  oldest.world.player.loaded=12;
  const shared=new Map([[key,Story.serialize(oldest)]]);
  const app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  assert.match(app.element('objective').textContent,/무장 대치자/);
  let failed=false;
  for(let i=1;i<=2400;i++){
    app.frame(i*1000/60);
    if(app.element('menuText').textContent.includes('교전 중 임무가 중단')){
      failed=true;break;
    }
  }
  assert.equal(failed,true,'actual fixed-step hostile state must trigger the retry menu');
  const newer=Story.restore(shared.get(key));
  newer.world.player.health=58;
  newer.world.player.loaded=7;
  newer.world.player.charges=17;
  const secondTab=Story.serialize(newer);
  shared.set(key,secondTab);
  app.element('continue').click();
  assert.equal(app.element('menu').classList.contains('hidden'),true);
  assert.match(app.element('healthStatus').textContent,/58[/]100/,
    'retry resumes the validated generation written by the newer tab');
  assert.match(app.element('combatStatus').textContent,/탄창 7 [/] 예비 10/,
    'latest finite supplies are not replaced by stale in-memory values');
  assert.equal(shared.get(key),secondTab,'retry must not write a fabricated checkpoint');
  app.element('pauseButton').click();
  const saved=Story.restore(shared.get(key));
  assert.equal(saved.world.player.health,58,'after adopting the primary, pause can save the new session');
  assert.equal(saved.world.player.loaded,7);
  assert.doesNotMatch(app.element('menuText').textContent,/다른 창에서 체크포인트 변경/,
    'a deliberately adopted primary is no longer a stale-tab conflict');
});

test('CH01 retry never adopts invalid disk data and preserves the protected primary',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01';
  const original=Story.createState();
  original.world.player.x=Story.POINTS.terminal.x;
  original.world.player.z=Story.POINTS.terminal.z;
  Story.interact(original);
  original.world.player.health=4;
  const shared=new Map([[key,Story.serialize(original)]]);
  const app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  let failed=false;
  for(let i=1;i<=2400;i++){
    app.frame(i*1000/60);
    if(app.element('menuText').textContent.includes('교전 중 임무가 중단')){failed=true;break;}
  }
  assert.equal(failed,true);
  shared.set(key,'{invalid-checkpoint');
  app.element('continue').click();
  assert.match(app.element('healthStatus').textContent,/4[/]100/,
    'failed primary validation uses the existing last alive snapshot');
  app.element('pauseButton').click();
  assert.equal(shared.get(key),'{invalid-checkpoint',
    'corrupt disk data is preserved for explicit recovery instead of overwritten');
  assert.match(app.element('menuText').textContent,/저장 실패/);
});


test('CH01 explicit New Game refuses disk writes when primary deletion fails',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01',backup='veilpoint.story.ch01.previous';
  const old=Story.createState();
  old.world.player.x=Story.POINTS.terminal.x;
  old.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(old).ok,true);
  const original=Story.serialize(old);
  class DeniedReset extends Map{
    denyPrimary=true;
    delete(name){
      if(name===key&&this.denyPrimary)throw new Error('delete blocked');
      return super.delete(name);
    }
  }
  const shared=new DeniedReset([[key,original],[backup,original]]);
  const app=boot(shared,false,'granted',true,true);
  app.element('newGame').click();
  assert.match(app.element('objective').textContent,/중계기/);
  assert.match(app.element('saveStatus').textContent,/임시 CH01 세션/);
  app.moveForward(0,300);app.interact();
  assert.match(app.element('objective').textContent,/무장 대치자/);
  assert.equal(shared.get(key),original,'refused reset must never overwrite the older playable primary');
  assert.match(app.element('saveStatus').textContent,/기존 저장 기록은 변경하지 않았습니다/);
  const reloaded=boot(shared,false,'granted',true,true);
  reloaded.element('continue').click();
  assert.match(reloaded.element('objective').textContent,/무장 대치자/,
    'old playable mission remains accessible in another PC session');
  app.element('pauseButton').click();
  shared.denyPrimary=false;
  app.element('newGame').click();
  assert.match(app.element('objective').textContent,/중계기/);
  assert.equal(shared.has(key),false,'verified retry clears the old primary');
  assert.equal(shared.has(backup),false,'verified retry clears the old backup');
  app.moveForward(300,300);app.interact();
  assert.equal(JSON.parse(shared.get(key)).phase,'engagement',
    'a successful reset permits new checkpoint persistence again');
});

test('CH01 New Game preserves the primary when backup removal is silently ignored',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01',backup='veilpoint.story.ch01.previous';
  const old=Story.createState();
  old.world.player.x=Story.POINTS.terminal.x;
  old.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(old).ok,true);
  const original=Story.serialize(old);
  class IgnoredErase extends Map{
    ignoreBackup=true;
    delete(name){
      if(name===backup&&this.ignoreBackup)return false;
      return super.delete(name);
    }
  }
  const shared=new IgnoredErase([[key,original],[backup,original]]);
  const app=boot(shared,false,'granted',true,true);
  app.element('newGame').click();
  assert.equal(shared.get(key),original,'backup reset failure must not delete the newest primary');
  assert.equal(shared.get(backup),original);
  app.moveForward(0,300);app.interact();
  assert.equal(shared.get(key),original,'temporary play cannot replace unreset primary');
  app.element('pauseButton').click();
  shared.ignoreBackup=false;
  app.element('newGame').click();
  assert.equal(shared.has(key),false);
  assert.equal(shared.has(backup),false);
});

test('CH01 New Game does not assume write access when storage reads are denied',()=>{
  const shared=new Map(),app=boot(shared,false,'granted',true,true,true);
  app.element('newGame').click();
  assert.match(app.element('saveStatus').textContent,/임시 CH01 세션/);
  app.moveForward(0,300);app.interact();
  assert.equal(shared.has('veilpoint.story.ch01'),false,
    'read failure cannot be treated as an empty, writable save slot');
});


test('CH01 PC mode link cannot bypass failed durable checkpoint on paused mission',()=>{
  const key='veilpoint.story.ch01';
  class FailingStorage extends Map{
    fail=false;
    set(name,value){
      if(this.fail&&name===key)throw new Error('quota denied');
      return super.set(name,value);
    }
  }
  const shared=new FailingStorage(),app=boot(shared,false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const durable=shared.get(key);
  assert.ok(durable);
  shared.fail=true;
  app.moveForward(300,60);
  app.element('pauseButton').click();
  let cancelled=false;
  app.element('modeSelectLink').dispatch('click',{
    preventDefault(){cancelled=true;}
  });
  assert.equal(cancelled,true,'native anchor navigation is intercepted for active missions');
  assert.deepEqual(app.navigations,[],
    'mode selection is refused while the latest CH01 checkpoint is not durable');
  assert.equal(shared.get(key),durable,
    'failed save does not alter the previous valid checkpoint');
  assert.match(app.element('menuText').textContent,/안전하게 저장되지 않았습니다/);
});

test('CH01 PC mode link uses the same verified save gate as Save & Exit',()=>{
  const Story=require('../src/story-slice.js');
  const key='veilpoint.story.ch01',shared=new Map();
  const app=boot(shared,false,'granted',true,true);
  let cancelled=false;
  app.element('modeSelectLink').dispatch('click',{
    preventDefault(){cancelled=true;}
  });
  assert.equal(cancelled,false,'before a mission the link retains normal browser navigation');
  app.element('continue').click();
  app.moveForward(0,130);
  app.element('pauseButton').click();
  const before=shared.get(key);
  assert.ok(before);
  app.element('modeSelectLink').dispatch('click',{
    preventDefault(){cancelled=true;}
  });
  assert.equal(cancelled,true);
  assert.deepEqual(app.navigations,['index.html'],
    'verified pause menu link may return to the offline mode selector');
  const saved=Story.restore(shared.get(key));
  assert.equal(saved.world.elapsed,Story.restore(before).world.elapsed,
    'menu navigation cannot silently advance the 60Hz mission clock');
});

test('CH01 hidden mode link never overrides a visible route-choice dialog',()=>{
  const app=boot(new Map(),false,'granted',true,true);
  app.element('continue').click();
  app.moveForward(0,300);app.interact();
  const afterEncounter=app.clearEncounter(300);
  app.moveForward(afterEncounter,225);app.interact();
  assert.equal(app.element('choices').classList.contains('hidden'),false);
  let cancelled=false;
  app.element('modeSelectLink').dispatch('click',{
    preventDefault(){cancelled=true;}
  });
  assert.equal(cancelled,true);
  assert.deepEqual(app.navigations,[]);
  assert.equal(app.element('choices').classList.contains('hidden'),false);
});


test('CH01 old PC tab cannot reset another tab newer durable checkpoint via New Game',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',shared=new Map();
 const first=boot(shared,false,'granted',true,true);
 first.element('continue').click();
 first.moveForward(0,300);first.interact();
 assert.match(first.element('objective').textContent,/무장 대치자/);
 const oldest=shared.get(key);
 const second=boot(shared,false,'granted',true,true);
 second.element('continue').click();
 second.moveForward(0,90);
 second.element('pauseButton').click();
 const latest=shared.get(key),backup=shared.get('veilpoint.story.ch01.previous');
 assert.notEqual(latest,oldest,'second PC tab must save a newer world generation');
 first.element('pauseButton').click();
 first.element('newGame').click();
 assert.match(first.element('objective').textContent,/중계기/,
   'old tab starts an independent new in-memory world');
 assert.match(first.element('saveStatus').textContent,/다른 창의 최신 CH01 체크포인트 보호 중/,
   'the player must see that disk saving is deliberately suspended');
 assert.equal(shared.get(key),latest,'newer tab checkpoint cannot be deleted');
 assert.equal(shared.get('veilpoint.story.ch01.previous'),backup,
   'stale reset cannot erase the other tab backup');
 first.moveForward(300,300);first.interact();
 assert.equal(shared.get(key),latest,'temporary 60Hz gameplay never replaces latest checkpoint');
 assert.equal(shared.get('veilpoint.story.ch01.previous'),backup);
 const restored=boot(shared,false,'granted',true,true);
 restored.element('continue').click();
 assert.equal(Story.restore(shared.get(key)).phase,'engagement');
 assert.match(restored.element('objective').textContent,/무장 대치자/,
   'the updated mission remains playable in a fresh browser session');
});

test('CH01 menu New Game on an old page cannot delete unseen recent tab save',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',seed=Story.createState();
 const shared=new Map([[key,Story.serialize(seed)]]);
 const oldMenu=boot(shared,false,'granted',true,true);
 const other=boot(shared,false,'granted',true,true);
 other.element('continue').click();
 other.moveForward(0,300);other.interact();
 const durable=shared.get(key);
 assert.equal(Story.restore(durable).phase,'engagement');
 oldMenu.element('newGame').click();
 assert.match(oldMenu.element('saveStatus').textContent,/다른 창의 최신 CH01 체크포인트 보호 중/);
 assert.equal(shared.get(key),durable);
 oldMenu.moveForward(0,300);oldMenu.interact();
 assert.equal(shared.get(key),durable);
 const fresh=boot(shared,false,'granted',true,true);
 fresh.element('newGame').click();
 assert.equal(shared.has(key),false,
   'a fresh tab that has observed the current save can explicitly reset it');
 fresh.moveForward(0,300);fresh.interact();
 assert.equal(Story.restore(shared.get(key)).phase,'engagement',
   'verified reset returns to normal durable mission saves');
});


test('CH01 PC pause menu restores the prior durable fixed-step checkpoint and preserves resources',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backup=key+'.previous',shared=new Map();
 const app=boot(shared,false,'granted',true,true);
 assert.equal(app.element('restorePrevious').classList.contains('hidden'),true,
   'the recovery action does not appear before a mission');
 app.element('continue').click();
 app.moveForward(0,300);app.interact();
 app.moveForward(300,55);
 app.element('pauseButton').click();
 assert.equal(app.element('restorePrevious').classList.contains('hidden'),false);
 const latest=Story.restore(shared.get(key));
 const previousRaw=shared.get(backup);
 assert.ok(previousRaw,'a prior valid saved generation must exist');
 const previous=Story.restore(previousRaw);
 assert.ok(previous.world.elapsed<latest.world.elapsed);
 app.element('restorePrevious').click();
 assert.equal(shared.get(key),Story.serialize(latest),'first click must not overwrite the saved CH01 world');
 assert.match(app.element('restorePrevious').textContent,/다시 클릭/);
 assert.match(app.element('menuText').textContent,/한 번 더/);
 app.element('restorePrevious').click();
 const restored=Story.restore(shared.get(key));
 assert.equal(restored.world.elapsed,previous.world.elapsed,
   'manual recovery replaces the latest snapshot with the validated older 60Hz world');
 assert.equal(restored.world.player.loaded,previous.world.player.loaded);
 assert.equal(restored.world.player.charges,previous.world.player.charges);
 assert.deepEqual(restored.world.player.x,previous.world.player.x);
 assert.equal(shared.get(backup),Story.serialize(latest),
   'the former latest state remains the new backup, rather than being deleted');
 assert.match(app.element('menuText').textContent,/이전 체크포인트를 복구했습니다/);
 assert.equal(app.element('menu').classList.contains('hidden'),false,
   'restore does not silently resume or advance the world');
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 const reload=boot(shared,false,'granted',true,true);
 reload.element('continue').click();
 assert.match(reload.element('objective').textContent,/무장 대치자/,
   'a second PC window can continue the verified recovered phase');
});

test('CH01 PC previous-checkpoint control refuses missing and invalid backups without changing live state',()=>{
 const key='veilpoint.story.ch01',backup=key+'.previous',shared=new Map();
 const app=boot(shared,false,'granted',true,true);
 app.element('continue').click();
 app.frame(1000/60);
 app.element('pauseButton').click();
 const initial=shared.get(key);
 app.element('restorePrevious').click();
 assert.equal(shared.get(key),initial);
 assert.match(app.element('menuText').textContent,/이전에 저장된 정상 체크포인트가 없어/);
 shared.set(backup,'{invalid-checkpoint');
 app.element('restorePrevious').click();
 assert.equal(shared.get(key),initial);
 assert.equal(shared.get(backup),'{invalid-checkpoint');
 assert.match(app.element('menuText').textContent,/검증할 수 없거나/);
});

test('CH01 previous checkpoint restore never overwrites a newer save from another tab',()=>{
 const key='veilpoint.story.ch01',backup=key+'.previous',shared=new Map();
 const old=boot(shared,false,'granted',true,true);
 old.element('continue').click();old.moveForward(0,300);old.interact();
 old.moveForward(300,65);old.element('pauseButton').click();
 const fresh=boot(shared,false,'granted',true,true);
 fresh.element('continue').click();
 fresh.moveForward(0,50);fresh.element('pauseButton').click();
 const protectedCurrent=shared.get(key),protectedBackup=shared.get(backup);
 old.element('restorePrevious').click();
 assert.equal(shared.get(key),protectedCurrent);
 assert.equal(shared.get(backup),protectedBackup);
 assert.match(old.element('menuText').textContent,/다른 창의 최신 저장 기록/);
});

test('CH01 previous checkpoint write rejection retains paused in-memory world',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backup=key+'.previous',shared=new Map();
 const app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 app.moveForward(300,55);app.element('pauseButton').click();
 const before=shared.get(key);
 const snapshot=Story.restore(before);
 assert.ok(shared.get(backup));
 const save=shared.set.bind(shared);
 shared.set=(k,value)=>{
   if(k===key)throw new Error('checkpoint write blocked');
   return save(k,value);
 };
 app.element('restorePrevious').click();
 assert.equal(shared.get(key),before,'confirmation cannot write');
 app.element('restorePrevious').click();
 assert.equal(shared.get(key),before);
 assert.match(app.element('menuText').textContent,/기존 진행으로 돌아왔습니다/);
 assert.match(app.element('objective').textContent,/무장 대치자/);
 shared.set=save;
 app.element('continue').click();
 app.frame(400*1000/60);
 app.element('pauseButton').click();
 assert.ok(Story.restore(shared.get(key)).world.elapsed>=snapshot.world.elapsed,
   'a failed restore does not replace the live world with an older generation');
});


test('CH01 previous-checkpoint confirmation resets on PC pause/resume and other save controls',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',store=new Map();
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 app.moveForward(300,55);app.element('pauseButton').click();
 const stable=store.get(key),prior=store.get(key+'.previous');
 assert.ok(prior);
 app.element('restorePrevious').click();
 assert.equal(store.get(key),stable);
 assert.match(app.element('restorePrevious').textContent,/다시 클릭/);
 app.element('saveCheckpoint').click();
 assert.equal(app.element('restorePrevious').textContent,'이전 체크포인트 복구');
 const afterSave=store.get(key);
 app.element('restorePrevious').click();
 assert.equal(store.get(key),afterSave,'first click after save only confirms');
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 app.frame(9000/60);
 app.element('pauseButton').click();
 assert.equal(app.element('restorePrevious').textContent,'이전 체크포인트 복구');
 const afterPause=store.get(key);
 app.element('restorePrevious').click();
 assert.equal(store.get(key),afterPause,'a new pause session must require fresh consent');
 assert.match(app.element('restorePrevious').textContent,/다시 클릭/);
 app.element('continue').click();
 app.element('pauseButton').click();
 assert.equal(app.element('restorePrevious').textContent,'이전 체크포인트 복구');
 assert.ok(Story.restore(store.get(key)));
});

test('CH01 previous-checkpoint confirmation binds to exact backup generation across tabs',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backup=key+'.previous',store=new Map();
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 app.moveForward(300,55);app.element('pauseButton').click();
 const primary=store.get(key),oldBackup=store.get(backup);
 assert.ok(oldBackup);
 app.element('restorePrevious').click();
 assert.match(app.element('restorePrevious').textContent,/다시 클릭/);
 const different=Story.restore(oldBackup);
 different.world.elapsed+=1;
 store.set(backup,Story.serialize(different));
 app.element('restorePrevious').click();
 assert.equal(store.get(key),primary,'second click cannot restore a different unconfirmed generation');
 assert.match(app.element('menuText').textContent,/백업 기록이 변경/);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 app.element('restorePrevious').click();
 const restored=Story.restore(store.get(key));
 assert.equal(restored.world.elapsed,different.world.elapsed,
   'the newly validated generation requires its own second confirmation');
 assert.equal(store.get(backup),primary,'verified rewind rotates the former primary for recovery');
});


test('CH01 backup promotion rejects silently ignored writes and preserves both disk generations',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backupKey=key+'.previous';
 const valid=Story.serialize(Story.createState()),damaged='{incomplete-primary';
 class IgnoredPrimary extends Map{
   attempts=0;
   set(name,value){
     if(name===key){this.attempts++;return this;} // reported successful, bytes discarded
     return super.set(name,value);
   }
 }
 const shared=new IgnoredPrimary([[backupKey,valid]]);
 // Map construction writes the backup only; insert malformed primary directly.
 Map.prototype.set.call(shared,key,damaged);
 const app=boot(shared,false,'granted',true,true);
 assert.ok(shared.attempts>0,'validated backup promotion must be attempted');
 assert.equal(shared.get(key),damaged,'failed readback cannot claim recovered primary');
 assert.equal(shared.get(backupKey),valid,'good backup remains available');
 app.element('continue').click();
 assert.match(app.element('objective').textContent,/중계기/);
 assert.match(app.element('saveStatus').textContent,/임시 CH01 세션/,
   'unverified promotion must not enable durable autosave for this tab');
 app.moveForward(0,300);app.interact();
 app.element('pauseButton').click();
 assert.equal(shared.get(key),damaged,'memory-only 60Hz world cannot replace bad primary');
 assert.equal(shared.get(backupKey),valid);
 assert.equal(shared.has('veilpoint.brCheckpoint.v1'),false,'BR save remains independent');
 // A fresh Windows tab with normal write access can recover the preserved
 // backup without any manual deletion of the original valid generation.
 const recovered=new Map([[key,damaged],[backupKey,valid]]);
 const fresh=boot(recovered,false,'granted',true,true);
 assert.equal(recovered.get(key),valid);
 fresh.element('continue').click();fresh.element('pauseButton').click();
 assert.ok(Story.restore(recovered.get(key)));
 assert.equal(fresh.element('saveStatus').classList.contains('hidden'),true);
});

test('CH01 backup promotion detects concurrent primary substitution after a reported write',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backupKey=key+'.previous';
 const valid=Story.serialize(Story.createState());
 const newer=Story.createState();newer.world.player.x=4;
 const newerRaw=Story.serialize(newer);
 const damaged='{interrupted-primary';
 const shared=new Map([[key,damaged],[backupKey,valid]]);
 const originalSet=shared.set.bind(shared);let injected=false;
 shared.set=(name,value)=>{
   if(name===key&&!injected){
     injected=true;return originalSet(name,newerRaw);
   }
   return originalSet(name,value);
 };
 const app=boot(shared,false,'granted',true,true);
 assert.equal(injected,true);
 assert.equal(shared.get(key),newerRaw,'the other tab newer valid primary is untouched');
 assert.equal(shared.get(backupKey),valid);
 assert.match(app.element('menuText').textContent,/복원할 수 없습니다/,
   'unsafe promotion must not be advertised as durable');
 const fresh=boot(shared,false,'granted',true,true);
 fresh.element('continue').click();
 fresh.element('pauseButton').click();
 assert.equal(Story.restore(shared.get(key)).world.player.x,4,
   'a later explicit Continue uses the current verified generation');
});


test('CH01 autosave never overwrites primary when browser silently discards its backup',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backup=key+'.previous',store=new Map();
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();
 // The first CH01 checkpoint is written at an actual 60Hz autosave boundary,
 // not merely by opening the initial menu.
 app.moveForward(0,360);
 const first=store.get(key);
 assert.ok(first,'60Hz traversal must establish a real durable CH01 checkpoint');
 store.delete(backup);
 const nativeSet=store.set.bind(store);
 let ignored=0;
 store.set=(name,value)=>{
  if(name===backup){ignored++;return store;} // claimed success without bytes
  return nativeSet(name,value);
 };
 app.moveForward(360,120);app.element('pauseButton').click();
 assert.ok(ignored>0,'autosave tried to preserve the previous world');
 assert.equal(store.get(key),first,'the only valid primary survives blocked backup');
 assert.equal(store.has(backup),false,'false write was not treated as a durable backup');
 assert.match(app.element('saveStatus').textContent,/백업 검증 실패/);
 assert.match(app.element('menuText').textContent,/저장 실패/);
 assert.equal(app.element('saveExit').classList.contains('hidden'),false);
 app.element('saveExit').click();
 assert.deepEqual(app.navigations,[],'Save & Exit refuses to discard unsaved CH01 progress');
 store.set=nativeSet;
 app.element('saveCheckpoint').click();
 assert.equal(store.get(backup),first,'successful manual retry preserves old primary');
 assert.notEqual(store.get(key),first,'manual retry commits the current mission');
 assert.ok(Story.restore(store.get(key)));
 assert.deepEqual(app.navigations,[]);
});

test('CH01 autosave never replaces another tab latest checkpoint during backup rotation',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backup=key+'.previous',store=new Map();
 const old=boot(store,false,'granted',true,true);
 old.element('continue').click();
 old.moveForward(0,360);
 const original=store.get(key);
 assert.ok(original,'first real autosave must exist before cross-tab conflict');
 const concurrent=Story.createState();concurrent.world.player.x=4;
 const latest=Story.serialize(concurrent),nativeSet=store.set.bind(store);
 let rotated=0;
 store.set=(name,value)=>{
   if(name===backup){rotated++;nativeSet(name,value);return nativeSet(key,latest);}
   return nativeSet(name,value);
 };
 old.moveForward(360,120);old.element('pauseButton').click();
 assert.ok(rotated>0);
 assert.equal(store.get(key),latest,'other tab newer primary survives old autosave');
 assert.equal(store.get(backup),original,'previous world retained for recovery');
 assert.match(old.element('saveStatus').textContent,/다른 창에서 체크포인트 변경 감지/);
 old.element('saveExit').click();
 assert.deepEqual(old.navigations,[]);
 assert.equal(store.get(key),latest);
 store.set=nativeSet;
 const current=boot(store,false,'granted',true,true);
 current.element('continue').click();
 current.element('pauseButton').click();
 assert.equal(Story.restore(store.get(key)).world.player.x,4);
});


test('CH01 Windows G pauses live 60Hz mission, releases mouse and focuses real graphics selector',()=>{
 const key='veilpoint.story.ch01',store=new Map(),app=boot(store,false,'granted',true,true);
 const html=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 assert.match(html,/id="storyGraphicsOpen"[^>]*aria-controls="settings"[^>]*aria-keyshortcuts="G"/);
 assert.match(html,/ESC 일시정지[^<]*G 그래픽·키 설정/);
 app.element('continue').click();
 app.moveForward(0,60);
 assert.equal(app.context.document.pointerLockElement,app.element('scene'));
 app.emit('keydown',{code:'KeyG',target:{tagName:'CANVAS'}});
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.context.document.pointerLockElement,null);
 assert.equal(app.context.document.activeElement,app.element('quality'));
 assert.match(app.element('menuText').textContent,/그래픽·PC 설정/);
 const paused=JSON.parse(store.get(key));
 app.emit('keydown',{code:'Space',target:{tagName:'SELECT'}});
 for(let i=61;i<=200;i++)app.frame(i*1000/60);
 const after=JSON.parse(store.get(key));
 assert.equal(after.elapsed,paused.elapsed,'graphics focus cannot advance time while paused');
 assert.equal(after.player.charges,paused.player.charges,'graphics controls never spend mission resources');
 app.emit('keydown',{code:'Escape',target:{tagName:'SELECT'}});
 assert.equal(app.context.document.activeElement,app.element('continue'));
 assert.equal(app.element('menu').classList.contains('hidden'),false,
   'Escape from focused graphics setting only returns to pause menu');
 app.element('continue').click();
 app.frame(201*1000/60);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.equal(app.context.document.pointerLockElement,app.element('scene'));
 app.element('pauseButton').click();
 assert.ok(JSON.parse(store.get(key)).elapsed>paused.elapsed,
   'explicit resume continues the exact fixed-step mission');
});

test('CH01 menu graphics button and repeated G are safe before mission start',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('storyGraphicsOpen').click();
 assert.equal(app.context.document.activeElement,app.element('quality'));
 app.emit('keydown',{code:'KeyG',repeat:true,target:{tagName:'SELECT'}});
 assert.equal(app.context.document.activeElement,app.element('quality'),
   'OS held-key repeat cannot change menu state');
 app.emit('keydown',{code:'KeyG',target:{tagName:'SELECT'}});
 assert.equal(app.context.document.activeElement,app.element('quality'),
   'G preserves native graphics selector typing while the settings page is focused');
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.context.document.pointerLockElement,null);
 app.emit('keydown',{code:'KeyG',target:{tagName:'BUTTON'}});
 assert.equal(app.context.document.activeElement,app.element('continue'),
   'G from an ordinary menu button retains the explicit close shortcut');
 app.emit('keydown',{code:'KeyG'});
 assert.equal(app.context.document.activeElement,app.element('quality'));
 app.emit('keydown',{code:'Escape',target:{tagName:'SELECT'}});
 assert.equal(app.context.document.activeElement,app.element('continue'));
 app.emit('keydown',{code:'Escape',target:{tagName:'BUTTON'}});
 assert.equal(app.element('menu').classList.contains('hidden'),false,
   'Escape must never skip the initial mission start');
});

test('CH01 route choice modal cannot be bypassed by global G settings shortcut',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 const cleared=app.clearEncounter(300);
 app.moveForward(cleared,225);app.interact();
 assert.equal(app.element('choices').classList.contains('hidden'),false);
 const focus=app.context.document.activeElement;
 app.emit('keydown',{code:'KeyG',target:{tagName:'BUTTON'}});
 assert.equal(app.element('choices').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,focus,
   'the visible decision retains keyboard priority over settings shortcuts');
 app.emit('keydown',{code:'Digit1',target:{tagName:'BUTTON'}});
 assert.equal(app.element('choices').classList.contains('hidden'),true,
   'existing decision keys still choose the mission branch');
});

test('CH01 field journal retains modal priority over G graphics shortcut',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('fieldJournalOpen').click();
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),false);
 const focus=app.context.document.activeElement;
 app.emit('keydown',{code:'KeyG',target:{tagName:'BUTTON'}});
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,focus);
 app.emit('keydown',{code:'Escape',target:{tagName:'BUTTON'}});
 assert.equal(app.element('fieldJournal').classList.contains('hidden'),true);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
});

test('CH01 Windows route dialog survives pagehide/pageshow without silently choosing or stepping',()=>{
 const store=new Map(),app=boot(store,false,'granted',true,true);
 enterPCStoryDecision(app);
 const before=store.get('veilpoint.story.ch01');
 const chooser=app.element('choiceEvac');
 assert.equal(app.context.document.activeElement,chooser);
 app.emit('pagehide');
 assert.equal(app.element('choices').classList.contains('hidden'),false,
   'a paused route choice must not disappear behind the generic resume menu');
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 app.emit('pageshow',{persisted:true});
 assert.equal(app.element('choices').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,chooser,
   'Windows keyboard focus returns to the original accessible route choice');
 assert.equal(store.get('veilpoint.story.ch01'),before,
   'page navigation must not advance the world or decide a route');
 app.emit('keydown',{code:'Digit1',target:chooser});
 assert.equal(app.element('choices').classList.contains('hidden'),true);
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).choice,'evacuation');
});

test('CH01 finished debrief survives bfcache pagehide/pageshow without false resume text',()=>{
 const fixture=completedBrowserReplayFixture(),key='veilpoint.story.ch01',
  preview=key+'PreviewCompleted';
 const store=new Map([[key,fixture.complete],[preview,fixture.debrief],
   ['veilpoint.brCheckpoint.v1','BR-independent']]);
 const app=boot(store,false,'granted',true,true);
 app.element('reviewCompleted').click();
 const textBefore=app.element('menuText').textContent;
 const debrief=app.element('debriefReview').textContent;
 assert.match(textBefore,/종료 당시/);
 assert.match(debrief,/CH01 완료/);
 app.emit('pagehide');
 app.emit('pageshow',{persisted:true});
 assert.equal(app.element('menuText').textContent,textBefore);
 assert.equal(app.element('debriefReview').textContent,debrief);
 assert.equal(store.get(key),fixture.complete);
 assert.equal(store.get(preview),fixture.debrief);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'BR-independent');
});

test('CH01 Windows Save & Exit refuses cross-tab replacement after successful save readback',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',shared=new Map([['veilpoint.brCheckpoint.v1','BR-kept']]);
 const app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,360);
 app.element('pauseButton').click();
 const last=JSON.parse(shared.get(key));
 const foreign=JSON.stringify({...last,elapsed:last.elapsed+.25});
 const realGet=shared.get.bind(shared),realSet=shared.set.bind(shared);
 let readsAfterWrite=-1;
 shared.set=(name,value)=>{
   const result=realSet(name,value);
   if(name===key)readsAfterWrite=0;
   return result;
 };
 shared.get=name=>{
   const current=realGet(name);
   if(name===key&&readsAfterWrite>=0){
     readsAfterWrite++;
     if(readsAfterWrite===2)realSet(key,foreign);
   }
   return current;
 };
 app.element('saveExit').click();
 assert.ok(readsAfterWrite>=3,'second readback must occur after writer and menu verification');
 assert.deepEqual(app.navigations,[],'a changed save must not abandon the playable CH01 session');
 assert.equal(realGet(key),foreign,'the other tab generation must remain intact');
 assert.match(app.element('menuText').textContent,/저장 확인 직후/);
 assert.equal(app.element('saveStatus').classList.contains('hidden'),false);
 assert.equal(realGet('veilpoint.brCheckpoint.v1'),'BR-kept');
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.match(app.element('objective').textContent,/중계기/,
   'an interrupted menu transition preserves the original terminal mission phase');
});

test('CH01 Save & Exit does not navigate when last disk generation read is denied',()=>{
 const key='veilpoint.story.ch01',shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,360);app.element('pauseButton').click();
 const realGet=shared.get.bind(shared),realSet=shared.set.bind(shared);
 let readsAfterWrite=-1;
 shared.set=(name,value)=>{
   const result=realSet(name,value);
   if(name===key)readsAfterWrite=0;
   return result;
 };
 shared.get=name=>{
   if(name===key&&readsAfterWrite>=0&&++readsAfterWrite===3)
     throw new Error('temporary checkpoint read denied');
   return realGet(name);
 };
 app.element('saveExit').click();
 assert.deepEqual(app.navigations,[]);
 assert.match(app.element('menuText').textContent,/읽기 오류/);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 shared.get=realGet;shared.set=realSet;
 app.element('saveExit').click();
 assert.deepEqual(app.navigations,['index.html'],
   'a later real verified write can still exit without resetting CH01');
});

test('CH01 restore confirmation rejects a newer primary written after successful backup readback',()=>{
 const Story=require('../src/story-slice.js');
 const key='veilpoint.story.ch01',backup=key+'.previous',shared=new Map();
 const app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 app.moveForward(300,55);app.element('pauseButton').click();
 assert.ok(shared.get(backup),'previous fixed-step generation must exist');
 const previous=shared.get(key);
 app.element('restorePrevious').click();
 assert.match(app.element('restorePrevious').textContent,/다시 클릭/);
 const foreignState=Story.restore(previous);
 foreignState.world.elapsed+=3;
 const newer=Story.serialize(foreignState);
 const set=shared.set.bind(shared),get=shared.get.bind(shared);
 let primaryWritten=false,postWriteReads=0;
 shared.set=(name,value)=>{
   const result=set(name,value);
   if(name===key)primaryWritten=true;
   return result;
 };
 shared.get=name=>{
   if(name===key&&primaryWritten&&++postWriteReads===2)set(key,newer);
   return get(name);
 };
 app.element('restorePrevious').click();
 assert.equal(primaryWritten,true);
 assert.ok(postWriteReads>=2,'restore must recheck primary after its writer readback');
 assert.equal(get(key),newer,'a second tab must retain its new generation');
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.match(app.element('menuText').textContent,/복구 확정 후 저장 세대/);
 assert.match(app.element('saveStatus').textContent,/복구 재확인 실패/);
 shared.get=get;shared.set=set;
 app.element('continue').click();app.frame(500*1000/60);
 assert.equal(app.element('menu').classList.contains('hidden'),true,
   'failed restore must leave the live Windows mission playable');
 assert.equal(get(key),newer,'continuing stale in-memory world never overwrites another tab');
});

test('CH01 restore confirmation rejects backup rotation after the newly restored primary was written',()=>{
 const key='veilpoint.story.ch01',backup=key+'.previous',shared=new Map();
 const app=boot(shared,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,300);app.interact();
 app.moveForward(300,55);app.element('pauseButton').click();
 const previous=shared.get(key);
 app.element('restorePrevious').click();
 const set=shared.set.bind(shared),get=shared.get.bind(shared);
 let primaryWritten=false,backupReadsAfterWrite=0;
 shared.set=(name,value)=>{
   const result=set(name,value);
   if(name===key)primaryWritten=true;
   return result;
 };
 shared.get=name=>{
   if(name===backup&&primaryWritten&&++backupReadsAfterWrite===1)
     set(backup,'externally-rotated-backup');
   return get(name);
 };
 app.element('restorePrevious').click();
 assert.equal(primaryWritten,true);
 assert.ok(backupReadsAfterWrite>=1);
 assert.equal(get(backup),'externally-rotated-backup');
 assert.match(app.element('menuText').textContent,/복구 확정 후 저장 세대/);
 assert.match(app.element('saveStatus').textContent,/복구 재확인 실패/);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(shared.get('veilpoint.brCheckpoint.v1'),undefined,
   'backup recovery cannot touch the independent BR checkpoint');
 shared.get=get;shared.set=set;
});

test('CH01 Windows WebGL loss during route choice restores the focused decision without losing progress',()=>{
 const store=new Map([['veilpoint.brCheckpoint.v1','BR-independent']]);
 const app=boot(store,false,'granted',true,true);
 enterPCStoryDecision(app);
 const choice=app.element('choiceEvac'),before=store.get('veilpoint.story.ch01');
 assert.equal(app.context.document.activeElement,choice);
 app.element('scene').dispatch('webglcontextlost');
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 assert.equal(app.element('choices').classList.contains('hidden'),true);
 assert.equal(app.element('continue').disabled,true);
 app.frame(180000);
 assert.equal(store.get('veilpoint.story.ch01'),before,
   'no pending route or 60Hz progress may change during GPU interruption');
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,false);
 assert.equal(app.element('choices').classList.contains('hidden'),false,
   'the interrupted route decision must reappear, not generic resume');
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.equal(app.context.document.activeElement,choice,
   'keyboard focus must return to the visible PC choice button');
 assert.equal(store.get('veilpoint.story.ch01'),before);
 app.emit('keydown',{code:'Digit1',target:choice});
 assert.equal(app.element('choices').classList.contains('hidden'),true);
 assert.equal(JSON.parse(store.get('veilpoint.story.ch01')).choice,'evacuation');
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'BR-independent');
});

test('CH01 Windows route dialog survives a failed GPU rebuild and a later successful restoration',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 enterPCStoryDecision(app);
 const before=app.store.get('veilpoint.story.ch01');
 app.element('scene').dispatch('webglcontextlost');
 app.context.VeilpointRenderer.failNext=true;
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,true);
 assert.equal(app.element('choices').classList.contains('hidden'),true);
 assert.match(app.element('menuText').textContent,/복구 실패/);
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,false);
 assert.equal(app.element('choices').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,app.element('choiceEvac'));
 assert.equal(app.store.get('veilpoint.story.ch01'),before);
 app.emit('keydown',{code:'Escape',target:app.element('choiceEvac')});
 assert.equal(app.element('choices').classList.contains('hidden'),true);
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).choice,null);
});

test('CH01 PC journal retains keyboard focus and 60Hz pause through browser bfcache',()=>{
 const key='veilpoint.story.ch01',store=new Map([['veilpoint.brCheckpoint.v1','BR-unchanged']]);
 const app=boot(store,false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,120);
 app.emit('keydown',{code:'KeyJ'});
 const journal=app.element('fieldJournal'),close=app.element('fieldJournalClose');
 assert.equal(journal.classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,close);
 const generation=store.get(key),elapsed=JSON.parse(generation).elapsed;
 app.emit('pagehide');
 assert.equal(journal.classList.contains('hidden'),false,
   'background navigation must not replace visible journal with resume menu');
 app.emit('pageshow',{persisted:true});
 assert.equal(app.context.document.activeElement,close);
 app.frame(150000);
 assert.equal(store.get(key),generation,'journal bfcache return cannot write another checkpoint');
 assert.equal(JSON.parse(store.get(key)).elapsed,elapsed);
 assert.equal(store.get('veilpoint.brCheckpoint.v1'),'BR-unchanged');
 app.emit('keydown',{code:'Escape',target:close});
 assert.equal(journal.classList.contains('hidden'),true);
 assert.equal(app.element('menu').classList.contains('hidden'),false);
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
});

test('CH01 GPU loss while journal is visible restores accessible factual records on retry',()=>{
 const app=boot(new Map(),false,'granted',true,true);
 app.element('continue').click();app.moveForward(0,120);
 app.element('pauseButton').click();
 app.element('fieldJournalOpen').click();
 const journal=app.element('fieldJournal'),close=app.element('fieldJournalClose');
 assert.equal(journal.classList.contains('hidden'),false);
 const before=app.store.get('veilpoint.story.ch01');
 app.element('scene').dispatch('webglcontextlost');
 assert.equal(journal.classList.contains('hidden'),true);
 assert.equal(app.element('continue').disabled,true);
 app.context.VeilpointRenderer.failNext=true;
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(journal.classList.contains('hidden'),true);
 assert.equal(app.element('continue').disabled,true);
 app.element('scene').dispatch('webglcontextrestored');
 assert.equal(app.element('continue').disabled,false);
 assert.equal(journal.classList.contains('hidden'),false,
   'a successful delayed WebGL recovery returns to the same journal');
 assert.equal(app.context.document.activeElement,close);
 assert.equal(app.store.get('veilpoint.story.ch01'),before);
 app.frame(150000);
 assert.equal(app.store.get('veilpoint.story.ch01'),before);
 app.emit('keydown',{code:'Escape',target:close});
 assert.equal(journal.classList.contains('hidden'),true);
});

test('CH01 offline PC menu exports the verified live mission without touching either stored generation',()=>{
 const Story=require('../src/story-slice.js');
 const app=boot();
 app.element('continue').click();
 app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 const primary=app.store.get('veilpoint.story.ch01');
 const previous=app.store.get('veilpoint.story.ch01.previous');
 assert.equal(app.element('checkpointExport').classList.contains('hidden'),false);
 app.element('checkpointExport').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),false);
 assert.equal(app.element('checkpointTransferText').readOnly,true);
 assert.equal(app.element('checkpointApply').classList.contains('hidden'),true);
 const raw=app.element('checkpointTransferText').value;
 assert.ok(raw.length>100);
 const restored=Story.restore(raw);
 assert.equal(restored.phase,'terminal');
 assert.equal(Story.serialize(restored),raw);
 assert.equal(app.store.get('veilpoint.story.ch01'),primary);
 assert.equal(app.store.get('veilpoint.story.ch01.previous'),previous);
});

test('CH01 validated portable import occupies an empty PC save slot and resumes its exact 60Hz pose',()=>{
 const Story=require('../src/story-slice.js');
 const transferred=Story.createState();
 for(let i=0;i<90;i++)Story.step(transferred,1/60,{forward:true});
 const raw=Story.serialize(transferred);
 const app=boot();
 app.element('checkpointImport').click();
 assert.equal(app.element('checkpointTransferText').readOnly,false);
 app.element('checkpointTransferText').value=raw;
 app.element('checkpointApply').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),true);
 assert.equal(app.store.get('veilpoint.story.ch01'),raw);
 assert.match(app.element('menuText').textContent,/가져오기 및 저장 확인/);
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 app.frame(1000/60);
 assert.equal(app.context.VeilpointInput.forward,false);
 const current=app.store.get('veilpoint.story.ch01');
 assert.equal(JSON.parse(current).player.z,JSON.parse(raw).player.z);
 assert.equal(JSON.parse(current).phase,'terminal');
});

test('CH01 imported data cannot overwrite a primary or backup owned by an existing PC browser session',()=>{
 const Story=require('../src/story-slice.js');
 const old=Story.serialize(Story.createState());
 const store=new Map([['veilpoint.story.ch01',old],
   ['veilpoint.story.ch01.previous',old]]);
 const imported=Story.createState();
 Story.step(imported,1/60,{forward:true});
 const raw=Story.serialize(imported);
 assert.notEqual(raw,old);
 const app=boot(store);
 app.element('checkpointImport').click();
 app.element('checkpointTransferText').value=raw;
 app.element('checkpointApply').click();
 assert.match(app.element('menuText').textContent,/이 탭에서만 진행/);
 assert.match(app.element('saveStatus').textContent,/임시 가져오기/);
 assert.equal(app.element('checkpointExport').classList.contains('hidden'),false);
 app.element('checkpointExport').click();
 assert.equal(app.element('checkpointTransferText').value,raw);
 app.element('continue').click();
 app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 assert.equal(store.get('veilpoint.story.ch01'),old);
 assert.equal(store.get('veilpoint.story.ch01.previous'),old);
});

test('CH01 malformed or completed import cannot modify the current live world or protected disk checkpoint',()=>{
 const Story=require('../src/story-slice.js');
 const old=Story.serialize(Story.createState());
 const store=new Map([['veilpoint.story.ch01',old]]);
 const app=boot(store);
 app.element('checkpointImport').click();
 for(const payload of ['{}','x'.repeat(8300)]){
  app.element('checkpointTransferText').value=payload;
  app.element('checkpointApply').click();
  assert.match(app.element('checkpointTransferStatus').textContent,/가져오기 실패/);
  assert.equal(store.get('veilpoint.story.ch01'),old);
 }
 app.element('continue').click();
 assert.equal(app.element('menu').classList.contains('hidden'),true,
  'invalid imports do not start or replace the previous real mission');
 assert.match(app.element('objective').textContent,/중계기/);
});

test('CH01 portable import remains a read-only temporary world when browser storage permission is denied',()=>{
 const Story=require('../src/story-slice.js');
 const app=boot(new Map(),false,'granted',true,true,true);
 const raw=Story.serialize(Story.createState());
 app.element('checkpointImport').click();
 app.element('checkpointTransferText').value=raw;
 app.element('checkpointApply').click();
 assert.match(app.element('menuText').textContent,/이 탭에서만 진행/);
 assert.match(app.element('saveStatus').textContent,/임시 가져오기/);
 app.element('continue').click();
 app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.element('checkpointExport').classList.contains('hidden'),false);
 app.element('checkpointExport').click();
 const saved=JSON.parse(app.element('checkpointTransferText').value);
 assert.equal(saved.phase,'terminal');
 assert.equal(saved.player.x,JSON.parse(raw).player.x);
 assert.equal(saved.player.z,JSON.parse(raw).player.z);
 assert.ok(saved.elapsed>=JSON.parse(raw).elapsed,
  'one legitimate 60Hz frame must be present in the exported live state');
});


test('CH01 Windows menu downloads the exact validated live JSON without rotating disk generations',()=>{
 const app=boot();
 app.element('continue').click();app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 const before=app.store.get('veilpoint.story.ch01');
 const backup=app.store.get('veilpoint.story.ch01.previous');
 app.element('checkpointExport').click();
 const expected=app.element('checkpointTransferText').value;
 let emitted=null,blob=null,revoked=null;
 app.context.Blob=class {
  constructor(parts,options){this.parts=parts;this.type=options.type;blob=this;}
 };
 app.context.URL={
  createObjectURL(value){assert.equal(value,blob);return 'blob:veilpoint-ch01-demo';},
  revokeObjectURL(url){revoked=url;}
 };
 app.context.document.createElement=()=>({
  click(){emitted={href:this.href,filename:this.download};}
 });
 app.element('checkpointDownload').click();
 assert.deepEqual(emitted,{href:'blob:veilpoint-ch01-demo',filename:'VEILPOINT-CH01-checkpoint.json'});
 assert.equal(blob.parts.join(''),expected);
 assert.match(blob.type,/application\/json/);
 assert.equal(revoked,'blob:veilpoint-ch01-demo');
 assert.match(app.element('checkpointTransferStatus').textContent,/저장 요청 완료/);
 assert.equal(app.store.get('veilpoint.story.ch01'),before);
 assert.equal(app.store.get('veilpoint.story.ch01.previous'),backup);
});

test('CH01 PC file picker stages validated file text without changing game until Apply',async()=>{
 const Story=require('../src/story-slice.js');
 const imported=Story.createState();
 for(let n=0;n<50;n++)Story.step(imported,1/60,{forward:true});
 const raw=Story.serialize(imported);
 const app=boot();
 const old=Story.serialize(Story.createState());
 app.element('checkpointImport').click();
 app.element('checkpointFile').dispatch('change',{target:{
  files:[{size:Buffer.byteLength(raw),text:()=>Promise.resolve(raw)}]
 }});
 // Flush the file.text() promise from the separate browser VM realm.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.element('checkpointTransferText').value,raw,
  app.element('checkpointTransferStatus').textContent);
 assert.match(app.element('checkpointTransferStatus').textContent,/파일 읽기 완료/);
 assert.equal(app.store.has('veilpoint.story.ch01'),false,'read is not an automatic import');
 app.element('checkpointApply').click();
 assert.equal(app.store.get('veilpoint.story.ch01'),raw);
 assert.notEqual(raw,old);
 app.element('continue').click();
 app.frame(1000/60);
 assert.equal(app.element('menu').classList.contains('hidden'),true);
 assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.z,JSON.parse(raw).player.z);
});

test('CH01 late offline file reads cannot repopulate a closed or replaced menu',async()=>{
 const Story=require('../src/story-slice.js');
 const raw=Story.serialize(Story.createState());
 const app=boot();
 let complete=null;
 app.element('checkpointImport').click();
 app.element('checkpointFile').dispatch('change',{target:{files:[
  {size:Buffer.byteLength(raw),text:()=>new Promise(resolve=>{complete=resolve;})}
 ]}});
 assert.equal(typeof complete,'function');
 app.element('checkpointImport').click();
 assert.equal(app.element('checkpointTransferText').value,'');
 complete(raw);
 await Promise.resolve();await Promise.resolve();
 assert.equal(app.element('checkpointTransferText').value,'',
  'stale file read must not replace the newly selected import text');
 assert.equal(app.store.has('veilpoint.story.ch01'),false);
});

test('CH01 file picker rejects oversized files and never applies their payload',async()=>{
 const app=boot();
 app.element('checkpointImport').click();
 let called=false;
 app.element('checkpointFile').dispatch('change',{target:{files:[{
  size:20000,text:()=>{called=true;return Promise.resolve('{}');}
 }]}});
 await Promise.resolve();
 assert.equal(called,false,'size is rejected before reading untrusted file bytes');
 assert.match(app.element('checkpointTransferStatus').textContent,/파일 읽기 실패/);
 assert.equal(app.element('checkpointTransferText').value,'');
 assert.equal(app.store.has('veilpoint.story.ch01'),false);
});

test('CH01 export falls back to manual JSON selection when file downloads are blocked',()=>{
 const app=boot();
 app.element('continue').click();app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 app.element('checkpointExport').click();
 const raw=app.element('checkpointTransferText').value;
 const primary=app.store.get('veilpoint.story.ch01');
 app.element('checkpointDownload').click();
 assert.match(app.element('checkpointTransferStatus').textContent,/전체 선택/);
 assert.equal(app.element('checkpointTransferText').value,raw);
 assert.equal(app.store.get('veilpoint.story.ch01'),primary);
});


test('CH01 active mission needs exact two-click confirmation before replacing its current world',()=>{
 const Story=require('../src/story-slice.js'),app=boot();
 app.element('continue').click();app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 const currentDisk=app.store.get('veilpoint.story.ch01');
 const priorBackup=app.store.get('veilpoint.story.ch01.previous');
 const alternate=Story.createState();
 for(let i=0;i<40;i++)Story.step(alternate,1/60,{forward:true});
 const raw=Story.serialize(alternate);
 assert.notEqual(raw,currentDisk);
 app.element('checkpointImport').click();
 app.element('checkpointTransferText').value=raw;
 app.element('checkpointApply').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),false);
 assert.match(app.element('checkpointTransferStatus').textContent,/다시 눌러 확정/);
 assert.equal(app.store.get('veilpoint.story.ch01'),currentDisk);
 assert.equal(app.store.get('veilpoint.story.ch01.previous'),priorBackup);
 app.element('checkpointApply').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),true);
 assert.match(app.element('menuText').textContent,/이 탭에서만 진행/);
 assert.equal(app.store.get('veilpoint.story.ch01'),currentDisk);
 assert.equal(app.store.get('veilpoint.story.ch01.previous'),priorBackup);
 app.element('checkpointExport').click();
 assert.equal(app.element('checkpointTransferText').value,raw);
});

test('CH01 a changed snapshot cannot borrow an earlier confirmation to replace a live mission',()=>{
 const Story=require('../src/story-slice.js'),app=boot();
 app.element('continue').click();app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 const disk=app.store.get('veilpoint.story.ch01');
 const a=Story.createState(),b=Story.createState();
 for(let n=0;n<20;n++)Story.step(a,1/60,{forward:true});
 for(let n=0;n<70;n++)Story.step(b,1/60,{forward:true});
 const first=Story.serialize(a),second=Story.serialize(b);
 app.element('checkpointImport').click();
 const field=app.element('checkpointTransferText');
 field.value=first;app.element('checkpointApply').click();
 assert.match(app.element('checkpointTransferStatus').textContent,/다시 눌러 확정/);
 field.value=second;
 field.dispatch('input');
 app.element('checkpointApply').click();
 assert.match(app.element('checkpointTransferStatus').textContent,/다시 눌러 확정/);
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),false);
 assert.equal(app.store.get('veilpoint.story.ch01'),disk);
 app.element('checkpointApply').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),true);
 assert.equal(app.store.get('veilpoint.story.ch01'),disk);
 app.element('checkpointExport').click();
 assert.equal(app.element('checkpointTransferText').value,second);
});

test('CH01 a pending file read never overwrites the JSON a user typed meanwhile',async()=>{
 const Story=require('../src/story-slice.js'),app=boot();
 let finish;
 app.element('checkpointImport').click();
 const field=app.element('checkpointTransferText');
 app.element('checkpointFile').dispatch('change',{target:{files:[{
  size:800,text:()=>new Promise(resolve=>{finish=resolve;})
 }]}});
 assert.equal(typeof finish,'function');
 const manual=Story.serialize(Story.createState());
 field.value=manual;
 field.dispatch('input');
 finish('{"version":2,"corrupt":true}');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(field.value,manual,'user paste wins over an older asynchronous file selection');
 assert.equal(app.store.has('veilpoint.story.ch01'),false);
 app.element('checkpointApply').click();
 assert.equal(app.store.get('veilpoint.story.ch01'),manual);
});

test('CH01 invalid snapshot cancels an earlier live-replacement confirmation',()=>{
 const Story=require('../src/story-slice.js'),app=boot();
 app.element('continue').click();app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 const disk=app.store.get('veilpoint.story.ch01');
 const changed=Story.createState();
 for(let n=0;n<35;n++)Story.step(changed,1/60,{forward:true});
 const raw=Story.serialize(changed);
 app.element('checkpointImport').click();
 const field=app.element('checkpointTransferText');
 field.value=raw;app.element('checkpointApply').click();
 field.value='{broken';
 app.element('checkpointApply').click();
 assert.match(app.element('checkpointTransferStatus').textContent,/가져오기 실패/);
 field.value=raw;app.element('checkpointApply').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),false,
  'a malformed intervening request must not count as the second confirmation');
 assert.match(app.element('checkpointTransferStatus').textContent,/다시 눌러 확정/);
 assert.equal(app.store.get('veilpoint.story.ch01'),disk);
});

test('CH01 initial import to an empty save slot remains a single explicit Apply action',()=>{
 const Story=require('../src/story-slice.js');
 const app=boot(),raw=Story.serialize(Story.createState());
 app.element('checkpointImport').click();
 app.element('checkpointTransferText').value=raw;
 app.element('checkpointApply').click();
 assert.equal(app.element('checkpointTransferPanel').classList.contains('hidden'),true);
 assert.equal(app.store.get('veilpoint.story.ch01'),raw);
});

test('real CH01 fixed-step missed shots sound once; pause and checkpoint reload never replay prior volleys',()=>{
 const Story=require('../src/story-slice.js'),state=Story.createState(),played=[];
 class Context{
  constructor(){this.currentTime=1;this.destination={};this.state='running'}
  createOscillator(){let frequency;return {frequency:{setValueAtTime(v){frequency=v}},
   connect(){},disconnect(){},start(){played.push(frequency)},stop(){}}}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
   exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
 }
 state.world.player.x=Story.POINTS.terminal.x;state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).ok,true);
 for(const index of [0,2]){state.world.bots[index].health=0;state.world.bots[index].alive=false}
 state.world.player.x=15;state.world.player.z=-18;state.combat.nextPulseAt=0;
 const store=new Map([['veilpoint.story.ch01',Story.serialize(state)]]);
 const app=boot(store,false,'granted',true,false,false,0,Context);
 app.element('continue').click();assert.equal(played.length,0);
 assert.doesNotMatch(app.element('combatStatus').textContent,/대치자\s+\d|\/3/,
  'HUD must not expose the remaining global enemy count');
 assert.doesNotMatch(app.element('objective').textContent,/대치자 3명/);
 app.context.VeilpointInput.right=true;app.frame(1000/60);
 const saved=JSON.parse(store.get('veilpoint.story.ch01'));
 assert.equal(saved.player.health,100,'actual incoming round misses without any injury cue');
 assert.equal(saved.combat.drones[1].shots,1);
 assert.deepEqual(played,[160],'one new finite round has one audible cue');
 app.frame(2000/60);app.frame(3000/60);assert.equal(played.length,1);
 app.emit('keydown',{code:'Escape'});app.frame(1000);assert.equal(played.length,1);
 const resumed=boot(store,false,'granted',true,false,false,0,Context);
 resumed.element('continue').click();resumed.frame(1000/60);
 assert.equal(played.length,1,'restored finite shot history is not a new sound event');
});
