'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, STEP, SPEED} = require('../src/team-match.cjs');

const BODY_DIAMETER = 1.1; // Two 0.55-unit actor collision radii.
function round(reverseOrder = false) {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');
  m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -0.58; a.z = 0;
  b.x = 0.58; b.z = 0;
  if (reverseOrder) {
    m.players.delete('a');
    m.players.set('a', a);
  }
  return {m, a, b};
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('head-on movement at the same 60Hz tick shares collision clearance fairly', () => {
  const run = reverse => {
    const {m, a, b} = round(reverse);
    m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
    m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
    m.step();
    assert.ok(distance(a, b) >= BODY_DIAMETER - 1e-8, 'no actor overlap');
    assert.ok(a.x > -0.58 && b.x < 0.58, 'both move until contact');
    assert.ok(Math.abs((a.x + 0.58) - (0.58 - b.x)) < 1e-9,
      'same-tick movement cannot favour the first player');
    return [a.x, b.x, m.ticks];
  };
  assert.deepEqual(run(false), run(true), 'reversing Map order cannot change the result');
  assert.deepEqual(run(false), run(false), '60Hz replay remains deterministic');
});

test('stationary actor is not displaced when another actor approaches', () => {
  const {m, a, b} = round();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.step();
  assert.equal(b.x, 0.58);
  assert.ok(a.x > -0.58);
  assert.ok(distance(a, b) >= BODY_DIAMETER - 1e-8);
});

test('parallel movement preserves speed without unnecessary collision slowdown', () => {
  const {m, a, b} = round();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.command('b', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.step();
  assert.ok(Math.abs(a.x - (-0.58 + SPEED * STEP)) < 1e-10);
  assert.ok(Math.abs(b.x - (0.58 + SPEED * STEP)) < 1e-10);
  assert.ok(distance(a, b) >= BODY_DIAMETER);
});

test('pre-existing overlap can separate but cannot be made deeper', () => {
  const outward = round();
  outward.a.x = -0.2;
  outward.b.x = 0.2;
  outward.m.command('a', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  outward.m.command('b', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  outward.m.step();
  assert.ok(distance(outward.a, outward.b) > 0.4);

  const inward = round(true);
  inward.a.x = -0.2;
  inward.b.x = 0.2;
  inward.m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  inward.m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  inward.m.step();
  assert.deepEqual([inward.a.x, inward.b.x], [-0.2, 0.2],
    'an invalid overlap cannot be exploited for further penetration');
});

test('two real HTTP clients receive the same server-resolved collision result', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, payload, token) => {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(payload)
    });
    return {status: response.status, body: await response.json()};
  };
  try {
    const a = (await post('/join', {name: 'Red'})).body;
    const b = (await post('/join', {name: 'Blue'})).body;
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: 1, type: 'ready'}, b.token)).status, 200);
    server.match.players.get(a.token).x = -0.58;
    server.match.players.get(b.token).x = 0.58;
    assert.equal((await post('/command', {seq: 2, type: 'move',
      direction: {x: 1, z: 0}}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: 2, type: 'move',
      direction: {x: -1, z: 0}}, b.token)).status, 200);
    assert.equal((await post('/command', {seq: 3, type: 'move',
      direction: {x: -1, z: 0}, x: 999}, b.token)).status, 400,
    'clients cannot override authoritative positions');
    server.match.step();
    const state = async token => {
      const response = await fetch(base + '/state', {headers: {'x-player-token': token}});
      assert.equal(response.status, 200);
      return (await response.json()).self;
    };
    const [red, blue] = await Promise.all([state(a.token), state(b.token)]);
    assert.ok(Math.abs(red.x + blue.x) < 1e-9);
    assert.ok(blue.x - red.x >= BODY_DIAMETER - 1e-8);
    assert.equal(red.health, 100);
    assert.equal(blue.health, 100);
  } finally {
    await server.close();
  }
});

test('swept glancing contact cannot tunnel through another actor with clear endpoints', () => {
  const play = reverse => {
    const {m, a, b} = round(reverse);
    // Both endpoints are > 1.1 apart, but their relative swept paths cross
    // inside the 1.1 collision diameter before the tick ends.
    a.x = -0.04; a.z = 0.549;
    b.x = 0.04; b.z = -0.549;
    const initial = distance(a, b);
    const rawEnd = Math.hypot(0.07, 1.098);
    assert.ok(initial > BODY_DIAMETER && rawEnd > BODY_DIAMETER);
    assert.ok(1.098 < BODY_DIAMETER, 'the midpoint would overlap');
    m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
    m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
    m.step();
    assert.ok(a.x < b.x, 'actors must stop at first contact, not pass through');
    assert.ok(a.x > -0.04 && b.x < 0.04, 'both participants advance fairly');
    assert.ok(distance(a, b) >= BODY_DIAMETER - 1e-8);
    return [a.x, a.z, b.x, b.z, m.ticks];
  };
  assert.deepEqual(play(false), play(true), 'collision is independent of join order');
  assert.deepEqual(play(false), play(false), '60Hz replay is deterministic');
});

test('swept collision does not slow a genuinely clear near-miss', () => {
  const {m, a, b} = round();
  a.x = -0.04; a.z = 0.56;
  b.x = 0.04; b.z = -0.56;
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  m.step();
  assert.ok(Math.abs(a.x - 0.035) < 1e-10);
  assert.ok(Math.abs(b.x + 0.035) < 1e-10);
  assert.ok(distance(a, b) > BODY_DIAMETER);
});

test('two authenticated HTTP clients cannot bypass a glancing swept collision', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, payload, token) => {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(payload)
    });
    return {status: response.status, body: await response.json()};
  };
  try {
    const a = (await post('/join', {name: 'Red'})).body;
    const b = (await post('/join', {name: 'Blue'})).body;
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    const red = server.match.players.get(a.token);
    const blue = server.match.players.get(b.token);
    red.x = -0.04; red.z = 0.549;
    blue.x = 0.04; blue.z = -0.549;
    assert.equal((await post('/command', {seq: 2, type: 'move',
      direction: {x: 1, z: 0}}, a.token)).status, 200);
    assert.equal((await post('/command', {seq: 2, type: 'move',
      direction: {x: -1, z: 0}}, b.token)).status, 200);
    server.match.step();
    const state = async token => (await (await fetch(base + '/state',
      {headers: {'x-player-token': token}})).json()).self;
    const [r, bl] = await Promise.all([state(a.token), state(b.token)]);
    assert.ok(r.x < bl.x);
    assert.ok(Math.hypot(r.x - bl.x, r.z - bl.z) >= BODY_DIAMETER - 1e-8);
    assert.equal(r.health, 100);
    assert.equal(bl.health, 100);
  } finally {
    await server.close();
  }
});
