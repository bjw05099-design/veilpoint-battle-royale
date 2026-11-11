'use strict';
// Actual BR browser controller exercised in a deterministic Node DOM/WebGL stub.
// This does not replace real desktop/mobile browser or GPU acceptance testing.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

function boot({touch = false, finePointer = !touch, store = new Map(), pointerLock = 'granted', windows = false, storageBlocked = false, checkpointReadFailures = 0} = {}) {
  const nodes = new Map(), listeners = new Map();
  let now = 0, frameCallback = null, latestGame = null, grantPointerLock = null;
  const scheduledCallbacks = [];
  const ctx = {};
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill']) ctx[name] = () => {};
  const add = (map, key, callback) => map.set(key, [...(map.get(key) || []), callback]);
  const emit = (map, key, event = {}) => {
    for (const callback of map.get(key) || []) callback({preventDefault() {}, pointerId: 1, ...event});
  };
  const classList = () => {
    const values = new Set();
    return {
      add: x => values.add(x), remove: x => values.delete(x),
      contains: x => values.has(x),
      toggle(x, force) {
        if (force === true || (force === undefined && !values.has(x))) values.add(x);
        else values.delete(x);
      }
    };
  };
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const events = new Map();
    const value = {
      id, value: '', checked: false, disabled: false, style: {}, title: '',
      textContent: '', innerHTML: '', width: 240, height: 240,
      classList: classList(), attributes: {},
      setAttribute(key,value) {this.attributes[key]=String(value);},
      getAttribute(key) {return this.attributes[key]??null;},
      getContext: () => ctx,
      getBoundingClientRect: () => ({x: 0, y: 0, width: 88, height: 88}),
      setPointerCapture() {},
      focus() {document.activeElement = this;},
      blur() {if(document.activeElement===this)document.activeElement=null;},
      addEventListener: (key, callback) => add(events, key, callback),
      dispatch: (key, event) => emit(events, key, event),
      click() {this.dispatch('click');},
      requestPointerLock(options) {
        this.lastPointerLockOptions = options;
        this.ownerDocument = document;
        if (pointerLock === 'late') return new Promise(resolve => {
          grantPointerLock = () => {document.pointerLockElement = this;resolve();};
        });
        if (pointerLock === 'throw') throw new Error('pointer lock denied');
        if (pointerLock === 'denied') return Promise.reject(new Error('pointer lock denied'));
        if (pointerLock === 'pending') return new Promise(() => {});
        document.pointerLockElement = this;
      }
    };
    nodes.set(id, value);
    return value;
  }
  const selectors = new Map();
  const document = {
    activeElement: null,
    pointerLockElement: null,
    getElementById: node,
    querySelector: selector => {
      if (!selectors.has(selector)) selectors.set(selector, node('selector-' + selector));
      return selectors.get(selector);
    },
    addEventListener: (key, callback) => add(listeners, key, callback),
    exitPointerLock() {this.pointerLockElement = null;}
  };
  let remainingCheckpointReadFailures=checkpointReadFailures;
  const context = {
    document,
    localStorage: {
      getItem: key => {
        if(key==='veilpoint.brCheckpoint.v1'&&remainingCheckpointReadFailures-->0)
          throw new Error('temporary_checkpoint_read_denial');
        return store.get(key) ?? null;
      },
      setItem: (key, value) => store.set(key, String(value))
    },
    performance: {now: () => now},
    matchMedia: query => ({matches: query === '(any-pointer:fine)' ? finePointer : touch}),
    navigator: windows ? {platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'} : undefined,
    requestAnimationFrame: callback => {frameCallback = callback;},
    setTimeout: callback => {scheduledCallbacks.push(callback);return scheduledCallbacks.length;},
    addEventListener: (key, callback) => add(listeners, key, callback),
    console,
    VeilpointRenderer: class {
      constructor(canvas) {if(this.constructor.failNext){this.constructor.failNext=false;throw new Error('GPU restore unavailable');}this.canvas = canvas;this.gpuTimer = {supported: false};}
      setGraphicsQuality() {}
      draw(game) {latestGame = game;}
      setAdaptiveResolution() {}
    }
  };
  context.globalThis = context;
  if (storageBlocked) Object.defineProperty(context, 'localStorage', {
    get() {throw new Error('storage_denied');}
  });
  for (const filename of ['src/simulation.js', 'src/visibility.js', 'src/performance.js',
    'src/graphics.js', 'src/clock.js', 'src/fps.js', 'src/benchmark.js', 'src/desktop-controls.js', 'src/gate-motor-audio.js', 'src/app.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'),
      context, {filename, timeout: 1500});
  }
  return {
    node, store, context, selectors, scheduledCallbacks,
    grantPointerLock() {assert.equal(typeof grantPointerLock, 'function');grantPointerLock();},
    emit: (key, event) => emit(listeners, key, event),
    frame(ms) {
      now = ms;
      const callback = frameCallback;
      assert.equal(typeof callback, 'function');
      callback(ms);
    },
    get game() {return latestGame;}
  };
}

test('offline BR browser UI starts, loses, returns to menu and restarts with fresh finite resources', () => {
  const app = boot();
  app.node('play').click();
  assert.equal(app.node('overlay').classList.contains('hidden'), true);
  app.frame(1000 / 60);
  const first = app.game;
  assert.equal(first.status, 'playing');
  assert.equal(first.player.charges, 48);
  app.context.VeilpointSim.receiveDamage(first, 100);
  app.frame(2000 / 60);
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.equal(app.node('play').textContent, '다시 시작');
  app.node('play').click();
  app.frame(3000 / 60);
  assert.notEqual(app.game, first);
  assert.equal(app.game.status, 'playing');
  assert.equal(app.game.player.charges, 48);
  assert.equal(app.node('overlay').classList.contains('hidden'), true);
});

test('restored BR checkpoint reclaims PC keyboard focus from the resume button',()=>{
 const store=new Map(),first=boot({store});
 first.node('play').click();first.frame(1000/60);first.emit('blur');
 assert.ok(store.get('veilpoint.brCheckpoint.v1'),'active match has a checkpoint');
 const resumed=boot({store});
 const button=resumed.node('play');
 resumed.context.document.activeElement=button;
 button.click();
 assert.equal(resumed.context.document.activeElement,resumed.node('scene'),
   'resume must move focus from the button to the actual first-person canvas');
 resumed.frame(1000/60);
 const ammo=resumed.game.player.charges;
 resumed.emit('keydown',{code:'Space',target:resumed.context.document.activeElement});
 assert.equal(resumed.game.player.charges,ammo-1,
   'first PC fire key after restoring a match must reach the simulation');
 resumed.emit('keyup',{code:'Space',target:resumed.node('scene')});
});

test('offline BR browser UI announces victory only after simulation resolves the last rival', () => {
  const app = boot();
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game;
  game.bots.forEach(bot => {bot.alive = false;});
  app.frame(2000 / 60);
  assert.equal(game.status, 'won');
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.match(app.selectors.get('.eyebrow').textContent, /CHAMPION/);
});

test('keyboard fire/reload and touch fire consume finite BR ammo without adding rounds', () => {
  const desktop = boot();
  desktop.node('play').click();
  desktop.frame(1000 / 60);
  const game = desktop.game;
  desktop.emit('keydown', {code: 'Space'});
  assert.equal(game.player.charges, 47);
  assert.equal(game.player.loaded, 11);
  desktop.emit('keyup', {code: 'Space'}); // A released PC trigger must not resume firing after reload.
  desktop.emit('keydown', {code: 'KeyR'});
  assert.ok(game.player.reloadRemaining > 0);
  assert.equal(game.player.charges, 47);
  for (let frame = 2; frame <= 120; frame++) desktop.frame(frame * 1000 / 60);
  assert.equal(game.player.reloadRemaining, 0);
  assert.equal(game.player.loaded, 12);
  assert.equal(game.player.charges, 47);
  const mobile = boot({touch: true});
  mobile.node('play').click();
  mobile.frame(1000 / 60);
  mobile.node('tagButton').dispatch('pointerdown');
  assert.equal(mobile.game.player.charges, 47);
  assert.equal(mobile.game.player.loaded, 11);
});

test('graphics presets persist across BR UI restarts without changing the 60Hz simulation', () => {
  const store = new Map();
  const app = boot({store});
  app.node('graphicsPreset').value = 'balanced';
  app.node('graphicsPreset').dispatch('change');
  const settings = JSON.parse(store.get('veilpoint.graphics'));
  assert.equal(settings.fpsCap, 120);
  const next = boot({store});
  assert.equal(next.node('graphicsPreset').value, 'balanced');
  next.node('play').click();
  next.frame(1000 / 60);
  assert.equal(next.game.status, 'playing');
});

test('BR Custom graphics selector preserves current settings and survives a restart',()=>{
 const store=new Map(),app=boot({store});
 app.node('graphicsPreset').value='balanced';
 app.node('graphicsPreset').dispatch('change');
 const balanced=JSON.parse(store.get('veilpoint.graphics'));
 app.node('graphicsPreset').value='custom';
 app.node('graphicsPreset').dispatch('change');
 const custom=JSON.parse(store.get('veilpoint.graphics'));
 assert.equal(custom.preset,'custom','selecting Custom must change persisted mode');
 for(const key of ['fpsCap','resolutionScale','vegetationDensity','effects'])
  assert.equal(custom[key],balanced[key],key+' must remain unchanged until explicitly edited');
 assert.equal(app.node('graphicsPreset').value,'custom');
 const reloaded=boot({store});
 assert.equal(reloaded.node('graphicsPreset').value,'custom');
 assert.equal(reloaded.node('fpsLimit').value,String(balanced.fpsCap));
 reloaded.node('renderScale').value='0.7';
 reloaded.node('renderScale').dispatch('change');
 const edited=JSON.parse(store.get('veilpoint.graphics'));
 assert.equal(edited.preset,'custom');
 assert.equal(edited.resolutionScale,.7);
 assert.equal(edited.fpsCap,balanced.fpsCap);
});

test('BR loadout selection persists across restarts and changes gameplay class',()=>{
 const store=new Map(),app=boot({store});
 app.node('weaponClass').value='compact';
 app.node('weaponClass').dispatch('change');
 assert.equal(store.get('veilpoint.weaponClass'),'compact');
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.player.weaponId,'compact');
 assert.equal(app.game.player.loaded,18);
 assert.equal(app.node('weaponName').textContent,'COMPACT');
 app.context.VeilpointSim.receiveDamage(app.game,100);app.frame(2000/60);
 app.node('weaponClass').value='marksman';
 app.node('weaponClass').dispatch('change');
 app.node('play').click();app.frame(3000/60);
 assert.equal(app.game.player.weaponId,'marksman');
 assert.equal(app.game.player.loaded,8);
 const next=boot({store});
 assert.equal(next.node('weaponClass').value,'marksman');
 next.node('weaponClass').value='invalid';
 next.node('weaponClass').dispatch('change');
 assert.equal(next.node('weaponClass').value,'carbine');
});

test('BR proximity prompt distinguishes compatible ammo from incompatible supplies',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const g=app.game;
 g.loot.forEach(item=>{item.x=100;item.z=100;});
 const wrong=g.loot.find(item=>item.weaponId!=='carbine');
 wrong.x=0;wrong.z=0;
 app.frame(300);
 assert.match(app.node('pickupPrompt').textContent,/INCOMPATIBLE/);
 const ammo=g.player.charges;
 app.emit('keydown',{code:'KeyF'});
 assert.equal(g.player.charges,ammo);
 wrong.x=100;wrong.z=100;
 const right=g.loot.find(item=>item.weaponId==='carbine');
 right.x=0;right.z=0;
 app.frame(600);
 assert.match(app.node('pickupPrompt').textContent,/CARBINE/);
 app.emit('keydown',{code:'KeyF'});
 assert.ok(g.player.charges>=ammo);
 assert.equal(right.picked,true);
});

test('offline BR freezes hostile simulation while backgrounded and resumes at 60Hz without catch-up',()=>{
  const app=boot();app.node('play').click();
  app.frame(1000/60);app.frame(2000/60);
  const game=app.game,before=game.elapsed;
  app.emit('blur');
  assert.match(app.node('message').textContent,/일시중지/);
  for(let i=3;i<=240;i++)app.frame(i*1000/60);
  assert.equal(game.elapsed,before,'background frames must not simulate bots or zone damage');
  app.emit('focus');app.frame(241*1000/60);
  assert.equal(game.elapsed,before,'focus alone must not resume an uncontrolled match');
  assert.equal(app.node('overlay').classList.contains('hidden'),false);
  assert.equal(app.node('play').textContent,'이어하기');
  app.node('play').click();app.frame(242*1000/60);
  assert.equal(app.game,game,'resume must not reset the match or its ammunition');
  assert.equal(app.node('overlay').classList.contains('hidden'),true);
  assert.ok(game.elapsed>before&&game.elapsed-before<0.05);
  app.context.document.hidden=true;app.emit('visibilitychange');
  const hidden=game.elapsed;
  for(let i=243;i<=360;i++)app.frame(i*1000/60);
  assert.equal(game.elapsed,hidden);
  app.context.document.hidden=false;app.emit('visibilitychange');
  app.frame(361*1000/60);
  assert.equal(game.elapsed,hidden,'visibility alone must not resume hostile simulation');
  app.node('play').click();app.frame(362*1000/60);
  assert.ok(game.elapsed>hidden&&game.elapsed-hidden<0.05);
});

test('BR clears held touch stick on focus loss so explicit resume cannot drift',()=>{
  const app=boot({touch:true});
  app.node('play').click();app.frame(1000/60);
  const game=app.game;
  app.node('stick').dispatch('pointerdown',{pointerId:5,clientX:80,clientY:44});
  app.frame(2000/60);
  const position=game.player.x;
  app.emit('blur');
  app.node('play').click();
  for(let i=3;i<=30;i++)app.frame(i*1000/60);
  assert.equal(game.player.x,position,'orphaned joystick must not keep moving after resume');
  app.node('stick').dispatch('pointerdown',{pointerId:6,clientX:80,clientY:44});
  app.frame(31000/60);
  assert.ok(game.player.x>position,'fresh touch input remains functional');
});

test('BR proximity HUD does not invite a physically unreachable pickup',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const g=app.game;g.player.charges=12;
 g.loot.forEach(item=>{item.x=130;item.z=130;});
 const ammo=g.loot.find(item=>item.kind==='ammo'&&item.weaponId===g.player.weaponId);
 ammo.x=2.6;ammo.z=0;
 app.frame(300);
 assert.doesNotMatch(app.node('pickupPrompt').textContent,/CARBINE/);
 app.emit('keydown',{code:'KeyF'});
 assert.equal(g.player.charges,12);
 assert.equal(ammo.picked,false);
 ammo.x=1.4;
 app.frame(600);
 assert.match(app.node('pickupPrompt').textContent,/CARBINE/);
 app.emit('keydown',{code:'KeyF'});
 assert.equal(g.player.charges,24);
 assert.equal(ammo.picked,true);
});

test('BR HUD explains exhausted sprint lockout without masking active messages',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const p=app.game.player;p.stamina=10;p.sprintExhausted=true;
 app.game.messageTime=0;app.frame(300);
 assert.match(app.node('message').textContent,/EXHAUSTED.*25/);
 app.game.message='RECENT EVENT';app.game.messageTime=1;
 app.frame(600);assert.equal(app.node('message').textContent,'RECENT EVENT');
 p.sprintExhausted=false;app.game.messageTime=0;app.frame(900);
 assert.doesNotMatch(app.node('message').textContent,/EXHAUSTED/);
});

test('BR mixed loot pile gives keyboard and touch users the same compatible pickup and prompt',()=>{
 for(const touch of [false,true]){
  const app=boot({touch});
  app.node('weaponClass').value='precision';
  app.node('play').click();app.frame(1000/60);
  const g=app.game,p=g.player;
  p.charges=p.loaded;
  g.loot.forEach(item=>{item.x=120;item.z=120;});
  const wrong=g.loot.find(item=>item.weaponId==='carbine');
  const right=g.loot.find(item=>item.weaponId==='precision');
  wrong.x=p.x;wrong.z=p.z;
  right.x=p.x+0.5;right.z=p.z;
  app.frame(300);
  assert.match(app.node('pickupPrompt').textContent,/PRECISION/);
  const before=p.charges;
  if(touch)app.node('lootButton').dispatch('pointerdown');
  else app.emit('keydown',{code:'KeyF'});
  assert.ok(p.charges>before);
  assert.equal(right.picked,true);
  assert.equal(wrong.picked,false);
  app.frame(600);
  assert.match(app.node('pickupPrompt').textContent,/INCOMPATIBLE/);
 }
});

test('BR pause blocks keyboard firing, reload, supply, aim and assist without advancing the world',()=>{
  const app=boot();app.node('play').click();app.frame(1000/60);
  const g=app.game,p=g.player;
  g.loot.forEach(item=>{item.x=120;item.z=120;});
  const supply=g.loot.find(item=>item.weaponId===p.weaponId);
  supply.x=p.x;supply.z=p.z;
  p.charges=12;p.loaded=12;
  const yaw=p.yaw, elapsed=g.elapsed, shots=g.lastTagAt;
  app.emit('blur');
  for(const code of ['Space','KeyR','KeyF','KeyH','KeyW'])
    app.emit('keydown',{code});
  app.emit('mousemove',{movementX:100,movementY:10});
  app.node('scene').dispatch('click');
  app.frame(2000/60);
  assert.equal(g.elapsed,elapsed,'pause must freeze 60Hz simulation');
  assert.equal(p.charges,12,'neither fire nor E may mutate finite ammunition');
  assert.equal(p.loaded,12);
  assert.equal(p.reloadRemaining,0);
  assert.equal(p.reloadAssist,false);
  assert.equal(g.lastTagAt,shots);
  assert.equal(supply.picked,false);
  assert.equal(p.yaw,yaw);
  app.node('play').click();app.frame(3000/60);
  app.emit('keydown',{code:'Space'});
  assert.equal(p.charges,11,'firing works after explicit resume');
  app.emit('keydown',{code:'KeyF'});
  assert.ok(p.charges>11,'reachable physical supply works after resume');
  app.emit('keydown',{code:'KeyR'});
  assert.ok(p.reloadRemaining>0,'reload works after resume');
});

test('BR pause blocks touch controls and restores only fresh touch input after resume',()=>{
  const app=boot({touch:true});app.node('play').click();app.frame(1000/60);
  const g=app.game,p=g.player;
  g.loot.forEach(item=>{item.x=120;item.z=120;});
  const supply=g.loot.find(item=>item.weaponId===p.weaponId);
  supply.x=p.x;supply.z=p.z;
  p.charges=12;p.loaded=12;
  app.emit('blur');
  const before={charges:p.charges,loaded:p.loaded,remaining:p.reloadRemaining,
    assist:p.reloadAssist,x:p.x,yaw:p.yaw};
  for(const id of ['tagButton','reloadButton','lootButton','assistButton','sprintButton'])
    app.node(id).dispatch('pointerdown');
  app.node('stick').dispatch('pointerdown',{pointerId:3,clientX:80,clientY:44});
  app.node('scene').dispatch('pointerdown',{pointerId:4,clientX:40,clientY:40});
  app.node('scene').dispatch('pointermove',{pointerId:4,clientX:80,clientY:40});
  app.frame(2000/60);
  assert.deepEqual({charges:p.charges,loaded:p.loaded,remaining:p.reloadRemaining,
    assist:p.reloadAssist,x:p.x,yaw:p.yaw},before);
  assert.equal(supply.picked,false);
  app.node('play').click();app.frame(3000/60);
  app.node('tagButton').dispatch('pointerdown');
  assert.equal(p.charges,11,'fresh touch firing resumes');
  app.node('lootButton').dispatch('pointerdown');
  assert.ok(p.charges>11,'fresh touch supply interaction resumes');
});

test('opening BR graphics settings during play pauses the match until explicit resume',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const g=app.game,ammo=g.player.charges,elapsed=g.elapsed;
 app.emit('keydown',{code:'KeyG'});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.emit('keydown',{code:'Space'});
 for(let i=2;i<=120;i++)app.frame(i*1000/60);
 assert.equal(g.elapsed,elapsed,'settings must not allow hostile simulation to run behind the panel');
 assert.equal(g.player.charges,ammo,'settings must not allow unopposed shots');
 app.emit('keydown',{code:'KeyG'});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 app.frame(121*1000/60);
 assert.equal(g.elapsed,elapsed,'closing settings must not implicitly resume');
 app.node('play').click();
 app.frame(122*1000/60);
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.ok(g.elapsed>elapsed);
});


test('BR effect audio is opt-out, keyboard-accessible, persistent and never gates gameplay',()=>{
 const store=new Map(),app=boot({store});
 let audioConstructed=0;
 app.context.AudioContext=class {constructor(){audioConstructed++;}};
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 app.node('soundEnabled').checked=false;
 app.node('soundEnabled').dispatch('change');
 assert.equal(store.get('veilpoint.br.audio'),'off');
 app.emit('keydown',{code:'Space'});
 assert.equal(game.player.charges,47,'muting cannot suppress the actual finite shot');
 assert.equal(audioConstructed,0,'muted gameplay cannot initialize Web Audio');
 app.emit('keyup',{code:'Space'});
 for(let i=2;i<=30;i++)app.frame(i*1000/60);
 app.emit('keydown',{code:'KeyM'});
 assert.equal(app.node('soundEnabled').checked,true);
 assert.equal(store.get('veilpoint.br.audio'),'on');
 app.emit('keydown',{code:'Space'});
 assert.equal(game.player.charges,46);
 assert.equal(audioConstructed,1,'enabled shot can initialize audio lazily');
 app.emit('keydown',{code:'KeyM'});
 assert.equal(store.get('veilpoint.br.audio'),'off');
 const next=boot({store});
 assert.equal(next.node('soundEnabled').checked,false,'mute survives page reload');
 const touch=boot({store:new Map([['veilpoint.br.audio','off']]),touch:true});
 touch.node('play').click();touch.frame(1000/60);
 touch.context.AudioContext=class {constructor(){throw Error('muted touch must stay silent');}};
 touch.node('tagButton').dispatch('pointerdown');
 assert.equal(touch.game.player.charges,47,'touch shot remains playable with sound off');
});


test('BR new match discards orphaned keyboard and touch inputs instead of ghost-moving', () => {
  const app = boot({touch: true});
  app.node('play').click();
  app.frame(1000 / 60);
  app.emit('keydown', {code: 'KeyW'});
  app.node('stick').dispatch('pointerdown', {pointerId: 9, clientX: 88, clientY: 0});
  app.node('sprintButton').dispatch('pointerdown');
  assert.equal(app.context.VeilpointInput.forward, true);
  assert.equal(app.context.VeilpointInput.sprint, true);
  // Restart without keyup/pointerup: mobile browsers may drop both events.
  app.node('newMatch').click();
  app.frame(2000 / 60);
  const game = app.game;
  assert.ok(Object.values(app.context.VeilpointInput).every(v => v === false));
  const before = {x: game.player.x, z: game.player.z, stamina: game.player.stamina};
  app.node('stick').dispatch('pointermove', {pointerId: 9, clientX: 88, clientY: 0});
  app.frame(3000 / 60);
  app.frame(4000 / 60);
  assert.equal(game.player.x, before.x);
  assert.equal(game.player.z, before.z);
  assert.ok(game.player.stamina >= before.stamina, 'no orphaned sprint drain');
  app.emit('keydown', {code: 'KeyW'});
  app.frame(5000 / 60);
  assert.ok(game.player.z < before.z, 'fresh input remains responsive');
});


test('BR desktop pointer-lock loss freezes hostile simulation until explicit resume', () => {
 const app=boot();
 app.node('play').click();
 app.frame(1000/60);
 const game=app.game, before=game.elapsed;
 assert.equal(app.context.document.pointerLockElement,app.node('scene'));
 app.emit('keydown',{code:'KeyW'});
 app.context.document.exitPointerLock();
 app.emit('pointerlockchange');
 app.frame(5000);
 assert.equal(game.elapsed,before,'lost pointer lock must freeze the world');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.context.VeilpointInput.forward,false);
 app.node('play').click();
 assert.equal(app.context.document.pointerLockElement,app.node('scene'));
 app.frame(6000);
 assert.equal(app.game,game);
 assert.ok(game.elapsed>=before,'explicit resume keeps the same match');
});

test('BR Escape opens a safe pause even if pointerlockchange is delayed', () => {
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 const game=app.game,before=game.elapsed;
 app.emit('keydown',{code:'Escape'});
 app.frame(2000);
 assert.equal(game.elapsed,before);
 assert.equal(app.node('play').textContent,'이어하기');
 assert.equal(app.context.document.pointerLockElement,null);
 app.emit('pointerlockchange');
 app.frame(3000);
 assert.equal(game.elapsed,before,'late lock-change cannot restart simulation');
 app.node('play').click();app.frame(4000);
 assert.equal(app.game,game);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
});

test('Windows coarse-only convertible still requires pointer lock and hides legacy mobile controls', () => {
  const app=boot({touch:true,finePointer:false,pointerLock:'pending',windows:true});
  app.node('play').click();
  app.frame(1000/60);
  const game=app.game,elapsed=game.elapsed,rounds=game.player.charges;
  assert.equal(app.node('mobileControls').classList.contains('active'),false);
  app.emit('keydown',{code:'KeyW'});
  app.emit('keydown',{code:'Space'});
  app.frame(2000/60);
  assert.equal(game.elapsed,elapsed,'coarse Windows pointer cannot advance without desktop lock');
  assert.equal(game.player.charges,rounds,'coarse Windows pointer cannot fire without desktop lock');
  app.context.document.pointerLockElement=app.node('scene');
  app.frame(2017);
  assert.ok(game.elapsed>elapsed,'fixed 60Hz simulation resumes only after lock');
});

test('desktop BR never advances or fires while pointer-lock permission is pending', () => {
  const app = boot({pointerLock: 'pending'});
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game;
  const before = {elapsed: game.elapsed, rounds: game.player.charges};
  app.emit('keydown', {code: 'Space'});
  app.emit('keydown', {code: 'KeyW'});
  app.frame(2000);
  assert.equal(game.elapsed, before.elapsed, 'pending lock must freeze the fixed-step world');
  assert.equal(game.player.charges, before.rounds, 'pending lock must prevent blind firing');
  app.context.document.pointerLockElement = app.node('scene');
  app.frame(2017);
  assert.ok(game.elapsed > before.elapsed, 'play resumes only after pointer lock exists');
});

test('desktop BR safely pauses and explains an asynchronously rejected pointer lock', async () => {
  const app = boot({pointerLock: 'denied'});
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.match(app.selectors.get('.tagline').textContent, /포인터 잠금/);
  app.frame(1000);
  assert.equal(game.elapsed, 0);
  assert.ok(app.store.has('veilpoint.brCheckpoint.v1'), 'failed lock retains the same match');
});

test('desktop BR handles missing and synchronously denied pointer-lock APIs', () => {
  for (const mode of ['missing', 'throw']) {
    const app = boot({pointerLock: mode});
    if (mode === 'missing') delete app.node('scene').requestPointerLock;
    app.node('play').click();
    app.frame(1000);
    assert.equal(app.node('overlay').classList.contains('hidden'), false, mode);
    const saved = app.store.get('veilpoint.brCheckpoint.v1');
    assert.ok(saved, 'refused lock must still checkpoint the match');
    assert.equal(app.context.VeilpointSim.restoreMatch(saved).elapsed, 0, mode);
  }
});

test('pagehide pauses BR before bfcache restoration and preserves the exact match', () => {
  const app = boot();
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game;
  app.emit('pagehide');
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.ok(app.store.has('veilpoint.brCheckpoint.v1'));
  const elapsed = game.elapsed;
  app.frame(1000);
  assert.equal(game.elapsed, elapsed, 'background page cannot continue combat');
  app.node('play').click();
  app.frame(1017);
  assert.equal(app.game, game, 'resume must not restart a different match');
  assert.ok(game.elapsed > elapsed);
});

test('BR freezes immediately on lost desktop lock even before pointerlockchange dispatch', () => {
  const app = boot();
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game, elapsed = game.elapsed, rounds = game.player.charges;
  app.context.document.pointerLockElement = null;
  app.emit('keydown', {code: 'Space'});
  app.frame(1000);
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.player.charges, rounds);
  app.emit('pointerlockchange');
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
});

test('BR freezes on hidden document before visibilitychange can be delivered', () => {
  const app = boot();
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game, elapsed = game.elapsed;
  app.context.document.hidden = true;
  app.frame(1000);
  assert.equal(game.elapsed, elapsed);
  app.emit('visibilitychange');
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
});


test('BR browser shows truthful magazine/reserve and boundary proximity without hiding event feedback',()=>{
 const app=boot();app.node('play').click();app.frame(300);
 assert.match(app.node('charges').innerHTML,/^12<span> \/ 36/);
 const game=app.game;
 game.player.x=161;game.player.z=0;
 game.message='RELOADING';game.messageTime=3;
 app.frame(600);
 assert.match(app.node('message').textContent,/BOUNDARY NEARBY/);
 assert.match(app.node('message').textContent,/RELOADING/);
 game.player.x=171;
 app.frame(900);
 assert.match(app.node('message').textContent,/OUTSIDE MATCH BOUNDARY/);
 assert.match(app.node('message').textContent,/DEADLINE/);
 assert.equal(game.player.health,100,'a competition boundary must not fabricate injury');
 assert.equal(game.player.charges,48);
});


test('BR graphics diagnostics report bounded P50/P95/P99 with missing GPU samples explicitly unavailable',()=>{
 const app=boot();app.node('play').click();app.frame(300);app.frame(600);
 const details=app.node('perfDetails').textContent;
 assert.match(details,/렌더 CPU \(n=\d+\) P50\/P95\/P99:/);
 assert.match(details,/GPU 타이머 \(n=0\) P50\/P95\/P99: 측정 불가 \/ 측정 불가 \/ 측정 불가/);
 assert.match(details,/표시 콜백 간격 \(n=\d+\) P50\/P95\/P99:/);
 assert.match(details,/현재 내부 렌더 배율:/);
 assert.match(details,/표시 콜백 P95 \/ 165FPS 설정: 관측 부족/);
 assert.match(details,/모니터\/실제 GPU FPS 미인증/);
 assert.equal(details.split('\n').length,5,
  'the extra evidence-gated callback budget line is part of the PC HUD');
});

test('PC BR remapped fire/reload keys and sensitivity persist without changing 60Hz simulation',()=>{
 const store=new Map(),app=boot({store});
 app.node('desktopBindAction').value='fire';
 app.node('desktopBindKey').click();
 app.emit('keydown',{code:'KeyT'});
 assert.match(app.node('desktopBindStatus').textContent,/저장/);
 app.node('desktopSensitivity').value='2';
 app.node('desktopSensitivity').dispatch('change');
 app.node('desktopInvertY').checked=true;
 app.node('desktopInvertY').dispatch('change');
 app.node('play').click();app.frame(1000/60);
 const game=app.game,before=game.player.charges,yaw=game.player.yaw,pitch=game.player.pitch;
 app.emit('keydown',{code:'Space'});
 assert.equal(game.player.charges,before,'old fire binding must be disabled');
 app.emit('keydown',{code:'KeyT'});
 assert.equal(game.player.charges,before-1,'new fire binding consumes one finite round');
 app.emit('mousemove',{movementX:100,movementY:10});
 assert.ok(Math.abs(game.player.yaw-yaw-.46)<1e-9);
 assert.ok(game.player.pitch>pitch,'inverted Y should raise pitch on downward mouse motion');
 const reloaded=boot({store});
 assert.equal(reloaded.node('desktopSensitivity').value,'2');
 assert.equal(reloaded.node('desktopInvertY').checked,true);
 assert.equal(reloaded.node('desktopBindAction').value,'');
 reloaded.node('desktopBindAction').value='fire';reloaded.node('desktopBindAction').dispatch('change');
 assert.equal(reloaded.node('desktopBindKey').textContent,'KeyT');
});
test('PC BR binding conflict and Escape cancel never fire or pause an active match',()=>{
 const app=boot();app.node('desktopBindAction').value='fire';
 app.node('desktopBindKey').click();app.emit('keydown',{code:'KeyR'});
 assert.match(app.node('desktopBindStatus').textContent,/이미 사용/);
 app.emit('keydown',{code:'Escape'});
 assert.match(app.node('desktopBindStatus').textContent,/취소/);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
});

test('PC key repeat cannot rapidly toggle BR assist, audio or graphics panel', () => {
  const app = boot();
  app.node('play').click();app.frame(1000 / 60);
  const game = app.game;
  const initial = game.player.reloadAssist;
  app.emit('keydown', {code: 'KeyH'});
  assert.notEqual(game.player.reloadAssist, initial);
  app.emit('keydown', {code: 'KeyH', repeat: true});
  assert.notEqual(game.player.reloadAssist, initial, 'repeated H must not undo accessibility choice');
  const audio = app.node('soundEnabled').checked;
  app.emit('keydown', {code: 'KeyM'});
  assert.notEqual(app.node('soundEnabled').checked, audio);
  app.emit('keydown', {code: 'KeyM', repeat: true});
  assert.notEqual(app.node('soundEnabled').checked, audio);
  app.emit('keydown', {code: 'KeyG'});
  const opened = app.node('graphicsPanel').classList.contains('hidden');
  app.emit('keydown', {code: 'KeyG', repeat: true});
  assert.equal(app.node('graphicsPanel').classList.contains('hidden'), opened);
});

test('PC settings focus cannot accidentally start a BR match or fire finite ammunition',()=>{
  const app=boot();
  app.emit('keydown',{code:'Enter',target:{tagName:'SELECT'}});
  assert.equal(app.node('overlay').classList.contains('hidden'),false);
  app.node('play').click();
  app.frame(1000/60);
  const game=app.game,rounds=game.player.charges;
  app.emit('keydown',{code:'Space',target:{tagName:'SELECT'}});
  assert.equal(game.player.charges,rounds,'focused settings select must not fire');
  app.emit('keydown',{code:'Space',target:{tagName:'A',href:'#help'}});
  app.emit('keydown',{code:'Space',target:{tagName:'SPAN',parentElement:{tagName:'DIV',role:'button'}}});
  assert.equal(game.player.charges,rounds,'focused help link and custom PC menu control cannot fire');
  app.emit('keydown',{code:'Space'});
  assert.equal(game.player.charges,rounds-1,'canvas/gameplay keyboard still fires normally');
});

// Windows convertible PCs must keep mouse aim protected by pointer lock even
// when their primary pointer is reported as coarse (touchscreen present).
test('PC hybrid BR requires mouse pointer lock before movement, aim or firing', () => {
 const app=boot({touch:true,finePointer:true,pointerLock:'pending'});
 app.node('play').click();app.frame(1000/60);
 const game=app.game,rounds=game.player.charges,startYaw=game.player.yaw;
 app.emit('keydown',{code:'KeyW'});
 app.emit('keydown',{code:'Space'});
 app.emit('mousemove',{movementX:100,movementY:0});
 app.frame(2000/60);
 assert.equal(game.player.charges,rounds);
 assert.equal(game.player.yaw,startYaw);
 assert.equal(game.elapsed,0,'world must remain paused without mouse capture');
 app.context.document.pointerLockElement=app.node('scene');
 app.emit('mousemove',{movementX:100,movementY:0});
 app.emit('keydown',{code:'Space'});
 assert.ok(game.player.yaw>startYaw);
 assert.equal(game.player.charges,rounds-1);
});

test('PC Escape cancels a pending pointer lock even with a focused launch button',()=>{
 const app=boot({pointerLock:'pending'});
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 assert.equal(game.elapsed,0);
 app.emit('keydown',{code:'Escape',target:{tagName:'BUTTON'}});
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.node('play').textContent,'이어하기');
 app.frame(2000/60);
 assert.equal(game.elapsed,0,'pause cannot simulate hostile fire while capture is unresolved');
});


test('PC BR late permission grant after Escape cannot reclaim the mouse or resume the match', async () => {
  const app = boot({pointerLock: 'late'});
  app.node('play').click();
  app.frame(1000 / 60);
  app.emit('keydown', {code: 'Escape', target: {tagName: 'BUTTON'}});
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  app.grantPointerLock();
  await Promise.resolve();await Promise.resolve();
  assert.equal(app.context.document.pointerLockElement, null,
    'late browser grant must be released after the player pauses');
  app.frame(2000 / 60);
  assert.equal(app.game.elapsed, 0);
});

test('PC BR Start/Resume transfers focus off menu buttons to the game canvas',()=>{
 const app=boot(),play=app.node('play');
 app.context.document.activeElement=play;
 play.click();
 assert.equal(app.context.document.activeElement,app.node('scene'));
 assert.equal(app.node('scene').tabIndex,-1);
 app.frame(1000/60);
 app.emit('blur');
 app.context.document.activeElement=play;
 play.click();
 assert.equal(app.context.document.activeElement,app.node('scene'));
});
test('PC BR held fire follows 60Hz cadence; OS repeat adds no separate shots or scroll',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const p=app.game.player;
 app.emit('keydown',{code:'Space'});assert.equal(p.charges,47);
 for(let tick=2;tick<=60;tick++)app.frame(tick*1000/60);
 assert.ok(p.charges<47,'holding automatic fire spends finite rounds on 60Hz steps');
 const afterHeld=p.charges;
 for(let i=0;i<8;i++)app.emit('keydown',{code:'Space',repeat:true});
 assert.equal(p.charges,afterHeld,'OS repeats without simulation ticks cannot spend rounds');
 let prevented=false;
 app.emit('keydown',{code:'ArrowUp',repeat:true,preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'remapped/default movement repeat must not scroll page');
 app.emit('keyup',{code:'Space'});
 for(let tick=61;tick<=90;tick++)app.frame(tick*1000/60);
 assert.equal(p.charges,afterHeld,'releasing the trigger stops fixed-step automatic fire');
 app.emit('keydown',{code:'Space'});assert.equal(p.charges,afterHeld-1);
});
test('PC BR primary mouse hold fires at fixed cadence and mouseup ends the stream',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const p=app.game.player;
 app.node('scene').dispatch('mousedown',{button:0});
 assert.equal(p.charges,47,'first click has immediate feedback');
 for(let tick=2;tick<=45;tick++)app.frame(tick*1000/60);
 assert.ok(p.charges<47);
 const afterHeld=p.charges;
 app.emit('mouseup',{button:0});
 for(let tick=46;tick<=80;tick++)app.frame(tick*1000/60);
 assert.equal(p.charges,afterHeld);
});

test('PC BR simultaneous mouse and keyboard fire persists until both triggers release',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const p=app.game.player;
 app.emit('keydown',{code:'Space'});
 app.node('scene').dispatch('mousedown',{button:0});
 app.emit('keyup',{code:'Space'});
 assert.equal(app.context.VeilpointInput.fireHeld,true,'mouse remains pressed');
 for(let tick=2;tick<=32;tick++)app.frame(tick*1000/60);
 const after=p.charges;
 assert.ok(after<47,'mouse continues finite automatic fire after keyboard release');
 app.emit('mouseup',{button:0});
 assert.equal(app.context.VeilpointInput.fireHeld,false);
 for(let tick=33;tick<=60;tick++)app.frame(tick*1000/60);
 assert.equal(p.charges,after,'no ghost shots after last trigger release');
 app.emit('keydown',{code:'Space'});
 app.node('scene').dispatch('mousedown',{button:0});
 app.emit('mouseup',{button:0});
 assert.equal(app.context.VeilpointInput.fireHeld,true,'keyboard remains held after mouse release');
 app.emit('blur');
 assert.equal(app.context.VeilpointInput.fireHeld,false,'background pause clears all trigger sources');
});

test('BR PC canvas requests unadjusted mouse movement without altering 60Hz gameplay',()=>{
 const app=boot();
 app.node('play').click();
 assert.equal(app.node('scene').lastPointerLockOptions.unadjustedMovement,true);
 app.frame(1000/60);
 assert.equal(app.game.status,'playing');
});


test('PC BR handles event-only pointer-lock denial and ignores late errors after success', () => {
  const app = boot({pointerLock: 'pending'});
  app.node('play').click(); app.frame(1000 / 60);
  const game = app.game, before = game.elapsed;
  app.emit('keydown', {code: 'KeyW'});
  app.emit('pointerlockerror');
  app.frame(3000);
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.match(app.selectors.get('.tagline').textContent, /포인터 잠금/);
  assert.equal(game.elapsed, before, 'an event-only denial cannot advance the world');
  assert.equal(app.context.VeilpointInput.forward, false);
  assert.ok(app.store.has('veilpoint.brCheckpoint.v1'));
  app.context.document.pointerLockElement = app.node('scene');
  app.node('play').click();
  app.emit('pointerlockerror');
  assert.equal(app.node('overlay').classList.contains('hidden'), true,
    'late error after an acquired PC lock cannot pause the new attempt');
});

test('PC BR HUD separates magazine digits from reload and stress feedback', () => {
  const app = boot();
  app.node('play').click();
  app.frame(1000 / 60);
  assert.equal(app.node('charges').innerHTML, '12<span> / 36</span>');
  assert.match(app.node('ammoStatus').textContent, /^READY · STRESS 0 · MOBILITY 100% · FIELD LOAD 100% · ASSIST OFF$/);
  app.emit('keydown', {code: 'Space'});
  app.emit('keyup', {code: 'Space'});
  assert.equal(app.node('charges').innerHTML, '11<span> / 36</span>');
  app.emit('keydown', {code: 'KeyR'});
  assert.match(app.node('ammoStatus').textContent, /^RELOADING · STRESS /);
  assert.doesNotMatch(app.node('charges').innerHTML, /RELOADING|STRESS|MOBILITY|ASSIST/);
});

test('PC BR held-fire autosaves are bounded and blur flushes the final finite-ammo state',()=>{
 const store=new Map(),originalSet=store.set.bind(store);
 let checkpointWrites=0;
 store.set=(key,value)=>{
  if(key==='veilpoint.brCheckpoint.v1')checkpointWrites++;
  return originalSet(key,value);
 };
 const app=boot({store});
 app.node('play').click();app.frame(1000/60);
 const initialWrites=checkpointWrites;
 const game=app.game;
 app.emit('keydown',{code:'Space'});
 assert.equal(JSON.parse(store.get('veilpoint.brCheckpoint.v1')).player.charges,47,
   'the deliberate first shot still checkpoints immediately before held-fire batching');
 for(let tick=2;tick<=135;tick++)app.frame(tick*1000/60);
 app.emit('keyup',{code:'Space'});
 const shots=48-game.player.charges;
 assert.ok(shots>=8,'real held-fire input must produce multiple fixed-step shots');
 assert.ok(checkpointWrites-initialWrites<=3,
   'rapid shots must not synchronously serialize the full match once per round');
 assert.ok(checkpointWrites-initialWrites>=1,
   'a sustained volley must still checkpoint within a bounded one-second window');
 const stored=JSON.parse(store.get('veilpoint.brCheckpoint.v1'));
 assert.ok(stored.player.charges>=game.player.charges,
   'checkpoint cannot invent ammunition that was not carried earlier');
 app.emit('blur');
 const flushed=JSON.parse(store.get('veilpoint.brCheckpoint.v1'));
 assert.equal(flushed.player.charges,game.player.charges,
   'background pause must flush every finite shot before the player leaves');
 assert.equal(flushed.elapsed,game.elapsed);
 assert.equal(app.context.VeilpointInput.fireHeld,false);
});

test('PC BR shot HUD updates immediately then batches rapid fire without stale READY timers',()=>{
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'Space'});
 assert.equal(app.node('charges').innerHTML,'11<span> / 36</span>');
 const firstTimer=app.scheduledCallbacks.at(-1);
 for(let tick=2;tick<=14;tick++)app.frame(tick*1000/60);
 assert.equal(app.game.player.charges,46,'second shot follows the 60Hz firearm cadence');
 assert.equal(app.node('charges').innerHTML,'11<span> / 36</span>',
   'minimap/ammo HUD should not be redrawn synchronously on every rapid shot');
 assert.ok(app.scheduledCallbacks.length>=2);
 firstTimer();
 assert.equal(app.node('hitText').textContent,'SHOT FIRED',
   'an older feedback timeout must not erase a more recent shot cue');
 for(let tick=15;tick<=17;tick++)app.frame(tick*1000/60);
 assert.equal(app.node('charges').innerHTML,'10<span> / 36</span>',
   'regular HUD refresh catches up without changing fixed-step ammo');
 app.emit('keyup',{code:'Space'});
 app.scheduledCallbacks.at(-1)();
 assert.equal(app.node('hitText').textContent,'READY');
});

test('BR WebGL failure preserves keyboard access and recovery restores Resume focus',()=>{
 const app=boot({windows:true});app.node('play').click();app.frame(1000/60);
 const game=app.game,elapsed=game.elapsed;
 app.node('scene').dispatch('webglcontextlost');
 assert.equal(app.node('play').disabled,true);
 assert.equal(app.context.document.activeElement,app.node('brViewMore'),
  'GPU loss must focus an enabled menu control instead of disabled Resume');
 app.context.VeilpointRenderer.failNext=true;
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.context.document.activeElement,app.node('brViewMore'),
  'failed GPU recovery cannot return keyboard focus to a disabled control');
 assert.equal(app.node('play').disabled,true);
 app.frame(2000);assert.equal(game.elapsed,elapsed);
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,false);
 assert.equal(app.context.document.activeElement,app.node('play'));
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.frame(3000);assert.equal(game.elapsed,elapsed,
  'successful GPU restoration must not auto-resume the 60Hz game');
});

test('BR pre-match GPU reset returns keyboard focus without starting an offline round',()=>{
 const app=boot({windows:true});
 // The Node DOM fixture has no parsed HTML class attributes; the actual
 // pre-match HTML starts with graphicsPanel.hidden.
 app.node('graphicsPanel').classList.add('hidden');
 app.node('scene').dispatch('webglcontextlost');
 assert.equal(app.context.document.activeElement,app.node('brViewMore'));
 assert.equal(app.node('play').disabled,true);
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,false);
 assert.equal(app.context.document.activeElement,app.node('play'));
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
});

test('PC WebGL context loss preserves paused BR and explicit resume',()=>{
 const app=boot({windows:true});app.node('play').click();app.frame(1000/60);
 const game=app.game,elapsed=game.elapsed;let prevented=false;
 app.node('scene').dispatch('webglcontextlost',{preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(app.node('play').disabled,true);
 assert.equal(app.node('newMatch').disabled,true);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.ok(app.store.has('veilpoint.brCheckpoint.v1'));
 app.frame(3000);assert.equal(game.elapsed,elapsed);
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,false);
 assert.match(app.selectors.get('.tagline').textContent,/복구/);
 app.frame(4000);assert.equal(game.elapsed,elapsed,'recovery must not auto-resume');
 app.node('play').click();app.frame(4000+1000/60);
 assert.equal(app.game,game);assert.ok(game.elapsed>elapsed);
});

test('BR renderer recreation failure keeps PC controls disabled and match frozen',()=>{
 const app=boot({windows:true});app.node('play').click();app.frame(1000/60);
 const game=app.game,elapsed=game.elapsed;
 app.node('scene').dispatch('webglcontextlost');
 app.context.VeilpointRenderer.failNext=true;
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,true);
 assert.equal(app.node('newMatch').disabled,true);
 assert.match(app.node('message').textContent,/RECOVERY FAILED/);
 app.frame(5000);assert.equal(game.elapsed,elapsed);
});

test('PC BR ignores Korean IME and OS chords without blocking shifted fire',()=>{
 const app=boot({windows:true});app.node('play').click();app.frame(1000/60);
 const game=app.game,input=app.context.VeilpointInput,ammo=game.player.charges;
 for(const event of [
  {code:'Space',isComposing:true},{code:'Space',key:'Process'},
  {code:'Space',keyCode:229},{code:'Space',ctrlKey:true},
  {code:'Space',metaKey:true},{code:'KeyR',altKey:true},
  {code:'KeyW',ctrlKey:true}
 ])app.emit('keydown',event);
 assert.equal(game.player.charges,ammo);
 assert.equal(game.player.reloadRemaining,0);
 assert.equal(input.forward,false);
 app.emit('keydown',{code:'Space',shiftKey:true});
 assert.equal(game.player.charges,ammo-1);
 app.emit('keyup',{code:'Space'});
});

test('PC BR OS shortcut transition releases held fire and movement',()=>{
 const app=boot({windows:true});app.node('play').click();app.frame(1000/60);
 const input=app.context.VeilpointInput;
 app.emit('keydown',{code:'Space'});app.emit('keydown',{code:'KeyW'});
 assert.equal(input.fireHeld,true);assert.equal(input.forward,true);
 app.emit('keydown',{code:'ControlLeft',ctrlKey:true});
 assert.equal(input.fireHeld,false);assert.equal(input.forward,false);
 app.emit('keyup',{code:'Space'});app.emit('keyup',{code:'KeyW'});
});


test('PC benchmark cannot silently measure a different graphics preset after arming',()=>{
 const app=boot({windows:true});
 app.node('benchmarkStart').click();
 assert.match(app.node('benchmarkStatus').textContent,/준비됨/);
 app.node('graphicsPreset').value='balanced';
 app.node('graphicsPreset').dispatch('change');
 app.frame(300);
 assert.match(app.node('benchmarkStatus').textContent,/graphics-settings-changed/);
 assert.equal(app.node('benchmarkStop').disabled,true);
 app.node('benchmarkStart').click();
 app.node('play').click();
 app.frame(600);
 app.frame(620);
 app.frame(900);
 assert.match(app.node('benchmarkStatus').textContent,/측정 중/);
 app.node('graphicsPreset').value='performance';
 app.node('graphicsPreset').dispatch('change');
 app.frame(1200);
 assert.match(app.node('benchmarkStatus').textContent,/graphics-settings-changed/);
 assert.equal(app.node('benchmarkStop').disabled,true);
});

test('PC BR silent pointer-lock permission stall pauses safely and preserves the match', () => {
 const app=boot({pointerLock:'pending'});
 app.node('play').click();app.frame(1000/60);
 const game=app.game,rounds=game.player.charges;
 app.emit('keydown',{code:'KeyW'});
 app.frame(3999);
 assert.equal(app.node('overlay').classList.contains('hidden'),true,
   'short permission prompts must not be interrupted');
 assert.equal(game.elapsed,0,'no world simulation before permission');
 app.frame(4001);
 assert.equal(app.node('overlay').classList.contains('hidden'),false,
   'a silent browser permission stall must return to a visible pause');
 assert.equal(app.node('play').textContent,'이어하기');
 assert.match(app.selectors.get('.tagline').textContent,/포인터 잠금/);
 assert.equal(game.elapsed,0);
 assert.equal(game.player.charges,rounds);
 assert.equal(app.context.VeilpointInput.forward,false);
 const saved=app.store.get('veilpoint.brCheckpoint.v1');
 assert.ok(saved,'the original round must remain resumable');
 assert.equal(app.context.VeilpointSim.restoreMatch(saved).elapsed,0);
 // A new user gesture can retry permission without replacing the round.
 app.node('play').click();
 app.context.document.pointerLockElement=app.node('scene');
 app.frame(4050);
 assert.equal(app.game,game);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.ok(game.elapsed>0,'fresh permission resumes the original fixed-step world');
});

test('PC BR a late pointer-lock grant after watchdog pause cannot reclaim the mouse', async () => {
 const app=boot({pointerLock:'late'});
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 app.frame(4500);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.grantPointerLock();
 await Promise.resolve();await Promise.resolve();
 assert.equal(app.context.document.pointerLockElement,null,
   'canceled permission must release a late browser grant');
 app.frame(4600);
 assert.equal(game.elapsed,0);
 assert.ok(app.store.has('veilpoint.brCheckpoint.v1'));
});

test('PC BR granted pointer lock wins over an undelivered permission event', () => {
 const app=boot({pointerLock:'pending'});
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 app.frame(3900);
 app.context.document.pointerLockElement=app.node('scene');
 app.frame(4200);
 assert.equal(app.node('overlay').classList.contains('hidden'),true,
   'a valid lock must not be timed out solely because no event fired');
 assert.ok(game.elapsed>0);
 app.frame(9000);
 assert.equal(app.node('overlay').classList.contains('hidden'),true,
   'the completed permission must not trigger a later stale timeout');
});

test('PC BR a silently lost acquired pointer lock pauses before another hostile tick', () => {
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 const game=app.game,before=game.elapsed;
 assert.equal(app.context.document.pointerLockElement,app.node('scene'));
 app.emit('keydown',{code:'KeyW'});
 // Some embedded browsers can drop the lock without delivering pointerlockchange.
 app.context.document.exitPointerLock();
 app.frame(5000);
 assert.equal(game.elapsed,before,'no simulation after an unannounced lock release');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.context.VeilpointInput.forward,false);
 assert.ok(app.store.has('veilpoint.brCheckpoint.v1'));
 app.node('play').click();
 app.frame(5050);
 assert.equal(app.game,game,'explicit resume must keep the original round');
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.ok(game.elapsed>before);
});

test('an early BR match end exposes an explicitly partial benchmark JSON on the end screen',()=>{
 const app=boot({windows:true});
 app.node('benchmarkStart').click();
 app.node('play').click();
 app.frame(1000/60);
 // Keep this UI regression deterministic: it measures a live render loop
 // without depending on unrelated AI combat timing.
 for(const bot of app.game.bots)bot.actionTime=999;
 for(let i=2;i<=390;i++)app.frame(i*1000/60);
 assert.match(app.node('benchmarkStatus').textContent,/측정 중/);
 app.context.VeilpointSim.receiveDamage(app.game,100);
 app.frame(391*1000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.node('benchmarkQuickExport').classList.contains('hidden'),false);
 assert.match(app.node('benchmarkQuickExport').textContent,/부분 측정/);
 assert.match(app.node('benchmarkStatus').textContent,/120초 결과가 아닙니다/);
 let downloadName=null;
 app.context.Blob=Blob;
 app.context.URL={createObjectURL:()=> 'blob:local',revokeObjectURL:()=>{}};
 app.context.document.body={appendChild(){}};
 app.context.document.createElement=()=>({
  click(){downloadName=this.download;},remove(){}
 });
 app.node('benchmarkQuickExport').click();
 assert.equal(downloadName,'veilpoint-browser-benchmark-partial.json');
});

test('Windows graphics panel stays reachable above initial and paused overlays',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const z=selector=>{
    const rule=html.match(selector);
    assert.ok(rule,'missing CSS rule '+selector);
    const match=rule[0].match(/z-index:\s*(\d+)/);
    assert.ok(match,'missing z-index');
    return Number(match[1]);
  };
  const overlay=z(/\.overlay\{[^}]+\}/);
  assert.ok(z(/#topbar\{[^}]+\}/)>overlay,
    'settings trigger must not be obscured by the start/pause/end overlay');
  assert.ok(z(/\.graphics-panel\{[^}]+\}/)>overlay,
    'opened settings controls must not be blocked by the overlay');
  const app=boot({windows:true});
  // The lightweight DOM mock does not parse initial HTML class attributes.
  app.node('graphicsPanel').classList.add('hidden');
  assert.equal(app.node('overlay').classList.contains('hidden'),false);
  app.node('graphicsOpen').click();
  assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
  app.node('graphicsClose').click();
  assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
  app.node('play').click();
  assert.equal(app.node('overlay').classList.contains('hidden'),true);
  app.node('graphicsOpen').click();
  assert.equal(app.node('overlay').classList.contains('hidden'),false,
    'opening settings must safely pause live PC gameplay');
  assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
  app.node('graphicsClose').click();
  assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
});

test('offline BR remains playable when browser denies the localStorage getter', () => {
  const app = boot({windows: true, storageBlocked: true});
  app.node('play').click();
  app.frame(1000 / 60);
  assert.equal(app.game.status, 'playing');
  assert.equal(app.node('desktopBindKey').textContent, 'KeyR',
    'PC controls fall back to defaults without storage');
});

test('PC F operates the actual BR service yard gate; HUD, 60Hz slide and resume agree',()=>{
 const store=new Map(),app=boot({store});
 app.node('play').click();
 app.frame(1000/60);
 const game=app.game;
 assert.equal(game.status,'playing');
 game.player.x=30;game.player.z=-21.8;game.player.yaw=0;
 const at=500;
 app.frame(at); // Force the quarter-second HUD refresh after relocating in the test.
 assert.match(app.node('pickupPrompt').textContent,/\[F\] OPERATE SERVICE YARD/);
 app.emit('keydown',{code:'KeyF'});
 assert.equal(game.yardGate.engaged,true);
 assert.ok(store.get('veilpoint.brCheckpoint.v1'),'operating physical controls saves the world');
 app.frame(at+1000/60);
 assert.match(app.node('pickupPrompt').textContent,/SERVICE YARD GATE OPENING/);
 for(let i=2;i<=140;i++)app.frame(at+i*1000/60);
 assert.equal(game.yardGate.progress,1);
 assert.match(app.node('pickupPrompt').textContent,/GATE OPEN · PASSAGE CLEAR/);
 app.emit('blur');
 const resumed=boot({store});
 resumed.node('play').click();
 resumed.frame(1000/60);
 assert.equal(resumed.game.yardGate.progress,1);
 assert.equal(resumed.game.obstacles.find(o=>o.routeId==='br-service-gate').x,37.2);
});

test('BR gate F starts audible local motor; moving away and pausing stop the cue',()=>{
 const app=boot({store:new Map()});
 const events=[];
 app.context.AudioContext=class {
  constructor(){this.currentTime=1;this.destination={};events.push('created');}
  createOscillator(){return {type:'triangle',frequency:{setValueAtTime(){}},
   connect(){},start(){events.push('started');},stop(){events.push('stopped');}};}
  createGain(){return {gain:{setValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}},connect(){}};}
 };
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 game.player.x=30;game.player.z=-21.8;
 app.emit('keydown',{code:'KeyF'});
 assert.equal(game.yardGate.engaged,true);
 assert.ok(events.includes('started'),'F gesture unlocks local procedural motor sound');
 assert.ok(!events.includes('stopped'));
 game.player.x=0;game.player.z=0;
 app.frame(200);
 assert.ok(events.includes('stopped'),'distance silences local gate');
 game.player.x=30;game.player.z=-21.8;
 app.frame(400);
 assert.equal(events.filter(e=>e==='started').length,2);
 app.emit('blur');
 assert.equal(events.filter(e=>e==='stopped').length,2,'pause clears a running cue');
});

test('BR PC gate HUD labels a stalled physical motor rather than falsely claiming motion',()=>{
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 const world=app.game;
 world.player.x=app.context.VeilpointSim.SERVICE_YARD.switchX;
 world.player.z=app.context.VeilpointSim.SERVICE_YARD.switchZ;
 app.emit('keydown',{code:'KeyF'});
 assert.equal(world.yardGate.engaged,true);
 world.bots[0].x=app.context.VeilpointSim.SERVICE_YARD.x;
 world.bots[0].z=app.context.VeilpointSim.SERVICE_YARD.z;
 app.frame(500);
 assert.match(app.node('pickupPrompt').textContent,/TRACK OBSTRUCTED/);
 assert.equal(app.context.VeilpointSim.gateMotorActive(world),false);
});

test('PC Enter on unfocused BR menu resumes the exact stored arena through Play guard',()=>{
  const store=new Map(),initial=boot({store,windows:true});
  initial.node('play').click();initial.frame(1000/60);
  const old=initial.game;
  old.player.x=6;old.player.z=-3;
  initial.emit('blur'); // physical pause checkpoint
  const saved=store.get('veilpoint.brCheckpoint.v1');
  assert.ok(saved,'a saved world must exist before launching a second tab');
  const resumed=boot({store,windows:true});
  assert.match(resumed.node('play').textContent,/저장 경기 이어하기/);
  resumed.emit('keydown',{code:'Enter',target:{tagName:'DIV'}});
  resumed.frame(1000/60);
  assert.equal(resumed.game.status,'playing');
  assert.equal(resumed.game.seed,old.seed);
  assert.equal(resumed.game.player.x,6);
  assert.equal(resumed.game.player.z,-3);
  assert.equal(resumed.node('overlay').classList.contains('hidden'),true);
  assert.equal(resumed.context.document.activeElement,resumed.node('scene'),
    'the keyboard resume returns focus to the first-person scene');
  resumed.emit('keydown',{code:'Enter',target:{tagName:'DIV'}});
  assert.equal(resumed.game.seed,old.seed,'Enter must not launch another round mid-match');
});

test('PC Enter still starts a temporary BR match when storage access is unavailable',()=>{
  const app=boot({windows:true,storageBlocked:true});
  app.emit('keydown',{code:'Enter',target:{tagName:'DIV'}});
  app.frame(1000/60);
  assert.equal(app.game.status,'playing');
  assert.equal(app.node('overlay').classList.contains('hidden'),true);
  assert.match(app.game.message,/MEMORY-ONLY/);
});

test('PC BR retry button cannot delete disk checkpoint after memory-only session',()=>{
  const store=new Map(),durable=boot({store});
  durable.node('play').click();durable.frame(1000/60);durable.emit('blur');
  const diskRaw=store.get('veilpoint.brCheckpoint.v1');
  assert.ok(diskRaw);
  // Both startup check and Play encounter a temporary read denial. The
  // transient session must stay isolated even after storage becomes readable.
  const temporary=boot({store,windows:true,checkpointReadFailures:2});
  assert.match(temporary.node('play').textContent,/저장소 없이 플레이/);
  temporary.node('play').click();temporary.frame(1000/60);
  assert.equal(temporary.game.status,'playing');
  assert.equal(store.get('veilpoint.brCheckpoint.v1'),diskRaw);
  const temporarySeed=temporary.game.seed;
  temporary.context.VeilpointSim.receiveDamage(temporary.game,100);
  temporary.frame(2000/60);
  assert.equal(temporary.node('overlay').classList.contains('hidden'),false);
  temporary.node('retryArena').click();temporary.frame(3000/60);
  assert.equal(temporary.game.status,'playing');
  assert.equal(temporary.game.seed,temporarySeed,'explicit same-arena retry retains original seed');
  assert.equal(store.get('veilpoint.brCheckpoint.v1'),diskRaw,
    'recovered storage access must not allow a memory-only retry to erase old saves');
});

test('BR Windows Continue preserves two corrupt disk generations in a playable isolated match',()=>{
 const key='veilpoint.brCheckpoint.v1',previous='veilpoint.brCheckpoint.v1.previous';
 const first='{invalid-active-round',backup='{invalid-previous-round';
 const store=new Map([[key,first],[previous,backup]]);
 const app=boot({store,windows:true});
 assert.match(app.node('play').textContent,/기록 보존.*임시 경기/);
 assert.match(app.context.document.querySelector('.tagline').textContent,/기존 기록/);
 assert.equal(store.get(key),first);
 assert.equal(store.get(previous),backup);
 app.node('play').click();
 app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 assert.match(app.game.message,/MEMORY-ONLY/);
 app.frame(1000);
 app.emit('blur');
 assert.equal(store.get(key),first,'offline memory-only play must not replace the original generation');
 assert.equal(store.get(previous),backup,'failed backup must remain available for manual recovery');
 const reopened=boot({store,windows:true});
 assert.match(reopened.node('play').textContent,/기록 보존/);
 assert.equal(store.get(key),first);
 assert.equal(store.get(previous),backup);
});

test('BR explicit New Match resets invalid BR generations without erasing CH01 storage',()=>{
 const key='veilpoint.brCheckpoint.v1',previous='veilpoint.brCheckpoint.v1.previous';
 const story='{"savedStory":"CH01 untouched"}';
 const store=new Map([[key,'{bad-br-primary'],['veilpoint.story.ch01',story]]);
 const app=boot({store,windows:true});
 app.node('play').click();app.frame(1000/60);app.emit('blur');
 assert.equal(store.get(key),'{bad-br-primary','Continue does not overwrite corrupt BR progress');
 // This is the user's explicit destructive reset, not an automatic recovery.
 app.node('newMatch').click();app.frame(2000/60);
 const restored=app.context.VeilpointSim.restoreMatch(store.get(key));
 assert.equal(restored.status,'playing');
 assert.equal(store.get(previous),'','old fallback is invalidated on explicit reset');
 assert.equal(store.get('veilpoint.story.ch01'),story,'BR resets must leave CH01 independent');
});

test('BR still restores a validated backup when newest checkpoint is malformed',()=>{
 const key='veilpoint.brCheckpoint.v1',previous='veilpoint.brCheckpoint.v1.previous';
 const store=new Map(),original=boot({store,windows:true});
 original.node('play').click();
 original.frame(1000/60);
 original.emit('blur');
 const backup=store.get(key);
 assert.ok(backup);
 store.set(key,'{interrupted-save');
 store.set(previous,backup);
 const reopened=boot({store,windows:true});
 assert.match(reopened.node('play').textContent,/저장 경기 이어하기/);
 reopened.node('play').click();reopened.frame(1000/60);
 assert.equal(reopened.game.status,'playing');
 assert.equal(reopened.game.seed,JSON.parse(backup).seed);
 assert.notEqual(store.get(key),'{interrupted-save','valid backup can safely repair primary');
});


test('BR old active Windows tab New Match cannot delete newer tab checkpoint or field bookmark',()=>{
 const key='veilpoint.brCheckpoint.v1',backup=key+'.previous';
 const store=new Map();
 const first=boot({store,windows:true});
 first.node('play').click();first.frame(1000/60);
 const oldRaw=store.get(key);
 assert.ok(oldRaw);
 const newer=boot({store,windows:true});
 newer.node('play').click();
 newer.emit('keydown',{code:'KeyW'});
 newer.frame(1000/60);newer.frame(2000/60);
 newer.emit('keyup',{code:'KeyW'});
 newer.emit('blur');
 const latest=store.get(key);
 assert.ok(latest);assert.notEqual(latest,oldRaw,
   'newer PC session must write a different valid 60Hz world generation');
 const previous=store.get(backup);
 store.set('veilpoint.brFieldBookmark.v1','newer-tab-bookmark');
 store.set('veilpoint.brLastResult.v1','newer-tab-last-result');
 first.node('newMatch').click();first.frame(2000/60);
 assert.equal(first.game.status,'playing');
 assert.match(first.game.message,/OTHER PC TAB UPDATED.*MEMORY-ONLY MATCH/,
   'older tab must clearly identify the protected temporary BR session');
 assert.equal(store.get(key),latest,'older tab must not delete newer saved round');
 assert.equal(store.get(backup),previous,'older tab must not invalidate backup');
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),'newer-tab-bookmark');
 assert.equal(store.get('veilpoint.brLastResult.v1'),'newer-tab-last-result');
 first.frame(2000/60);first.emit('blur');
 assert.equal(store.get(key),latest,'temporary round cannot auto-save over another tab');
 const reload=boot({store,windows:true});
 reload.node('play').click();reload.frame(1000/60);
 assert.equal(reload.game.seed,JSON.parse(latest).seed,
   'a fresh Windows tab still restores the protected arena');
});

test('BR stale startup menu New Match preserves unseen valid round, fresh menu may explicitly reset',()=>{
 const key='veilpoint.brCheckpoint.v1',store=new Map();
 const initial=boot({store,windows:true});
 initial.node('play').click();initial.frame(1000/60);initial.emit('blur');
 const menu=boot({store,windows:true});
 const other=boot({store,windows:true});
 other.node('play').click();
 other.emit('keydown',{code:'KeyW'});
 other.frame(1000/60);other.frame(2000/60);
 other.emit('keyup',{code:'KeyW'});other.emit('blur');
 const latest=store.get(key);
 menu.node('newMatch').click();menu.frame(1000/60);
 assert.match(menu.game.message,/MEMORY-ONLY MATCH/);
 assert.equal(store.get(key),latest);
 const fresh=boot({store,windows:true});
 fresh.node('newMatch').click();fresh.frame(1000/60);
 assert.equal(fresh.game.status,'playing');
 assert.notEqual(store.get(key),latest,
   'user with current validated generation can still explicitly start a new durable round');
});


test('BR New Match stays memory-only when an offline storage shim ignores slot deletion',()=>{
 const key='veilpoint.brCheckpoint.v1',backup=key+'.previous';
 class IgnoringStore extends Map{
  ignoreDeletes=false;
  set(name,value){
   if(this.ignoreDeletes&&[key,backup].includes(name)&&value==='')return this;
   return super.set(name,value);
  }
 }
 const store=new IgnoringStore(),app=boot({store,windows:true});
 app.node('play').click();app.frame(1000/60);
 const prior=store.get(key);
 assert.ok(prior,'a normal playable round must have been saved');
 store.set(backup,prior);
 store.ignoreDeletes=true;
 app.node('newMatch').click();app.frame(2000/60);
 assert.equal(app.game.status,'playing','a failed reset does not lock the BR menu');
 assert.equal(store.get(key),prior,'the existing valid primary is never overwritten');
 assert.equal(store.get(backup),prior,'the previous generation is preserved');
 assert.match(app.game.message,/RESET NOT VERIFIED.*MEMORY-ONLY/,
   'the temporary new round explains why autosave cannot run');
 assert.match(app.node('message').textContent,/SAVE FAILED.*PROGRESS ONLY IN THIS TAB/,
   'a durable HUD warning remains after the transient game message expires');
 app.frame(5000/60);app.emit('blur');
 assert.equal(store.get(key),prior,'a later fixed-step pause cannot overwrite old progress');
 const newWindow=boot({store,windows:true});
 newWindow.node('play').click();newWindow.frame(1000/60);
 assert.equal(newWindow.game.seed,JSON.parse(prior).seed,
   'a fresh PC window still restores the previous verified arena');
 store.ignoreDeletes=false;
 app.node('newMatch').click();app.frame(6000/60);
 assert.equal(app.game.status,'playing');
 assert.notEqual(store.get(key),prior,'successful explicit reset creates a fresh durable match');
});

test('BR New Match refuses destructive reset when backup clear throws',()=>{
 const key='veilpoint.brCheckpoint.v1',backup=key+'.previous';
 class DeniedBackup extends Map{
  deny=false;
  set(name,value){
   if(this.deny&&name===backup&&value==='')throw new Error('quota denied');
   return super.set(name,value);
  }
 }
 const store=new DeniedBackup(),app=boot({store,windows:true});
 app.node('play').click();app.frame(1000/60);
 const raw=store.get(key);store.set(backup,raw);
 store.deny=true;
 app.node('newMatch').click();app.frame(2000/60);
 assert.equal(store.get(key),raw,'a denied backup rotation cannot delete the primary');
 assert.equal(store.get(backup),raw);
 assert.match(app.node('message').textContent,/SAVE FAILED/,
   'Windows HUD must identify the session as temporary');
 store.deny=false;
 app.node('newMatch').click();app.frame(3000/60);
 assert.notEqual(store.get(key),raw);
 assert.equal(store.get(backup),'','successful reset invalidates the old backup');
});


test('BR Windows CH01 mode link requires verified paused save before leaving an active arena',()=>{
 const key='veilpoint.brCheckpoint.v1',store=new Map();
 const app=boot({store,windows:true}),navigations=[];
 app.context.location={assign(dest){navigations.push(dest);}};
 let unstartedPrevented=false;
 app.node('storyModeLink').dispatch('click',{preventDefault(){unstartedPrevented=true;}});
 assert.equal(unstartedPrevented,false,'normal menu link works before the match');
 app.node('play').click();app.frame(1000/60);
 const live=app.game;
 let hiddenPrevented=false;
 app.node('storyModeLink').dispatch('click',{preventDefault(){hiddenPrevented=true;}});
 assert.equal(hiddenPrevented,true,'hidden link must not navigate while the 60Hz world is running');
 assert.deepEqual(navigations,[]);
 assert.equal(app.game,live);
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(live.player.charges,47);
 app.emit('keydown',{code:'Escape'});
 const lastDurable=store.get(key);
 assert.ok(lastDurable);
 const originalSet=store.set.bind(store);
 store.set=(name,value)=>{
  if(name===key)throw new Error('quota denied');
  return originalSet(name,value);
 };
 let pausedPrevented=false;
 app.node('storyModeLink').dispatch('click',{preventDefault(){pausedPrevented=true;}});
 assert.equal(pausedPrevented,true,'paused active link owns explicit save/navigation');
 assert.deepEqual(navigations,[],'a denied save cannot navigate to CH01');
 assert.equal(app.node('play').textContent,'이어하기','saved-menu state is not forged');
 assert.equal(store.get(key),lastDurable);
 assert.match(app.node('selector-.tagline').textContent,/메뉴로 나가지 않았습니다/);
 store.set=originalSet;
 app.node('storyModeLink').click();
 assert.deepEqual(navigations,['story.html']);
 assert.equal(app.node('play').textContent,'저장 경기 이어하기');
 assert.equal(JSON.parse(store.get(key)).player.charges,47);
 const restored=boot({store,windows:true});
 restored.node('play').click();restored.frame(1000/60);
 assert.equal(restored.game.player.charges,47,
   'BR round stays restorable after switching to story mode');
});

test('BR CH01 link never overwrites a newer active checkpoint from a second PC tab',()=>{
 const key='veilpoint.brCheckpoint.v1',store=new Map(),navigations=[];
 const old=boot({store,windows:true});
 old.context.location={assign(dest){navigations.push(dest);}};
 old.node('play').click();old.frame(1000/60);
 old.emit('keydown',{code:'Escape'});
 const fresh=boot({store,windows:true});
 fresh.node('play').click();
 fresh.emit('keydown',{code:'KeyW'});
 fresh.frame(1000/60);fresh.frame(2000/60);
 fresh.emit('keyup',{code:'KeyW'});fresh.emit('blur');
 const latest=store.get(key);
 old.node('storyModeLink').click();
 assert.deepEqual(navigations,[]);
 assert.equal(store.get(key),latest);
 assert.equal(old.node('play').textContent,'이어하기');
 assert.match(old.node('selector-.tagline').textContent,/다른 창에서 저장된 경기/);
});

test('BR story navigation reports a failed browser redirect after successful checkpoint save',()=>{
 const key='veilpoint.brCheckpoint.v1',store=new Map(),app=boot({store,windows:true});
 app.context.location={assign(){throw new Error('navigation denied');}};
 app.node('play').click();app.frame(1000/60);app.emit('keydown',{code:'Escape'});
 app.node('storyModeLink').click();
 assert.equal(app.node('play').textContent,'저장 경기 이어하기');
 assert.match(app.node('selector-.tagline').textContent,/스토리 메뉴로 이동하지 못했습니다/);
 assert.ok(store.get(key),'redirect error must never discard durable match data');
});


test('BR paused Windows match exposes clickable graphics controls and preserves the current fixed-step world',()=>{
 const app=boot({windows:true});
 app.node('graphicsPanel').classList.add('hidden');
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/<button[^>]*id="graphicsPauseOpen"[^>]*aria-controls="graphicsPanel"[^>]*aria-expanded="false"/);
 assert.match(html,/ESC 일시정지[^<]*그래픽 설정[^<]*G키/);
 app.node('play').click();app.frame(1000/60);
 const game=app.game,elapsed=game.elapsed,charges=game.player.charges;
 assert.equal(app.context.document.pointerLockElement,app.node('scene'));
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.context.document.pointerLockElement,null,'Escape must release PC mouse pointer');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.node('graphicsPauseOpen').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
 assert.equal(app.node('graphicsPauseOpen').getAttribute('aria-expanded'),'true');
 assert.equal(app.node('graphicsOpen').getAttribute('aria-expanded'),'true');
 assert.equal(app.context.document.activeElement,app.node('graphicsClose'));
 app.emit('keydown',{code:'Space'});
 for(let frame=2;frame<=150;frame++)app.frame(frame*1000/60);
 assert.equal(game.elapsed,elapsed,'settings must freeze the original PC round');
 assert.equal(game.player.charges,charges,'the settings dialog cannot fire resources');
 app.node('graphicsClose').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 assert.equal(app.node('graphicsPauseOpen').getAttribute('aria-expanded'),'false');
 assert.equal(app.node('graphicsOpen').getAttribute('aria-expanded'),'false');
 assert.equal(app.context.document.activeElement,app.node('graphicsPauseOpen'),
   'close restores keyboard focus to the actual pause-menu opener');
 app.frame(151*1000/60);
 assert.equal(game.elapsed,elapsed,'closing graphics cannot silently unpause');
 app.node('play').click();
 app.frame(152*1000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.context.document.pointerLockElement,app.node('scene'));
 assert.equal(app.game,game,'resume must preserve the same simulation and finite inventory');
 assert.ok(game.elapsed>elapsed);
});

test('BR G shortcut can open and close PC graphics dialog with mouse captured, including focused buttons',()=>{
 const app=boot({windows:true});
 app.node('graphicsPanel').classList.add('hidden');
 app.node('play').click();app.frame(1000/60);
 const world=app.game,elapsed=world.elapsed;
 app.emit('keydown',{code:'KeyG',target:{tagName:'CANVAS'}});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.context.document.pointerLockElement,null);
 assert.equal(app.context.document.activeElement,app.node('graphicsClose'));
 app.emit('keydown',{code:'KeyG',target:{tagName:'BUTTON'}});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true,
   'G must work even with a focused graphics button');
 assert.equal(app.context.document.activeElement,app.node('graphicsPauseOpen'));
 app.emit('keydown',{code:'KeyG',repeat:true,target:{tagName:'BUTTON'}});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 app.frame(3000);
 assert.equal(world.elapsed,elapsed);
 app.node('play').click();app.frame(3000+1000/60);
 assert.equal(app.game,world);
 assert.ok(world.elapsed>elapsed);
});

test('BR pre-match settings Escape closes only settings and never starts the game',()=>{
 const app=boot({windows:true});
 app.node('graphicsPanel').classList.add('hidden');
 app.node('graphicsPauseOpen').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,app.node('graphicsClose'));
 app.emit('keydown',{code:'Escape',target:{tagName:'BUTTON'}});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,app.node('graphicsPauseOpen'));
 assert.equal(app.context.document.pointerLockElement,null);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
});

test('BR Escape dismisses open settings first; second Escape explicitly resumes without losing match',()=>{
 const app=boot({windows:true});
 app.node('graphicsPanel').classList.add('hidden');
 app.node('play').click();app.frame(1000/60);
 const world=app.game,elapsed=world.elapsed;
 app.node('graphicsOpen').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.emit('keydown',{code:'Escape',target:{tagName:'BUTTON'}});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.frame(2000);
 assert.equal(world.elapsed,elapsed);
 app.emit('keydown',{code:'Escape',target:{tagName:'BUTTON'}});
 app.frame(2000+1000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.ok(world.elapsed>elapsed);
});


test('Windows BR benchmark exposes readable local JSON without Blob downloads and cannot export active data',()=>{
 const app=boot({windows:true});
 app.node('graphicsPanel').classList.add('hidden');
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/id="benchmarkCopy"[^>]*disabled/);
 assert.match(html,/id="benchmarkRawJson"[^>]*readonly/);
 assert.equal(app.node('benchmarkCopy').disabled,true,'unstarted benchmark has no evidence to copy');
 app.node('benchmarkCopy').click();
 assert.equal(app.node('benchmarkRawJson').value,'','no fabricated results before measurement');
 app.node('benchmarkStart').click();
 app.node('play').click();
 for(let i=1;i<=345;i++)app.frame(i*1000/60);
 assert.equal(app.node('benchmarkCopy').disabled,true,'running sample is not a report');
 app.node('benchmarkStop').click();
 assert.equal(app.node('benchmarkCopy').disabled,false,'partial result is available');
 const game=app.game,progress=game.elapsed;
 app.node('benchmarkCopy').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false,
   'copy can reveal the real panel even if the game was pointer locked');
 assert.equal(app.node('overlay').classList.contains('hidden'),false,
   'showing JSON pauses the 60Hz world before revealing input controls');
 assert.equal(app.context.document.pointerLockElement,null);
 const raw=app.node('benchmarkRawJson');
 assert.equal(raw.classList.contains('hidden'),false);
 const result=JSON.parse(raw.value);
 assert.equal(result.schema,'veilpoint.browser-benchmark.v1');
 assert.equal(result.completed,false,'manual stop must remain a partial report');
 assert.equal(result.measurementStatus,'partial');
 assert.ok(result.renderedFrameCount>=2,'actual rendered frames were observed');
 assert.equal(result.mode,'offline-battle-royale');
 assert.equal(app.node('benchmarkRawLabel').classList.contains('hidden'),false);
 assert.equal(app.context.document.activeElement,raw);
 for(let i=346;i<=365;i++)app.frame(i*1000/60);
 assert.equal(app.game,game);
 assert.equal(game.elapsed,progress,'copying JSON cannot advance the paused match');
 assert.ok(app.node('benchmarkExportHelp').textContent.includes('Ctrl+C'));
 app.node('benchmarkStart').click();
 assert.equal(app.node('benchmarkRawJson').value,'','a new run cannot expose stale prior measurements');
 assert.equal(app.node('benchmarkRawJson').classList.contains('hidden'),true);
 assert.equal(app.node('benchmarkCopy').disabled,true);
});

test('BR blocked browser Blob URL leaves measurable partial JSON available without discarding save',()=>{
 const store=new Map(),app=boot({windows:true,store});
 app.node('graphicsPanel').classList.add('hidden');
 app.node('benchmarkStart').click();
 app.node('play').click();
 for(let i=1;i<=345;i++)app.frame(i*1000/60);
 const current=app.game;
 const savedBefore=store.get('veilpoint.brCheckpoint.v1');
 app.node('benchmarkStop').click();
 assert.equal(app.node('benchmarkQuickExport').classList.contains('hidden'),false);
 app.context.Blob=Blob;
 app.context.URL={createObjectURL(){throw new Error('Blob URLs blocked by browser policy');},
  revokeObjectURL(){}};
 app.node('benchmarkQuickExport').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false,
   'quick-export failure opens the settings panel to show selectable JSON');
 const result=JSON.parse(app.node('benchmarkRawJson').value);
 assert.equal(result.completed,false);
 assert.equal(result.measurementStatus,'partial');
 assert.ok(result.renderedFrameCount>=2);
 assert.match(app.node('benchmarkExportHelp').textContent,/브라우저가 차단/);
 assert.equal(app.context.document.activeElement,app.node('benchmarkRawJson'));
 assert.equal(app.context.document.pointerLockElement,null);
 assert.equal(app.game,current);
 assert.equal(store.get('veilpoint.brCheckpoint.v1')!==null,true,
   'fallback may save the current world but cannot discard durable progress');
 assert.ok(savedBefore,'the real match has an initial checkpoint');
});

test('BR native benchmark JSON download remains available without opening raw fallback',()=>{
 const app=boot({windows:true});
 app.node('graphicsPanel').classList.add('hidden');
 app.node('benchmarkStart').click();
 app.node('play').click();
 for(let i=1;i<=345;i++)app.frame(i*1000/60);
 app.node('benchmarkStop').click();
 let name=null;
 app.context.Blob=Blob;
 app.context.URL={createObjectURL:()=> 'blob:veilpoint-local',revokeObjectURL:()=>{}};
 app.context.document.body={appendChild(){}};
 app.context.document.createElement=()=>({click(){name=this.download;},remove(){}});
 app.node('benchmarkQuickExport').click();
 assert.equal(name,'veilpoint-browser-benchmark-partial.json');
 assert.equal(app.node('benchmarkRawJson').classList.contains('hidden'),true,
   'successful Blob download leaves manual fallback hidden');
 assert.equal(app.node('benchmarkRawJson').value,'',
   'successful normal file download does not produce a redundant raw copy panel');
});
