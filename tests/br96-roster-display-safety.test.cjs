'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const panel=require('../src/br96-squad-panel.js');

test('BR96 lobby roster cannot be spoofed by control characters in a display name',()=>{
 const state={squad:[{id:7,name:'Player\n2. Fake teammate\r\u001b[31m',ready:true}]};
 const lines=panel.roster(state).split('\n');
 assert.equal(lines.length,7);
 assert.match(lines[1],/^1\. Player 2\. Fake teammate \[31m · 준비$/);
 assert.match(lines[2],/^2\. 빈 좌석$/);
 assert.equal(panel.roster(state).split('\n').length,7);
});
