'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const {TeamMatch} = require('../src/team-match.cjs');

test('default server lease clock is monotonic rather than adjustable wall time', () => {
  const before = performance.now();
  const match = new TeamMatch();
  const sample = match.now();
  const after = performance.now();
  assert.ok(sample >= before && sample <= after,
    'session timeouts must use the same monotonic timebase as server pacing');
});

test('simultaneous expired sessions resolve fairly with one clock read', () => {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'A');
  match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  let samples = 0;
  match.now = () => (++samples === 1 ? 31001 : 0);
  match.step();
  assert.equal(samples, 1, 'one authoritative timestamp for both participants');
  assert.equal(match.phase, 'ended');
  assert.equal(match.reason, 'connection_timeout');
  assert.equal(match.winner, null, 'both expired participants cannot award a win');
});

test('lobby reclamation evaluates both participants at one timestamp', () => {
  const match = new TeamMatch({now: () => 0});
  match.join('a', 'A');
  match.join('b', 'B');
  let samples = 0;
  match.now = () => (++samples === 1 ? 0 : 31001);
  match.pruneIdleWaitingPlayers();
  assert.equal(samples, 1, 'lobby sweep must not mix different clock instants');
  assert.equal(match.players.size, 2);
});
