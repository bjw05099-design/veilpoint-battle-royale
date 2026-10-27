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

test('visibility planner loads before renderer and remains render-only',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"\s*>/g)].map(m=>m[1]);
 assert.ok(scripts.includes('src/visibility.js'));
 assert.ok(scripts.indexOf('src/visibility.js')<scripts.indexOf('src/renderer.js'));
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.ok(app.includes('clock.advance(dt'));
 assert.ok(!app.includes('Visibility.planVisible'));
});
