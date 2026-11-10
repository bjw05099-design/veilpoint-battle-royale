'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Audio=require('../src/story-harbor-ambience.js');
const Sim=require('../src/simulation.js');

function afterIncident(){
 const s=Story.createState();
 s.world.player.x=Story.POINTS.terminal.x;
 s.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 for(const bot of s.world.bots){bot.health=0;bot.alive=false;}
 s.phase='records';s.combat.cleared=true;
 Story.step(s,1/60,{});
 return s;
}
test('CH01 acoustic interior requires all actual story-first hall walls and a physically walkable interior',()=>{
 const s=Story.createState();
 s.world.player.x=28;s.world.player.z=34;
 const before=Story.serialize(s);
 const interior=Audio.profile(s);
 assert.equal(interior.indoors,true,'story-first hall must sound different once its actual public walls are loaded');
 assert.equal(interior.area,'interior');
 assert.ok(interior.level>0);
 assert.equal(Sim.blocked(28,34,.65,s.world.obstacles),false);
 assert.equal(Story.serialize(s),before,'acoustic lookup is read only and keeps original V2 checkpoint bytes');
 const keep=s.world.obstacles;
 s.world.obstacles=keep.filter(o=>o.id!=='harbor-hall-north');
 assert.equal(Audio.profile(s).indoors,false,
  'older worlds without a physical room cannot emit phantom indoor sound');
 s.world.obstacles=keep;
 s.world.player.z=25;
 assert.equal(Audio.profile(s).indoors,false,'south doorway exterior is not inside');
 s.world.player.z=34;s.world.player.x=22.6;
 assert.equal(Audio.profile(s).indoors,false,'the solid side seat cannot be an accessible acoustic listener location');
});
test('CH01 only ducks environmental bed for currently witnessed face-to-face conversation, not distant or walled-off NPCs',()=>{
 const s=afterIncident();
 const jo=s.world.liaison;
 assert.equal(jo?.role,'jo-hyunji');
 s.world.player.x=jo.x;s.world.player.z=jo.z+2;
 const dialog=Audio.profile(s);
 assert.equal(dialog.speechPriority,true);
 assert.ok(dialog.level>0);
 const savedJo={x:jo.x,z:jo.z};
 jo.x=1000;jo.z=1000;
 const noActor=Audio.profile(s);
 assert.equal(noActor.speechPriority,false);
 assert.ok(noActor.level>dialog.level,'environment must remain more audible without a nearby speaking person');
 Object.assign(jo,savedJo);
 const blocker={x:jo.x,z:jo.z+1,w:3,d:.45,h:2.4,type:'test-opaque-wall'};
 s.world.obstacles.push(blocker);
 assert.equal(Audio.profile(s).speechPriority,false,'a solid wall cannot transmit a local face-to-face cue');
 s.world.obstacles.pop();
 assert.equal(Audio.profile(s).speechPriority,true);
 s.phase='engagement';
 assert.equal(Audio.profile(s).speechPriority,false,'unverified speech must not overwrite active incident audio');
 s.phase='records';
 s.world.player.x=0;s.world.player.z=100;
 assert.equal(Audio.profile(s).speechPriority,false,'no citywide teammate radio inference');
});
test('CH01 new acoustic cues never require network sources, gameplay mutations, automatic audio starts or new save fields',()=>{
 const s=Story.createState(),saved=Story.serialize(s);
 const sound=Audio.create();
 assert.equal(sound.enabled(),false);
 assert.equal(sound.update(s),false);
 assert.equal(Audio.profile(s).speechPriority,false);
 assert.equal(Story.serialize(s),saved);
 const script=fs.readFileSync(path.resolve(__dirname,'../src/story-harbor-ambience.js'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/ambience\?\.update\(state,canAct\(\)\)/);
 assert.match(script,/if\(!enabled\|\|!context\|\|!gain\)return false/);
 assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|WebSocket|geolocation|localStorage/);
});
