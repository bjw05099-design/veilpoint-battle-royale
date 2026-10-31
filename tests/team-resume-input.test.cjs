'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');
const setup = () => {
  const match = new TeamMatch();
  match.join('a', 'Alpha'); match.join('b', 'Bravo');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  return match;
};
test('PC resume cancels objective progress without banking a point or adding ammo', () => {
  const match = setup(), player = match.players.get('a'), opponent = match.players.get('b');
  player.x = 0; player.z = 0; opponent.x = 8; opponent.z = 0;
  match.command('a', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) match.step();
  assert.ok(match.progress.red > 0);
  const ammo = player.ammo, reserve = player.reserve;
  assert.deepEqual(match.command('a', {seq: 3, type: 'resetInput'}), {ok: true});
  assert.equal(match.progress.red, 0);
  assert.equal(player.capturing, false);
  assert.equal(player.captureHeld, false);
  assert.equal(player.captureArmed, false);
  for (let i = 0; i < 180; i++) match.step();
  assert.equal(match.score.red, 0);
  assert.equal(player.ammo, ammo);
  assert.equal(player.reserve, reserve);
  match.command('a', {seq: 4, type: 'capture', active: true});
  assert.equal(player.captureArmed, true, 'fresh physical press still works');
});
test('PC resume clears movement, pointer aim and held fire in one 60Hz-safe command', () => {
  const match = setup(), player = match.players.get('a');
  match.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  match.command('a', {seq: 3, type: 'aim', direction: {x: 0, z: 1}});
  match.command('a', {seq: 4, type: 'trigger', active: true});
  match.step();
  const rounds = player.ammo, position = {x: player.x, z: player.z};
  match.command('a', {seq: 5, type: 'resetInput'});
  assert.deepEqual(player.direction, {x: 0, z: 0});
  assert.equal(player.aiming, false);
  assert.equal(player.triggerHeld, false);
  for (let i = 0; i < 120; i++) match.step();
  assert.equal(player.ammo, rounds, 'ghost trigger cannot fire after refresh');
  assert.deepEqual({x: player.x, z: player.z}, position, 'ghost movement cannot continue');
});
test('resetInput rejects extra fields and replayed sequence without mutation', () => {
  const match = setup(), player = match.players.get('a');
  match.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  assert.throws(() => match.command('a', {seq: 3, type: 'resetInput', direction: {x: 0, z: 0}}), /invalid_command/);
  assert.equal(player.direction.x, 1);
  assert.equal(player.seq, 2);
  match.command('a', {seq: 3, type: 'resetInput'});
  assert.throws(() => match.command('a', {seq: 3, type: 'resetInput'}), /invalid_sequence/);
});
test('two HTTP clients reset only the resumed seat', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const join = async name => {
    const response = await fetch(base + '/join', {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({name})});
    assert.equal(response.status, 201);
    return (await response.json()).token;
  };
  const command = (token, body) => fetch(base + '/command', {method: 'POST',
    headers: {'content-type': 'application/json', 'x-player-token': token},
    body: JSON.stringify(body)});
  try {
    const a = await join('Alpha'), b = await join('Bravo');
    await command(a, {seq: 1, type: 'ready'});
    await command(b, {seq: 1, type: 'ready'});
    await command(a, {seq: 2, type: 'move', direction: {x: 1, z: 0}});
    await command(b, {seq: 2, type: 'move', direction: {x: -1, z: 0}});
    const response = await command(a, {seq: 3, type: 'resetInput'});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok: true});
    assert.deepEqual(server.match.players.get(a).direction, {x: 0, z: 0});
    assert.deepEqual(server.match.players.get(b).direction, {x: -1, z: 0});
    assert.equal(server.match.phase, 'playing');
  } finally {await server.close();}
});
