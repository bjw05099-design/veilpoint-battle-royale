'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function ready(){
 const s=Story.createState(),p=s.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 for(const bot of s.world.bots){bot.health=0;bot.alive=false;}
 s.combat.cleared=true;s.phase='records';
 return s;
}

test('CH01 legacy optional office notice does not become a distant paperwork waypoint',()=>{
 const s=ready();
 const ids=()=>Story.markers(s).map(m=>m.id);
 assert.equal(ids().includes('officeBoard'),false);
 s.world.player.x=87;s.world.player.z=20;
 assert.equal(ids().includes('officeBoard'),true);
 s.world.player.x=0;s.world.player.z=12;
 assert.equal(ids().includes('officeBoard'),false);
});
test('CH01 office notice proximity changes neither checkpoint schema nor BR world',()=>{
 const s=ready();
 const before=Story.serialize(s);
 s.world.player.x=87;s.world.player.z=20;
 Story.markers(s);
 s.world.player.x=0;s.world.player.z=12;
 assert.equal(Story.serialize(s),before);
 assert.equal(Story.restore(before).officeBoardRead,false);
});
