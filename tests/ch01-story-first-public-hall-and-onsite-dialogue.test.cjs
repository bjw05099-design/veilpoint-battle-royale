'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Hall=require('../src/aden-public-hall.js');
const Comms=require('../src/story-comms.js');
const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
const at=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
function afterIncident(){
 const s=Story.createState();
 at(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.phase='records';s.combat.cleared=true;
 Story.step(s,1/60,{});
 return s;
}
test('CH01 map renders a physically accessible civilian hall with 8m actual south opening',()=>{
 const s=Story.createState(),map=s.world.obstacles;
 assert.equal(Hall.FORMAT,'veilpoint-original-public-hall-v1');
 assert.equal(Hall.geographicAccuracyVerified,false);
 assert.equal(Hall.sharedAfterStoryRelease,true);
 assert.equal(Hall.PARTS.length,7);
 assert.equal(map.filter(o=>o.id?.startsWith('harbor-hall-')).length,7);
 for(let z=22;z<=38;z+=.25){
  assert.equal(Sim.blocked(28,z,.85,map),false,'public middle corridor must remain walkable at z='+z);
  assert.equal(Hall.walkable(28,z,.85),true);
 }
 for(const [x,z] of [[20,34],[36,34],[28,42],[22,26],[34,26]]){
  assert.equal(Sim.blocked(x,z,.85,map),true,'hall wall must have genuine 60Hz collision');
  assert.equal(Hall.walkable(x,z,.85),false);
 }
 const avatar={x:28,z:22};
 for(let t=0;t<250;t++)Sim.moveEntity(avatar,0,4.2,1/60,map,.85);
 assert.ok(avatar.z>37&&avatar.z<40,'player physically walked through open southern entrance');
 for(let t=0;t<200;t++)Sim.moveEntity(avatar,0,4.2,1/60,map,.85);
 assert.ok(avatar.z<41.5,'solid rear wall blocks movement without invisible teleport');
 assert.equal(Sim.blocked(avatar.x,avatar.z,.85,map),false);
 assert.equal(Sim.newMatch(42,0).obstacles.some(o=>o.id?.startsWith('harbor-hall-')),false,
   'story-first hall must not silently modify saved BR terrain revisions or competitive collision');
});
test('story hall is drawn in WebGL and Canvas from the exact playable obstacles and shipped offline',()=>{
 for(const type of ['story-public-hall-wall','story-public-hall-counter','story-public-hall-seat']){
  assert.match(render,new RegExp(type));
 }
 assert.match(render,/if\(o\.type==='story-public-hall-wall'\)/);
 assert.match(render,/if\(o\.type==='story-public-hall-counter'\|\|o\.type==='story-public-hall-seat'\)/);
 assert.ok(html.indexOf('src/aden-public-hall.js')<html.indexOf('src/story-slice.js'));
 const s=Story.createState(),save=Story.serialize(s);
 const restored=Story.restore(save);
 assert.equal(Story.serialize(restored),save,'existing v2 story checkpoints preserve all prior mission fields');
 assert.equal(restored.world.obstacles.filter(o=>o.id?.startsWith('harbor-hall-')).length,7);
});
test('Jo and Kim dialogue is local to actually witnessed companion positions, not remote game intelligence',()=>{
 const s=afterIncident();
 at(s,12,-36.8);
 assert.equal(Comms.onsiteColleague(s).speaker,'조현지');
 assert.match(Comms.fieldRadio(s,{speaker:'공용 방송',message:'broadcast'}).message,/공용 중계기/);
 s.relayRestored=true;
 assert.match(Comms.onsiteColleague(s).message,/복구한 공용 중계기/);
 const obstruction={x:12,z:-38,w:6,d:.45,h:3,type:'test-solid'};
 s.world.obstacles.push(obstruction);
 assert.equal(Comms.onsiteColleague(s),null,'a wall must prevent Jo from speaking face to face');
 s.world.obstacles.pop();
 at(s,-2,10);
 s.workerInterviewed=true;
 assert.equal(Comms.onsiteColleague(s).speaker,'김지윤');
 assert.match(Comms.onsiteColleague(s).message,/1990년 통일과 1994년 전쟁/);
 at(s,-100,-100);
 assert.equal(Comms.onsiteColleague(s),null,'never announce a companion from across the city');
});
test('enterable community room delivers truthful optional environmental story without fake civilian count or new quest gate',()=>{
 const s=afterIncident();
 at(s,28,34);
 assert.equal(Sim.blocked(s.world.player.x,s.world.player.z,.85,s.world.obstacles),false);
 assert.equal(Comms.onsitePublicHall(s).speaker,'이수혁 대위');
 assert.match(Comms.onsitePublicHall(s).message,/주민 회관/);
 assert.match(Comms.onsitePublicHall(s).message,/확인되지 않았다/);
 s.musterConfirmed=true;
 assert.match(Comms.onsitePublicHall(s).message,/남쪽에서 확인했다/);
 // The branch above only tests dialogue selection. This in-memory fixture
 // has not physically met Yusuf, so do not serialize forged mission progress.
 // Production V2 saves require an actual evacuation route + in-person muster.
 s.musterConfirmed=false;
 at(s,0,12);
 assert.equal(Comms.onsitePublicHall(s),null);
 const early=Story.createState();at(early,28,34);
 assert.equal(Comms.onsitePublicHall(early),null,'future local incident content cannot be heard pre-incident');
 const save=Story.serialize(s),roundtrip=Story.restore(save);
 assert.equal(Story.serialize(roundtrip),save);
 assert.deepEqual(roundtrip.found,s.found);
 assert.equal(roundtrip.choice,null,'optional presence does not forge exit authorization');
});
