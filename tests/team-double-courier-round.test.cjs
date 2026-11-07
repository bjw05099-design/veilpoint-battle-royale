'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const RED='a'.repeat(48),BLUE='b'.repeat(48);
function started(){
 const game=new TeamMatch({objectiveSite:'courier-double',targetScore:2,now:()=>0});
 game.join(RED,'Carrier');game.join(BLUE,'Observer');
 game.command(RED,{seq:1,type:'ready'});
 game.command(BLUE,{seq:1,type:'ready'});
 assert.equal(game.phase,'playing');
 game.players.get(BLUE).x=8;game.players.get(BLUE).z=0;
 return {game,seq:1,red:game.players.get(RED)};
}
function work(ctx){
 const {game}=ctx;
 game.command(RED,{seq:++ctx.seq,type:'capture',active:false});
 game.command(RED,{seq:++ctx.seq,type:'capture',active:true});
 for(let i=0;i<126&&game.phase==='playing';i++){
  if(i===60)game.command(RED,{seq:++ctx.seq,type:'capture',active:true});
  game.step();
 }
}
test('host-only two-consignment round has a different finite objective contract',()=>{
 assert.throws(()=>new TeamMatch({objectiveSite:'courier-double',targetScore:1}),/courier_double_two_deliveries_only/);
 assert.throws(()=>new TeamMatch({objectiveSite:'courier-double',targetScore:3}),/courier_double_two_deliveries_only/);
 assert.throws(()=>new TeamMatch({objectiveSite:'courier-doublee',targetScore:2}),/invalid_objective_site/);
 const {game}=started();
 assert.equal(game.targetScore,2);
 assert.equal(game.snapshot(RED).relayVariant,'courier');
 assert.equal(game.snapshot(RED).courier.stage,'pickup');
 assert.deepEqual(game.snapshot(RED).objective.stations.map(x=>x.id),['pickup','dropoff']);
 assert.deepEqual(game.score,{red:0,blue:0});
});
test('one handoff never wins; depot requires a second physical pickup and delivery',()=>{
 const ctx=started(),{game,red}=ctx;
 red.x=0;red.z=0;red.direction={x:0,z:0};
 work(ctx);
 assert.equal(game.courier.carrierId,red.id);
 assert.equal(game.objective.z,10);
 assert.equal(game.score.red,0);
 red.x=0;red.z=10;
 work(ctx);
 assert.equal(game.score.red,1);
 assert.equal(game.phase,'playing');
 assert.equal(game.objective.z,0,'next parcel must remain at the actual fixed depot');
 assert.equal(game.courier.carrierId,null);
 assert.deepEqual(game.events.map(e=>e.type).slice(-2),['parcel_delivered','parcel_restocked']);
 // Handoff cannot be repeated while standing at the former delivery desk.
 work(ctx);
 assert.equal(game.score.red,1);
 assert.equal(game.courier.carrierId,null);
 // Fixed coordinates below are test fixtures only: no client command allows
 // teleportation, and normal gameplay requires server-validated movement.
 red.x=0;red.z=0;
 work(ctx);
 assert.equal(game.courier.carrierId,red.id);
 assert.equal(game.score.red,1);
 red.x=0;red.z=10;
 work(ctx);
 assert.equal(game.phase,'ended');
 assert.equal(game.winner,'red');
 assert.deepEqual(game.score,{red:2,blue:0});
 assert.deepEqual(game.events.map(e=>e.type),[
  'round_start','parcel_collected','parcel_delivered','parcel_restocked',
  'parcel_collected','parcel_delivered','round_end']);
 const state=game.snapshot(BLUE);
 assert.equal(state.courier.team,'red');
 assert.equal(Object.hasOwn(state.courier,'carrierId'),false);
 assert.equal(Object.hasOwn(state.courier,'x'),false);
});
test('local loopback server and PC browser expose the second consignment without changing legacy courier',async()=>{
 const host=createTeamServer({port:0,autoTick:false,objectiveSite:'courier-double',targetScore:2});
 const addr=await host.listen();
 try{
  const response=await fetch('http://127.0.0.1:'+addr.port+'/join',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({name:'Two cargo runner'})});
  assert.equal(response.status,201);
  const {token}=await response.json();
  const state=await fetch('http://127.0.0.1:'+addr.port+'/state',{
   headers:{'x-player-token':token}}).then(r=>r.json());
  assert.equal(state.targetScore,2);
  assert.equal(state.relayVariant,'courier');
  assert.equal(state.courier.stage,'pickup');
 }finally{await host.close();}
 const client=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../team.html'),'utf8');
 assert.match(client,/parcel_restocked:'다음 물품 현장 접수 준비'/);
 assert.match(html,/VEILPOINT_OBJECTIVE_SITE=courier-double VEILPOINT_TARGET_SCORE=2/);
 const single=new TeamMatch({objectiveSite:'courier',targetScore:1,now:()=>0});
 assert.equal(single.targetScore,1);
});
