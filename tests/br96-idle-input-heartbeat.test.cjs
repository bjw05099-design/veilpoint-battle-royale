'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
const server=fs.readFileSync(path.resolve(__dirname,'../server/br-squad-server.cjs'),'utf8');
function movementHarness(){
 const helpers=client.slice(client.indexOf('let lastSubmittedDirection=null,'),
  client.indexOf('// Each streamed snapshot is already filtered'));
 const action=client.slice(client.indexOf('async function movement(){'),
  client.indexOf('async function loadPublicGeometry(){'));
 assert.ok(helpers.includes('function needMovementFrame'));
 assert.ok(action.includes("request('/heartbeat',{})"));
 const calls=[],context=vm.createContext({
  Date:{now:()=>context.now},now:1000,
  token:'session-a',state:{roundNumber:1},
  keys:new Set(),sprintIntent:false,lastSprint:null,lastCrouch:null,
  seq:0,stanceSeq:0,moveBusy:false,consecutiveErrors:0,
  active:()=>true,dir:{dx:0,dz:0},direction(){return context.dir;},
  request:async (url,body)=>{calls.push({url,body});return {ok:true};},
  message(){},
 });
 vm.runInContext(helpers+'\n'+action+'\nthis.tickMove=movement;'+
  'this.resetState=()=>{lastSubmittedDirection=null;lastIdleHeartbeatAt=0;lastSprint=null;lastCrouch=null};',context);
 return {ctx:context,calls,movement:()=>context.tickMove()};
}
test('BR96 client sends ONE idle handoff, then real heartbeat instead of hundreds of neutral world snapshots',async()=>{
 const {ctx,calls,movement}=movementHarness();
 await movement();
 assert.deepEqual(calls.map(c=>c.url),['/move','/pace']);
 assert.deepEqual(JSON.stringify(calls[0].body),JSON.stringify({dx:0,dz:0,seq:1}));
 for(let i=0;i<20;i++)await movement();
 assert.equal(calls.length,2,'no repeated idle /move calls after first neutral handoff');
 ctx.now=4000;
 await movement();
 assert.deepEqual(calls.map(c=>c.url),['/move','/pace','/heartbeat']);
 assert.deepEqual(Object.keys(calls[2].body),[]);
 assert.equal(ctx.seq,1,'heartbeats never advance server movement sequences');
 for(let i=0;i<15;i++)await movement();
 assert.equal(calls.length,3);
 ctx.now=7001;await movement();
 assert.equal(calls.filter(c=>c.url==='/heartbeat').length,2);
});
test('active directional changes remain 180ms-authoritative, key release sends exact neutral, and stance changes are independent',async()=>{
 const {ctx,calls,movement}=movementHarness();
 ctx.dir={dx:1,dz:0};await movement();
 ctx.now=1180;await movement();
 ctx.dir={dx:0,dz:1};ctx.now=1360;await movement();
 ctx.dir={dx:0,dz:0};ctx.now=1540;await movement();
 assert.deepEqual(calls.filter(c=>c.url==='/move').map(c=>JSON.stringify(c.body)),[
  '{"dx":1,"dz":0,"seq":1}','{"dx":1,"dz":0,"seq":2}',
  '{"dx":0,"dz":1,"seq":3}','{"dx":0,"dz":0,"seq":4}']);
 ctx.now=1640;ctx.sprintIntent=true;await movement();
 assert.equal(calls.at(-1).url,'/pace');
 assert.deepEqual(JSON.stringify(calls.at(-1).body),
  JSON.stringify({sprint:true,crouch:false,seq:2}));
 assert.equal(calls.filter(c=>c.url==='/move').length,4,
  'a standstill stance change never moves an actor');
 ctx.now=5000;await movement();
 assert.equal(calls.at(-1).url,'/heartbeat');
 assert.equal(ctx.seq,4);
 assert.equal(ctx.stanceSeq,2);
});
test('after reconnect or round replay, the first frame resynchronizes movement once without stale input',async()=>{
 const {ctx,calls,movement}=movementHarness();
 await movement();ctx.now=1500;await movement();
 assert.equal(calls.filter(c=>c.url==='/move').length,1);
 ctx.resetState();ctx.now=2000;await movement();
 assert.equal(calls.filter(c=>c.url==='/move').length,2);
 assert.match(client,/lastSubmittedDirection=null;lastIdleHeartbeatAt=0;/);
 assert.match(client,/if\(next\.roundNumber>state\.roundNumber\)\{/);
});
test('server owns actual 60Hz heartbeat and does not reveal cross-squad bodies or change eligibility',()=>{
 const {BrSquadLobby}=require('../src/br-squad-lobby.cjs'),
  {BrSquadWorld,PRESENCE_STALE_TICKS}=require('../src/br-squad-world.cjs');
 const lobby=new BrSquadLobby(),tokens=[];
 for(let i=0;i<96;i++){
  const token=i.toString(16).padStart(64,'0');
  tokens.push(token);lobby.join(token,'Human'+i);
 }
 for(const t of tokens)lobby.ready(t,true);
 const world=new BrSquadWorld(lobby);
 const before=world.snapshot(tokens[0]),who=before.self.id;
 world.tick=PRESENCE_STALE_TICKS+2;
 assert.equal(world.snapshot(tokens[0]).self.connection,'stale');
 const res=world.heartbeat(tokens[0]);
 assert.deepEqual(res,{ok:true,tick:world.tick});
 const after=world.snapshot(tokens[0]);
 assert.equal(after.self.connection,'fresh');
 assert.equal(after.self.id,who);
 assert.equal(after.self.eligible,before.self.eligible);
 assert.equal(after.self.x,before.self.x);
 assert.equal(after.self.z,before.self.z);
 assert.equal(world.snapshot(tokens[7]).self.connection,'stale',
  'an idle heartbeat never refreshes an opponent');
 assert.match(server,/if\(req\.method==='POST'&&url\.pathname==='\/heartbeat'\)/);
 assert.match(client,/const IDLE_HEARTBEAT_MS=3000/);
 assert.doesNotMatch(client,/sendBeacon|EventSource\(/);
});
