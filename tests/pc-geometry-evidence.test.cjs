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
  checks:sizes.map(([width,height])=>({width,height,requested:{width,height},errors:[],
   cases:names.map(name=>({name,issues:[],targets:targets[name].map(target)})),
   benchmarkCopy:{name:'settings-benchmark-copy',issues:[],targets:[
    target('graphicsClose'),target('graphicsTabBenchmark'),target('benchmarkRawJson')
   ]}}))};
 for(const [key,screenNames] of Object.entries(story)){
  result[key]=sizes.map(([width,height])=>({width,height,requested:{width,height},errors:[],
   cases:screenNames.map(name=>({name,issues:[],targets:[target('test-control')]}))}));
 }
 result.keyboardChecks=sizes.map(([width,height])=>({width,height,cases:[
  {name:'BR-more-Escape',passed:true,focused:true},
  {name:'BR-main-Tab-wrap',passed:true,focused:true},
  {name:'BR-main-ShiftTab-wrap',passed:true,focused:true},
  {name:'settings-Tab-wrap',passed:true,focused:true},
  {name:'settings-ShiftTab-wrap',passed:true,focused:true},
  {name:'settings-Escape',passed:true,focused:true},
  {name:'settings-select-G',passed:true,focused:true}
 ]}));
 return result;
}
test('complete CDP evidence is accepted',()=>assert.equal(validate(fixture()),true));
test('missing viewport fails closed',()=>{
 const value=fixture();value.checks.pop();
 assert.throws(()=>validate(value),/Missing viewport/);
});
test('missing screen fails closed',()=>{
 const value=fixture();value.checks[0].cases.pop();
 assert.throws(()=>validate(value),/Unexpected or missing PC screen/);
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

test('missing CDP Escape viewport or transition fails the release gate',()=>{
 const value=fixture();
 value.keyboardChecks.pop();
 assert.throws(()=>validate(value),/Incomplete CDP keyboard viewports/);
 value.keyboardChecks=fixture().keyboardChecks;
 value.keyboardChecks[0].cases.pop();
 assert.throws(()=>validate(value),/Missing real CDP keyboard route/);
});
test('failed Escape transition or lost keyboard focus fails the release gate',()=>{
 const value=fixture();
 value.keyboardChecks[0].cases[0].passed=false;
 assert.throws(()=>validate(value),/CDP keyboard route failed/);
 value.keyboardChecks[0].cases[0].passed=true;
 value.keyboardChecks[0].cases[0].focused=false;
 assert.throws(()=>validate(value),/CDP keyboard focus lost/);
});

test('missing real Tab wrap evidence or duplicate keyboard routes fail closed',()=>{
 const record=fixture();
 record.keyboardChecks[0].cases=record.keyboardChecks[0].cases.filter(
  entry=>entry.name!=='settings-ShiftTab-wrap');
 assert.throws(()=>validate(record),/Missing real CDP keyboard route/);
 const duplicate=fixture();
 duplicate.keyboardChecks[0].cases.push({...duplicate.keyboardChecks[0].cases[0]});
 assert.throws(()=>validate(duplicate),/Missing real CDP keyboard route/);
});
test('real Tab and ShiftTab focus-loss evidence is never accepted',()=>{
 const record=fixture();
 const entry=record.keyboardChecks[1].cases.find(x=>x.name==='BR-main-ShiftTab-wrap');
 entry.focused=false;
 assert.throws(()=>validate(record),/CDP keyboard focus lost/);
 entry.focused=true;entry.passed=false;
 assert.throws(()=>validate(record),/CDP keyboard route failed/);
});

test('benchmark JSON copy evidence is required on all real Chromium viewports',()=>{
 const missing=fixture();
 delete missing.checks[0].benchmarkCopy;
 assert.throws(()=>validate(missing),/Missing Chromium benchmark JSON copy evidence/);
 const hidden=fixture();
 hidden.checks[1].benchmarkCopy.targets[2].visible=false;
 assert.throws(()=>validate(hidden),/Hidden benchmark JSON target/);
 const covered=fixture();
 covered.checks[2].benchmarkCopy.targets[2].hit=false;
 assert.throws(()=>validate(covered),/Occluded benchmark JSON target/);
 const clipped=fixture();
 clipped.checks[3].benchmarkCopy.issues.push({id:'benchmarkRawJson',reason:'clipped'});
 assert.throws(()=>validate(clipped),/Benchmark JSON clipped or scrolling/);
});
