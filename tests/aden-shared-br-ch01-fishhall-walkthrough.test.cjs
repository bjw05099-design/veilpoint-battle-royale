'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const hall=world=>world.obstacles.filter(o=>o.type.startsWith('aden-fishhall-'));
const expected=[
 {x:-164,z:121,w:.6,d:18,h:3.4,type:'aden-fishhall-wall'},
 {x:-144,z:121,w:.6,d:18,h:3.4,type:'aden-fishhall-wall'},
 {x:-154,z:130,w:20,d:.6,h:3.4,type:'aden-fishhall-wall'},
 {x:-161,z:123,w:2.2,d:3.4,h:1.1,type:'aden-fishhall-counter'},
 {x:-147,z:123,w:2.2,d:3.4,h:1.1,type:'aden-fishhall-counter'}
];

test('western public fish hall shares exactly one original collision dataset between BR and CH01',()=>{
 const br=Sim.newMatch(9801,0),story=Story.createState();
 assert.deepEqual(hall(br),expected);
 assert.deepEqual(hall(story.world),expected);
 for(const item of expected){
  assert.equal(Sim.blocked(item.x,item.z,.85,br.obstacles),true);
  assert.equal(Sim.blocked(item.x,item.z,.85,story.world.obstacles),true);
 }
 for(const [x,z] of [[-154,105],[-154,112],[-154,119],[-154,126]]){
  assert.equal(Sim.blocked(x,z,.85,br.obstacles),false,'public south entrance has no invisible blocking wall');
  assert.equal(Sim.blocked(x,z,.85,story.world.obstacles),false,'CH01 shares the same open pedestrian route');
 }
 for(const point of Object.values(Story.POINTS)){
  assert.equal(Sim.blocked(point.x,point.z,.85,story.world.obstacles),false,
   'existing CH01 interaction remains reachable: '+point.id);
 }
});

test('actual 60Hz actor movement crosses the shared hall entrance and collides with masonry',()=>{
 for(const make of [()=>Sim.newMatch(9802,0),()=>Story.createState().world]){
  const world=make(),actor=world.player;
  actor.x=-154;actor.z=105;
  for(let tick=0;tick<210;tick++)Sim.moveEntity(actor,0,6.1,1/60,world.obstacles);
  assert.ok(actor.z>118&&actor.z<129,'character actually enters the building');
  assert.equal(Sim.blocked(actor.x,actor.z,.85,world.obstacles),false);
  for(let tick=0;tick<160;tick++)Sim.moveEntity(actor,0,6.1,1/60,world.obstacles);
  assert.ok(actor.z<=128.86,'solid back wall prevents walking through it');
 }
});

test('terrain revision zero and old saved data do not acquire the new wall after restore',()=>{
 const historical=Sim.newMatch(9803,0,'carbine',false,'central','day',0);
 historical.status='playing';
 assert.equal(hall(historical).length,0);
 assert.equal(hall(Sim.restoreMatch(Sim.snapshotMatch(historical))).length,0);
 const current=Sim.newMatch(9803,0);
 current.status='playing';
 assert.deepEqual(hall(Sim.restoreMatch(Sim.snapshotMatch(current))),expected);
 const chapter=Story.createState();
 const restored=Story.restore(Story.serialize(chapter));
 assert.deepEqual(hall(restored.world),expected);
 assert.equal(Story.serialize(restored),Story.serialize(chapter));
});
