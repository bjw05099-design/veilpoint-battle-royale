'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

test('CH01 legacy optional office notice does not become a distant paperwork waypoint',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;
 const ids=()=>Story.markers(s).map(m=>m.id);
 assert.equal(ids().includes('officeBoard'),false);
 s.world.player.x=87;s.world.player.z=20;
 assert.equal(ids().includes('officeBoard'),true);
 s.world.player.x=0;s.world.player.z=12;
 assert.equal(ids().includes('officeBoard'),false);
});
test('CH01 office notice proximity changes neither checkpoint schema nor BR world',()=>{
 const s=Story.createState();
 s.phase='records';s.combat.cleared=true;
 const before=Story.serialize(s);
 s.world.player.x=87;s.world.player.z=20;
 Story.markers(s);
 s.world.player.x=0;s.world.player.z=12;
 assert.equal(Story.serialize(s),before);
 assert.equal(Story.restore(before).officeBoardRead,false);
});
