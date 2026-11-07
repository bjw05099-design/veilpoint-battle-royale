'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const graphics=require('../src/graphics.js');
const source=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('function saveGraphics(){');
const end=source.indexOf('function applyGraphicsSettings(){',start);
assert.ok(start>=0&&end>start,'test must execute the production graphics save boundary');
const runSave=new Function('global','graphics','graphicsSettings',source.slice(start,end)+'\nreturn saveGraphics();');
const settings=graphics.customize(graphics.fromPreset('balanced'),'fpsCap',165);
const expected=graphics.serialize(settings);

test('BR visual settings require exact durable localStorage readback',()=>{
 const values=new Map();
 const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)||null};
 assert.equal(runSave({localStorage:storage},graphics,settings),true);
 assert.equal(values.get('veilpoint.graphics'),expected);
 assert.deepEqual(graphics.deserialize(values.get('veilpoint.graphics')),settings);
 const ignore={setItem(){},getItem:storage.getItem};
 assert.equal(runSave({localStorage:ignore},graphics,
   graphics.customize(settings,'resolutionScale',.8)),false);
 assert.equal(values.get('veilpoint.graphics'),expected,'existing generation must be retained');
 assert.equal(runSave({localStorage:ignore},graphics,settings),true,
  'a previously saved identical generation is a real persisted result');
 const overwrite={setItem:key=>values.set(key,'{"corrupt":true}'),getItem:storage.getItem};
 assert.equal(runSave({localStorage:overwrite},graphics,settings),false);
 assert.equal(runSave({localStorage:{setItem(){},getItem(){throw Error('blocked');}}},graphics,settings),false);
 assert.equal(runSave({localStorage:{setItem(){throw Error('quota');}}},graphics,settings),false);
});

test('PC quality HUD reports only-in-tab settings when durable save cannot be verified',()=>{
 assert.match(source,/if\(!saveGraphics\(\)\)\$\('qualityInfo'\)\.textContent='화질 적용됨/);
 assert.match(source,/현재 탭 전용/);
});
