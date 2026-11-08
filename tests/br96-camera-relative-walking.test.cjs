'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Street=require('../src/br96-street-view.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
test('first-person WASD is relative to the player's voluntary camera yaw, not world-fixed keys',()=>{
 assert.deepEqual(Street.relativeMovement(0,-1,0),{dx:0,dz:-1});
 const east=Street.relativeMovement(0,-1,Math.PI/2);
 assert.ok(Math.abs(east.dx-1)<1e-9);assert.equal(east.dz,0);
 const west=Street.relativeMovement(0,-1,-Math.PI/2);
 assert.ok(Math.abs(west.dx+1)<1e-9);assert.equal(west.dz,0);
 const south=Street.relativeMovement(0,-1,Math.PI);
 assert.ok(Math.abs(south.dx)<1e-9);
 assert.ok(Math.abs(south.dz-1)<1e-9);
 const right=Street.relativeMovement(1,0,Math.PI/2);
 assert.ok(Math.abs(right.dz-1)<1e-9);
 assert.throws(()=>Street.relativeMovement(2,0,0),/invalid_camera_movement/);
 assert.throws(()=>Street.relativeMovement(0,-1,Infinity),/invalid_camera_movement/);
});
test('server receives only normalized walking directions and resolves camera-relative intent in real 60Hz world',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby),t=token(0),p=world.actors.get(t);
 p.x=0;p.z=0;
 const first={x:p.x,z:p.z};
 // Local view rotation cannot move the real actor by itself.
 Street.wrap(Math.PI/2);
 world.step();
 assert.deepEqual({x:p.x,z:p.z},first);
 const intent=Street.relativeMovement(0,-1,Math.PI/2);
 assert.equal(world.move(t,{...intent,seq:0}).ok,true);
 for(let i=0;i<10;i++)world.step();
 assert.ok(p.x>first.x,'local east-facing W makes the server advance east');
 assert.ok(Math.abs(p.z-first.z)<1e-8,'W did not retain the old fixed north axis');
 assert.equal(world.snapshot(t).self.x,p.x);
 assert.equal(world.snapshot(t).self.z,p.z);
});
test('client first-person pointer controls are non-authoritative and keyboard remains available',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/canvas\.requestPointerLock\?\.\(\)/);
 assert.match(client,/document\.pointerLockElement===canvas/);
 assert.match(client,/relativeMovement\(intent\.dx,intent\.dz,streetYaw\)/);
 assert.match(client,/\['KeyJ','KeyL'\]/);
 assert.match(client,/document\.exitPointerLock\?\.\(\)/);
 assert.doesNotMatch(client,/request\('\/move',[^)]*streetYaw/);
});
