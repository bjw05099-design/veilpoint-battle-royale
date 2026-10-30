'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');

function setup() {
  let now = 0;
  const match = new TeamMatch({now: () => now});
  match.join('a', 'A');match.join('b', 'B');
  match.command('a', {seq: 1, type: 'ready'});
  match.command('b', {seq: 1, type: 'ready'});
  return {match, advance: value => {now = value;}};
}

test('departing player cannot award a fictitious victory to an expired peer', () => {
  const {match, advance} = setup();
  advance(30001);
  assert.deepEqual(match.command('a', {seq: 2, type: 'leave'}), {ok: true});
  assert.equal(match.phase, 'ended');
  assert.equal(match.reason, 'player_left');
  assert.equal(match.winner, null);
  assert.equal(match.players.size, 1);
});

test('a genuinely connected peer still wins after voluntary departure', () => {
  const {match, advance} = setup();
  advance(25000);
  match.command('b', {seq: 2, type: 'heartbeat'});
  advance(30001);
  match.command('a', {seq: 2, type: 'leave'});
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, 'blue');
  assert.equal(match.reason, 'player_left');
});
