'use strict';
// Exercises the actual browser client script with a deterministic local server adapter.
// This is a DOM/network mock, not a real-browser or public-internet playtest.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {TeamMatch} = require('../src/team-match.cjs');
const {webcrypto} = require('node:crypto');
const clientSource = fs.readFileSync(path.join(__dirname, '../src/team-client.js'), 'utf8');
const Desktop = require('../src/desktop-controls.js');

function backend() {
  const match = new TeamMatch({now: () => 0});
  let id = 0;
  const attempts = new Map();
  const requests = [];
  async function fetchLocal(route, options = {}) {
    const token = options.headers?.['X-Player-Token'];
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({route, token, body});
    try {
      let result;
      if (route === '/join') {
        const existingToken = body.attemptId && attempts.get(body.attemptId);
        const existing = existingToken && match.players.get(existingToken);
        if (existing) result = {token: existingToken, id: existing.id,
          team: existing.team, name: existing.name, resumed: true};
        else {
          const newToken = (++id).toString(16).padStart(48, '0');
          result = {token: newToken, ...match.join(newToken, body.name),
            name: match.players.get(newToken).name};
          if (body.attemptId) attempts.set(body.attemptId, newToken);
        }
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

let nextMockGuest = 0;
function boot(server, storage = new Map(), storageBlocked = false) {
  // Each simulated browser tab represents a different person. A shared
  // default name would now be correctly rejected by the authoritative lobby.
  const guestName = 'Player ' + (++nextMockGuest);
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
      id, value: id === 'name' ? guestName : '', textContent: '', disabled: false,
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
    crypto: webcrypto,
    addEventListener: (name, callback) => on(windowListeners, name, callback)
  };
  if (storageBlocked) Object.defineProperty(window, 'localStorage', {
    get() {throw new Error('storage_denied');}
  });
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

test('PC lost release packets reconcile movement, stance, sprint, trigger and relay from server snapshots', async () => {
 const server=backend(), dropped=new Set();
 const flaky={fetchLocal:async (route, options={})=>{
  const body=options.body?JSON.parse(options.body):null;
  const p=server.match.players.get(options.headers?.['X-Player-Token']);
  const key=body?.type;
  const held=p && (key==='move' ? Math.hypot(p.direction.x,p.direction.z)>0 :
   key==='crouch'?p.crouching:key==='sprint'?p.sprintHeld:
   key==='trigger'?p.triggerHeld:key==='capture'?p.captureHeld:false);
  const released=key==='move' ? body.direction.x===0&&body.direction.z===0 :
   ['crouch','sprint','trigger','capture'].includes(key)&&body.active===false;
  if(route==='/command'&&held&&released&&!dropped.has(key)){
   dropped.add(key);throw new Error('lost_release_packet');
  }
  return server.fetchLocal(route,options);
 }};
 const a=boot(flaky),b=boot(flaky);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const p=server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
 const reconcile=async()=>{
  for(let i=0;i<20;i++)server.match.step();
  await a.poll();await settle();
 };
 a.doc('keydown',{code:'KeyA'});await settle();assert.equal(p.direction.x,-1);
 a.doc('keyup',{code:'KeyA'});await settle();assert.equal(p.direction.x,-1);
 await reconcile();assert.deepEqual(p.direction,{x:0,z:0});
 a.doc('keydown',{code:'KeyC'});await settle();assert.equal(p.crouching,true);
 a.doc('keyup',{code:'KeyC'});await settle();assert.equal(p.crouching,true);
 await reconcile();assert.equal(p.crouching,false);
 a.doc('keydown',{code:'ShiftLeft'});await settle();assert.equal(p.sprintHeld,true);
 a.doc('keyup',{code:'ShiftLeft'});await settle();assert.equal(p.sprintHeld,true);
 await reconcile();assert.equal(p.sprintHeld,false);
 a.doc('keydown',{code:'Space'});await settle();assert.equal(p.triggerHeld,true);
 a.doc('keyup',{code:'Space'});await settle();assert.equal(p.triggerHeld,true);
 await reconcile();assert.equal(p.triggerHeld,false);
 p.x=0;p.z=0;
 a.node('capture').dispatch('pointerdown');await settle();assert.equal(p.captureHeld,true);
 a.node('capture').dispatch('pointerup');await settle();assert.equal(p.captureHeld,true);
 await reconcile();assert.equal(p.captureHeld,false);
 assert.equal(server.match.progress.red,0,'lost release cannot keep banking relay progress');
 assert.deepEqual([...dropped].sort(),['capture','crouch','move','sprint','trigger']);
 assert.equal(server.match.phase,'playing','reconciliation does not restart or alter the match');
});

test('PC join retries a lost response without consuming the second local lobby seat', async () => {
  const server = backend(), storage = new Map();
  let dropFirstResponse = true;
  const flaky = {fetchLocal: async (...args) => {
    const response = await server.fetchLocal(...args);
    if (args[0] === '/join' && dropFirstResponse) {
      dropFirstResponse = false;
      throw new Error('lost_response');
    }
    return response;
  }};
  const ui = boot(flaky, storage);
  ui.node('name').value = 'Original';
  ui.node('join').click(); await settle();
  assert.equal(server.match.players.size, 1, 'first request reached the server');
  assert.equal(ui.node('join').disabled, false, 'failed response permits retry');
  const attemptId = storage.get('veilpoint.team.pendingJoin');
  assert.match(attemptId, /^[a-f0-9]{32}$/);
  ui.node('name').value = 'Changed after timeout';
  ui.node('join').click(); await settle();
  assert.equal(server.match.players.size, 1, 'retry must not allocate another seat');
  assert.equal(ui.node('name').value, 'Original', 'original server-owned identity wins');
  assert.equal(storage.has('veilpoint.team.pendingJoin'), false);
  assert.equal(storage.get('veilpoint.team.tabSession'), [...server.match.players.keys()][0]);
  const joins = server.requests.filter(r => r.route === '/join');
  assert.equal(joins.length, 2);
  assert.equal(joins[0].body.attemptId, joins[1].body.attemptId);
  const peer = boot(server);
  peer.node('join').click(); await settle();
  assert.equal(server.match.players.size, 2, 'second legitimate client still has a seat');
});

test('lost join response recovered during active round resets stale trigger and resumes server sequence', async () => {
  const server = backend(), storage = new Map();
  let lost = false;
  const flaky = {fetchLocal: async (...args) => {
    const response = await server.fetchLocal(...args);
    if (args[0] === '/join' && !lost) {
      lost = true;
      throw new Error('lost_join_response');
    }
    return response;
  }};
  const ui = boot(flaky, storage);
  ui.node('name').value = 'Captain A';
  ui.node('join').click(); await settle();
  assert.equal(ui.node('join').disabled, false);
  const token = [...server.match.players.keys()][0];
  const peer = boot(server);
  peer.node('join').click(); await settle();
  const peerToken = [...server.match.players.keys()].find(key => key !== token);
  server.match.command(token, {seq: 1, type: 'ready'});
  server.match.command(peerToken, {seq: 1, type: 'ready'});
  assert.equal(server.match.phase, 'playing');
  server.match.command(token, {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  server.match.command(token, {seq: 3, type: 'trigger', active: true});
  const player = server.match.players.get(token);
  assert.equal(player.triggerHeld, true);
  ui.node('join').click(); await settle();
  assert.equal(server.match.players.size, 2, 'retry reuses the original combatant');
  assert.equal(player.seq, 4, 'resetInput follows the server-owned sequence');
  assert.equal(player.triggerHeld, false, 'recovered tab cannot ghost-fire');
  assert.deepEqual({...player.direction}, {x: 0, z: 0}, 'stale movement is released');
  assert.equal(ui.node('join').disabled, true);
  assert.equal(ui.node('name').value, 'Captain A');
  assert.equal(storage.has('veilpoint.team.pendingJoin'), false);
  assert.ok(server.requests.some(r => r.route === '/command' && r.token === token &&
    r.body?.type === 'resetInput' && r.body.seq === 4));
  ui.doc('keydown', {code: 'KeyD'}); await settle();
  assert.equal(player.seq, 5, 'new PC input uses the restored sequence');
  assert.equal(player.direction.x, 1);
});

test('failed recovered-join input reset keeps retry capability and blocks PC control', async () => {
  const server = backend(), storage = new Map();
  let lostJoin = false, lostReset = false;
  const flaky = {fetchLocal: async (...args) => {
    const response = await server.fetchLocal(...args);
    const command = args[1]?.body && JSON.parse(args[1].body);
    if (args[0] === '/join' && !lostJoin) {
      lostJoin = true;
      throw new Error('lost_join_response');
    }
    if (args[0] === '/command' && command?.type === 'resetInput' && !lostReset) {
      lostReset = true;
      throw new Error('lost_reset_ack');
    }
    return response;
  }};
  const ui = boot(flaky, storage);
  ui.node('join').click(); await settle();
  const token = [...server.match.players.keys()][0];
  const peer = boot(server); peer.node('join').click(); await settle();
  const peerToken = [...server.match.players.keys()].find(key => key !== token);
  server.match.command(token, {seq: 1, type: 'ready'});
  server.match.command(peerToken, {seq: 1, type: 'ready'});
  ui.node('join').click(); await settle();
  assert.equal(lostReset, true);
  assert.equal(ui.node('join').disabled, false, 'reset uncertainty must fail closed');
  assert.equal(storage.get('veilpoint.team.tabSession'), token, 'token retained for explicit retry');
  assert.match(ui.node('status').textContent, /재연결/);
  ui.node('join').click(); await settle();
  assert.equal(ui.node('join').disabled, true);
  assert.equal(server.match.players.size, 2);
  assert.equal(storage.has('veilpoint.team.pendingJoin'), false);
  assert.equal(server.match.players.get(token).seq, 3, 'reconnect replays reset at next server sequence');
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
  a.doc('keydown', {code: 'Space'});
  await settle();
  assert.equal(player.ammo, 11);
  await a.poll();await settle();
  assert.match(a.node('status').textContent, /발사 완료/);
  assert.doesNotMatch(a.node('status').textContent, /명중 확인/);
  assert.ok(server.requests.some(r => r.body?.type === 'fire' &&
    Object.keys(r.body).sort().join(',') === 'seq,type'));
  a.doc('keydown', {code: 'Space', repeat: true});
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

test('lost PC aim-release packet cannot lock keyboard-facing until the full input lease',async()=>{
 const server=backend();let dropped=false;
 const flaky={fetchLocal:async (route,options={})=>{
  const body=options.body?JSON.parse(options.body):null;
  if(route==='/command'&&body?.type==='aimRelease'&&!dropped){
   dropped=true;throw new Error('lost_aim_release');
  }
  return server.fetchLocal(route,options);
 }};
 const a=boot(flaky),b=boot(flaky);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const p=server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();assert.equal(p.aiming,true);
 a.doc('keydown',{code:'KeyA'});await settle();
 assert.equal(p.direction.x,-1);
 a.node('arena').dispatch('pointerleave',{pointerType:'mouse'});await settle();
 assert.equal(dropped,true);assert.equal(p.aiming,true,'first release never reached server');
 assert.ok(p.facing.x>=0,'old aim still owns facing before reconciliation');
 for(let i=0;i<20;i++)server.match.step();
 await a.poll();await settle();
 assert.equal(p.aiming,false);
 assert.deepEqual({...p.facing},{x:-1,z:0},'PC keyboard regains facing without waiting 90 ticks');
 assert.equal(server.match.phase,'playing');
});

test('lost initial PC mouse aim is retried from own authoritative state before 20-tick lease refresh',async()=>{
 const server=backend();let dropped=false;
 const flaky={fetchLocal:async (route,options={})=>{
  const body=options.body?JSON.parse(options.body):null;
  if(route==='/command'&&body?.type==='aim'&&!dropped){
   dropped=true;throw new Error('lost_initial_aim');
  }
  return server.fetchLocal(route,options);
 }};
 const a=boot(flaky),b=boot(flaky);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const p=server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();
 assert.equal(dropped,true);
 assert.equal(p.aiming,false,'first aim packet never reached authority');
 for(let i=0;i<8;i++)server.match.step();
 // The fake monotonic clock must advance with server ticks: the real PC
 // still obeys the independent 60Hz aim-send throttle on recovery.
 a.advanceTime(8*1000/60);
 await a.poll();await settle();
 assert.equal(p.aiming,true,'self-state mismatch should trigger a new aim command');
 assert.ok(p.facing.z<-.5,'recovered direction follows actual PC pointer');
 assert.equal(server.match.phase,'playing');
});

test('lost PC mouse direction update is retried without reverting to stale facing',async()=>{
 const server=backend();let aimCount=0;
 const flaky={fetchLocal:async (route,options={})=>{
  const body=options.body?JSON.parse(options.body):null;
  if(route==='/command'&&body?.type==='aim'&&++aimCount===2)
   throw new Error('lost_aim_update');
  return server.fetchLocal(route,options);
 }};
 const a=boot(flaky),b=boot(flaky);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const p=server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse'});
 await settle();assert.equal(p.aiming,true);
 const oldFacing={...p.facing};
 a.advanceTime(25);
 a.node('arena').dispatch('pointermove',{clientX:355,clientY:250,pointerType:'mouse'});
 await settle();
 assert.equal(aimCount,2,'second aim command was attempted and lost');
 assert.deepEqual({...p.facing},oldFacing,'authority still has the earlier facing');
 for(let i=0;i<8;i++)server.match.step();
 // The fake monotonic clock must advance with server ticks: the real PC
 // still obeys the independent 60Hz aim-send throttle on recovery.
 a.advanceTime(8*1000/60);
 await a.poll();await settle();
 assert.ok(aimCount>=3,'authoritative facing mismatch retries changed mouse aim');
 assert.ok(p.facing.x>.99&&Math.abs(p.facing.z)<.02,'server receives final pointer direction');
 assert.equal(server.match.phase,'playing');
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
  a.doc('keydown', {code: 'KeyF', target: a.node('arena')});
  assert.equal(player.capturing, false, 'lobby intent is never sent to the server');
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  for (let i = 0; i < 25; i++) server.match.step();
  await a.poll(); await settle();
  assert.equal(player.capturing, false, 'polling cannot revive pre-round capture');
  assert.equal(server.requests.filter(r => r.token === token &&
    r.body?.type === 'capture' && r.body.active).length, 0);
  // OS repeat from the held E must not count as a new physical press.
  a.doc('keydown', {code: 'KeyF', repeat: true, target: a.node('arena')});
  await settle();
  assert.equal(player.capturing, false);
  a.doc('keyup', {code: 'KeyF', target: a.node('arena')});
  a.doc('keydown', {code: 'KeyF', target: a.node('arena')});
  await settle();
  assert.equal(player.capturing, true, 'fresh PC press still captures normally');
  a.doc('keyup', {code: 'KeyF', target: a.node('arena')});
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
  a.doc('keydown', {code: 'KeyF'});
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
  a.doc('keydown', {code: 'KeyF', target: a.node('arena')});
  await settle();
  for (let i = 0; i < 120; i++) {
    server.match.step();
    if ((i + 1) % 30 === 0) {await a.poll();await settle();}
  }
  assert.equal(server.match.score.red, 1);
  assert.match(a.node('status').textContent, /점령 키를 놓고 다시 눌러/);
  a.doc('keyup', {code: 'KeyF', target: a.node('arena')});
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
  a.doc('keydown', {code: 'KeyF', target: a.node('arena')});
  await settle();
  for (let i = 0; i < 60; i++) server.match.step();
  assert.equal(server.match.players.get(aToken).captureArmed, true);
  assert.equal(server.match.command(bToken, {seq: server.match.players.get(bToken).seq + 1, type: 'fire'}).hit, true);
  assert.equal(server.match.players.get(aToken).captureArmed, false);
  await a.poll();await settle();
  assert.match(a.node('status').textContent, /점령 키를 놓고 다시 눌러/);
  a.doc('keyup', {code: 'KeyF', target: a.node('arena')});
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

test('PC lobby shows authoritative ready count and supports consent withdrawal', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); await settle();
  await a.poll(); await settle();
  assert.match(a.node('status').textContent, /상대 입장 대기/);
  b.node('join').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  assert.match(a.node('status').textContent, /0\/2/);
  a.node('ready').click(); await settle();
  await a.poll(); await settle();
  assert.equal(a.node('ready').textContent, '준비 취소');
  assert.match(a.node('status').textContent, /준비 완료 \(1\/2\)/);
  a.node('ready').click(); await settle();
  await a.poll(); await settle();
  assert.equal(a.node('ready').textContent, '준비 / 재대전');
  assert.equal(server.match.players.get(a.storage.get('veilpoint.team.tabSession')).ready, false);
  b.node('ready').click(); await settle();
  assert.equal(server.match.phase, 'lobby');
  a.node('ready').click(); await settle();
  assert.equal(server.match.phase, 'playing');
  await a.poll(); await settle();
  assert.equal(a.node('ready').disabled, true);
  assert.ok(server.requests.some(r => r.body?.type === 'unready'));
});

test('rapid PC ready then cancel preserves last consent before the next server snapshot', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('name').value = 'Alpha'; b.node('name').value = 'Bravo';
  a.node('join').click(); b.node('join').click(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  // The first HTTP request has not yet updated state.self.ready. A second
  // click must queue unready rather than duplicating ready.
  a.node('ready').click();
  assert.equal(a.node('ready').textContent, '준비 취소');
  a.node('ready').click();
  assert.equal(a.node('ready').textContent, '준비 / 재대전');
  await settle();
  const commands = server.requests.filter(r => r.route === '/command' && r.token === token)
    .map(r => r.body.type);
  assert.deepEqual(commands, ['ready', 'unready']);
  assert.equal(server.match.players.get(token).ready, false);
  // The peer's genuine ready vote cannot start a round on a canceled vote.
  b.node('ready').click(); await settle();
  assert.equal(server.match.phase, 'lobby');
  await a.poll(); await settle();
  assert.equal(a.node('ready').textContent, '준비 / 재대전');
  a.node('ready').click(); await settle();
  assert.equal(server.match.phase, 'playing');
});

test('stale PC team state polling cannot override a queued ready cancellation', async () => {
  const server = backend(), ui = boot(server);
  ui.node('join').click(); await settle();
  ui.node('ready').click();
  ui.node('ready').click();
  // A poll may run before the queued commands settle; the visible button
  // must continue to reflect the most recent physical PC click.
  await ui.poll();
  assert.equal(ui.node('ready').textContent, '준비 / 재대전');
  await settle();
  await ui.poll(); await settle();
  const token = ui.storage.get('veilpoint.team.tabSession');
  assert.equal(server.match.players.get(token).ready, false);
  assert.equal(ui.node('ready').textContent, '준비 / 재대전');
});

test('PC lobby accepts server revocation of a solo ready vote when a peer joins', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); await settle();
  a.node('ready').click(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  assert.equal(server.match.players.get(token).ready, true);
  // The peer joins before the original tab sees a confirming state poll.
  b.node('join').click(); await settle();
  assert.equal(server.match.players.get(token).ready, false);
  await a.poll(); await settle();
  assert.equal(a.node('ready').textContent, '준비 / 재대전');
  assert.equal(server.match.phase, 'lobby');
});

test('PC crouch key press/release and focus loss are reconciled with server stance', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await b.poll(); await settle();
  const player = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  a.doc('keydown', {code: 'KeyC'});
  await settle();
  assert.equal(player.crouching, true, 'physical PC crouch press reaches authority');
  a.doc('keydown', {code: 'KeyD'});
  await settle();
  assert.equal(player.direction.x, 1, 'crouch does not replace normal movement');
  a.doc('keyup', {code: 'KeyC'});
  await settle();
  assert.equal(player.crouching, false, 'releasing crouch must reach authority');
  a.doc('keydown', {code: 'KeyC'});
  await settle();
  assert.equal(player.crouching, true);
  a.blur();
  await settle();
  assert.equal(player.crouching, false, 'lost focus clears held crouch without waiting for lease');
  assert.equal(player.direction.x, 0, 'lost focus clears held movement too');
});

test('remapped PC crouch binding replaces the default key without ghost posture', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  a.node('ready').click(); b.node('ready').click();
  await settle();
  await a.poll(); await settle();
  const player = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  const localStorage = {
    getItem: key => a.storage.get(key) ?? null,
    setItem: (key, value) => a.storage.set(key, value)
  };
  const remapped = Desktop.bind(Desktop.load(localStorage), 'crouch', 'KeyV');
  assert.equal(remapped.ok, true);
  assert.equal(Desktop.save(localStorage, remapped.value), true);
  a.storageEvent({key: Desktop.STORAGE_KEY});
  await settle();
  a.doc('keydown', {code: 'KeyC'});
  await settle();
  assert.equal(player.crouching, false, 'old crouch key is no longer active');
  a.doc('keyup', {code: 'KeyC'});
  a.doc('keydown', {code: 'KeyV'});
  await settle();
  assert.equal(player.crouching, true, 'new PC key controls the server posture');
  a.doc('keyup', {code: 'KeyV'});
  await settle();
  assert.equal(player.crouching, false);
});

test('PC team Shift sprint is a held server intent and blur releases it with movement', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await settle();
  const player = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  a.doc('keydown', {code: 'KeyD'}); a.doc('keydown', {code: 'ShiftLeft'});
  await settle();
  assert.equal(player.sprintHeld, true);
  for (let i = 0; i < 30; i++) server.match.step();
  assert.ok(player.stamina < 100);
  await a.poll(); await settle();
  assert.ok(a.node('stamina').textContent.includes('/100'));
  assert.ok(Number(a.node('stress').textContent) >= 0, 'stress remains independently numeric');
  a.doc('keyup', {code: 'ShiftLeft'}); await settle();
  assert.equal(player.sprintHeld, false);
  a.doc('keydown', {code: 'ShiftLeft'}); await settle();
  assert.equal(player.sprintHeld, true);
  a.blur(); await settle();
  assert.equal(player.sprintHeld, false);
  assert.equal(player.direction.x, 0);
});

test('remapped PC team sprint uses new key and rejects the former Shift binding', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await settle();
  const player = server.match.players.get(a.storage.get('veilpoint.team.tabSession'));
  const localStorage = {
    getItem: key => a.storage.get(key) ?? null,
    setItem: (key, value) => a.storage.set(key, value)
  };
  const changed = Desktop.bind(Desktop.load(localStorage), 'sprint', 'KeyV');
  assert.equal(changed.ok, true);
  Desktop.save(localStorage, changed.value);
  a.storageEvent({key: Desktop.STORAGE_KEY}); await settle();
  a.doc('keydown', {code: 'ShiftLeft'}); await settle();
  assert.equal(player.sprintHeld, false);
  a.doc('keyup', {code: 'ShiftLeft'});
  a.doc('keydown', {code: 'KeyV'}); await settle();
  assert.equal(player.sprintHeld, true);
  a.doc('keyup', {code: 'KeyV'}); await settle();
  assert.equal(player.sprintHeld, false);
});

test('PC one-pixel aim correction reaches server without waiting for a 20-tick lease refresh', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  const aimRequests = () => server.requests.filter(r => r.token === token && r.body?.type === 'aim');
  a.node('arena').dispatch('pointermove', {clientX: 250, clientY: 155, pointerType: 'mouse'});
  await settle();
  const before = aimRequests().length, oldFacing = {...player.facing};
  assert.equal(before, 1);
  a.advanceTime(20); // A genuine new PC input slot after the 60Hz send interval.
  a.node('arena').dispatch('pointermove', {clientX: 251, clientY: 155, pointerType: 'mouse'});
  await settle();
  assert.equal(aimRequests().length, before + 1,
    'one map pixel (~0.37 degrees here) must not wait 333ms for a lease refresh');
  assert.ok(Math.hypot(player.facing.x - oldFacing.x, player.facing.z - oldFacing.z) > .0025);
  // Several additional events in the same 16.67ms slot must not flood HTTP.
  a.node('arena').dispatch('pointermove', {clientX: 252, clientY: 155, pointerType: 'mouse'});
  a.node('arena').dispatch('pointermove', {clientX: 253, clientY: 155, pointerType: 'mouse'});
  await settle();
  assert.equal(aimRequests().length, before + 1, '60Hz throttle still applies');
  a.advanceTime(20); await settle();
  assert.equal(aimRequests().length, before + 2, 'trailing aim flush keeps the latest PC pointer');
});

test('PC pointer at own avatar releases an undefined aim ray instead of locking keyboard facing', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  assert.equal(player.x, -8);
  a.node('arena').dispatch('pointermove', {clientX: 250, clientY: 155, pointerType: 'mouse'});
  await settle();
  assert.equal(player.aiming, true);
  a.doc('keydown', {code: 'KeyA'}); await settle();
  assert.equal(player.direction.x, -1);
  assert.ok(player.facing.x > 0, 'mouse aim currently owns facing');
  // Server red spawn is x=-8, z=0; projection is 250 + x*9.5, 250 + z*9.5.
  a.advanceTime(20);
  a.node('arena').dispatch('pointermove', {clientX: 174, clientY: 250, pointerType: 'mouse'});
  await settle();
  assert.equal(player.aiming, false, 'undefined zero-length aim is released immediately');
  assert.deepEqual({...player.facing}, {x: -1, z: 0});
  assert.ok(server.requests.some(r => r.token === token && r.body?.type === 'aimRelease'));
});

test('PC click on own avatar does not spend finite ammunition or latch stale trigger', async () => {
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const p=server.match.players.get(token);
 const before=p.ammo;
 // Red spawn x=-8,z=0 projects exactly to canvas (174,250).
 a.node('arena').dispatch('pointerdown',{clientX:174,clientY:250,pointerType:'mouse',button:0});
 await settle();
 assert.equal(p.aiming,false,'self-position has no valid facing ray');
 assert.equal(p.ammo,before,'invalid click cannot consume a carried round');
 assert.equal(p.triggerHeld,false,'invalid click cannot latch automatic fire');
 assert.equal(server.requests.filter(r=>r.token===token&&r.body?.type==='fire').length,0);
 for(let i=0;i<25;i++)server.match.step();
 assert.equal(p.ammo,before,'invalid click must not fire on later 60Hz ticks');
 // A later valid click remains playable and uses the normal finite-ammo path.
 a.advanceTime(500);
 a.node('arena').dispatch('pointerdown',{clientX:250,clientY:155,pointerType:'mouse',button:0});
 await settle();
 assert.equal(p.ammo,before-1,'valid PC pointer click still fires once');
 assert.equal(p.triggerHeld,true);
 a.node('arena').dispatch('pointerup',{pointerType:'mouse',button:0});
 await settle();
 assert.equal(p.triggerHeld,false);
});

test('PC held mouse fire stops when the pointer reaches the own-player marker', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.node('arena').dispatch('pointerdown', {
    clientX: 250, clientY: 155, pointerType: 'mouse', button: 0
  });
  await settle();
  assert.equal(player.triggerHeld, true);
  assert.equal(player.aiming, true);
  const ammoAfterClick = player.ammo;
  // The red player is at (-8, 0), projected to (174, 250).
  a.advanceTime(20);
  a.node('arena').dispatch('pointermove', {
    clientX: 174, clientY: 250, pointerType: 'mouse', buttons: 1
  });
  await settle();
  assert.equal(player.aiming, false);
  assert.equal(player.triggerHeld, false,
    'a held mouse must not keep firing after its aim ray becomes undefined');
  for (let i = 0; i < 45; i++) server.match.step();
  assert.equal(player.ammo, ammoAfterClick,
    'later fixed 60Hz ticks must not consume more finite rounds');
  assert.ok(server.requests.some(r => r.token === token && r.body?.type === 'trigger' &&
    r.body.active === false), 'the authoritative server receives a trigger release');
});

test('invalid PC mouse aim releases only mouse fire, not a held keyboard trigger', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  a.doc('keydown', {code: 'Space'}); await settle();
  assert.equal(player.triggerHeld, true);
  a.node('arena').dispatch('pointerdown', {
    clientX: 250, clientY: 155, pointerType: 'mouse', button: 0
  });
  await settle();
  a.advanceTime(20);
  a.node('arena').dispatch('pointermove', {
    clientX: 174, clientY: 250, pointerType: 'mouse', buttons: 1
  });
  await settle();
  assert.equal(player.aiming, false);
  assert.equal(player.triggerHeld, true,
    'an independent keyboard fire hold must survive mouse-only cancellation');
  a.doc('keyup', {code: 'Space'}); await settle();
  assert.equal(player.triggerHeld, false, 'keyboard keyup still releases the final trigger');
});

test('PC walking under a stationary held mouse cursor stops stale automatic fire', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  // Red spawn (-8,0), stationary cursor points one world meter forward (-8,-1).
  a.node('arena').dispatch('pointerdown', {
    clientX: 174, clientY: 240.5, pointerType: 'mouse', button: 0
  });
  await settle();
  assert.equal(player.aiming, true);
  assert.equal(player.triggerHeld, true);
  a.doc('keydown', {code: 'KeyW'}); await settle();
  for (let i = 0; i < 13; i++) server.match.step(); // 13 * 4.5/60 = 0.975m
  assert.ok(Math.abs(player.z + 1) < 0.1);
  const remaining = player.ammo;
  await a.poll(); await settle(); // no new mousemove event; only server-owned self position
  assert.equal(player.aiming, false, 'stationary cursor no longer supplies a valid ray');
  assert.equal(player.triggerHeld, false, 'held mouse trigger must release on the poll');
  for (let i = 0; i < 30; i++) server.match.step();
  assert.equal(player.ammo, remaining, 'no stale auto-fire after crossing the cursor');
  a.doc('keyup', {code: 'KeyW'}); await settle();
});


test('PC rapid flick-click sends the current aim before spending finite ammunition', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('join').click(); b.node('join').click(); await settle();
  a.node('ready').click(); b.node('ready').click(); await settle();
  await a.poll(); await b.poll(); await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  const player = server.match.players.get(token);
  const canvas = a.node('arena');
  const beforeAmmo = player.ammo;
  const aimRequests = () => server.requests.filter(r => r.token === token && r.body?.type === 'aim');
  // The initial direction is sent, but a quick pointer flick is still inside
  // the 16.67ms move throttle and therefore has only a pending trailing timer.
  canvas.dispatch('pointermove', {pointerType: 'mouse', clientX: 350, clientY: 250});
  await settle();
  assert.equal(aimRequests().length, 1);
  canvas.dispatch('pointermove', {pointerType: 'mouse', clientX: 250, clientY: 155});
  await settle();
  assert.equal(aimRequests().length, 1, 'ordinary pointer moves remain rate-limited');
  // Click in a third direction before the trailing timer: old code sent fire
  // with the first facing and only updated aim on a later timer callback.
  canvas.dispatch('pointerdown', {pointerType: 'mouse', button: 0,
    clientX: 250, clientY: 345});
  await settle();
  const ordered = server.requests.filter(r => r.token === token && r.body &&
    ['aim', 'fire', 'trigger'].includes(r.body.type));
  assert.deepEqual(ordered.map(r => r.body.type), ['aim', 'aim', 'fire', 'trigger']);
  assert.ok(ordered[1].body.direction.z > 0, 'clicked sight ray points to the new world position');
  assert.ok(player.facing.z > 0, 'the server resolves the shot with the latest facing');
  assert.equal(player.ammo, beforeAmmo - 1, 'exactly one finite round was spent');
  a.advanceTime(20); await settle();
  assert.equal(aimRequests().length, 2, 'priority click cancels the stale trailing aim timer');
  canvas.dispatch('pointerup', {pointerType: 'mouse', button: 0});
  await settle();
  assert.equal(player.triggerHeld, false);
});

test('PC lobby explains a duplicate normalized name and permits a distinct retry', async () => {
  const server = backend(), first = boot(server), second = boot(server);
  first.node('name').value = 'Alpha';
  second.node('name').value = ' ALPHA ';
  first.node('join').click(); await settle();
  second.node('join').click(); await settle();
  assert.equal(server.match.players.size, 1, 'duplicate cannot reserve the second seat');
  assert.equal(second.node('join').disabled, false);
  assert.match(second.node('status').textContent, /다른 참가자가 사용 중인 이름/);
  second.node('name').value = 'Bravo';
  second.node('join').click(); await settle();
  assert.equal(server.match.players.size, 2);
  assert.equal(second.node('join').disabled, true);
});

test('PC tab resume restores the canonical server-owned player name, not the HTML default', async () => {
  const server = backend(), a = boot(server), b = boot(server);
  a.node('name').value = '  이수혁  ';
  b.node('name').value = 'Other player';
  a.node('join').click(); b.node('join').click();
  await settle();
  const token = a.storage.get('veilpoint.team.tabSession');
  assert.equal(server.match.players.get(token).name, '이수혁');
  a.node('ready').click(); b.node('ready').click();
  await settle();
  assert.equal(server.match.phase, 'playing');
  const resumed = boot(server, a.storage);
  assert.notEqual(resumed.node('name').value, '이수혁',
    'a fresh document initially displays an unrelated default');
  await settle();
  assert.equal(resumed.node('name').value, '이수혁');
  assert.equal(resumed.node('name').disabled, true);
  assert.equal(server.match.players.size, 2, 'resume must not reserve another seat');
  assert.equal(server.match.snapshot(token).self.name, '이수혁');
  assert.equal(a.storage.get('veilpoint.team.tabSession'), token);
});

test('PC team client explains fatal server outage on poll and join without discarding its token', async () => {
  const offline = {ok: false, status: 503,
    json: async () => ({error: 'simulation_unavailable'})};
  const server = backend(), normal = server.fetchLocal;
  server.fetchLocal = (route, options) => route === '/state'
    ? Promise.resolve(offline) : normal(route, options);
  const a = boot(server);
  a.node('join').click();
  await settle();
  const saved = a.storage.get('veilpoint.team.tabSession');
  assert.ok(saved, 'successful join keeps its original session capability');
  await a.poll(); await settle();
  assert.match(a.node('status').textContent, /서버 시뮬레이션이 중단/);
  assert.match(a.node('status').textContent, /재시작/);
  assert.equal(a.storage.get('veilpoint.team.tabSession'), saved,
    'temporary server failure must not silently allocate another seat');

  const rejectedJoin = backend();
  rejectedJoin.fetchLocal = async () => offline;
  const b = boot(rejectedJoin);
  b.node('join').click(); await settle();
  assert.match(b.node('status').textContent, /서버 시뮬레이션이 중단/);
  assert.equal(b.node('join').disabled, false, 'join remains retryable after restart');
});

test('fatal server error on PC state poll drops stale tab identity and blocks ghost input', async () => {
  const server = backend();
  let failed = false, rejected = 0;
  const guarded = {fetchLocal: async (...args) => {
    if (failed) {
      rejected++;
      return {ok: false, status: 503,
        json: async () => ({error: 'simulation_unavailable'})};
    }
    return server.fetchLocal(...args);
  }};
  const a = boot(guarded), b = boot(guarded);
  a.node('join').click();b.node('join').click();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await settle();
  assert.equal(server.match.phase, 'playing');
  assert.ok(a.storage.get('veilpoint.team.tabSession'));
  failed = true;
  await a.poll();await settle();
  assert.equal(a.storage.has('veilpoint.team.tabSession'), false);
  assert.equal(a.node('join').disabled, false);
  assert.match(a.node('status').textContent, /시뮬레이션이 중단/);
  const before = rejected;
  a.doc('keydown', {code: 'KeyW'});
  a.heartbeat();
  await settle();
  assert.equal(rejected, before, 'a failed authority must not receive more PC inputs');
});

test('fatal server error on queued PC command stops movement and discards old token', async () => {
  const server = backend();
  let failed = false, rejected = 0;
  const guarded = {fetchLocal: async (...args) => {
    if (failed) {
      rejected++;
      return {ok: false, status: 503,
        json: async () => ({error: 'simulation_unavailable'})};
    }
    return server.fetchLocal(...args);
  }};
  const a = boot(guarded), b = boot(guarded);
  a.node('join').click();b.node('join').click();await settle();
  a.node('ready').click();b.node('ready').click();await settle();
  await a.poll();await settle();
  failed = true;
  a.doc('keydown', {code: 'KeyA'});
  await settle();
  assert.ok(rejected >= 1);
  assert.equal(a.storage.has('veilpoint.team.tabSession'), false);
  assert.match(a.node('status').textContent, /시뮬레이션이 중단/);
  const before = rejected;
  a.doc('keydown', {code: 'Space'});
  a.heartbeat();
  await settle();
  assert.equal(rejected, before, 'no firing or heartbeat after fatal authority loss');
});

test('PC team client can join and play with blocked localStorage getter', async () => {
  const server = backend(), a = boot(server, new Map(), true), b = boot(server);
  a.node('join').click(); b.node('join').click();
  await settle();
  assert.equal(server.match.players.size, 2);
  a.node('ready').click(); b.node('ready').click();
  await settle();
  assert.equal(server.match.phase, 'playing');
  await a.poll(); await b.poll(); await settle();
  assert.equal(a.node('phase').textContent, 'PLAYING');
  a.storageEvent({key: Desktop.STORAGE_KEY, storageArea: null});
  assert.match(a.node('fire').textContent, /Space/,
    'PC controls stay readable without storage access');
});


test('PC team snapshot loss fails closed until server acknowledges an atomic input reset',async()=>{
 const server=backend();
 let failNextPoll=false;
 const flaky={fetchLocal(route,options={}){
  if(route==='/state'&&failNextPoll){
   failNextPoll=false;
   return Promise.reject(new Error('network_unavailable'));
  }
  return server.fetchLocal(route,options);
 }};
 const a=boot(flaky),b=boot(flaky);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 assert.equal(server.match.phase,'playing');
 await a.poll();await b.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const player=server.match.players.get(token);
 a.doc('keydown',{code:'KeyW'});await settle();
 assert.notEqual(player.direction.z,0,'control is server-owned before disconnect');
 failNextPoll=true;
 await a.poll();await settle();
 assert.match(a.node('status').textContent,/입력 일시 정지/);
 const beforeSeq=player.seq;
 a.doc('keydown',{code:'KeyA'});a.heartbeat();await settle();
 assert.equal(player.seq,beforeSeq,'disconnected tab must not renew or add old commands');
 await a.poll();await settle();
 assert.deepEqual({...player.direction},{x:0,z:0},'resume must reset the stale held server input');
 assert.equal(player.triggerHeld,false);
 assert.equal(player.captureHeld,false);
 const resets=server.requests.filter(r=>r.route==='/command'&&r.token===token&&r.body?.type==='resetInput');
 assert.equal(resets.length,1);
 assert.match(a.node('status').textContent,/목표 원/);
 a.doc('keydown',{code:'KeyS'});await settle();
 assert.equal(player.direction.z,1,'fresh PC press works after acknowledged resync');
 a.doc('keyup',{code:'KeyS'});await settle();
 assert.equal(player.direction.z,0);
});


test('team coast-mist display uses public 60Hz forecast without extrapolating monitor FPS',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 assert.equal(server.match.phase,'playing');
 await a.poll();await settle();
 const token=a.storage.get('veilpoint.team.tabSession');
 const forecast=server.match.snapshot(token).weather.ticksUntilChange;
 assert.ok(Number.isSafeInteger(forecast)&&forecast>=0);
 const remaining=Math.ceil(forecast/60);
 assert.match(a.node('weather').textContent,
  new RegExp('다음 변화까지 '+String(Math.floor(remaining/60)).padStart(2,'0')+
   ':'+String(remaining%60).padStart(2,'0')));
 for(let i=0;i<60;i++)server.match.step();
 await a.poll();await settle();
 const newTime=Math.ceil(server.match.snapshot(token).weather.ticksUntilChange/60);
 assert.match(a.node('weather').textContent,
  new RegExp('다음 변화까지 '+String(Math.floor(newTime/60)).padStart(2,'0')+
   ':'+String(newTime%60).padStart(2,'0')));
 assert.notEqual(newTime,remaining,'forecast must advance with server world ticks');
 assert.doesNotMatch(a.node('weather').textContent,/GPU|165Hz|RTX/);
});
test('team weather countdown never fabricates missing or invalid server transition time',async()=>{
 const server=backend();
 const noTime={fetchLocal:async(route,options={})=>{
  const response=await server.fetchLocal(route,options);
  if(route!=='/state'||!response.ok)return response;
  const state=await response.json();
  state.weather={phase:'clear',visibilityRange:80,ticksUntilChange:-1};
  return {...response,json:async()=>state};
 }};
 const a=boot(noTime),b=boot(noTime);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 assert.match(a.node('weather').textContent,/맑음/);
 assert.doesNotMatch(a.node('weather').textContent,/다음 변화까지/);
});


test('PC team relay progress HUD reflects only published authoritative team percentages',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 // A newly joined tab has no authoritative snapshot until its first poll.
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/대전 시작 전/);
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 assert.equal(server.match.phase,'playing');
 const aToken=a.storage.get('veilpoint.team.tabSession');
 const player=server.match.players.get(aToken);
 const duration=server.match.snapshot(aToken).objective.requiredSeconds;
 assert.equal(duration,2);
 assert.match(a.node('relayProgress').textContent,/우리 팀 0% · 상대 팀 0% · 서버 진행/);
 player.x=0;player.z=0;
 const other=[...server.match.players.values()].find(p=>p!==player);
 other.x=8;other.z=0;
 a.doc('keydown',{code: 'KeyF',target:a.node('arena')});await settle();
 for(let i=0;i<60;i++){
  server.match.step();
  if(i===50)await a.heartbeat();
 }
 await a.poll();await b.poll();await settle();
 const progress=server.match.progress[player.team];
 const expected=Math.round(Math.min(1,Math.max(0,progress/duration))*100);
 assert.ok(expected>0&&expected<100);
 assert.match(a.node('relayProgress').textContent,new RegExp('우리 팀 '+expected+'%'));
 assert.match(b.node('relayProgress').textContent,new RegExp('상대 팀 '+expected+'%'));
 assert.doesNotMatch(a.node('relayProgress').textContent,/x:|z:|Player/);
 a.doc('keyup',{code: 'KeyF',target:a.node('arena')});await settle();
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/우리 팀 0%/);
 const markup=fs.readFileSync(path.join(__dirname,'../team.html'),'utf8');
 assert.match(markup,/id="relayProgress" aria-live="off"/);
});
test('PC team progress HUD never fabricates duration when a server omits it',async()=>{
 const server=backend();
 const incomplete={fetchLocal:async(route,opts)=>{
  const r=await server.fetchLocal(route,opts);
  if(route!=='/state'||!r.ok)return r;
  const state=await r.json();delete state.objective.requiredSeconds;
  return {...r,json:async()=>state};
 }};
 const a=boot(incomplete),b=boot(incomplete);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 assert.equal(server.match.phase,'playing');
 assert.equal(a.node('relayProgress').textContent,'중계 진행 기록 없음');
});


test('ended PC team lobby reports authoritative rematch votes then begins only with two new consent packets',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 assert.equal(server.match.phase,'playing');
 server.match.finish('red','objective_score');
 await a.poll();await b.poll();await settle();
 assert.equal(server.match.phase,'ended');
 assert.match(a.node('status').textContent,/승리 팀 red/);
 assert.match(a.node('status').textContent,/중계기 점수 달성/);
 assert.match(a.node('status').textContent,/재대전 준비 0\/2/);
 a.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 assert.equal(server.match.phase,'ended','one player cannot silently start a new match');
 assert.match(a.node('status').textContent,/재대전 준비 1\/2/);
 assert.match(b.node('status').textContent,/재대전 준비 1\/2/);
 assert.match(a.node('status').textContent,/내 준비 확인/);
 b.node('ready').click();await settle();
 await a.poll();await b.poll();await settle();
 assert.equal(server.match.phase,'playing');
 assert.deepEqual(server.match.score,{red:0,blue:0});
 assert.match(a.node('score').textContent,/0 : 0/);
 assert.doesNotMatch(a.node('status').textContent,/재대전 준비/);
 const commands=server.requests.filter(x=>x.route==='/command'&&x.body?.type==='ready');
 assert.equal(commands.length,4,'two initial ready and two fresh rematch consents only');
});
test('ended PC team HUD never fabricates opponent rematch consent if lobby data is missing',async()=>{
 const server=backend();
 const missingLobby={fetchLocal:async(route,opts)=>{
  const response=await server.fetchLocal(route,opts);
  if(route!=='/state'||!response.ok)return response;
  const state=await response.json();
  state.lobby={};
  return {...response,json:async()=>state};
 }};
 const a=boot(missingLobby),b=boot(missingLobby);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 server.match.finish(null,'time_limit');
 await a.poll();await settle();
 assert.match(a.node('status').textContent,/동점 무승부/);
 assert.match(a.node('status').textContent,/재대전 준비 상태 확인 중/);
 assert.doesNotMatch(a.node('status').textContent,/[012]\/2/);
});


test('local 2D relay rings render only server-published 60Hz red/blue progress without adding viewport panels',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 assert.equal(server.match.phase,'playing');
 const ctx=a.node('arena').getContext(),arcs=[];
 const originalArc=ctx.arc,originalStroke=ctx.stroke;
 ctx.arc=(x,y,r,start,end)=>{arcs.push({x,y,r,start,end,color:ctx.strokeStyle});originalArc(x,y,r,start,end);};
 const colorAt=(r)=>arcs.find(entry=>entry.r===r);
 server.match.progress.red=.5;server.match.progress.blue=1;
 await a.poll();await settle();
 assert.ok(colorAt(32)&&colorAt(38),'red and blue team arcs must both use visible physical relay centre');
 assert.ok(Math.abs(colorAt(32).end-colorAt(32).start-Math.PI/2)<1e-8);
 assert.ok(Math.abs(colorAt(38).end-colorAt(38).start-Math.PI)<1e-8);
 assert.equal(colorAt(32).color,'#e58b84');
 assert.equal(colorAt(38).color,'#8abcf2');
 arcs.length=0;
 server.match.progress.red=0;server.match.progress.blue=0;
 await a.poll();await settle();
 assert.equal(colorAt(32),undefined);
 assert.equal(colorAt(38),undefined,'empty server progress cannot display a fictitious partial capture');
 ctx.arc=originalArc;ctx.stroke=originalStroke;
});
test('team capture arcs fail closed for incomplete server measurements or ended matches',async()=>{
 const server=backend();
 let hideDuration=false,invalidProgress=false;
 const guarded={fetchLocal:async(route,options={})=>{
  const response=await server.fetchLocal(route,options);
  if(route!=='/state'||!response.ok)return response;
  const snapshot=await response.json();
  if(hideDuration)delete snapshot.objective.requiredSeconds;
  if(invalidProgress)snapshot.progress.red=NaN;
  return {...response,json:async()=>snapshot};
 }};
 const a=boot(guarded),b=boot(guarded);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 const arcs=[],ctx=a.node('arena').getContext(),original=ctx.arc;
 ctx.arc=(x,y,r,start,end)=>{arcs.push(r);original(x,y,r,start,end);};
 const show=async()=>{arcs.length=0;await a.poll();await settle();return arcs.filter(r=>r===32||r===38);};
 server.match.progress.red=1;
 hideDuration=true;
 assert.deepEqual(await show(),[]);
 hideDuration=false;invalidProgress=true;
 assert.deepEqual(await show(),[]);
 invalidProgress=false;
 server.match.finish('red','objective_score');
 assert.deepEqual(await show(),[],'finished round must not keep rendering a claimed ongoing capture');
});


test('team PC relay HUD displays only its authenticated self interaction status',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/중계기 가까이 이동/);
 const token=a.storage.get('veilpoint.team.tabSession');
 const own=server.match.players.get(token),other=[...server.match.players.values()].find(x=>x!==own);
 own.x=0;own.z=0;
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/상호작용 키 누르기/);
 own.direction={x:1,z:0};
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/중계기에서 정지/);
 own.direction={x:0,z:0};
 own.captureHeld=true;own.captureArmed=false;
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/조작 키를 놓고 다시 누르기/);
 // The opponent may occupy the objective unseen. Do not disclose that fact.
 other.x=0;other.z=0;
 const before=a.node('relayProgress').textContent;
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/중계기/);
 assert.doesNotMatch(a.node('relayProgress').textContent,/상대 위치|상대 점령 중|경쟁자 감지/);
 assert.doesNotMatch(before,/상대 위치|상대 점령 중|경쟁자 감지/);
});


test('team local relay guidance shows only authenticated own distance to the public interaction radius',async()=>{
 const server=backend(),a=boot(server),b=boot(server);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 const t=a.storage.get('veilpoint.team.tabSession');
 const me=server.match.players.get(t);
 assert.ok(me&&server.match.phase==='playing');
 const radius=server.match.snapshot(t).objective.radius;
 const expected=Math.ceil(Math.max(0,Math.hypot(me.x,me.z)-radius));
 assert.match(a.node('relayProgress').textContent,new RegExp('접근까지 약 '+expected+'m'));
 const other=[...server.match.players.values()].find(p=>p!==me);
 other.x=0;other.z=0;
 const previous=a.node('relayProgress').textContent;
 await a.poll();await settle();
 assert.equal(a.node('relayProgress').textContent,previous,
  'private opponent presence cannot modify public relay approach guidance');
 me.x=0;me.z=0;
 await a.poll();await settle();
 assert.match(a.node('relayProgress').textContent,/상호작용 키 누르기/);
 assert.doesNotMatch(a.node('relayProgress').textContent,/접근까지 약/);
});
test('team relay HUD does not guess reach distance when public objective geometry is invalid',async()=>{
 const server=backend(),hidden={fetchLocal:async(route,opts)=>{
  const response=await server.fetchLocal(route,opts);
  if(route!=='/state'||!response.ok)return response;
  const state=await response.json();state.objective.radius=NaN;
  return {...response,json:async()=>state};
 }};
 const a=boot(hidden),b=boot(hidden);
 a.node('join').click();b.node('join').click();await settle();
 a.node('ready').click();b.node('ready').click();await settle();
 await a.poll();await settle();
 assert.equal(server.match.phase,'playing');
 assert.match(a.node('relayProgress').textContent,/중계기 가까이 이동/);
 assert.doesNotMatch(a.node('relayProgress').textContent,/접근까지 약/);
});


test('malformed local join response never persists a fake team identity or consumes another seat',async()=>{
 for(const invalid of [null,[],{token:'not-a-session'},{}]){
  const server=backend();
  let corrupt=true;
  const adapter={fetchLocal:async(route,options)=>{
   const response=await server.fetchLocal(route,options);
   if(route==='/join'&&corrupt){
    corrupt=false;
    return {...response,json:async()=>invalid};
   }
   return response;
  }};
  const storage=new Map(),a=boot(adapter,storage);
  a.node('join').click();await settle();
  assert.equal(server.match.players.size,1,'first join reached the authoritative server');
  assert.equal(a.node('join').disabled,false,'invalid acknowledgement permits safe retry');
  assert.equal(storage.has('veilpoint.team.tabSession'),false,
   'a fake token must never enter persistent tab identity');
  assert.match(a.node('status').textContent,/서버 응답 형식 오류/);
  const firstAttempt=storage.get('veilpoint.team.pendingJoin');
  assert.match(firstAttempt,/^[a-f0-9]{32}$/);
  a.node('join').click();await settle();
  assert.equal(server.match.players.size,1,'retry with same attempt reuses server seat');
  assert.equal(storage.get('veilpoint.team.tabSession'),[...server.match.players.keys()][0]);
  assert.equal(storage.has('veilpoint.team.pendingJoin'),false);
 }
});
