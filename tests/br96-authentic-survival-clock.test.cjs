'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,BOUNDARY_GRACE_TICKS}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function round(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Participant '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96 real server bodies each own a fixed-tick survival clock; withdrawing freezes only that human',()=>{
 const world=round(),viewer=token(0),mate=token(1),other=token(6);
 for(let i=0;i<95;i++)world.step();
 assert.equal(world.snapshot(viewer).self.survivalTicks,95);
 assert.equal(world.snapshot(viewer).squad.find(a=>a.slot===2).survivalTicks,95);
 assert.equal(world.withdraw(viewer).ok,true);
 for(let i=0;i<100;i++)world.step();
 const mine=world.snapshot(viewer);
 assert.equal(mine.self.survivalTicks,95,'survival time cannot grow after personal retirement');
 assert.equal(mine.squad.find(a=>a.slot===2).survivalTicks,195);
 assert.equal(world.snapshot(mate).squad.find(a=>a.slot===1).survivalTicks,95);
 assert.equal(world.snapshot(other).self.survivalTicks,195);
 assert.equal(world.snapshot(other).squad.some(p=>p.id===world.actors.get(viewer).id),false,
   'another squad must not receive an eliminated rival member timeline');
 assert.equal(mine.self.placement,null,'a single human retiring is not a team placement');
 assert.equal(world.phase,'moving');
});
test('boundary retirement is recorded on exact 60Hz expiry tick, not inferred from client clock',()=>{
 const world=round(),t=token(0),p=world.actors.get(t);
 for(let i=0;i<70;i++)world.step();
 p.x=175;p.z=175;
 p.outsideStreakTicks=BOUNDARY_GRACE_TICKS-1;
 world.step();
 assert.equal(p.eligible,false);
 assert.equal(p.eliminatedAtTick,71);
 assert.equal(world.snapshot(t).self.survivalTicks,71);
 for(let i=0;i<140;i++)world.step();
 assert.equal(world.snapshot(t).self.survivalTicks,71);
 assert.equal(world.snapshot(t).self.placement,null);
});
test('a new authenticated session preserves the same human survival history without resetting the clock',()=>{
 const world=round(),old=token(0),next='e'.repeat(64);
 for(let i=0;i<67;i++)world.step();
 assert.equal(world.rebindSession(old,next).ok,true);
 assert.equal(world.snapshot(next).self.survivalTicks,67);
 assert.throws(()=>world.snapshot(old),/unknown_session/);
 assert.equal(world.withdraw(next).ok,true);
 for(let i=0;i<88;i++)world.step();
 assert.equal(world.snapshot(next).self.survivalTicks,67);
});
test('real PC HUD shows only server measured survival ticks, not a client-authored match clock',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/Math\.floor\(\(w\.self\.survivalTicks\|\|0\)\/60\)/);
 assert.doesNotMatch(client,/Date\.now\(\).*survivalTicks/);
});
