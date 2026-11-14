'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const Visibility=require('../src/visibility.js'),Street=require('../src/br96-street-view.js');
const origin={x:0,y:1.64,z:0},standing={id:1,x:0,z:-20,alive:true};
const cover=h=>[{x:0,z:-10,w:6,d:1,h}];
test('standing shot clears low cover while a crouched shot and a tall wall stop it',()=>{
 assert.equal(Sim.traceShot(origin,0,0,40,cover(1.3),[standing]).actor,standing);
 assert.equal(Sim.traceShot({...origin,y:1.09},0,0,40,cover(1.3),[standing]),null);
 assert.equal(Sim.traceShot(origin,0,0,40,cover(3),[standing]),null);
 assert.equal(Sim.blocked(0,-10,.85,cover(1.3)),true,'height never removes walking collision');
 assert.equal(Sim.traceShot(origin,0,.3,40,[],[standing]),null,'no shot above the head');
 assert.equal(Sim.traceShot(origin,0,0,40,[],[{...standing,crouched:true}]),null);
 assert.equal(Sim.traceShot(origin,0,0,40,[{x:0,z:-10,w:.01,d:.01,h:3}],[standing]),null);
 const nearer={id:2,x:0,z:-5,alive:true};
 assert.equal(Sim.traceShot(origin,0,0,40,[],[standing,nearer]).actor,nearer);
});
test('CH01 and offline BR share real finite-height hits and the visible silhouette',()=>{
 for(const story of [false,true]){
  const s=story?Story.createState():null,g=s?s.world:Sim.newMatch(17,1);
  g.status='playing';g.obstacles=cover(1.3);
  Object.assign(g.player,{x:0,z:0,yaw:0,pitch:0});
  g.bots=[{...standing,health:90}];
  if(s){s.phase='engagement';s.combat.started=true;}
  const visible=Visibility.planVisible(g).bots;
  assert.equal(visible.length,1,'a visible head above a crate cannot be culled');
  const result=s?Story.fire(s):Sim.tag(g);
  assert.equal(result.hit,true);assert.equal(g.bots[0].health,45);
  assert.equal(g.player.loaded,11);
 }
});
test('shared and CH01 loading halls have real four-metre exits and solid side bays',()=>{
 const story=Story.createState();
 for(const [world,x,z,d] of [[story.world,42,-38,20],[Sim.newMatch(19,0),114,10,15]]){
  const actor={x,z:z+d/2+2};
  assert.equal(Sim.blocked(actor.x,actor.z,.85,world.obstacles),false);
  for(let tick=0;tick<360;tick++)Sim.moveEntity(actor,0,-5,1/60,world.obstacles);
  assert.ok(actor.z<z-d/2-1,'the 60Hz body physically exits the other end');
  assert.equal(world.obstacles.filter(o=>o.type==='harbor-passage-wall').length>=6,true);
  const crate=world.obstacles.find(o=>o.type==='harbor-passage-crate'&&Math.hypot(o.x-x,o.z-z)<15);
  assert.equal(Sim.blocked(crate.x,crate.z,.85,world.obstacles),true);
 }
 const saved=Story.serialize(story),restored=Story.restore(saved);
 assert.equal(Story.serialize(restored),saved);
 const old=Sim.newMatch(19,0,'carbine',false,'central','day',0);
 assert.ok(old.obstacles.some(o=>o.type==='building'&&o.x===114&&o.z===10),
  'historical terrain revision zero retains its solid footprint');
});
test('BR street renders far walls above low cover and only the exposed part of a body',()=>{
 const walls=[...cover(1.3),{x:0,z:-30,w:10,d:1,h:5,type:'wall'}];
 const frame=Street.frame({subject:{id:9,x:0,z:0},obstacles:walls,visible:[standing]});
 const ray=frame.rays[Math.floor(frame.columns/2)];
 assert.equal(ray.layers.length,2);assert.equal(ray.layers[1].height,5);
 assert.equal(frame.seen.length,1);assert.ok(frame.seen[0].occludedBelowHeight>0);
 const hidden=Street.frame({subject:{id:9,x:0,z:0,crouched:true},
  obstacles:cover(1.3),visible:[{...standing,crouched:true}]});
 assert.equal(hidden.seen.length,0);
 const painted=[],labels=[];let fill='';
 const ctx={set fillStyle(x){fill=x},fillRect(x,y,w,h){painted.push({fill,x,y,w,h})},
  fillText(text){labels.push(text)},beginPath(){},moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){}};
 const model=Street.draw(ctx,{width:700,height:480,yaw:0,subject:{id:9,x:0,z:0},
  obstacles:walls,visible:[standing],showLabels:false});
 assert.equal(labels.length,0,'embedded controls do not overlap canvas diagnostic labels');
 const body=painted.filter(p=>p.fill==='#d4aa99');assert.ok(body.length>0);
 const person=model.seen[0],cut=480*.52+(model.eyeHeight-person.occludedBelowHeight)*480*.68/person.depth;
 assert.ok(body.every(p=>p.y+p.h<=cut+1e-8),'hidden legs are not painted on top of a crate');
});

test('CH01 passage radio line follows actual doorway crossing, not a remote map marker',()=>{
 const s=Story.createState();Object.assign(s.world.player,{x:0,z:-18});Story.interact(s);
 Object.assign(s.world.player,{x:42,z:-26,yaw:0});
 const original=s.subtitle;Story.step(s,1/60,{});assert.equal(s.subtitle,original);
 for(let i=0;i<22;i++)Story.step(s,1/60,{forward:true});
 assert.ok(s.world.player.z<-27.75);assert.match(s.subtitle,/창고 안쪽 통로/);
 assert.equal(s.phase,'engagement','an alternate passage never fabricates combat clearance');
});
