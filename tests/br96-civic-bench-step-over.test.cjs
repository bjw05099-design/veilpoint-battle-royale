'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,STEP_OVER_TICKS,RADIUS}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const Street=require('../src/br96-street-view.js');
const token=i=>i.toString(16).padStart(64,'0');
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Participant '+i).ok,true);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
const lowBench=()=>({x:0,z:0,w:3.5,d:.7,h:.75,
 type:'aden-market-court-bench'});
function approach(w){
 const a=w.actors.get(token(0));
 a.x=0;a.z=2.0;
 assert.equal(Sim.blocked(a.x,a.z,RADIUS,w.obstacles),false);
 assert.equal(w.move(token(0),{dx:0,dz:-1,seq:1}).ok,true);
 return a;
}
test('server simulates a visible low public bench crossing for exactly 48 real 60Hz steps',()=>{
 const w=world(),bench=lowBench();w.obstacles.push(bench);
 const a=approach(w);
 assert.equal(STEP_OVER_TICKS,48);
 assert.equal(w.stepOver(token(0)).ok,true);
 assert.equal(w.snapshot(token(0)).self.stepOverProgress,0);
 assert.equal(w.snapshot(token(1)).squad[0].stepping,true);
 for(let i=0;i<24;i++)w.step();
 assert.ok(a.z<1&&a.z>-.9,'intermediate world location actually traverses the bench');
 assert.equal(w.snapshot(token(0)).self.stepOverProgress,.5);
 assert.ok(Sim.blocked(a.x,a.z,RADIUS,[bench]),
  'body is over the low furniture, not teleported to destination');
 for(let i=24;i<STEP_OVER_TICKS;i++)w.step();
 assert.equal(a.stepping,null);
 assert.ok(a.z<-1.35&&a.z>-2,'landing is across, not atop, the bench');
 assert.equal(Sim.blocked(a.x,a.z,RADIUS,w.obstacles),false);
 assert.equal(w.snapshot(token(0)).self.stepOverProgress,null);
});
test('malicious remote requests, high buildings, unoccupied space and busy physical landing cannot bypass collisions',()=>{
 const w=world(),a=w.actors.get(token(0));
 assert.throws(()=>w.stepOver('not-a-session'),/unknown_session/);
 a.x=0;a.z=2;w.move(token(0),{dx:0,dz:-1,seq:1});
 assert.equal(w.stepOver(token(0)).reason,'no_reachable_low_bench');
 const wall={...lowBench(),h:4,type:'building'};w.obstacles.push(wall);
 assert.equal(w.stepOver(token(0)).reason,'no_reachable_low_bench');
 w.obstacles.pop();
 const bench=lowBench();w.obstacles.push(bench);
 const other=w.actors.get(token(1));other.x=0;other.z=-1.5;
 assert.equal(w.stepOver(token(0)).reason,'no_reachable_low_bench',
  'occupied landing never causes the server to move another person');
 other.x=20;other.z=20;
 assert.equal(w.stepOver(token(0)).ok,true);
 assert.equal(w.stepOver(token(0)).reason,'busy');
 assert.equal(w.withdraw(token(0)).ok,true);
 assert.equal(w.actors.get(token(0)).stepping,null);
 assert.equal(w.snapshot(token(0)).self.stepOverProgress,null);
});
test('real collision with a second player interrupts the trajectory rather than granting a shortcut',()=>{
 const w=world(),bench=lowBench();w.obstacles.push(bench);
 const a=approach(w);assert.equal(w.stepOver(token(0)).ok,true);
 const other=w.actors.get(token(1));
 other.x=0;other.z=-.05; // person now occupies the eventual crossing corridor
 const start=a.z;
 for(let i=0;i<10;i++)w.step();
 assert.ok(a.z<start&&a.z>other.z+2*RADIUS-1e-8,
  'movement must stop at the real second capsule, never tunnel');
 assert.ok(w.snapshot(token(0)).self.stepOverProgress<10/STEP_OVER_TICKS,
  'blocking human pauses only the authorized physical trajectory');
 other.x=20;other.z=20;
 for(let i=0;i<STEP_OVER_TICKS;i++)w.step();
 assert.equal(a.stepping,null);
});
test('server-authored partial ascent is visible only in already permitted camera snapshots',()=>{
 const w=world(),bench=lowBench();w.obstacles.push(bench);
 approach(w);w.stepOver(token(0));
 for(let i=0;i<12;i++)w.step();
 const p=w.snapshot(token(0)).self;
 assert.ok(p.stepOverProgress>0&&p.stepOverProgress<1);
 const observed=Street.frame({subject:{id:999,x:0,z:5},yaw:0,obstacles:[],
  visible:[{id:p.id,x:p.x,z:p.z,stepOverProgress:p.stepOverProgress}]});
 assert.equal(observed.seen[0].stepOverProgress,p.stepOverProgress);
 const hidden=Street.frame({subject:{id:999,x:0,z:5},yaw:0,
  obstacles:[{x:0,z:3,w:4,d:1,type:'building'}],
  visible:[{id:p.id,x:p.x,z:p.z,stepOverProgress:p.stepOverProgress}]});
 assert.equal(hidden.seen.length,0);
 const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/key==='KeyG'&&active\(\)/);
 assert.match(client,/command\('\/step-over',\{\},null\)/);
 assert.doesNotMatch(client,/stepOverProgress\s*=/);
 const server=fs.readFileSync(path.resolve(__dirname,'../server/br-squad-server.cjs'),'utf8');
 assert.match(server,/invalid_step_over_request/);
 assert.match(server,/world\.stepOver\(token\)/);
});
