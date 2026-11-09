'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const Civic=require('../src/ch01-civic-recovery.cjs');
const Visibility=require('../src/visibility.js');

function reachCivicCrossing(){
 const state=Story.createState();
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 for(const bot of [...state.world.bots]){
  for(let shot=0;shot<2;shot++){
   state.world.player.yaw=Math.atan2(bot.x-state.world.player.x,
      -(bot.z-state.world.player.z));
   state.world.player.pitch=0;
   state.world.elapsed+=.21;
   assert.equal(Story.fire(state).ok,true);
  }
 }
 assert.equal(state.phase,'records');
 Story.step(state,1/60,{});
 assert.equal(state.civicCrossing.disrupted,true);
 return state;
}
test('the same authored civilian engine loads in Node and actual story HTML before the story module',()=>{
 const browser=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 assert.match(browser,/src\/ch01-civic-recovery\.js/);
 assert.ok(browser.indexOf('src/ch01-civic-recovery.js')<
           browser.indexOf('src/story-slice.js'));
 assert.equal(typeof Civic.step,'function');
 assert.equal(Civic.CROSSING.x,6);
 const code=fs.readFileSync(path.join(__dirname,'../src/ch01-civic-recovery.cjs'),'utf8');
 assert.match(code,/require\('\.\/ch01-civic-recovery\.js'\)/);
});
test('a local optional citizen crossing is visible and cannot be operated from afar',()=>{
 const s=reachCivicCrossing();
 const resident=s.world.civicCrossing;
 assert.equal(resident.role,'civic-crossing-resident');
 assert.equal(s.civicCrossing.assisted,false);
 assert.equal(Story.interact(s).ok,false,'remote F does not control a civilian');
 const home={...resident};
 s.world.player.x=Civic.CROSSING.x;s.world.player.z=Civic.CROSSING.z;
 s.world.player.yaw=0;
 const r=Story.interact(s);
 assert.equal(r.ok,true);
 assert.equal(r.event,'civic_crossing_assist');
 assert.equal(s.civicCrossing.assisted,true);
 assert.equal(Story.civicCrossingReached(s),false,'a conversation is not a completed crossing');
 assert.equal(Story.civicCrossingArrivalCheckpoint(false,s),false);
 assert.equal(Story.interact(s).event==='civic_crossing_assist',false,
  'repeating F never creates a new artificial civilian task');
 assert.deepEqual({...resident},home,'the first click does not teleport a civilian');
});
test('resident waits for the player, resumes only on walkable ground and survives save/restore',()=>{
 const s=reachCivicCrossing(),p=s.world.player;
 p.x=Civic.CROSSING.x;p.z=Civic.CROSSING.z;
 assert.equal(Story.interact(s).ok,true);
 let prior=s.civicCrossing.civilian.x;
 for(let i=0;i<300;i++)Story.step(s,1/60,{});
 assert.ok(s.civicCrossing.civilian.x>prior);
 assert.ok(s.civicCrossing.civilian.x<Civic.CROSSING.x-0.6,
  'actual captain capsule prevents civil body from walking through the player');
 assert.equal(Sim.blocked(s.civicCrossing.civilian.x,
   s.civicCrossing.civilian.z,.55,s.world.obstacles),false);
 const stopped=s.civicCrossing.civilian.x;
 for(let i=0;i<30;i++)Story.step(s,1/60,{});
 assert.equal(s.civicCrossing.civilian.x,stopped);
 p.x=-12;p.z=0;
 for(let i=0;i<500;i++)Story.step(s,1/60,{});
 assert.equal(s.civicCrossing.civilian.x,10);
 assert.equal(s.world.civicCrossing.x,10);
 assert.equal(Story.civicCrossingReached(s),true);
 assert.equal(s.world.civicCrossingArrived,true,'actual 60Hz arrival reaches the rendered world');
 assert.equal(Story.civicCrossingArrivalCheckpoint(false,s),true);
 assert.equal(Story.civicCrossingArrivalCheckpoint(true,s),false,'no per-frame repeat save');
 const checkpoint=Story.serialize(s),back=Story.restore(checkpoint);
 assert.deepEqual(back.civicCrossing,s.civicCrossing);
 assert.equal(back.world.civicCrossing.x,10);
 assert.equal(back.world.civicCrossingArrived,true,'checkpoint restores witnessed world result');
 assert.equal(Story.serialize(back),checkpoint);
});
test('legacy v2 save has no newly invented extra citizen; corrupted civil position is rejected',()=>{
 const s=reachCivicCrossing();
 const raw=JSON.parse(Story.serialize(s));
 delete raw.civicCrossing;
 const old=Story.restore(JSON.stringify(raw));
 assert.equal(old.civicCrossing,null);
 assert.equal(old.world.civicCrossing,null);
 for(const bad of [
  {...Civic.initial(),assisted:true},
  {...Civic.initial(),civilian:{x:900,z:-16}},
  {...Civic.initial(),disrupted:true,assisted:true},
  {...Civic.initial(),destination:{x:999,z:-16}},
 ])assert.throws(()=>Story.restore(JSON.stringify({...raw,civicCrossing:bad})),RangeError);
});
test('a wall or a turned-away camera cannot expose this resident remotely',()=>{
 const s=reachCivicCrossing(),p=s.world.player;
 p.x=2;p.z=-7;p.yaw=0;
 const vis=Visibility.planVisible(s.world,16/9);
 const found=vis.witnesses.find(w=>w.entity.role==='civic-crossing-resident');
 assert.ok(found,'nearby person appears in normal scene rather than a separate HUD');
 p.yaw=Math.PI;
 const away=Visibility.planVisible(s.world,16/9);
 assert.equal(away.witnesses.some(w=>w.entity.role==='civic-crossing-resident'),false);
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/role==='civic-crossing-resident'/);
 assert.match(renderer,/type:'crossing-resident'/);
});
