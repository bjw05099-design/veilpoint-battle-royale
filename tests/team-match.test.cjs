'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, WIN_SCORE} = require('../src/team-match.cjs');
const setup = () => {
  let now = 0;
  const m = new TeamMatch({now: () => now});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  return {m, setNow: n => {now = n;}};
};
test('two distinct players start a server-owned round with separated teams', () => {
  const {m} = setup();
  assert.equal(m.phase, 'playing');
  assert.equal(m.snapshot('a').self.team, 'red');
  assert.equal(m.snapshot('b').self.team, 'blue');
  assert.deepEqual(m.score, {red: 0, blue: 0});
});
test('movement is normalized and advanced by fixed 60Hz server steps, never client coordinates', () => {
  const {m} = setup();
  assert.throws(() => m.command('a', {seq: 2, type: 'move', direction: {x: 900, z: 0}}), /invalid_direction/);
  assert.throws(() => m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}, teleport: true}), /invalid_command/);
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 1}});
  for (let i = 0; i < 60; i++) m.step();
  const p = m.snapshot('a').self;
  assert.ok(Math.abs(Math.hypot(p.x + 8, p.z) - 4.5) < 1e-7);
  assert.equal(m.ticks, 60);
});
test('only uncontested physical presence accumulates objective score; no score injection', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 0; b.z = 0;
  assert.throws(() => m.command('a', {seq: 2, type: 'capture', active: true, score: 999}), /invalid_command/);
  m.command('a', {seq: 2, type: 'capture', active: true});
  m.command('b', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 240; i++) m.step();
  assert.equal(m.score.red, 0);
  m.command('b', {seq: 3, type: 'capture', active: false});
  for (let i = 0; i < 120; i++) m.step();
  assert.equal(m.score.red, 0, 'enemy physical presence must contest without holding capture');
  b.x = 8;
  for (let i = 0; i < 120 * WIN_SCORE; i++) m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.winner, 'red');
  assert.equal(m.score.red, WIN_SCORE);
});
test('replayed and malformed commands do not change authoritative state', () => {
  const {m} = setup();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  assert.throws(() => m.command('a', {seq: 2, type: 'move', direction: {x: -1, z: 0}}), /invalid_sequence/);
  assert.throws(() => m.command('a', {seq: 3, type: 'move', direction: {x: NaN, z: 0}}), /invalid_direction/);
  assert.throws(() => m.command('missing', {seq: 1, type: 'ready'}), /unknown_player/);
  assert.equal(m.players.get('a').seq, 2);
});
test('opponents outside proximity are not exposed in snapshots', () => {
  const {m} = setup();
  m.players.get('b').x = 24;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red']);
});
test('timeouts and departure terminate a round; ready players can replay', () => {
  const {m, setNow} = setup();
  setNow(31000);m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.reason, 'connection_timeout');
  m.command('a', {seq: 2, type: 'ready'});
  m.command('b', {seq: 2, type: 'ready'});
  assert.equal(m.phase, 'playing');
  m.command('a', {seq: 3, type: 'leave'});
  assert.equal(m.winner, 'blue');
  assert.equal(m.reason, 'player_left');
});
test('same command stream produces identical deterministic round state', () => {
  const play = () => {
    const {m} = setup();
    m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
    for (let i = 0; i < 100; i++) m.step();
    m.command('a', {seq: 3, type: 'capture', active: true});
    for (let i = 0; i < 120; i++) m.step();
    return m.snapshot('a');
  };
  assert.deepEqual(play(), play());
});
