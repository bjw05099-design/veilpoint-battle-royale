'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const KEY='veilpoint.brCheckpoint.v1';

function boot(store=new Map()){
 const nodes=new Map(),events=new Map(),selectors=new Map();
 let now=0,frameCallback,rendered;
 const on=(map,name,fn)=>map.set(name,[...(map.get(name)||[]),fn]);
 const emit=(map,name,arg={})=>(map.get(name)||[]).forEach(fn=>fn({preventDefault(){},pointerId:1,...arg}));
 const classes=()=>{const set=new Set();return {add:v=>set.add(v),remove:v=>set.delete(v),contains:v=>set.has(v),toggle(v,on){if(on===true||(on===undefined&&!set.has(v)))set.add(v);else set.delete(v);}};};
 const ctx={};for(const name of ['clearRect','fillRect','beginPath','moveTo','lineTo','stroke','arc','fill'])ctx[name]=()=>{};
 const node=id=>{
  if(nodes.has(id))return nodes.get(id);
  const handlers=new Map();const n={id,value:'',checked:false,disabled:false,style:{},textContent:'',innerHTML:'',width:240,height:240,classList:classes(),
   getContext:()=>ctx,getBoundingClientRect:()=>({x:0,y:0,width:88,height:88}),setPointerCapture(){},
   addEventListener:(name,fn)=>on(handlers,name,fn),dispatch:(name,e)=>emit(handlers,name,e),click(){this.dispatch('click');},
   requestPointerLock(){document.pointerLockElement=this;}};
  nodes.set(id,n);return n;
 };
 const document={pointerLockElement:null,getElementById:node,querySelector:sel=>{
  if(!selectors.has(sel))selectors.set(sel,node('selector-'+sel));return selectors.get(sel);},
  addEventListener:(name,fn)=>on(events,name,fn),exitPointerLock(){this.pointerLockElement=null;}};
 const global={document,localStorage:{getItem:key=>store.get(key)??null,setItem:(key,val)=>store.set(key,String(val)),removeItem:key=>store.delete(key)},
  performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{frameCallback=fn;},setTimeout:()=>1,
  addEventListener:(name,fn)=>on(events,name,fn),console,
  VeilpointRenderer:class{constructor(canvas){this.canvas=canvas;this.gpuTimer={supported:false};}setGraphicsQuality(){}draw(g){rendered=g;}setAdaptiveResolution(){}}};
 global.globalThis=global;
 for(const file of ['src/simulation.js','src/visibility.js','src/performance.js','src/benchmark.js','src/graphics.js','src/clock.js','src/fps.js','src/desktop-controls.js','src/app.js'])
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,file),'utf8'),global,{filename:file,timeout:1500});
 return {node,store,global,emit:(name,arg)=>emit(events,name,arg),frame(ms){now=ms;assert.equal(typeof frameCallback,'function');frameCallback(ms);},get game(){return rendered;}};
}

test('BR refresh offers explicit saved match resume with world and finite ammo intact',()=>{
 const store=new Map();const first=boot(store);
 first.node('play').click();first.frame(1000/60);
 const initial=first.game;
 first.emit('keydown',{code:'Space'});first.frame(2000/60);
 first.emit('blur');
 const saved=store.get(KEY);assert.ok(saved);
 const checkpoint=JSON.parse(saved);
 assert.equal(checkpoint.status,'playing');
 const second=boot(store);
 assert.equal(second.node('play').textContent,'저장 경기 이어하기');
 second.frame(1000/60);
 assert.equal(second.game.status,'ready','must not auto-start on page load');
 second.node('play').click();second.frame(2000/60);
 assert.equal(second.game.status,'playing');
 assert.equal(second.game.seed,checkpoint.seed);
 assert.equal(second.game.player.charges,checkpoint.player.charges);
 assert.ok(Math.abs(second.game.elapsed-checkpoint.elapsed)<=1/60+1e-9);
 assert.equal(second.node('overlay').classList.contains('hidden'),true);
 assert.notEqual(second.game,initial);
});

test('BR new game explicitly discards a checkpoint, and terminal loss clears it',()=>{
 const store=new Map();const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const old=JSON.parse(store.get(KEY));
 app.emit('blur');
 const next=boot(store);
 next.node('newMatch').click();next.frame(1000/60);
 assert.equal(next.game.player.charges,48);
 assert.notEqual(next.game,app.game);
 next.global.VeilpointSim.receiveDamage(next.game,100);
 next.frame(2000/60);
 assert.equal(store.has(KEY),false);
 assert.equal(next.node('play').textContent,'다시 시작');
});

test('BR corrupted checkpoint cannot resurrect shields or break launch',()=>{
 const store=new Map([[KEY,JSON.stringify({version:1,player:{shield:100}})]]);
 const app=boot(store);
 assert.equal(store.has(KEY),false);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 assert.equal('shield' in app.game.player,false);
});

test('BR storage quota failure remains visible without interrupting offline gameplay',()=>{
 const store={get:()=>null,set:()=>{throw new Error('quota');},delete:()=>{throw new Error('quota');}};
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 assert.match(app.game.message,/SAVE FAILED/);
});

test('BR periodic simulated-time autosave and damage checkpoint do not change the 60Hz rules',()=>{
 const store=new Map();const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const before=JSON.parse(store.get(KEY));
 const game=app.game;
 // This fixture tests checkpoint cadence, not random hostile combat. Finite
 // empty enemy magazines prevent unrelated seeded encounters from ending the
 // match before the damage-autosave assertion (observed in CI).
 for(const bot of game.bots){bot.loaded=0;bot.charges=0;}
 for(let i=0;i<901&&game.status==='playing';i++)app.global.VeilpointSim.tick(game,1/60,{});
 assert.equal(game.status,'playing');
 app.frame(2000/60);
 const periodic=JSON.parse(store.get(KEY));
 assert.ok(periodic.elapsed>before.elapsed+15);
 assert.equal(periodic.player.charges,game.player.charges);
 app.global.VeilpointSim.receiveDamage(game,8);
 for(let i=0;i<61&&game.status==='playing';i++)app.global.VeilpointSim.tick(game,1/60,{});
 app.frame(3000/60);
 assert.equal(JSON.parse(store.get(KEY)).player.health,game.player.health);
});

test('BR checkpoint is independent of the campaign save and remains available on pagehide',()=>{
 const store=new Map([['veilpoint.storyCheckpoint.v2','campaign-only']]);
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('pagehide');
 assert.ok(store.get(KEY));
 app.node('newMatch').click();app.frame(2000/60);
 assert.equal(store.get('veilpoint.storyCheckpoint.v2'),'campaign-only');
});

test('BR fatal outcome invalidates the save on pagehide before the next render frame',()=>{
 const store=new Map();const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 assert.ok(store.get(KEY));
 app.global.VeilpointSim.receiveDamage(app.game,100);
 assert.equal(app.game.status,'lost');
 app.emit('pagehide');
 assert.equal(store.has(KEY),false,'a stale active checkpoint must not revive a finished match');
});

test('BR end screen ranks an eliminated player behind survivors, never as champion',()=>{
 const eliminated=boot();
 eliminated.node('play').click();eliminated.frame(1000/60);
 const game=eliminated.game;
 const surviving=game.bots.filter(b=>b.alive).length;
 eliminated.global.VeilpointSim.receiveDamage(game,100);
 eliminated.frame(2000/60);
 const summary=eliminated.node('selector-.tagline').textContent;
 assert.match(summary,new RegExp('순위 '+(surviving+1)+'위'));
 assert.doesNotMatch(summary,/순위 1위/);

 const lastOpponent=boot();
 lastOpponent.node('play').click();lastOpponent.frame(1000/60);
 for(const b of lastOpponent.game.bots){b.alive=false;b.health=0;}
 lastOpponent.game.bots[0].alive=true;lastOpponent.game.bots[0].health=100;
 lastOpponent.global.VeilpointSim.receiveDamage(lastOpponent.game,100);
 lastOpponent.frame(2000/60);
 assert.match(lastOpponent.node('selector-.tagline').textContent,/순위 2위/);

 const champion=boot();
 champion.node('play').click();champion.frame(1000/60);
 for(const b of champion.game.bots){b.alive=false;b.health=0;}
 champion.global.VeilpointSim.tick(champion.game,1/60,{});
 assert.equal(champion.game.status,'won');
 champion.frame(2000/60);
 assert.match(champion.node('selector-.tagline').textContent,/순위 1위/);
});


test('opt-in PC benchmark starts only with active rendering and stops on match pause',()=>{
 const app=boot();
 const start=app.node('benchmarkStart'),stop=app.node('benchmarkStop'),download=app.node('benchmarkExport');
 assert.equal(start.disabled,false);
 assert.equal(download.disabled,true);
 start.click();
 assert.match(app.node('benchmarkStatus').textContent,/준비됨/);
 app.frame(32);
 assert.match(app.node('benchmarkStatus').textContent,/준비됨/,'ready/menu render must not start an active benchmark');
 app.node('play').click();
 for(const ms of [300,316,332,348])app.frame(ms);
 assert.match(app.node('benchmarkStatus').textContent,/측정 중/);
 assert.equal(start.disabled,true);
 app.emit('blur');
 app.frame(650);
 assert.match(app.node('benchmarkStatus').textContent,/측정 종료/);
 assert.equal(stop.disabled,true);
 assert.equal(download.disabled,true,'less than warmup must not invent performance evidence');
});


test('BR paused save-and-exit returns to the PC menu and restores the exact active checkpoint',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(game.player.charges,47);
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('saveExit').classList.contains('hidden'),false);
 app.node('saveExit').click();
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(app.node('saveExit').classList.contains('hidden'),true);
 assert.equal(app.node('play').textContent,'저장 경기 이어하기');
 assert.equal(JSON.parse(store.get(KEY)).player.charges,47);
 assert.match(app.node('selector-.tagline').textContent,/저장되었습니다/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.seed,game.seed);
 assert.equal(app.game.player.charges,47);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
});

test('BR save-and-exit refuses to abandon a paused game when local checkpoint writes fail',()=>{
 const store={get:()=>null,set:()=>{throw new Error('quota exceeded');},delete:()=>{}};
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const before=app.game;
 app.emit('keydown',{code:'Escape'});
 app.node('saveExit').click();
 assert.equal(app.node('play').textContent,'이어하기');
 assert.match(app.node('selector-.tagline').textContent,/메뉴로 나가지 않았습니다/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game,before,'storage failure must not silently abandon the active round');
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
});

test('BR defeat offers reproducible same-arena retry distinct from a saved checkpoint',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const first=app.game,seed=first.seed,originalWeapon=first.player.weaponId;
 const originalSpawn={x:first.bots[0].x,z:first.bots[0].z};
 app.global.VeilpointSim.receiveDamage(first,100);app.frame(2000/60);
 assert.equal(app.node('retryArena').classList.contains('hidden'),false);
 assert.equal(store.has(KEY),false,'terminal match must not survive as an active checkpoint');
 app.node('weaponClass').value='compact';
 app.node('retryArena').click();app.frame(3000/60);
 assert.notEqual(app.game,first);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.seed,seed);
 assert.equal(app.game.player.weaponId,originalWeapon);
 assert.equal(app.game.player.charges,48);
 assert.equal(app.game.bots[0].x,originalSpawn.x);
 assert.equal(app.game.bots[0].z,originalSpawn.z);
 assert.equal(app.node('retryArena').classList.contains('hidden'),true);
 assert.ok(store.has(KEY),'the new active round receives its own recoverable save');
});

test('BR victory also allows a same-arena restart while the PC menu keeps New Match available',()=>{
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 const first=app.game,seed=first.seed;
 first.bots.forEach(b=>{b.alive=false;});
 app.global.VeilpointSim.tick(first,1/60,{});
 assert.equal(first.status,'won');
 app.frame(2000/60);
 assert.equal(app.node('retryArena').classList.contains('hidden'),false);
 app.node('retryArena').click();app.frame(3000/60);
 assert.equal(app.game.seed,seed);
 assert.equal(app.game.status,'playing');
 assert.equal(app.global.VeilpointSim.getAliveCount(app.game),19);
 assert.equal(app.node('newMatch').disabled,false);
});

test('offline BR HTML ships the explicit PC pause and retry controls',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/id="saveExit"[^>]*>체크포인트 저장 후 메뉴로/);
 assert.match(html,/id="retryArena"[^>]*>같은 경기장 다시 도전/);
});


test('BR terminal clearing falls back to an empty checkpoint when removeItem fails',()=>{
 const data=new Map(),store={
  get:key=>data.get(key)??null,set:(key,value)=>data.set(key,value),
  delete:()=>{throw new Error('remove blocked');}
 };
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(JSON.parse(data.get(KEY)).player.charges,47);
 app.global.VeilpointSim.receiveDamage(app.game,100);app.frame(2000/60);
 assert.equal(data.get(KEY),'','fallback must prevent a stale game from resuming after reload');
 app.node('play').click();app.frame(3000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.player.charges,48);
});

test('BR PC restart ignores readable stale save if both deletion and overwrite are denied',()=>{
 const data=new Map();let locked=false;
 const store={
  get:key=>data.get(key)??null,
  set:(key,value)=>{if(locked)throw new Error('storage locked');data.set(key,value);},
  delete:()=>{throw new Error('storage locked');}
 };
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 const stale=data.get(KEY);
 assert.equal(JSON.parse(stale).player.charges,47);
 locked=true;
 const finished=app.game;
 app.global.VeilpointSim.receiveDamage(finished,100);app.frame(2000/60);
 assert.equal(data.get(KEY),stale,'test must retain the unremovable checkpoint');
 app.node('play').click();app.frame(3000/60);
 assert.notEqual(app.game,finished);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.player.charges,48,'restart must never reload the stale 47-round checkpoint');
});

test('BR Enter from the final victory screen does not resume a stale active checkpoint',()=>{
 const data=new Map();let locked=false;
 const store={
  get:key=>data.get(key)??null,
  set:(key,value)=>{if(locked)throw new Error('storage locked');data.set(key,value);},
  delete:()=>{throw new Error('storage locked');}
 };
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 const old=app.game;
 locked=true;
 old.bots.forEach(b=>{b.alive=false;});
 app.global.VeilpointSim.tick(old,1/60,{});
 app.frame(2000/60);
 assert.equal(old.status,'won');
 app.emit('keydown',{code:'Enter'});
 app.frame(3000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.player.charges,48);
 assert.notEqual(app.game,old);
});


test('BR PC P-key creates an in-session bookmark and pause restores finite state without replaying a terminal round',()=>{
 const app=boot(new Map());app.node('play').click();app.frame(1000/60);
 const first=app.game,seed=first.seed;
 app.emit('keydown',{code:'KeyP'});assert.match(first.message,/BOOKMARK RECORDED/);
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(first.player.charges,47);
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('restoreCheckpoint').classList.contains('hidden'),false);
 app.node('restoreCheckpoint').click();
 assert.match(app.node('selector-.tagline').textContent,/복원했습니다/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game.seed,seed);
 assert.equal(app.game.player.charges,48,'restored bookmark rewinds finite ammo without duplicating the saved state');
 assert.equal(app.node('restoreCheckpoint').classList.contains('hidden'),true);
});

test('BR bookmark cannot be restored without a valid P-key record',()=>{
 const app=boot(new Map());app.node('play').click();app.frame(1000/60);
 const original=app.game;app.emit('keydown',{code:'Escape'});
 app.node('restoreCheckpoint').click();
 assert.match(app.node('selector-.tagline').textContent,/기록한 지점이 없습니다/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game,original);
});

test('BR PC pause same-arena reset requires two deliberate clicks and resets finite resources',()=>{
 const app=boot(new Map());app.node('play').click();app.frame(1000/60);
 const first=app.game,seed=first.seed,weapon=first.player.weaponId;
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(first.player.charges,47);
 app.emit('keydown',{code:'Escape'});
 app.node('restartArena').click();
 assert.match(app.node('selector-.tagline').textContent,/한 번 더/);
 assert.equal(app.game,first,'first click must never discard the active round');
 app.node('restartArena').click();app.frame(2000/60);
 assert.notEqual(app.game,first);
 assert.equal(app.game.seed,seed);
 assert.equal(app.game.player.weaponId,weapon);
 assert.equal(app.game.player.charges,48);
 assert.equal(app.node('restartArena').classList.contains('hidden'),true);
});

test('BR pause reset confirmation is cancelled by normal resume',()=>{
 const app=boot(new Map());app.node('play').click();app.frame(1000/60);
 const first=app.game;app.emit('keydown',{code:'Escape'});
 app.node('restartArena').click();
 app.node('play').click();app.frame(2000/60);
 app.emit('keydown',{code:'Escape'});
 app.node('restartArena').click();
 assert.equal(app.game,first);
 assert.match(app.node('selector-.tagline').textContent,/한 번 더/);
});

test('BR offline HTML contains PC bookmark and guarded reset controls',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/id="restoreCheckpoint"[^>]*>P키 현장 기록으로 되돌리기/);
 assert.match(html,/id="restartArena"[^>]*>같은 경기장 처음부터/);
});


test('BR PC Escape toggles pause and resume without resetting finite resources',()=>{
 const app=boot(new Map());app.node('play').click();app.frame(1000/60);
 const game=app.game;app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(game.player.charges,47);
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.emit('keydown',{code:'Escape',repeat:true});
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.emit('keydown',{code:'Escape'});app.frame(2000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.game,game);
 assert.equal(app.game.player.charges,47);
});
test('BR PC Escape cannot resume behind graphics settings',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'Escape'});
 app.node('graphicsPanel').classList.remove('hidden');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.node('graphicsPanel').classList.add('hidden');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
});

test('BR Escape dismisses the graphics dialog before unpausing the live match',()=>{
 const app=boot();app.node('play').click();app.frame(1000/60);
 const active=app.game;app.emit('keydown',{code:'Escape'});
 app.node('graphicsPanel').classList.remove('hidden');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('hidden'),false,'closing settings cannot resume combat');
 app.emit('keydown',{code:'Escape'});app.frame(2000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.game,active);
});

test('BR desktop V returns finite spare rounds to a visible physical cache and persists',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const g=app.game;
 g.loot.forEach(item=>{item.x=120;item.z=120;});
 const cache=g.loot.find(item=>item.weaponId===g.player.weaponId);
 cache.x=g.player.x;cache.z=g.player.z;cache.remaining=0;cache.picked=true;
 app.frame(500);
 assert.match(app.node('pickupPrompt').textContent,/V.*RETURN/);
 const before=g.player.charges;
 app.emit('keydown',{code:'KeyV'});
 assert.equal(g.player.charges,before-12);
 assert.equal(cache.remaining,12);
 const saved=JSON.parse(store.get(KEY));
 assert.equal(saved.player.charges,before-12);
 assert.equal(saved.loot[cache.id].remaining,12);
});
