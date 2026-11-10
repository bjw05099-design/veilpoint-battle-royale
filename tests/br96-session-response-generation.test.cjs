'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
function section(start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'real BR96 client must retain tested function '+start);
 return source.slice(i,j);
}
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
test('BR96 delayed movement from an abandoned 96-person session cannot rewrite the new round or enqueue stale stance',async()=>{
 const helpers=section('let lastSubmittedDirection=null,','// Each streamed snapshot is already filtered');
 const movement=section('async function movement(){','async function loadPublicGeometry(){');
 const oldMove=deferred(),requests=[],messages=[];
 const ctx=vm.createContext({
  token:'session-a',state:{roundNumber:1},seq:0,stanceSeq:0,
  Date:{now:()=>1000},keys:new Set(),sprintIntent:false,
  lastSprint:null,lastCrouch:null,moveBusy:false,consecutiveErrors:0,
  active:()=>true,direction:()=>({dx:1,dz:0}),
  request:(url,body)=>{requests.push({url,body});return requests.length===1?oldMove.promise:Promise.resolve({ok:true});},
  message:msg=>messages.push(msg)
 });
 vm.runInContext(helpers+'\n'+movement+
  '\nthis.moveOnce=movement;this.position=()=>({direction:lastSubmittedDirection,heartbeat:lastIdleHeartbeatAt,lastSprint,lastCrouch});',ctx);
 const inFlight=ctx.moveOnce();
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/move');
 ctx.token='session-b';ctx.state={roundNumber:2};
 ctx.seq=0;ctx.stanceSeq=0;
 oldMove.resolve({ok:true});
 await inFlight;
 assert.equal(requests.length,1,'old movement completion cannot send /pace into newly authenticated match');
 assert.equal(ctx.position().direction,null,'new seat cannot inherit old session movement');
 assert.equal(ctx.position().heartbeat,0,'old response cannot refresh new session connection');
 assert.equal(ctx.seq,0);
 assert.equal(ctx.stanceSeq,0);
 assert.equal(messages.length,0);
});
test('BR96 late network errors after session rotation do not warn or reset a new player',async()=>{
 const helpers=section('let lastSubmittedDirection=null,','// Each streamed snapshot is already filtered');
 const movement=section('async function movement(){','async function loadPublicGeometry(){');
 const oldMove=deferred(),messages=[];
 const ctx=vm.createContext({
  token:'old',state:{roundNumber:3},seq:0,stanceSeq:0,
  Date:{now:()=>1000},keys:new Set(),sprintIntent:false,
  lastSprint:null,lastCrouch:null,moveBusy:false,consecutiveErrors:0,
  active:()=>true,direction:()=>({dx:0,dz:0}),
  request:()=>oldMove.promise,message:msg=>messages.push(msg)
 });
 vm.runInContext(helpers+'\n'+movement+'\nthis.moveOnce=movement;',ctx);
 const active=ctx.moveOnce();
 ctx.token='new';ctx.state={roundNumber:4};
 oldMove.reject(Error('old network timeout'));
 await active;
 assert.equal(ctx.consecutiveErrors,0);
 assert.equal(messages.length,0);
});
test('BR96 stale lobby commands and state polls cannot replace current private squad snapshots',async()=>{
 const commands=section('async function command(path,body,statusText){','async function voteEntry(){');
 const polls=section('async function poll(){',"el('join').addEventListener");
 const oldCommand=deferred(),oldPoll=deferred(),events=[];
 const commandCtx=vm.createContext({
  token:'old',request:()=>oldCommand.promise,state:{roundNumber:1},
  apply:s=>events.push(['command-apply',s]),
  message:s=>events.push(['command-message',s]),
  cleanSession:()=>events.push(['clean'])
 });
 vm.runInContext(commands+'\nthis.send=command;',commandCtx);
 const pendingCommand=commandCtx.send('/ready',{ready:true},'done');
 commandCtx.token='new';commandCtx.state={roundNumber:2};
 oldCommand.resolve({state:{self:{id:0},roundNumber:1}});
 assert.equal(await pendingCommand,null);
 assert.equal(events.length,0);
 const pollCtx=vm.createContext({
  token:'old',pollBusy:false,consecutiveErrors:0,
  request:()=>oldPoll.promise,apply:s=>events.push(['poll-apply',s]),
  currentWorld:()=>({}),connectPrivateWorldStream:()=>events.push(['stream']),
  cleanSession:()=>events.push(['clean']),message:s=>events.push(['poll-message',s])
 });
 vm.runInContext(polls+'\nthis.pollOnce=poll;',pollCtx);
 const pendingPoll=pollCtx.pollOnce();
 pollCtx.token='new';
 oldPoll.resolve({self:{id:5},roundNumber:1});
 await pendingPoll;
 assert.equal(events.length,0);
 assert.equal(pollCtx.pollBusy,false);
});
