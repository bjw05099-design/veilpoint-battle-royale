'use strict';
// Exercises the actual browser client script with a deterministic local server adapter.
// This is a DOM/network mock, not a real-browser or public-internet playtest.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {TeamMatch} = require('../src/team-match.cjs');
const clientSource = fs.readFileSync(path.join(__dirname, '../src/team-client.js'), 'utf8');
const Desktop = require('../src/desktop-controls.js');

function backend() {
  const match = new TeamMatch({now: () => 0});
  let id = 0;
  const requests = [];
  async function fetchLocal(route, options = {}) {
    const token = options.headers?.['X-Player-Token'];
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({route, token, body});
    try {
      let result;
      if (route === '/join') {
        const newToken = (++id).toString(16).padStart(48, '0');
        result = {token: newToken, ...match.join(newToken, body.name)};
      } else if (route === '/state') result = match.snapshot(token);
      else if (route === '/command') {
        result = match.command(token, body);
        if (body.type === 'fire' && result.ok) result = {ok: true, ammo: result.ammo};
      }
      else throw new RangeError('unknown_route');
      return {ok: true, status: 200, json: async () => result};
    } catch (error) {
      return {ok: false, status: 400, json: async () => ({error: error.message})};
    }
  }
  return {match, requests, fetchLocal};
}

function boot(server, storage = new Map()) {
  const nodes = new Map(), documentListeners = new Map(), windowListeners = new Map();
  const intervals = [];
  let monotonicMs = 1000, timerId = 0;
  const timers = new Map();
  const ctx = {};
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill']) {
    ctx[name] = () => {};
  }
  const on = (map, name, callback) => map.set(name, [...(map.get(name) || []), callback]);
  const emit = (map, name, event = {}) => {
    for (const fn of map.get(name) || []) fn({preventDefault() {}, ...event});
  };
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const events = new Map();
    const value = {
      id, value: id === 'name' ? 'Player' : '', textContent: '', disabled: false,
      dataset: {}, width: 500, height: 500, getContext: () => ctx,
      getBoundingClientRect: () => ({left: 0, top: 0, width: 500, height: 500}),
      focus() {document.activeElement = this;},
      blur() {if(document.activeElement === this)document.activeElement = null;},
      addEventListener: (name, callback) => on(events, name, callback),
      dispatch: (name, event) => emit(events, name, event),
      click() {this.dispatch('click');}
    };
    nodes.set(id, value);
    return value;
  }
  const document = {
    hidden: false,
    activeElement: null,
    getElementById: node,
    querySelectorAll: () => [],
    addEventListener: (name, callback) => on(documentListeners, name, callback)
  };
  const window = {
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    VeilpointDesktopControls: Desktop,
    addEventListener: (name, callback) => on(windowListeners, name, callback)
  };
  vm.runInNewContext(clientSource, {
    document, window, fetch: server.fetchLocal, AbortController,
    setInterval: callback => (intervals.push(callback), intervals.length),
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, {callback, at: monotonicMs + delay});
      return id;
    },
    clearTimeout: id => timers.delete(id),
    performance: {now: () => monotonicMs},
    console
  }, {filename: 'src/team-client.js', timeout: 1500});
  return {
    node, storage, document,
    doc: (name, event) => emit(documentListeners, name, event),
    blur: () => emit(windowListeners, 'blur'),
    focus: () => emit(windowListeners, 'focus'),
    storageEvent: event => emit(windowListeners, 'storage', event),
    mouseUp: () => emit(windowListeners, 'mouseup', {button: 0}),
    hide: () => {document.hidden = true;emit(documentListeners, 'visibilitychange');},
    show: () => {document.hidden = false;emit(documentListeners, 'visibilitychange');},
    poll: () => intervals[1](),
    heartbeat: () => intervals[0](),
    advanceTime: ms => {
      monotonicMs += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= monotonicMs) {
          timers.delete(id);
          timer.callback();
        }
      }
    }
  };
}
async function settle() {
  for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
}

test('two client UIs join, ready, send bounded movement and release capture on blur', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('name').value = 'Alpha'; b.node('name').value = 'Bravo';
  a.node('join').click(); b.node('join').click();
  await settle();
  assert.equal(server.match.players.size, 2);
  assert.equal(a.node('join').disabled, true);
  assert.equal(b.node('join').disabled, true);
  a.node('ready').click(); b.node('ready').click();
  await settle();
  assert.equal(server.match.phase, 'playing');
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  assert.match(token, /^[a-f0-9]{48}$/);
  const player = server.match.players.get(token);
  a.doc('keydown', {code: 'KeyA'});
  await settle();
  assert.equal(player.direction.x, -1);
  assert.equal(player.facing.x, -1);
  a.doc('keyup', {code: 'KeyA'});
  await settle();
  assert.equal(player.direction.x, 0);
  assert.equal(player.facing.x, -1, 'stopping preserves direction of sight');
  a.node('capture').dispatch('pointerdown');
  await settle();
  assert.equal(player.capturing, true);
  a.blur();
  await settle();
  assert.equal(player.capturing, false);
  const seq = player.seq;
  a.heartbeat(); await settle();
  assert.equal(player.seq, seq, 'unfocused PC window cannot renew its server session');
  a.focus(); await settle();
  assert.equal(player.seq, seq + 1, 'returning focus renews with validated server sequence');
});

test('tab refresh resumes the same player and clears ghost movement and capture', async () => {
  const server = backend(), storage = new Map();
  const first = boot(server, storage), other = boot(server);
  first.node('join').click(); other.node('join').click();
  await settle();
  first.node('ready').click(); other.node('ready').click();
  await settle();
  await first.poll(); await settle();
  const token = storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  first.doc('keydown', {code: 'KeyD'});
  first.node('capture').dispatch('pointerdown');
  await settle();
  assert.equal(player.direction.x, 1);
  assert.equal(player.capturing, true);
  const previousSeq = player.seq;
  const refreshed = boot(server, storage);
  await settle();
  assert.equal(server.match.players.size, 2, 'refresh must not create a third identity');
  assert.equal(refreshed.node('join').disabled, true);
  assert.equal(player.direction.x, 0);
  assert.equal(player.capturing, false);
  assert.equal(player.seq, previousSeq + 1, 'refresh clears all intents in one sequenced command');
  assert.equal(server.requests.filter(r => r.token === token && r.body?.type === 'resetInput').length, 1);
  await refreshed.poll(); await settle();
  assert.match(refreshed.node('status').textContent, /점령/);
});

test('expired tab token fails closed and permits a new join', async () => {
  const server = backend();
  const storage = new Map([['veilpoint.team.tabSession', 'a'.repeat(48)]]);
  const ui = boot(server, storage);
  await settle();
  assert.equal(storage.has('veilpoint.team.tabSession'), false);
  assert.equal(ui.node('join').disabled, false);
  assert.match(ui.node('status').textContent, /만료/);
  ui.node('join').click();
  await settle();
  assert.equal(server.match.players.size, 1);
});

test('browser keyboard and touch send combat intent without target or damage injection', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.doc('keydown', {code: 'KeyF'});
  await settle();
  assert.equal(player.ammo, 11);
  await a.poll();await settle();
  assert.match(a.node('status').textContent, /발사 완료/);
  assert.doesNotMatch(a.node('status').textContent, /명중 확인/);
  assert.ok(server.requests.some(r => r.body?.type === 'fire' &&
    Object.keys(r.body).sort().join(',') === 'seq,type'));
  a.doc('keydown', {code: 'KeyF', repeat: true});
  await settle();
  assert.equal(player.ammo, 11, 'held-key repeat must not generate extra commands');
  a.node('reload').click();
  await settle();
  assert.equal(player.reloadTicks, 90);
  await a.poll(); await settle();
  assert.equal(a.node('ammo').textContent, '11 / 24');
  assert.match(a.node('reloadState').textContent, /재장전/);
  assert.ok(server.requests.some(r => r.body?.type === 'reload'));
});

test('suspended tab releases intent and held inputs renew before server lease expiry', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.doc('keydown', {code: 'KeyD'});
  a.node('capture').dispatch('pointerdown');
  await settle();
  const before = server.requests.filter(r => r.token === token && r.body?.type === 'move').length;
  const beforeCapture = server.requests.filter(r => r.token === token && r.body?.type === 'capture').length;
  for (let i = 0; i < 25; i++) server.match.step();
  await a.poll();await settle();
  assert.ok(server.requests.filter(r => r.token === token && r.body?.type === 'move').length > before,
    'held movement is periodically renewed');
  assert.ok(server.requests.filter(r => r.token === token && r.body?.type === 'capture').length > beforeCapture,
    'held capture is periodically renewed');
  a.hide();await settle();
  assert.deepEqual({...player.direction}, {x: 0, z: 0});
  assert.equal(player.capturing, false);
  for (let i = 0; i < 100; i++) server.match.step();
  assert.deepEqual({...player.direction}, {x: 0, z: 0});
});

test('rapid double join never allocates two server identities from one tab', async () => {
  const server = backend(), a = boot(server);
  a.node('join').click();
  a.node('join').click();
  await settle();
  assert.equal(server.match.players.size, 1);
  assert.equal(server.requests.filter(r => r.route === '/join').length, 1);
  assert.equal(a.node('join').disabled, true);
});

test('overlapping state polls are serialized to prevent stale UI snapshots', async () => {
  const server = backend(), ui = boot(server);
  ui.node('join').click();
  await settle();
  const before = server.requests.filter(r => r.route === '/state').length;
  await Promise.all([ui.poll(), ui.poll(), ui.poll()]);
  await settle();
  assert.equal(server.requests.filter(r => r.route === '/state').length, before + 1);
  await ui.poll();await settle();
  assert.equal(server.requests.filter(r => r.route === '/state').length, before + 2,
    'polling resumes after the previous request settles');
});

test('mouse/touch map aiming sends only normalized direction and preserves strafing',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const p=server.match.players.get(token);
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'touch'});
 await settle();
 assert.equal(p.aiming,true);
 assert.ok(p.facing.x>0&&p.facing.z<0);
 const aim={...p.facing};
 a.doc('keydown',{code:'KeyA'});await settle();
 assert.equal(p.direction.x,-1);
 assert.deepEqual({...p.facing},aim);
 const cmd=server.requests.find(r=>r.token===token&&r.body?.type==='aim');
 assert.deepEqual(Object.keys(cmd.body).sort(),['direction','seq','type']);
 assert.ok(Math.abs(Math.hypot(cmd.body.direction.x,cmd.body.direction.z)-1)<1e-12);
 assert.equal('target' in cmd.body,false);
});

test('team pointer leave releases aim and restores keyboard-facing without stale override',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const p=server.match.players.get(token);
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();assert.equal(p.aiming,true);
 a.doc('keydown',{code:'KeyA'});await settle();
 assert.equal(p.direction.x,-1);
 a.node('arena').dispatch('pointerleave');await settle();
 assert.equal(p.aiming,false);
 assert.deepEqual({...p.facing},{x:-1,z:0});
 assert.ok(server.requests.some(r=>r.token===token&&r.body?.type==='aimRelease'));
 a.doc('keydown',{code:'KeyW'});await settle();
 assert.ok(p.facing.z<0,'keyboard-only direction must regain control after pointer leaves');
});

test('team tab refresh releases a stale server aim override before keyboard input',async()=>{
 const server=backend(),storage=new Map(),first=boot(server,storage),other=boot(server);
 first.node('join').click();other.node('join').click();await settle();
 first.node('ready').click();other.node('ready').click();await settle();
 await first.poll();await other.poll();await settle();
 const token=storage.get('veilpoint.team.tabSession');
 const p=server.match.players.get(token);
 first.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();assert.equal(p.aiming,true);
 // Simulate a reload without blur or pointerleave: old JS context vanishes.
 const refreshed=boot(server,storage);await settle();
 assert.equal(p.aiming,false,'resumed tab must clear a stale server-side aim lock');
 assert.deepEqual({...p.direction},{x:0,z:0});
 await refreshed.poll();await settle();
 refreshed.doc('keydown',{code:'KeyA'});await settle();
 assert.deepEqual({...p.facing},{x:-1,z:0});
 assert.ok(server.requests.some(r=>r.token===token&&r.body?.type==='resetInput'));
});

test('stationary pointer aim renews at bounded server ticks, not every poll',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();
 const count=()=>server.requests.filter(r=>r.token===token&&r.body?.type==='aim').length;
 const before=count();
 await a.poll();await settle();
 assert.equal(count(),before,'same tick must not resend identical aim');
 for(let i=0;i<25;i++)server.match.step();
 await a.poll();await settle();
 assert.equal(count(),before+1,'held stationary aim is renewed before server lease expiry');
 assert.equal(server.match.players.get(token).aiming,true);
 a.hide();await settle();
 assert.equal(server.match.players.get(token).aiming,false,'hidden tab releases renewed aim');
});

test('team browser exposes only own server-derived stress and toggles reload accessibility', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  const aToken = a.storage.get('veilpoint.team.tabSession');
  const bToken = b.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(aToken);
  const opponent = server.match.players.get(bToken);
  a.node('assist').click();
  await settle();
  assert.equal(player.reloadAssist, true);
  assert.ok(server.requests.some(r => r.token === aToken && r.body?.type === 'assist' &&
    r.body.enabled === true && Object.keys(r.body).sort().join(',') === 'enabled,seq,type'));
  player.x = 0; player.z = 0; opponent.x = 5; opponent.z = 0;
  b.node('fire').click();
  await settle();
  for (let i = 0; i < 18; i++) server.match.step();
  b.node('fire').click();
  await settle();
  assert.ok(player.stress >= 60);
  await a.poll(); await settle();
  assert.ok(Number(a.node('stress').textContent) >= 60);
  assert.match(a.node('assist').textContent, /ON/);
  a.node('fire').click(); await settle();
  a.node('reload').click(); await settle();
  assert.equal(player.reloadTicks, 90, 'assist prevents hesitation but not ordinary reload time');
  await a.poll(); await settle();
  assert.match(a.node('reloadState').textContent, /재장전 중/);
  a.node('assist').click(); await settle();
  assert.equal(player.reloadAssist, false);
});

test('two local clients render identical announced mist and reduced server visibility', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();
  await settle();
  a.node('ready').click();b.node('ready').click();
  await settle();
  const [red, blue] = [...server.match.players.values()];
  red.x = -5.5;red.z = 0;blue.x = 5.5;blue.z = 0;
  for (let i = 0; i < 300; i++) server.match.step();
  await a.poll();await b.poll();await settle();
  assert.match(a.node('weather').textContent, /접근 예보/);
  assert.equal(a.node('weather').textContent, b.node('weather').textContent);
  for (let i = 0; i < 300; i++) server.match.step();
  await a.poll();await b.poll();await settle();
  assert.match(a.node('weather').textContent, /시야 제한/);
  assert.equal(a.node('weather').textContent, b.node('weather').textContent);
  assert.equal(server.match.snapshot([...server.match.players.keys()][0]).visible.length, 1);
  assert.equal(server.match.snapshot([...server.match.players.keys()][1]).visible.length, 1);
});

test('team clients expose matching gradual sight range without disclosing hidden opponents', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  const [red, blue] = [...server.match.players.values()];
  red.x = -5.5; red.z = 0; blue.x = 5.5; blue.z = 0;
  const toTick = async tick => {
    while (server.match.ticks < tick) server.match.step();
    await a.poll(); await b.poll(); await settle();
    assert.equal(a.node('weather').textContent, b.node('weather').textContent);
  };
  await toTick(450);
  assert.ok(a.node('weather').textContent.includes('44.5m'));
  assert.equal(server.match.snapshot([...server.match.players.keys()][0]).visible.length, 2);
  await toTick(600);
  assert.ok(a.node('weather').textContent.includes('9.0m'));
  assert.equal(server.match.snapshot([...server.match.players.keys()][0]).visible.length, 1);
  await toTick(1350);
  assert.ok(a.node('weather').textContent.includes('44.5m'));
  assert.equal(server.match.snapshot([...server.match.players.keys()][0]).visible.length, 2);
});

test('touch aim ends on finger lift, restores movement facing and stops lease renewal', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  const canvas = a.node('arena');
  canvas.dispatch('pointerdown', {pointerType: 'touch', pointerId: 7, clientX: 250, clientY: 155});
  await settle();
  assert.equal(player.aiming, true);
  const aimed = {...player.facing};
  canvas.dispatch('pointerup', {pointerType: 'touch', pointerId: 8});
  await settle();
  assert.equal(player.aiming, true, 'an unrelated finger cannot cancel the active aim');
  canvas.dispatch('pointerup', {pointerType: 'touch', pointerId: 7});
  await settle();
  assert.equal(player.aiming, false, 'lifting the aiming finger must release the server override');
  const aimCount = () => server.requests.filter(r => r.token === token && r.body?.type === 'aim').length;
  const before = aimCount();
  for (let i = 0; i < 25; i++) server.match.step();
  await a.poll(); await settle();
  assert.equal(aimCount(), before, 'released touch must not renew stale aim on polling');
  a.doc('keydown', {code: 'KeyA'}); await settle();
  assert.deepEqual({...player.facing}, {x: -1, z: 0},
    'keyboard facing must work immediately after a touch gesture');
});

test('touch pointercancel releases aim and ignores movement from a different finger', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token), canvas = a.node('arena');
  canvas.dispatch('pointerdown', {pointerType: 'touch', pointerId: 9, clientX: 250, clientY: 155});
  await settle();
  const original = {...player.facing};
  canvas.dispatch('pointermove', {pointerType: 'touch', pointerId: 10,
    clientX: 450, clientY: 250, buttons: 1});
  await settle();
  assert.deepEqual({...player.facing}, original, 'a second finger must not steer the aim');
  canvas.dispatch('pointerleave', {pointerType: 'touch', pointerId: 10});
  canvas.dispatch('pointermove', {pointerType: 'mouse', clientX: 450, clientY: 250});
  canvas.dispatch('pointerdown', {pointerType: 'mouse', clientX: 450, clientY: 250});
  await settle();
  assert.equal(player.aiming, true, 'unrelated pointerleave cannot end the first touch');
  assert.deepEqual({...player.facing}, original, 'hybrid mouse input cannot steal touch aim');
  canvas.dispatch('pointercancel', {pointerType: 'touch', pointerId: 9});
  await settle();
  assert.equal(player.aiming, false, 'OS gesture cancellation must release server aim');
  canvas.dispatch('pointerdown', {pointerType: 'touch', pointerId: 11, clientX: 250, clientY: 155});
  await settle();
  assert.equal(player.aiming, true, 'a fresh touch may aim after cancellation');
  canvas.dispatch('pointerup', {pointerType: 'touch', pointerId: 11});
  await settle();
  assert.equal(player.aiming, false);
});

test('touch aim releases when the active finger leaves the arena without pointerup', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token), canvas = a.node('arena');
  canvas.dispatch('pointerdown', {pointerType: 'touch', pointerId: 21, clientX: 250, clientY: 155});
  await settle();
  assert.equal(player.aiming, true);
  canvas.dispatch('pointerleave', {pointerType: 'touch', pointerId: 21});
  await settle();
  assert.equal(player.aiming, false, 'the originating finger leaving must end the aim lease');
  const releaseCount = server.requests.filter(r => r.token === token && r.body?.type === 'aimRelease').length;
  assert.equal(releaseCount, 1);
  canvas.dispatch('pointerup', {pointerType: 'touch', pointerId: 21});
  await settle();
  assert.equal(server.requests.filter(r => r.token === token && r.body?.type === 'aimRelease').length, 1,
    'pointerup after pointerleave must not send a duplicate release');
});

test('mouse pointerup keeps hover aim, but pointercancel releases it without pointerleave', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token), canvas = a.node('arena');
  canvas.dispatch('pointerdown', {pointerType: 'mouse', pointerId: 1, clientX: 250, clientY: 155});
  await settle();
  assert.equal(player.aiming, true);
  canvas.dispatch('pointerup', {pointerType: 'mouse', pointerId: 1});
  await settle();
  assert.equal(player.aiming, true, 'mouse hover aim must survive normal click release');
  canvas.dispatch('pointercancel', {pointerType: 'mouse', pointerId: 1});
  await settle();
  assert.equal(player.aiming, false, 'OS cancellation must not leave ghost mouse aim');
  const before = server.requests.filter(r => r.token === token && r.body?.type === 'aim').length;
  for (let i = 0; i < 25; i++) server.match.step();
  await a.poll(); await settle();
  assert.equal(server.requests.filter(r => r.token === token && r.body?.type === 'aim').length, before);
});

test('team client obeys saved PC remaps without leaving old aliases active', async () => {
  const server = backend();
  const bindings = {...Desktop.DEFAULT_BINDINGS, forward: 'KeyI', left: 'KeyF', interact: 'KeyT',
    fire: 'KeyY', reload: 'KeyU'};
  const storage = new Map([[Desktop.STORAGE_KEY, JSON.stringify({bindings, sensitivity: 1, invertY: false})]]);
  const a = boot(server, storage), b = boot(server);
  assert.match(a.node('fire').textContent, /KeyY/);
  assert.match(a.node('reload').textContent, /KeyU/);
  assert.match(a.node('capture').textContent, /KeyT/);
  a.node('join').click();b.node('join').click();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await settle();
  const token = storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.doc('keydown', {code: 'KeyW'});await settle();
  assert.equal(player.direction.z, 0, 'old forward key must not move');
  a.doc('keyup', {code: 'KeyW'});
  a.doc('keydown', {code: 'KeyI'});await settle();
  assert.equal(player.direction.z, -1, 'new forward key moves through server validation');
  a.doc('keyup', {code: 'KeyI'});await settle();
  assert.equal(player.direction.z, 0);
  a.doc('keydown', {code: 'KeyE'});await settle();
  assert.equal(player.capturing, false, 'old capture key must be disabled');
  a.doc('keyup', {code: 'KeyE'});
  a.doc('keydown', {code: 'KeyT'});await settle();
  assert.equal(player.capturing, true);
  a.doc('keyup', {code: 'KeyT'});await settle();
  assert.equal(player.capturing, false);
  const before = player.ammo;
  a.doc('keydown', {code: 'KeyF'});await settle();
  assert.equal(player.direction.x, -1, 'remapped F controls movement, never fires');
  assert.equal(player.ammo, before, 'legacy F fire alias cannot override a remapped movement key');
  a.doc('keyup', {code: 'KeyF'});await settle();
  assert.equal(player.direction.x, 0);
  a.doc('keydown', {code: 'KeyY'});await settle();
  assert.equal(player.ammo, before - 1, 'remapped fire consumes server-owned ammo');
  a.doc('keydown', {code: 'KeyY', repeat: true});await settle();
  assert.equal(player.ammo, before - 1, 'OS key repeat cannot send another fire command');
  a.doc('keyup', {code: 'KeyY'});
  a.doc('keydown', {code: 'KeyU'});await settle();
  assert.ok(player.reloadTicks > 0, 'remapped reload begins server-owned reload');
});

test('team PC form focus suppresses fire and keyup still clears previously held movement',async()=>{
  const server=backend(),a=boot(server),b=boot(server);
  a.node('join').click();b.node('join').click();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await b.poll();await settle();
  const token=a.storage.get('veilpoint.team.tabSession');
  const p=server.match.players.get(token);
  a.doc('keydown',{code:'KeyD'});await settle();
  assert.equal(p.direction.x,1);
  a.doc('keyup',{code:'KeyD',target:{tagName:'INPUT'}});await settle();
  assert.equal(p.direction.x,0,'releasing a key after focus change cannot ghost-move');
  a.doc('keydown',{code:'Space',target:{tagName:'SELECT'}});await settle();
  assert.equal(p.ammo,12,'focused settings may not fire server-owned ammunition');
  a.doc('keydown',{code:'Space'});await settle();
  assert.equal(p.ammo,11,'normal PC fire input remains active');
});

test('PC team round start transfers keyboard focus from Ready to the arena only once',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.document.activeElement=a.node('name');
 await a.poll();await settle();
 assert.equal(a.document.activeElement,a.node('name'),'lobby must preserve form focus');
 a.node('ready').click();b.node('ready').click();await settle();
 a.document.activeElement=a.node('ready');
 await a.poll();await settle();
 assert.equal(a.document.activeElement,a.node('arena'));
 const token=a.storage.get('veilpoint.team.tabSession');
 const player=server.match.players.get(token);
 a.doc('keydown',{code:'KeyW',target:a.document.activeElement});
 await settle();assert.equal(player.direction.z,-1);
 a.document.activeElement=a.node('assist');
 await a.poll();await settle();
 assert.equal(a.document.activeElement,a.node('assist'),'normal polls cannot steal deliberate UI focus');
});

test('PC team match rejects pre-round held movement until a fresh gameplay keydown',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const p=server.match.players.get(token);
 a.doc('keydown',{code:'KeyD',target:a.node('arena')});
 a.node('ready').click();b.node('ready').click();await settle();
 assert.equal(server.match.phase,'playing');
 await a.poll();await b.poll();await settle();
 assert.equal(p.direction.x,0,'lobby-held movement must be cleared on phase transition');
 await a.poll();await settle();
 assert.equal(p.direction.x,0,'polling cannot resurrect a stale held key');
 a.doc('keydown',{code:'KeyD',target:a.node('arena')});await settle();
 assert.equal(p.direction.x,1,'fresh physical keydown restores normal movement');
});

test('PC lobby-held capture never auto-activates on the next authoritative round', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  // The PC player presses E before both clients are ready, then keeps it held.
  a.doc('keydown', {code: 'KeyE', target: a.node('arena')});
  assert.equal(player.capturing, false, 'lobby intent is never sent to the server');
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  for (let i = 0; i < 25; i++) server.match.step();
  await a.poll(); await settle();
  assert.equal(player.capturing, false, 'polling cannot revive pre-round capture');
  assert.equal(server.requests.filter(r => r.token === token &&
    r.body?.type === 'capture' && r.body.active).length, 0);
  // OS repeat from the held E must not count as a new physical press.
  a.doc('keydown', {code: 'KeyE', repeat: true, target: a.node('arena')});
  await settle();
  assert.equal(player.capturing, false);
  a.doc('keyup', {code: 'KeyE', target: a.node('arena')});
  a.doc('keydown', {code: 'KeyE', target: a.node('arena')});
  await settle();
  assert.equal(player.capturing, true, 'fresh PC press still captures normally');
  a.doc('keyup', {code: 'KeyE', target: a.node('arena')});
  await settle();
  assert.equal(player.capturing, false, 'release stops capture');
});

test('PC lobby-held movement OS repeat cannot resurrect server movement after round start', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.doc('keydown', {code: 'KeyD', target: a.node('arena')});
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  a.doc('keydown', {code: 'KeyD', repeat: true, target: a.node('arena')});
  await settle();
  assert.equal(player.direction.x, 0, 'OS repeat is not a fresh round movement press');
  a.doc('keyup', {code: 'KeyD', target: a.node('arena')});
  a.doc('keydown', {code: 'KeyD', target: a.node('arena')});
  await settle();
  assert.equal(player.direction.x, 1, 'new keydown resumes ordinary movement');
});

test('PC team HUD reports no winner when both client leases expire', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  server.match.finish(null, 'connection_timeout');
  await a.poll(); await settle();
  assert.match(a.node('status').textContent, /승리 팀 없음/);
  assert.doesNotMatch(a.node('status').textContent, /승리 팀 null/);
});

test('PC team keyboard hold drives finite server shots and releases on keyup/blur', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();
  await settle();
  a.node('ready').click();b.node('ready').click();
  await settle();
  await a.poll();await b.poll();await settle();
  const p = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  // Opponent is off the firing ray; test repeated fire without ending the round.
  server.match.players.get(b.storage.get('veilpoint.team.tabSession')).z = 15;
  a.doc('keydown', {code: 'Space', target: a.node('arena')});
  await settle();
  assert.equal(p.ammo, 11, 'first physical press fires immediately');
  assert.equal(p.triggerHeld, true);
  a.doc('keydown', {code: 'Space', repeat: true, target: a.node('arena')});
  await settle();
  assert.equal(p.ammo, 11, 'OS key repeat cannot bypass shot cooldown');
  for (let i = 0; i < 36; i++) server.match.step();
  assert.equal(p.ammo, 9, 'server ticks produce the next two finite shots');
  a.doc('keyup', {code: 'Space', target: a.node('arena')});
  await settle();
  assert.equal(p.triggerHeld, false);
  for (let i = 0; i < 36; i++) server.match.step();
  assert.equal(p.ammo, 9, 'keyup cancels continued fire');
  a.doc('keydown', {code: 'Space', target: a.node('arena')});
  await settle();
  assert.equal(p.triggerHeld, true);
  a.blur();await settle();
  assert.equal(p.triggerHeld, false, 'focus loss releases server trigger');
  assert.ok(server.requests.some(r => r.body?.type === 'trigger' && r.body.active === true));
  assert.ok(server.requests.some(r => r.body?.type === 'trigger' && r.body.active === false));
});

test('team PC mouse and keyboard triggers remain independent across either release order', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();
  await settle();
  a.node('ready').click();b.node('ready').click();
  await settle();
  await a.poll();await b.poll();await settle();
  const p = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  server.match.players.get(b.storage.get('veilpoint.team.tabSession')).z = 15;
  const arena = a.node('arena');
  const mouse = {pointerType: 'mouse', button: 0, clientX: 250, clientY: 250};
  a.doc('keydown', {code: 'Space', target: arena});await settle();
  assert.equal(p.ammo, 11);
  arena.dispatch('pointerdown', mouse);await settle();
  assert.equal(p.triggerHeld, true);
  a.doc('keyup', {code: 'Space', target: arena});await settle();
  assert.equal(p.triggerHeld, true, 'releasing keyboard must preserve mouse hold');
  for (let i = 0; i < 18; i++) server.match.step();
  assert.equal(p.ammo, 10, 'mouse hold continues authoritative cadence');
  arena.dispatch('pointerup', mouse);await settle();
  assert.equal(p.triggerHeld, false);
  arena.dispatch('pointerdown', mouse);await settle();
  a.doc('keydown', {code: 'Space', target: arena});await settle();
  a.mouseUp();await settle();
  assert.equal(p.triggerHeld, true, 'releasing mouse outside arena preserves keyboard hold');
  a.doc('keyup', {code: 'Space', target: arena});await settle();
  assert.equal(p.triggerHeld, false);
  arena.dispatch('pointerdown', mouse);await settle();
  assert.equal(p.triggerHeld, true);
  a.blur();await settle();
  assert.equal(p.triggerHeld, false, 'focus loss clears both trigger sources');
});

test('both local browser clients report a same-tick draw instead of a disconnect', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();
  await settle();
  a.node('ready').click();b.node('ready').click();
  await settle();
  await a.poll();await b.poll();await settle();
  const players = [...server.match.players.entries()];
  const red = players.find(([,p]) => p.team === 'red')[1];
  const blue = players.find(([,p]) => p.team === 'blue')[1];
  red.x = -3;red.z = 0;red.facing = {x: 1,z: 0};red.health = 34;
  blue.x = 3;blue.z = 0;blue.facing = {x: -1,z: 0};blue.health = 34;
  for (const [token, player] of players)
    server.match.command(token, {seq: player.seq + 1, type: 'trigger', active: true});
  server.match.step();
  assert.equal(server.match.reason, 'mutual_incapacitation');
  await a.poll();await b.poll();await settle();
  for (const client of [a,b]) {
    assert.match(client.node('status').textContent, /무승부/);
    assert.doesNotMatch(client.node('status').textContent, /양측 연결 종료/);
    assert.equal(client.node('ready').disabled, false);
  }
});

test('PC team HUD distinguishes expired-opponent departure from two disconnected players', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  server.match.finish(null, 'player_left');
  await a.poll(); await settle();
  assert.match(a.node('status').textContent, /퇴장 시 상대 연결 만료/);
  assert.doesNotMatch(a.node('status').textContent, /양측 연결 종료|승리 팀 null/);
});

test('PC team UI focus stops held movement, capture and fire without window blur', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  const player = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  a.doc('keydown', {code: 'KeyD'});
  a.doc('keydown', {code: 'KeyE'});
  await settle();
  assert.equal(player.direction.x, 1);
  assert.equal(player.capturing, true);
  // In-page focus changes do not fire window.blur in a real desktop browser.
  a.doc('focusin', {target: {tagName: 'INPUT'}});
  await settle();
  assert.equal(player.direction.x, 0, 'focus must stop server-owned movement immediately');
  assert.equal(player.capturing, false, 'focus must release objective intent');
  // Shooting and capturing are mutually exclusive in the authoritative match.
  // Check the held trigger separately rather than assuming both coexist.
  a.doc('keydown', {code: 'KeyD', target: {tagName: 'CANVAS'}});
  a.doc('keydown', {code: 'Space', target: {tagName: 'CANVAS'}});
  await settle();
  assert.equal(player.triggerHeld, true);
  a.doc('focusin', {target: {tagName: 'BUTTON'}});
  await settle();
  assert.equal(player.direction.x, 0);
  assert.equal(player.triggerHeld, false, 'focus must release held trigger');
  a.doc('keydown', {code: 'KeyD', target: {tagName: 'INPUT'}});
  await settle();
  assert.equal(player.direction.x, 0, 'typing in a form must not restart movement');
  a.doc('keydown', {code: 'KeyA', target: {tagName: 'CANVAS'}});
  await settle();
  assert.equal(player.direction.x, -1);
  a.doc('focusin', {target: {tagName: 'CANVAS'}});
  await settle();
  assert.equal(player.direction.x, -1, 'game canvas focus must not clear valid movement');
  // Help links and custom ARIA menu controls must release the same server
  // intents as native buttons, including nested icon/text focus targets.
  const helpText = {tagName: 'SPAN', parentElement: {tagName: 'A', href: '#help'}};
  a.doc('focusin', {target: helpText});
  await settle();
  assert.equal(player.direction.x, 0, 'help-link focus releases movement');
  a.doc('keydown', {code: 'Space', target: helpText});
  await settle();
  assert.equal(player.triggerHeld, false, 'Space on a help link cannot start firing');
  a.doc('keydown', {code: 'KeyD', target: {tagName: 'DIV', role: 'button'}});
  await settle();
  assert.equal(player.direction.x, 0, 'ARIA button focus cannot start movement');
  a.doc('keyup', {code: 'KeyA'});
});

test('PC team keymaps update across tabs without stale held input or old fire keys', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  const player = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  a.doc('keydown', {code: 'KeyD'});
  await settle();
  assert.equal(player.direction.x, 1);
  let next = Desktop.bind(Desktop.normalize({}), 'right', 'KeyT').value;
  next = Desktop.bind(next, 'fire', 'KeyV').value;
  a.storage.set(Desktop.STORAGE_KEY, JSON.stringify(next));
  a.storageEvent({key: Desktop.STORAGE_KEY});
  await settle();
  assert.equal(player.direction.x, 0, 'old held movement must be cleared on remap');
  assert.match(a.node('fire').textContent, /KeyV/);
  a.doc('keydown', {code: 'KeyD'});
  a.doc('keydown', {code: 'Space'});
  await settle();
  assert.equal(player.direction.x, 0, 'old movement key no longer acts');
  assert.equal(player.ammo, 12, 'old fire key no longer shoots');
  a.doc('keyup', {code: 'KeyD'});
  a.doc('keyup', {code: 'Space'});
  a.doc('keydown', {code: 'KeyT'});
  await settle();
  assert.equal(player.direction.x, 1, 'new movement key works without reloading');
  a.doc('keyup', {code: 'KeyT'});
  a.doc('keydown', {code: 'KeyV'});
  await settle();
  assert.equal(player.ammo, 11, 'new fire key works without reloading');
  a.doc('keyup', {code: 'KeyV'});
});


test('live PC tab recovers an unknown server token without refresh or ghost state', async () => {
  const server = backend(), ui = boot(server), peer = boot(server);
  ui.node('join').click(); peer.node('join').click(); await settle();
  ui.node('ready').click(); peer.node('ready').click(); await settle();
  await ui.poll(); await settle();
  const oldToken = ui.storage.get('veilpoint.team.tabSession');
  ui.doc('keydown', {code: 'KeyD'}); await settle();
  assert.equal(server.match.players.get(oldToken).direction.x, 1);
  // Simulate the local server forgetting this identity while the tab remains open.
  server.match.players.delete(oldToken);
  server.match.finish(null, 'connection_timeout');
  await ui.poll(); await settle();
  assert.equal(ui.storage.has('veilpoint.team.tabSession'), false);
  assert.equal(ui.node('join').disabled, false);
  assert.equal(ui.node('ready').disabled, true);
  assert.equal(ui.node('name').disabled, false);
  assert.match(ui.node('status').textContent, /만료/);
  ui.node('join').click(); await settle();
  const replacement = ui.storage.get('veilpoint.team.tabSession');
  assert.notEqual(replacement, oldToken);
  assert.equal(server.match.players.get(replacement).direction.x, 0,
    'a stale held PC key must not control the new identity');
  assert.equal(ui.node('join').disabled, true);
});

test('expired PC command drops queued old-session intents before a fresh join', async () => {
  const server = backend(), ui = boot(server), peer = boot(server);
  ui.node('join').click(); peer.node('join').click(); await settle();
  ui.node('ready').click(); peer.node('ready').click(); await settle();
  await ui.poll(); await settle();
  const oldToken = ui.storage.get('veilpoint.team.tabSession');
  server.match.players.delete(oldToken);
  server.match.finish(null, 'connection_timeout');
  const before = server.requests.length;
  // Both input edges queue before the first rejected command is processed.
  ui.doc('keydown', {code: 'KeyW'});
  ui.doc('keyup', {code: 'KeyW'});
  await settle();
  const oldCommands = server.requests.slice(before).filter(r =>
    r.token === oldToken && r.route === '/command');
  assert.equal(oldCommands.length, 1,
    'the first unknown_player rejection must cancel all queued old commands');
  assert.equal(ui.storage.has('veilpoint.team.tabSession'), false);
  ui.node('join').click(); await settle();
  const freshToken = ui.storage.get('veilpoint.team.tabSession');
  assert.notEqual(freshToken, oldToken);
  assert.equal(server.requests.filter(r => r.token === freshToken && r.body?.type === 'move').length, 0,
    'queued movement from the old session must not replay under a fresh token');
});

test('PC mouse aim changes promptly without waiting for a new server snapshot',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const player=server.match.players.get(token);
 const aimCommands=()=>server.requests.filter(r=>r.token===token&&r.body?.type==='aim');
 const canvas=a.node('arena');
 canvas.dispatch('pointermove',{clientX:350,clientY:250,pointerType:'mouse'});
 await settle();
 assert.equal(aimCommands().length,1);
 const first={...player.facing};
 a.advanceTime(18);
 canvas.dispatch('pointermove',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();
 assert.equal(server.match.ticks,0,'no authoritative tick was needed to change aim');
 assert.equal(aimCommands().length,2);
 assert.ok(Math.hypot(player.facing.x-first.x,player.facing.z-first.z)>.1);
 canvas.dispatch('pointermove',{clientX:150,clientY:250,pointerType:'mouse'});
 await settle();
 assert.equal(aimCommands().length,2,'rapid mouse events do not flood HTTP');
 a.advanceTime(18);await settle();
 assert.equal(aimCommands().length,3,'a final mouse flick flushes without a server poll');
 await a.poll();await settle();
 assert.equal(aimCommands().length,3,'the next poll does not duplicate the trailing aim');
 assert.ok(player.facing.x<0,'final aim points left');
 canvas.dispatch('pointermove',{clientX:350,clientY:250,pointerType:'mouse'});
 await settle();
 assert.equal(aimCommands().length,3,'a second fast flick is queued, not sent');
 a.blur();a.advanceTime(18);await settle();
 assert.equal(aimCommands().length,3,'blur cancels the unsent trailing aim');
 assert.equal(player.aiming,false,'focus loss still releases server aim');
});


test('hidden PC team tab cannot heartbeat forever and block a connected opponent win', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  let now = 0;
  server.match.now = () => now;
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const hiddenToken = a.storage.get('veilpoint.team.tabSession');
  const activeToken = b.storage.get('veilpoint.team.tabSession');
  a.hide(); await settle();
  const beforeStateReads = server.requests.filter(r => r.route === '/state' && r.token === hiddenToken).length;
  await a.poll(); await settle();
  assert.equal(server.requests.filter(r => r.route === '/state' && r.token === hiddenToken).length,
    beforeStateReads, 'background PC tab must not poll redundant snapshots');
  now = 20000;
  a.heartbeat(); b.heartbeat(); await settle();
  assert.equal(server.requests.filter(r => r.token === hiddenToken && r.body?.type === 'heartbeat').length, 0,
    'background heartbeat must not renew an abandoned competitor');
  assert.equal(server.requests.filter(r => r.token === activeToken && r.body?.type === 'heartbeat').length, 1);
  now = 31001;
  server.match.step();
  assert.equal(server.match.phase, 'ended');
  assert.equal(server.match.winner, server.match.players.get(activeToken).team);
  assert.equal(server.match.reason, 'connection_timeout');
});

test('returning from a short PC alt-tab renews the server lease without waiting ten seconds', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  let now = 0;
  server.match.now = () => now;
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  a.hide(); await settle();
  now = 25000;
  b.heartbeat(); await settle(); // The active opponent must also keep a valid lease.
  a.show(); await settle();
  assert.equal(server.requests.filter(r => r.token === token && r.body?.type === 'heartbeat').length, 1,
    'foreground visibility should renew immediately');
  now = 31001;
  b.heartbeat(); await settle();
  server.match.step();
  assert.equal(server.match.phase, 'playing', 'brief background pause must not forfeit a valid session');
});


test('visible but unfocused PC team window cannot keep an abandoned match alive', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  let now = 0;
  server.match.now = () => now;
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const opponent = b.storage.get('veilpoint.team.tabSession');
  a.blur(); await settle();
  const reads = server.requests.filter(r => r.route === '/state' && r.token === token).length;
  await a.poll(); await settle();
  assert.equal(server.requests.filter(r => r.route === '/state' && r.token === token).length, reads);
  now = 20000;
  a.heartbeat(); b.heartbeat(); await settle();
  assert.equal(server.requests.filter(r => r.token === token && r.body?.type === 'heartbeat').length, 0);
  now = 31001;
  server.match.step();
  assert.equal(server.match.reason, 'connection_timeout');
  assert.equal(server.match.winner, server.match.players.get(opponent).team);
});

test('visible PC window focus immediately renews a valid short alt-tab session', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  let now = 0;
  server.match.now = () => now;
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  a.blur(); await settle();
  now = 25000;
  b.heartbeat(); await settle();
  a.focus(); await settle();
  assert.equal(server.requests.filter(r => r.token === token && r.body?.type === 'heartbeat').length, 1);
  now = 31001;
  server.match.step();
  assert.equal(server.match.phase, 'playing');
});

test('PC team HUD explains why moving or occupied hands interrupt objective capture', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();
  b.node('join').click();
  await settle();
  a.node('ready').click();
  b.node('ready').click();
  await settle();
  await a.poll();
  await settle();
  assert.match(a.node('status').textContent, /목표 원에서 정지 후/);
  assert.match(a.node('status').textContent, /이동\/재장전\/발사\/피격 시 중단/);
});

test('PC team UI explains deliberate release/repress after an earned relay point', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const selfToken = [...server.match.players.keys()][0];
  server.match.players.get(selfToken).x = 0;
  [...server.match.players.values()][1].x = 8;
  a.doc('keydown', {code: 'KeyE', target: a.node('arena')});
  await settle();
  for (let i = 0; i < 120; i++) {
    server.match.step();
    if ((i + 1) % 30 === 0) {await a.poll();await settle();}
  }
  assert.equal(server.match.score.red, 1);
  assert.match(a.node('status').textContent, /점령 키를 놓고 다시 눌러/);
  a.doc('keyup', {code: 'KeyE', target: a.node('arena')});
  await settle();
  await a.poll();await settle();
  assert.doesNotMatch(a.node('status').textContent, /점령 키를 놓고 다시 눌러/);
});


test('PC team HUD prompts a fresh relay press after an observed hit', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await b.poll();await settle();
  const [aToken, bToken] = [...server.match.players.keys()];
  server.match.players.get(aToken).x = 0;
  a.doc('keydown', {code: 'KeyE', target: a.node('arena')});
  await settle();
  for (let i = 0; i < 60; i++) server.match.step();
  assert.equal(server.match.players.get(aToken).captureArmed, true);
  assert.equal(server.match.command(bToken, {seq: server.match.players.get(bToken).seq + 1, type: 'fire'}).hit, true);
  assert.equal(server.match.players.get(aToken).captureArmed, false);
  await a.poll();await settle();
  assert.match(a.node('status').textContent, /점령 키를 놓고 다시 눌러/);
  a.doc('keyup', {code: 'KeyE', target: a.node('arena')});
  await settle();await a.poll();await settle();
  assert.doesNotMatch(a.node('status').textContent, /점령 키를 놓고 다시 눌러/);
});

test('PC mouse aim coalesces unsent updates behind a stalled request without reordering fire', async () => {
  const server = backend();
  const normalFetch = server.fetchLocal;
  let stallHeartbeat = false, releaseHeartbeat = null;
  server.fetchLocal = (route, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (stallHeartbeat && route === '/command' && body?.type === 'heartbeat') {
      stallHeartbeat = false;
      return new Promise(resolve => {
        releaseHeartbeat = () => normalFetch(route, options).then(resolve);
      });
    }
    return normalFetch(route, options);
  };
  const a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const initial = server.requests.length;
  stallHeartbeat = true;
  a.heartbeat(); await settle();
  assert.equal(typeof releaseHeartbeat, 'function');
  const point = (x, y) => {
    a.advanceTime(20); // Beyond the existing 60Hz PC pointer send throttle.
    a.node('arena').dispatch('pointermove', {pointerType: 'mouse', clientX: x, clientY: y});
  };
  for (let i = 0; i < 12; i++) point(i % 2 ? 140 : 380, i % 2 ? 370 : 130);
  a.node('fire').click(); // A shot must retain its position between two aim groups.
  for (let i = 0; i < 12; i++) point(i % 2 ? 390 : 120, i % 2 ? 350 : 140);
  await settle();
  assert.equal(server.requests.length, initial, 'blocked transport cannot dispatch later commands');
  releaseHeartbeat();
  await settle();
  const sent = server.requests.slice(initial).filter(r => r.token === token && r.body);
  assert.deepEqual(sent.map(r => r.body.type), ['heartbeat', 'aim', 'fire', 'aim'],
    'obsolete unsent aim updates are collapsed but a shot remains an ordering barrier');
  assert.ok(sent.every((r, i) => i === 0 || r.body.seq > sent[i - 1].body.seq),
    'coalesced commands preserve increasing server sequence numbers');
  const lastAim = sent.at(-1).body.direction;
  const player = server.match.players.get(token);
  assert.ok(Math.abs(player.facing.x - lastAim.x) < 1e-12);
  assert.ok(Math.abs(player.facing.z - lastAim.z) < 1e-12);
});

test('PC aim-release stays after the latest queued aim during network backpressure', async () => {
  const server = backend(), normalFetch = server.fetchLocal;
  let release = null, stall = false;
  server.fetchLocal = (route, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (stall && route === '/command' && body?.type === 'heartbeat') {
      stall = false;
      return new Promise(resolve => {release = () => normalFetch(route, options).then(resolve);});
    }
    return normalFetch(route, options);
  };
  const a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const before = server.requests.length;
  stall = true;a.heartbeat();await settle();
  for (const x of [110, 390, 120, 380]) {
    a.advanceTime(20);
    a.node('arena').dispatch('pointermove', {pointerType: 'mouse', clientX: x, clientY: 140});
  }
  a.node('arena').dispatch('pointerleave', {pointerType: 'mouse'});
  await settle();
  release();await settle();
  const commands = server.requests.slice(before).filter(r => r.token === token && r.body);
  assert.deepEqual(commands.map(r => r.body.type), ['heartbeat', 'aim', 'aimRelease']);
  assert.equal(server.match.players.get(token).aiming, false,
    'release must not be swallowed by aim coalescing or a stale pending direction');
});

test('PC movement backpressure keeps latest key state and never crosses a fire command', async () => {
  const server = backend(), normalFetch = server.fetchLocal;
  let release = null, stall = false;
  server.fetchLocal = (route, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (stall && route === '/command' && body?.type === 'heartbeat') {
      stall = false;
      return new Promise(resolve => {release = () => normalFetch(route, options).then(resolve);});
    }
    return normalFetch(route, options);
  };
  const a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const before = server.requests.length;
  stall = true; a.heartbeat(); await settle();
  a.doc('keydown', {code: 'KeyA'});
  a.doc('keyup', {code: 'KeyA'});
  a.doc('keydown', {code: 'KeyD'});
  a.node('fire').click();
  a.doc('keyup', {code: 'KeyD'});
  await settle();
  assert.equal(server.requests.length, before);
  release(); await settle();
  const sent = server.requests.slice(before).filter(r => r.token === token && r.body);
  assert.deepEqual(sent.map(r => r.body.type), ['heartbeat', 'move', 'fire', 'move']);
  assert.deepEqual({...sent[1].body.direction}, {x: 1, z: 0});
  assert.deepEqual({...sent[3].body.direction}, {x: 0, z: 0});
  assert.deepEqual({...server.match.players.get(token).direction}, {x: 0, z: 0},
    'a released PC key must not replay stale motion after transport recovers');
  assert.ok(sent.every((r, i) => i === 0 || r.body.seq > sent[i - 1].body.seq));
});

test('PC loadout selector changes server-owned weapon before ready and locks during round', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();await settle();
  await a.poll();await b.poll();await settle();
  a.node('loadout').value = 'compact';
  a.node('loadout').dispatch('change');
  await settle();await a.poll();
  const token = a.storage.get('veilpoint.team.tabSession');
  assert.equal(server.match.players.get(token).weaponId, 'compact');
  assert.equal(a.node('loadout').value, 'compact');
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await b.poll();await settle();
  assert.equal(a.node('loadout').disabled, true);
  assert.equal(server.match.players.get(token).ammo, 18);
  assert.equal(a.node('ammo').textContent, '18 / 36');
});

test('PC team lobby explains invalid Unicode names and allows immediate retry', async () => {
  const server = backend(), client = boot(server);
  client.node('name').value = 'A\u2028B';
  client.node('join').click();
  await settle();
  assert.equal(server.match.players.size, 0);
  assert.equal(client.node('join').disabled, false);
  assert.match(client.node('status').textContent, /이름에 줄바꿈/);
  client.node('name').value = '  조현지  ';
  client.node('join').click();
  await settle();
  assert.equal(server.match.players.size, 1);
  assert.equal(client.node('join').disabled, true);
  assert.equal([...server.match.players.values()][0].name, '조현지');
});

for (const failure of ['http_error', 'unacknowledged']) {
  test('PC tab resume fails closed when resetInput is ' + failure, async () => {
    const server = backend(), storage = new Map();
    const first = boot(server, storage), other = boot(server);
    first.node('join').click(); other.node('join').click();
    await settle();
    first.node('ready').click(); other.node('ready').click();
    await settle();
    await first.poll(); await other.poll(); await settle();
    const token = storage.get('veilpoint.team.tabSession');
    const player = server.match.players.get(token);
    first.doc('keydown', {code: 'KeyD'}); await settle();
    assert.equal(player.direction.x, 1);
    const originalFetch = server.fetchLocal;
    let resetAttempts = 0;
    server.fetchLocal = async (route, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      if (route === '/command' && body?.type === 'resetInput') {
        resetAttempts++;
        // Simulate one transient failure; the next physical retry succeeds.
        if (resetAttempts === 1) return failure === 'http_error'
          ? {ok: false, status: 503, json: async () => ({error: 'reset_unavailable'})}
          : {ok: true, status: 200, json: async () => ({ok: false})};
      }
      return originalFetch(route, options);
    };
    const resumed = boot(server, storage);
    await settle();
    assert.equal(resetAttempts, 1);
    assert.equal(storage.get('veilpoint.team.tabSession'), token,
      'a transient failure retains the token only for explicit retry');
    assert.equal(resumed.node('join').disabled, false);
    assert.match(resumed.node('join').textContent, /재연결/);
    const before = server.requests.length;
    resumed.doc('keydown', {code: 'KeyW'});
    resumed.heartbeat();
    await settle();
    assert.equal(server.requests.length, before,
      'blocked tab must not send authenticated movement or heartbeat');
    assert.equal(player.direction.x, 1, 'the server has not acknowledged reset yet');
    resumed.node('join').click();
    await settle();
    assert.equal(resetAttempts, 2);
    assert.equal(server.match.players.size, 2, 'retry must reuse the same seat');
    assert.equal(server.requests.filter(r => r.route === '/join').length, 2);
    assert.deepEqual({...player.direction}, {x: 0, z: 0});
    assert.equal(resumed.node('join').disabled, true);
    assert.equal(storage.get('veilpoint.team.tabSession'), token);
  });
}

test('PC tab blocks new input while waiting for the reset acknowledgement', async () => {
  const server = backend(), storage = new Map();
  const first = boot(server, storage), other = boot(server);
  first.node('join').click(); other.node('join').click();
  await settle();
  first.node('ready').click(); other.node('ready').click();
  await settle();
  await first.poll(); await other.poll(); await settle();
  const token = storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  first.doc('keydown', {code: 'KeyD'}); await settle();
  const beforeSeq = player.seq;
  const originalFetch = server.fetchLocal;
  let releaseReset;
  server.fetchLocal = async (route, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    if (route === '/command' && body?.type === 'resetInput')
      await new Promise(resolve => {releaseReset = resolve;});
    return originalFetch(route, options);
  };
  const resumed = boot(server, storage);
  await settle();
  assert.equal(typeof releaseReset, 'function');
  resumed.doc('keydown', {code: 'KeyW'});
  resumed.heartbeat();
  await settle();
  assert.equal(player.seq, beforeSeq,
    'no PC movement or heartbeat may race the pending reset');
  releaseReset();
  await settle();
  assert.equal(player.seq, beforeSeq + 1);
  assert.deepEqual({...player.direction}, {x: 0, z: 0});
  assert.equal(resumed.node('join').disabled, true);
  assert.equal(server.requests.filter(r =>
    r.token === token && r.body?.type === 'resetInput').length, 1);
});

test('stalled PC state poll times out, aborts and permits a fresh authoritative snapshot', async () => {
  const server = backend();
  let stall = true, aborted = 0, attempts = 0;
  const transport = {fetchLocal(route, options = {}) {
    if (route === '/state') {
      attempts++;
      if (stall) return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted++;
          reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
        }, {once: true});
      });
    }
    return server.fetchLocal(route, options);
  }};
  const ui = boot(transport);
  ui.node('join').click();
  await settle();
  const firstPoll = ui.poll();
  await settle();
  ui.advanceTime(8001);
  await firstPoll;
  await settle();
  assert.equal(aborted, 1, 'timed-out snapshot must abort its transport');
  assert.match(ui.node('status').textContent, /request_timeout/);
  stall = false;
  await ui.poll();
  await settle();
  assert.equal(attempts, 2, 'poll guard must clear after timeout');
  assert.match(ui.node('status').textContent, /양쪽 플레이어/);
});

test('stalled ready command cannot freeze the PC command queue after timeout', async () => {
  const server = backend();
  let stall = true, aborted = 0;
  const transport = {fetchLocal(route, options = {}) {
    if (route === '/command' && stall) return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted++;
        reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
      }, {once: true});
    });
    return server.fetchLocal(route, options);
  }};
  const ui = boot(transport);
  ui.node('join').click();
  await settle();
  const token = ui.storage.get('veilpoint.team.tabSession');
  ui.node('ready').click();
  await settle();
  ui.advanceTime(8001);
  await settle();
  assert.equal(aborted, 1);
  assert.match(ui.node('status').textContent, /request_timeout/);
  stall = false;
  ui.node('ready').click();
  await settle();
  assert.equal(server.match.players.get(token).ready, true,
    'next higher sequence is accepted after the earlier command was aborted');
  assert.equal(server.match.players.get(token).seq, 2);
});

test('PC team client sends no commands for IME composition and OS chords',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const player=server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
 const before=server.requests.filter(r=>r.route==='/command').length;
 for(const event of [
  {code:'Space',isComposing:true},{code:'Space',key:'Process'},
  {code:'Space',keyCode:229},{code:'Space',ctrlKey:true},
  {code:'Space',metaKey:true},{code:'KeyR',altKey:true},
  {code:'KeyD',ctrlKey:true}
 ])a.doc('keydown',event);
 await settle();
 assert.equal(player.ammo,12);
 assert.equal(player.reloadTicks,0);
 assert.equal(player.direction.x,0);
 assert.equal(server.requests.filter(r=>r.route==='/command').length,before);
 a.doc('keydown',{code:'Space',shiftKey:true});await settle();
 assert.equal(player.ammo,11);
 a.doc('keyup',{code:'Space'});
});

test('PC team OS shortcut releases server-held movement and trigger',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const player=server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
 a.doc('keydown',{code:'KeyD'});a.doc('keydown',{code:'Space'});await settle();
 assert.equal(player.direction.x,1);assert.equal(player.triggerHeld,true);
 a.doc('keydown',{code:'ControlLeft',ctrlKey:true});await settle();
 assert.equal(player.direction.x,0);assert.equal(player.triggerHeld,false);
 a.doc('keyup',{code:'KeyD'});a.doc('keyup',{code:'Space'});
});


test('PC team HUD shows the server-owned 60Hz countdown and tied timeout', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  assert.match(a.node('tick').textContent, /남은 시간 05:00/);
  server.match.ticks = 17999;
  server.match.step();
  await a.poll(); await b.poll(); await settle();
  assert.match(a.node('tick').textContent, /남은 시간 00:00/);
  assert.match(a.node('status').textContent, /제한 시간 종료 · 동점 무승부/);
  assert.equal(b.node('tick').textContent, a.node('tick').textContent);
});

test('PC voluntary leave releases an active authoritative seat and permits immediate rejoin', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();await settle();
  assert.equal(a.node('leave').disabled, false);
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await b.poll();await settle();
  assert.equal(server.match.phase, 'playing');
  const departingToken = a.storage.get('veilpoint.team.tabSession');
  a.doc('keydown', {code: 'KeyD'});
  a.node('leave').click();
  await settle();
  assert.equal(server.match.players.has(departingToken), false);
  assert.equal(server.match.players.size, 1);
  assert.equal(server.match.phase, 'ended');
  assert.equal(server.match.reason, 'player_left');
  assert.equal(a.storage.has('veilpoint.team.tabSession'), false);
  assert.equal(a.node('join').disabled, false);
  assert.equal(a.node('leave').disabled, true);
  assert.equal(a.node('ready').disabled, true);
  assert.equal(a.node('name').disabled, false);
  assert.equal(server.requests.filter(r => r.token === departingToken &&
    r.body?.type === 'leave').length, 1);
  a.node('join').click();await settle();
  assert.equal(server.match.players.size, 2);
  assert.notEqual(a.storage.get('veilpoint.team.tabSession'), departingToken);
  await b.poll();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  assert.equal(server.match.phase, 'playing', 'both participants can consent to a fresh round');
});

test('unacknowledged voluntary leave preserves the only token for retry, not a duplicate join', async () => {
  const server = backend(), original = server.fetchLocal;
  let failures = 0;
  server.fetchLocal = (route, options = {}) => {
    if (route === '/command' && JSON.parse(options.body).type === 'leave' && failures++ === 0)
      return Promise.resolve({ok: false, status: 503,
        json: async () => ({error: 'temporary_network_failure'})});
    return original(route, options);
  };
  const ui = boot(server);
  ui.node('join').click();await settle();
  const token = ui.storage.get('veilpoint.team.tabSession');
  ui.node('leave').click();await settle();
  assert.equal(ui.storage.get('veilpoint.team.tabSession'), token);
  assert.equal(ui.node('join').disabled, true);
  assert.equal(ui.node('leave').disabled, false);
  assert.match(ui.node('status').textContent, /퇴장 확인 실패/);
  ui.node('join').click();await settle();
  assert.equal(server.match.players.size, 1);
  ui.node('leave').click();await settle();
  assert.equal(server.match.players.size, 0);
  assert.equal(ui.storage.has('veilpoint.team.tabSession'), false);
  assert.equal(ui.node('join').disabled, false);
});

test('PC movement, aim, trigger and capture stay inert during a pending failed leave', async () => {
  const server = backend(), original = server.fetchLocal;
  let rejectLeave;
  server.fetchLocal = (route, options = {}) => {
    if (route === '/command' && JSON.parse(options.body).type === 'leave')
      return new Promise(resolve => {
        rejectLeave = () => resolve({ok: false, status: 503,
          json: async () => ({error: 'temporary_network_failure'})});
      });
    return original(route, options);
  };
  const a = boot(server), b = boot(server);
  a.node('join').click();b.node('join').click();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await b.poll();await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.node('leave').click();a.node('leave').click();await settle();
  assert.equal(typeof rejectLeave, 'function');
  const before = server.requests.filter(r => r.token === token && r.route === '/command').length;
  a.doc('keydown', {code: 'KeyD'});
  a.node('capture').dispatch('pointerdown');
  a.node('arena').dispatch('pointerdown', {clientX: 300, clientY: 250,
    pointerType: 'mouse', button: 0});
  await settle();
  assert.equal(server.requests.filter(r => r.token === token && r.route === '/command').length,
    before, 'no new server intents while a departure is pending');
  rejectLeave();await settle();
  assert.equal(a.node('leave').disabled, false, 'failed departure is retryable');
  await a.poll();await settle();
  assert.equal(player.direction.x, 0);
  assert.equal(player.capturing, false);
  assert.equal(player.triggerHeld, false);
  assert.equal(server.match.players.size, 2, 'uncertain departure preserves the original seat');
});
