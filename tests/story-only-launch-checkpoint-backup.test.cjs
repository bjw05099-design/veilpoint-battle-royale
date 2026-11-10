'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm');
const Story=require('../scripts/package-story-preview.cjs');
const {buildZip}=require('../scripts/package-offline-demo.cjs');
const {inspectZip}=require('../scripts/verify-offline-demo.cjs');

function launchHarness(records,denyReads=false){
 const elements=Object.fromEntries(['backupPrimary','backupPrevious','backupStatus'].map(id=>
  [id,{disabled:false,textContent:'',addEventListener(type,fn){if(type==='click')this.activate=fn;}}]));
 const downloads=[],revoked=[],reads=[];
 const browser={
  document:{getElementById(id){return elements[id];},body:{appendChild(){}},
   createElement(tag){assert.equal(tag,'a');return {click(){downloads.push({name:this.download,body:browser.blob.data});},remove(){}};}},
  localStorage:{getItem(key){reads.push(key);if(denyReads)throw Error('blocked');return records[key]??null;},
   setItem(){throw Error('launcher must not alter CH01 checkpoint');},
   removeItem(){throw Error('launcher must not delete CH01 checkpoint');}},
  URL:{createObjectURL(blob){browser.blob=blob;return 'blob:offline';},
   revokeObjectURL(url){revoked.push(url);}},
  Blob:class{constructor(parts,options){this.data=parts.join('');this.type=options.type;}},
  setTimeout(fn){fn();}
 };
 const inline=Story.INDEX.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(inline,'the story-only launcher has a self-contained offline controller');
 vm.runInNewContext(inline[1],browser,{timeout:1000});
 return {elements,downloads,revoked,reads};
}

test('story-only launcher protects both primary and previous generations without touching saves',()=>{
 const primary='{"version":2,"scene":"live"}',previous='{"version":2,"scene":"previous"}';
 const h=launchHarness({'veilpoint.story.ch01':primary,'veilpoint.story.ch01.previous':previous});
 assert.equal(h.elements.backupPrimary.disabled,false);
 assert.equal(h.elements.backupPrevious.disabled,false);
 h.elements.backupPrimary.activate();
 h.elements.backupPrevious.activate();
 assert.deepEqual(h.downloads,[{name:'veilpoint-ch01-checkpoint.json',body:primary},
  {name:'veilpoint-ch01-previous.json',body:previous}]);
 assert.deepEqual(h.revoked,['blob:offline','blob:offline']);
 assert.match(h.elements.backupStatus.textContent,/게임에서/);
});

test('missing or denied checkpoint storage never blocks actual story start',()=>{
 const one=launchHarness({'veilpoint.story.ch01':'checkpoint'});
 assert.equal(one.elements.backupPrimary.disabled,false);
 assert.equal(one.elements.backupPrevious.disabled,true);
 const denied=launchHarness({},true);
 assert.equal(denied.elements.backupPrimary.disabled,true);
 assert.equal(denied.elements.backupPrevious.disabled,true);
 assert.match(denied.elements.backupStatus.textContent,/저장소 접근이 제한/);
 assert.match(Story.INDEX,/id="launch" href="story\.html"/);
 assert.match(Story.INDEX,/Story CH01 Preview/,'the compiled Windows story host has a fixed positive identification marker');
 assert.match(Story.INDEX,/overflow:hidden/);
 assert.doesNotMatch(Story.INDEX,/overflow:auto|overflow:scroll/);
 assert.match(Story.INDEX,/@media\(max-height:680px\)/,'compact screen-fit mode is defined for 1024x600');
 assert.doesNotMatch(Story.INDEX,/<script\s+src=/);
});

test('signed story-only ZIP retains its exact offline launcher and excludes BR entry',()=>{
 const entries=inspectZip(buildZip(Story.storyEntries()));
 assert.equal(entries.get('index.html').toString('utf8'),Story.INDEX);
 assert.equal(entries.has('br96.html'),false);
 assert.equal(entries.has('src/br96-client.js'),false);
 assert.equal(Story.verifyStoryArchive(buildZip(Story.storyEntries())).storyOnly,true);
});
