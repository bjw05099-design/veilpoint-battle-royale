'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
function live(){const state=Sim.newMatch(20261107,0);state.status='playing';return state;}
test('BR west-quay notice is a solid, physically accessible sign beside an open lane',()=>{
 const g=live(),pos=Sim.QUAY_NOTICE;
 assert.deepEqual(pos,{x:-148,z:-135});
 const signs=g.obstacles.filter(o=>o.routeId==='br-quay-notice');
 assert.equal(signs.length,1);
 assert.equal(signs[0].type,'dock-notice');
 assert.equal(Sim.blocked(pos.x,pos.z,.25,g.obstacles),true);
 assert.equal(Sim.blocked(-135,-135,.85,g.obstacles),false,'central quay walkway stays clear');
 assert.equal(Sim.lineBlocked(-145,-135,-125,-135,g.obstacles),false);
 assert.deepEqual(Sim.inspectQuayNotice(g),{ok:false,reason:'out_of_reach'});
 g.player.x=-146;g.player.z=-135;
 const saved=Sim.snapshotMatch(g);
 assert.deepEqual(Sim.inspectQuayNotice(g),{ok:true,action:'read_quay_notice'});
 assert.match(g.message,/WEST QUAY NOTICE/);
 assert.equal(Sim.snapshotMatch(g),saved,'notice creates no resources, teleport or save fields');
 assert.equal(Sim.inspectQuayNotice(g).ok,true,'reading public sign never consumes finite inventory');
});
test('quay notice never grants remote interaction, unknown-map intel or CH01 actions',()=>{
 const game=live();
 game.player.x=5;game.player.z=5;
 assert.deepEqual(Sim.inspectQuayNotice(game),{ok:false,reason:'out_of_reach'});
 game.status='waiting';
 assert.equal(Sim.inspectQuayNotice(game).reason,'inactive');
 const story=require('../src/story-slice.js').createState();
 assert.equal(Sim.inspectQuayNotice(story.world).reason,'inactive');
});
test('visible 2D/WebGL and PC E interaction derive from the same authored notice body',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(app,/Game\.inspectQuayNotice\(simulation\)/);
 assert.match(renderer,/o\.type==='dock-notice'/);
 assert.match(renderer,/if\(o\.type==='dock-notice'\)/);
 assert.match(renderer,/m\.box\(o\.x,0,o\.z,o\.w,o\.h,o\.d/);
});
