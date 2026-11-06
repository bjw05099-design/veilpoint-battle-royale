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
test('BR primary menu fits its display without a scrollable overlay',()=>{
 const overlay=rule('.overlay'),landing=rule('.landing');
 assert.match(overlay,/position:absolute;[^}]*inset:0/);
 assert.match(overlay,/overflow:hidden/);
 assert.match(overlay,/align-items:center/);
 assert.doesNotMatch(overlay,/overflow-y:auto|scrollbar-gutter|overscroll-behavior/);
 assert.match(landing,/max-height:100%/);
 assert.match(html,/#overlay>\.landing\{[^}]*height:100%[^}]*overflow:hidden/);
 assert.match(html,/#overlay \.landing \.cta\{[^}]*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-height:620px\)/);
});
test('BR main/advanced/import/export pages are mutually exclusive and all fit within a viewport',()=>{
 assert.match(html,/#overlay\.menu-view-more \.cta>:not\(#brViewBack\)/);
 assert.match(html,/#overlay\.menu-view-load \.cta>:not\(#brImportPanel\):not\(#brViewBack\)/);
 assert.match(html,/#overlay\.menu-view-export \.cta>:not\(#brExportPanel\):not\(#brViewBack\)/);
 assert.match(html,/#overlay:is\(\.menu-view-load,\.menu-view-export\) \.landing \.cta\{[^}]*height:100%;min-height:0;max-height:min\(100%,670px\)/);
 assert.match(html,/#overlay:is\(\.menu-view-load,\.menu-view-export\) \.landing \.cta>#brViewBack\{[^}]*grid-row:2/);
 assert.match(html,/#overlay:is\(\.menu-view-load,\.menu-view-export\) \.landing \.cta>:is\(#brImportPanel,#brExportPanel\)\{[^}]*grid-row:1/);
 assert.match(html,/#overlay :is\(#brImportText,#brExportText\)\{[^}]*flex:1 1 120px;max-height:38dvh/);
});
test('BR accessible controls and menu navigation are preserved without scrolling',()=>{
 for(const id of ['play','newMatch','graphicsPauseOpen','brViewMore','brViewBack',
   'brExport','brImport','brImportText','brImportFile','brImportApply',
   'brImportStatus','brExportPanel','brExportDownload','saveExit']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing accessible control '+id);
 }
 assert.match(html,/id="brViewBack"[^>]*aria-label="이전 BR 메뉴 화면"/);
 assert.match(html,/id="brImport"[^>]*aria-controls="brImportPanel"/);
 assert.match(html,/id="brExport"[^>]*aria-controls="brExportPanel"/);
 assert.match(html,/id="brImportStatus"[^>]*aria-live="polite"/);
 assert.match(html,/id="brExportStatus"[^>]*aria-live="polite"/);
 const code=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(code,/function setBRMenuView\(view='main'\)/);
 assert.match(code,/setBRMenuView\('load'\)/);
 assert.match(code,/setBRMenuView\('export'\)/);
 assert.match(code,/\$\('brViewBack'\)\.click\(\)/);
});
test('BR FPS canvas stays independent of the non-scrolling menu',()=>{
 assert.match(rule('#app'),/overflow:hidden/);
 assert.match(rule('#scene'),/touch-action:none/);
 assert.match(rule('.overlay'),/overflow:hidden/);
 assert.match(rule('.hud-bottom'),/pointer-events:none/);
});
