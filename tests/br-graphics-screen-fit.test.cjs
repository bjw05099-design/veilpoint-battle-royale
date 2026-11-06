'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
function rule(selector){
 const at=html.indexOf(selector+'{');
 assert.ok(at>=0,'Expected CSS rule '+selector);
 return html.slice(at,html.indexOf('}',at)+1);
}
test('BR PC settings window has bounded viewport height with no inner or outer scroll',()=>{
 const settings=rule('#graphicsPanel');
 assert.match(settings,/height:min\(630px,calc\(100dvh - 20px\)\)/);
 assert.match(settings,/max-height:calc\(100dvh - 20px\)/);
 assert.match(settings,/overflow:hidden/);
 assert.match(settings,/display:flex;flex-direction:column/);
 assert.match(rule('#graphicsPanel .graphics-page'),/min-height:0/);
 assert.match(rule('#graphicsPanel .graphics-page'),/overflow:hidden/);
 assert.match(html,/@media\(max-height:480px\)/);
 assert.match(rule('#overlay'),/overflow:hidden/);
});
test('BR graphics settings are partitioned into three exclusive, accessible screens',()=>{
 const header=html.slice(html.indexOf('<section id="graphicsPanel"'),
  html.indexOf('</section>',html.indexOf('<section id="graphicsPanel"')));
 assert.match(header,/<nav class="graphics-tabs" role="tablist"/);
 for(const [name,tab,label] of [['Visual','graphicsTabVisual','graphicsVisualPage'],
  ['Controls','graphicsTabControls','graphicsControlsPage'],
  ['Benchmark','graphicsTabBenchmark','graphicsBenchmarkPage']]){
  assert.match(header,new RegExp('id="'+tab+'"[^>]*role="tab"[^>]*aria-controls="'+label+'"'));
  assert.match(header,new RegExp('id="'+label+'"[^>]*role="tabpanel"[^>]*aria-labelledby="'+tab+'"'));
 }
 assert.match(header,/id="graphicsControlsPage" class="graphics-page hidden"/);
 assert.match(header,/id="graphicsBenchmarkPage" class="graphics-page hidden"/);
 assert.match(rule('#graphicsPanel .graphics-page.hidden'),/display:none!important/);
 assert.match(rule('#graphicsPanel .graphics-tabs'),/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
test('all saved PC options and real 120-second benchmark actions remain present across tabs',()=>{
 for(const id of ['graphicsPreset','fpsLimit','renderScale','vegetation','effects','autoResolution',
  'soundEnabled','desktopSensitivity','desktopInvertY','desktopBindAction',
  'desktopBindKey','desktopReset','desktopFullscreen','desktopBindStatus',
  'perfDetails','benchmarkStart','benchmarkStop','benchmarkExport','benchmarkCopy',
  'benchmarkStatus','benchmarkExportHelp','benchmarkRawJson','qualityInfo']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing preserved configuration '+id);
 }
 assert.match(app,/function setGraphicsSettingsScreen\(screen='visual'\)/);
 assert.match(app,/setGraphicsSettingsScreen\('visual'\)/);
 assert.match(app,/const selected=name===screen/);
 assert.match(app,/desktopUi\.cancel\(\)/);
});
