'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const relief = require('../src/aden-map-relief.js');

test('terrain projection rejects zero or inverted viewport geometry', () => {
  const point = [10, 5, 20];
  const center = {x:0,z:0};
  for (const [width,height] of [[0,720],[-1,720],[1280,0],[1280,-720]]) {
    assert.throws(() => relief.project(point,center,width,height,1), RangeError);
  }
});

test('valid PC viewport retains metre-space elevation and center placement', () => {
  assert.deepEqual(relief.project([10,5,20],{x:10,z:20},2560,1440,2,.5),[1280,715]);
  assert.deepEqual(relief.project([0,0,0],{x:0,z:0},1024,600,1),[512,300]);
});
