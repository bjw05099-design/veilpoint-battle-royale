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
    if (m.phase === 'playing' && (i + 1) % 120 === 0) {
      m.command('a', {seq: ++aSeq, type: 'capture', active: false});
      m.command('a', {seq: ++aSeq, type: 'capture', active: true});
    }
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
test('clear air shows distant actors but dense mist conceals them', () => {
  const {m} = setup();
  m.players.get('b').x = 24;
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red', 'blue']);
  for (let i = 0; i < 600; i++) m.step();
  assert.deepEqual(m.snapshot('a').visible.map(p => p.team), ['red']);
});
test('timeouts require fresh seats for rematch; voluntary departure still settles a winner', () => {
  const {m, setNow} = setup();
  setNow(31000);m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.reason, 'connection_timeout');
  assert.throws(() => m.command('a', {seq: 2, type: 'ready'}), /unknown_player/,
    'an expired guest cannot rejoin a completed match with a stale ready packet');
  m.join('c', 'C');m.join('d', 'D');
  m.command('c', {seq: 1, type: 'ready'});
  m.command('d', {seq: 1, type: 'ready'});
  assert.equal(m.phase, 'playing');
  m.command('c', {seq: 2, type: 'leave'});
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
  const a = m.players.get('a'), b = m.players.get('b');
  // Keep the opponent outside the narrow shot ray: this test exercises the
  // entire finite-ammo/reload lifecycle, not the separate match-win condition.
  b.z = 3;
  for (let shot = 0; shot < 12; shot++) {
    const result = m.command('a', {seq: 2 + shot, type: 'fire'});
    assert.equal(result.ok, true);
    for (let i = 0; i < 18; i++) m.step();
  }
  assert.deepEqual([a.ammo, a.reserve], [0, 24]);
  assert.equal(b.health, 100, 'the reload test must not accidentally end the match');
  assert.equal(m.phase, 'playing');
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
    assert.equal(m.score.red, 1, 'lease renewals cannot auto-arm a second point');
    assert.equal(m.players.get('a').captureArmed, false);
    return m.snapshot('a');
  };
  assert.deepEqual(play(), play());
});

test('server-owned injury slows team movement after an actual hit without client speed injection',()=>{
  const play=()=>{
    const {m}=setup(),a=m.players.get('a'),b=m.players.get('b');
    a.x=5;a.z=0;b.x=0;b.z=0;
    m.command('b',{seq:2,type:'move',direction:{x:1,z:0}});
    assert.equal(m.command('b',{seq:3,type:'fire'}).hit,true);
    assert.equal(a.health,66);
    assert.throws(()=>m.command('a',{seq:2,type:'move',direction:{x:1,z:0},speed:99}),/invalid_command/);
    m.command('a',{seq:2,type:'move',direction:{x:1,z:0}});
    for(let i=0;i<60;i++)m.step();
    const expected=4.5*(1-0.22*0.34);
    assert.ok(Math.abs(a.x-5-expected)<1e-7);
    assert.equal(a.health,66,'no magical healing during a team round');
    return m.snapshot('a');
  };
  assert.deepEqual(play(),play(),'authoritative injury movement replays at 60Hz');
});

test('authoritative aim direction is independent of movement, sight-gated and replayable',()=>{
 const run=()=>{
  const {m}=setup(),a=m.players.get('a'),b=m.players.get('b');
  a.x=0;a.z=0;b.x=0;b.z=-5;
  assert.throws(()=>m.command('a',{seq:2,type:'aim',direction:{x:0,z:0}}),/invalid_direction/);
  assert.throws(()=>m.command('a',{seq:2,type:'aim',direction:{x:0,z:-1},target:b.id}),/invalid_command/);
  assert.throws(()=>m.command('a',{seq:2,type:'aim',direction:{x:3,z:0}}),/invalid_direction/);
  assert.equal(m.command('a',{seq:2,type:'aim',direction:{x:0,z:-1}}).ok,true);
  assert.deepEqual({...a.facing},{x:0,z:-1});
  assert.deepEqual(m.snapshot('a').visible.map(p=>p.team),['red','blue']);
  m.command('a',{seq:3,type:'move',direction:{x:1,z:0}});
  assert.deepEqual({...a.facing},{x:0,z:-1},'strafe must not hijack an explicitly aimed view');
  assert.equal(m.command('a',{seq:4,type:'fire'}).hit,true);
  assert.equal(b.health,66);
  m.finish('red','test');
  m.command('a',{seq:5,type:'ready'});m.command('b',{seq:2,type:'ready'});
  assert.equal(a.aiming,false);
  assert.deepEqual({...a.facing},{x:1,z:0});
  return m.snapshot('a');
 };
 assert.deepEqual(run(),run());
});

test('team aim release returns movement-facing and rejects forged release payloads',()=>{
 const {m}=setup(),a=m.players.get('a');
 m.command('a',{seq:2,type:'move',direction:{x:-1,z:0}});
 m.command('a',{seq:3,type:'aim',direction:{x:0,z:-1}});
 assert.equal(a.aiming,true);
 assert.deepEqual({...a.facing},{x:0,z:-1});
 assert.throws(()=>m.command('a',{seq:4,type:'aimRelease',target:99}),/invalid_command/);
 assert.equal(m.command('a',{seq:4,type:'aimRelease'}).ok,true);
 assert.equal(a.aiming,false);
 assert.deepEqual({...a.facing},{x:-1,z:0});
 m.command('a',{seq:5,type:'move',direction:{x:0,z:1}});
 assert.deepEqual({...a.facing},{x:0,z:1});
});

test('stale server aim expires despite heartbeats, restoring renewed keyboard-facing intent',()=>{
  const run=()=>{
    const {m}=setup(),a=m.players.get('a');
    m.command('a',{seq:2,type:'move',direction:{x:-1,z:0}});
    m.command('a',{seq:3,type:'aim',direction:{x:0,z:-1}});
    assert.equal(a.aiming,true);
    for(let i=0;i<=INPUT_LEASE_TICKS;i++){
      m.step();
      if(i===49)m.command('a',{seq:4,type:'move',direction:{x:-1,z:0}});
      if(i===59)m.command('a',{seq:5,type:'heartbeat'});
    }
    assert.equal(a.aiming,false,'heartbeat cannot keep abandoned pointer aim alive');
    assert.deepEqual({...a.facing},{x:-1,z:0},'renewed movement controls facing after aim expires');
    assert.equal(m.command('a',{seq:6,type:'aim',direction:{x:0,z:-1}}).ok,true);
    assert.equal(a.aiming,true,'fresh aim is allowed after lease expiry');
    return m.snapshot('a');
  };
  assert.deepEqual(run(),run(),'aim expiry follows deterministic server ticks');
});

test('renewed stationary aim remains active until its final refresh lease expires',()=>{
  const {m}=setup(),a=m.players.get('a');
  m.command('a',{seq:2,type:'move',direction:{x:1,z:0}});
  m.command('a',{seq:3,type:'aim',direction:{x:0,z:-1}});
  for(let i=0;i<180;i++){
    m.step();
    if((i+1)%20===0)m.command('a',{seq:4+Math.floor(i/20),type:'aim',direction:{x:0,z:-1}});
  }
  assert.equal(a.aiming,true);
  assert.deepEqual({...a.facing},{x:0,z:-1});
  for(let i=0;i<=INPUT_LEASE_TICKS;i++)m.step();
  assert.equal(a.aiming,false,'even renewed aim eventually expires without further intent');
  assert.deepEqual({...a.facing},{x:0,z:-1},'stationary player retains last physical look direction');
});

test('team server applies deterministic injury stress, recoverable hesitation and finite reload', () => {
  const run = () => {
    const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
    a.x = 0; a.z = 0; b.x = 5; b.z = 0;
    assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, true);
    for (let i = 0; i < 18; i++) m.step();
    assert.equal(m.command('a', {seq: 3, type: 'fire'}).hit, true);
    assert.equal(b.health, 32);
    assert.ok(b.stress >= 60);
    assert.equal(m.command('b', {seq: 2, type: 'fire'}).hit, true);
    const before = b.ammo + b.reserve;
    const started = m.command('b', {seq: 3, type: 'reload'});
    assert.equal(started.hesitation, true);
    assert.equal(started.reloadTicks, 126);
    assert.equal(m.command('b', {seq: 4, type: 'reload'}).reason, 'recover_not_ready');
    for (let i = 0; i < 15; i++) m.step();
    assert.equal(m.command('b', {seq: 5, type: 'reload'}).recovered, true);
    assert.equal(b.reloadTicks, 75);
    for (let i = 0; i < 75; i++) m.step();
    assert.equal(b.reloadTicks, 0);
    assert.equal(b.reloadHesitation, false);
    assert.equal(b.ammo + b.reserve, before);
    assert.equal(b.health, 32, 'stress decay cannot heal injuries');
    assert.equal(m.snapshot('b').self.reloadHesitation, false);
    return m.snapshot('b');
  };
  assert.deepEqual(run(), run(), 'same commands and 60Hz steps must replay identically');
});

test('server validates reload-assist preference, prevents spoofing and preserves it on replay', () => {
  const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
  assert.throws(() => m.command('b', {seq: 2, type: 'assist', enabled: 1}), /invalid_assist/);
  assert.throws(() => m.command('b', {seq: 2, type: 'assist', enabled: true, stress: 0}), /invalid_command/);
  assert.equal(m.command('b', {seq: 2, type: 'assist', enabled: true}).enabled, true);
  a.x = 0; a.z = 0; b.x = 5; b.z = 0;
  m.command('a', {seq: 2, type: 'fire'});
  for (let i = 0; i < 18; i++) m.step();
  m.command('a', {seq: 3, type: 'fire'});
  assert.ok(b.stress >= 60);
  m.command('b', {seq: 3, type: 'fire'});
  const start = m.command('b', {seq: 4, type: 'reload'});
  assert.equal(start.hesitation, false);
  assert.equal(start.reloadTicks, 90);
  for (let i = 0; i < 90; i++) m.step();
  assert.equal(b.ammo, 12);
  m.finish('blue', 'test');
  m.command('a', {seq: 4, type: 'ready'});
  m.command('b', {seq: 5, type: 'ready'});
  assert.equal(b.stress, 0);
  assert.equal(b.reloadAssist, true, 'accessibility preference persists across rounds');
  assert.equal(b.reloadHesitation, false);
});

test('public coastal mist is deterministic, warned and symmetric for both teams', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -5.5;a.z = 0;b.x = 5.5;b.z = 0;
  assert.equal(m.snapshot('a').weather.phase, 'clear');
  assert.equal(m.snapshot('a').visible.length, 2);
  assert.equal(m.snapshot('b').visible.length, 2);
  for (let i = 0; i < 300; i++) m.step();
  assert.equal(m.snapshot('a').weather.phase, 'incoming');
  assert.equal(m.snapshot('a').weather.ticksUntilChange, 300);
  assert.equal(m.snapshot('a').visible.length, 2, 'warning does not silently change sight');
  for (let i = 0; i < 300; i++) m.step();
  const fogA = m.snapshot('a'), fogB = m.snapshot('b');
  assert.deepEqual(fogA.weather, fogB.weather, 'both teams receive the same public event');
  assert.equal(fogA.weather.kind, 'coastal_mist');
  assert.equal(fogA.weather.visibilityRange, 9);
  assert.deepEqual(fogA.visible.map(p => p.team), ['red']);
  assert.deepEqual(fogB.visible.map(p => p.team), ['blue']);
  assert.equal(fogA.visible.some(p => 'health' in p), false);
  assert.throws(() => m.command('a', {seq: 2, type: 'aim',
    direction: {x: 1, z: 0}, weather: 'clear'}), /invalid_command/);
  for (let i = 0; i < 600; i++) m.step();
  assert.equal(m.snapshot('a').weather.phase, 'clearing');
  assert.equal(m.snapshot('b').visible.length, 1);
  for (let i = 0; i < 300; i++) m.step();
  assert.equal(m.snapshot('a').weather.phase, 'clear');
  assert.equal(m.snapshot('b').visible.length, 2, 'visibility recovers for both sides');
});

test('weather replay and round restart are tick-based, independent of wall clock', () => {
  const run = () => {
    const {m, setNow} = setup();
    const frames = [];
    for (let i = 0; i < 2100; i++) {
      if (i === 1000) setNow(25000);
      if (i === 1400) {
        setNow(0);
        m.command('a', {seq: 2, type: 'heartbeat'});
        m.command('b', {seq: 2, type: 'heartbeat'});
      }
      m.step();
      if (i % 300 === 299) frames.push(m.snapshot('a').weather);
    }
    assert.equal(m.snapshot('a').weather.eventId, 0);
    assert.equal(m.snapshot('a').weather.phase, 'clear');
    assert.equal(m.snapshot('a').weather.ticksUntilChange, null,
      'a passing mist bank must not magically repeat in the same round');
    m.finish('red', 'test');
    m.command('a', {seq: 3, type: 'ready'});
    m.command('b', {seq: 3, type: 'ready'});
    assert.deepEqual(m.snapshot('a').weather, {
      eventId: 0, phase: 'clear', kind: 'clear', visibilityRange: 80, ticksUntilChange: 300
    });
    return frames;
  };
  assert.deepEqual(run(), run());
});

test('passing mist changes sight gradually, symmetrically and deterministically at 60Hz', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -5.5; a.z = 0; b.x = 5.5; b.z = 0; // 11m apart, facing each other
  const advanceTo = tick => {while (m.ticks < tick) m.step();};
  const check = (tick, range, visible) => {
    advanceTo(tick);
    const red = m.snapshot('a'), blue = m.snapshot('b');
    assert.ok(Math.abs(red.weather.visibilityRange - range) < 1e-9);
    assert.deepEqual(red.weather, blue.weather);
    assert.equal(red.visible.length, visible);
    assert.equal(blue.visible.length, visible);
  };
  check(300, 80, 2);
  check(450, 44.5, 2);
  check(480, 80 - 71 * 180 / 300, 2);
  check(481, 80 - 71 * 181 / 300, 2);
  check(591, 80 - 71 * 291 / 300, 2);
  check(592, 80 - 71 * 292 / 300, 1);
  check(600, 9, 1);
  check(1200, 9, 1);
  check(1350, 44.5, 2);
  check(1500, 80, 2);
  assert.equal(m.snapshot('a').weather.ticksUntilChange, null);
});

test('clear air discloses unobstructed actors across the bounded arena, mist does not', () => {
  const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
  a.x = -15; a.z = 0; b.x = 15; b.z = 0; // 30m separation in a 48m arena
  assert.equal(m.snapshot('a').weather.visibilityRange, 80);
  assert.equal(m.snapshot('a').visible.length, 2, 'clear air has no 14m artificial cutoff');
  for (let i = 0; i < 600; i++) m.step();
  assert.equal(m.snapshot('a').visible.length, 1, 'dense coastal mist conceals distant actors');
  assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, false);
  assert.equal(b.health, 66, 'server-owned directional collision remains independent of sight');
  assert.equal(a.ammo, 11);
});

test('mist conceals players without preventing aligned shots or leaking unseen hit confirmation', () => {
  const replay = () => {
    const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
    a.x = -5.5; a.z = 0; b.x = 5.5; b.z = 0; // 11 arena metres
    const advanceTo = tick => {while (m.ticks < tick) m.step();};
    advanceTo(591); // target still inside the fading sight boundary
    assert.equal(m.snapshot('a').visible.length, 2);
    assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, true);
    assert.equal(b.health, 66);
    advanceTo(592); // weather hides the opponent, not the shot
    assert.equal(m.snapshot('b').visible.length, 1);
    assert.equal(m.command('b', {seq: 2, type: 'fire'}).hit, false,
      'unseen damage cannot be confirmed from a server hit marker');
    assert.equal(a.health, 66, 'aligned blind fire still damages a hidden opponent');
    advanceTo(610);
    assert.equal(m.command('a', {seq: 3, type: 'fire'}).hit, false);
    assert.equal(b.health, 32, 'mist never becomes a magical bullet barrier');
    advanceTo(1350); // clearing mist exposes both actors again
    assert.equal(m.snapshot('b').visible.length, 2);
    assert.equal(m.command('b', {seq: 3, type: 'fire'}).hit, true);
    assert.equal(a.health, 32);
    assert.deepEqual([a.ammo, b.ammo], [10, 10], 'all four shots consume ammunition');
    return [m.snapshot('a'), m.snapshot('b')];
  };
  assert.deepEqual(replay(), replay(), 'blind fire, weather and ammo replay at fixed 60Hz');
});

test('mist limits snapshots, not collision; visible hits still confirm normally', () => {
  const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 10; b.z = 0;
  for (let i = 0; i < 600; i++) m.step();
  assert.equal(m.snapshot('a').weather.visibilityRange, 9);
  assert.equal(m.snapshot('a').visible.length, 1);
  assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, false);
  assert.equal(b.health, 66, 'ray-aligned fire reaches a hidden player');
  b.x = 8;
  for (let i = 0; i < 18; i++) m.step();
  assert.equal(m.snapshot('a').visible.length, 2);
  assert.equal(m.command('a', {seq: 3, type: 'fire'}).hit, true);
  assert.equal(b.health, 32);
  assert.equal(a.ammo, 10);
});

test('blind fire beyond old 12m cap needs actual alignment, not target magnetism', () => {
  const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 20; b.z = 1; // off the +x firing ray
  for (let i = 0; i < 600; i++) m.step(); // dense mist hides the distant actor
  assert.equal(m.snapshot('a').visible.length, 1);
  assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, false);
  assert.equal(b.health, 100, 'a broad aim cone must not auto-acquire a hidden actor');
  for (let i = 0; i < 18; i++) m.step();
  b.z = 0; // server-authoritative collision shape now intersects the existing ray
  assert.equal(m.snapshot('a').visible.length, 1);
  assert.equal(m.command('a', {seq: 3, type: 'fire'}).hit, false,
    'do not reveal unseen hits in command acknowledgements');
  assert.equal(b.health, 66, 'shots in the 2D arena do not stop at 12m');
  assert.equal(a.ammo, 10);
});

test('physical cover still blocks a ray during coastal mist', () => {
  const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
  // The server's central solid barrier remains solid regardless of weather.
  a.x = -4; a.z = 6; b.x = 4; b.z = 6;
  for (let i = 0; i < 600; i++) m.step();
  assert.equal(m.snapshot('a').visible.length, 1);
  const result = m.command('a', {seq: 2, type: 'fire'});
  assert.deepEqual([result.ok, result.hit], [true, false]);
  assert.equal(b.health, 100, 'mist cannot make physical cover permeable');
  assert.equal(a.ammo, 11, 'a blocked shot still consumes finite ammunition');
});

test('a near miss stays a miss at the player collision radius', () => {
  const {m} = setup(), a = m.players.get('a'), b = m.players.get('b');
  a.x = 0; a.z = 0; b.x = 11; b.z = 0.56;
  assert.equal(m.command('a', {seq: 2, type: 'fire'}).hit, false);
  assert.equal(b.health, 100);
  for (let i = 0; i < 18; i++) m.step();
  b.z = 0.54;
  assert.equal(m.command('a', {seq: 3, type: 'fire'}).hit, true,
    'the server 2D collision radius, not visibility, resolves this shot');
  assert.equal(b.health, 66);
});

test('server collision traces the aimed ray rather than a different center-to-center cover line', () => {
  const play = offset => {
    const {m} = setup();
    const a = m.players.get('a'), b = m.players.get('b');
    // Opponent center is visible past the edge of the northern wall.
    // A slightly lower aim still intersects the actor circle, but the actual
    // shot ray first passes through solid cover. Both commands cost one round.
    a.x = -7; a.z = 0;
    b.x = -1; b.z = 7.5;
    const angle = Math.atan2(b.z - a.z, b.x - a.x) + offset;
    m.command('a', {seq: 2, type: 'aim',
      direction: {x: Math.cos(angle), z: Math.sin(angle)}});
    const visible = m.snapshot('a').visible.some(actor => actor.id === b.id);
    const result = m.command('a', {seq: 3, type: 'fire'});
    return {visible, health: b.health, ammo: a.ammo, result};
  };
  const blocked = play(-0.04);
  assert.equal(blocked.visible, true, 'the opponent center is visible past cover');
  assert.equal(blocked.health, 100, 'cover must block the actual off-center shot ray');
  assert.equal(blocked.ammo, 11, 'a blocked shot still consumes a finite round');
  assert.equal(blocked.result.hit, false);
  const clear = play(0);
  assert.equal(clear.health, 66, 'a clear aimed ray still reaches the same opponent');
  assert.equal(clear.ammo, 11);
  assert.deepEqual(play(-0.04), blocked, 'fixed 60Hz commands replay identically');
});

test('partially exposed opponents remain visible when their actual body edge is hittable', () => {
  const {m} = setup();
  const a = m.players.get('a'), b = m.players.get('b');
  a.x = -7; a.z = 0;
  b.x = -0.5; b.z = 7.5;
  // Center sightline crosses solid cover, but the right-hand body edge
  // remains exposed; center-only disclosure would hide a hittable opponent.
  const angle = Math.atan2(b.z - a.z, b.x - a.x) + 0.04;
  m.command('a', {seq: 2, type: 'aim',
    direction: {x: Math.cos(angle), z: Math.sin(angle)}});
  assert.equal(m.snapshot('a').visible.some(actor => actor.id === b.id), true);
  assert.equal(m.command('a', {seq: 3, type: 'fire'}).ok, true);
  assert.equal(b.health, 66, 'the unobstructed body edge can be contacted');
  assert.equal(a.ammo, 11);
  // Moving fully behind the same cover must restore the information barrier.
  a.x = -4; a.z = 6; b.x = 4; b.z = 6;
  m.command('a', {seq: 4, type: 'aim', direction: {x: 1, z: 0}});
  assert.equal(m.snapshot('a').visible.some(actor => actor.id === b.id), false);
});

test('simultaneous disconnected PC clients produce no arbitrary server winner', () => {
  const {m, setNow} = setup();
  m.command('a', {seq: 2, type: 'move', direction: {x: 1, z: 0}});
  m.command('b', {seq: 2, type: 'capture', active: true});
  setNow(30001);
  m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.reason, 'connection_timeout');
  assert.equal(m.winner, null, 'both expired connections cannot claim a team win');
  assert.equal(m.ticks, 0, 'no half-applied server tick after disconnection');
  assert.deepEqual(m.players.get('a').direction, {x: 0, z: 0});
  assert.equal(m.players.get('b').capturing, false);
});

test('only the still-connected team wins when the opponent lease expires', () => {
  const {m, setNow} = setup();
  setNow(25000);
  m.command('b', {seq: 2, type: 'heartbeat'});
  setNow(30001);
  m.step();
  assert.equal(m.phase, 'ended');
  assert.equal(m.reason, 'connection_timeout');
  assert.equal(m.winner, 'blue');
  assert.equal(m.ticks, 0);
});

// Regression: HTTP commands can arrive between 60Hz ticks, after the wall-clock
// lease expires. Such packets must not revive a player or change a fair winner.
test('expired heartbeat arriving before next tick cannot revive both dead sessions', () => {
  const {m, setNow} = setup();
  const a = m.players.get('a'), before = a.lastSeen;
  setNow(30001);
  assert.throws(() => m.command('a', {seq: 2, type: 'heartbeat'}), /connection_timeout/);
  assert.equal(m.phase, 'ended');
  assert.equal(m.reason, 'connection_timeout');
  assert.equal(m.winner, null);
  assert.equal(a.seq, 1);
  assert.equal(a.lastSeen, before);
  assert.equal(m.ticks, 0);
});

test('active peer wins when expired opponent attempts a late command before tick', () => {
  const {m, setNow} = setup();
  setNow(25000);
  m.command('b', {seq: 2, type: 'heartbeat'});
  const a = m.players.get('a'), previousX = a.x;
  setNow(30001);
  assert.throws(() => m.command('a', {seq: 2, type: 'move',
    direction: {x: 1, z: 0}}), /connection_timeout/);
  assert.equal(m.winner, 'blue');
  assert.equal(m.reason, 'connection_timeout');
  assert.equal(a.seq, 1);
  assert.equal(a.x, previousX);
  assert.equal(m.ticks, 0);
});

test('live command after opponent lease expiry settles the same winner before movement', () => {
  const {m, setNow} = setup();
  setNow(25000);
  m.command('a', {seq: 2, type: 'heartbeat'});
  const a = m.players.get('a');
  setNow(30001);
  assert.throws(() => m.command('a', {seq: 3, type: 'move',
    direction: {x: 1, z: 0}}), /connection_timeout/);
  assert.equal(m.winner, 'red');
  assert.equal(m.phase, 'ended');
  assert.deepEqual(a.direction, {x: 0, z: 0});
  assert.equal(a.seq, 2);
});
