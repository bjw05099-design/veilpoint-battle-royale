'use strict';
// Actual BR browser controller exercised in a deterministic Node DOM/WebGL stub.
// This does not replace real desktop/mobile browser or GPU acceptance testing.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

function boot({touch = false, store = new Map(), pointerLock = 'granted'} = {}) {
  const nodes = new Map(), listeners = new Map();
  let now = 0, frameCallback = null, latestGame = null;
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
      classList: classList(),
      getContext: () => ctx,
      getBoundingClientRect: () => ({x: 0, y: 0, width: 88, height: 88}),
      setPointerCapture() {},
      addEventListener: (key, callback) => add(events, key, callback),
      dispatch: (key, event) => emit(events, key, event),
      click() {this.dispatch('click');},
      requestPointerLock() {
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
    pointerLockElement: null,
    getElementById: node,
    querySelector: selector => {
      if (!selectors.has(selector)) selectors.set(selector, node('selector-' + selector));
      return selectors.get(selector);
    },
    addEventListener: (key, callback) => add(listeners, key, callback),
    exitPointerLock() {this.pointerLockElement = null;}
  };
  const context = {
    document,
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value))
    },
    performance: {now: () => now},
    matchMedia: () => ({matches: touch}),
    requestAnimationFrame: callback => {frameCallback = callback;},
    setTimeout: () => 1,
    addEventListener: (key, callback) => add(listeners, key, callback),
    console,
    VeilpointRenderer: class {
      constructor(canvas) {this.canvas = canvas;this.gpuTimer = {supported: false};}
      setGraphicsQuality() {}
      draw(game) {latestGame = game;}
      setAdaptiveResolution() {}
    }
  };
  context.globalThis = context;
  for (const filename of ['src/simulation.js', 'src/visibility.js', 'src/performance.js',
    'src/graphics.js', 'src/clock.js', 'src/fps.js', 'src/app.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'),
      context, {filename, timeout: 1500});
  }
  return {
    node, store, context, selectors,
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
 app.emit('keydown',{code:'KeyE'});
 assert.equal(g.player.charges,ammo);
 wrong.x=100;wrong.z=100;
 const right=g.loot.find(item=>item.weaponId==='carbine');
 right.x=0;right.z=0;
 app.frame(600);
 assert.match(app.node('pickupPrompt').textContent,/CARBINE/);
 app.emit('keydown',{code:'KeyE'});
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
 app.emit('keydown',{code:'KeyE'});
 assert.equal(g.player.charges,12);
 assert.equal(ammo.picked,false);
 ammo.x=1.4;
 app.frame(600);
 assert.match(app.node('pickupPrompt').textContent,/CARBINE/);
 app.emit('keydown',{code:'KeyE'});
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
  else app.emit('keydown',{code:'KeyE'});
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
  for(const code of ['Space','KeyR','KeyE','KeyH','KeyW'])
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
  app.emit('keydown',{code:'KeyE'});
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
