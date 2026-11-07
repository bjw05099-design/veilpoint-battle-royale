'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
function live(){
 const game=Sim.newMatch(20261107,0);game.status='playing';return game;
}
test('west-quay board is a local read-only public countdown, not a remote game radar',()=>{
 const g=live();
 assert.deepEqual(Sim.DOCK_NOTICE,{x:-135,z:-135});
 const before=Sim.snapshotMatch(g);
 assert.deepEqual(Sim.inspectDockNotice(g),{ok:false,reason:'out_of_reach'});
 assert.equal(Sim.snapshotMatch(g),before,'distant E request cannot modify world');
 g.player.x=-135;g.player.z=-133.4;
 assert.equal(Sim.blocked(g.player.x,g.player.z,.85,g.obstacles),false);
 const atNotice=Sim.snapshotMatch(g);
 const entry=Sim.inspectDockNotice(g);
 assert.equal(entry.ok,true);
 assert.equal(entry.phase,0);
 assert.equal(entry.seconds,Math.ceil(g.zone.phaseRemaining));
 assert.match(g.message,/WEST QUAY NOTICE/);
 assert.doesNotMatch(g.message,/BOT|ENEMY|OPPONENT|HEALTH/);
 assert.equal(Sim.snapshotMatch(g),atNotice,'reading a public sign changes no checkpoint data');
 g.obstacles.push({x:-135,z:-134.2,w:3,d:.18,h:2,type:'test-wall'});
 assert.deepEqual(Sim.inspectDockNotice(g),{ok:false,reason:'out_of_reach'});
});
test('board cannot respond while CH01 is open, match ended, or phase data is invalid',()=>{
 const g=live();g.player.x=-135;g.player.z=-135;
 g.scene='nahrin';assert.equal(Sim.inspectDockNotice(g).reason,'inactive');
 delete g.scene;g.status='won';assert.equal(Sim.inspectDockNotice(g).reason,'inactive');
 g.status='playing';g.zone.phase=NaN;
 assert.equal(Sim.inspectDockNotice(g).reason,'unavailable');
});
test('physical board is rendered and PC E chooses it ahead of finite loot only when reached',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const render=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const input=app.slice(app.indexOf('function collectAmmo(){'),app.indexOf('function reloadWeapon(){'));
 assert.match(input,/Game\.operateServiceGate\(simulation\)/);
 assert.match(input,/Game\.inspectDockNotice\(simulation\)/);
 assert.match(input,/Game\.pickup\(simulation\)/);
 assert.ok(input.indexOf('inspectDockNotice')<input.indexOf('Game.pickup'));
 assert.match(render,/const notice=global\.VeilpointSim\.DOCK_NOTICE/);
 assert.match(render,/m\.box\(notice\.x,0,notice\.z/);
});
