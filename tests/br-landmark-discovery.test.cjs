'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const live=(site='ferry')=>{
 const s=Sim.newMatch(641,1,'carbine',false,site,'day',1);
 s.status='playing';
 return s;
};
test('BR public landmark is discovered only when player physically reaches the entrance',()=>{
 const s=live();
 assert.equal(s.landmarkMask,0);
 assert.deepEqual(Sim.visitedLandmarks(s),[]);
 const landmark=Sim.LANDMARKS[0];
 assert.equal(Sim.blocked(landmark.x,landmark.z,.85,s.obstacles),false);
 Sim.tick(s,1/60,{});
 assert.equal(s.landmarkMask,1,'starting at the public ferry hall earns just that visit');
 assert.deepEqual(Sim.visitedLandmarks(s).map(x=>x.label),['PUBLIC FERRY HALL']);
 for(let i=0;i<100;i++)Sim.tick(s,1/60,{});
 assert.equal(s.landmarkMask,1,'distant places must not appear merely as time advances');
 const before=s.landmarkMask;
 Sim.tick(s,0,{forward:true});Sim.tick(s,NaN,{forward:true});
 assert.equal(s.landmarkMask,before,'a paused or invalid frame cannot grant discovery');
});
test('real visits persist across save/restore without exposing the other locations',()=>{
 const s=live();
 Sim.tick(s,1/60,{});
 const saved=Sim.snapshotMatch(s);
 const restored=Sim.restoreMatch(saved);
 assert.equal(Sim.snapshotMatch(restored),saved);
 assert.equal(restored.landmarkMask,1);
 assert.equal(Sim.visitedLandmarks(restored).length,1);
 const old=JSON.parse(saved);delete old.landmarkMask;
 const legacy=Sim.restoreMatch(JSON.stringify(old));
 assert.equal(legacy.landmarkMask,0,'older checkpoints lack discovery history');
 const arbitrary=JSON.parse(saved);arbitrary.landmarkMask=1<<Sim.LANDMARKS.length;
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(arbitrary)),RangeError);
 arbitrary.landmarkMask=-1;
 assert.throws(()=>Sim.restoreMatch(JSON.stringify(arbitrary)),RangeError);
 s.landmarkMask=33;
 assert.throws(()=>Sim.snapshotMatch(s),RangeError,'writer must reject illegal progress');
});
test('discovery uses local player sight, not positions of rivals or remote map clicks',()=>{
 const s=live();
 // A player located far outside the ferry district learns nothing about it.
 s.player.x=0;s.player.z=0;
 s.bots[0].x=Sim.LANDMARKS[0].x;s.bots[0].z=Sim.LANDMARKS[0].z;
 Sim.discoverLandmarks(s);
 assert.equal(s.landmarkMask,0,'opponents cannot reveal public map locations');
 assert.equal(Sim.discoverLandmarks(s),0);
 s.player.x=Sim.LANDMARKS[0].x;s.player.z=Sim.LANDMARKS[0].z;
 assert.equal(Sim.discoverLandmarks(s),1);
 assert.equal(Sim.discoverLandmarks(s),0,'revisiting is idempotent');
});
test('real PC minimap shows only earned public locations, not every landmark upfront',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/for\(const site of Game\.visitedLandmarks\(simulation\)\)/);
 assert.ok(app.includes("' · VISITED '+Game.visitedLandmarks(s).length"));
 assert.doesNotMatch(app,/for\(const site of Game\.LANDMARKS\)/);
});
