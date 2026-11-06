'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {generate,runRoute}=require('../scripts/verify-ch01-routes.cjs');

test('CH01 both authored route endings are independently reproducible through real game interactions',()=>{
  const a=generate(),b=generate();
  assert.deepEqual(a,b,'replayed fixed-seed mission must have stable SHA-256 snapshots');
  assert.equal(a.schema,'veilpoint-ch01-route-check-v2');
  assert.equal(a.simulationHz,60);
  assert.equal(a.travelMode,'physical-central-corridors-plus-optional-marker-fast-forward');
  assert.deepEqual(a.routes.map(x=>x.route),['evacuation','verification']);
  assert.ok(a.routes.every(x=>x.completed&&x.previewOnly));
  assert.ok(a.routes.every(x=>x.checkpointCount>=10));
  assert.ok(a.routes.every(x=>x.checkpoints.every(entry=>
    /^[a-f0-9]{64}$/.test(entry.sha256)&&Number.isFinite(entry.elapsed))));
  assert.notEqual(a.routes[0].finalCheckpointSha256,a.routes[1].finalCheckpointSha256);
});

test('CH01 southern route requires physical aid transfer and escort accounting at final result',()=>{
  const south=runRoute('evacuation');
  const steps=south.checkpoints.map(x=>x.label);
  assert.ok(steps.indexOf('cargo-exit-blocked')<steps.indexOf('aidStage'));
  assert.ok(steps.indexOf('aidStage')<steps.indexOf('aidResume'));
  assert.ok(steps.indexOf('aidResume')<steps.indexOf('aidDrop'));
  assert.ok(steps.indexOf('muster')<steps.indexOf('guide'));
  assert.ok(steps.indexOf('guide')<steps.indexOf('guideRelease'));
  assert.ok(south.checkpoints.find(x=>x.label==='cargo-exit-blocked')
    .taskStatus.includes('exit:blocked'));
  assert.ok(south.checkpoints.at(-1).taskStatus.includes('exit:done'));
  assert.equal(south.report.guideReleased,true);
  assert.equal(south.report.aidDelivered,true);
  assert.equal(south.report.civilianOutcome,'south-headcount-verified');
});

test('CH01 eastern route checkpoints locked and cleared 60Hz gate plus recorded handoff',()=>{
 const east=runRoute('verification');
 const stages=east.checkpoints.map(x=>x.label);
 assert.ok(stages.indexOf('gate-halfway')<stages.indexOf('gate-cleared'));
 assert.ok(stages.indexOf('gate-cleared')<stages.indexOf('gateLog'));
 assert.ok(stages.indexOf('gateLog')<stages.indexOf('reportDesk'));
 assert.ok(east.checkpoints.find(x=>x.label==='gate-halfway')
   .taskStatus.includes('exit:blocked'));
 assert.ok(east.checkpoints.find(x=>x.label==='gate-cleared')
   .taskStatus.includes('exit:available'));
 assert.equal(east.report.logHandedOff,true);
 assert.equal(east.report.clockDiscrepancy,'retransmission-confirmed');
});

test('CH01 central corridors and both exits are reached by real fixed-step walking, not direct marker placement',()=>{
 const routes=generate().routes;
 const south=routes.find(r=>r.route==='evacuation');
 const east=routes.find(r=>r.route==='verification');
 assert.deepEqual(south.walkSegments.map(x=>x.label),
  ['opening-to-terminal','terminal-to-decision','decision-to-south-exit']);
 assert.deepEqual(east.walkSegments.map(x=>x.label),
  ['opening-to-terminal','terminal-to-decision','decision-to-east-approach','east-approach-to-exit']);
 for(const route of routes){
  for(const segment of route.walkSegments){
   assert.ok(segment.ticks>=10&&segment.ticks<=1000);
   assert.ok(segment.distance>=10,'segment needs substantial actual 60Hz travel');
   assert.ok(segment.remaining<=2.2,'segment must reach interaction distance without teleportation');
   assert.ok(route.checkpoints.some(x=>x.label==='walk-'+segment.label),
    'physical segment must be immediately checkpointed for deterministic replay');
  }
 }
 assert.ok(south.walkSegments.at(-1).to[1]<-58,
  'south arrival is inside the actual courtyard');
 assert.ok(east.walkSegments.at(-1).to[0]>24,
  'east arrival is near the verified physical exit');
});

test('CH01 published QA evidence is produced by the same script wired into CI',()=>{
 const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/ci.yml'),'utf8');
 const packageFile=fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8');
 assert.match(workflow,/node scripts\/verify-ch01-routes\.cjs --output dist\/ch01-route-evidence\.json/);
 assert.match(workflow,/dist\/ch01-route-evidence\.json/);
 assert.match(packageFile,/node --check scripts\/verify-ch01-routes\.cjs/);
});
