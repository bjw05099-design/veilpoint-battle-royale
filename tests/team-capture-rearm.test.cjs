'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');

test('held capture renewals score once; only release then fresh press can transmit again', () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  m.players.get('a').x = 0;
  m.players.get('b').x = 8;
  let seq = 2;
  m.command('a', {seq, type: 'capture', active: true});
  for (let i = 0; i < 240; i++) {
    m.step();
    if ((i + 1) % 60 === 0)
      m.command('a', {seq: ++seq, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1, 'repeating held commands cannot score twice');
  assert.equal(m.snapshot('a').self.captureArmed, false);
  m.command('a', {seq: ++seq, type: 'capture', active: true});
  for (let i = 0; i < 60; i++) m.step();
  assert.equal(m.score.red, 1, 'one more renewal cannot bypass the release');
  m.command('a', {seq: ++seq, type: 'capture', active: false});
  assert.equal(m.snapshot('a').self.captureArmed, false);
  m.command('a', {seq: ++seq, type: 'capture', active: true});
  assert.equal(m.snapshot('a').self.captureArmed, true);
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: ++seq, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 2);
  assert.equal(m.snapshot('a').self.captureArmed, false);
  assert.equal(m.phase, 'playing');
  assert.deepEqual(m.score, {red: 2, blue: 0});
});

test('round finish and restart cannot inherit a prearmed capture intent', () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  // A legitimate prearmed relay must be physically in range first.
  m.players.get('a').x = 0;
  m.command('a', {seq: 2, type: 'capture', active: true});
  assert.equal(m.players.get('a').captureArmed, true);
  m.finish('red', 'test');
  assert.equal(m.players.get('a').captureArmed, false);
  m.command('a', {seq: 3, type: 'ready'});
  m.command('b', {seq: 2, type: 'ready'});
  assert.equal(m.phase, 'playing');
  assert.equal(m.players.get('a').captureArmed, false);
  assert.equal(m.players.get('a').capturing, false);
});

test('firing cannot disguise a held capture key as a fresh re-arm press', () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  const a = m.players.get('a');
  a.x = 0;
  m.players.get('b').x = 8;
  m.command('a', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 3, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1);
  assert.equal(a.captureHeld, true);
  m.command('a', {seq: 4, type: 'fire'});
  assert.equal(a.capturing, false, 'shot interrupts the interaction');
  m.command('a', {seq: 5, type: 'capture', active: true});
  assert.equal(a.captureArmed, false, 'renewed held intent is not a new physical press');
  m.command('a', {seq: 6, type: 'capture', active: false});
  m.command('a', {seq: 7, type: 'capture', active: true});
  assert.equal(a.captureArmed, true);
});
