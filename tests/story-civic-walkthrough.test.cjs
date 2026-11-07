'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
function afterEncounter(){
 const state=Story.createState(),player=state.world.player;
 player.x=Story.POINTS.terminal.x;player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).ok,true);
 for(const b of state.world.bots){b.health=0;b.alive=false;}
 state.combat.cleared=true;state.phase='records';
 return state;
}
test('CH01 physically walks across the common Aden-inspired neighborhood before receiving a new scene',()=>{
 const early=Story.createState();
 early.world.player.x=77;early.world.player.z=123;
 Story.step(early,1/60,{});
 assert.equal(early.civicVisited,false,
  'the optional field observation cannot precede the story encounter');
 const state=afterEncounter(),p=state.world.player;
 const baseline=Story.markers(state).map(m=>m.id);
 p.x=77;p.z=107;p.yaw=Math.PI;
 assert.equal(state.civicVisited,false);
 assert.equal(Sim.blocked(p.x,p.z,.85,state.world.obstacles),false);
 for(let tick=0;tick<165;tick++)Story.step(state,1/60,{forward:true});
 assert.equal(state.civicVisited,true,'arrival must follow actual fixed-step travel');
 assert.ok(p.z>118&&p.z<134);
 assert.equal(Sim.blocked(p.x,p.z,.85,state.world.obstacles),false);
 assert.match(state.subtitle,/조현지/);
 assert.match(state.subtitle,/접수 상태는 아직 확인되지/);
 assert.deepEqual(Story.markers(state).map(m=>m.id),baseline,
  'urban scene observation must not erase original mission records or choices');
 const message=state.message;
 for(let tick=0;tick<60;tick++)Story.step(state,1/60,{});
 assert.equal(state.message,message,'arrival only triggers once');
});
test('CH01 civic walk stays in strict v2 checkpoint and older saves still load',()=>{
 const s=afterEncounter(),p=s.world.player;
 p.x=77;p.z=122;
 Story.step(s,1/60,{});
 assert.equal(s.civicVisited,true);
 const checkpoint=Story.serialize(s),loaded=Story.restore(checkpoint);
 assert.equal(loaded.civicVisited,true);
 assert.equal(Story.serialize(loaded),checkpoint);
 const legacy=JSON.parse(checkpoint);
 delete legacy.civicVisited;
 const restored=Story.restore(JSON.stringify(legacy));
 assert.equal(restored.civicVisited,false);
 for(const forged of [1,'true',null]){
  assert.throws(()=>Story.restore(JSON.stringify({...legacy,civicVisited:forged})),
   /Invalid story checkpoint/);
 }
 const early=JSON.parse(Story.serialize(Story.createState()));
 early.civicVisited=true;
 assert.throws(()=>Story.restore(JSON.stringify(early)),/Invalid story checkpoint/);
 p.x=Story.POINTS.decision.x;p.z=Story.POINTS.decision.z;
 assert.equal(Story.interact(s).phase,'decision');
 assert.equal(Story.choose(s,'evacuation').ok,true);
 p.x=Story.POINTS.exitEvac.x;p.z=Story.POINTS.exitEvac.z;
 assert.equal(Story.interact(s).phase,'complete');
 const ending=Story.debrief(s);
 assert.equal(ending.civicVisited,true);
 assert.match(ending.summary,/도심 주민 공동 안뜰까지 직접 이동/);
 assert.match(ending.summary,/추가 주민 접수 결과는 미확인/);
});
test('visiting real CH01 neighborhood never fabricates a BR-world event',()=>{
 const br=Sim.newMatch(10,0,'carbine');
 assert.equal(Object.hasOwn(br,'civicVisited'),false);
 const story=afterEncounter();
 story.world.player.x=77;story.world.player.z=124;
 Story.step(story,1/60,{});
 assert.equal(story.civicVisited,true);
 assert.equal(story.world.scene,'nahrin');
 const brObstacles=br.obstacles.filter(o=>o.type?.startsWith('aden-civic-'));
 const storyObstacles=story.world.obstacles.filter(o=>o.type?.startsWith('aden-civic-'));
 assert.deepEqual(storyObstacles,brObstacles,
  'narrative event layers must not fork the geometry shared by two gameplay modes');
});
