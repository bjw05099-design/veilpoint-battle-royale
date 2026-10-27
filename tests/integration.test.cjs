'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('all local browser scripts exist and performance instrumentation loads before app',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"\s*>/g)].map(m=>m[1]);
 assert.ok(scripts.length>=6);
 for(const src of scripts){assert.ok(!src.startsWith('http'));assert.ok(fs.existsSync(path.join(__dirname,'..',src)),src);}
 assert.ok(scripts.indexOf('src/performance.js')>=0);
 assert.ok(scripts.indexOf('src/performance.js')<scripts.indexOf('src/app.js'));
});
test('graphics UI exposes the adaptive opt-in control and frame telemetry',()=>{
 for(const id of ['graphicsPanel','autoResolution','perfDetails','graphicsPreset','renderScale','fpsLimit']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/type="checkbox"/);
});

test('visibility planner loads before renderer and remains render-only',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"\s*>/g)].map(m=>m[1]);
 assert.ok(scripts.includes('src/visibility.js'));
 assert.ok(scripts.indexOf('src/visibility.js')<scripts.indexOf('src/renderer.js'));
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.ok(app.includes('clock.advance(dt'));
 assert.ok(!app.includes('Visibility.planVisible'));
});

const Sim=require('../src/simulation.js');
test('offline BR simulated session reaches win and restarts with fresh finite resources',()=>{
 const game=Sim.newMatch(712,1),bot=game.bots[0];game.status='playing';
 bot.x=0;bot.z=-18;bot.angle=0;bot.moveTime=999;bot.actionTime=999;
 for(let i=0;i<3;i++){
  const result=Sim.tag(game);assert.equal(result.ok,true);assert.equal(result.hit,true);
  for(let frame=0;frame<12;frame++)Sim.tick(game,1/60,{});
 }
 assert.equal(game.status,'won');assert.equal(game.kills,1);
 assert.equal(game.player.charges,45);assert.equal(game.player.loaded,9);
 const restart=Sim.newMatch(712,1);
 assert.equal(restart.status,'ready');assert.equal(restart.kills,0);
 assert.equal(restart.player.charges,48);assert.equal(restart.player.loaded,12);
 assert.equal(restart.bots[0].alive,true);
});
test('offline BR simulated loss cannot continue or consume resources after restart boundary',()=>{
 const game=Sim.newMatch(713,1);game.status='playing';
 Sim.receiveDamage(game,100);
 assert.equal(game.status,'lost');assert.equal(game.player.alive,false);
 const before=game.player.charges;
 assert.equal(Sim.tag(game).reason,'not_playing');
 Sim.tick(game,1/60,{forward:true});
 assert.equal(game.player.charges,before);
 assert.equal(game.status,'lost');
 const restart=Sim.newMatch(713,1);
 assert.equal(restart.status,'ready');assert.equal(restart.player.alive,true);
});
