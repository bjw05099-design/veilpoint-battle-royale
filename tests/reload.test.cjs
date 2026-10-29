'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const start=()=>{const g=Sim.newMatch(12,1);g.status='playing';return g;};
test('magazine reload is manual, timed and never generates ammo',()=>{
 const g=start();assert.equal(g.player.loaded,12);
 for(let i=0;i<12;i++){g.elapsed+=.21;assert.equal(Sim.tag(g).ok,true);}
 assert.equal(g.player.loaded,0);assert.equal(g.player.charges,36);
 assert.equal(Sim.tag(g).reason,'reload_required');
 assert.equal(Sim.reload(g).ok,true);assert.equal(Sim.reload(g).reason,'already_reloading');
 assert.equal(Sim.tag(g).reason,'reloading');
 for(let i=0;i<107;i++)Sim.tick(g,1/60,{});
 assert.equal(g.player.loaded,0);
 for(let i=0;i<3;i++)Sim.tick(g,1/60,{});
 assert.equal(g.player.loaded,12);assert.equal(g.player.charges,36);
});
test('zero reserve cannot reload or fire and cannot create rounds',()=>{
 const g=start();assert.equal(Sim.reload(g).reason,'magazine_full');
 g.player.loaded=0;g.player.charges=0;
 assert.equal(Sim.reload(g).reason,'no_reserve');assert.equal(Sim.tag(g).reason,'empty');
 g.player.charges=3;assert.equal(Sim.reload(g).ok,true);
 for(let i=0;i<110;i++)Sim.tick(g,1/60,{});
 assert.equal(g.player.loaded,3);assert.equal(g.player.charges,3);
 assert.equal(Sim.reload(g).reason,'no_reserve');
});
test('CH01 partial reload survives checkpoint and finishes at 60Hz',()=>{
 const s=Story.createState();s.world.player.x=0;s.world.player.z=-18;Story.interact(s);
 s.world.player.loaded=0;s.world.player.charges=9;
 assert.equal(Story.fire(s).reason,'reload_required');
 assert.equal(Sim.reload(s.world).ok,true);
 for(let i=0;i<50;i++)Story.step(s,1/60);
 const raw=Story.serialize(s),loaded=Story.restore(raw);
 assert.equal(loaded.world.player.loaded,0);assert.ok(loaded.world.player.reloadRemaining>0);
 assert.equal(Story.serialize(loaded),raw);
 for(let i=0;i<70;i++)Story.step(loaded,1/60);
 assert.equal(loaded.world.player.loaded,9);assert.equal(loaded.world.player.charges,9);
});
test('older v2 checkpoint cannot restore magical shield or extra rounds',()=>{
 const old=JSON.parse(Story.serialize(Story.createState()));
 delete old.player.loaded;delete old.player.reloadRemaining;
 delete old.player.stress;delete old.player.reloadAssist;delete old.player.reloadHesitation;
 old.player.charges=5;old.player.shield=90;
 const loaded=Story.restore(JSON.stringify(old));
 assert.equal(loaded.world.player.loaded,5);assert.equal(loaded.world.player.charges,5);
 assert.equal(Object.hasOwn(loaded.world.player,'shield'),false);assert.equal(Sim.reload(loaded.world).reason,'no_reserve');
});
test('invalid magazine save fields are rejected',()=>{
 const base=JSON.parse(Story.serialize(Story.createState()));
 for(const changes of [{loaded:20},{loaded:49},{reloadRemaining:-1},{reloadRemaining:5},{loaded:12,reloadRemaining:1},{loaded:5,reloadRemaining:1}]){
  const p={...base.player,...changes};
  if(changes.loaded===5&&changes.reloadRemaining===1)p.charges=5;
  assert.throws(()=>Story.restore(JSON.stringify({...base,player:p})),RangeError);
 }
});
test('BR and CH01 desktop and mobile reload UI are connected',()=>{
 const br=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const story=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const sh=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
 const desktop=fs.readFileSync(path.resolve(__dirname,'../src/desktop-controls.js'),'utf8');
 assert.match(desktop,/reload:'KeyR'/);assert.match(br,/action==='reload'/);assert.match(br,/Game\.reload\(simulation\)/);
 assert.match(story,/action==='reload'/);assert.match(story,/Sim\.reload\(state\.world\)/);
 assert.match(html,/id="reloadButton"/);assert.match(sh,/id="touchReload"/);
});

test('stress assist is exposed on desktop and touch in both offline modes',()=>{
 const br=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const story=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const sh=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
 const desktop=fs.readFileSync(path.resolve(__dirname,'../src/desktop-controls.js'),'utf8');
 assert.match(desktop,/assist:'KeyH'/);assert.match(br,/action==='assist'/);assert.match(br,/Game\.setReloadAssist\(simulation/);
 assert.match(story,/action==='assist'/);assert.match(story,/Sim\.setReloadAssist\(state\.world/);
 assert.match(html,/id="assistButton"/);assert.match(sh,/id="touchAssist"/);
});
