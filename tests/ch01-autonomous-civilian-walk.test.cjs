'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Visibility=require('../src/visibility.js');
const go=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
function cleared(){
 const s=Story.createState();
 go(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const bot of s.world.bots){bot.health=0;bot.alive=false;}
 s.combat.cleared=true;s.phase='records';
 go(s,0,-41);
 return s;
}
test('local resident exists in the scene but does not walk before the danger has passed',()=>{
 const s=Story.createState();
 assert.deepEqual(s.civilianWalker,{x:-2,z:-46,arrived:false});
 assert.equal(s.world.civilianWalker,s.civilianWalker);
 for(let i=0;i<180;i++)Story.step(s,1/60,{});
 assert.equal(s.civilianWalker.z,-46,'no scripted flight before the local situation changes');
 assert.equal(s.phase,'terminal');
});
test('after danger clears, resident walks independently at real 60Hz speed, including on east branch',()=>{
 const s=cleared();
 for(let i=0;i<120;i++)Story.step(s,1/60,{});
 assert.ok(s.civilianWalker.z<-48.45&&s.civilianWalker.z>-48.55,
  'two seconds at 1.25m/s changes the actual world coordinate');
 assert.equal(s.civilianWalker.arrived,false);
 const saved=Story.serialize(s),again=Story.restore(saved);
 assert.equal(Story.serialize(again),saved);
 go(again,Story.POINTS.decision.x,Story.POINTS.decision.z);
 assert.equal(Story.interact(again).phase,'decision');
 assert.equal(Story.choose(again,'verification').ok,true);
 for(let i=0;i<700;i++)Story.step(again,1/60,{});
 assert.equal(again.civilianWalker.z,-58);
 assert.equal(again.civilianWalker.arrived,true);
 assert.equal(again.phase,'exit','resident agency does not finish the chapter for the player');
 assert.equal(Story.debrief(again),null,'no fabricated evacuation result before real exit');
 const end=Story.restore(Story.serialize(again));
 assert.equal(end.civilianWalker.arrived,true);
 assert.equal(end.civilianWalker.z,-58);
 assert.equal(Story.serialize(end),Story.serialize(again));
});
test('civilian has real collision: the player cannot walk through the standing body',()=>{
 const s=Story.createState();go(s,-2,-43);
 for(let i=0;i<45;i++)Story.step(s,1/60,{forward:true});
 assert.ok(s.world.player.z>-44.7,
  'the player must remain outside the 1.1m human footprint at 60Hz');
 assert.equal(s.civilianWalker.z,-46);
});
test('restore supports older checkpoints but rejects invented rescue progress or alien poses',()=>{
 const s=cleared();
 const current=JSON.parse(Story.serialize(s));
 delete current.civilianWalker;
 const legacy=Story.restore(JSON.stringify(current));
 assert.deepEqual(legacy.civilianWalker,{x:-2,z:-46,arrived:false});
 const bad=JSON.parse(Story.serialize(s));
 bad.civilianWalker={x:-80,z:-48,arrived:false};
 assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
 bad.civilianWalker={x:-2,z:-47,arrived:true};
 assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
 bad.civilianWalker={x:-2,z:-58,arrived:true};
 bad.phase='engagement';
 assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
});
test('player sees the resident only through ordinary camera/FOV and cover rules',()=>{
 const s=cleared();
 go(s,-2,-40);s.world.player.yaw=0;
 const visible=Visibility.planVisible(s.world);
 assert.ok(visible.witnesses.some(x=>x.entity===s.civilianWalker));
 s.world.player.yaw=Math.PI;
 const behind=Visibility.planVisible(s.world);
 assert.equal(behind.witnesses.some(x=>x.entity===s.civilianWalker),false);
 const br=require('../src/simulation.js').newMatch(123,0);
 assert.equal(br.civilianWalker,undefined,'autonomous resident belongs to CH01 mode, not BR');
});
