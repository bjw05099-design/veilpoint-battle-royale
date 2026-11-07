'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Nav=require('../src/navigation.js');
const player={x:0,z:0,yaw:0};
const marker=[{id:'exit',label:'대피 출구',x:0,z:-8}];

test('CH01 HUD distinguishes observed clear direct line from unknown obstacle geometry',()=>{
 const clear=Nav.story(player,marker,null,[]);
 assert.match(clear,/직선 경로 확인/);
 assert.doesNotMatch(clear,/경로 차단|경로 장애물 정보 없음/);
 const unknown=Nav.story(player,marker,null,null);
 assert.match(unknown,/경로 장애물 정보 없음/);
 assert.doesNotMatch(unknown,/직선 경로 확인/);
});

test('CH01 HUD reports physical obstruction without implying a navigable path',()=>{
 const cover=[{x:0,z:-4,w:2,d:2}];
 const blocked=Nav.story(player,marker,null,cover);
 assert.match(blocked,/직선 경로 차단/);
 assert.match(blocked,/장애물 우회 필요/);
 assert.doesNotMatch(blocked,/직선 경로 확인/);
});

test('CH01 route labels remain observation-only and do not mutate mission state',()=>{
 const p={...player},marks=marker.map(m=>({...m}));
 Nav.story(p,marks,null,[]);
 Nav.story(p,marks,null,[{x:0,z:-4,w:2,d:2}]);
 assert.deepEqual(p,player);
 assert.deepEqual(marks,marker);
});
