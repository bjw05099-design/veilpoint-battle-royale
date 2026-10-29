'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(sharedStore=new Map(),touch=false,pointerLock='granted',finePointer=!touch){
  const listeners=new Map(),nodes=new Map();
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
      classList:makeClassList(id==='choices'||id==='interaction'),
      addEventListener:(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);},
      dispatch:(name,event={})=>{for(const fn of events.get(name)||[])fn({preventDefault(){},pointerId:1,...event});},
      click(){this.dispatch('click');},
      getContext:()=>ctx2d,
      setPointerCapture(){},
      requestPointerLock(){
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
    pointerLockElement:null,
    getElementById:element,
    querySelectorAll:()=>mobileButtons,
    addEventListener:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
    exitPointerLock(){this.pointerLockElement=null;}
  };
  const store={
    getItem:k=>sharedStore.has(k)?sharedStore.get(k):null,
    setItem:(k,v)=>sharedStore.set(k,String(v)),
    removeItem:k=>sharedStore.delete(k)
  };
  let now=0,frameCallback=null;
  const context={
    document,localStorage:store,
    performance:{now:()=>now},
    matchMedia:query=>({matches:query==='(any-pointer:fine)'?finePointer:touch}),
    requestAnimationFrame:fn=>{frameCallback=fn;},
    addEventListener:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
    console,
    VeilpointRenderer:class{constructor(canvas){this.canvas=canvas;}setGraphicsQuality(){}draw(){}}
  };
  context.globalThis=context;
  const scripts=['src/simulation.js','src/visibility.js','src/performance.js',
    'src/graphics.js','src/clock.js','src/fps.js','src/campaign.js',
    'src/story-slice.js','src/story-audio.js','src/desktop-controls.js','src/story-app.js'];
  for(const script of scripts){
    const source=fs.readFileSync(path.join(__dirname,'..',script),'utf8');
    vm.runInNewContext(source,context,{filename:script,timeout:1500});
  }
  return {
    element,store:sharedStore,context,
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
      let frame=startFrame,yaw=0;
      const aim=next=>{this.emit('mousemove',{movementX:(next-yaw)/.0023,movementY:0});yaw=next;};
      for(const next of [0,Math.atan2(15,15.5),Math.atan2(-15,15.5)]){
        aim(next);
        for(let shot=0;shot<2;shot++){
          this.emit('keydown',{code:'Space'});
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
  app.frame(1000/60);
  const saved=JSON.parse(shared.get('veilpoint.story.ch01'));
  assert.equal(saved.phase,'engagement');
  assert.equal(saved.player.health,100,'the deterministic hostile round misses');
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
  app.element('pauseButton').click();
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,before);
  app.element('continue').click();
  app.emit('keydown',{code:'Space'});
  app.element('pauseButton').click();
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01')).player.charges,before-1,
    'unfocused gameplay key must still fire exactly one finite shot');
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
