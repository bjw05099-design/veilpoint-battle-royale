'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTeamServer} = require('../server/team-server.cjs');
test('two independent HTTP clients join, ready, move, observe authoritative objective state', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, token, origin) => {
    const res = await fetch(base + path, {method: 'POST', headers: {'content-type': 'application/json',
      ...(token ? {'x-player-token': token} : {}), ...(origin ? {origin} : {})}, body: JSON.stringify(body)});
    return {status: res.status, data: await res.json()};
  };
  const state = async token => {
    const res = await fetch(base + '/state', {headers: {'x-player-token': token}});
    return {status: res.status, data: await res.json()};
  };
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /DISTRICT CONTROL/);
    assert.match(await (await fetch(base + '/team-client.js')).text(), /updateInput/);
    const a = await post('/join', {name: 'Captain A'});
    const b = await post('/join', {name: 'Captain B'});
    assert.equal(a.status, 201);assert.equal(b.status, 201);
    assert.notEqual(a.data.token, b.data.token);
    assert.equal((await post('/join', {name: 'Third'})).status, 400);
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, a.data.token)).status, 200);
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, b.data.token)).status, 200);
    assert.equal((await state(a.data.token)).data.phase, 'playing');
    assert.equal((await post('/command', {seq: 2, type: 'move', direction: {x: 1, z: 0}}, a.data.token)).status, 200);
    for (let i = 0; i < 107; i++) server.match.step();
    assert.ok((await state(a.data.token)).data.self.x > -1);
    assert.equal((await post('/command', {seq: 2, type: 'ready'}, a.data.token)).status, 400);
    assert.equal((await post('/command', {seq: 3, type: 'capture', active: true}, a.data.token, 'https://attacker.example')).status, 403);
    assert.equal((await state('invalid')).status, 400);
    assert.deepEqual((await state(a.data.token)).data.score, {red: 0, blue: 0});
    assert.equal((await post('/command', {seq: 4, type: 'move', direction: {x: 0, z: 0}}, a.data.token)).status, 200);
    assert.equal((await post('/command', {seq: 5, type: 'capture', active: true}, a.data.token)).status, 200);
    for (let i = 0; i < 360; i++) server.match.step();
    const result = (await state(b.data.token)).data;
    assert.equal(result.phase, 'ended');
    assert.equal(result.winner, 'red');
    assert.equal(result.score.red, 3);
    assert.equal(result.score.blue, 0);
  } finally {await server.close();}
});

test('HTTP heartbeat renews the authoritative lease while state reads do not', async () => {
  let now = 0;
  const server = createTeamServer({port: 0, autoTick: false, now: () => now});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {method: 'POST', headers: {
      'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})
    }, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  try {
    const a = (await post('/join', {name: 'A'})).body;
    const b = (await post('/join', {name: 'B'})).body;
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    now = 25000;
    assert.equal((await fetch(base + '/state', {headers: {'x-player-token': a.token}})).status, 200);
    assert.equal((await post('/command', {seq: 2, type: 'heartbeat'}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: 2, type: 'heartbeat'}, b.token)).status, 200);
    now = 35000; server.match.step();
    assert.equal(server.match.phase, 'playing');
    now = 56000; server.match.step();
    assert.equal(server.match.reason, 'connection_timeout');
  } finally {await server.close();}
});

test('guest refresh can resume server-owned sequence and neutralize held inputs', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, token) => {
    const res = await fetch(base + path, {method: 'POST', headers: {
      'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})
    }, body: JSON.stringify(body)});
    return {status: res.status, body: await res.json()};
  };
  const state = async token => (await (await fetch(base + '/state', {
    headers: {'x-player-token': token}
  })).json());
  try {
    const a = (await post('/join', {name: 'A'})).body;
    const b = (await post('/join', {name: 'B'})).body;
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    await post('/command', {seq: 2, type: 'move', direction: {x: 1, z: 0}}, a.token);
    await post('/command', {seq: 3, type: 'capture', active: true}, a.token);
    const before = await state(a.token);
    assert.equal(before.self.seq, 3);
    assert.equal((await post('/command', {seq: before.self.seq + 1, type: 'move',
      direction: {x: 0, z: 0}}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: before.self.seq + 2, type: 'capture',
      active: false}, a.token)).status, 200);
    assert.equal(server.match.players.get(a.token).capturing, false);
    assert.deepEqual(server.match.players.get(a.token).direction, {x: 0, z: 0});
    assert.equal((await state(a.token)).self.seq, 5);
    assert.equal(server.match.players.size, 2, 'refresh must not allocate a third player');
  } finally {await server.close();}
});


test('two HTTP clients cannot disclose a rear contact or spoof facing in snapshots', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (body, token) => {
    const response = await fetch(base + '/command', {method: 'POST', headers: {
      'content-type': 'application/json', 'x-player-token': token
    }, body: JSON.stringify(body)});
    return response.status;
  };
  try {
    const join = async name => (await (await fetch(base + '/join', {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({name})})).json());
    const a = await join('A'), b = await join('B');
    assert.equal(await post({seq: 1, type: 'ready'}, a.token), 200);
    assert.equal(await post({seq: 1, type: 'ready'}, b.token), 200);
    server.match.players.get(a.token).x = 0;
    server.match.players.get(b.token).x = -5;
    const snapshot = async () => (await (await fetch(base + '/state', {
      headers: {'x-player-token': a.token}
    })).json());
    assert.deepEqual((await snapshot()).visible.map(p => p.team), ['red']);
    assert.equal(await post({seq: 2, type: 'move', direction: {x: -1, z: 0},
      facing: {x: 1, z: 0}}, a.token), 400);
    assert.equal(await post({seq: 2, type: 'move', direction: {x: -1, z: 0}}, a.token), 200);
    assert.deepEqual((await snapshot()).visible.map(p => p.team), ['red', 'blue']);
  } finally {await server.close();}
});

test('HTTP server rejects client-authored damage and applies finite combat on the server', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {method: 'POST', headers: {
      'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})
    }, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  try {
    const a = (await post('/join', {name: 'A'})).body;
    const b = (await post('/join', {name: 'B'})).body;
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    const attacker = server.match.players.get(a.token);
    const defender = server.match.players.get(b.token);
    attacker.x = 0; attacker.z = 0; defender.x = 5; defender.z = 0;
    assert.equal((await post('/command', {seq: 2, type: 'fire', damage: 999}, a.token)).status, 400);
    assert.equal(defender.health, 100);
    const shot = await post('/command', {seq: 2, type: 'fire'}, a.token);
    assert.equal(shot.status, 200);
    assert.equal(shot.body.hit, true);
    assert.equal(defender.health, 66);
    const view = await fetch(base + '/state', {headers: {'x-player-token': a.token}});
    const snapshot = await view.json();
    assert.equal(snapshot.self.ammo, 11);
    assert.equal(snapshot.self.health, 100);
    assert.ok(snapshot.visible.every(p => !Object.hasOwn(p, 'health')));
    assert.equal((await post('/command', {seq: 3, type: 'reload'}, a.token)).status, 200);
    assert.equal(attacker.reloadTicks, 90);
    assert.equal((await post('/command', {seq: 4, type: 'fire'}, a.token)).body.reason, 'reloading');
  } finally {await server.close();}
});

test('HTTP origin validation rejects cross-scheme and opaque origins without 500', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const join = origin => fetch(base + '/join', {method: 'POST', headers: {
    'content-type': 'application/json', origin
  }, body: JSON.stringify({name: 'A'})});
  try {
    const wrongScheme = await join(`https://127.0.0.1:${port}`);
    assert.equal(wrongScheme.status, 403);
    assert.equal((await wrongScheme.json()).error, 'cross_origin');
    const opaque = await join('null');
    assert.equal(opaque.status, 403);
    assert.equal((await opaque.json()).error, 'cross_origin');
    const other = await join('http://attacker.example');
    assert.equal(other.status, 403);
    const same = await join(base);
    assert.equal(same.status, 201);
    assert.equal(same.headers.get('cross-origin-resource-policy'), 'same-origin');
    const page = await fetch(base + '/');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
  } finally {await server.close();}
});

test('HTTP request body cap counts UTF-8 bytes, not JavaScript characters', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    const oversized = await fetch(base + '/join', {method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name: '가'.repeat(700)})});
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, 'body_too_large');
    assert.equal(server.match.players.size, 0);
    const valid = await fetch(base + '/join', {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({name: 'A'})});
    assert.equal(valid.status, 201);
  } finally {await server.close();}
});
