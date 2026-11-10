'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Civic=require('../src/ch01-civic-recovery.cjs');
// One fictional street has a central obstruction AND a separate physical
// obstacle on the normally preferred curb-side lane. The other lane is open.
const blocked=(x,z)=>
 (x>=4.6&&x<=6.4&&z>=-17.1&&z<=-14.9)||
 (x>=4.2&&x<=6.6&&z>=-18.8&&z<=-17.7);
const far={x:-20,z:0};
test('CH01 resident chooses the actually traversable public lane rather than getting trapped at the first turn',()=>{
 let state=Civic.step(Civic.initial(),{
  disruption:true,assist:true,player:{x:6,z:-16}
 });
 assert.equal(state.assisted,true);
 const initial=JSON.stringify(state),saved=Civic.restore(JSON.parse(initial));
 assert.deepEqual(saved,state);
 let north=false;
 for(let tick=0;tick<1000;tick++){
  const before=state.civilian;
  state=Civic.step(state,{blocked,player:far});
  const after=state.civilian;
  const speed=Math.hypot(after.x-before.x,after.z-before.z);
  assert.ok(speed<=1.1/60+1e-8,'each 60Hz fixed step respects real pedestrian speed');
  assert.equal(blocked(after.x,after.z),false,'a full collision body cannot be crossed');
  assert.ok(after.x>=before.x-1e-8,'detour must not teleport backward');
  assert.ok(after.z<=-13.6+1e-8&&after.z>=-18.4-1e-8);
  north ||= after.z>-15.5;
  assert.ok(after.z>-17.7-1e-8,
   'the forward-blocked south lane must never be selected in this fixture');
 }
 assert.equal(north,true,'pedestrian physically walked around the open north curb');
 assert.deepEqual(state.civilian,state.destination,
  'pedestrian eventually reaches the real destination instead of a fake arrived flag');
 assert.equal(state.version,1,'backward-compatible civic save schema');
});
test('an in-progress detour remains deterministic after its existing V1 civic save round trip',()=>{
 let state=Civic.step(Civic.initial(),{
  disruption:true,assist:true,player:{x:6,z:-16}
 });
 for(let i=0;i<180;i++)state=Civic.step(state,{blocked,player:far});
 let restored=Civic.restore(JSON.parse(JSON.stringify(state)));
 for(let i=0;i<160;i++){
  state=Civic.step(state,{blocked,player:far});
  restored=Civic.step(restored,{blocked,player:far});
 }
 assert.deepEqual(restored,state);
 assert.ok(state.civilian.x>2);
 assert.equal(blocked(state.civilian.x,state.civilian.z),false);
});
test('an entirely closed crossing still safely waits, without an invented escape position',()=>{
 let state=Civic.step(Civic.initial(),{
  disruption:true,assist:true,player:{x:6,z:-16}
 });
 const blockedClosed=(x,z)=>x>2.3;
 for(let i=0;i<120;i++)state=Civic.step(state,{blocked:blockedClosed,player:far});
 assert.ok(state.civilian.x<=2.3+1e-8);
 assert.equal(state.assisted,true);
 assert.ok(state.civilian.x<state.destination.x);
});

test('distant objects after the resident rejoins the centre are not false detour blockers',()=>{
 const blockedDistant=(x,z)=>(
  x>=4.6&&x<=6.4&&z>=-17.1&&z<=-14.9
 )||(
  x>=8.8&&x<=9.2&&(z<=-18.1||z>=-13.9)
 );
 let s=Civic.step(Civic.initial(),{
  disruption:true,assist:true,player:{x:6,z:-16}
 });
 let steppedAside=false;
 for(let i=0;i<1050;i++){
  const prior=s.civilian;
  s=Civic.step(s,{blocked:blockedDistant,player:far});
  const next=s.civilian;
  assert.equal(blockedDistant(next.x,next.z),false);
  assert.ok(Math.hypot(next.x-prior.x,next.z-prior.z)<=1.1/60+1e-8);
  if(Math.abs(next.z+16)>.3)steppedAside=true;
 }
 assert.ok(steppedAside,'nearby obstacle still triggers a real detour');
 assert.deepEqual(s.civilian,s.destination,
  'an unrelated curb object after the rejoin point cannot soft-lock the crossing');
});
