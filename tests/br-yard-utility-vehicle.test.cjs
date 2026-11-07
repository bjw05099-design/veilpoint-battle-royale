'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Sim=require('../src/simulation.js');

function ready(seed=20261107){
 const g=Sim.newMatch(seed,1);
 g.status='playing';return g;
}
function approach(g){
 const v=g.vehicle,p=g.player;
 p.x=v.x-Math.cos(v.yaw)*2.65;
 p.z=v.z-Math.sin(v.yaw)*2.65;
}
test('one real BR port utility truck enters locally and drives by 60Hz input',()=>{
 const g=ready();
 assert.deepEqual(Object.keys(g.vehicle).sort(),['driver','fuel','speed','x','yaw','z']);
 assert.equal(g.vehicle.driver,false);
 assert.equal(Sim.blocked(g.vehicle.x,g.vehicle.z,.85,g.obstacles),true);
 assert.deepEqual(Sim.operateYardShuttle(g),{ok:false,reason:'out_of_reach'});
 approach(g);
 assert.equal(Sim.shuttleStatus(g).near,true);
 assert.deepEqual(Sim.operateYardShuttle(g),{ok:true,event:'enter'});
 assert.equal(g.vehicle.driver,true);
 assert.equal(g.player.x,g.vehicle.x);
 assert.equal(g.player.z,g.vehicle.z);
 assert.equal(Sim.tag(g).reason,'vehicle_controls_active',
  'driver controls cannot be mixed with on-foot equipment interaction');
 assert.equal(Sim.reload(g).reason,'vehicle_controls_active');
 const initial={x:g.vehicle.x,z:g.vehicle.z,yaw:g.vehicle.yaw,fuel:g.vehicle.fuel};
 for(let i=0;i<70;i++)Sim.tick(g,1/60,{forward:true});
 assert.ok(g.vehicle.x>initial.x+.5,'the actual vehicle moved across the road');
 assert.equal(g.vehicle.z,initial.z);
 assert.ok(g.vehicle.fuel<initial.fuel,'distance consumes a finite fuel reserve');
 assert.ok(g.vehicle.speed>0 && g.vehicle.speed<Sim.YARD_SHUTTLE.forwardSpeed);
 assert.equal(g.player.x,g.vehicle.x);
 assert.equal(g.player.z,g.vehicle.z);
 assert.deepEqual(Sim.operateYardShuttle(g),{ok:false,reason:'vehicle_moving'},
  'door cannot be opened from a moving vehicle');
 for(let i=0;i<100;i++)Sim.tick(g,1/60,{});
 assert.equal(g.vehicle.speed,0);
 assert.deepEqual(Sim.operateYardShuttle(g),{ok:true,event:'exit'});
 assert.equal(g.vehicle.driver,false);
 assert.equal(g.vehicle.speed,0);
 assert.equal(Sim.blocked(g.player.x,g.player.z,.85,g.obstacles),false);
});
test('steering turns vehicle and world collider together without instant lateral relocation',()=>{
 const g=ready(20261108);approach(g);
 Sim.operateYardShuttle(g);
 for(let i=0;i<55;i++)Sim.tick(g,1/60,{forward:true,right:true});
 const v=g.vehicle,body=g.obstacles.find(o=>o.routeId==='br-yard-shuttle');
 assert.ok(Math.abs(v.yaw-Sim.YARD_SHUTTLE.yaw)>.03);
 assert.ok(Math.abs(v.z)>.03,'steering changes the physically traversed path');
 assert.equal(body.x,v.x);
 assert.equal(body.z,v.z);
 const c=Math.abs(Math.cos(v.yaw)),s=Math.abs(Math.sin(v.yaw));
 assert.ok(Math.abs(body.w-(Sim.YARD_SHUTTLE.w*c+Sim.YARD_SHUTTLE.d*s))<1e-9);
 assert.ok(Math.abs(body.d-(Sim.YARD_SHUTTLE.w*s+Sim.YARD_SHUTTLE.d*c))<1e-9);
});
test('vehicle stops at architectural collision and retains actual last position',()=>{
 const g=ready(20261109);approach(g);Sim.operateYardShuttle(g);
 g.obstacles.push({x:26,z:g.vehicle.z,w:1,d:5,h:2,type:'test-building'});
 const initial=g.vehicle.x;
 for(let i=0;i<120;i++)Sim.tick(g,1/60,{forward:true});
 assert.ok(g.vehicle.x>initial,'truck should reach the wall');
 assert.ok(g.vehicle.x<24.2,'truck must not pass the solid road barrier');
 assert.equal(g.vehicle.speed,0,'collision stops motion rather than clipping through');
 assert.equal(g.player.x,g.vehicle.x);
});
test('utility vehicle saves and restores its actual heading, fuel, driver and collider',()=>{
 const g=ready(20261110);approach(g);Sim.operateYardShuttle(g);
 for(let i=0;i<40;i++)Sim.tick(g,1/60,{forward:true,right:true});
 const saved=Sim.snapshotMatch(g),r=Sim.restoreMatch(saved);
 assert.deepEqual(r.vehicle,g.vehicle);
 assert.equal(r.player.x,r.vehicle.x);
 assert.equal(r.player.z,r.vehicle.z);
 assert.equal(r.obstacles.find(o=>o.routeId==='br-yard-shuttle').x,r.vehicle.x);
 assert.equal(Sim.snapshotMatch(r),saved);
 const forged=JSON.parse(saved);forged.vehicle.fuel=10e6;
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(forged)),/vehicle/i);
 forged.vehicle.fuel=g.vehicle.fuel;forged.vehicle.driver=false;
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(forged)),/vehicle|collision/i);
});
test('legacy BR checkpoints do not receive a truck in an already occupied world',()=>{
 const g=ready(20261111);
 const old=JSON.parse(Sim.snapshotMatch(g));delete old.vehicle;
 const restored=Sim.restoreMatch(JSON.stringify(old));
 assert.equal(restored.vehicle,null);
 assert.equal(restored.obstacles.some(o=>o.routeId==='br-yard-shuttle'),false);
 const Story=require('../src/story-slice.js');
 assert.equal(Story.createState().world.obstacles.some(o=>o.routeId==='br-yard-shuttle'),false,
  'the native CH01 route is not invaded by a BR-only vehicle');
});
test('both PC renderer paths and live keyboard/HUD use the same service vehicle',()=>{
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 const visibility=fs.readFileSync(path.resolve(__dirname,'../src/visibility.js'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(renderer,/boxYaw\(x,y,z,w,h,d,yaw,col\)/);
 assert.match(renderer,/for\(const v of plan\.vehicles\|\|\[\]\)/);
 assert.match(renderer,/routeId==='br-yard-shuttle'/);
 assert.match(renderer,/type:o\.type==='yard-service-vehicle'/);
 assert.match(visibility,/vehicles\.push\(state\.vehicle\);boxes\+=10/);
 assert.match(app,/Game\.operateYardShuttle\(simulation\)/);
 assert.match(app,/Game\.shuttleStatus\(s\)/);
 assert.match(app,/W\/S DRIVE/);
});
