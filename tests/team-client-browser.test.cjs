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
      addEventListener: (name, callback) => on(events, name, callback),
      dispatch: (name, event) => emit(events, name, event),
      click() {this.dispatch('click');}
    };
    nodes.set(id, value);
    return value;
  }
  const document = {
    hidden: false,
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
    document, window, fetch: server.fetchLocal,
    setInterval: callback => (intervals.push(callback), intervals.length),
    console
  }, {filename: 'src/team-client.js', timeout: 1500});
  return {
    node, storage,
    doc: (name, event) => emit(documentListeners, name, event),
    blur: () => emit(windowListeners, 'blur'),
    hide: () => {document.hidden = true;emit(documentListeners, 'visibilitychange');},
    poll: () => intervals[1](),
    heartbeat: () => intervals[0]()
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
  assert.equal(player.seq, seq + 1, 'heartbeat uses validated server sequence');
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
  assert.ok(player.seq >= previousSeq + 2);
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
 assert.ok(server.requests.some(r=>r.token===token&&r.body?.type==='aimRelease'));
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
