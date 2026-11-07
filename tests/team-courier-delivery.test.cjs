'use strict';
// Non-combat, server-owned 2-stop parcel match. Node coverage is an offline
// protocol/gameplay gate, not a public internet or production 2v2 certification.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const RED='a'.repeat(48),BLUE='b'.repeat(48);
function setup(){
 const match=new TeamMatch({objectiveSite:'courier',targetScore:1,now:()=>0});
 match.join(RED,'Runner');match.join(BLUE,'Observer');
 match.command(RED,{seq:1,type:'ready'});
 match.command(BLUE,{seq:1,type:'ready'});
 assert.equal(match.phase,'playing');
 return match;
}
function capture(match,seq){
 match.command(RED,{seq:++seq.n,type:'capture',active:true});
 for(let i=0;i<130&&match.phase==='playing';i++){
  if(i===60)match.command(RED,{seq:++seq.n,type:'capture',active:true});
  match.step();
  if(match.phase==='ended')break;
  if(match.courier.carrierId!==null&&match.objective.z===10&&match.ticks<150)break;
 }
}
function move(match,seq,x,z,ticks){
 for(let i=0;i<ticks;i++){
  if(i%25===0)match.command(RED,{seq:++seq.n,type:'move',direction:{x,z}});
  match.step();
 }
}
test('courier mode is explicitly host-only, finite, and does not alter old relay rules',()=>{
 assert.throws(()=>new TeamMatch({objectiveSite:'courier',targetScore:3}),/courier_one_delivery_only/);
 const legacy=new TeamMatch({now:()=>0}),state=setup();
 assert.equal(legacy.objectiveSite,'center');
 assert.equal(legacy.courier.carrierId,null);
 assert.equal(state.objective.x,0);assert.equal(state.objective.z,0);
 assert.deepEqual(state.score,{red:0,blue:0});
 const normal=legacy.join(RED,'Normal');
 assert.equal(normal.team,'red');
 assert.equal(Object.prototype.hasOwnProperty.call(legacy.snapshot(RED),'courier'),false,
   'the legacy relay JSON contract must remain unchanged');
 const courier=state.snapshot(RED);
 assert.equal(courier.relayVariant,'courier');
 assert.deepEqual(courier.objective.stations.map(x=>x.id),['pickup','dropoff']);
 assert.deepEqual(courier.courier,{stage:'pickup',team:null,
   pickup:{x:0,z:0},dropoff:{x:0,z:10}});
 assert.equal(courier.targetScore,1);
});
test('one physical parcel is picked up, walked around existing cover, then handed off',()=>{
 const m=setup(),seq={n:1},red=m.players.get(RED);
 // A remote press at the original spawn does not pre-authorize pickup.
 m.command(RED,{seq:++seq.n,type:'capture',active:true});
 for(let i=0;i<130;i++){
  if(i===60)m.command(RED,{seq:++seq.n,type:'capture',active:true});
  m.step();
 }
 assert.equal(m.courier.carrierId,null);
 assert.equal(m.score.red,0);
 m.command(RED,{seq:++seq.n,type:'capture',active:false});
 // Player reaches the physical intake location (the test skips only the
 // approach leg, then verifies the full actual parcel-carry route).
 red.x=0;red.z=0;
 capture(m,seq);
 assert.equal(m.courier.carrierId,red.id);
 assert.equal(m.courier.team,'red');
 assert.equal(m.objective.z,10);
 assert.equal(m.score.red,0,'receipt cannot be mistaken for delivered cargo');
 assert.equal(m.phase,'playing');
 assert.equal(m.snapshot(RED).courier.stage,'delivery');
 assert.deepEqual(m.fireShot(red),{ok:false,reason:'courier_noncombat'},
   'the optional exercise is explicitly noncombat');
 // An unassigned opponent at the destination cannot claim the parcel:
 // only the observed carrier can finish its physical handoff.
 const blue=m.players.get(BLUE);
 blue.x=0;blue.z=10;
 m.command(BLUE,{seq:2,type:'capture',active:true});
 for(let i=0;i<125;i++){
  if(i===60)m.command(BLUE,{seq:3,type:'capture',active:true});
  m.step();
 }
 assert.equal(m.score.blue,0);
 assert.equal(m.phase,'playing');
 m.command(BLUE,{seq:4,type:'capture',active:false});
 blue.x=8;blue.z=0;
 m.command(RED,{seq:++seq.n,type:'capture',active:false});
 // Walk east of the existing solid central cover, then south and west to
 // the actual handoff location; no client-provided position teleport exists.
 move(m,seq,1,0,70);
 assert.ok(red.x>3);
 move(m,seq,0,1,167);
 assert.ok(red.z>9&&red.z<11);
 move(m,seq,-1,0,68);
 assert.ok(Math.hypot(red.x,red.z-10)<1);
 m.command(RED,{seq:++seq.n,type:'move',direction:{x:0,z:0}});
 capture(m,seq);
 assert.equal(m.phase,'ended');
 assert.equal(m.winner,'red');
 assert.equal(m.reason,'objective_score');
 assert.deepEqual(m.score,{red:1,blue:0});
 assert.deepEqual(m.events.map(x=>x.type),
   ['round_start','parcel_collected','parcel_delivered','round_end']);
});
test('courier state is cleared on rematch and never embeds hidden carrier coordinates',()=>{
 const m=setup(),seq={n:1},red=m.players.get(RED);
 red.x=0;red.z=0;capture(m,seq);
 const published=m.snapshot(BLUE);
 assert.equal(published.courier.team,'red');
 assert.equal(Object.prototype.hasOwnProperty.call(published.courier,'x'),false);
 assert.equal(Object.prototype.hasOwnProperty.call(published.courier,'carrierId'),false);
 m.resetRoundState();
 assert.equal(m.courier.carrierId,null);
 assert.equal(m.objective.z,0);
 assert.equal(m.score.red,0);
});
test('loopback server exposes optional parcel course as public fixed fixtures only',async()=>{
 const host=createTeamServer({port:0,autoTick:false,objectiveSite:'courier',targetScore:1});
 const address=await host.listen();
 try{
  const join=await fetch('http://127.0.0.1:'+address.port+'/join',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Courier Local'})});
  assert.equal(join.status,201);
  const {token}=await join.json();
  const state=await fetch('http://127.0.0.1:'+address.port+'/state',{
    headers:{'x-player-token':token}}).then(r=>r.json());
  assert.equal(state.relayVariant,'courier');
  assert.equal(state.targetScore,1);
  assert.deepEqual(state.objective.stations.map(x=>x.id),['pickup','dropoff']);
  assert.equal(state.courier.stage,'pickup');
 }finally{await host.close();}
});
test('public UI shows parcel only in view of the carrier, not as a remote locator',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../team.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 assert.match(html,/VEILPOINT_OBJECTIVE_SITE=courier/);
 assert.match(ui,/if\(state\.courier\?\.stage==='pickup'\)/);
 assert.match(ui,/state\.courier\.team===state\.courier\.team|p\.team===state\.courier\.team/);
 assert.match(ui,/parcel_collected:'물품 현장 인수'/);
});
