'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(sharedStore=new Map(),touch=false,pointerLock='granted',finePointer=!touch,windows=false,storageBlocked=false,checkpointReadFailures=0){
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
      classList:makeClassList(['choices','interaction','reviewCompleted','debriefReview'].includes(id)),
      addEventListener:(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);},
      dispatch:(name,event={})=>{for(const fn of events.get(name)||[])fn({preventDefault(){},pointerId:1,...event});},
      click(){this.dispatch('click');},
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
  const context={
    document,localStorage:store,
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
    'src/graphics.js','src/clock.js','src/fps.js','src/campaign.js',
    'src/story-slice.js','src/story-audio.js','src/desktop-controls.js','src/story-app.js'];
  for(const script of scripts){
    const source=fs.readFileSync(path.join(__dirname,'..',script),'utf8');
    vm.runInNewContext(source,context,{filename:script,timeout:1500});
  }
  return {
    element,store:sharedStore,context,
    grantPointerLock(){assert.equal(typeof grantPointerLock,'function');grantPointerLock();},
    emit(name,event){for(const fn of listeners.get(name)||[])fn({preventDefault(){},...event});},
    frame(ms){now=ms;const callback=frameCallback;assert.equal(typeof callback,'function');callback(ms);},
    moveForward(startFrame,count){
      context.VeilpointInput.forward=true;
      for(let i=1;i<=count;i++)this.frame((startFrame+i)*1000/60);
      context.VeilpointInput.forward=false;
    },
    interact(){this.emit('keydown',{code:'KeyE'});},
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
  assert.equal(app.element('choiceVerified').disabled,true);
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
  assert.match(app.element('combatStatus').textContent,/상자 잔량 12발.*접근 후 E/);
  assert.match(app.element('interaction').textContent,/잔량 12발.*필요한 만큼 확보/);
  app.interact();
  let saved=JSON.parse(store.get('veilpoint.story.ch01'));
  assert.equal(saved.combat.supplyRemaining,11);
  assert.equal(saved.combat.supplyUsed,false);
  assert.match(app.element('combatStatus').textContent,/휴대 한도 도달.*11발/);
  assert.match(app.element('interaction').textContent,/잔량 11발.*휴대 한도 도달/);
  assert.doesNotMatch(app.element('interaction').textContent,/\[E\]/);
  const resumed=boot(store);
  resumed.element('continue').click();
  assert.match(resumed.element('combatStatus').textContent,/휴대 한도 도달.*11발/);
  const rules=Story.restore(store.get('veilpoint.story.ch01'));
  rules.world.player.charges-=11;
  store.set('veilpoint.story.ch01',Story.serialize(rules));
  const final=boot(store);final.element('continue').click();
  assert.match(final.element('interaction').textContent,/잔량 11발.*\[E\]/);
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


test('PC F toggles CH01 finite headlamp and saves through the live browser controller',()=>{
 const shared=new Map(),app=boot(shared,false,'granted',true,true);
 app.element('continue').click();
 assert.match(app.element('flashlightStatus').textContent,/소등/);
 app.emit('keydown',{code:'KeyF'});
 assert.match(app.element('flashlightStatus').textContent,/점등/);
 assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).flashlightOn,true);
 app.frame(1000/60);
 assert.equal(JSON.parse(shared.get('veilpoint.story.ch01')).flashlightOn,true);
 app.emit('keydown',{code:'KeyF',repeat:true});
 assert.match(app.element('flashlightStatus').textContent,/점등/);
 app.emit('keydown',{code:'KeyF'});
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
  assert.match(source,/let checkpointReadUnavailable=false,memoryOnlyStory=false/);
  assert.match(source,/catch\(_\)\{checkpointReadUnavailable=true;return null;\}/);
  assert.match(source,/if\(memoryOnlyStory\)\{[\s\S]*?checkpoint=raw;/);
  assert.match(source,/if\(report&&!memoryOnlyStory\)storage\.set\(PREVIEW_KEY/);
  assert.match(source,/checkpoint=memoryOnlyStory\?null:storage\.get\(SAVE_KEY\)/);
  assert.match(source,/if\(!memoryOnlyStory&&loaded&&loaded\.phase==='complete'\)/);
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

test('CH01 PC focused decision buttons accept Digit1 and reject locked Digit2 without a softlock',()=>{
  const app=boot(new Map(),false,'granted',true,true);
  enterPCStoryDecision(app);
  const choice=app.element('choiceEvac');
  assert.equal(app.context.document.activeElement,choice,
    'the decision screen must move keyboard focus from the hidden world to a visible action');
  app.emit('keydown',{code:'Digit2',target:choice});
  assert.equal(app.element('choices').classList.contains('hidden'),false,
    'the unearned alternate route cannot be selected with a shortcut');
  assert.match(app.element('choiceHint').textContent,/경로를 변경할 수 없습니다/);
  app.emit('keydown',{code:'Digit1',repeat:true,target:choice});
  assert.equal(app.element('choices').classList.contains('hidden'),false,
    'OS repeat cannot silently select a narrative branch');
  app.emit('keydown',{code:'Digit1',target:choice});
  assert.equal(app.element('choices').classList.contains('hidden'),true);
  assert.match(app.element('objective').textContent,/안뜰/);
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).choice,'evacuation');
  assert.equal(app.context.document.activeElement,app.element('scene'),
    'physical gameplay resumes with keyboard focus on the scene');
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
