'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Readable} = require('node:stream');
const {EventEmitter} = require('node:events');
const {readJson} = require('../server/json-body.cjs');

test('readJson preserves split multibyte Korean names and emoji', async () => {
  const original = {name: '이수혁 대위 🛰️'};
  const bytes = Buffer.from(JSON.stringify(original));
  const chunks = Array.from(bytes, b => Buffer.from([b]));
  assert.deepEqual(await readJson(Readable.from(chunks)), original);
});

test('readJson rejects invalid UTF-8 instead of replacing a player name', async () => {
  const invalid = Buffer.concat([Buffer.from('{"name":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]);
  await assert.rejects(readJson(Readable.from([invalid])), /invalid_json/);
});

test('readJson bounds accumulated bytes and accepts an exact-limit body', async () => {
  const valid = Buffer.from(JSON.stringify({value: 'x'.repeat(2036)}));
  assert.equal(valid.length, 2048);
  assert.equal((await readJson(Readable.from([valid]))).value.length, 2036);
  await assert.rejects(readJson(Readable.from([valid, Buffer.from('x')])), /body_too_large/);
});

test('readJson rejects malformed JSON and incomplete aborted requests', async () => {
  await assert.rejects(readJson(Readable.from([Buffer.from('{"name":')])), /invalid_json/);
  const stream = new EventEmitter();
  const pending = readJson(stream);
  stream.emit('aborted');
  await assert.rejects(pending, /request_aborted/);
});

test('HTTP join retains Korean player name in the server-owned snapshot', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    const joined = await fetch(base + '/join', {method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name: '이수혁'})});
    assert.equal(joined.status, 201);
    const {token} = await joined.json();
    const response = await fetch(base + '/state', {headers: {'x-player-token': token}});
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.equal(snapshot.visible.find(p => p.id === snapshot.self.id).name, '이수혁');
  } finally {await server.close();}
});

test('team lobby accepts Korean and Arabic names but rejects invisible and bidi-spoofing controls', () => {
  const {TeamMatch} = require('../src/team-match.cjs');
  const match = new TeamMatch();
  const badNames = ['A\nB', 'A\u202eB', '\u200b', 'A\u2066B', 'A\u0000B'];
  for (const [index, name] of badNames.entries())
    assert.throws(() => match.join('bad-' + index, name), /invalid_name/);
  assert.equal(match.players.size, 0, 'invalid names must never reserve player slots');
  match.join('korean', ' 이수혁 ');
  match.join('arabic', 'نهرين');
  assert.deepEqual([...match.players.values()].map(p => p.name), ['이수혁', 'نهرين']);
});

test('HTTP join refuses multiline or bidi-spoofing player names', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  try {
    for (const name of ['A\nB', 'A\u202eB']) {
      const response = await fetch(`http://127.0.0.1:${port}/join`, {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({name})
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'invalid_name');
    }
    assert.equal(server.match.players.size, 0);
  } finally {await server.close();}
});

test('readJson rejects a premature close even without an aborted event', async () => {
  const stream = new EventEmitter();
  const pending = readJson(stream);
  stream.emit('data', Buffer.from('{"name":'));
  stream.emit('close');
  await assert.rejects(pending, /request_aborted/);
});

test('readJson accepts a completed stream that closes normally', async () => {
  const stream = new EventEmitter();
  const pending = readJson(stream);
  stream.emit('data', Buffer.from(JSON.stringify({name: '나흐린 🛰️'})));
  stream.emit('end');
  stream.emit('close');
  assert.deepEqual(await pending, {name: '나흐린 🛰️'});
});

test('team lobby refuses isolated Unicode surrogates but retains paired emoji', () => {
  const {TeamMatch} = require('../src/team-match.cjs');
  const match = new TeamMatch();
  for (const name of ['A' + String.fromCharCode(0xd800) + 'B',
    'A' + String.fromCharCode(0xdc00) + 'B'])
    assert.throws(() => match.join('invalid-' + name.length, name), /invalid_name/);
  assert.equal(match.players.size, 0);
  match.join('valid', '조현지 🛰️');
  assert.equal([...match.players.values()][0].name, '조현지 🛰️');
});

test('HTTP join rejects JSON-escaped isolated surrogate without allocating a slot', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/join', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: '{"name":"A\\uD800B"}'
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_name');
    assert.equal(server.match.players.size, 0);
  } finally {await server.close();}
});

test('team lobby rejects Unicode line and invisible format separators without taking a seat', () => {
  const {TeamMatch} = require('../src/team-match.cjs');
  const match = new TeamMatch();
  for (const [i, name] of ['A\u2028B', 'A\u2029B', '\u180e', 'A\u2061B', 'A\u2064B', '\u2028A'].entries())
    assert.throws(() => match.join('bad-' + i, name), /invalid_name/);
  assert.equal(match.players.size, 0);
});

test('team lobby trims before enforcing display length and NFC-normalizes decomposed Korean', () => {
  const {TeamMatch} = require('../src/team-match.cjs');
  const match = new TeamMatch();
  const composed = '이수혁';
  const decomposed = composed.normalize('NFD');
  const result = match.join('canonical', '  ' + decomposed + '  ');
  assert.equal(result.team, 'red');
  assert.equal(match.players.get('canonical').name, composed);
  const twentyFour = '가'.repeat(24);
  match.join('padded', '  ' + twentyFour + '  ');
  assert.equal(match.players.get('padded').name, twentyFour);
});

test('HTTP join rejects Unicode paragraph separators and snapshots canonical names', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const server = createTeamServer({port: 0, autoTick: false});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const join = name => fetch(base + '/join', {method: 'POST',
    headers: {'content-type': 'application/json'}, body: JSON.stringify({name})});
  try {
    const bad = await join('A\u2029B');
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'invalid_name');
    assert.equal(server.match.players.size, 0);
    const good = await join('  ' + '조현지'.normalize('NFD') + '  ');
    assert.equal(good.status, 201);
    const {token} = await good.json();
    const state = await fetch(base + '/state', {headers: {'x-player-token': token}});
    assert.equal(state.status, 200);
    const snapshot = await state.json();
    assert.equal(snapshot.visible.find(p => p.id === snapshot.self.id).name, '조현지');
  } finally {await server.close();}
});


test('readJson rejects an oversized streaming body before the sender finishes', async () => {
  const stream = new EventEmitter();
  const pending = readJson(stream);
  stream.emit('data', Buffer.alloc(2049, 0x61));
  await assert.rejects(pending, /body_too_large/);
  // An eventual end event cannot resurrect the already rejected request.
  stream.emit('end');
});

test('readJson rejects declared oversized bodies before reading a byte', async () => {
  const stream = new EventEmitter();
  let resumed = false;
  stream.headers = {'content-length': '2049'};
  stream.resume = () => {resumed = true;};
  await assert.rejects(readJson(stream), /body_too_large/);
  assert.equal(resumed, true, 'discard an oversized request stream');
});

test('readJson still accepts chunked exact-limit JSON without a length header', async () => {
  const exact = Buffer.from(JSON.stringify({value: 'x'.repeat(2036)}));
  const stream = new EventEmitter();
  const pending = readJson(stream);
  stream.emit('data', exact.subarray(0, 1000));
  stream.emit('data', exact.subarray(1000));
  stream.emit('end');
  assert.equal((await pending).value.length, 2036);
});
