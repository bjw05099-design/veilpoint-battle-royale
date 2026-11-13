'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const client=fs.readFileSync(require('node:path').join(__dirname,'../src/br96-client.js'),'utf8');
function harness(){
 const calls=[],listeners={},canvas={addEventListener(n,fn){listeners['canvas:'+n]=fn}};
 const weapon={loaded:12,seq:-1,reloadTicksRemaining:0};
 const c={canvas,keys:new Set(),weaponSeq:0,weaponBusy:false,token:'session',state:{roundNumber:1},
  streetView:true,streetYaw:0,streetPitch:0,active:()=>true,textEntryFocused:()=>false,
  currentWorld:()=>({self:{weapon}}),el:()=>({hidden:true}),render(){},audioControls:null,
  harborAudio:{shot(){calls.push({sound:true})}},window:{VeilpointBR96StreetView:require('../src/br96-street-view.js')},
  document:{hidden:false,hasFocus:()=>true,pointerLockElement:canvas,
   addEventListener(n,fn){listeners[n]=fn}},
  command:async(path,body)=>{calls.push({path,body});weapon.seq=body.seq;return {ok:true}}
 };
 vm.createContext(c);
 vm.runInContext(client.slice(client.indexOf('function weaponInputAvailable()'),
  client.indexOf('function toggleMapFollow()')),c);
 return {c,calls,listeners,weapon};
}
test('only foreground locked first-person fire is sent, with angles, ordered sequence and no target',async()=>{
 const {c,calls,weapon}=harness();weapon.seq=17;
 await c.weaponAction('fire');await c.weaponAction('reload');
 const sent=calls.filter(x=>x.path);
 assert.deepEqual(JSON.parse(JSON.stringify(sent)),[
  {path:'/fire',body:{seq:18,yaw:0,pitch:0}},{path:'/reload',body:{seq:19}}]);
 assert.equal(c.streetPitch,.004);assert.equal(calls.filter(x=>x.sound).length,1);
 for(const alter of [c=>{c.document.hidden=true},c=>{c.streetView=false},
  c=>{c.document.pointerLockElement=null},c=>{c.textEntryFocused=()=>true},
  c=>{c.el=()=>({hidden:false})},c=>{c.active=()=>false}]){
  const h=harness();alter(h.c);await h.c.weaponAction('fire');assert.equal(h.calls.length,0);
 }
});
test('held trigger clears on release/unlock and cannot replay queued shots during an in-flight request',async()=>{
 const {c,calls,listeners}=harness();let resolve;
 c.command=(path,body)=>{calls.push({path,body});return new Promise(r=>{resolve=r})};
 const pending=c.weaponAction('fire');await c.weaponAction('fire');assert.equal(calls.length,1);
 resolve({ok:true});await pending;
 c.keys.add('MousePrimary');listeners.mouseup({button:0});assert.equal(c.keys.size,0);
 c.keys.add('MousePrimary');c.document.pointerLockElement=null;
 listeners.pointerlockchange();assert.equal(c.keys.size,0);
});
test('request includes round generation and old same-tick health/ammo cannot rewind the PC world',async()=>{
 const requests=[],ctx={state:{roundNumber:3},token:'secret',AbortController,setTimeout,clearTimeout,
  fetch:async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>({ok:true})}}};
 vm.createContext(ctx);
 vm.runInContext(client.slice(client.indexOf('async function request('),client.indexOf('function apply(')),ctx);
 await ctx.request('/fire',{seq:1,yaw:0,pitch:0});
 assert.equal(requests[0].options.headers['x-round-number'],'3');
 const initial={roundNumber:3,self:{id:1},world:{tick:20,revision:30,self:{weapon:{loaded:10}}}};
 const c={state:initial,lastWorldTick:20,seq:0,stanceSeq:0,consecutiveErrors:0,render(){}};
 vm.createContext(c);vm.runInContext(client.slice(client.indexOf('function apply('),client.indexOf('function parsePrivateWorld(')),c);
 c.apply({...initial,world:{tick:20,revision:29,self:{weapon:{loaded:12}}}});
 assert.equal(c.state.world.self.weapon.loaded,10);
 c.apply({...initial,world:{tick:20,revision:31,self:{weapon:{loaded:9}}}});
 assert.equal(c.state.world.self.weapon.loaded,9);
});
