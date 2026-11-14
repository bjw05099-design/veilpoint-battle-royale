'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Ambience=require('../src/story-harbor-ambience.js');
const Footfall=require('../src/story-footfall.js');
const Paths=require('../src/public-city-footpaths.js');
const Street=require('../src/br96-street-view.js');

test('complete physical hall kits alone provide bounded ceilings and interior floors',()=>{
 const s=Story.createState(),original=JSON.stringify(s.world.obstacles);
 assert.deepEqual(Sim.harborPassageSpaces(s.world.obstacles).map(r=>[r.x,r.z,r.w,r.d,r.h]),
  [[114,10,27,15,8],[42,-38,16,20,9]]);
 assert.equal(Ambience.indoors({x:42,z:-38},s.world.obstacles),true);
 assert.equal(Sim.harborPassageAt({x:42,z:-27.9},s.world.obstacles),null);
 assert.equal(Sim.harborPassageAt({x:34.25,z:-38},s.world.obstacles),null,'a wall is not standing space');
 const crate=s.world.obstacles.find(o=>o.type==='harbor-passage-crate'&&o.x<50);
 assert.equal(Sim.harborPassageAt(crate,s.world.obstacles),null);
 const incomplete=s.world.obstacles.filter(o=>!(o.type==='harbor-passage-wall'&&o.x===34.25));
 assert.equal(Ambience.indoors({x:42,z:-38},incomplete),false);
 assert.equal(Sim.harborPassageSpaces(Sim.newMatch(1,0,'carbine',false,'central','day',0).obstacles).length,0);
 assert.equal(JSON.stringify(s.world.obstacles),original);
});
test('elevated hall ceiling stops a 3D shot without sealing either walking entrance',()=>{
 const pieces=Sim.harborPassage(0,0,16,20,4),target={id:1,x:0,z:-8,alive:true};
 assert.equal(Sim.lineBlocked3D(0,1.65,0,0,7,0,pieces),true);
 assert.equal(Sim.lineBlocked3D(0,1.65,12,0,1.65,-12,pieces),false);
 const shot={x:0,y:6,z:8};
 assert.equal(Sim.traceShot(shot,0,-.3,40,pieces,[target]),null);
 assert.equal(Sim.traceShot(shot,0,-.3,40,pieces.slice(1),[target]).actor,target,
  'removing a defining wall removes the derived kit roof, never an invisible coordinate-only ceiling');
 const actor={x:0,z:12};for(let i=0;i<300;i++)Sim.moveEntity(actor,0,-6,1/60,pieces);
 assert.ok(actor.z<-12);assert.equal(Sim.blocked(0,0,.85,pieces),false);
});
test('CH01 physical hall entry changes footsteps and gradually attenuates the open doorway',()=>{
 const s=Story.createState();Object.assign(s.world.player,{x:42,z:-27.9});
 assert.notEqual(Footfall.surfaceAt(s),'interior');
 Object.assign(s.world.player,{z:-28.1});const near=Sim.harborPassageAt(s.world.player,s.world.obstacles);
 assert.equal(Footfall.surfaceAt(s),'interior');
 const entrance=Ambience.profile(s);
 s.world.player.z=-38;const inside=Ambience.profile(s);
 assert.ok(near.enclosure<.02);assert.equal(Sim.harborPassageAt(s.world.player,s.world.obstacles).enclosure,1);
 assert.ok(inside.level<entrance.level);
 assert.equal(Ambience.profile({...s,phase:'complete'}).level,0);
 const restored=Story.restore(Story.serialize(s));
 assert.equal(Footfall.surfaceAt(restored),'interior');
 assert.deepEqual(Ambience.profile(restored),inside);
});
function clearedStory(){
 const s=Story.createState();Object.assign(s.world.player,{x:0,z:-18});Story.interact(s);
 s.phase='records';s.combat.cleared=true;
 for(const b of s.world.bots){b.health=0;b.alive=false;b.shots=12;}
 Object.assign(s.world.player,{x:42,z:-25,yaw:0});
 Object.assign(s.kimJiyoon,{x:42,z:-51});return s;
}
test('Kim physically crosses the hall and walks around the captain rather than deadlocking or overlapping',()=>{
 const s=clearedStory(),p=s.world.player;let crossed=false,detoured=false;
 for(let i=0;i<1200;i++){
  const before={...s.kimJiyoon};Story.step(s,1/60,{});const kim=s.kimJiyoon;
  assert.ok(Math.hypot(kim.x-before.x,kim.z-before.z)<=5/60+1e-7,'bounded walking, no teleport');
  assert.equal(Sim.blocked(kim.x,kim.z,.55,s.world.obstacles),false);
  assert.equal(Sim.blocked(kim.x,kim.z,.55,[{x:p.x,z:p.z,w:1.7,d:1.7}]),false);
  if(kim.z>-48&&kim.z<-28)crossed=true;
  if(Math.abs(kim.x-p.x)>1.4&&kim.z>-28)detoured=true;
 }
 assert.ok(crossed&&detoured);
 assert.ok(Math.hypot(s.kimJiyoon.x-42,s.kimJiyoon.z+22.4)<.37);
 assert.equal(s.phase,'records','walking through a hall invents no mission completion');
});
test('companion detour resumes from physical save poses and respects waiting without hidden path memory',()=>{
 const s=clearedStory();for(let i=0;i<400;i++)Story.step(s,1/60,{});
 const saved=Story.serialize(s),r=Story.restore(saved);assert.equal(Story.serialize(r),saved);
 for(let i=0;i<300;i++){Story.step(s,1/60,{});Story.step(r,1/60,{});}
 assert.deepEqual(r.kimJiyoon,s.kimJiyoon);
 r.kimWaiting=true;const before={...r.kimJiyoon};
 for(let i=0;i<60;i++)Story.step(r,1/60,{});
 assert.deepEqual(r.kimJiyoon,before);
 const narrow=[{x:-1.15,z:0,w:1,d:8},{x:1.15,z:0,w:1,d:8}];
 assert.equal(Paths.plan({x:0,z:-3},{x:0,z:3},narrow),null);
 assert.ok(Paths.plan({x:0,z:-3},{x:0,z:3},narrow,{clearance:.55,step:1,maxVisits:420}));
 for(const opts of [{clearance:0},{step:0},{clearance:NaN},{step:Infinity}])
  assert.throws(()=>Paths.plan({x:0,z:0},{x:2,z:2},[],opts),/body or grid/);
});
test('BR96 ceiling/floor remain projected from inside without overpainting a visible human',()=>{
 const polys=[];let color,points=[];const fills=[];
 const ctx={set fillStyle(v){color=v},fillRect(x,y,w,h){fills.push({color,x,y,w,h,polyCount:polys.length})},
  fillText(){},beginPath(){points=[]},moveTo(x,y){points.push([x,y])},lineTo(x,y){points.push([x,y])},
  closePath(){},fill(){polys.push({color,points})},stroke(){}};
 const walls=Sim.harborPassage(0,0,16,20,8),rooms=Sim.harborPassageSpaces(walls);
 Street.draw(ctx,{width:800,height:600,subject:{id:0,x:0,z:0},yaw:0,
  obstacles:walls,loadingHalls:rooms,visible:[{id:1,x:0,z:-5}],showLabels:false});
 const roof=polys.find(p=>p.color==='#595e5b'),floor=polys.find(p=>p.color==='#706e64');
 assert.ok(roof&&floor,'camera inside a room still sees clipped surfaces');
 assert.ok(roof.points.every(([x,y])=>Number.isFinite(x)&&y<=600*.52));
 assert.ok(floor.points.every(([x,y])=>Number.isFinite(x)&&y>=600*.52));
 assert.ok(fills.some(f=>f.color==='#d4aa99'&&f.polyCount===polys.length),
  'room floor is drawn before a server-visible actor, never over their body');
 assert.throws(()=>Street.draw(ctx,{width:800,height:600,subject:{id:0,x:0,z:0},yaw:0,
  obstacles:[],loadingHalls:[{x:0,z:0,w:16,d:20,h:NaN}]}),/loading_hall/);
});

test('CH01 saves use their own open approach instead of the removed BR service-yard fence',()=>{
 const s=Story.createState();Object.assign(s.world.player,{x:42,z:-25});
 assert.equal(Sim.blocked(42,-25,.85,Sim.newMatch(1,0).obstacles),true);
 assert.equal(Sim.blocked(42,-25,.85,s.world.obstacles),false);
 const saved=Story.serialize(s),r=Story.restore(saved);
 assert.equal(r.world.player.x,42);assert.equal(r.world.player.z,-25);
 assert.equal(Story.serialize(r),saved);
 const invalid=JSON.parse(saved);invalid.player.x=-85;invalid.player.z=-76;
 assert.throws(()=>Story.restore(JSON.stringify(invalid)),/checkpoint world/,
  'real shared building collisions must still reject a forged checkpoint');
});
