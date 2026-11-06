'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');
const Desktop=require('../src/desktop-controls.js');

function scene({active=true,waiting=false,wall=false}={}){
 const s=Story.createState();
 s.phase='exit';s.choice='evacuation';s.musterConfirmed=true;
 s.guide.active=active;s.guide.arrived=false;s.guide.released=false;
 s.guide.waiting=waiting;s.guide.x=0;s.guide.z=-61;
 s.world.player.x=-3;s.world.player.z=-61;s.world.player.yaw=0;
 s.world.player.stamina=50;
 // Isolate finite, clear physical corridor without changing the production
 // movement controller; real Sim.moveEntity remains in use.
 s.world.obstacles=wall?[{x:-1.5,z:-61,w:.3,d:3}]:[];
 return s;
}
function advance(s,input,frames=60){
 const x=s.world.player.x,z=s.world.player.z;
 for(let i=0;i<frames;i++)Story.step(s,1/60,input);
 return Math.hypot(s.world.player.x-x,s.world.player.z-z);
}
test('CH01 visible civilian sets a bounded 60Hz crouch pace that a walking guide can match',()=>{
 const paced=scene(),normal=scene({active:false});
 assert.equal(Story.situation(paced).escortPaceAvailable,true);
 assert.equal(Story.situation(normal).escortPaceAvailable,false);
 const slow=advance(paced,{left:true,crouch:true});
 const fast=advance(normal,{left:true,crouch:true});
 assert.ok(slow>0.3&&slow<=1.61,'crouched local guide pace must remain below a 1.65m/s walking guide');
 assert.ok(fast>slow*1.6,'regular crouch remains faster outside accepted escort');
 assert.ok(Math.hypot(paced.guide.x,paced.guide.z+61)>0,
  'escort civilian moves through actual fixed-step world and does not teleport');
});
test('CH01 walking pace is not activated for waiting or unseen guide',()=>{
 const waiting=scene({waiting:true});
 assert.equal(Story.situation(waiting).escortPaceAvailable,false);
 assert.ok(advance(waiting,{left:true,crouch:true})>2);
 const unseen=scene({wall:true});
 assert.equal(Story.situation(unseen).escortPaceAvailable,false);
 const before=JSON.stringify(unseen);
 Story.situation(unseen);
 assert.equal(JSON.stringify(unseen),before,'HUD may not mutate the saved or fixed-step world');
 const distant=scene();distant.guide.x=12;
 assert.equal(Story.situation(distant).escortPaceAvailable,false,
  'no remote tracking or speed changes when the guide is outside observed range');
});
test('CH01 sprint and crouch together do not drain running stamina',()=>{
 const s=scene({active:false}),initial=s.world.player.stamina;
 const walk=advance(s,{forward:true,crouch:true,sprint:true});
 assert.ok(walk>0,'crouched forward movement still works');
 assert.ok(s.world.player.stamina>initial,'sprint key must not consume stamina while crouching');
 const sprinting=scene({active:false});
 advance(sprinting,{forward:true,sprint:true});
 assert.ok(sprinting.world.player.stamina<initial,
  'ordinary intentional sprint still spends finite stamina');
});
test('CH01 pace status derives from the current visible guide without adding save fields',()=>{
 const s=scene();const snapshot=JSON.stringify(s);
 const current=Story.situation(s);
 assert.equal(current.escortPaceAvailable,true);
 assert.equal(JSON.stringify(s),snapshot);
 s.guide.waiting=true;
 assert.equal(Story.situation(s).escortPaceAvailable,false);
 s.guide.waiting=false;s.guide.arrived=true;
 assert.equal(Story.situation(s).escortPaceAvailable,false);
});
test('PC HUD advertises the remapped crouch key only when the companion is visible',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(text,/const paceHelp=situation\.escortPaceAvailable/);
 assert.match(text,/Desktop\.keyLabel\(bindings\.crouch\)/);
 assert.match(text,/situation\.guideStatus\+guideSpacing\+paceHelp/);
 const rebound=Desktop.bind(Desktop.normalize({}),'crouch','KeyT');
 assert.equal(rebound.ok,true);
 assert.equal(Desktop.keyLabel(rebound.value.bindings.crouch),'T');
});
