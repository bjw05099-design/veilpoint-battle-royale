'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RoundPlacements}=require('../src/br96-round-placements.cjs');
test('16 six-person squads finish with unique authoritative placements',()=>{
 const p=new RoundPlacements();
 for(let s=0;s<16;s++)p.register(s,Array.from({length:6},(_,i)=>s+':'+i));
 for(let s=15;s>=1;s--){
  for(let i=0;i<5;i++)assert.equal(p.eliminateMember(s,s+':'+i),null);
  assert.equal(p.eliminateMember(s,s+':5').placement,s+1);
 }
 assert.deepEqual(p.result().placements.map(x=>x.placement),Array.from({length:15},(_,i)=>16-i));
 assert.equal(p.result().winner,0);
 assert.equal(p.eliminateMember(0,'0:0'),null);
});
test('reject duplicate or malformed squad rosters',()=>{
 const p=new RoundPlacements();
 assert.throws(()=>p.register(0,['a','a']),/invalid_squad/);
 p.register(0,['a']);
 assert.throws(()=>p.register(0,['b']),/invalid_squad/);
 assert.throws(()=>p.register(16,['b']),/invalid_squad/);
 assert.equal(p.eliminateMember(1,'a'),null);
});
