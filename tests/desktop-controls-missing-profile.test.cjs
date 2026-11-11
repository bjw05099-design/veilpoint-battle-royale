'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const controls = require('../src/desktop-controls.js');
test('offline profile recovery cannot crash input lookup', () => {
  for (const profile of [undefined,null,{}, {bindings:null}])
    assert.equal(controls.actionFor('KeyW',profile),null);
});
test('valid default controls remain playable', () => {
  const profile=controls.normalize({});
  assert.equal(controls.actionFor('KeyW',profile),'forward');
  assert.equal(controls.actionFor('KeyF',profile),'interact');
});
