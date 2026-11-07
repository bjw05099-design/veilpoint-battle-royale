'use strict';
// Deterministic, engine-independent ground vehicle controller for the PC prototype.
// Distances are metres, speeds m/s, dt seconds. No teleportation or auto-navigation.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.VeilpointVehicle=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 const LENGTH=4.4,WIDTH=1.9,MAX_SPEED=12,REVERSE_SPEED=3.5;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function create(x,z,yaw=0){
  if(![x,z,yaw].every(Number.isFinite))throw new RangeError('Invalid vehicle spawn');
  return {x,z,yaw,speed:0,occupied:false,engineOn:false};
 }
 function validate(v){
  if(!v||![v.x,v.z,v.yaw,v.speed].every(Number.isFinite)||
    typeof v.occupied!=='boolean'||typeof v.engineOn!=='boolean'||
    v.speed < -REVERSE_SPEED-1e-6||v.speed>MAX_SPEED+1e-6)
    throw new RangeError('Invalid vehicle state');
  return v;
 }
 function enter(v,actor,blocked){
  validate(v);
  if(v.occupied)return false;
  if(Math.hypot(v.x-actor.x,v.z-actor.z)>2.8||blocked(v.x,v.z))return false;
  v.occupied=true;return true;
 }
 function exit(v,blocked){
  validate(v);
  if(!v.occupied||Math.abs(v.speed)>.15)return null;
  for(const [dx,dz] of [[-2.2,0],[2.2,0],[0,-3]]){
   const x=v.x+dx*Math.cos(v.yaw)+dz*Math.sin(v.yaw);
   const z=v.z-dx*Math.sin(v.yaw)+dz*Math.cos(v.yaw);
   if(!blocked(x,z)){v.occupied=false;v.engineOn=false;return {x,z};}
  }
  return null;
 }
 function tick(v,input,dt,collides){
  validate(v);
  if(!Number.isFinite(dt)||dt<=0||dt>0.05)throw new RangeError('Invalid vehicle timestep');
  if(!v.occupied)return v;
  if(input.toggleEngine)v.engineOn=!v.engineOn;
  const throttle=v.engineOn?clamp(Number(input.throttle)||0,-1,1):0;
  const brake=clamp(Number(input.brake)||0,0,1);
  const resistance=v.speed===0?0:Math.sign(v.speed)*(.65+brake*9)*dt;
  const acceleration=throttle*(v.speed<0?2.5:3.2)*dt;
  let next=clamp(v.speed+acceleration,-REVERSE_SPEED,MAX_SPEED);
  if(Math.abs(next)<=Math.abs(resistance))next=0;
  else next-=resistance;
  const steering=clamp(Number(input.steer)||0,-1,1);
  const yaw=v.yaw+steering*clamp(next/6,-1,1)*.52*dt;
  const x=v.x+Math.sin(yaw)*next*dt,z=v.z-Math.cos(yaw)*next*dt;
  // Swept collision is delegated to the caller's world; do not penetrate a wall.
  if(collides({x,z,yaw,length:LENGTH,width:WIDTH},v)){
   v.speed=0;return v;
  }
  Object.assign(v,{x,z,yaw,speed:next});
  return v;
 }
 function snapshot(v){return JSON.stringify(validate(v));}
 function restore(raw){
  const data=typeof raw==='string'?JSON.parse(raw):raw;
  if(!data||Object.keys(data).sort().join(',')!=='engineOn,occupied,speed,x,yaw,z')
   throw new RangeError('Invalid vehicle checkpoint shape');
  return {...validate(data)};
 }
 return Object.freeze({create,enter,exit,tick,snapshot,restore,LENGTH,WIDTH,MAX_SPEED});
});