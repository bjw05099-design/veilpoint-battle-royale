'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Nav=require('../src/navigation.js');
const Sim=require('../src/simulation.js');

test('BR nearest safe-zone interior entry is finite, read-only and inside the published radius',()=>{
 const player={x:0,z:80,yaw:0},zone={x:0,z:0,radius:50};
 const original=JSON.stringify({player,zone});
 const marker=Nav.zoneEntry(player,zone,[]);
 assert.ok(marker&&Object.isFrozen(marker));
 assert.ok(Math.abs(marker.x)<1e-8);
 assert.ok(Math.abs(marker.z-49.15)<1e-7);
 assert.equal(marker.straightLineBlocked,false);
 assert.ok(Math.hypot(marker.x-zone.x,marker.z-zone.z)<zone.radius);
 assert.equal(JSON.stringify({player,zone}),original,'HUD helper does not advance the 60Hz world');
 assert.equal(Nav.zoneEntry({x:0,z:5},zone,[]),null,'no extra marker while already inside');
});

test('BR zone map marker shows blocked or unknown straight-line travel without claiming a path',()=>{
 const player={x:0,z:80,yaw:0},zone={x:0,z:0,radius:50};
 const obstacles=[{x:0,z:65,w:10,d:1}];
 assert.equal(Nav.zoneEntry(player,zone,obstacles).straightLineBlocked,true);
 assert.equal(Nav.zoneEntry(player,zone,null).straightLineBlocked,null);
 assert.equal(Nav.zoneEntry(player,{x:0,z:0,radius:.5},obstacles),null);
 assert.equal(Nav.zoneEntry({x:NaN,z:0},zone,obstacles),null);
 assert.equal(Nav.zoneEntry(player,null,obstacles),null);
});

test('BR PC rendering uses public safe-zone waypoint without altering the saved world format',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const map=app.slice(app.indexOf('function minimap(){'),app.indexOf('function updateHud(){'));
 assert.match(map,/Navigation\.zoneEntry\(simulation\.player,simulation\.zone,simulation\.obstacles\)/);
 assert.match(map,/entry\.straightLineBlocked===true\?'#e8ad67':'#a3eed0'/);
 assert.doesNotMatch(map,/simulation\.bots/);
 const s=Sim.newMatch(20261107,0);
 s.status='playing'; // The release gate only snapshots an actual active 60Hz round.
 const before=Sim.snapshotMatch(s);
 Nav.zoneEntry(s.player,{x:0,z:0,radius:1},s.obstacles);
 assert.equal(Sim.snapshotMatch(s),before,'map calculation cannot mutate a checkpoint');
});
