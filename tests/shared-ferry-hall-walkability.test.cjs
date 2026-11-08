'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');

const hall=o=>o.type?.startsWith('aden-ferry-hall-');
function world(){
 return Sim.newMatch(20261108,0,'carbine',false,'central','day',1);
}
test('BR and CH01 share one original hall geometry with real two-way public entrances',()=>{
 const br=world(),ch=Story.createState();
 const a=br.obstacles.filter(hall).map(o=>({...o}));
 const b=ch.world.obstacles.filter(hall).map(o=>({...o}));
 assert.equal(a.length,7);
 assert.deepEqual(b,a,'the story mode must consume the identical core-city collision map');
 assert.equal(Sim.blocked(-45,125,.85,br.obstacles),false,'southern opening');
 assert.equal(Sim.blocked(-45,145,.85,br.obstacles),false,'northern doorway is open');
 assert.equal(Sim.blocked(-56,135,.85,br.obstacles),true,'western masonry is solid');
 assert.equal(Sim.blocked(-34,135,.85,br.obstacles),true,'eastern masonry is solid');
 assert.equal(Sim.blocked(-51,137,.85,br.obstacles),true,'left bench is tangible');
 assert.equal(Sim.blocked(-39,135,.85,br.obstacles),true,'right bench is tangible');
 assert.equal(Sim.blocked(-45,135,.85,br.obstacles),false,'usable central aisle');
});
test('a pedestrian can actually cross the hall at fixed-step 60Hz with collision',()=>{
 const obstacles=world().obstacles;
 const walker={x:-45,z:121};
 assert.equal(Sim.blocked(walker.x,walker.z,.85,obstacles),false);
 let moved=0;
 for(let i=0;i<380;i++){
  const old=walker.z;
  Sim.moveEntity(walker,0,5.1,1/60,obstacles);
  moved+=walker.z-old;
 }
 assert.ok(moved>28,'the north exit is reached through real 60Hz steps, no teleport');
 assert.ok(walker.z>149,'player passes through the narrow-but-usable north doorway');
 assert.equal(walker.x,-45);
 const blocked={x:-56,z:121};
 for(let i=0;i<300;i++)Sim.moveEntity(blocked,0,5.1,1/60,obstacles);
 assert.ok(blocked.z<124.2,'side wall cannot be passed through during movement');
});
test('old terrain revision and both mode saves remain valid without new checkpoint fields',()=>{
 const old=Sim.newMatch(33,0,'carbine',false,'central','day',0);
 assert.equal(old.obstacles.filter(hall).length,0);
 const current=Sim.newMatch(20261108,1,'carbine',false,'central','day',1);
 current.player.x=-45;current.player.z=130;
 const raw=Sim.snapshotMatch(current),copy=Sim.restoreMatch(raw);
 assert.equal(Sim.snapshotMatch(copy),raw);
 assert.equal(copy.obstacles.filter(hall).length,7);
 const savedStory=Story.serialize(Story.createState());
 const restored=Story.restore(savedStory);
 assert.equal(Story.serialize(restored),savedStory);
 assert.equal(restored.world.obstacles.filter(hall).length,7);
});
test('the hall has the same distinct public roof and props in Canvas and WebGL',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 for(const type of ['aden-ferry-hall-wall','aden-ferry-hall-bench','aden-ferry-hall-notice','aden-ferry-roof'])
  assert.ok(source.includes(type),type+' should have dedicated drawn geometry');
 assert.match(source,/m\.box\(-45,3\.35,135,22,\.18,20/);
 assert.match(source,/roofY:3\.35,type:'aden-ferry-roof'/);
 assert.doesNotMatch(source,/m\.box\(-45,0,135,22,3\.35,20/,
  'the overhead roof must not become an invisible ground-level wall');
});
