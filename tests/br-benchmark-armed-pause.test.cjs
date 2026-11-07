'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createBenchmark}=require('../src/benchmark.js');

test('BR PC background hides and cancels an armed benchmark before its first rendered frame',()=>{
 const b=createBenchmark({durationMs:1000,warmupMs:0});
 b.arm({fpsCap:165});
 assert.equal(b.getStatus().state,'armed');
 b.finish('paused-or-hidden');
 b.frame(100,2,1,{width:2560,height:1440});
 const report=b.report();
 assert.equal(report.state,'finished');
 assert.equal(report.reason,'paused-or-hidden');
 assert.equal(report.measurementStatus,'partial');
 assert.equal(report.completed,false);
 assert.equal(report.renderedFrameCount,0);
 assert.equal(report.observedFps,null);
 b.arm({fpsCap:60});
 assert.equal(b.getStatus().state,'armed','explicit restart starts independent measurement');
});

test('BR background adapter cancels both armed and running measurements',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const start=source.indexOf('function suspendMatch(');
 assert.ok(start>=0,'the real browser pause handler must exist');
 const end=source.indexOf('\n}',start);
 const handler=source.slice(start,end+2);
 assert.match(handler,/\['armed','running'\]\.includes\(benchmark\.getStatus\(\)\.state\)/,
  'a queued performance run cannot silently survive a background pause');
 assert.match(handler,/benchmark\.finish\(reason==='background'\?'paused-or-hidden':reason\)/);
});
