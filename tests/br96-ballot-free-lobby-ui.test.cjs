'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const root=path.resolve(__dirname,'..');
const token=i=>i.toString(16).padStart(64,'0');

test('BR96 PC lobby no longer requires a squad entry ballot or gathering vote',()=>{
  const html=fs.readFileSync(path.join(root,'br96.html'),'utf8');
  const client=fs.readFileSync(path.join(root,'src/br96-client.js'),'utf8');
  assert.match(html,/id="entryVote"[^>]*hidden[^>]*aria-hidden="true"[^>]*style="display:none"/);
  assert.match(html,/id="entryInfo"[^>]*>[^<]*서버가 분대별로 지정/);
  assert.match(client,/서버가 실제 출발 위치를 지정합니다/);
  assert.doesNotMatch(client,/득표/);
  // Historical API remains present for older browser clients; it is not a
  // required operation for the new PC match and no save format is touched.
  assert.match(client,/async function voteEntry\(\)/);
});

test('96 actual human seats launch with no entry votes; server owns collision-safe default entry',()=>{
  const lobby=new BrSquadLobby();
  for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Member '+i).ok,true);
  for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
  assert.equal(lobby.phase,'roster_locked');
  for(let team=0;team<16;team++)
    assert.deepEqual(lobby.squadEntry(team).tally,{block:0,promenade:0,lane:0});
  const world=new BrSquadWorld(lobby);
  assert.equal(world.actors.size,96);
  assert.equal(world.snapshot(token(0)).squadEntry,'block');
  assert.equal(world.snapshot(token(95)).squadEntry,'block');
  const physical=[...world.actors.values()];
  for(const actor of physical)assert.equal(
    require('../src/simulation.js').blocked(actor.x,actor.z,.85,world.obstacles),false);
  assert.equal(new Set(physical.map(actor=>actor.id)).size,96);
  assert.equal(world.snapshot(token(0)).self.squad,1);
  assert.equal(world.snapshot(token(95)).self.squad,16);
});