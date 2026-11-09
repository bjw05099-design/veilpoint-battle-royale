'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld,STEP,SHUTTLE_SPEED,RADIUS}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const fs=require('node:fs'),path=require('node:path');
const token=i=>i.toString(16).padStart(64,'0');

function game(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
function bringToVehicle(world,who=token(0)){
 const a=world.actors.get(who),b=world.shuttle.body;
 // The fixture places a person on a real public sidewalk, never inside
 // the shuttle and never as an input-supplied teleport via HTTP.
 const options=[[b.x+b.w/2+1.25,b.z],[b.x-b.w/2-1.25,b.z],
  [b.x,b.z+b.d/2+1.4],[b.x,b.z-b.d/2-1.4]];
 const pos=options.find(([x,z])=>!Sim.blocked(x,z,RADIUS,world.obstacles)&&
  ![...world.actors.values()].some(o=>o!==a&&o.eligible&&
    Math.hypot(o.x-x,o.z-z)<2*RADIUS+.1));
 assert.ok(pos,'public vehicle has a reachable outside pedestrian side');
 [a.x,a.z]=pos;a.direction={x:0,z:0};return a;
}
test('one real human boards a physically colliding public shuttle; others cannot occupy the same seat',()=>{
 const world=game(),who=token(0),rival=token(6);
 const body=world.shuttle.body;
 assert.equal(body.routeId,'br-yard-shuttle');
 assert.deepEqual([body.x,body.z],[Sim.YARD_SHUTTLE.x,Sim.YARD_SHUTTLE.z]);
 assert.equal(world.operateShuttle(who).reason,'out_of_reach');
 const actor=bringToVehicle(world),start={x:actor.x,z:actor.z};
 const boarding=world.operateShuttle(who);
 assert.equal(boarding.action,'enter');
 assert.equal(world.shuttle.driver,actor);
 assert.equal(world.snapshot(who).self.driving,true);
 assert.deepEqual([actor.x,actor.z],[body.x,body.z]);
 assert.ok(Math.hypot(actor.x-start.x,actor.z-start.z)<4.2);
 assert.equal(world.operateShuttle(rival).reason,'out_of_reach');
 const passenger=bringToVehicle(world,rival);
 assert.equal(world.operateShuttle(rival).reason,'occupied');
 assert.equal(world.snapshot(rival).self.driving,false);
 assert.equal(world.shuttle.driver,actor);
 assert.ok(passenger.eligible);
});
test('only accepted 60Hz directional input drives the finite-fuel body, with live human collision and no client world coordinates',()=>{
 const world=game(),who=token(0);
 const actor=bringToVehicle(world);
 assert.equal(world.operateShuttle(who).action,'enter');
 const b=world.shuttle.body,origin={x:b.x,z:b.z},fuel=world.shuttle.fuel;
 const headings=[[1,0],[-1,0],[0,1],[0,-1]];
 let moved=false,heading=null;
 for(const [dx,dz] of headings){
  assert.equal(world.move(who,{dx,dz,seq:world.tick+world.actors.get(who).seq+1}).ok,true);
  const before={x:b.x,z:b.z};
  for(let i=0;i<45;i++)world.step();
  if(Math.hypot(b.x-before.x,b.z-before.z)>.05){moved=true;heading={dx,dz};break;}
 }
 assert.equal(moved,true,'the authored service yard permits actual low-speed movement');
 const traveled=Math.hypot(b.x-origin.x,b.z-origin.z);
 assert.ok(traveled>0&&traveled<SHUTTLE_SPEED*4+.3);
 assert.ok(world.shuttle.fuel<fuel&&world.shuttle.fuel>=0);
 assert.equal(world.snapshot(who).self.x,b.x);
 assert.equal(world.snapshot(who).self.z,b.z);
 const parked=world.snapshot(who).shuttle;
 assert.equal(parked.ownDriver,true);
 assert.ok(parked.fuel<fuel);
 assert.equal(world.snapshot(token(30)).shuttle?.fuel??null,null,
  'distant unrelated squad cannot read vehicle driver fuel');
 // A real other human standing immediately in front of the moving body
 // blocks the next swept box; it cannot be pushed or injured by this vehicle.
 const bystander=world.actors.get(token(1));
 const n={x:b.x+heading.dx*.25,z:b.z+heading.dz*.25};
 bystander.x=n.x+(heading.dz?2.4:0);bystander.z=n.z+(heading.dx?2.4:0);
 const p={x:b.x,z:b.z},other={x:bystander.x,z:bystander.z};
 for(let i=0;i<60;i++)world.step();
 assert.deepEqual([bystander.x,bystander.z],[other.x,other.z]);
 assert.ok(Math.hypot(b.x-p.x,b.z-p.z)<.06,'occupied swept path halts shuttle');
 assert.equal(world.shuttle.speed,0);
 assert.equal(world.operateShuttle(who).action,'exit');
 assert.equal(world.snapshot(who).self.driving,false);
 assert.equal(world.shuttle.driver,null);
 assert.equal(Sim.blocked(actor.x,actor.z,RADIUS,world.obstacles),false);
});
test('reconnect retains the one real vehicle seat while withdrawn drivers release it and no ghost appears',()=>{
 const world=game(),who=token(0);bringToVehicle(world);
 assert.equal(world.operateShuttle(who).action,'enter');
 const fresh=token(1500);
 assert.equal(world.rebindSession(who,fresh).ok,true);
 assert.equal(world.snapshot(fresh).self.driving,true);
 assert.throws(()=>world.snapshot(who),/unknown_session/);
 assert.equal(world.withdraw(fresh).ok,true);
 assert.equal(world.shuttle.driver,null);
 assert.equal(world.shuttle.speed,0);
 assert.equal(world.snapshot(fresh).self.driving,false);
 assert.equal(world.operateShuttle(fresh).reason,'out_of_round');
});
test('BR96 client and server wire a local-only action: no fake coordinates, no leaked static ghost',async()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../br96.html'),'utf8');
 const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 const server=fs.readFileSync(path.resolve(__dirname,'../server/br-squad-server.cjs'),'utf8');
 assert.match(html,/id="shuttle" disabled/);
 assert.match(html,/#shuttle\{position:absolute/);
 assert.match(client,/command\('\/shuttle',\{\},null\)/);
 assert.match(client,/key==='KeyB'&&active\(\)/);
 assert.match(client,/el\('shuttle'\)\.addEventListener\('click',operateShuttle\)/);
 assert.match(server,/o\.routeId!=='br-yard-shuttle'/);
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen();
 try{
  const response=await fetch('http://127.0.0.1:'+addr.port+'/shuttle',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'
  });
  assert.notEqual(response.status,200,'anonymous user may not drive');
 }finally{await host.close();}
});
