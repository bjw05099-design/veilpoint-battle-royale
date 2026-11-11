'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');

function readyStory(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 const started=Story.interact(s);
 assert.equal(started.phase,'engagement');
 for(const hostile of s.world.bots){hostile.alive=false;hostile.health=0;}
 s.combat.cleared=true;
 s.phase='records';
 s.kimWaiting=true;
 return s;
}

test('Kim physically turns toward nearby captain with bounded 60Hz yaw; no remote actor knowledge',()=>{
 const s=readyStory();
 s.world.player.x=s.kimJiyoon.x+3;s.world.player.z=s.kimJiyoon.z;
 const original=Story.serialize(s);
 Story.step(s,1/60,{});
 assert.ok(Number.isFinite(s.world.kimJiyoon.angle));
 assert.ok(Math.abs(s.world.kimJiyoon.angle-Math.PI/2)<1e-8);
 const x=s.kimJiyoon.x,z=s.kimJiyoon.z;
 s.world.player.x=x-3;s.world.player.z=z;
 const before=s.world.kimJiyoon.angle;
 Story.step(s,1/60,{});
 const next=s.world.kimJiyoon.angle;
 assert.ok(Math.abs(Math.atan2(Math.sin(next-before),Math.cos(next-before)))<=3/60+1e-8,
  'human torso cannot snap 180 degrees in a single game tick');
 assert.equal(s.kimJiyoon.x,x);
 assert.equal(s.kimJiyoon.z,z);
 assert.equal(Object.hasOwn(s.kimJiyoon,'angle'),false,
  'render pose never enters actual NPC save or collision actor');
 assert.ok(!Story.serialize(s).includes('civilianFacing'),
  'legacy CH01 V2 checkpoint has no new animation-only state field');
 assert.ok(!original.includes('civilianFacing'));
});
test('unseen civilians behind walls are not rotated toward a distant player',()=>{
 const s=readyStory();
 s.world.player.x=100;s.world.player.z=0;
 Story.step(s,1/60,{});
 const current=s.world.kimJiyoon.angle;
 s.world.player.x=-100;s.world.player.z=0;
 Story.step(s,1/60,{});
 assert.equal(s.world.kimJiyoon.angle,current,
  'remote camera location does not grant omniscient eye contact');
});
test('existing story renderer consumes 60Hz civilian headings in WebGL AND Canvas fallback',()=>{
 const render=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/mesh\.boxYaw\(w\.x,\.05,w\.z,\.56,1\.20,\.45,angle/);
 assert.match(render,/Number\.isFinite\(w\.angle\)/);
 assert.match(render,/field-companion','crossing-resident'/);
 const story=fs.readFileSync(path.join(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(story,/syncVisibleCharacterFacing\(state,t\)/);
 assert.match(story,/Sim\.lineBlocked\(person\.x,person\.z,p\.x,p\.z,world\.obstacles\)/);
 const s=readyStory();
 s.world.player.x=s.kimJiyoon.x+2;s.world.player.z=s.kimJiyoon.z;
 Story.step(s,1/60,{});
 const save=Story.serialize(s);
 const recovered=Story.restore(save);
 assert.equal(Story.serialize(recovered),save);
 Story.step(recovered,1/60,{});
 assert.ok(Number.isFinite(recovered.world.kimJiyoon.angle));
});
