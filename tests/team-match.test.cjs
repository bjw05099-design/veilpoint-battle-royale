'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, WIN_SCORE, INPUT_LEASE_TICKS} = require('../src/team-match.cjs');
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
  let aSeq = 2, bSeq = 2;
  m.command('a', {seq: aSeq, type: 'capture', active: true});
  m.command('b', {seq: bSeq, type: 'capture', active: true});
  for (let i = 0; i < 240; i++) {
    m.step();
    if ((i + 1) % 60 === 0) {
      m.command('a', {seq: ++aSeq, type: 'capture', active: true});
      m.command('b', {seq: ++bSeq, type: 'capture', active: true});
    }
  }
  assert.equal(m.score.red, 0);
  m.command('b', {seq: ++bSeq, type: 'capture', active: false});
  for (let i = 0; i < 120; i++) {
    m.step();
    if ((i + 1) % 60 === 0) m.command('a', {seq: ++aSeq, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 0, 'enemy physical presence must contest without holding capture');
  b.x = 8;
  for (let i = 0; i < 120 * WIN_SCORE; i++) {
    m.step();
    if (m.phase === 'playing' && (i + 1) % 60 === 0)
      m.command('a', {seq: ++aSeq, type: 'capture', active: true});
  }
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

test('server-owned cover blocks movement and prevents enemy location disclosure through walls', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -4; a.z = 6; b.x = 4; b.z = 6;
  assert.equal(m.snapshot('a').cover.length, 2);
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red']);
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  for (let i = 0; i < 120; i++) m.step();
  assert.ok(a.x > -4 && a.x <= -2.05 + 1e-8, 'player radius cannot cross cover');
  b.x = -4; b.z = 0;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red'], 'rear contact is not magically visible');
  m.command('a', {seq: 3, type: 'move', direction: {x: 0, z: -1}});
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red', 'blue']);
});

test('capture interruption resets partial score rather than banking an instant point', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 8;
  m.command('a', {seq: 2, type: 'capture', active: true});
  for (let i = 0; i < 90; i++) m.step();
  assert.ok(m.progress.red > 1.4);
  b.x = 0;
  m.step();
  assert.equal(m.progress.red, 0, 'contested progress resets');
  b.x = 8;
  for (let i = 0; i < 30; i++) m.step();
  assert.equal(m.score.red, 0, 'cannot score from previously banked progress');
  m.command('a', {seq: 3, type: 'capture', active: false});
  m.step();
  assert.equal(m.progress.red, 0, 'releasing capture resets');
  m.command('a', {seq: 4, type: 'capture', active: true});
  for (let i = 0; i < 120; i++) {
    m.step();
    if (i === 59) m.command('a', {seq: 5, type: 'capture', active: true});
  }
  assert.equal(m.score.red, 1);
});

test('read-only state polling does not renew a dead session; validated heartbeat does', () => {
  const stale = setup();
  stale.setNow(29999);
  stale.m.snapshot('a'); stale.m.snapshot('b');
  stale.setNow(30001);
  stale.m.step();
  assert.equal(stale.m.reason, 'connection_timeout');
  const live = setup();
  live.setNow(25000);
  live.m.command('a', {seq: 2, type: 'heartbeat'});
  live.m.command('b', {seq: 2, type: 'heartbeat'});
  assert.throws(() => live.m.command('a', {seq: 2, type: 'heartbeat'}), /invalid_sequence/);
  live.setNow(35000);
  live.m.step();
  assert.equal(live.m.phase, 'playing');
});


test('opponent visibility requires server-owned facing, range and clear cover, including after stopping', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = -5; b.z = 0;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red'], 'rear is hidden');
  assert.throws(() => m.command('a', {seq: 2, type: 'move',
    direction: {x: -1, z: 0}, facing: {x: 1, z: 0}}), /invalid_command/);
  m.command('a', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red', 'blue']);
  m.command('a', {seq: 3, type: 'move', direction: {x: 0, z: 0}});
  assert.deepEqual(m.snapshot('a').self.facing, {x: -1, z: 0});
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red', 'blue']);
  b.x = 0; b.z = 5;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red'], 'side is hidden');
  m.command('a', {seq: 4, type: 'move', direction: {x: 0, z: 1}});
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red', 'blue']);
  b.z = 15;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red'], 'far contact is hidden');
});

test('facing and visibility replay deterministically and reset at the next round', () => {
  const play = () => {
    const {m} = setup();
    m.command('a', {seq: 2, type: 'move', direction: {x: 0, z: 1}});
    for (let i = 0; i < 60; i++) m.step();
    m.command('a', {seq: 3, type: 'move', direction: {x: 0, z: 0}});
    const first = m.snapshot('a');
    m.finish('red', 'test');
    m.command('a', {seq: 4, type: 'ready'});
    m.command('b', {seq: 2, type: 'ready'});
    const second = m.snapshot('a');
    assert.deepEqual(second.self.facing, {x: 1, z: 0});
    return {first, second};
  };
  assert.deepEqual(play(), play());
});

test('server owns sight-gated combat; rear and cover cannot be hit or inferred as health', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = -5; b.z = 0;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red']);
  assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, false);
  assert.equal(b.health, 100, 'opponent behind player cannot be hit');
  for (let i = 0; i < 18; i++) m.step();
  a.x = -4; a.z = 6; b.x = 4; b.z = 6;
  assert.equal(m.command('a', {seq: 3, type: 'fire'}).hit, false);
  assert.equal(b.health, 100, 'solid cover blocks shots');
  assert.equal(m.snapshot('a').visible.some(p => 'health' in p), false,
    'remote health must not leak in opponent snapshots');
});

test('finite server-owned shots, cooldown and round-ending incapacitation are deterministic', () => {
  const run = () => {
    const {m} = setup();
    const a = m.players.get('a'), b = m.players.get('b');
    a.x = 0; a.z = 0; b.x = 5; b.z = 0;
    assert.throws(() => m.command('a', {seq: 2, type: 'fire', damage: 1000}), /invalid_command/);
    assert.throws(() => m.command('a', {seq: 2, type: 'fire', target: b.id}), /invalid_command/);
    assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, true);
    assert.deepEqual([a.ammo, b.health], [11, 66]);
    assert.equal(m.command('a', {seq: 3, type: 'fire'}).reason, 'cooldown');
    assert.deepEqual([a.ammo, b.health], [11, 66]);
    for (let i = 0; i < 18; i++) m.step();
    assert.equal(m.command('a', {seq: 4, type: 'fire'}).hit, true);
    assert.equal(b.health, 32);
    for (let i = 0; i < 18; i++) m.step();
    assert.equal(m.command('a', {seq: 5, type: 'fire'}).hit, true);
    assert.equal(b.health, 0);
    assert.equal(m.phase, 'ended');
    assert.equal(m.winner, 'red');
    assert.equal(m.reason, 'opponent_incapacitated');
    assert.throws(() => m.command('a', {seq: 6, type: 'fire'}), /not_playing/);
    return m.snapshot('a');
  };
  assert.deepEqual(run(), run(), 'identical 60Hz command streams yield identical results');
});

test('reload transfers finite carried ammunition once, never creates rounds', () => {
  const {m} = setup();
  const a = m.players.get('a');
  for (let shot = 0; shot < 12; shot++) {
    const result = m.command('a', {seq: 2 + shot, type: 'fire'});
    assert.equal(result.ok, true);
    for (let i = 0; i < 18; i++) m.step();
  }
  assert.deepEqual([a.ammo, a.reserve], [0, 24]);
  assert.equal(m.command('a', {seq: 14, type: 'fire'}).reason, 'empty_magazine');
  assert.equal(m.command('a', {seq: 15, type: 'reload'}).ok, true);
  assert.equal(m.command('a', {seq: 16, type: 'reload'}).reason, 'already_reloading');
  assert.equal(m.command('a', {seq: 17, type: 'fire'}).reason, 'reloading');
  for (let i = 0; i < 89; i++) m.step();
  assert.deepEqual([a.ammo, a.reserve, a.reloadTicks], [0, 24, 1]);
  m.step();
  assert.deepEqual([a.ammo, a.reserve, a.reloadTicks], [12, 12, 0]);
  assert.equal(a.ammo + a.reserve, 24);
  assert.equal(m.command('a', {seq: 18, type: 'reload'}).reason, 'magazine_full');
  m.finish('blue', 'test');
  m.command('a', {seq: 19, type: 'ready'});
  m.command('b', {seq: 2, type: 'ready'});
  assert.deepEqual([a.health, a.ammo, a.reserve, a.reloadTicks], [100, 12, 24, 0],
    'a fresh match resets inventory without replenishing during a round');
});

test('combat is refused in lobby and commands cannot spoof health or ammunition', () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a', 'A');
  assert.throws(() => m.command('a', {seq: 1, type: 'fire'}), /not_playing/);
  assert.throws(() => m.command('a', {seq: 1, type: 'reload'}), /not_playing/);
  m.join('b', 'B');
  m.command('a', {seq: 1, type: 'ready'});
  m.command('b', {seq: 1, type: 'ready'});
  assert.throws(() => m.command('a', {seq: 2, type: 'reload', reserve: 999}), /invalid_command/);
  assert.equal(m.snapshot('a').self.health, 100);
  assert.equal(m.snapshot('a').self.ammo, 12);
});

test('authoritative team bodies prevent head-on phasing at 60Hz', () => {
  const run = () => {
    const {m} = setup();
    const a = m.players.get('a'), b = m.players.get('b');
    a.x = -1.3; a.z = 0; b.x = 1.3; b.z = 0;
    m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
    m.command('b', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
    for (let i = 0; i < 120; i++) m.step();
    assert.ok(a.x < b.x, 'players must retain their physical order');
    assert.ok(b.x - a.x >= 1.1 - 1e-8, 'two standing bodies cannot overlap');
    assert.equal(m.phase, 'playing');
    return [a.x, b.x, m.ticks];
  };
  assert.deepEqual(run(), run(), 'actor collision is fixed-step deterministic');
});

test('legacy overlapping team positions can separate without a collision soft-lock', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 0; b.z = 0;
  m.command('a', {seq: 2, type: 'move', direction: {x: -1, z: 0}});
  m.command('b', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  for (let i = 0; i < 40; i++) m.step();
  assert.ok(a.x < -1 && b.x > 1, 'both participants can move out of old overlaps');
  assert.ok(b.x - a.x > 2);
  assert.throws(() => m.command('a', {seq: 3, type: 'move',
    direction: {x: 1, z: 0}, collider: false}), /invalid_command/);
});

test('abandoned lobby tokens expire and two new guests can start without server restart', () => {
  let now = 0;
  const m = new TeamMatch({now: () => now, timeoutMs: 30000});
  m.join('abandoned-a', 'A');m.join('abandoned-b', 'B');
  assert.throws(() => m.join('c', 'C'), /match_full/);
  now = 30001;
  m.join('c', 'C');m.join('d', 'D');
  assert.deepEqual([...m.players.keys()], ['c', 'd']);
  m.command('c', {seq: 1, type: 'ready'});
  m.command('d', {seq: 1, type: 'ready'});
  assert.equal(m.phase, 'playing');
});

test('lobby expiry keeps heartbeat-active guest and never silently evicts live rounds', () => {
  let now = 0;
  const m = new TeamMatch({now: () => now, timeoutMs: 30000});
  m.join('a', 'A');m.join('b', 'B');
  now = 25000;m.command('a', {seq: 1, type: 'heartbeat'});
  now = 30001;m.step();
  assert.equal(m.players.has('a'), true);
  assert.equal(m.players.has('b'), false);
  m.join('c', 'C');
  assert.equal(m.players.get('c').team, 'blue');
  m.command('a', {seq: 2, type: 'ready'});
  m.command('c', {seq: 1, type: 'ready'});
  assert.equal(m.phase, 'playing');
  now = 60002;
  assert.throws(() => m.join('d', 'D'), /match_full/,
    'active match cannot be silently replaced by join');
  m.step();
  assert.equal(m.reason, 'connection_timeout');
  now = 100003;m.step();
  assert.equal(m.phase, 'lobby');
  assert.equal(m.players.size, 0);
});

test('stale movement and capture expire at 60Hz even when heartbeats continue', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 8;
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.command('a', {seq: 3, type: 'capture', active: true});
  for (let i = 0; i < INPUT_LEASE_TICKS + 1; i++) m.step();
  assert.deepEqual(a.direction, {x: 0, z: 0});
  assert.equal(a.capturing, false);
  const stoppedX = a.x;
  m.command('a', {seq: 4, type: 'heartbeat'});
  for (let i = 0; i < 120; i++) m.step();
  assert.equal(a.x, stoppedX, 'heartbeat is not movement authorization');
  assert.equal(m.progress.red, 0, 'capture cannot continue after input disappears');
});

test('periodic held-intent renewals remain deterministic and do not reset facing', () => {
  const play = () => {
    const {m} = setup();
    const a = m.players.get('a'), b = m.players.get('b');
    a.x = 0; a.z = 0; b.x = 8;
    let seq = 2;
    m.command('a', {seq, type: 'capture', active: true});
    for (let i = 0; i < 240; i++) {
      m.step();
      if ((i + 1) % 60 === 0 && m.phase === 'playing')
        m.command('a', {seq: ++seq, type: 'capture', active: true});
    }
    assert.equal(m.score.red, 2, 'renewed capture can still complete a full point');
    return m.snapshot('a');
  };
  assert.deepEqual(play(), play());
});
