'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(sharedStore=new Map(),touch=false){
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
      requestPointerLock(){document.pointerLockElement=this;return Promise.resolve();}
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
    matchMedia:()=>({matches:touch}),
    requestAnimationFrame:fn=>{frameCallback=fn;},
    addEventListener:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
    console,
    VeilpointRenderer:class{constructor(canvas){this.canvas=canvas;}setGraphicsQuality(){}draw(){}}
  };
  context.globalThis=context;
  const scripts=['src/simulation.js','src/visibility.js','src/performance.js',
    'src/graphics.js','src/clock.js','src/fps.js','src/campaign.js',
    'src/story-slice.js','src/story-app.js'];
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
