'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const shade=world=>world.obstacles.filter(o=>o.type?.startsWith('aden-shade-'));
const expected=[
 {x:35,z:67,w:.8,d:.8,h:3.2,type:'aden-shade-post'},
 {x:51,z:67,w:.8,d:.8,h:3.2,type:'aden-shade-post'},
 {x:35,z:83,w:.8,d:.8,h:3.2,type:'aden-shade-post'},
 {x:51,z:83,w:.8,d:.8,h:3.2,type:'aden-shade-post'},
 {x:37,z:75,w:.8,d:4,h:.7,type:'aden-shade-seat'},
 {x:49,z:75,w:.8,d:4,h:.7,type:'aden-shade-seat'}
];
function walk(world){
 const p={x:43,z:59};
 for(const [x,z] of [[43,70],[43,75],[43,87],[55,90],[65,90]]){
  for(let i=0;i<1250&&Math.hypot(x-p.x,z-p.z)>.15;i++){
   const dx=x-p.x,dz=z-p.z,dist=Math.hypot(dx,dz);
   const v=Math.min(4.2,dist*60);
   Sim.moveEntity(p,dx/dist*v,dz/dist*v,1/60,world.obstacles,.85);
  }
  assert.ok(Math.hypot(x-p.x,z-p.z)<.17,'open path must reach '+x+','+z);
  assert.equal(Sim.blocked(p.x,p.z,.85,world.obstacles),false);
 }
 return p;
}
test('a new walk-through covered city court uses exactly one BR and CH01 physical source',()=>{
 const solo=Sim.newMatch(28,0),story=Story.createState();
 assert.deepEqual(shade(solo),expected);
 assert.deepEqual(shade(story.world),expected);
 for(const o of expected){
  assert.equal(Sim.blocked(o.x,o.z,.85,solo.obstacles),true);
  assert.equal(Sim.blocked(o.x,o.z,.85,story.world.obstacles),true);
 }
 assert.equal(Sim.blocked(43,75,.85,solo.obstacles),false,
  'the elevated canopy must not become an invisible ground-level collider');
 assert.deepEqual(walk(solo),walk(story.world));
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(String(i).padStart(64,'0'),'Actor '+i);
 for(let i=0;i<96;i++)lobby.ready(String(i).padStart(64,'0'),true);
 const online=new BrSquadWorld(lobby);
 assert.deepEqual(shade(online),expected,
  '96-slot shared BR prototype must reuse the exact same solids');
});
test('old terrain saves preserve revision zero, current BR and CH01 saves preserve identical solids',()=>{
 const old=Sim.newMatch(28,0,'carbine',false,'central','day',0);
 const current=Sim.newMatch(28,0,'carbine',false,'central','day',1);
 old.status='playing';current.status='playing';
 assert.deepEqual(shade(old),[]);
 assert.deepEqual(shade(Sim.restoreMatch(Sim.snapshotMatch(old))),[]);
 assert.deepEqual(shade(Sim.restoreMatch(Sim.snapshotMatch(current))),expected);
 const story=Story.createState();
 assert.deepEqual(shade(Story.restore(Story.serialize(story)).world),expected);
});
test('both actual renderer paths show supports, seats and overhead canopy without a solid roof wall',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/if\(o\.type==='aden-shade-post'\)/);
 assert.match(renderer,/if\(o\.type==='aden-shade-seat'\)/);
 assert.match(renderer,/m\.box\(43,3\.28,75,18,\.22,18/);
 assert.match(renderer,/roofY:3\.28,type:'aden-shade-roof'/);
 assert.match(renderer,/o\.type==='aden-shade-post'\?'#8e7961'/);
 assert.match(renderer,/o\.type==='aden-shade-seat'\?'#7c6b58'/);
});
