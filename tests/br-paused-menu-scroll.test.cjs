'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
function rule(selector){
  const at=html.indexOf(selector+'{');
  assert.ok(at>=0,'CSS rule '+selector);
  return html.slice(at,html.indexOf('}',at)+1);
}
test('BR overlay scrolls rather than clipping checkpoint controls on a short PC viewport',()=>{
 const overlay=rule('.overlay');
 const landing=rule('.landing');
 assert.match(overlay,/position:absolute;[^}]*inset:0/);
 assert.match(overlay,/overflow-y:auto/);
 assert.match(overlay,/overscroll-behavior:contain/);
 assert.match(overlay,/align-items:flex-start/);
 assert.match(landing,/margin-block:auto/);
 assert.match(landing,/flex-shrink:0/);
 // A tall flex child must not vertically shrink or be centered above the
 // scroll origin. The default short-menu presentation remains centered by
 // the auto block margins when there is available height.
 assert.doesNotMatch(overlay,/align-items:center/);
});
test('BR graphics, keyboard and both portable-checkpoint flows remain reachable in the menu',()=>{
 for(const id of ['play','newMatch','graphicsPauseOpen','brExport','brImport','brImportText',
   'brImportFile','brImportApply','brImportStatus','brExportPanel','brExportDownload']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing keyboard-reachable control '+id);
 }
 assert.match(html,/id="brImport"[^>]*aria-controls="brImportPanel"/);
 assert.match(html,/id="brExport"[^>]*aria-controls="brExportPanel"/);
 assert.match(html,/id="brImportStatus"[^>]*aria-live="polite"/);
 assert.match(html,/id="brExportStatus"[^>]*aria-live="polite"/);
});
test('BR in-world FPS canvas remains separately clipped and unaffected by menu scrolling',()=>{
 assert.match(rule('#app'),/overflow:hidden/);
 assert.match(rule('#scene'),/touch-action:none/);
 assert.match(rule('.overlay'),/overflow-y:auto/);
 assert.match(rule('.hud-bottom'),/pointer-events:none/);
});
