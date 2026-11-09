'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const civic=require('../src/ch01-civic-recovery.cjs');
test('unwitnessed event cannot remotely move or assist civilian',()=>{
 let s=civic.step(civic.initial(),{disruption:true,assist:true,player:{x:100,z:100}});
 assert.equal(s.disrupted,true);assert.equal(s.assisted,false);
 for(let i=0;i<60;i++)s=civic.step(s);
 assert.equal(s.civilian.x,2);
});
test('nearby physical assistance initiates 60Hz movement and persists',()=>{
 let s=civic.step(civic.initial(),{disruption:true});
 s=civic.step(s,{assist:true,player:{x:6,z:-16}});
 assert.equal(s.assisted,true);
 for(let i=0;i<60;i++)s=civic.step(s);
 assert.ok(s.civilian.x>3&&s.civilian.x<4);
 assert.deepEqual(civic.restore(JSON.parse(JSON.stringify(s))),s);
 for(let i=0;i<500;i++)s=civic.step(s);
 assert.equal(s.civilian.x,10);
});
test('legacy state cannot be silently confused with new checkpoint',()=>{
 assert.throws(()=>civic.restore({version:2}),/invalid_civic_save/);
 assert.throws(()=>civic.restore({...civic.initial(),assisted:true}),/invalid_civic_save/);
});
