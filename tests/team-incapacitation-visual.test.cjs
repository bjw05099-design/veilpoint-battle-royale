'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, FIRE_INTERVAL_TICKS} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

function startedMatch() {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'Red'); match.join('b', 'Blue');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  return match;
}
function completeFiniteExchange(match) {
  for (let seq = 2; seq <= 4; seq++) {
    const result = match.command('a', {seq, type: 'fire'});
    assert.equal(result.ok, true);
    if (seq < 4) for (let tick = 0; tick < FIRE_INTERVAL_TICKS; tick++) match.step();
  }
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, 'red');
}

test('actual finite combat reports a visible incapacitated actor without leaking opponent HP', () => {
  const match = startedMatch();
  assert.equal(match.snapshot('a').visible.find(p => p.team === 'blue').incapacitated, false);
  completeFiniteExchange(match);
  const actors = match.snapshot('a').visible;
  assert.equal(actors.find(p => p.team === 'blue').incapacitated, true);
  assert.equal(actors.find(p => p.team === 'red').incapacitated, false);
  assert.ok(actors.every(p => !Object.hasOwn(p, 'health') && !Object.hasOwn(p, 'stress')));
  assert.equal(match.players.get('a').ammo, 9, 'only three actual shots consume ammunition');
});

test('an incapacitated actor behind opaque cover is not remotely revealed', () => {
  const match = startedMatch();
  const red = match.players.get('a'), blue = match.players.get('b');
  red.x = -4; red.z = 6; blue.x = 4; blue.z = 6;
  blue.health = 0;
  match.finish('red', 'opponent_incapacitated');
  assert.deepEqual(match.snapshot('a').visible.map(p => p.team), ['red']);
  assert.equal(match.snapshot('b').visible.find(p => p.team === 'blue').incapacitated, true);
});

test('fresh server-authoritative rematch clears the incapacitation cue', () => {
  const match = startedMatch();
  completeFiniteExchange(match);
  match.command('a', {seq: 5, type: 'ready'});
  match.command('b', {seq: 2, type: 'ready'});
  assert.equal(match.phase, 'playing');
  assert.equal(match.snapshot('a').visible.find(p => p.team === 'blue').incapacitated, false);
  assert.equal(match.snapshot('b').visible.find(p => p.team === 'red').incapacitated, false);
});

test('two HTTP clients receive the same grounded end-of-round state', async () => {
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {method: 'POST', headers: {
      'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})
    }, body: JSON.stringify(body)});
    assert.equal(response.status, path === '/join' ? 201 : 200);
    return response.json();
  };
  const getState = async token => {
    const response = await fetch(base + '/state', {headers: {'x-player-token': token}});
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const red = await post('/join', {name: 'Red'});
    const blue = await post('/join', {name: 'Blue'});
    await post('/command', {seq: 1, type: 'ready'}, red.token);
    await post('/command', {seq: 1, type: 'ready'}, blue.token);
    for (let seq = 2; seq <= 4; seq++) {
      await post('/command', {seq, type: 'fire'}, red.token);
      if (seq < 4) for (let i = 0; i < FIRE_INTERVAL_TICKS; i++) server.match.step();
    }
    const a = await getState(red.token), b = await getState(blue.token);
    assert.equal(a.phase, 'ended'); assert.equal(b.phase, 'ended');
    assert.equal(a.winner, 'red'); assert.equal(b.winner, 'red');
    assert.equal(a.visible.find(p => p.team === 'blue').incapacitated, true);
    assert.equal(b.visible.find(p => p.team === 'blue').incapacitated, true);
    assert.ok(a.visible.every(p => !Object.hasOwn(p, 'health')));
  } finally {await server.close();}
});
