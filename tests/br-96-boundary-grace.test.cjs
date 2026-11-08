'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,BOUNDARY_GRACE_TICKS}=require('../src/br-squad-world.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function start(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Participant '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('boundary has a visible eight-second continuous grace, not instant elimination',()=>{
 const w=start(),player=w.actors.get(token(0));
 assert.equal(BOUNDARY_GRACE_TICKS,480);
 w.tick=10200;player.x=140;player.z=0;
 player.outsideStreakTicks=BOUNDARY_GRACE_TICKS-2;
 let snapshot=w.snapshot(token(0));
 assert.equal(snapshot.self.boundaryGraceTicksRemaining,2);
 w.step();
 snapshot=w.snapshot(token(0));
 assert.equal(snapshot.self.eligible,true);
 assert.equal(snapshot.self.outsideAreaTicks,1);
 assert.equal(snapshot.self.boundaryGraceTicksRemaining,1);
 assert.equal(w.activeSquads,16);
 w.step();
 assert.equal(w.snapshot(token(0)).self.eligible,false);
 assert.equal(w.snapshot(token(0)).self.boundaryGraceTicksRemaining,null);
 assert.deepEqual(w.move(token(0),{seq:1,dx:1,dz:0}),{ok:false,reason:'out_of_round'});
 assert.equal(w.snapshot(token(1)).squad[0].eligible,false);
 assert.equal(w.snapshot(token(1)).squad[0].boundaryGraceTicksRemaining,null,
  'a retired teammate is not falsely shown a fresh grace countdown');
 assert.equal(w.snapshot(token(6)).squad.some(x=>x.id===player.id),false);
 assert.equal(w.activeSquads,16,'only one expired player cannot erase a six-person squad');
});
test('moving back inside resets only the consecutive expiry clock',()=>{
 const w=start(),a=w.actors.get(token(0));
 w.tick=10200;a.x=145;a.z=0;a.outsideStreakTicks=BOUNDARY_GRACE_TICKS-2;
 w.step();
 assert.equal(a.outsideStreakTicks,BOUNDARY_GRACE_TICKS-1);
 const exposure=a.outsideAreaTicks;
 a.x=0;a.z=0;
 w.step();
 assert.equal(a.outsideStreakTicks,0);
 assert.equal(a.outsideAreaTicks,exposure,'historic exposure telemetry remains cumulative');
 assert.equal(w.snapshot(token(0)).self.boundaryGraceTicksRemaining,BOUNDARY_GRACE_TICKS);
 a.x=145;a.z=0;
 w.step();
 assert.equal(a.outsideStreakTicks,1,'a new outside crossing has a fresh grace');
 assert.equal(a.eligible,true);
});
test('several squads expiring simultaneously tie fairly; remaining squad wins only if it truly remains',()=>{
 const w=start();
 w.tick=10200;
 for(let i=0;i<90;i++){
  const p=w.actors.get(token(i));
  p.x=140;p.z=0;p.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
 }
 for(let i=90;i<96;i++){
  const p=w.actors.get(token(i));
  p.x=0;p.z=0;
 }
 w.step();
 assert.equal(w.phase,'finished');
 assert.equal(w.activeSquads,1);
 assert.deepEqual(w.snapshot(token(90)).standings.map(x=>x.placement),Array(15).fill(2).concat(1));
 assert.equal(w.withdraw(token(0)).reason,'already_withdrawn');
 const tick=w.tick;
 w.step();
 assert.equal(w.tick,tick,'terminal standings are immutable');
 const tied=start();tied.tick=10200;
 for(const p of tied.actors.values()){
  p.x=140;p.z=0;p.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
 }
 tied.step();
 assert.equal(tied.phase,'finished');
 assert.equal(tied.activeSquads,0);
 assert.equal(tied.snapshot(token(0)).standings.every(x=>x.placement===1),true,
  'a same-tick total retirement is a tie, not a fabricated unique champion');
});
test('no client-controlled method allows editing public boundary grace or teammate counters',()=>{
 const w=start();
 assert.equal(Object.hasOwn(w,'setBoundaryGrace'),false);
 assert.throws(()=>w.move(token(0),{seq:1,dx:0,dz:1,outsideStreakTicks:1}),/invalid_movement/);
 assert.equal(w.actors.get(token(0)).outsideStreakTicks,0);
 assert.equal(JSON.stringify(w.snapshot(token(6))).includes(token(0)),false);
});
