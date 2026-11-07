'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function downloadFixture(kind,{clickThrows=false,blockedUrl=false}={}){
 const br=kind==='BR';
 const source=fs.readFileSync(path.join(__dirname,'../src/',br?'app.js':'story-app.js'),'utf8');
 const start=source.indexOf(br
  ?"$('brExportDownload').addEventListener('click',()=>{"
  :"$('checkpointDownload').addEventListener('click',()=>{");
 const after=source.indexOf(br
  ?'// Explicit PC save-and-exit'
  :"$('checkpointTransferText').addEventListener('input',()=>{",start);
 assert.ok(start>=0&&after>start,'PC offline download handler must be registered');
 const listeners=new Map(),nodes=new Map(),trace=[];
 function node(id){
  if(!nodes.has(id)){
   const item={id,value:'{"version":2}',readOnly:true,textContent:'',
    classList:{contains(){return false;}},
    addEventListener(type,fn){listeners.set(id+':'+type,fn);},
    focus(){trace.push('focus:'+id);},
    select(){trace.push('select:'+id);}
   };
   nodes.set(id,item);
  }
  return nodes.get(id);
 }
 const raw='{"version":2}';
 const global={
  Blob:function Blob(){},
  URL:blockedUrl?{createObjectURL(){throw new Error('blocked URL');}}:{
   createObjectURL(){trace.push('blob-created');return 'blob:local';},
   revokeObjectURL(){trace.push('blob-revoked');}},
  setTimeout(fn){fn();}
 };
 const document={
  body:{appendChild(link){link.attached=true;trace.push('link-attached');}},
  createElement(tag){
   assert.equal(tag,'a');
   return {attached:false,
    click(){assert.equal(this.attached,true,'download must start from attached anchor');trace.push('link-click');if(clickThrows)throw Error('download denied');},
    remove(){trace.push('link-removed');this.attached=false;}
   };
  }
 };
 const ctx={$:node,document,global,Story:{serialize(){return raw;}},Game:{snapshotMatch(){return raw;}},
  sessionStarted:true,running:br,suspended:br,simulation:{status:'playing'},
  state:{},menu:{classList:{contains(){return false;}}}
 };
 vm.runInNewContext(source.slice(start,after),ctx,{filename:kind+'-download-handler',timeout:1200});
 const handler=listeners.get((br?'brExportDownload':'checkpointDownload')+':click');
 assert.equal(typeof handler,'function');
 return {run:()=>handler(),trace,nodes,raw};
}
for(const kind of ['BR','CH01']){
 const fieldId=kind==='BR'?'brExportText':'checkpointTransferText';
 const statusId=kind==='BR'?'brExportStatus':'checkpointTransferStatus';
 test(kind+' offline JSON export clicks a connected anchor then revokes its Blob URL',()=>{
  const f=downloadFixture(kind);
  f.run();
  assert.deepEqual(f.trace.slice(0,4),['blob-created','link-attached','link-click','link-removed']);
  assert.equal(f.trace.at(-1),'blob-revoked');
  assert.match(f.nodes.get(statusId).textContent,/저장 요청/);
  assert.equal(f.nodes.get(fieldId).value,f.raw);
 });
 test(kind+' denied Windows download cleans up anchor and focuses selectable JSON',()=>{
  const f=downloadFixture(kind,{clickThrows:true});
  f.run();
  assert.ok(f.trace.indexOf('link-removed')>f.trace.indexOf('link-click'));
  assert.ok(f.trace.includes('blob-revoked'));
  assert.ok(f.trace.includes('focus:'+fieldId));
  assert.ok(f.trace.includes('select:'+fieldId));
  assert.match(f.nodes.get(statusId).textContent,/직접 복사|전체 선택/);
 });
 test(kind+' blocked Blob creation preserves the local JSON copy fallback',()=>{
  const f=downloadFixture(kind,{blockedUrl:true});
  f.run();
  assert.equal(f.trace.includes('link-click'),false);
  assert.ok(f.trace.includes('focus:'+fieldId));
  assert.ok(f.trace.includes('select:'+fieldId));
  assert.equal(f.nodes.get(fieldId).value,f.raw);
 });
}
