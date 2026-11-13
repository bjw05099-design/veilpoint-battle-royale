'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function fixture(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Tester '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby);world.obstacles=[];
 let n=0;for(const actor of world.actors.values()){
  actor.x=90+(n%12)*3;actor.z=90+Math.floor(n++/12)*3;
 }
 const shooter=world.actors.get(token(0)),target=world.actors.get(token(6));
 Object.assign(shooter,{x:0,z:0});Object.assign(target,{x:0,z:-20});
 return {world,shooter,target};
}
function ticks(w,n){for(let i=0;i<n;i++)w.step();}
const shot=seq=>({seq,yaw:0,pitch:0});
test('server computes hits, cadence and 96 independent private finite loadouts',()=>{
 const {world:w,shooter,target}=fixture();
 assert.deepEqual(w.fire(token(0),shot(1)),{ok:true});
 assert.equal(target.weapon.health,55);assert.equal(shooter.weapon.loaded,11);
 assert.equal(w.fire(token(0),shot(1)).reason,'stale_weapon_input');
 assert.equal(w.fire(token(0),shot(2)).reason,'cooldown');
 assert.equal(shooter.weapon.rounds,47);assert.equal(target.weapon.health,55);
 ticks(w,12);w.fire(token(0),shot(3));ticks(w,12);w.fire(token(0),shot(4));
 assert.equal(target.weapon.health,0);assert.equal(target.eligible,false);
 assert.equal(target.eliminationReason,'combat');
 assert.equal(w.snapshot(token(6)).squadTimeline[0].reason,'combat');
 assert.match(require('../src/br96-squad-panel.js').roster({
  squad:[{id:target.id,name:'Teammate'}],world:w.snapshot(token(6))}),/교전으로 탈락/);
 assert.equal(w.fire(token(6),shot(1)).reason,'out_of_round');
 assert.equal(w.reload(token(6),{seq:2}).reason,'out_of_round');
 const view=w.snapshot(token(0));
 assert.equal(view.self.weapon.loaded,9);
 assert.ok(view.squad.every(p=>p.weapon===undefined&&p.health===undefined));
 assert.ok(view.visible.every(p=>p.weapon===undefined&&p.health===undefined));
 assert.equal(w.actors.get(token(1)).weapon.rounds,48);
});
test('empty magazine requires a server-timed reload without regenerating rounds',()=>{
 const {world:w,shooter}=fixture();
 for(let i=0;i<12;i++){assert.equal(w.fire(token(0),{seq:i,yaw:Math.PI/2,pitch:0}).ok,true);ticks(w,12);}
 assert.equal(shooter.weapon.loaded,0);assert.equal(shooter.weapon.rounds,36);
 assert.equal(w.fire(token(0),shot(12)).reason,'reload_required');
 assert.equal(w.reload(token(0),{seq:13}).ok,true);
 assert.equal(w.fire(token(0),shot(14)).reason,'reloading');
 ticks(w,107);assert.equal(shooter.weapon.loaded,0);
 ticks(w,1);assert.equal(shooter.weapon.loaded,12);assert.equal(shooter.weapon.rounds,36);
 assert.equal(w.snapshot(token(0)).self.weapon.reserve,24);
 const replacement=token(200);
 w.rebindSession(token(0),replacement);
 assert.throws(()=>w.fire(token(0),shot(15)),/unknown_session/);
 assert.equal(w.fire(replacement,shot(14)).reason,'stale_weapon_input');
 assert.equal(w.fire(replacement,shot(15)).ok,true);
 assert.equal(shooter.weapon.rounds,35);
});
test('walls, low cover, crouch and friendly bodies constrain actual shot geometry',()=>{
 for(const [height,crouch,expected] of [[3,false,100],[1.3,false,55],[1.3,true,100]]){
  const {world:w,shooter,target}=fixture();
  w.obstacles=[{x:0,z:-10,w:8,d:.05,h:height}];shooter.crouchHeld=crouch;
  assert.equal(w.fire(token(0),shot(1)).ok,true);assert.equal(target.weapon.health,expected);
 }
 const {world:w,target}=fixture(),friend=w.actors.get(token(1));
 Object.assign(friend,{x:0,z:-5});
 w.fire(token(0),shot(1));assert.equal(target.weapon.health,100);
 assert.equal(friend.weapon.health,100,'friendly-fire disabled, body still stops the round');
});
test('forged target/damage/timing, nonfinite aim, stale sequence and busy hands are rejected',()=>{
 const {world:w,shooter}=fixture();
 for(const command of [null,[],{...shot(1),target:6},{...shot(1),damage:100},
  {...shot(1),tick:900},{...shot(1),pitch:NaN},{...shot(1),pitch:.45},
  {...shot(1),yaw:Infinity},{...shot(1),seq:-1}]){
  assert.throws(()=>w.fire(token(0),command),/invalid_weapon_command/);
 }
 assert.equal(shooter.weapon.loaded,12);assert.equal(shooter.weapon.seq,-1);
 shooter.benchResting=true;
 assert.equal(w.fire(token(0),shot(1)).reason,'hands_busy');
 assert.equal(shooter.weapon.loaded,12);
});
test('real combat retirement settles last-squad placement and remains frozen',()=>{
 const {world:w,shooter}=fixture();
 for(let i=12;i<96;i++)w.withdraw(token(i));
 let seq=0;
 for(let i=6;i<12;i++){
  const target=w.actors.get(token(i));Object.assign(target,{x:0,z:-10});
  target.weapon.health=45;
  assert.equal(w.fire(token(0),shot(++seq)).ok,true);
  assert.equal(target.eligible,false);if(i<11)ticks(w,12);
 }
 assert.equal(w.phase,'finished');assert.equal(w.placements[0],1);assert.equal(w.placements[1],2);
 const finished=JSON.stringify(w.snapshot(token(0))),rounds=shooter.weapon.rounds;
 w.step();assert.equal(w.fire(token(0),shot(++seq)).reason,'out_of_round');
 assert.equal(JSON.stringify(w.snapshot(token(0))),finished);assert.equal(shooter.weapon.rounds,rounds);
});
