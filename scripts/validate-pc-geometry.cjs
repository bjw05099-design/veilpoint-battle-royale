'use strict';
// Independent evidence validator; never substitutes for running Chromium CDP.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const REQUIRED=['BR-main','BR-more','BR-load','BR-export',
 'settings-visual','settings-controls','settings-benchmark'];
const SIZES=['2560x1440','1366x768','1280x720','1024x600'];
function validate(evidence){
 assert.ok(evidence&&typeof evidence==='object','Geometry evidence missing');
 // Accept the verifier's top-level layout while rejecting incomplete reports.
 const records=Array.isArray(evidence)?evidence:
  (evidence.records||evidence.viewports);
 assert.ok(Array.isArray(records),'Viewport measurements missing');
 const seen=new Set();
 for(const record of records){
  const size=record.width+'x'+record.height;
  assert.ok(SIZES.includes(size),'Unexpected viewport '+size);
  assert.ok(!seen.has(size),'Duplicate viewport '+size);
  seen.add(size);
  assert.deepEqual(record.errors||[],[],'Geometry errors at '+size);
  assert.ok(Array.isArray(record.cases),'Missing cases at '+size);
  const cases=new Map();
  for(const entry of record.cases){
   assert.ok(!cases.has(entry.name),'Duplicate case '+entry.name);
   cases.set(entry.name,entry);
  }
  for(const name of REQUIRED){
   const page=cases.get(name);
   assert.ok(page,'Missing measured screen '+name+' at '+size);
   assert.deepEqual(page.issues||[],[],'Clipping or scrolling at '+size+' '+name);
   assert.ok(Array.isArray(page.targets)&&page.targets.length>0,
    'No measured actionable targets at '+size+' '+name);
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
 return true;
}
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw new Error('Usage: node scripts/validate-pc-geometry.cjs dist/pc-ui-geometry.json');
 validate(JSON.parse(fs.readFileSync(file,'utf8')));
 console.log('All seven PC pages have complete actionable Chromium geometry evidence at four viewport sizes');
}
module.exports={validate};
