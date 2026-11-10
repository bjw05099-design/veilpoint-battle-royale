'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
function localVehicleFixture(){
 const s=Story.createState();
 // A narrow, isolated physics fixture: no forged mission completion or
 // document interactions are used to activate the optional civilian van.
 s.phase='exit';s.choice='evacuation';s.combat.cleared=true;
 s.world.player.x=0;s.world.player.z=-54;
 s.transportContact=1;
 s.transportVan={z:-82,arrived:false,driverZ:-79.4};
 s.world.obstacles.push({x:10,z:-82,w:2.4,d:3.8,h:1.45,
   type:'story-civil-transport',routeId:'story-civil-transport'});
 return s;
}
test('CH01 moving local civilian van stops for its ACTUAL Kim Jiyoon companion before crossing his body',()=>{
 const s=localVehicleFixture();
 const before=s.transportVan.z;
 s.kimJiyoon.x=10;s.kimJiyoon.z=-80;
 assert.ok(!Sim.blocked(s.world.player.x,s.world.player.z,.85,
    s.world.obstacles.filter(o=>o.routeId==='story-civil-transport')));
 Story.step(s,1/60,{});
 assert.equal(s.transportVan.z,before,'a live pedestrian actually blocks the swept vehicle path');
 assert.equal(s.world.transportVan.z,before);
 assert.equal(s.world.transportVan.yielding,true);
 s.kimJiyoon.x=120;s.kimJiyoon.z=120;
 Story.step(s,1/60,{});
 assert.ok(s.transportVan.z>before,'the civilian driver resumes naturally on the next clear 60Hz tick');
 assert.equal(s.world.transportVan.yielding,false);
 assert.equal(s.transportContact,1,'moving van is not reported as passenger evacuation');
});
test('CH01 every ordinary on-foot civilian can stop transport without any new E/F task or five-second artificial pause',()=>{
 const s=localVehicleFixture(),start=s.transportVan.z;
 s.mara.x=10;s.mara.z=-80;s.mara.arrived=true;
 Story.step(s,1/60,{});
 assert.equal(s.transportVan.z,start,'market civilian occupies the public road');
 assert.equal(s.transportVan.pauseUntil,undefined,'automatic yielding does not invent a forced timer');
 s.mara.x=60;s.mara.z=60;
 Story.step(s,1/60,{});
 assert.ok(s.transportVan.z>start);
 assert.equal(s.world.transportVan.yielding,false);
});
test('real local vehicle collision remains sourced from authoritatively simulated actors',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const script=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
 assert.match(script,/function localPublicPedestrians\(state\)/);
 for(const role of ['state.world.player','state.worker','state.mara',
  'state.kimJiyoon','state.world.liaison','state.civilianWalker',
  'state.civicCrossing?.civilian'])
   assert.ok(script.includes(role));
 assert.match(script,/civilianVehiclePathClear\(state,sweep,body\)/);
 assert.match(script,/if\(clear&&\!\(v.pauseUntil>state.world.elapsed\)\)v.z=next/);
 assert.doesNotMatch(script,/https?:\/\/|window\.fetch\(/);
});
