'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Flood=require('../src/ch01-street-flood.js');

function companionFixture(drained){
 const s=Story.createState();
 // A real 60Hz companion follows only after the live incident resolves.
 s.phase='records';s.combat.started=true;s.combat.cleared=true;
 s.drainCleared=drained;
 // Isolate pedestrian terrain from incidental distant geometry; this is
 // an otherwise valid in-level patch with its authored real metre bounds.
 s.world.obstacles=[];
 s.world.player.x=-8;s.world.player.z=-24;s.world.player.yaw=0;
 s.kimJiyoon.x=Flood.PATCH.x;s.kimJiyoon.z=Flood.PATCH.z;
 return s;
}
function advance(s){
 const old={x:s.kimJiyoon.x,z:s.kimJiyoon.z};
 Story.step(s,1/60,{});
 return Math.hypot(s.kimJiyoon.x-old.x,s.kimJiyoon.z-old.z);
}
test('CH01 Kim experiences the same on-site water resistance as the walking captain',()=>{
 const wet=companionFixture(false),cleared=companionFixture(true);
 assert.equal(Flood.exposure('records',Flood.PATCH.x,Flood.PATCH.z),1);
 const wetMove=advance(wet),clearedMove=advance(cleared);
 assert.ok(wetMove>0,'companion still walks through shallow flood');
 assert.ok(clearedMove>wetMove+.005,
  'physically cleared drain makes the same companion move farther per 60Hz tick');
 assert.ok(clearedMove<5/60,'no instantaneous transport or sprint was added');
 assert.equal(wet.kimAftercareReviewed,false,'no character quest flag or new checkpoint state');
});
test('dry CH01 companion is unaffected; terrain resistance cannot block ordinary movement',()=>{
 const dry=Story.createState();
 dry.phase='records';dry.combat.started=true;dry.combat.cleared=true;
 dry.world.obstacles=[];
 dry.world.player.x=-8;dry.world.player.z=-24;dry.world.player.yaw=0;
 dry.kimJiyoon.x=4;dry.kimJiyoon.z=2;
 const before={x:dry.kimJiyoon.x,z:dry.kimJiyoon.z};
 Story.step(dry,1/60,{});
 assert.equal(Flood.mobility('records',before.x,before.z,false),1);
 assert.ok(Math.hypot(dry.kimJiyoon.x-before.x,dry.kimJiyoon.z-before.z)>0);
});
