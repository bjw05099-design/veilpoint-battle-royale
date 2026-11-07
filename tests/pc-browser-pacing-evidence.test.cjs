'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBenchmark}=require('../src/benchmark.js');

function observe({fpsCap,count,deltaMs}){
 const b=createBenchmark({durationMs:3000,warmupMs:0});
 b.arm({fpsCap});
 b.frame(0,1,1,{width:1280,height:720});
 for(let i=1;i<=count;i++)b.frame(i*deltaMs,1,1,{width:1280,height:720});
 return b.report();
}
test('browser benchmark cannot certify selected frame cap without enough observed callbacks',()=>{
 const small=observe({fpsCap:165,count:29,deltaMs:5});
 assert.equal(small.renderCallbackIntervalMs.count,29);
 assert.equal(small.renderCallbackP95BudgetStatus,'insufficient-evidence');
 assert.ok(Math.abs(small.renderCallbackBudgetMs-1000/165)<1e-9);
 assert.equal(small.completed,false);
});

test('P95 browser pacing reflects selected 60Hz cap, without claiming native GPU or QHD',()=>{
 const good=observe({fpsCap:60,count:30,deltaMs:10});
 assert.equal(good.renderCallbackP95BudgetStatus,'within-selected-cap');
 const slow=observe({fpsCap:60,count:30,deltaMs:20});
 assert.equal(slow.renderCallbackP95BudgetStatus,'over-selected-cap');
 assert.ok(slow.renderCallbackIntervalMs.p95>slow.renderCallbackBudgetMs);
 assert.match(slow.renderCallbackBudgetNote,/not verify QHD native output/);
 assert.equal(slow.measurementStatus,'incomplete');
});

test('benchmark does not invent frame budget for malformed performance metadata',()=>{
 const invalid=observe({fpsCap:'not-measured',count:30,deltaMs:20});
 assert.equal(invalid.renderCallbackBudgetMs,null);
 assert.equal(invalid.renderCallbackP95BudgetStatus,'insufficient-evidence');
});
