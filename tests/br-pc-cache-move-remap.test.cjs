'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../src/desktop-controls.js');
const Sim=require('../src/simulation.js');

test('default PC cache-shift command is reachable and does not steal the H reload-assist action',()=>{
 const p=C.normalize({});
 assert.equal(C.actionFor('KeyH',p),'assist');
 assert.equal(C.actionFor('KeyU',p),'cacheMove');
 assert.equal(p.bindings.cacheMove,'KeyU');
 assert.equal(new Set(Object.values(p.bindings)).size,Object.keys(p.bindings).length);
 assert.equal(C.bind(p,'cacheMove','KeyH').reason,'key-in-use');
 const customized=C.bind(p,'cacheMove','KeyK');
 assert.equal(customized.ok,true);
 assert.equal(C.actionFor('KeyK',customized.value),'cacheMove');
 assert.equal(C.actionFor('KeyU',customized.value),null);
});
test('legacy PC key profiles migrate a new cache action without losing an old remapped U',()=>{
 const old={...C.DEFAULT_BINDINGS};delete old.cacheMove;old.support='KeyU';
 const loaded=C.normalize({bindings:old,sensitivity:1.5});
 assert.equal(loaded.bindings.support,'KeyU');
 assert.notEqual(loaded.bindings.cacheMove,'KeyU');
 assert.equal(C.actionFor(loaded.bindings.cacheMove,loaded),'cacheMove');
 assert.equal(new Set(Object.values(loaded.bindings)).size,Object.keys(loaded.bindings).length);
 const store=new Map();
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.equal(C.save(storage,loaded),true);
 assert.equal(C.load(storage).bindings.cacheMove,loaded.bindings.cacheMove);
 assert.equal(C.load(storage).bindings.support,'KeyU');
});
test('one observed BR cache candidate powers both the remapped prompt and physics relocation without minting stock',()=>{
 const game=Sim.newMatch(2026110417,1,'carbine');
 game.status='playing';
 const candidate=game.loot.find(item=>
  !Sim.blocked(item.x-1.3,item.z,.85,game.obstacles)&&
  !Sim.blocked(item.x+1.1,item.z,.85,game.obstacles)&&
  !Sim.lineBlocked(item.x-1.3,item.z,item.x,item.z,game.obstacles));
 assert.ok(candidate);
 game.player.x=candidate.x-1.3;game.player.z=candidate.z;game.player.yaw=Math.PI/2;
 const stock=game.loot.reduce((sum,x)=>sum+x.remaining,0);
 const before=JSON.stringify(game);
 const view=Sim.nearestRelocatableCache(game);
 assert.ok(view&&view.id===candidate.id);
 assert.equal(JSON.stringify(game),before,'HUD candidate must not mutate live simulation');
 const moved=Sim.repositionCache(game);
 assert.equal(moved.ok,true);
 assert.equal(moved.id,candidate.id);
 assert.equal(game.loot.reduce((sum,x)=>sum+x.remaining,0),stock);
 assert.equal(Sim.restoreMatch(Sim.snapshotMatch(game)).loot[candidate.id].x,candidate.x);
 game.status='won';assert.equal(Sim.nearestRelocatableCache(game),null);
});
test('BR only dispatches cache movement through remappable gameplay action and advertises correct key',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const story=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 assert.match(app,/if\(action==='cacheMove'&&canAct\(\)\)/);
 assert.doesNotMatch(app,/if\(e\.code==='KeyH'&&!action&&canAct\(\)\)/);
 assert.match(app,/Game\.nearestRelocatableCache\(s\)/);
 assert.match(app,/Desktop\.keyLabel\(bindings\.cacheMove\)/);
 assert.match(app,/persistMatch\(\);updateHud\(\)/);
 assert.match(html,/<option value="cacheMove">보급 상자 이동 \(BR\)<\/option>/);
 assert.match(story,/<option value="cacheMove">보급 상자 이동 \(BR\)<\/option>/);
});
