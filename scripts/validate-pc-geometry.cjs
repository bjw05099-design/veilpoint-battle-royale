'use strict';
// Independent evidence validator; never substitutes for running Chromium CDP.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const REQUIRED=['BR-main','BR-more','BR-load','BR-export',
 'settings-visual','settings-controls','settings-benchmark'];
const SIZES=['2560x1440','1366x768','1280x720','1024x600'];
const TARGETS={"BR-main":["play","newMatch","brViewMore","graphicsPauseOpen"],"BR-more":["brViewBack","brImport","brExport"],"BR-load":["brViewBack","brImportFile","brImportApply"],"BR-export":["brViewBack","brExportDownload"],"settings-visual":["graphicsClose","graphicsTabVisual","graphicsPreset"],"settings-controls":["graphicsClose","graphicsTabControls","desktopBindKey"],"settings-benchmark":["graphicsClose","graphicsTabBenchmark","benchmarkStart"]};
const STORY={"storyChecks":["CH01-route"],"storyMenuChecks":["CH01-menu-main","CH01-menu-tools","CH01-menu-settings","CH01-menu-import","CH01-menu-export","CH01-menu-about"],"storyJournalChecks":["CH01-journal-first","CH01-journal-last"]};
function validate(evidence){
 assert.ok(evidence&&typeof evidence==='object','Geometry evidence missing');
 // Accept the verifier's top-level layout while rejecting incomplete reports.
 assert.equal(evidence.schema,'veilpoint-pc-ui-geometry-v2','Unexpected evidence schema');
 assert.equal(evidence.transportFailure,null,'Chromium transport failure');
 assert.deepEqual(evidence.failures,[],'Chromium geometry gate reported failures');
 const records=evidence.checks;
 assert.ok(Array.isArray(records),'Viewport measurements missing');
 const seen=new Set();
 for(const record of records){
  const size=record.width+'x'+record.height;
  assert.ok(SIZES.includes(size),'Unexpected viewport '+size);
  assert.ok(!seen.has(size),'Duplicate viewport '+size);
  seen.add(size);
  assert.ok(Array.isArray(record.errors),'Missing geometry error array at '+size);
  assert.deepEqual(record.errors,[],'Geometry errors at '+size);
  assert.ok(Array.isArray(record.cases),'Missing cases at '+size);
  const cases=new Map();
  for(const entry of record.cases){
   assert.ok(!cases.has(entry.name),'Duplicate case '+entry.name);
   cases.set(entry.name,entry);
  }
  for(const name of REQUIRED){
   const page=cases.get(name);
   assert.ok(page,'Missing measured screen '+name+' at '+size);
   assert.ok(Array.isArray(page.issues),'Missing geometry issues at '+size+' '+name);
   assert.deepEqual(page.issues,[],'Clipping or scrolling at '+size+' '+name);
   assert.ok(Array.isArray(page.targets)&&page.targets.length>0,
    'No measured actionable targets at '+size+' '+name);
   const ids=new Set(page.targets.map(target=>target.id));
   for(const id of TARGETS[name])assert.ok(ids.has(id),'Missing required target '+id+' at '+size+' '+name);
   assert.equal(ids.size,page.targets.length,'Duplicate target at '+size+' '+name);
   for(const target of page.targets){
    assert.equal(target.visible,true,'Hidden '+name+'/'+target.id);
    assert.equal(target.enabled,true,'Disabled '+name+'/'+target.id);
    assert.equal(target.hit,true,'Occluded '+name+'/'+target.id);
    assert.equal(target.focused,true,'Unfocusable '+name+'/'+target.id);
    assert.equal(target.probesPassed,5,'Partial hit coverage '+name+'/'+target.id);
   }
  }
 }
 assert.deepEqual([...seen].sort(),[...SIZES].sort(),'Missing viewport evidence');
 for(const [key,names] of Object.entries(STORY)){
  const rows=evidence[key];
  assert.ok(Array.isArray(rows),'Missing '+key+' evidence');
  assert.equal(rows.length,SIZES.length,'Incomplete '+key+' viewports');
  const sizes=new Set();
  for(const row of rows){
   const size=row.width+'x'+row.height;
   assert.ok(SIZES.includes(size)&&!sizes.has(size),'Invalid '+key+' viewport '+size);
   sizes.add(size);
   assert.ok(Array.isArray(row.errors),'Missing CH01 error array at '+size);
   assert.deepEqual(row.errors,[],'CH01 errors at '+size);
   assert.ok(Array.isArray(row.cases),'Missing '+key+' cases');
   assert.deepEqual(row.cases.map(c=>c.name).sort(),[...names].sort(),'Incomplete '+key+' screens');
   for(const page of row.cases){
    assert.ok(Array.isArray(page.issues),'Missing CH01 issues at '+size+' '+page.name);
    assert.deepEqual(page.issues,[],'CH01 clipping at '+size+' '+page.name);
    assert.ok(Array.isArray(page.targets)&&page.targets.length>0,'CH01 targets missing');
    for(const target of page.targets){
     assert.equal(target.visible,true,'CH01 hidden '+target.id);
     assert.equal(target.enabled,true,'CH01 disabled '+target.id);
     assert.equal(target.hit,true,'CH01 occluded '+target.id);
     assert.equal(target.focused,true,'CH01 unfocusable '+target.id);
     assert.equal(target.probesPassed,5,'CH01 partial hit '+target.id);
    }
   }
  }
 }


 const keyboard=evidence.keyboardChecks;
 assert.ok(Array.isArray(keyboard),'Real CDP Escape evidence missing');
 assert.equal(keyboard.length,SIZES.length,'Incomplete CDP Escape viewports');
 const observed=new Set();
 const requiredKeys=['BR-more-Escape','settings-Escape'];
 for(const row of keyboard){
  const size=row.width+'x'+row.height;
  assert.ok(SIZES.includes(size)&&!observed.has(size),
   'Invalid or duplicate CDP Escape viewport '+size);
  observed.add(size);
  assert.ok(Array.isArray(row.cases),'Missing CDP Escape cases at '+size);
  assert.deepEqual(row.cases.map(c=>c.name).sort(),requiredKeys,
   'Missing real CDP Escape route at '+size);
  for(const item of row.cases){
   assert.equal(item.passed,true,'Escape route failed: '+size+' '+item.name);
   assert.equal(item.focused,true,'Escape keyboard focus lost: '+size+' '+item.name);
  }
 }

 return true;
}
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw new Error('Usage: node scripts/validate-pc-geometry.cjs dist/pc-ui-geometry.json');
 validate(JSON.parse(fs.readFileSync(file,'utf8')));
 console.log('All seven PC pages have complete actionable Chromium geometry evidence at four viewport sizes');
}
module.exports={validate};
