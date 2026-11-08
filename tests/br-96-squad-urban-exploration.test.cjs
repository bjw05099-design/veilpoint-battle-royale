'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function launched(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Member '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('96-person BR civic exploration is earned by real 60Hz travel and only shared within the same squad',()=>{
 const world=launched();
 const publicHall=Sim.LANDMARKS.find(x=>x.label==='PUBLIC FERRY HALL');
 assert.ok(publicHall,'uses the same public urban landmarks as offline BR');
 const a=world.actors.get(token(0));
 a.x=publicHall.x;a.z=publicHall.z-9; // Server-side fixed test fixture, never a client operation.
 assert.equal(world.snapshot(token(0)).squadLandmarks.length,0);
 assert.equal(world.snapshot(token(1)).squadLandmarks.length,0);
 assert.equal(world.move(token(0),{dx:0,dz:1,seq:0}).ok,true);
 for(let t=0;t<28;t++)world.step();
 const mine=world.snapshot(token(0));
 assert.equal(mine.squadLandmarks.length,1);
 assert.equal(mine.squadLandmarks[0].label,'PUBLIC FERRY HALL');
 assert.equal(mine.self.landmarksVisited,1);
 assert.deepEqual(world.snapshot(token(1)).squadLandmarks,mine.squadLandmarks);
 assert.deepEqual(world.snapshot(token(6)).squadLandmarks,[]);
 assert.deepEqual(world.snapshot(token(95)).squadLandmarks,[]);
 assert.equal(JSON.stringify(mine.squadLandmarks).includes(token(0)),false);
});
test('landmark observation is line-of-sight checked, cannot be forged by movement commands, and survives session rotation',()=>{
 const world=launched();
 const a=world.actors.get(token(0));
 const hall=Sim.LANDMARKS[0];
 a.x=hall.x;a.z=hall.z-2;
 world.obstacles.push({x:hall.x,z:hall.z-1,w:20,d:.8,h:3,type:'test-wall'});
 world.step();
 assert.equal(world.snapshot(token(0)).squadLandmarks.length,0);
 world.obstacles.pop();
 world.step();
 assert.equal(world.snapshot(token(0)).squadLandmarks.length,1);
 assert.throws(()=>world.move(token(0),{dx:0,dz:0,seq:2,landmarkMask:15}),/invalid_movement/);
 const next=token(900);
 world.rebindSession(token(0),next);
 assert.equal(world.snapshot(next).self.landmarksVisited,1);
 assert.equal(world.snapshot(token(1)).squadLandmarks.length,1);
 assert.throws(()=>world.snapshot(token(0)),/unknown_session/);
});
