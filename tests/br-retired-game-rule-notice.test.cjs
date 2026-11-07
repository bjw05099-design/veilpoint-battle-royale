'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
test('BR west quay remains physical and traversable without an impossible boundary-deadline bulletin',()=>{
 const game=Sim.newMatch(20261107,0);
 game.status='playing';
 const before=Sim.snapshotMatch(game);
 assert.equal(Object.prototype.hasOwnProperty.call(Sim,'DOCK_NOTICE'),false);
 assert.equal(Object.prototype.hasOwnProperty.call(Sim,'inspectDockNotice'),false);
 assert.equal(game.obstacles.filter(x=>x.type==='dock-breakwater').length,2);
 assert.equal(Sim.blocked(-135,-135,.85,game.obstacles),false);
 assert.equal(game.loot.length,40);
 assert.equal(Sim.snapshotMatch(game),before,'retired sign never changes 60Hz world or saved resources');
});
test('BR PC E retains real gate and finite supply while imaginary board asset is gone',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const sim=fs.readFileSync(path.join(__dirname,'../src/simulation.js'),'utf8');
 const render=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const input=app.slice(app.indexOf('function collectAmmo(){'),app.indexOf('function reloadWeapon(){'));
 assert.match(input,/Game\.operateServiceGate\(simulation\)/);
 assert.match(input,/Game\.pickup\(simulation\)/);
 for(const src of [app,sim,render]){
  assert.doesNotMatch(src,/inspectDockNotice|DOCK_NOTICE|WEST QUAY NOTICE/,
    'game rule knowledge must not be presented as a physical harbor fixture');
 }
 assert.match(render,/if\(o\.type==='dock-breakwater'\)/,'real coastal barrier is retained');
});
