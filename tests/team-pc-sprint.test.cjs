'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, INPUT_LEASE_TICKS, SPRINT_SPEED_FACTOR, SPRINT_RESTART_STAMINA} =
  require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

function started() {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'Alpha');
  match.join('b', 'Bravo');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'playing');
  return match;
}

test('PC Shift sprint changes real server movement at fixed 60Hz and spends finite stamina', () => {
  const walking = started(), running = started();
  walking.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  running.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  running.command('a', {seq: 3, type: 'sprint', active: true});
  for (let i = 0; i < 60; i++) {walking.step(); running.step();}
  const walked = walking.players.get('a').x + 8;
  const ran = running.players.get('a').x + 8;
  assert.ok(Math.abs(ran / walked - SPRINT_SPEED_FACTOR) < 1e-8);
  assert.equal(walking.players.get('a').stamina, 100);
  assert.ok(running.players.get('a').stamina < 100);
  assert.equal(running.snapshot('a').self.sprinting, true);
  assert.equal(running.snapshot('b').visible.find(p => p.team === 'red').stamina, undefined,
    'an opponent never receives private stamina data');
  assert.equal(running.players.get('a').ammo, walking.players.get('a').ammo);
  assert.equal(running.players.get('a').reserve, walking.players.get('a').reserve);
});

test('crouch overrides sprint, standing still or hitting a boundary cannot consume exertion', () => {
  const m = started(), p = m.players.get('a');
  m.command('a', {seq: 2, type: 'sprint', active: true});
  m.command('a', {seq: 3, type: 'crouch', active: true});
  m.command('a', {seq: 4, type: 'move', direction: {x: 1, z: 0}});
  for (let i = 0; i < 30; i++) m.step();
  assert.equal(p.sprinting, false);
  assert.equal(p.stamina, 100);
  m.command('a', {seq: 5, type: 'crouch', active: false});
  m.step();
  assert.equal(p.sprinting, true);
  const after = p.stamina;
  m.command('a', {seq: 6, type: 'move', direction: {x: 0, z: 0}});
  m.step();
  assert.equal(p.sprinting, false);
  assert.ok(p.stamina > after, 'stationary exertion recovers rather than draining');
});

test('sprint fatigue locks out repeated acceleration until physically recovered', () => {
  const m = started(), p = m.players.get('a');
  let seq = 2;
  m.command('a', {seq: seq++, type: 'sprint', active: true});
  for (let tick = 0; tick < 540; tick++) {
    if (tick % 60 === 0) {
      const direction = Math.floor(tick / 60) % 2 ? -1 : 1;
      m.command('a', {seq: seq++, type: 'move', direction: {x: direction, z: 0}});
      m.command('a', {seq: seq++, type: 'sprint', active: true});
    }
    m.step();
  }
  assert.equal(p.sprintExhausted, true);
  assert.equal(p.sprinting, false);
  assert.ok(p.stamina < SPRINT_RESTART_STAMINA);
  m.command('a', {seq: seq++, type: 'sprint', active: false});
  m.command('a', {seq: seq++, type: 'move', direction: {x: 0, z: 0}});
  for (let i = 0; i < 230; i++) m.step();
  assert.ok(p.stamina >= SPRINT_RESTART_STAMINA);
  assert.equal(p.sprintExhausted, false);
  assert.equal(p.ammo, 12);
});

test('sprint rejects forged input, expires on lost focus and resets on rematch', () => {
  const m = started(), p = m.players.get('a');
  assert.throws(() => m.command('a', {seq: 2, type: 'sprint', active: 1}), /invalid_sprint/);
  assert.throws(() => m.command('a', {seq: 2, type: 'sprint', active: true, speed: 99}), /invalid_command/);
  assert.equal(p.seq, 1);
  m.command('a', {seq: 2, type: 'sprint', active: true});
  m.command('a', {seq: 3, type: 'move', direction: {x: 1, z: 0}});
  for (let i = 0; i <= INPUT_LEASE_TICKS; i++) m.step();
  assert.equal(p.sprintHeld, false);
  assert.equal(p.sprinting, false);
  m.command('a', {seq: 4, type: 'sprint', active: true});
  m.command('a', {seq: 5, type: 'resetInput'});
  assert.equal(p.sprintHeld, false);
  m.command('a', {seq: 6, type: 'sprint', active: true});
  m.finish(null, 'time_limit');
  assert.equal(p.sprintHeld, false);
  m.command('a', {seq: 7, type: 'ready'});
  m.command('b', {seq: 2, type: 'ready'});
  assert.equal(p.stamina, 100);
  assert.equal(p.sprintExhausted, false);
  assert.equal(p.sprintHeld, false);
});

test('loopback two-client server owns sprint input and publishes only self stamina', async () => {
  const server = createTeamServer({port: 0, autoTick: false, now: () => 0});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, body, token) => {
    const res = await fetch(base + path, {method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(body)});
    return {status: res.status, body: await res.json()};
  };
  const state = async token => {
    const res = await fetch(base + '/state', {headers: {'x-player-token': token}});
    assert.equal(res.status, 200);
    return res.json();
  };
  try {
    const a = (await post('/join', {name: 'A'})).body;
    const b = (await post('/join', {name: 'B'})).body;
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    assert.equal((await post('/command', {seq: 2, type: 'sprint', active: 'true'}, a.token)).status, 400);
    assert.equal((await post('/command', {seq: 2, type: 'sprint', active: true}, a.token)).status, 200);
    await post('/command', {seq: 3, type: 'move', direction: {x: 1, z: 0}}, a.token);
    for (let i = 0; i < 30; i++) server.match.step();
    assert.ok((await state(a.token)).self.stamina < 100);
    const other = await state(b.token);
    assert.equal(other.visible.find(p => p.team === 'red').stamina, undefined);
    await post('/command', {seq: 4, type: 'sprint', active: false}, a.token);
    assert.equal(server.match.players.get(a.token).sprintHeld, false);
  } finally {await server.close();}
});
