'use strict';
// Authoritative 60Hz match clock: a stalled but connected local match must end.
// These tests exercise actual TeamMatch rules and the two-client HTTP snapshot.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, ROUND_LIMIT_TICKS, CAPTURE_SECONDS, STEP} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

function playingPair() {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'Alpha');
  match.join('b', 'Bravo');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  assert.equal(match.phase, 'playing');
  return match;
}

test('an idle 60Hz team round ends exactly at its five-minute tick boundary', () => {
  const match = playingPair();
  assert.equal(ROUND_LIMIT_TICKS, 18000);
  match.ticks = ROUND_LIMIT_TICKS - 2;
  match.step();
  assert.equal(match.phase, 'playing');
  assert.equal(match.snapshot('a').round.remainingTicks, 1);
  match.step();
  assert.equal(match.phase, 'ended');
  assert.equal(match.reason, 'time_limit');
  assert.equal(match.winner, null);
  assert.deepEqual(match.score, {red: 0, blue: 0});
  assert.equal(match.snapshot('b').round.remainingTicks, 0);
  match.step();
  assert.equal(match.ticks, ROUND_LIMIT_TICKS, 'ended rounds cannot advance beyond the deadline');
});

test('a score lead is adjudicated by the server when time expires', () => {
  const match = playingPair();
  match.score.red = 2;
  match.score.blue = 1;
  match.ticks = ROUND_LIMIT_TICKS - 1;
  match.step();
  assert.equal(match.reason, 'time_limit');
  assert.equal(match.winner, 'red');
  assert.deepEqual(match.score, {red: 2, blue: 1});
});

test('a valid objective completed on the final tick beats the time limit', () => {
  const match = playingPair();
  const red = match.players.get('a');
  red.x = 0; red.z = 0;
  red.direction = {x: 0, z: 0};
  red.capturing = true;
  red.captureHeld = true;
  red.captureArmed = true;
  // The held capture intent must still have a valid 90-tick server lease.
  red.lastCaptureTick = ROUND_LIMIT_TICKS - 1;
  match.score.red = 2;
  match.progress.red = CAPTURE_SECONDS - STEP;
  match.ticks = ROUND_LIMIT_TICKS - 1;
  match.step();
  assert.equal(match.phase, 'ended');
  assert.equal(match.reason, 'objective_score');
  assert.equal(match.winner, 'red');
  assert.equal(match.score.red, 3);
});

test('a contested final tick cannot award unfinished objective progress', () => {
  const match = playingPair();
  const red = match.players.get('a');
  const blue = match.players.get('b');
  red.x = 0; red.z = 0;
  blue.x = 0; blue.z = 1.2;
  red.capturing = true; red.captureHeld = true; red.captureArmed = true;
  match.progress.red = CAPTURE_SECONDS - STEP;
  match.ticks = ROUND_LIMIT_TICKS - 1;
  match.step();
  assert.equal(match.reason, 'time_limit');
  assert.equal(match.winner, null);
  assert.equal(match.score.red, 0);
  assert.equal(match.progress.red, 0);
});

test('a rematch starts a fresh full timer and does not inherit the old winner', () => {
  const match = playingPair();
  match.score.blue = 1;
  match.ticks = ROUND_LIMIT_TICKS - 1;
  match.step();
  assert.equal(match.winner, 'blue');
  match.command('a', {seq: 2, type: 'ready'});
  match.command('b', {seq: 2, type: 'ready'});
  assert.equal(match.phase, 'playing');
  assert.equal(match.ticks, 0);
  assert.equal(match.reason, null);
  assert.equal(match.winner, null);
  assert.deepEqual(match.score, {red: 0, blue: 0});
  assert.equal(match.snapshot('a').round.remainingTicks, ROUND_LIMIT_TICKS);
});

test('both HTTP clients receive the same server-owned timeout and countdown', async () => {
  const server = createTeamServer({port: 0, autoTick: false, now: () => 0});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (route, body, token) => {
    const response = await fetch(base + route, {method: 'POST', headers: {
      'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})
    }, body: JSON.stringify(body)});
    assert.ok(response.ok);
    return response.json();
  };
  try {
    const a = await post('/join', {name: 'A'});
    const b = await post('/join', {name: 'B'});
    await post('/command', {seq: 1, type: 'ready'}, a.token);
    await post('/command', {seq: 1, type: 'ready'}, b.token);
    server.match.ticks = ROUND_LIMIT_TICKS - 1;
    server.match.step();
    for (const token of [a.token, b.token]) {
      const response = await fetch(base + '/state', {headers: {'x-player-token': token}});
      assert.equal(response.status, 200);
      const snapshot = await response.json();
      assert.equal(snapshot.phase, 'ended');
      assert.equal(snapshot.reason, 'time_limit');
      assert.equal(snapshot.winner, null);
      assert.deepEqual(snapshot.round, {limitTicks: ROUND_LIMIT_TICKS, remainingTicks: 0});
    }
  } finally {
    await server.close();
  }
});
