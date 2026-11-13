'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
function harness(){
 const listeners=new Map(),calls=[];
 const context={token:'test-session',state:{roundNumber:1},keys:new Set(),
  sprintIntent:false,lastSprint:null,lastCrouch:null,seq:0,stanceSeq:0,
  moveBusy:false,consecutiveErrors:0,streetView:false,mapFollow:false,canvas:{},
  document:{hidden:false,hasFocus:()=>true,activeElement:{tagName:'CANVAS'},
   addEventListener(name,fn){listeners.set(name,fn)}},
  window:{addEventListener(){}},el:()=>({hidden:true}),active:()=>true,
  render(){},message(){},Date,
  request:async(url,body)=>{calls.push({url,body});return {ok:true}}
 };
 const helpers=client.slice(client.indexOf('let lastSubmittedDirection=null,'),
  client.indexOf('// Each streamed snapshot is already filtered'));
 const input=client.slice(client.indexOf('function textEntryFocused('),
  client.indexOf('async function loadPublicGeometry()'));
 vm.createContext(context);vm.runInContext(helpers+'\n'+input+'\nthis.move=movement;',context);
 const emit=(name,e={})=>listeners.get(name)({preventDefault(){},...e});
 return {context,calls,emit,focus(target){context.document.activeElement=target;emit('focusin',{target})}};
}
test('focusing squad chat releases held movement and sprint and never resumes them after typing',async()=>{
 const h=harness();h.emit('keydown',{code:'KeyW'});h.emit('keydown',{code:'ShiftLeft'});
 await h.context.move();
 assert.equal(h.calls.find(c=>c.url==='/move').body.dz,-1);
 assert.equal(h.calls.find(c=>c.url==='/pace').body.sprint,true);
 h.focus({tagName:'INPUT'});await new Promise(setImmediate);
 assert.equal(h.calls.filter(c=>c.url==='/move').at(-1).body.dz,0);
 assert.equal(h.calls.filter(c=>c.url==='/pace').at(-1).body.sprint,false);
 h.emit('keydown',{code:'KeyW'});h.emit('keydown',{code:'ShiftLeft'});
 assert.equal(h.context.keys.size,0);
 h.focus({tagName:'CANVAS'});await h.context.move();
 assert.equal(h.calls.filter(c=>c.url==='/move').length,2,'no old key may restart motion');
 h.emit('keydown',{code:'KeyD'});await h.context.move();
 assert.equal(h.calls.filter(c=>c.url==='/move').at(-1).body.dx,1);
});
test('editable elements and programmatically focused controls cannot continue an old direction',async()=>{
 for(const target of [{tagName:'TEXTAREA'},{tagName:'SELECT'},
   {tagName:'SPAN',isContentEditable:true}]){
  const h=harness();h.emit('keydown',{code:'KeyW'});await h.context.move();
  // Exercise the per-frame guard even before the browser delivers focusin.
  h.context.document.activeElement=target;await h.context.move();
  const last=h.calls.filter(c=>c.url==='/move').at(-1);
  assert.equal(last.body.dx,0);assert.equal(last.body.dz,0);
  h.focus(target);await new Promise(setImmediate);
  assert.equal(h.context.keys.size,0);
 }
});
