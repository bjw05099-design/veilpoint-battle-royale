'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,REGROUP_RADIUS_METERS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function world(){
  const lobby=new BrSquadLobby();
  for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
  for(let i=0;i<96;i++)lobby.ready(token(i),true);
  return new BrSquadWorld(lobby);
}
test('server-owned regroup counter measures six real team bodies around a genuine teammate signal',()=>{
  const w=world();
  assert.equal(REGROUP_RADIUS_METERS,12);
  assert.equal(w.snapshot(token(0)).squadRegroup,null);
  assert.equal(w.signal(token(0),'regroup').ok,true);
  let p=w.snapshot(token(1));
  assert.equal(p.squadRegroup.eligibleMembers,6);
  assert.equal(p.squadRegroup.arrived,6);
  assert.equal(p.squadRegroup.ready,true);
  // Only the authoritative server world moves its own actor in this fixture.
  const teammate=w.actors.get(token(2));
  teammate.x+=35;
  p=w.snapshot(token(1));
  assert.equal(p.squadRegroup.arrived,5);
  assert.equal(p.squadRegroup.ready,false);
  assert.equal(w.snapshot(token(6)).squadRegroup,null);
  assert.equal(w.snapshot(token(6)).squadSignal,null);
  assert.equal(JSON.stringify(p.squadRegroup).includes(token(2)),false);
  teammate.x-=35;
  assert.equal(w.snapshot(token(1)).squadRegroup.ready,true);
});
test('regroup reflects authenticated withdrawal and remains distinct from ordinary location signals',()=>{
  const w=world();
  assert.equal(w.signal(token(0),'location').ok,true);
  assert.equal(w.snapshot(token(1)).squadRegroup,null);
  for(let i=0;i<300;i++)w.step();
  assert.equal(w.signal(token(0),'regroup').ok,true);
  assert.equal(w.withdraw(token(5)).ok,true);
  const report=w.snapshot(token(2)).squadRegroup;
  assert.equal(report.eligibleMembers,5);
  assert.equal(report.arrived,5);
  assert.equal(report.ready,true);
  assert.equal(w.snapshot(token(5)).squadRegroup.ready,true);
  assert.equal(w.withdraw(token(0)).ok,true);
  assert.equal(w.snapshot(token(1)).squadRegroup,null,
    'withdrawal of the signal author invalidates the rendezvous immediately');
});
