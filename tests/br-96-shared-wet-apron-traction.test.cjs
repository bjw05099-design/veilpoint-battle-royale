'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,STEP,SPEED}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
function started(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
function isolated(){
 const world=started();
 // Deterministic physics fixture: remove peer collisions from two different
 // tested trajectories, not from the live production 96-person world.
 for(const [key,actor] of world.actors)if(key!==token(0)&&key!==token(6))actor.eligible=false;
 const wet=world.actors.get(token(0)),dry=world.actors.get(token(6));
 wet.x=30;wet.z=-43;dry.x=10;dry.z=0;
 assert.equal(Sim.blocked(wet.x,wet.z,.85,world.obstacles),false);
 assert.equal(Sim.blocked(dry.x,dry.z,.85,world.obstacles),false);
 return {world,wet,dry};
}
test('BR96 uses exactly the same coastal wet loading surface as offline BR, not a client movement claim',()=>{
 const {world,wet,dry}=isolated(),pad=Sim.WET_LOADING_PAD;
 assert.deepEqual([pad.x,pad.z,pad.width,pad.depth],[35,-40,14,18]);
 const before=world.snapshot(token(0));
 assert.deepEqual(before.self.surface,{wet:true,waveActive:false,mobility:pad.mobility});
 assert.deepEqual(world.snapshot(token(6)).self.surface,{wet:false,waveActive:false,mobility:1});
 assert.equal(world.move(token(0),{seq:1,dx:1,dz:0}).ok,true);
 assert.equal(world.move(token(6),{seq:1,dx:1,dz:0}).ok,true);
 for(let i=0;i<60;i++){
  // Real clients refresh input before the authoritative 45-tick lease expires.
  // Keep server lease protection: testing 60 unattended ticks would rightly
  // stop an unattended player rather than prove 60 seconds of wet traction.
  if(i===30){
   assert.equal(world.move(token(0),{seq:2,dx:1,dz:0}).ok,true);
   assert.equal(world.move(token(6),{seq:2,dx:1,dz:0}).ok,true);
  }
  world.step();
 }
 const travelWet=wet.x-30,travelDry=dry.x-10;
 assert.ok(travelWet>3&&travelWet<4.2,'wet mobility has finite, measured traversal');
 assert.ok(Math.abs(travelDry-SPEED*60*STEP)<.001,'dry terrain retains old 60Hz speed');
 assert.ok(Math.abs(travelWet-travelDry*pad.mobility)<.001,
  'server reduces wet-surface movement exactly as offline simulation');
 assert.equal(world.snapshot(token(6)).self.surface.mobility,1);
 assert.equal(world.snapshot(token(0)).self.surface.wet,true);
});
test('BR96 shallow periodic wave is server-tick-based, reversible and does not inflict artificial damage',()=>{
 const {world,wet,dry}=isolated();
 world.tick=12*60;
 const before=world.snapshot(token(0)).self.surface;
 assert.equal(before.waveActive,true);
 assert.ok(Math.abs(before.mobility-Sim.WET_LOADING_PAD.mobility*.78)<1e-4);
 assert.equal(world.snapshot(token(6)).self.surface.waveActive,false);
 world.move(token(0),{seq:1,dx:1,dz:0});
 world.move(token(6),{seq:1,dx:1,dz:0});
 for(let i=0;i<60;i++){
  // Real clients refresh input before the authoritative 45-tick lease expires.
  // Keep server lease protection: testing 60 unattended ticks would rightly
  // stop an unattended player rather than prove 60 seconds of wet traction.
  if(i===30){
   assert.equal(world.move(token(0),{seq:2,dx:1,dz:0}).ok,true);
   assert.equal(world.move(token(6),{seq:2,dx:1,dz:0}).ok,true);
  }
  world.step();
 }
 assert.ok(Math.abs((wet.x-30)-SPEED*Sim.WET_LOADING_PAD.mobility*.78)<.001);
 assert.ok(Math.abs((dry.x-10)-SPEED)<.001);
 world.tick=18*60;
 assert.equal(world.snapshot(token(0)).self.surface.waveActive,false);
 assert.equal(world.snapshot(token(0)).self.surface.mobility,Sim.WET_LOADING_PAD.mobility);
 assert.equal(world.snapshot(token(6)).self.surface.mobility,1);
 assert.equal(world.snapshot(token(0)).self.eligible,true);
});
test('BR96 public 2D surface is visible without granting private opponents or client-specified movement speed',()=>{
 const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 const host=fs.readFileSync(path.resolve(__dirname,'../server/br-squad-server.cjs'),'utf8');
 assert.match(client,/publicEnvironment\?\.wetLoadingPad/);
 assert.match(client,/\bctx\.fillRect\(x\(pad\.x-pad\.width\/2\)/);
 assert.match(client,/w\.self\.surface\?\.wet/);
 assert.match(client,/request\('\/world-geometry'\)/);
 assert.match(host,/environment:\{wetLoadingPad:\{x,z,width,depth\}\}/);
 assert.match(client,/for\(const rival of w\.visible\|\|\[\]\)/);
 assert.doesNotThrow(()=>new Function(client));
});
