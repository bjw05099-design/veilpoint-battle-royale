'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby,ENTRY_CHOICES,SQUADS,SQUAD_SIZE}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=n=>n.toString(16).padStart(64,'0');
function fill(voting=false){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 if(voting){
  for(let i=0;i<4;i++)assert.equal(lobby.voteEntry(token(i),'promenade').ok,true);
  for(let i=4;i<6;i++)assert.equal(lobby.voteEntry(token(i),'lane').ok,true);
 }
 return lobby;
}
test('six humans vote on one physical walk-in sector, abstentions and ties never create phantom votes',()=>{
 const lobby=fill();
 assert.equal(SQUADS,16);assert.equal(SQUAD_SIZE,6);
 assert.deepEqual(lobby.squadEntry(0),{choice:'block',tally:{block:0,promenade:0,lane:0}});
 for(let i=0;i<2;i++)assert.equal(lobby.voteEntry(token(i),'promenade').ok,true);
 for(let i=2;i<4;i++)assert.equal(lobby.voteEntry(token(i),'lane').ok,true);
 assert.equal(lobby.squadEntry(0).choice,'promenade','stable tie priority without rigged votes');
 assert.deepEqual(lobby.squadEntry(0).tally,{block:0,promenade:2,lane:2});
 lobby.voteEntry(token(2),'block');
 assert.deepEqual(lobby.squadEntry(0).tally,{block:1,promenade:2,lane:1});
 const self=lobby.snapshot(token(0));
 assert.equal(self.self.entryChoice,'promenade');
 assert.equal(self.entry.options.length,3);
 assert.deepEqual(self.entry.tally,{block:1,promenade:2,lane:1});
 assert.equal(JSON.stringify(self).includes(token(6)),false,'another squad token must never leak');
 assert.equal(lobby.ready(token(0),true).ok,true);
 assert.deepEqual(lobby.voteEntry(token(0),'lane'),{ok:false,reason:'unready_to_vote'});
 lobby.ready(token(0),false);
 assert.equal(lobby.voteEntry(token(0),'lane').ok,true);
 assert.deepEqual(lobby.squadEntry(0).tally,{block:1,promenade:1,lane:2});
 assert.equal(lobby.leave(token(0)).ok,true);
 assert.deepEqual(lobby.squadEntry(0).tally,{block:1,promenade:0,lane:2},
  'departed player vote cannot survive a vacant real seat');
 assert.throws(()=>lobby.voteEntry(token(6),'distant-rooftop'),/invalid_entry_choice/);
 assert.throws(()=>lobby.voteEntry('f'.repeat(64),'block'),/unknown_session/);
 assert.throws(()=>lobby.squadEntry(16),/invalid_squad/);
});
test('all 96 ready bodies actually spawn in their own voted neighborhood and never overlap solid walls',()=>{
 const voted=fill(true),base=fill();
 for(let i=0;i<96;i++){voted.ready(token(i),true);base.ready(token(i),true);}
 assert.equal(voted.phase,'roster_locked');
 const a=new BrSquadWorld(voted),b=new BrSquadWorld(base);
 assert.equal(a.actors.size,96);assert.equal(b.actors.size,96);
 assert.equal(a.entryPlans[0],'promenade');
 assert.equal(a.entryPlans[1],'block');
 assert.equal(a.snapshot(token(0)).squadEntry,'promenade');
 assert.equal(a.snapshot(token(6)).squadEntry,'block');
 assert.equal(a.snapshot(token(0)).self.squad,undefined,'never replace server identity with arbitrary client team data');
 const p=a.actors.get(token(0)),old=b.actors.get(token(0));
 assert.ok(Math.hypot(p.x-old.x,p.z-old.z)>5,'the voted district changes real initial location');
 for(let team=0;team<16;team++){
  const me=token(team*6);
  if(team!==0)assert.deepEqual(
    [a.actors.get(me).x,a.actors.get(me).z],
    [b.actors.get(me).x,b.actors.get(me).z],
    'other squads must not be teleported by a rival vote');
 }
 const positions=[...a.actors.values()];
 for(const player of positions){
  assert.equal(Sim.blocked(player.x,player.z,.85,a.obstacles),false,'real physical spawn cannot be inside building');
 }
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)
  assert.ok(Math.hypot(positions[i].x-positions[j].x,positions[i].z-positions[j].z)>=1.7,
    'no overlap across all 96 humans');
 assert.deepEqual(ENTRY_CHOICES.promenade,{dx:8,dz:0,label:'공공 해안 보행로'});
 assert.deepEqual(voted.voteEntry(token(0),'lane'),{ok:false,reason:'roster_locked'});
 const before=a.actors.get(token(0));
 a.rebindSession(token(0),token(1001));
 assert.equal(a.actors.get(token(1001)),before);
 assert.equal(a.snapshot(token(1001)).squadEntry,'promenade');
});
