'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const begin=source.indexOf('function setBRMenuView(');
const end=source.indexOf('// Portable loading never assumes ownership',begin);
assert.ok(begin>0&&end>begin,'BR view controller must be present');

function fixture(){
 const controls={};
 let active=null;
 function element(id){
  const classes=new Set();
  return {id,classList:{
   toggle(name,on){if(on)classes.add(name);else classes.delete(name);},
   contains(name){return classes.has(name);},
   add(name){classes.add(name);}
  },focus(){active=id;}};
 }
 for(const id of ['overlay','brViewMore','brViewBack','brImportText','brExportText'])
  controls[id]=element(id);
 const context={$:id=>controls[id]};
 vm.runInNewContext(source.slice(begin,end),context,{timeout:1000});
 return {controls,context,get active(){return active;},setFocus(id){active=id;}};
}

test('BR More transfers focus from hidden More button to visible Back button',()=>{
 const f=fixture();
 f.setFocus('brViewMore');
 f.context.setBRMenuView('more',true);
 assert.equal(f.active,'brViewBack');
 assert.equal(f.controls.brViewMore.classList.contains('hidden'),true);
 assert.equal(f.controls.brViewBack.classList.contains('hidden'),false);
 assert.equal(f.controls.overlay.classList.contains('menu-view-more'),true);
});
test('BR Back returns focus to visible More and clears submenu classes',()=>{
 const f=fixture();
 f.context.setBRMenuView('load',true);
 assert.equal(f.active,'brImportText');
 f.context.setBRMenuView('more',true);
 f.context.setBRMenuView('main',true);
 assert.equal(f.active,'brViewMore');
 for(const view of ['more','load','export'])
  assert.equal(f.controls.overlay.classList.contains('menu-view-'+view),false);
});
test('screen reset or hidden overlay never steals keyboard focus from gameplay',()=>{
 const f=fixture();
 f.setFocus('gameplay');
 f.context.setBRMenuView('main');
 assert.equal(f.active,'gameplay');
 f.controls.overlay.classList.add('hidden');
 f.context.setBRMenuView('more',true);
 assert.equal(f.active,'gameplay');
});
test('real menu handlers opt in to focus restoration without altering storage',()=>{
 assert.match(source,/setBRMenuView\('more',true\);\s*\}\);\s*\$\('brViewBack'\)/);
 assert.match(source,/setBRMenuView\(wasMore\?'main':'more',true\);/);
 assert.match(source,/function resetPortableMatchExport\(\)\{\s*setBRMenuView\('main'\)/);
});
