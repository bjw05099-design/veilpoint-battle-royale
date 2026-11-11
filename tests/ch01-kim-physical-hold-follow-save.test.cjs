'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function episode(){
 const s=Story.createState();
 const terminal=Story.POINTS.terminal;
 s.world.player.x=terminal.x;s.world.player.z=terminal.z;
 assert.equal(Story.interact(s).phase,'engagement');
 for(const bot of s.world.bots){bot.health=0;bot.alive=false;}
 s.combat.cleared=true;s.phase='records';
 Story.step(s,1/60,{});
 return s;
}
const beside=s=>{
 s.world.player.x=s.kimJiyoon.x;
 s.world.player.z=s.kimJiyoon.z+1.9;
};
test('CH01 F requests a physical companion hold, 60Hz ticks keep the human in place, F resumes on-site',()=>{
 const s=episode();beside(s);
 const prompt=Story.markers(s).find(m=>m.id==='kimControl');
 assert.ok(prompt);
 assert.match(prompt.label,/대기/);
 assert.equal(Story.nearest(s).id,'kimControl');
 assert.equal(Story.interact(s).event,'kim_wait');
 assert.equal(s.kimWaiting,true);
 const held={x:s.kimJiyoon.x,z:s.kimJiyoon.z};
 s.world.player.x=held.x+10;s.world.player.z=held.z+5;
 for(let i=0;i<120;i++)Story.step(s,1/60,{});
 assert.deepEqual({x:s.kimJiyoon.x,z:s.kimJiyoon.z},held,
  'temporary on-site waiting never remote-teleports the companion');
 assert.equal(Story.markers(s).some(m=>m.id==='kimControl'),false);
 beside(s);
 assert.match(Story.nearest(s).label,/재개/);
 assert.equal(Story.interact(s).event,'kim_follow');
 assert.equal(s.kimWaiting,false);
 s.world.player.x=held.x+7;s.world.player.z=held.z+3;
 const before={...s.kimJiyoon};
 for(let i=0;i<45;i++)Story.step(s,1/60,{});
 assert.ok(Math.hypot(s.kimJiyoon.x-before.x,s.kimJiyoon.z-before.z)>.1,
  'after the new F interaction, the original companion actually follows');
 assert.equal(s.phase,'records','optional teammate behavior never changes chapter progress');
});
test('CH01 Kim wait is a validated optional V2 field, not a new mission unlock or untrusted remote command',()=>{
 const s=episode();beside(s);
 assert.equal(Story.interact(s).event,'kim_wait');
 const raw=Story.serialize(s),reloaded=Story.restore(raw);
 assert.equal(reloaded.kimWaiting,true);
 assert.equal(Story.serialize(reloaded),raw);
 assert.equal(Story.missionTasks(reloaded).length,0);
 const old=JSON.parse(raw);delete old.kimWaiting;
 assert.equal(Story.restore(JSON.stringify(old)).kimWaiting,false,
   'older checkpoints continue following on load');
 const forged=JSON.parse(raw);forged.kimWaiting='true';
 assert.throws(()=>Story.restore(JSON.stringify(forged)),RangeError);
 const missing=JSON.parse(raw);missing.kimJiyoon=null;
 assert.throws(()=>Story.restore(JSON.stringify(missing)),RangeError);
 const offstage=JSON.parse(raw);offstage.phase='terminal';
 assert.throws(()=>Story.restore(JSON.stringify(offstage)),RangeError);
});
test('CH01 teammate F control cannot be used through a real wall, from another district or during escalation',()=>{
 const s=episode();beside(s);
 const person={...s.kimJiyoon};
 s.world.player.x=person.x+40;s.world.player.z=person.z;
 assert.equal(Story.markers(s).some(m=>m.id==='kimControl'),false);
 beside(s);
 s.world.obstacles.push({x:person.x,z:person.z+.9,w:2.5,d:.3,type:'test-opaque-civic-wall'});
 assert.equal(Story.markers(s).some(m=>m.id==='kimControl'),false);
 s.world.obstacles.pop();
 s.phase='engagement';
 assert.equal(Story.markers(s).some(m=>m.id==='kimControl'),false);
 assert.equal(s.kimWaiting,false);
});
