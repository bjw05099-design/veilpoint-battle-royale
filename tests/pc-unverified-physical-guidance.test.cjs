'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Navigation=require('../src/navigation.js');

test('BR physical route sign never advertises a verified local pickup without collision metadata',()=>{
 const player={x:0,z:0,yaw:0},mark={x:0,z:-1};
 const unknown=Navigation.fieldSign(player,mark,null);
 assert.match(unknown,/PATH UNVERIFIED/);
 assert.doesNotMatch(unknown,/\[J\] RECOVER/);
 assert.match(Navigation.fieldSign(player,mark,[]),/\[J\] RECOVER/);
 const blocked=Navigation.fieldSign(player,mark,[{x:0,z:-.5,w:.4,d:.1}]);
 assert.match(blocked,/PATH BLOCKED/);
 assert.doesNotMatch(blocked,/\[J\] RECOVER/);
});

test('BR public service switch navigation distinguishes unmeasured from blocked access',()=>{
 const player={x:0,z:0,yaw:0};
 const site={switchX:0,switchZ:-8};
 const state={near:false,open:false,obstructed:false,engaged:false};
 const uncertain=Navigation.serviceGate(player,state,site,undefined);
 assert.match(uncertain,/DIRECT PATH NOT VERIFIED/);
 assert.doesNotMatch(uncertain,/APPROACH FOR LOCAL CONTROL/);
 assert.match(Navigation.serviceGate(player,state,site,[]),/APPROACH FOR LOCAL CONTROL/);
 assert.match(Navigation.serviceGate(player,state,site,[{x:0,z:-4,w:1,d:1}]),/DIRECT PATH BLOCKED/);
});
