'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../scripts/validate-pc-geometry.cjs');
const sizes=[[2560,1440],[1366,768],[1280,720],[1024,600]];
const names=['BR-main','BR-more','BR-load','BR-export',
 'settings-visual','settings-controls','settings-benchmark'];
const targets={"BR-main":["play","newMatch","brViewMore","graphicsPauseOpen"],"BR-more":["brViewBack","brImport","brExport"],"BR-load":["brViewBack","brImportFile","brImportApply"],"BR-export":["brViewBack","brExportDownload"],"settings-visual":["graphicsClose","graphicsTabVisual","graphicsPreset"],"settings-controls":["graphicsClose","graphicsTabControls","desktopBindKey"],"settings-benchmark":["graphicsClose","graphicsTabBenchmark","benchmarkStart"]};
const story={"storyChecks":["CH01-route"],"storyMenuChecks":["CH01-menu-main","CH01-menu-tools","CH01-menu-settings","CH01-menu-import","CH01-menu-export","CH01-menu-about"],"storyJournalChecks":["CH01-journal-first","CH01-journal-last"]};
const target=id=>({id,visible:true,enabled:true,hit:true,focused:true,probesPassed:5});
function fixture(){
 const result={schema:'veilpoint-pc-ui-geometry-v2',transportFailure:null,failures:[],
  checks:sizes.map(([width,height])=>({width,height,errors:[],
   cases:names.map(name=>({name,issues:[],targets:targets[name].map(target)}))}))};
 for(const [key,screenNames] of Object.entries(story)){
  result[key]=sizes.map(([width,height])=>({width,height,errors:[],
   cases:screenNames.map(name=>({name,issues:[],targets:[target('test-control')]}))}));
 }
 return result;
}
test('complete CDP evidence is accepted',()=>assert.equal(validate(fixture()),true));
test('missing viewport fails closed',()=>{
 const value=fixture();value.checks.pop();
 assert.throws(()=>validate(value),/Missing viewport/);
});
test('missing screen fails closed',()=>{
 const value=fixture();value.checks[0].cases.pop();
 assert.throws(()=>validate(value),/Missing measured screen/);
});
test('transport failure cannot pass',()=>{
 const value=fixture();value.transportFailure={message:'Chrome timeout'};
 assert.throws(()=>validate(value),/transport failure/);
});
test('covered or keyboard-inaccessible control cannot pass',()=>{
 const value=fixture();value.checks[0].cases[0].targets[0].hit=false;
 assert.throws(()=>validate(value),/Occluded/);
 value.checks[0].cases[0].targets[0].hit=true;
 value.checks[0].cases[0].targets[0].focused=false;
 assert.throws(()=>validate(value),/Unfocusable/);
});
test('reported scroll or clipping cannot pass',()=>{
 const value=fixture();value.checks[0].cases[0].issues.push({id:'scrollHeight'});
 assert.throws(()=>validate(value),/Clipping or scrolling/);
});

test('missing required BR control fails closed',()=>{
 const value=fixture();value.checks[0].cases[0].targets.pop();
 assert.throws(()=>validate(value),/Missing required target/);
});
test('missing CH01 viewport fails closed',()=>{
 const value=fixture();value.storyChecks.pop();
 assert.throws(()=>validate(value),/Incomplete storyChecks viewports/);
});
test('missing CH01 menu page fails closed',()=>{
 const value=fixture();value.storyMenuChecks[0].cases.pop();
 assert.throws(()=>validate(value),/Incomplete storyMenuChecks screens/);
});
test('missing CH01 journal evidence fails closed',()=>{
 const value=fixture();delete value.storyJournalChecks;
 assert.throws(()=>validate(value),/Missing storyJournalChecks evidence/);
});

test('omitted Chromium error and clipping arrays fail closed',()=>{
 const value=fixture();
 delete value.checks[0].errors;
 assert.throws(()=>validate(value),/Missing geometry error array/);
 value.checks[0].errors=[];
 delete value.checks[0].cases[0].issues;
 assert.throws(()=>validate(value),/Missing geometry issues/);
});
test('omitted CH01 error and clipping arrays fail closed',()=>{
 const value=fixture();
 delete value.storyChecks[0].errors;
 assert.throws(()=>validate(value),/Missing CH01 error array/);
 value.storyChecks[0].errors=[];
 delete value.storyChecks[0].cases[0].issues;
 assert.throws(()=>validate(value),/Missing CH01 issues/);
});
