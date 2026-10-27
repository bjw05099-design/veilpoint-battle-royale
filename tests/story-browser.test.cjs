'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(sharedStore=new Map()){
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
    matchMedia:()=>({matches:false}),
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
    clearDrones(startFrame){
      // Real UI input path: pointer-locked mouse aim + SPACE, paced by the 60Hz clock.
      let frame=startFrame,yaw=0;
      const aim=next=>{this.emit('mousemove',{movementX:(next-yaw)/.0023,movementY:0});yaw=next;};
      for(const next of [0,Math.atan2(15,15.5),Math.atan2(-15,15.5)]){
        aim(next);
        for(let shot=0;shot<2;shot++){
          this.emit('keydown',{code:'Space'});
          frame+=15;this.frame(frame*1000/60);
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
  assert.match(app.element('objective').textContent,/교란 드론/);
  assert.ok(app.store.has('veilpoint.story.ch01'));
  const frame=app.clearDrones(300);
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
  assert.equal(JSON.parse(app.store.get('veilpoint.story.ch01PreviewCompleted')).choice,'evacuation');
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
  assert.match(reloaded.element('objective').textContent,/교란 드론/);
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
  const frame=app.clearDrones(300);
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
