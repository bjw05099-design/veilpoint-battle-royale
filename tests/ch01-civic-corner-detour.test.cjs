'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const civic=require('../src/ch01-civic-recovery.cjs');
const obstructed=(x,z)=>x>=4.6&&x<=6.4&&z>=-17.1&&z<=-14.9;

test('CH01 resident physically goes around an authored public obstruction at fixed 60Hz',()=>{
 let state=civic.step(civic.initial(),{disruption:true,assist:true,player:{x:6,z:-16}});
 assert.equal(state.assisted,true);
 let steppedAside=false;
 for(let t=0;t<1000;t++){
   const prior=state.civilian;
   state=civic.step(state,{blocked:obstructed});
   const next=state.civilian;
   assert.ok(Math.hypot(next.x-prior.x,next.z-prior.z)<=1.1/60+1e-8);
   assert.ok(!obstructed(next.x,next.z),'no pedestrian through a solid wall');
   assert.ok(next.x>=prior.x,'no backward teleport across a civilian corridor');
   if(Math.abs(next.z+16)>.1)steppedAside=true;
 }
 assert.ok(steppedAside,'the authored solid caused actual lateral foot movement');
 assert.ok(Math.hypot(state.civilian.x-10,state.civilian.z+16)<1e-6,
   'the resident reaches the original physical destination without a new objective');
 assert.deepEqual(civic.restore(JSON.parse(JSON.stringify(state))),state);
});
test('CH01 blocked pavement never moves a resident through a fully closed corridor',()=>{
 let state=civic.step(civic.initial(),{disruption:true,assist:true,player:{x:6,z:-16}});
 const blocked=(x,z)=>x>2.2;
 for(let t=0;t<600;t++){
   state=civic.step(state,{blocked});
   assert.ok(state.civilian.x<=2.2+1e-8);
 }
 assert.ok(state.civilian.x<10);
});
test('existing CH01 v2 snapshot contract accepts bounded detour but rejects unassisted lane jumps',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(source,/c\.z<init\.civilian\.z-2\.4-1e-8/);
 assert.match(source,/c\.z>init\.civilian\.z\+2\.4\+1e-8/);
 assert.match(source,/!crossing\.assisted&&\(c\.x!==init\.civilian\.x\|\|c\.z!==init\.civilian\.z\)/);
});
