const test=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function atRelay(){
 const s=Story.createState();Story.interact(s);
 s.world.bots.forEach(b=>{b.alive=false;b.health=0;});
 s.combat.cleared=true;s.phase='decision';
 s.world.player.x=8;s.world.player.z=-42;
 return s;
}

test('CH01: physical relay can be connected, isolated and reconnected before route choice',()=>{
 const s=atRelay();
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.relayRestored,true);
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.relayRestored,false);
 assert.equal(Story.interact(s).ok,true);
 assert.equal(s.relayRestored,true);
 const restored=Story.restore(Story.serialize(s));
 assert.equal(restored.relayRestored,true);
});

test('CH01: isolation turns off the manual warning without changing finite resources',()=>{
 const s=atRelay();
 Story.interact(s);s.beaconEnabled=true;
 const before=s.world.player.charges;
 Story.interact(s);
 assert.equal(s.relayRestored,false);
 assert.equal(s.beaconEnabled,false);
 assert.equal(s.world.player.charges,before);
 assert.equal(Story.restore(Story.serialize(s)).beaconEnabled,false);
});
