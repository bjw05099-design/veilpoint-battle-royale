'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const handler=source.indexOf("  global.addEventListener('keydown',e=>{");
const start=source.indexOf("    if(!choices.classList.contains('hidden')){",handler);
const end=source.indexOf('    // ESC returns from CH01',start);
assert.ok(handler>=0&&start>handler&&end>start,
 'the actual CH01 keydown handler must contain the route-choice branch');
const branch=source.slice(start,end);

function fixture(hidden=false){
 const selected=[],back={clicks:0,click(){this.clicks++;}};
 let prevented=0;
 const context={
  choices:{classList:{contains:name=>name==='hidden'&&hidden}},
  decide:value=>selected.push(value),
  $:id=>{assert.equal(id,'choiceBack');return back;}
 };
 const dispatch=vm.runInNewContext('(function(e){'+branch+'})',context,{timeout:1000});
 return {selected,back,send(code,repeat=false){
  dispatch({code,repeat,preventDefault(){prevented++;}});
 },get prevented(){return prevented;}};
}

test('CH01 number row and numpad choose the same existing validated routes',()=>{
 const f=fixture();
 for(const code of ['Digit1','Numpad1','Digit2','Numpad2'])f.send(code);
 assert.deepEqual(f.selected,['evacuation','evacuation','verification','verification']);
 assert.equal(f.prevented,4);
 assert.equal(f.back.clicks,0);
});

test('holding the route shortcut never dispatches a second mission decision',()=>{
 const f=fixture();
 f.send('Numpad1');
 f.send('Numpad1',true);
 f.send('Numpad2',true);
 assert.deepEqual(f.selected,['evacuation']);
 assert.equal(f.prevented,1);
});

test('numpad route shortcuts cannot run behind a hidden CH01 decision dialog',()=>{
 const f=fixture(true);
 for(const code of ['Numpad1','Numpad2','Escape'])f.send(code);
 assert.deepEqual(f.selected,[]);
 assert.equal(f.back.clicks,0);
 assert.equal(f.prevented,0);
 const active=fixture();
 active.send('Escape');
 assert.equal(active.back.clicks,1,'Escape still routes to the existing cancel action');
 assert.equal(active.selected.length,0);
});
