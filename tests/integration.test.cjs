'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('all local browser scripts exist and performance instrumentation loads before app',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"\s*>/g)].map(m=>m[1]);
 assert.ok(scripts.length>=6);
 for(const src of scripts){assert.ok(!src.startsWith('http'));assert.ok(fs.existsSync(path.join(__dirname,'..',src)),src);}
 assert.ok(scripts.indexOf('src/performance.js')>=0);
 assert.ok(scripts.indexOf('src/performance.js')<scripts.indexOf('src/app.js'));
});
test('graphics UI exposes the adaptive opt-in control and frame telemetry',()=>{
 for(const id of ['graphicsPanel','autoResolution','perfDetails','graphicsPreset','renderScale','fpsLimit']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/type="checkbox"/);
});
