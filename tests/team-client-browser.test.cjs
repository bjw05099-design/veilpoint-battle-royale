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
      else if (route === '/command') result = match.command(token, body);
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
      dataset: {}, getContext: () => ctx,
      addEventListener: (name, callback) => on(events, name, callback),
      dispatch: (name, event) => emit(events, name, event),
      click() {this.dispatch('click');}
    };
    nodes.set(id, value);
    return value;
  }
  const document = {
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
