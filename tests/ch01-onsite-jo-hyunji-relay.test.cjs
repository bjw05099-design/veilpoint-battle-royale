'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Visibility=require('../src/visibility.js');
const at=(state,x,z)=>{state.world.player.x=x;state.world.player.z=z;};
function cleared(){
 const s=Story.createState();
 at(s,Story.POINTS.terminal.x,Story.POINTS.terminal.z);
 assert.equal(Story.interact(s).phase,'engagement');
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.phase='records';s.combat.cleared=true;
 Story.step(s,1/60,{});
 return s;
}
test('Jo Hyunji exists as a collision-aware visible field character, not a world-wide HUD avatar',()=>{
 const initial=Story.createState();
 assert.equal(initial.world.liaison,null);
 const s=cleared(),point=Story.POINTS.liaisonAssist;
 assert.ok(point);
 assert.equal(s.world.liaison.role,'jo-hyunji');
 assert.equal(s.world.liaison.x,point.x);
 assert.equal(s.world.liaison.z,point.z);
 assert.equal(Sim.blocked(point.x,point.z,.85,s.world.obstacles),false,
   'on-site character must have a real walkable position');
 // Actual encounter is possible only when directly visible near public relay.
 at(s,point.x,point.z+7);s.world.player.yaw=0;
 const visible=Visibility.planVisible(s.world,16/9);
 assert.ok(visible.witnesses.some(w=>w.entity.role==='jo-hyunji'));
 assert.notEqual(Story.nearest(s)?.id,'liaisonAssist');
 const opaque={x:point.x,z:point.z+3.5,w:2,d:1,h:3,type:'test-wall'};
 s.world.obstacles.push(opaque);
 assert.equal(Visibility.planVisible(s.world,16/9).witnesses.some(w=>
   w.entity.role==='jo-hyunji'),false,'solid intervening wall conceals character');
 s.world.obstacles.pop();
 assert.equal(s.relayRestored,false);
});
test('on-foot Jo Hyunji collaboration restores one public relay, never a distant exit or original orders',()=>{
 const s=cleared(),p=Story.POINTS.liaisonAssist;
 at(s,p.x,p.z+1.8);
 assert.equal(Story.markers(s).some(m=>m.id==='liaisonAssist'),true);
 assert.equal(Story.nearest(s)?.id,'liaisonAssist');
 const response=Story.interact(s);
 assert.deepEqual(response,{ok:true,event:'onsite_liaison_relay',phase:'records'});
 assert.equal(s.relayRestored,true);
 assert.equal(s.choice,null,'field liaison does not grant checkpoint authorization');
 assert.equal(s.gateReadyAt,0);
 assert.deepEqual(s.found,[],'mission never adds a remote document fetch');
 assert.match(s.subtitle,/조현지/);
 assert.match(s.subtitle,/출국 전에/);
 assert.match(s.subtitle,/유수프/);
 assert.equal(Story.markers(s).some(m=>m.id==='liaisonAssist'),false);
 assert.equal(Story.interact(s).event,'not_a_repeat','no repeatable reward');
 const before=Story.serialize(s),restored=Story.restore(before);
 assert.equal(Story.serialize(restored),before);
 assert.equal(restored.relayRestored,true);
 assert.equal(restored.world.liaison.role,'jo-hyunji');
 at(restored,Story.POINTS.decision.x,Story.POINTS.decision.z);
 assert.equal(Story.interact(restored).phase,'decision');
 assert.equal(Story.choose(restored,'verification').ok,true);
 assert.equal(restored.gateClearanceDuration,4,
   'only subsequent physical gate request gets standard powered-relay duration');
});
test('story actor rendering and old checkpoint serialization remain compatible',()=>{
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/w\.role==='jo-hyunji'\?'liaison':'witness'/);
 assert.match(render,/liaison\?\[\.34,\.42,\.51\]/);
 const original=Story.serialize(Story.createState());
 assert.equal(Story.serialize(Story.restore(original)),original);
 const historic=Story.restore(JSON.stringify({
  version:1,phase:'records',found:[],choice:null,
  player:{x:0,z:-41,yaw:0,pitch:0,stamina:100},elapsed:12
 }));
 assert.equal(historic.relayRestored,false);
 assert.deepEqual(historic.found,[]);
 assert.equal(Story.serialize(Story.restore(Story.serialize(historic))),Story.serialize(historic));
});
