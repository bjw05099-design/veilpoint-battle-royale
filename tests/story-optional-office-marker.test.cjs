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

test('CH01 legacy optional office notice is not a distant navigation objective',()=>{
 const s=ready(),visible=()=>Story.navigationMarkers(s).map(m=>m.id);
 assert.equal(visible().includes('officeBoard'),false);
 // The physical interaction and saved-board identity still exist.
 assert.equal(Story.markers(s).some(m=>m.id==='officeBoard'),true);
 s.world.player.x=87;s.world.player.z=23;
 assert.equal(visible().includes('officeBoard'),true);
 s.world.player.x=0;s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(visible().includes('officeBoard'),false);
 assert.equal(Story.markers(s).some(m=>m.id==='officeBoard'),true);
});
test('CH01 office navigation visibility changes no checkpoint state',()=>{
 const s=ready(),start={x:s.world.player.x,z:s.world.player.z};
 const before=Story.serialize(s);
 s.world.player.x=87;s.world.player.z=23;
 Story.navigationMarkers(s);
 s.world.player.x=start.x;s.world.player.z=start.z;
 assert.equal(Story.serialize(s),before);
 assert.equal(Story.restore(before).officeBoardRead,false);
});
