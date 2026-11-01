'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, INPUT_LEASE_TICKS} = require('../src/team-match.cjs');
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

test('PC crouch is a slower, server-owned 60Hz stance with finite equipment unchanged', () => {
  const walk = started(), crouch = started();
  walk.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  crouch.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  crouch.command('a', {seq: 3, type: 'crouch', active: true});
  for (let i = 0; i < 60; i++) {walk.step(); crouch.step();}
  const walked = walk.players.get('a').x + 8;
  const crouched = crouch.players.get('a').x + 8;
  assert.ok(Math.abs(walked - 4.5) < 1e-8);
  assert.ok(Math.abs(crouched / walked - 3.1 / 6.1) < 1e-8);
  assert.equal(crouch.ticks, 60);
  assert.equal(crouch.snapshot('a').self.crouching, true);
  assert.equal(crouch.snapshot('b').visible.find(p => p.team === 'red').crouching, true,
    'only a physically visible opponent receives stance information');
  assert.equal(crouch.players.get('a').ammo, walk.players.get('a').ammo);
  assert.equal(crouch.players.get('a').reserve, walk.players.get('a').reserve);
  assert.equal(crouch.players.get('a').health, 100);
});

test('crouch is validated, expires without renewals and clears on PC reset and round end', () => {
  const m = started();
  const p = m.players.get('a');
  assert.throws(() => m.command('a', {seq: 2, type: 'crouch', active: 'true'}), /invalid_crouch/);
  assert.throws(() => m.command('a', {seq: 2, type: 'crouch', active: true, speed: 99}), /invalid_command/);
  assert.equal(p.seq, 1, 'invalid posture cannot renew a session or consume sequence');
  assert.equal(m.command('a', {seq: 2, type: 'crouch', active: true}).crouching, true);
  for (let i = 0; i < INPUT_LEASE_TICKS; i++) m.step();
  assert.equal(p.crouching, true, 'lease is inclusive at its final tick');
  m.step();
  assert.equal(p.crouching, false, 'stale held posture must expire');
  m.command('a', {seq: 3, type: 'crouch', active: true});
  m.command('a', {seq: 4, type: 'resetInput'});
  assert.equal(p.crouching, false, 'tab refresh clears ghost crouch atomically');
  m.command('a', {seq: 5, type: 'crouch', active: true});
  m.finish(null, 'time_limit');
  assert.equal(p.crouching, false);
  m.command('a', {seq: 6, type: 'ready'});
  m.command('b', {seq: 2, type: 'ready'});
  assert.equal(m.phase, 'playing');
  assert.equal(p.crouching, false, 'rematch cannot inherit the previous round stance');
});

test('loopback HTTP only accepts authenticated, boolean crouch and publishes it through sight', async () => {
  const server = createTeamServer({port: 0, autoTick: false, now: () => 0});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, data, token) => {
    const response = await fetch(base + path, {method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(data)});
    return {status: response.status, body: await response.json()};
  };
  const state = async token => {
    const response = await fetch(base + '/state', {headers: {'x-player-token': token}});
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const a = (await post('/join', {name: 'A'})).body;
    const b = (await post('/join', {name: 'B'})).body;
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    assert.equal((await post('/command', {seq: 2, type: 'crouch', active: 1}, a.token)).status, 400);
    assert.equal((await post('/command', {seq: 2, type: 'crouch', active: true}, a.token)).status, 200);
    assert.equal((await state(a.token)).self.crouching, true);
    assert.equal((await state(b.token)).visible.find(p => p.team === 'red').crouching, true);
    await post('/command', {seq: 3, type: 'crouch', active: false}, a.token);
    assert.equal((await state(a.token)).self.crouching, false);
  } finally {await server.close();}
});
