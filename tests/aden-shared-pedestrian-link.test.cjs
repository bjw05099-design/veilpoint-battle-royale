'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const link=world=>world.obstacles.filter(o=>o.type?.startsWith('aden-pedestrian-'));
const expected=[
 {x:93,z:114,w:4,d:.65,h:.65,type:'aden-pedestrian-bench'},
 {x:111,z:101,w:3.4,d:.65,h:.65,type:'aden-pedestrian-bench'},
 {x:104,z:108,w:.65,d:.65,h:2.15,type:'aden-pedestrian-post'}
];
function walkRoute(world){
 const p={x:77,z:112},stages=[[88,109],[99,103],[112,95],[123,83],[130,83]];
 assert.equal(Sim.blocked(p.x,p.z,.85,world.obstacles),false,'courtyard exit is open');
 for(const [x,z] of stages){
  for(let tick=0;tick<1400&&Math.hypot(x-p.x,z-p.z)>.20;tick++){
   const dx=x-p.x,dz=z-p.z,mag=Math.hypot(dx,dz);
   const v=Math.min(4.2,mag*60);
   Sim.moveEntity(p,dx/mag*v,dz/mag*v,1/60,world.obstacles,.85);
  }
  assert.ok(Math.hypot(x-p.x,z-p.z)<.22,'the same walking route must reach '+x+','+z);
  assert.equal(Sim.blocked(p.x,p.z,.85,world.obstacles),false,
    'no step may overlap one of the real collidable street objects');
 }
 return p;
}
test('real narrow Aden-inspired pedestrian link is one shared physical geometry for BR and story',()=>{
 const br=Sim.newMatch(42,0),story=Story.createState();
 assert.deepEqual(link(br),expected);
 assert.deepEqual(link(story.world),expected,
  'same street furniture authored in shared world rather than duplicated per mode');
 for(const part of expected){
  assert.equal(Sim.blocked(part.x,part.z,.85,br.obstacles),true);
  assert.equal(Sim.blocked(part.x,part.z,.85,story.world.obstacles),true);
 }
 assert.deepEqual(walkRoute(br),walkRoute(story.world));
});
test('historical terrain checkpoint has no surprise new street colliders',()=>{
 const old=Sim.newMatch(42,0,'carbine',false,'central','day',0);
 const fresh=Sim.newMatch(42,0,'carbine',false,'central','day',1);
 assert.deepEqual(link(old),[]);
 assert.deepEqual(link(fresh),expected);
 assert.deepEqual(link(Sim.restoreMatch(Sim.snapshotMatch(fresh))),expected);
 assert.deepEqual(link(Sim.restoreMatch(Sim.snapshotMatch(old))),[]);
 assert.deepEqual(link(Story.restore(Story.serialize(Story.createState())).world),expected);
});
test('shared street props are visible in both WebGL and Canvas without phantom walls',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/o\.type==='aden-pedestrian-bench'/);
 assert.match(source,/o\.type==='aden-pedestrian-post'/);
 assert.match(source,/o\.type==='aden-pedestrian-bench'\?'#8a7661'/);
 assert.match(source,/o\.type==='aden-pedestrian-post'\?'#827f72'/);
 assert.match(source,/for\(const \[x,z\] of \[\[82,112\],\[92,107\]/);
 assert.match(source,/m\.box\(x,-\.007,z,10,\.015,5,\[\.37,\.34,\.29\]\)/);
});
