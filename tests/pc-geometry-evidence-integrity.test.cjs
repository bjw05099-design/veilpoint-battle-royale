'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../scripts/validate-pc-geometry.cjs');
const sizes=[[2560,1440],[1366,768],[1280,720],[1024,600]];
const targets={
 'BR-main':['play','newMatch','brViewMore','graphicsPauseOpen'],
 'BR-more':['brViewBack','brImport','brExport'],
 'BR-load':['brViewBack','brImportFile','brImportApply'],
 'BR-export':['brViewBack','brExportDownload'],
 'settings-visual':['graphicsClose','graphicsTabVisual','graphicsPreset'],
 'settings-controls':['graphicsClose','graphicsTabControls','desktopBindKey'],
 'settings-benchmark':['graphicsClose','graphicsTabBenchmark','benchmarkStart']
};
const story={
 storyChecks:['CH01-route'],
 storyMenuChecks:['CH01-menu-main','CH01-menu-tools','CH01-menu-settings','CH01-menu-import','CH01-menu-export','CH01-menu-about'],
 storyJournalChecks:['CH01-journal-first','CH01-journal-last']
};
function target(id){return {id,visible:true,enabled:true,hit:true,focused:true,probesPassed:5};}
function page(name,ids){return {name,controls:ids.length,issues:[],targets:ids.map(target)};}
function row(width,height,names){return {width,height,requested:{width,height},errors:[],cases:names.map(name=>({...page(name,['action']),controls:1}))};}
function fixture(){
 const evidence={schema:'veilpoint-pc-ui-geometry-v2',transportFailure:null,failures:[],
  checks:sizes.map(([width,height])=>({width,height,requested:{width,height},errors:[],
   cases:Object.entries(targets).map(([name,ids])=>page(name,ids)),
   benchmarkCopy:page('settings-benchmark-copy',
    ['graphicsClose','graphicsTabBenchmark','benchmarkRawJson'])})),
  keyboardChecks:sizes.map(([width,height])=>({width,height,cases:
   ['BR-more-Escape','BR-main-Tab-wrap','BR-main-ShiftTab-wrap',
    'settings-Escape','settings-select-G','settings-Tab-wrap','settings-ShiftTab-wrap']
    .map(name=>({name,passed:true,focused:true}))}))};
 for(const [key,names] of Object.entries(story))
  evidence[key]=sizes.map(([width,height])=>row(width,height,names));
 evidence.br96Checks=sizes.map(([width,height])=>({width,height,
  requested:{width,height},errors:[],
  cases:[{name:'BR96-local-squad',controls:12,issues:[],
   targets:[target('name'),target('join')]}]}));
 return evidence;
}
test('complete measured geometry fixture is accepted',()=>assert.equal(validate(fixture()),true));
test('rejects PC evidence labeled with a different requested viewport',()=>{
 const data=fixture();data.checks[0].requested.width=1280;
 assert.throws(()=>validate(data),/Requested and measured viewport mismatch/);
});
test('rejects CH01 evidence labeled with a different requested viewport',()=>{
 const data=fixture();data.storyMenuChecks[1].requested.height=600;
 assert.throws(()=>validate(data),/Requested and measured CH01 viewport mismatch/);
});
test('rejects unaccounted extra PC screens',()=>{
 const data=fixture();data.checks[0].cases.push(page('BR-unmeasured',['action']));
 assert.throws(()=>validate(data),/Unexpected or missing PC screen/);
});
test('rejects missing real hit probes even when the target is visible',()=>{
 const data=fixture();data.checks[0].cases[0].targets[0].probesPassed=4;
 assert.throws(()=>validate(data),/Partial hit coverage/);
});

test('CH01 measured control counts are required on every screen and viewport',()=>{
 const missing=fixture(); delete missing.storyJournalChecks[3].cases[1].controls;
 assert.throws(()=>validate(missing),/CH01 visible control count missing/);
 const zero=fixture(); zero.storyMenuChecks[2].cases[0].controls=0;
 assert.throws(()=>validate(zero),/CH01 visible control count missing/);
});
