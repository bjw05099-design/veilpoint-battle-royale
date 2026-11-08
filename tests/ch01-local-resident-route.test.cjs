'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function afterUnexpectedEscalation(){
 const state=Story.createState();
 state.world.player.x=Story.POINTS.terminal.x;
 state.world.player.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(state).phase,'engagement');
 for(const actor of state.world.bots){actor.alive=false;actor.health=0;}
 state.combat.cleared=true;state.phase='records';
 return state;
}
const move=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};
const advance=(s,n)=>{for(let i=0;i<n;i++)Story.step(s,1/60,{});};
test('an actually nearby civilian may choose the alternative staffed walkway; it is not a remote quest',()=>{
 const s=afterUnexpectedEscalation();
 assert.deepEqual(s.civilianWalker,{x:-2,z:-46,arrived:false});
 assert.equal(s.civilianRerouted,false);
 assert.equal(Story.markers(s).some(m=>m.id==='residentRoute'),false);
 move(s,-2,-44.4);
 const nearby=Story.markers(s).find(m=>m.id==='residentRoute');
 assert.equal(nearby?.x,-2);
 assert.equal(nearby?.z,-46);
 assert.equal(Story.nearest(s)?.id,'residentRoute');
 const response=Story.interact(s);
 assert.deepEqual(response,{ok:true,event:'resident_route_conversation',phase:'records'});
 assert.equal(s.civilianRerouted,true);
 assert.equal(Story.markers(s).some(m=>m.id==='residentRoute'),false);
 assert.match(s.subtitle,/제가 직접 가겠습니다/);
 assert.equal(s.civilianWalker.arrived,false,'speaking does not teleport a resident');
 move(s,0,1);
 advance(s,120);
 assert.ok(s.civilianWalker.x< -2.1&&s.civilianWalker.x> -4.1);
 assert.ok(s.civilianWalker.z< -46.1&&s.civilianWalker.z> -58.1);
 const mid=Story.serialize(s),resumed=Story.restore(mid);
 assert.equal(Story.serialize(resumed),mid);
 assert.equal(resumed.civilianRerouted,true);
 advance(resumed,850);
 assert.deepEqual(resumed.civilianWalker,{x:-4,z:-58,arrived:true},
  'real physical walking reaches the different public-lane destination');
 resumed.phase='decision';
 assert.equal(Story.choose(resumed,'evacuation').ok,true);
 move(resumed,Story.POINTS.exitEvac.x,Story.POINTS.exitEvac.z);
 assert.equal(Story.interact(resumed).phase,'complete');
 assert.equal(Story.debrief(resumed).civilianRerouted,true);
 assert.match(Story.closingScene(resumed).lines[1],/스스로 구조단 접근로를 선택/);
});
test('uninterrupted local residents retain the old short walking route and previous saves load',()=>{
 const s=afterUnexpectedEscalation();
 move(s,0,10);advance(s,850);
 assert.deepEqual(s.civilianWalker,{x:-2,z:-58,arrived:true});
 assert.equal(s.civilianRerouted,false);
 const legacy=JSON.parse(Story.serialize(afterUnexpectedEscalation()));
 delete legacy.civilianRerouted;
 const restored=Story.restore(JSON.stringify(legacy));
 assert.equal(restored.civilianRerouted,false);
 assert.equal(restored.civilianWalker.x,-2);
 const saved=JSON.parse(Story.serialize(restored));
 assert.equal(saved.civilianRerouted,false);
});
test('untrusted checkpoint cannot forge a resident arrival or move them anywhere',()=>{
 const start=JSON.parse(Story.serialize(afterUnexpectedEscalation()));
 for(const altered of [
   {...start,civilianRerouted:'true'},
   {...start,civilianRerouted:true,civilianWalker:{x:90,z:-50,arrived:false}},
   {...start,civilianRerouted:true,civilianWalker:{x:-4,z:-46,arrived:true}},
   {...start,civilianRerouted:false,civilianWalker:{x:-4,z:-50,arrived:false}},
   {...start,civilianRerouted:true,civilianWalker:null}
 ])assert.throws(()=>Story.restore(JSON.stringify(altered)),/Invalid story checkpoint/);
});
