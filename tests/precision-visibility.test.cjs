'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const V=require('../src/visibility.js');

function corridor(weaponId='precision') {
 const state=Sim.newMatch(20261031,1,weaponId);
 state.status='playing';state.obstacles=[];state.loot=[];state.effects=[];
 Object.assign(state.player,{x:-105,z:-20,yaw:Math.PI/2,pitch:0});
 Object.assign(state.bots[0],{x:105,z:-20,alive:true,health:100});
 return state;
}

test('precision low-LOD actor and finite hit cue stay visible through the full 210m corridor',()=>{
 const state=corridor();
 const before=JSON.stringify(state);
 const plan=V.planVisible(state);
 assert.equal(plan.bots.length,1);
 assert.equal(plan.bots[0].lod,'low');
 assert.equal(JSON.stringify(state),before,'render planning must never change simulation');
 const ammo=state.player.charges;
 assert.equal(Sim.tag(state).hit,true);
 assert.equal(state.player.charges,ammo-1);
 const after=V.planVisible(state);
 assert.equal(after.bots.length,1);
 assert.equal(after.effects.length,1,'a finite, non-magical impact cue uses the same horizon');
});

test('long-range culling still respects cover, camera direction and maximum distance',()=>{
 const state=corridor();
 state.obstacles=[{x:0,z:-20,w:3,d:3,h:4}];
 assert.equal(V.planVisible(state).bots.length,0,'cover must hide a far actor');
 assert.equal(Sim.tag(state).hit,false,'the same cover must block the shot');
 state.obstacles=[];state.player.yaw=-Math.PI/2;
 assert.equal(V.planVisible(state).bots.length,0,'no rear-view enemy reveal');
 state.player.yaw=Math.PI/2;state.bots[0].x=170;
 assert.equal(V.planVisible(state).bots.length,0,'275m actor is beyond the 270m render budget');
 const ordinary=corridor('carbine');
 assert.equal(V.planVisible(ordinary).bots.length,0,'normal classes retain the existing 155m cull');
});

test('Canvas2D fallback draws the far precision actor without extending all scene objects',()=>{
 const fills=[];
 const ctx={
  fillStyle:'',
  createLinearGradient(){return {addColorStop(){}};},
  fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
  fill(){fills.push(this.fillStyle);},stroke(){}
 };
 const context=vm.createContext({VeilpointSim:Sim,VeilpointVisibility:V,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 const canvas={clientWidth:800,clientHeight:600,width:800,height:600,
  getContext(type){return type==='2d'?ctx:null;}};
 const renderer=new context.VeilpointRenderer(canvas);
 const state=corridor();
 renderer.draw(state);
 assert.ok(fills.includes('#24352e'),'far actor must be painted in the fallback renderer');
 fills.length=0;state.player.weaponId='carbine';
 renderer.draw(state);
 assert.ok(!fills.includes('#24352e'),'ordinary draw distance must remain bounded');
});
