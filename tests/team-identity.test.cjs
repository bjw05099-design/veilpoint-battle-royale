'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch} = require('../src/team-match.cjs');
const {createTeamServer} = require('../server/team-server.cjs');

test('normalized case and canonical Unicode cannot impersonate an occupied lobby identity', () => {
  const match = new TeamMatch({now: () => 0});
  match.join('first', 'Café');
  for (const alias of ['CAFÉ', ' Cafe\u0301 ', 'café']) {
    assert.throws(() => match.join('alias', alias), /name_in_use/);
    assert.equal(match.players.size, 1, 'a rejected alias must not reserve a seat');
  }
  assert.deepEqual(match.join('second', '김지윤'), {id: 2, team: 'blue'});
  assert.equal(match.players.get('second').name, '김지윤');
});

test('marks-only, variation selectors and punctuation cannot reserve invisible local seats', () => {
  for (const invisible of ['\u0301', '\ufe0f', '\u20dd', '!!!', '\u2800', ' \u0301 ']) {
    const match = new TeamMatch({now: () => 0});
    assert.throws(() => match.join('hidden', invisible), /invalid_name/);
    assert.equal(match.players.size, 0);
  }
  for (const readable of ['이수혁', 'مرحبا', '🙂', 'Player 7']) {
    const match = new TeamMatch({now: () => 0});
    match.join('visible', readable);
    assert.equal(match.players.get('visible').name, readable);
  }
});

test('HTTP duplicate rejection preserves seats and a released name becomes available again', async () => {
  const server = createTeamServer({port: 0, autoTick: false, now: () => 0});
  const {port} = await server.listen();
  const base = 'http://127.0.0.1:' + port;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {'x-player-token': token} : {})},
      body: JSON.stringify(body)
    });
    return {status: response.status, body: await response.json()};
  };
  try {
    const first = await post('/join', {name: 'Café'});
    assert.equal(first.status, 201);
    const alias = await post('/join', {name: ' CAFE\u0301 '});
    assert.equal(alias.status, 400);
    assert.equal(alias.body.error, 'name_in_use');
    assert.equal(server.match.players.size, 1);
    const second = await post('/join', {name: 'Other'});
    assert.equal(second.status, 201);
    assert.equal(server.match.players.size, 2);
    const left = await post('/command', {seq: 1, type: 'leave'}, first.body.token);
    assert.equal(left.status, 200);
    const reused = await post('/join', {name: 'CAFÉ'});
    assert.equal(reused.status, 201, 'a voluntarily vacated name is not permanently blocked');
    assert.equal(server.match.players.size, 2);
  } finally {
    await server.close();
  }
});
