'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const KEY='veilpoint.brCheckpoint.v1';

function boot(store=new Map(),fixedRandom=null){
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
  VeilpointRenderer:class{constructor(canvas){if(this.constructor.failNext){this.constructor.failNext=false;throw new Error('GPU renderer rebuild denied');}this.canvas=canvas;this.gpuTimer={supported:false};}setGraphicsQuality(){}draw(g){rendered=g;}setAdaptiveResolution(){}}};
 global.globalThis=global;
 if(fixedRandom!==null){
  // Reproduce repeated entropy draws without changing the simulator's Math API.
  const mockMath=Object.create(Math);
  mockMath.random=()=>fixedRandom;
  global.Math=mockMath;
 }
 for(const file of ['src/simulation.js','src/visibility.js','src/performance.js','src/benchmark.js','src/graphics.js','src/clock.js','src/fps.js','src/desktop-controls.js','src/gate-motor-audio.js','src/app.js'])
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
 const invalid=JSON.stringify({version:1,player:{shield:100}});
 const store=new Map([[KEY,invalid]]);
 const app=boot(store);
 assert.equal(store.get(KEY),invalid,'invalid original data is kept for later recovery');
 assert.match(app.node('play').textContent,/기록 보존/);
 app.node('play').click();app.frame(1000/60);
 assert.equal(store.get(KEY),invalid,'memory-only play cannot overwrite the unsafe checkpoint');
 assert.equal(app.game.status,'playing');
 assert.equal('shield' in app.game.player,false);
});

test('BR storage quota failure remains visible without interrupting offline gameplay',()=>{
 const store={get:()=>null,set:()=>{throw new Error('quota');},delete:()=>{throw new Error('quota');}};
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 assert.match(app.game.message,/RESET NOT VERIFIED.*MEMORY-ONLY/,
   'blocked reset leaves a usable isolated round without claiming persistence');
 assert.match(app.node('message').textContent,/SAVE FAILED.*PROGRESS ONLY IN THIS TAB/,
   'storage failure stays visible on the PC HUD');
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

test('BR P-key field bookmark survives browser refresh and rewinds the actual saved world',()=>{
 const store=new Map(),one=boot(store);
 one.node('play').click();one.frame(1000/60);
 one.emit('keydown',{code:'KeyP'});
 const bookmarked=store.get('veilpoint.brFieldBookmark.v1');
 assert.ok(bookmarked,'physical P-key creates a separate durable bookmark');
 const savedPosition=JSON.parse(bookmarked).player;
 one.emit('keydown',{code:'Space'});one.emit('keyup',{code:'Space'});
 assert.equal(one.game.player.charges,savedPosition.charges-1);
 one.emit('blur');
 const two=boot(store);
 two.node('play').click();two.frame(1000/60);
 assert.equal(two.game.player.charges,savedPosition.charges-1,'regular autosave resumes most recent play');
 two.emit('keydown',{code:'Escape'});
 two.node('restoreCheckpoint').click();
 assert.match(two.node('selector-.tagline').textContent,/복원했습니다/);
 two.node('play').click();two.frame(2000/60);
 assert.equal(two.game.player.charges,savedPosition.charges,'rewind restores complete previous finite world');
 assert.equal(JSON.parse(store.get(KEY)).player.charges,savedPosition.charges,
  'a refresh immediately after rewind must reopen the restored world');
});

test('BR terminal outcome and explicit new arena remove the durable field bookmark',()=>{
 const store=new Map(),app=boot(store),key='veilpoint.brFieldBookmark.v1';
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'KeyP'});assert.ok(store.get(key));
 app.node('newMatch').click();app.frame(2000/60);
 assert.equal(store.has(key),false,'new arena must discard old rewind points');
 app.emit('keydown',{code:'KeyP'});assert.ok(store.get(key));
 app.global.VeilpointSim.receiveDamage(app.game,100);app.frame(3000/60);
 assert.equal(store.has(key),false,'finished competitions cannot retain rewindable active checkpoints');
});

test('BR PC reload recovers a previous valid world after corrupt latest autosave',()=>{
 const key='veilpoint.brCheckpoint.v1',previousKey=key+'.previous';
 const store=new Map([['veilpoint.story.ch01','independent-story-save']]);
 const first=boot(store);first.node('play').click();first.frame(1000/60);
 const initial=JSON.parse(store.get(key));
 first.emit('keydown',{code:'Space'});first.emit('keyup',{code:'Space'});
 assert.equal(JSON.parse(store.get(key)).player.charges,initial.player.charges-1);
 const previous=store.get(previousKey);
 assert.ok(previous,'previous generation exists after real PC input changes the world');
 store.set(key,'{interrupted-write');
 const recovered=boot(store);
 assert.equal(recovered.node('play').textContent,'저장 경기 이어하기');
 assert.equal(store.get(key),previous,'validated previous world is promoted');
 recovered.node('play').click();recovered.frame(1000/60);
 assert.equal(recovered.game.player.charges,initial.player.charges);
 assert.equal(recovered.game.seed,initial.seed);
 assert.equal(store.get('veilpoint.story.ch01'),'independent-story-save');
 recovered.node('newMatch').click();recovered.frame(2000/60);
 assert.equal(store.has(previousKey),false,'new match removes fallback from old world');
});

test('BR terminal loss discards primary and backup so finished rounds cannot be reopened',()=>{
 const key='veilpoint.brCheckpoint.v1',backup=key+'.previous';
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.ok(store.get(backup));
 app.global.VeilpointSim.receiveDamage(app.game,100);app.frame(2000/60);
 assert.equal(store.has(key),false);
 assert.equal(store.has(backup),false);
 const next=boot(store);next.node('play').click();next.frame(1000/60);
 assert.equal(next.game.player.charges,48,'fresh round starts with finite initial resources');
});

test('BR PC pause withdrawal needs two clicks, clears save and allows same-arena retry',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const first=app.game,seed=first.seed,health=first.player.health,ammo=first.player.charges;
 assert.ok(store.get(KEY));
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('forfeitMatch').classList.contains('hidden'),false);
 app.node('forfeitMatch').click();
 assert.equal(first.status,'playing','first click only arms withdrawal');
 assert.ok(store.get(KEY));
 app.node('forfeitMatch').click();app.frame(2000/60);
 assert.equal(first.status,'lost');
 assert.equal(first.player.health,health);
 assert.equal(first.player.charges,ammo);
 assert.equal(store.has(KEY),false,'terminal withdrawal cannot resume an active checkpoint');
 assert.equal(app.node('forfeitMatch').classList.contains('hidden'),true);
 assert.match(app.node('selector-.tagline').textContent,/자발적으로 포기/);
 app.node('retryArena').click();app.frame(3000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.seed,seed);
 assert.equal(app.game.player.charges,ammo);
 assert.notEqual(app.game,first);
});

test('BR offline final victory stays readable after refresh and replays the same arena on PC',()=>{
 const store=new Map([['veilpoint.story.ch01','separate-story-save']]),first=boot(store);
 first.node('play').click();first.frame(1000/60);
 const old=first.game,seed=old.seed;
 old.bots.forEach(b=>{b.alive=false;b.health=0;});
 first.global.VeilpointSim.tick(old,1/60,{});
 first.frame(2000/60);
 assert.equal(old.status,'won');
 const key='veilpoint.brLastResult.v1';
 const report=JSON.parse(store.get(key));
 assert.equal(report.outcome,'won');
 assert.equal(report.placement,1);
 assert.equal(store.has(KEY),false,'terminal result must not save an active match');
 const revisit=boot(store);
 assert.match(revisit.node('selector-.tagline').textContent,/지난 경기 승리/);
 assert.equal(revisit.node('retryArena').classList.contains('hidden'),false);
 revisit.frame(1000/60);
 assert.equal(revisit.game.status,'ready','page refresh cannot auto-respawn a completed game');
 revisit.node('retryArena').click();revisit.frame(2000/60);
 assert.equal(revisit.game.status,'playing');
 assert.equal(revisit.game.seed,seed);
 assert.equal(revisit.game.player.charges,48);
 assert.equal(store.has(key),false,'fresh arena clears old outcome history');
 assert.equal(store.get('veilpoint.story.ch01'),'separate-story-save');
});

test('BR withdrawn result can be reviewed on refresh but never revived as a live checkpoint',()=>{
 const store=new Map(),first=boot(store);
 first.node('play').click();first.frame(1000/60);
 first.emit('keydown',{code:'Escape'});
 first.node('forfeitMatch').click();first.node('forfeitMatch').click();
 assert.equal(first.game.status,'lost');
 const report=JSON.parse(store.get('veilpoint.brLastResult.v1'));
 assert.equal(report.outcome,'lost');
 assert.ok(report.placement>=2);
 assert.equal(store.has(KEY),false);
 const refreshed=boot(store);
 assert.match(refreshed.node('selector-.tagline').textContent,/지난 경기 종료/);
 refreshed.node('play').click();refreshed.frame(1000/60);
 assert.equal(refreshed.game.status,'playing');
 assert.equal(refreshed.game.player.charges,48,'new round starts with original finite resources');
});

test('BR corrupt last-result data is discarded without preventing new game',()=>{
 const key='veilpoint.brLastResult.v1';
 const store=new Map([[key,JSON.stringify({version:1,mode:'offline-br',outcome:'won',placement:1,seed:'forged'})]]);
 const app=boot(store);
 assert.equal(store.has(key),false);
 assert.doesNotMatch(app.node('selector-.tagline').textContent,/지난 경기/);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
});


test('BR stale PC tab cannot overwrite a newer live checkpoint or erase it on terminal result',()=>{
 const store=new Map();
 const first=boot(store);
 first.node('play').click();first.frame(1000/60);
 const old=store.get(KEY);assert.ok(old);
 const second=boot(store);
 second.node('play').click();second.frame(1000/60);
 second.emit('keydown',{code:'Space'});second.emit('keyup',{code:'Space'});
 const afterFire=store.get(KEY);
 assert.notEqual(afterFire,old,'second tab has persisted a newer finite-ammo world');
 second.emit('keydown',{code:'KeyP'});
 // Recording a field bookmark also commits its HUD state; compare against the
 // actual latest generation rather than the intermediate post-fire snapshot.
 const newer=store.get(KEY);
 const bookmark=store.get('veilpoint.brFieldBookmark.v1');
 assert.ok(bookmark,'second tab owns a valid field bookmark');
 store.set('veilpoint.brLastResult.v1','newer-tab-report');
 first.emit('keydown',{code:'Space'});first.emit('keyup',{code:'Space'});
 assert.equal(store.get(KEY),newer,'first tab must not overwrite changed generation');
 assert.match(first.game.message,/SAVE CONFLICT/);
 first.global.VeilpointSim.receiveDamage(first.game,100);
 first.frame(2000/60);
 assert.equal(store.get(KEY),newer,'stale terminal cleanup must not erase another live match');
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),bookmark);
 assert.equal(store.get('veilpoint.brLastResult.v1'),'newer-tab-report');
});

test('BR paused Save & Exit refuses to claim a durable save after another tab updates it',()=>{
 const store=new Map();
 const first=boot(store);
 first.node('play').click();first.frame(1000/60);
 first.emit('keydown',{code:'Escape'});
 const second=boot(store);
 second.node('play').click();second.frame(1000/60);
 second.emit('keydown',{code:'Space'});second.emit('keyup',{code:'Space'});
 const newer=store.get(KEY);
 first.node('saveExit').click();
 assert.equal(store.get(KEY),newer);
 assert.equal(first.node('play').textContent,'이어하기',
   'Save & Exit remains a paused session on a generation conflict');
 assert.match(first.node('selector-.tagline').textContent,/메뉴로 나가지 않았습니다/);
 first.node('play').click();first.frame(3000/60);
 assert.equal(first.game.status,'playing','uncommitted live world remains playable');
});

test('BR denied checkpoint read or backup rotation does not destroy last good primary',()=>{
 const data=new Map();
 let denyRead=false,denyBackup=false;
 const store={
  get(k){if(denyRead&&k===KEY)throw new Error('SecurityError');return data.get(k);},
  set(k,v){if(denyBackup&&k===KEY+'.previous')throw new Error('quota');data.set(k,v);},
  delete(k){data.delete(k);}
 };
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const old=data.get(KEY);
 assert.ok(old);
 denyRead=true;
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(data.get(KEY),old,'read failure cannot authorize clobbering the primary');
 denyRead=false;denyBackup=true;
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(data.get(KEY),old,'failed backup cannot authorize overwriting the primary');
 assert.match(app.game.message,/SAVE FAILED/);
});

test('BR concurrent-tab checkpoint conflict stays visible after toast timeout and blocks Save & Exit',()=>{
 const store=new Map();
 const older=boot(store);older.node('play').click();older.frame(1000/60);
 const recent=boot(store);recent.node('play').click();recent.frame(1000/60);
 recent.emit('keydown',{code:'Space'});recent.emit('keyup',{code:'Space'});
 const newest=store.get(KEY);
 assert.ok(newest);
 older.emit('keydown',{code:'Space'});older.emit('keyup',{code:'Space'});
 assert.equal(store.get(KEY),newest,'old tab must not replace current durable match');
 assert.match(older.node('message').textContent,/SAVE CONFLICT/);
 // The transient shot message expires, but the underlying save conflict
 // cannot silently disappear from the PC HUD during the same live session.
 older.game.messageTime=0;older.frame(2500);
 assert.match(older.node('message').textContent,/SAVE CONFLICT/);
 older.emit('keydown',{code:'Escape'});
 older.node('saveExit').click();
 assert.equal(store.get(KEY),newest);
 assert.match(older.node('selector-.tagline').textContent,/다른 창에서 저장된 경기/);
 assert.match(older.node('selector-.tagline').textContent,/메뉴로 나가지 않았습니다/);
 older.node('play').click();older.frame(3000);
 assert.equal(older.game.status,'playing','failure cannot abandon the in-memory round');
});

test('BR denied write stays in the HUD after transient event and clears after real persistence recovery',()=>{
 const store=new Map();
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const write=store.set.bind(store);
 let deny=true;
 store.set=(k,v)=>{
  if(k===KEY&&deny)throw new Error('quota denied');
  return write(k,v);
 };
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.match(app.node('message').textContent,/SAVE FAILED/);
 app.game.messageTime=0;
 app.frame(2500);
 assert.match(app.node('message').textContent,/SAVE FAILED/);
 deny=false;
 app.emit('keydown',{code:'KeyP'});
 assert.match(app.game.message,/CHECKPOINT RESTORED/);
 assert.doesNotMatch(app.node('message').textContent,/SAVE FAILED/);
 assert.equal(JSON.parse(store.get(KEY)).player.charges,app.game.player.charges);
});

test('BR stale PC tab cannot replace newer tab field bookmark on P-key',()=>{
 const store=new Map();
 const older=boot(store);older.node('play').click();older.frame(1000/60);
 const newer=boot(store);newer.node('play').click();newer.frame(1000/60);
 newer.emit('keydown',{code:'Space'});newer.emit('keyup',{code:'Space'});
 newer.emit('keydown',{code:'KeyP'});
 const diskCheckpoint=store.get(KEY);
 const diskBookmark=store.get('veilpoint.brFieldBookmark.v1');
 assert.ok(diskCheckpoint&&diskBookmark,'newer session owns durable state');
 older.emit('keydown',{code:'KeyP'});
 assert.equal(store.get(KEY),diskCheckpoint,'older tab may not overwrite checkpoint');
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),diskBookmark,
   'older tab may not overwrite the newer session bookmark');
 assert.match(older.game.message,/FIELD BOOKMARK IN MEMORY ONLY/);
 assert.match(older.game.message,/ANOTHER TAB OWNS SAVE/);
 assert.match(older.node('message').textContent,/SAVE CONFLICT/);
 older.emit('keydown',{code:'Escape'});
 older.node('restoreCheckpoint').click();
 assert.equal(store.get(KEY),diskCheckpoint,
   'old tab in-memory bookmark restore must not replace newer disk state');
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),diskBookmark);
});

test('BR storage-denied P-key preserves a local bookmark but makes failure visible',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const original=store.get('veilpoint.brFieldBookmark.v1');
 const write=store.set.bind(store);
 let denied=true;
 store.set=(key,value)=>{
  if(key==='veilpoint.brFieldBookmark.v1'&&denied)throw new Error('quota');
  return write(key,value);
 };
 app.emit('keydown',{code:'KeyP'});
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),original);
 assert.match(app.game.message,/FIELD BOOKMARK IN MEMORY ONLY/);
 assert.match(app.node('message').textContent,/FIELD BOOKMARK NOT SAVED/);
 assert.doesNotMatch(app.node('message').textContent,/SAVE FAILED/,
   'the primary checkpoint remains writable; only the optional bookmark failed');
 app.emit('keydown',{code:'Escape'});
 app.node('restoreCheckpoint').click();
 assert.equal(app.game.status,'playing','local bookmark remains usable in paused match');
 app.node('play').click();app.frame(2500);
 assert.match(app.node('message').textContent,/FIELD BOOKMARK NOT SAVED/);
 denied=false;
 app.emit('keydown',{code:'KeyP'});
 assert.ok(store.get('veilpoint.brFieldBookmark.v1'),'next successful P saves the bookmark');
 assert.doesNotMatch(app.node('message').textContent,/FIELD BOOKMARK NOT SAVED/);
});

test('BR invalid local rewind in stale PC tab cannot delete newer tab field bookmark',()=>{
 const store=new Map();
 const older=boot(store);older.node('play').click();older.frame(1000/60);
 older.emit('keydown',{code:'KeyP'});
 const newer=boot(store);newer.node('play').click();newer.frame(1000/60);
 newer.emit('keydown',{code:'Space'});newer.emit('keyup',{code:'Space'});
 newer.emit('keydown',{code:'KeyP'});
 const latestSave=store.get(KEY),latestBookmark=store.get('veilpoint.brFieldBookmark.v1');
 assert.ok(latestSave&&latestBookmark);
 // Model a corrupted *local* bookmark's arena identity. The paused rewind
 // catches this exception and calls the production bookmark cleanup path.
 older.game.seed+=1;
 older.emit('keydown',{code:'Escape'});
 older.node('restoreCheckpoint').click();
 assert.equal(store.get(KEY),latestSave);
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),latestBookmark,
   'local rewind failure cannot delete another window\'s valid P-key bookmark');
 assert.match(older.node('selector-.tagline').textContent,/지점이 없습니다/);
 older.node('play').click();older.frame(2500);
 assert.equal(older.game.status,'playing','failed rewind must keep live world playable');
});

test('BR owning tab still clears its own P bookmark on terminal finish',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'KeyP'});
 assert.ok(store.get('veilpoint.brFieldBookmark.v1'));
 app.global.VeilpointSim.receiveDamage(app.game,100);
 app.frame(2000/60);
 assert.equal(store.has(KEY),false);
 assert.equal(store.has('veilpoint.brFieldBookmark.v1'),false,
   'terminal cleanup must clear the owning session bookmark before its primary');
});

test('BR explicit New Match resets observed bookmark generations but protects a newer tab',()=>{
 const store=new Map();
 const older=boot(store);older.node('play').click();older.frame(1000/60);
 const newer=boot(store);newer.node('play').click();newer.frame(1000/60);
 newer.emit('keydown',{code:'KeyP'});
 const latest=store.get(KEY),bookmark=store.get('veilpoint.brFieldBookmark.v1');
 assert.ok(bookmark);
 older.node('newMatch').click();older.frame(2000/60);
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),bookmark,
   'the older PC tab cannot destructively reset another tab\'s newer saved bookmark');
 assert.equal(store.get(KEY),latest,'the newer valid round remains recoverable');
 assert.equal(older.game.status,'playing');
 assert.notEqual(older.game,newer.game);
 const refreshed=boot(store);refreshed.node('newMatch').click();refreshed.frame(1000/60);
 assert.equal(store.has('veilpoint.brFieldBookmark.v1'),false,
   'the tab that observed the newest valid generation can still explicitly reset');
 assert.ok(JSON.parse(store.get(KEY)).seed,'fresh round gets its own checkpoint');
});

test('BR stale PC tab paused P-key rewind leaves its live world unchanged after save conflict',()=>{
 const store=new Map();
 const older=boot(store);older.node('play').click();older.frame(1000/60);
 older.emit('keydown',{code:'KeyP'});
 older.emit('keydown',{code:'Space'});older.emit('keyup',{code:'Space'});
 const beforeRewind=older.game,charges=beforeRewind.player.charges;
 const elapsed=beforeRewind.elapsed;
 const newer=boot(store);newer.node('play').click();newer.frame(1000/60);
 newer.emit('keydown',{code:'Space'});newer.emit('keyup',{code:'Space'});
 newer.emit('keydown',{code:'KeyP'});
 const primary=store.get(KEY),field=store.get('veilpoint.brFieldBookmark.v1');
 older.emit('keydown',{code:'Escape'});
 older.node('restoreCheckpoint').click();
 assert.match(older.node('selector-.tagline').textContent,/다른 창에서 저장 기록이 변경/);
 assert.match(older.node('selector-.tagline').textContent,/현재 경기는 변경하지 않았습니다/);
 assert.equal(store.get(KEY),primary,'no stale primary checkpoint overwrite');
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),field,'newer tab P bookmark remains intact');
 older.node('play').click();older.frame(2500);
 assert.equal(older.game,beforeRewind,'a conflicting rewind must preserve original world identity');
 assert.equal(older.game.player.charges,charges,'a conflicting rewind cannot grant back spent resources');
 assert.ok(older.game.elapsed>=elapsed,'a conflicting rewind cannot reset elapsed match time');
 assert.equal(older.game.status,'playing','same live round can resume after rejected rewind');
 assert.match(older.node('message').textContent,/SAVE CONFLICT/);
});

test('BR denied primary write still permits explicitly requested in-memory bookmark rewind',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'KeyP'});
 const old=app.game.player.charges;
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(app.game.player.charges,old-1);
 const writer=store.set.bind(store);
 let quotaDenied=true;
 store.set=(key,val)=>{if(key===KEY&&quotaDenied)throw new Error('quota');return writer(key,val);};
 app.emit('keydown',{code:'Escape'});
 app.node('restoreCheckpoint').click();
 assert.match(app.node('selector-.tagline').textContent,/이 탭에서는 계속할 수 있으나/);
 app.node('play').click();app.frame(2500);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.player.charges,old,
   'denied storage must not block a voluntary in-tab rewind when no newer generation exists');
 assert.match(app.node('message').textContent,/SAVE FAILED/,
   'when gameplay resumes the HUD must disclose that the rewind is memory-only');
 quotaDenied=false;
});

test('BR memory-only match reports P-key bookmark as non-durable and can still rewind locally',()=>{
 const previous='invalid-primary-sentinel',existingBookmark='unrelated-existing-bookmark';
 const store=new Map([[KEY,previous],['veilpoint.brFieldBookmark.v1',existingBookmark]]);
 const app=boot(store);
 assert.match(app.node('play').textContent,/기록 보존/);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 app.emit('keydown',{code:'KeyP'});
 assert.match(app.game.message,/FIELD BOOKMARK IN MEMORY ONLY/);
 assert.match(app.game.message,/STORAGE UNAVAILABLE/);
 assert.doesNotMatch(app.game.message,/SAVED FOR RESUME/,
   'the P-key prompt must not promise disk persistence in a memory-only round');
 assert.equal(store.get(KEY),previous,'original damaged primary remains untouched');
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),existingBookmark,
   'unrelated disk bookmark is not replaced by this temporary session');
 const bookmarked=app.game.player.charges;
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 assert.equal(app.game.player.charges,bookmarked-1);
 app.emit('keydown',{code:'Escape'});
 app.node('restoreCheckpoint').click();
 assert.match(app.node('selector-.tagline').textContent,/이 탭에서는 계속할 수 있으나/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.player.charges,bookmarked,
   'the player may still voluntarily restore their tab-local bookmark');
 assert.equal(store.get(KEY),previous);
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),existingBookmark);
});

test('BR remapped PC T pickup prompt matches actual resource interaction and persists',()=>{
 const Desktop=require('../src/desktop-controls.js');
 const first=Desktop.bind(Desktop.normalize({}),'interact','KeyT');
 assert.equal(first.ok,true);
 const remapped=Desktop.bind(first.value,'reload','KeyY');
 assert.equal(remapped.ok,true);
 const store=new Map([[Desktop.STORAGE_KEY,JSON.stringify(remapped.value)]]);
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 game.loot.forEach(item=>{item.x=120;item.z=120;});
 const cache=game.loot.find(item=>item.weaponId===game.player.weaponId);
 assert.ok(cache,'a finite local cache exists');
 cache.x=game.player.x;cache.z=game.player.z;
 cache.remaining=12;cache.picked=false;
 app.frame(500);
 assert.match(app.node('pickupPrompt').textContent,/\[T\]/,
  'HUD displays actual remapped PC interaction key for reachable finite ammo');
 assert.doesNotMatch(app.node('pickupPrompt').textContent,/\[E\]/);
 const ammo=game.player.charges;
 app.emit('keydown',{code:'KeyE'});
 assert.equal(game.player.charges,ammo,'unbound default E does not collect');
 app.emit('keydown',{code:'KeyT'});
 assert.ok(game.player.charges>ammo,'bound T collects a finite nearby resource');
 assert.equal(JSON.parse(store.get(KEY)).player.charges,game.player.charges);
});


test('BR backup promotion cannot overwrite a newer PC tab checkpoint during recovery',()=>{
 const Game=require('../src/simulation.js');
 const backupWorld=Game.newMatch(20261105,1);backupWorld.status='playing';
 const newerWorld=Game.newMatch(20261106,1);newerWorld.status='playing';
 const backup=Game.snapshotMatch(backupWorld),newer=Game.snapshotMatch(newerWorld);
 const backupKey=KEY+'.previous',store=new Map([[KEY,'{truncated-save'],[backupKey,backup]]);
 const read=store.get.bind(store);
 let reads=0;
 store.get=(key)=>{
  if(key===KEY&&++reads===2)store.set(KEY,newer);
  return read(key);
 };
 const app=boot(store);
 assert.ok(reads>=2);
 assert.equal(store.get(KEY),newer,'validated backup must never erase another tab latest primary');
 assert.equal(store.get(backupKey),backup,'older valid backup is preserved');
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.seed,20261106,'Continue resumes the newer validated world');
 assert.equal(app.game.status,'playing');
 assert.equal(store.get(KEY),newer);
});

test('BR failed backup repair preserves both disk generations and gives playable memory-only resume',()=>{
 const Game=require('../src/simulation.js');
 const world=Game.newMatch(20261107,1);world.status='playing';
 const backup=Game.snapshotMatch(world),corrupt='{partial';
 const backupKey=KEY+'.previous',store=new Map([[KEY,corrupt],[backupKey,backup],
  ['veilpoint.story.ch01','independent-story']]);
 const write=store.set.bind(store);
 let failed=0;
 store.set=(key,val)=>{
  if(key===KEY){failed++;throw new Error('quota temporarily denied');}
  return write(key,val);
 };
 const app=boot(store);assert.ok(failed>=1);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.seed,20261107);
 assert.match(app.game.message,/MEMORY ONLY/,'resumed game visibly discloses non-durable state');
 app.emit('blur');
 assert.equal(store.get(KEY),corrupt,'original primary cannot be erased by autosave');
 assert.equal(store.get(backupKey),backup,'validated backup remains recoverable');
 assert.equal(store.get('veilpoint.story.ch01'),'independent-story');
 store.set=write;
 const reload=boot(store);
 assert.equal(store.get(KEY),backup,'later retry promotes the validated backup');
 reload.node('play').click();reload.frame(1000/60);
 assert.equal(reload.game.seed,20261107);
 assert.equal(reload.game.status,'playing');
});


test('BR concurrent backup rotation never promotes a stale checkpoint across two Windows tabs',()=>{
 const Game=require('../src/simulation.js');
 const originalMatch=Game.newMatch(20261105,1);originalMatch.status='playing';
 const nextMatch=Game.newMatch(20261106,1);nextMatch.status='playing';
 const original=Game.snapshotMatch(originalMatch);
 const newBackup=Game.snapshotMatch(nextMatch);
 const backupKey=KEY+'.previous',damaged='{partial-primary';
 const store=new Map([[KEY,damaged],[backupKey,original],
   ['veilpoint.story.ch01','preserved-story-progress']]);
 const get=store.get.bind(store);
 let primaryReads=0;
 store.get=name=>{
  if(name===KEY&&++primaryReads===2)store.set(backupKey,newBackup);
  return get(name);
 };
 const app=boot(store);
 assert.ok(primaryReads>=2,'read both generations again immediately before promotion');
 assert.equal(store.get(KEY),damaged,'old backup was not promoted over another tab change');
 assert.equal(store.get(backupKey),newBackup);
 assert.equal(app.node('play').textContent,'저장 경기 이어하기');
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.seed,20261106,'fresh Continue uses newer validated backup');
 assert.equal(Game.restoreMatch(store.get(KEY)).seed,20261106);
 assert.equal(store.get('veilpoint.story.ch01'),'preserved-story-progress');
});

test('BR invalid concurrent backup replacement cannot erase either disk generation or block offline play',()=>{
 const Game=require('../src/simulation.js');
 const originalMatch=Game.newMatch(20261107,1);originalMatch.status='playing';
 const original=Game.snapshotMatch(originalMatch);
 const brokenBackup='{another-tab-incomplete',backupKey=KEY+'.previous';
 const damaged='{incomplete-primary',store=new Map([[KEY,damaged],[backupKey,original]]);
 const get=store.get.bind(store);let reads=0;
 store.get=name=>{
  if(name===KEY&&++reads===2)store.set(backupKey,brokenBackup);
  return get(name);
 };
 const app=boot(store);
 assert.ok(reads>=2);
 assert.equal(store.get(KEY),damaged);
 assert.equal(store.get(backupKey),brokenBackup);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing','a failed checkpoint recovery cannot softlock the PC menu');
 assert.equal(store.get(KEY),damaged,'memory-only round leaves primary unchanged');
 assert.equal(store.get(backupKey),brokenBackup,'memory-only round leaves backup unchanged');
 assert.match(app.game.message,/MEMORY-ONLY/);
});


test('BR Save & Exit refuses an acknowledged but silently discarded checkpoint write',()=>{
 const store=new Map([['veilpoint.story.ch01','independent-CH01']]);
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const lastDurable=store.get(KEY),currentWorld=app.game;
 assert.ok(lastDurable);
 const realSet=store.set.bind(store);
 let swallowed=0;
 store.set=(key,value)=>{
  if(key===KEY){swallowed++;return store;} // fake success; bytes never hit disk
  return realSet(key,value);
 };
 app.emit('keydown',{code:'Escape'});
 app.node('saveExit').click();
 assert.ok(swallowed>=2,'pause and Save & Exit both tried to persist');
 assert.equal(store.get(KEY),lastDurable,'old good generation survives silent write loss');
 assert.equal(app.node('play').textContent,'이어하기',
  'a falsely acknowledged save cannot move the UI to the saved-menu state');
 assert.match(app.node('selector-.tagline').textContent,/메뉴로 나가지 않았습니다/);
 assert.equal(store.get('veilpoint.story.ch01'),'independent-CH01');
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game,currentWorld,'uncommitted round remains playable');
 store.set=realSet;
 app.emit('keydown',{code:'Escape'});app.node('saveExit').click();
 assert.equal(app.node('play').textContent,'저장 경기 이어하기',
  'a real verified retry makes the exit available again');
});

test('BR save readback detects concurrent replacement after a reported successful write',()=>{
 const Game=require('../src/simulation.js');
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const originalGame=app.game;
 const newer=Game.newMatch(20261105,1);newer.status='playing';
 const concurrent=Game.snapshotMatch(newer);
 const realSet=store.set.bind(store);
 let injected=false;
 store.set=(key,value)=>{
  const result=realSet(key,value);
  if(key===KEY&&!injected){injected=true;realSet(KEY,concurrent);}
  return result;
 };
 app.emit('keydown',{code:'Escape'});
 app.node('saveExit').click();
 assert.equal(injected,true);
 assert.equal(store.get(KEY),concurrent,'another tab newer generation remains on disk');
 assert.equal(app.node('play').textContent,'이어하기');
 assert.match(app.node('selector-.tagline').textContent,/다른 창에서 저장된 경기/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game,originalGame,'no forced switch to another tab in-progress round');
 store.set=realSet;
 assert.equal(store.get(KEY),concurrent);
});


test('BR New Match does not claim persistent save when native removeItem silently refuses deletion',()=>{
 const key=KEY,previous=KEY+'.previous';
 class SilentRemove extends Map{
  blockPrimary=false;
  delete(name){
   if(this.blockPrimary&&name===key)return true; // browser shim falsely reports success
   return super.delete(name);
  }
 }
 const store=new SilentRemove(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const original=store.get(key);
 assert.ok(original);
 store.set(previous,original);
 store.blockPrimary=true;
 app.node('newMatch').click();app.frame(2000/60);
 assert.equal(app.game.status,'playing','failure remains a usable temporary BR session');
 assert.equal(store.get(key),original,'new arena must not overwrite old durable primary');
 assert.match(app.node('message').textContent,/SAVE FAILED/,
   'HUD must persist the memory-only warning');
 app.emit('blur');
 assert.equal(store.get(key),original);
 const newWindow=boot(store);
 newWindow.node('play').click();newWindow.frame(1000/60);
 assert.equal(newWindow.game.seed,JSON.parse(original).seed);
 store.blockPrimary=false;
 app.node('newMatch').click();app.frame(3000/60);
 assert.notEqual(store.get(key),original,'verified successful reset creates a writable new match');
});


test('BR recovery refuses silently ignored backup promotion and keeps both offline generations',()=>{
 const Game=require('../src/simulation.js');
 const saved=Game.newMatch(20261106,1);saved.status='playing';
 const backup=Game.snapshotMatch(saved);
 const damaged='{incomplete-primary';
 const prior=KEY+'.previous';
 const store=new Map([[KEY,damaged],[prior,backup],
  ['veilpoint.story.ch01','independent-story']]);
 const originalSet=store.set.bind(store);
 let ignored=0;
 store.set=(name,value)=>{
  if(name===KEY){ignored++;return store;} // success acknowledgment, no actual write
  return originalSet(name,value);
 };
 const app=boot(store);
 assert.ok(ignored>0,'recovery attempted the good backup write');
 assert.equal(store.get(KEY),damaged,'unverified promotion cannot change old primary');
 assert.equal(store.get(prior),backup,'the only good backup survives');
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.seed,20261106);
 assert.match(app.game.message,/MEMORY ONLY/,'the player sees a temporary session warning');
 app.emit('blur');
 assert.equal(store.get(KEY),damaged,'in-memory gameplay cannot overwrite the invalid primary');
 assert.equal(store.get(prior),backup);
 assert.equal(store.get('veilpoint.story.ch01'),'independent-story');
 store.set=originalSet;
 const retried=boot(store);
 assert.equal(store.get(KEY),backup,'a later valid window repairs exact bytes');
 retried.node('play').click();retried.frame(1000/60);
 assert.equal(retried.game.seed,20261106);
});

test('BR recovery rejects another tab replacement during acknowledged backup promotion',()=>{
 const Game=require('../src/simulation.js');
 const saved=Game.newMatch(20261106,1);saved.status='playing';
 const current=Game.newMatch(20261107,1);current.status='playing';
 const backup=Game.snapshotMatch(saved),newer=Game.snapshotMatch(current);
 const prior=KEY+'.previous',damaged='{incomplete';
 const store=new Map([[KEY,damaged],[prior,backup]]);
 const originalSet=store.set.bind(store);
 let replaced=0;
 store.set=(name,value)=>{
  if(name===KEY){replaced++;return originalSet(name,newer);}
  return originalSet(name,value);
 };
 const oldTab=boot(store);
 assert.equal(replaced,1);
 assert.equal(store.get(KEY),newer,'newer validated match is not silently adopted by old tab');
 assert.equal(store.get(prior),backup,'backed-up round is still recoverable');
 // Continue performs a fresh generation check: it must explicitly
 // choose the now-valid newer primary, not start the stale fallback.
 oldTab.node('play').click();oldTab.frame(1000/60);
 assert.equal(oldTab.game.seed,20261107,
   'fresh user Continue adopts the new validated primary instead of stale backup');
 assert.equal(Game.restoreMatch(store.get(KEY)).seed,20261107);
 oldTab.emit('blur');
 assert.equal(Game.restoreMatch(store.get(KEY)).seed,20261107,
   'the old fallback never overwrites the newer arena');
 store.set=originalSet;
 const fresh=boot(store);
 fresh.node('play').click();fresh.frame(1000/60);
 assert.equal(fresh.game.seed,20261107,'a new window restores the newer durable world');
});

test('BR backup promotion read denial keeps an unmodified primary and working temporary round',()=>{
 const Game=require('../src/simulation.js');
 const saved=Game.newMatch(20261106,1);saved.status='playing';
 const backup=Game.snapshotMatch(saved),damaged='{partial';
 const prior=KEY+'.previous',store=new Map([[KEY,damaged],[prior,backup]]);
 const read=store.get.bind(store);
 let reads=0;
 store.get=(name)=>{
  if(name===KEY&&++reads===3)throw new Error('read denied after write');
  return read(name);
 };
 const app=boot(store);
 assert.ok(reads>=3);
 assert.equal(store.get(KEY),backup,
   'initial denied verification does not invent a newer generation');
 // An explicit Continue retries reading the now-accessible, exactly restored
 // primary and may safely resume; this is different from silent autosaving.
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.status,'playing');
 assert.equal(app.game.seed,20261106);
 app.emit('blur');
 assert.equal(Game.restoreMatch(store.get(KEY)).seed,20261106,
   'after a fresh successful read, durable saving preserves the real world');
 assert.equal(Game.restoreMatch(store.get(prior)).seed,20261106);
});

test('BR Windows pause overlay discloses rejected checkpoint while preserving current round',()=>{
 class DeniedMatchSave extends Map {
  set(key,value){if(this.deny&&key===KEY)throw new Error('quota');return super.set(key,value);}
 }
 const store=new DeniedMatchSave();
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const previous=store.get(KEY);
 assert.ok(previous,'initial checkpoint was durable before quota failure');
 store.deny=true;
 app.emit('blur');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.match(app.node('selector-.tagline').textContent,/체크포인트 저장 실패/);
 assert.equal(store.get(KEY),previous,'denied primary must not be claimed as saved');
 assert.equal(app.game.status,'playing','the paused 60Hz game is still resumable');
 app.node('saveExit').click();
 assert.match(app.node('selector-.tagline').textContent,/메뉴로 나가지 않았습니다/);
});

test('BR PC pause explicitly identifies a changed generation in another tab',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const original=JSON.parse(store.get(KEY));
 original.elapsed+=3;
 const newer=JSON.stringify(original);
 store.set(KEY,newer);
 app.emit('blur');
 assert.match(app.node('selector-.tagline').textContent,/다른 창의 최신 체크포인트/);
 assert.equal(store.get(KEY),newer,'a stale PC tab cannot overwrite the other tab');
 app.node('play').click();
 app.frame(2000/60);
 assert.equal(app.game.status,'playing','resume preserves the local world');
});

test('BR temporary memory-only match never advertises a durable pause save',()=>{
 const corrupt='invalid-primary-save';
 const store=new Map([[KEY,corrupt]]);
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('blur');
 assert.match(app.node('selector-.tagline').textContent,/임시 경기이므로 현재 진행은 저장되지 않습니다/);
 assert.equal(store.get(KEY),corrupt,'unrelated checkpoint remains protected');
});

test('BR Save & Exit refuses a concurrent replacement after writer readback but before menu transition',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const live=app.game;
 app.emit('keydown',{code:'Escape'});
 const lastDurable=JSON.parse(store.get(KEY));
 const foreign=JSON.stringify({...lastDurable,elapsed:lastDurable.elapsed+4});
 const disk=app.global.localStorage;
 const get=disk.getItem.bind(disk),set=disk.setItem.bind(disk);
 let readsAfterWrite=-1;
 disk.setItem=(key,value)=>{
  set(key,value);
  if(key===KEY)readsAfterWrite=0;
 };
 disk.getItem=key=>{
  if(key===KEY&&readsAfterWrite>=0){
   readsAfterWrite++;
   if(readsAfterWrite===2)store.set(KEY,foreign);
  }
  return get(key);
 };
 app.node('saveExit').click();
 assert.ok(readsAfterWrite>=2,'Save & Exit must re-read after persistMatch readback');
 assert.equal(store.get(KEY),foreign,'newer disk bytes must not be overwritten');
 assert.equal(app.node('play').textContent,'이어하기');
 assert.match(app.node('selector-.tagline').textContent,/확인 직후 변경/);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game,live,'the existing 60Hz world remains resumable');
});

test('BR PC bfcache return stays paused with visible focused resume and unchanged saved round',()=>{
 const store=new Map([['veilpoint.story.ch01','CH01-untouched']]);
 const app=boot(store);
 app.node('play').click();app.frame(1000/60);
 const game=app.game,play=app.node('play');
 let focusCount=0;play.focus=()=>{focusCount++;};
 const before=game.elapsed;
 app.emit('pagehide');
 const saved=store.get(KEY);
 assert.ok(saved,'pagehide should preserve the active BR checkpoint');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.emit('pageshow',{persisted:true});
 assert.equal(play.textContent,'이어하기');
 assert.equal(focusCount,1,'keyboard focus returns to the visible PC Resume action');
 app.frame(120000);
 assert.equal(game.elapsed,before,'bfcache downtime must never advance the 60Hz simulation');
 assert.equal(store.get(KEY),saved,'pageshow is read-only for a verified disk generation');
 assert.equal(store.get('veilpoint.story.ch01'),'CH01-untouched');
 play.click();app.frame(120000+1000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.game,game,'resume returns to the same in-memory round');
 assert.equal(game.status,'playing');
});

test('BR ordinary pageshow does not pause a live match or steal keyboard focus',()=>{
 const app=boot(new Map());
 app.node('play').click();app.frame(1000/60);
 const game=app.game;
 let focuses=0;app.node('play').focus=()=>{focuses++;};
 app.emit('pageshow',{persisted:false});
 assert.equal(focuses,0);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 app.frame(2000/60);
 assert.equal(app.game,game);
 assert.equal(game.status,'playing');
});

test('BR bfcache return of terminal round cannot resurrect a saved active match',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.global.VeilpointSim.receiveDamage(app.game,100);
 app.frame(2000/60);
 const status=app.game.status;
 assert.notEqual(status,'playing');
 app.emit('pagehide');app.emit('pageshow',{persisted:true});
 assert.equal(app.game.status,status);
 assert.equal(store.has(KEY),false,'a finished match must not become resumable');
 assert.notEqual(app.node('play').textContent,'이어하기');
});

test('BR P-key rewind rejects a foreign save after writer readback and preserves the current round',()=>{
 const store=new Map([['veilpoint.story.ch01','independent-story']]),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'KeyP'});
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 app.frame(2000/60);
 const game=app.game,charges=game.player.charges;
 app.emit('keydown',{code:'Escape'});
 const save=JSON.parse(store.get(KEY)),foreign=JSON.stringify({...save,elapsed:save.elapsed+5});
 const realSet=store.set.bind(store),realGet=store.get.bind(store);
 let primaryWritten=false,postWriteReads=0;
 store.set=(key,val)=>{
  const result=realSet(key,val);
  if(key===KEY)primaryWritten=true;
  return result;
 };
 store.get=key=>{
  if(key===KEY&&primaryWritten&&++postWriteReads===2)realSet(KEY,foreign);
  return realGet(key);
 };
 app.node('restoreCheckpoint').click();
 assert.equal(primaryWritten,true);
 assert.ok(postWriteReads>=2);
 assert.equal(realGet(KEY),foreign,'other tab save remains intact');
 assert.match(app.node('selector-.tagline').textContent,/복원을 취소했습니다/);
 assert.equal(store.get('veilpoint.story.ch01'),'independent-story');
 store.get=realGet;store.set=realSet;
 app.node('play').click();app.frame(3000/60);
 assert.equal(app.game,game,'a rejected rewind retains original PC world identity');
 assert.equal(app.game.player.charges,charges,'no revoked rewind can replenish spent rounds');
 assert.match(app.node('message').textContent,/SAVE CONFLICT/);
});

test('BR final bookmark read failure does not silently claim that rewind was saved',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('keydown',{code:'KeyP'});
 app.emit('keydown',{code:'Space'});app.emit('keyup',{code:'Space'});
 app.emit('keydown',{code:'Escape'});
 const current=app.game;
 const disk=app.global.localStorage,originalGet=disk.getItem.bind(disk),
  originalSet=disk.setItem.bind(disk);
 let primaryWritten=false,reads=0;
 disk.setItem=(key,value)=>{
  originalSet(key,value);
  if(key===KEY)primaryWritten=true;
 };
 disk.getItem=key=>{
  if(key===KEY&&primaryWritten&&++reads===2)throw new Error('storage read denied');
  return originalGet(key);
 };
 app.node('restoreCheckpoint').click();
 assert.equal(primaryWritten,true);
 assert.ok(reads>=2);
 assert.match(app.node('selector-.tagline').textContent,/읽을 수 없어 복원을 취소/);
 disk.getItem=originalGet;disk.setItem=originalSet;
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game,current,'the current live match remains playable after denied read');
 assert.match(app.node('message').textContent,/SAVE CONFLICT/);
});

test('BR Windows bfcache return keeps visible graphics settings modal keyboard focus and frozen 60Hz round',()=>{
 const store=new Map([['veilpoint.story.ch01','CH01-untouched']]),app=boot(store);
 const panel=app.node('graphicsPanel');
 panel.classList.add('hidden');
 app.node('play').click();app.frame(1000/60);
 const live=app.game,elapsed=live.elapsed;
 app.emit('keydown',{code:'Escape'});
 const saved=store.get(KEY);assert.ok(saved);
 let playFocus=0,graphicsFocus=0;
 app.node('play').focus=()=>{playFocus++;};
 app.node('graphicsClose').focus=()=>{graphicsFocus++;};
 app.node('graphicsPauseOpen').click();
 assert.equal(panel.classList.contains('hidden'),false,
   'graphics settings is a visible dialog above the paused BR overlay');
 assert.equal(graphicsFocus,1);
 app.emit('pagehide');
 app.emit('pageshow',{persisted:true});
 assert.equal(panel.classList.contains('hidden'),false);
 assert.equal(graphicsFocus,2,
   'keyboard focus must stay with the open graphics settings dialog');
 assert.equal(playFocus,0,'bfcache must not focus Resume behind graphics settings');
 assert.equal(app.node('play').textContent,'이어하기');
 app.frame(120000);
 assert.equal(live.elapsed,elapsed,'a settings dialog cannot advance 60Hz simulation');
 assert.equal(store.get(KEY),saved,'bfcache settings focus does not write checkpoint');
 assert.equal(store.get('veilpoint.story.ch01'),'CH01-untouched');
 app.node('graphicsClose').click();
 assert.equal(panel.classList.contains('hidden'),true);
 app.node('play').click();app.frame(120000+1000/60);
 assert.equal(app.game,live,'closing settings returns to original paused BR world');
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.game.status,'playing');
});

test('BR normal bfcache resume focuses Play when the settings panel is closed',()=>{
 const app=boot(new Map());
 app.node('graphicsPanel').classList.add('hidden');
 app.node('play').click();app.frame(1000/60);
 app.emit('pagehide');
 let playFocus=0,graphicsFocus=0;
 app.node('play').focus=()=>{playFocus++;};
 app.node('graphicsClose').focus=()=>{graphicsFocus++;};
 app.emit('pageshow',{persisted:true});
 assert.equal(playFocus,1);
 assert.equal(graphicsFocus,0);
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
});

test('BR Windows GPU reset keeps visible graphics settings keyboard focus and world paused',()=>{
 const store=new Map([['veilpoint.story.ch01','CH01-unchanged']]),app=boot(store);
 const panel=app.node('graphicsPanel');panel.classList.add('hidden');
 app.node('play').click();app.frame(1000/60);
 const world=app.game,elapsed=world.elapsed;
 app.emit('keydown',{code:'Escape'});
 const saved=store.get(KEY);
 assert.ok(saved,'pausing BR must create a durable checkpoint');
 app.node('graphicsPauseOpen').click();
 assert.equal(panel.classList.contains('hidden'),false);
 let playFocused=0,settingsFocused=0;
 app.node('play').focus=()=>{playFocused++;};
 app.node('graphicsClose').focus=()=>{settingsFocused++;};
 app.node('scene').dispatch('webglcontextlost');
 assert.equal(app.node('play').disabled,true);
 app.frame(30000);
 assert.equal(world.elapsed,elapsed);
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,false);
 assert.equal(panel.classList.contains('hidden'),false);
 assert.equal(settingsFocused,1,'GPU recovery must focus foreground graphics settings');
 assert.equal(playFocused,0,'Resume behind an open settings panel cannot take keyboard focus');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(store.get(KEY),saved,'graphics rebuild does not overwrite durable BR checkpoint');
 assert.equal(store.get('veilpoint.story.ch01'),'CH01-unchanged');
 app.node('graphicsClose').click();
 app.node('play').click();app.frame(30000+1000/60);
 assert.equal(app.game,world,'explicit Resume returns to original BR world');
 assert.equal(app.game.status,'playing');
});

test('BR failed GPU rebuild keeps pause until a successful retry focuses Resume',()=>{
 const store=new Map(),app=boot(store);
 app.node('graphicsPanel').classList.add('hidden');
 app.node('play').click();app.frame(1000/60);
 const world=app.game,elapsed=world.elapsed;
 app.node('scene').dispatch('webglcontextlost');
 assert.equal(app.node('play').disabled,true);
 const saved=store.get(KEY);assert.ok(saved);
 app.global.VeilpointRenderer.failNext=true;
 let focusCount=0;app.node('play').focus=()=>{focusCount++;};
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,true,
   'failed device recreation must not enable game controls');
 assert.match(app.node('message').textContent,/GRAPHICS RECOVERY FAILED/);
 app.frame(100000);
 assert.equal(world.elapsed,elapsed);
 app.node('scene').dispatch('webglcontextrestored');
 assert.equal(app.node('play').disabled,false);
 assert.equal(focusCount,1,'a later recovery re-focuses the visible Resume button');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 assert.equal(store.get(KEY),saved);
 app.node('play').click();app.frame(100000+1000/60);
 assert.equal(app.game,world);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.game.status,'playing');
});

test('BR repeated random seed draws still create distinct and durable new PC rounds',()=>{
 const store=new Map(),app=boot(store,.8733);
 const seeds=[];
 app.node('play').click();app.frame(1000/60);
 seeds.push(app.game.seed);
 let last=store.get(KEY);
 assert.ok(last);
 for(let attempt=0;attempt<4;attempt++){
  app.node('newMatch').click();app.frame((attempt+2)*1000/60);
  const saved=store.get(KEY);
  assert.ok(saved&&saved!==last,
   'every explicit fresh round has a distinct recoverable checkpoint');
  assert.equal(JSON.parse(saved).seed,app.game.seed);
  seeds.push(app.game.seed);
  last=saved;
 }
 assert.equal(new Set(seeds).size,seeds.length,
  'a constant random source cannot produce identical rounds in the same tab');
});

test('BR denied reset preserves durable checkpoint and later recovery writes a different new generation',()=>{
 const key=KEY,previous=KEY+'.previous';
 class SilentRemove extends Map {
  blocked=false;
  delete(name){if(this.blocked&&name===key)return true;return super.delete(name);}
 }
 const store=new SilentRemove(),app=boot(store,.8733);
 app.node('play').click();app.frame(1000/60);
 const original=store.get(key),oldSeed=app.game.seed;
 store.set(previous,original);
 store.blocked=true;
 app.node('newMatch').click();app.frame(2000/60);
 assert.equal(store.get(key),original,'failed deletion must preserve the previous playable save');
 assert.match(app.node('message').textContent,/SAVE FAILED/);
 store.blocked=false;
 app.node('newMatch').click();app.frame(3000/60);
 assert.notEqual(store.get(key),original);
 assert.notEqual(app.game.seed,oldSeed);
 assert.equal(JSON.parse(store.get(key)).seed,app.game.seed);
});

test('BR restoring a saved round reserves its seed before a later New Match',()=>{
 const store=new Map();
 const first=boot(store,.1111);
 first.node('play').click();first.frame(1000/60);
 const saved=store.get(KEY),seed=first.game.seed;
 const reopened=boot(store,.1111);
 reopened.node('play').click();reopened.frame(1000/60);
 assert.equal(reopened.game.seed,seed);
 assert.equal(store.get(KEY),saved);
 reopened.node('newMatch').click();reopened.frame(2000/60);
 assert.notEqual(reopened.game.seed,seed);
 assert.notEqual(store.get(KEY),saved);
});


test('BR pause menu exports a validated live match without rotating the saved generations',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('blur');
 const primary=store.get(KEY),backup=store.get(KEY+'.previous');
 assert.equal(app.node('brExport').classList.contains('hidden'),false);
 app.node('brExport').click();
 assert.equal(app.node('brExportPanel').classList.contains('hidden'),false);
 const json=app.node('brExportText').value;
 const restored=app.global.VeilpointSim.restoreMatch(json);
 assert.equal(restored.seed,app.game.seed);
 assert.equal(restored.status,'playing');
 assert.equal(app.global.VeilpointSim.snapshotMatch(restored),json);
 assert.equal(store.get(KEY),primary);
 assert.equal(store.get(KEY+'.previous'),backup);
});

test('BR memory-only match can still create a portable, validated JSON snapshot',()=>{
 const denied={get:()=>null,set:()=>{throw Error('storage denied');},
  delete:()=>{throw Error('storage denied');}};
 const app=boot(denied);
 app.node('play').click();app.frame(1000/60);
 app.emit('blur');
 app.node('brExport').click();
 assert.equal(app.node('brExportPanel').classList.contains('hidden'),false);
 const raw=app.node('brExportText').value;
 assert.equal(app.global.VeilpointSim.restoreMatch(raw).status,'playing');
 assert.match(app.node('brExportStatus').textContent,/저장 기록은 변경하지/);
});

test('BR JSON backup requests a local file containing the exact paused snapshot',()=>{
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 app.emit('blur');app.node('brExport').click();
 const raw=app.node('brExportText').value;
 let blob=null,link=null,revoked=null;
 app.global.Blob=class{constructor(parts,config){this.parts=parts;this.type=config.type;blob=this;}};
 app.global.URL={
  createObjectURL(b){assert.equal(b,blob);return 'blob:veilpoint-br';},
  revokeObjectURL(url){revoked=url;}
 };
 app.global.setTimeout=cb=>{cb();return 1;};
 app.global.document.createElement=()=>({click(){link={href:this.href,download:this.download};}});
 app.node('brExportDownload').click();
 assert.deepEqual(link,{href:'blob:veilpoint-br',download:'VEILPOINT-BR-checkpoint.json'});
 assert.equal(blob.parts.join(''),raw);
 assert.match(blob.type,/application\/json/);
 assert.equal(revoked,'blob:veilpoint-br');
 assert.match(app.node('brExportStatus').textContent,/저장 요청 완료/);
});

test('BR export rejects stale game data and falls back to manual copy when downloads are denied',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);
 app.emit('blur');app.node('brExport').click();
 const raw=app.node('brExportText').value,primary=store.get(KEY);
 app.node('brExportDownload').click();
 assert.match(app.node('brExportStatus').textContent,/직접 복사/);
 assert.equal(app.node('brExportText').value,raw);
 app.game.player.x+=.125; // Simulate a changed world before stale file download.
 app.global.Blob=class{constructor(){throw Error('should never construct stale blob');}};
 app.node('brExportDownload').click();
 assert.match(app.node('brExportStatus').textContent,/직접 복사/);
 assert.equal(store.get(KEY),primary);
});

test('BR paused export panel closes on resume and new rounds, preserving 60Hz input reset',()=>{
 const app=boot();
 app.node('play').click();app.frame(1000/60);
 app.emit('blur');app.node('brExport').click();
 assert.ok(app.node('brExportText').value.length>100);
 app.node('play').click();
 assert.equal(app.node('brExportPanel').classList.contains('hidden'),true);
 assert.equal(app.node('brExport').classList.contains('hidden'),true);
 assert.equal(app.node('brExportText').value,'');
 assert.equal(app.global.VeilpointInput.forward,false);
 app.emit('blur');app.node('brExport').click();
 app.node('newMatch').click();
 assert.equal(app.node('brExportPanel').classList.contains('hidden'),true);
 assert.equal(app.node('brExport').classList.contains('hidden'),true);
 assert.equal(app.node('brExportText').value,'');
});

test('BR portable JSON export controls exist in the Windows overlay, not a network endpoint',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/id="brExport"[^>]*aria-controls="brExportPanel"/);
 assert.match(html,/id="brExportText"[^>]*readonly/);
 assert.match(html,/id="brExportDownload"/);
 assert.match(html,/id="brExportStatus"[^>]*aria-live="polite"/);
 const js=fs.readFileSync(path.join(ROOT,'src/app.js'),'utf8');
 assert.match(js,/Game\.snapshotMatch\(simulation\)/);
 assert.match(js,/Game\.restoreMatch\(raw\)/);
 assert.doesNotMatch(js,/fetch\(['"]https?:/);
});


test('BR local JSON from one browser restores as a separate paused match on another origin',()=>{
 const source=boot(new Map());
 source.node('play').click();source.frame(1000/60);source.emit('blur');
 source.node('brExport').click();
 const raw=source.node('brExportText').value;
 const destination=boot(new Map());
 destination.node('brImport').click();
 const field=destination.node('brImportText');
 field.value=raw;field.dispatch('input');
 destination.node('brImportApply').click();
 assert.equal(destination.node('brImportPanel').classList.contains('hidden'),true);
 assert.match(destination.node('selector-.tagline').textContent,/임시 경기/);
 assert.equal(destination.store.has(KEY),false,'portable load may not claim an automatic disk slot');
 assert.equal(destination.node('saveExit').classList.contains('hidden'),true);
 assert.equal(destination.node('brExport').classList.contains('hidden'),false);
 destination.node('play').click();destination.frame(1000/60);
 assert.equal(destination.game.seed,JSON.parse(raw).seed);
 assert.equal(destination.game.player.charges,JSON.parse(raw).player.charges);
 assert.equal(destination.game.status,'playing');
 assert.equal(destination.store.has(KEY),false,'resuming an isolated game never overwrites storage');
});

test('BR live paused match requires matching two-click confirmation to replace its world',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);app.emit('blur');
 const primary=store.get(KEY),prior=store.get(KEY+'.previous');
 const replacement=app.global.VeilpointSim.newMatch(20261231,1);
 replacement.status='playing';
 const raw=app.global.VeilpointSim.snapshotMatch(replacement);
 app.node('brImport').click();
 app.node('brImportText').value=raw;
 app.node('brImportApply').click();
 assert.match(app.node('brImportStatus').textContent,/다시 눌러 확정/);
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),false);
 assert.equal(store.get(KEY),primary);
 assert.equal(store.get(KEY+'.previous'),prior);
 app.node('brImportApply').click();
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),true);
 assert.equal(store.get(KEY),primary);
 assert.equal(store.get(KEY+'.previous'),prior);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.game.seed,20261231);
 assert.equal(store.get(KEY),primary);
});

test('BR JSON editing or malformed input cannot reuse an earlier replacement confirmation',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);app.emit('blur');
 const primary=store.get(KEY);
 const mk=seed=>{
  const state=app.global.VeilpointSim.newMatch(seed,1);
  state.status='playing';return app.global.VeilpointSim.snapshotMatch(state);
 };
 const first=mk(20261231),second=mk(20261232);
 app.node('brImport').click();
 const field=app.node('brImportText');
 field.value=first;app.node('brImportApply').click();
 assert.match(app.node('brImportStatus').textContent,/다시 눌러 확정/);
 field.value='{invalid JSON';
 app.node('brImportApply').click();
 assert.match(app.node('brImportStatus').textContent,/불러오기 거부/);
 field.value=first;
 app.node('brImportApply').click();
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),false);
 field.value=second;field.dispatch('input');
 app.node('brImportApply').click();
 assert.match(app.node('brImportStatus').textContent,/다시 눌러 확정/);
 assert.equal(store.get(KEY),primary);
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),false);
});

test('BR selected file is staged but not applied; later manual paste wins file-read race',async()=>{
 const store=new Map(),app=boot(store);
 const state=app.global.VeilpointSim.newMatch(20261240,1);state.status='playing';
 const raw=app.global.VeilpointSim.snapshotMatch(state);
 app.node('brImport').click();
 let resolveFile;
 app.node('brImportFile').dispatch('change',{target:{files:[{
  size:Buffer.byteLength(raw),text:()=>new Promise(resolve=>{resolveFile=resolve;})
 }]}});
 assert.equal(typeof resolveFile,'function');
 app.node('brImportText').value=raw;
 app.node('brImportText').dispatch('input');
 resolveFile('{"version":999,"invalid":true}');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.node('brImportText').value,raw);
 assert.equal(store.has(KEY),false);
 app.node('brImportApply').click();
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),true);
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.game.seed,20261240);
});

test('BR oversized and malformed portable checkpoint files fail without mutating storage',async()=>{
 const store=new Map(),app=boot(store);
 app.node('brImport').click();
 let opened=false;
 app.node('brImportFile').dispatch('change',{target:{files:[{
  size:131073,text:()=>{opened=true;return Promise.resolve('{}');}
 }]}});
 await Promise.resolve();
 assert.equal(opened,false,'bounded file size must be checked before reading');
 assert.match(app.node('brImportStatus').textContent,/읽기 실패/);
 app.node('brImportText').value='{"version":1,"status":"playing","player":{"shield":100}}';
 app.node('brImportApply').click();
 assert.match(app.node('brImportStatus').textContent,/불러오기 거부/);
 assert.equal(store.has(KEY),false);
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),false);
});

test('BR existing persistent save and field bookmark survive a foreign portable load',()=>{
 const store=new Map(),original=boot(store);
 original.node('play').click();original.frame(1000/60);original.emit('blur');
 const prior=store.get(KEY);
 store.set(KEY+'.previous',prior);
 store.set('veilpoint.brFieldBookmark.v1','protected-bookmark');
 const state=original.global.VeilpointSim.newMatch(20261241,1);
 state.status='playing';
 const json=original.global.VeilpointSim.snapshotMatch(state);
 const reopened=boot(store);
 reopened.node('brImport').click();
 reopened.node('brImportText').value=json;
 reopened.node('brImportApply').click();
 assert.equal(reopened.node('brImportPanel').classList.contains('hidden'),true);
 reopened.node('play').click();reopened.frame(1000/60);
 assert.equal(reopened.game.seed,20261241);
 assert.equal(store.get(KEY),prior);
 assert.equal(store.get(KEY+'.previous'),prior);
 assert.equal(store.get('veilpoint.brFieldBookmark.v1'),'protected-bookmark');
 reopened.emit('blur');
 assert.equal(store.get(KEY),prior,'memory-only auto-save can never own the protected slot');
});

test('BR file selection, menu resume and new match cancel stale async checkpoint reads',async()=>{
 const app=boot(),s=app.global.VeilpointSim.newMatch(20261242,1);
 s.status='playing';const raw=app.global.VeilpointSim.snapshotMatch(s);
 app.node('brImport').click();
 let late;
 app.node('brImportFile').dispatch('change',{target:{files:[{
  size:Buffer.byteLength(raw),text:()=>new Promise(resolve=>{late=resolve;})
 }]}});
 app.node('brImport').click();
 late(raw);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.node('brImportText').value,'');
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),false);
 app.node('brImportText').value=raw;app.node('brImportApply').click();
 app.node('play').click();app.frame(1000/60);
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),true);
 assert.equal(app.node('brImportText').value,'');
 app.emit('blur');
 app.node('brImport').click();
 app.node('newMatch').click();
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),true);
 assert.equal(app.node('brImportText').value,'');
});

test('BR Windows offline UI has deliberate file input and no auto-applied raw JSON',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/id="brImport"[^>]*aria-controls="brImportPanel"/);
 assert.match(html,/id="brImportFile"[^>]*type="file"[^>]*accept=/);
 assert.match(html,/id="brImportApply"[^>]*type="button"/);
 assert.match(html,/id="brImportText"/);
 const code=fs.readFileSync(path.join(ROOT,'src/app.js'),'utf8');
 assert.match(code,/brImportFile'\)\.addEventListener\('change',async/);
 assert.match(code,/brImportApply'\)\.addEventListener\('click'/);
 assert.match(code,/candidate=Game\.restoreMatch\(text\)/);
 assert.match(code,/memoryOnlyMatch=true/);
});


test('BR fixed-height main and advanced screens switch without losing the initial menu',()=>{
 const app=boot();
 assert.equal(app.node('brViewMore').classList.contains('hidden'),false);
 assert.equal(app.node('brViewBack').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),false);
 app.node('brViewMore').click();
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),true);
 assert.equal(app.node('brViewMore').classList.contains('hidden'),true);
 assert.equal(app.node('brViewBack').classList.contains('hidden'),false);
 // The real initial HTML closes graphics; the lazy VM DOM needs that class.
 app.node('graphicsPanel').classList.add('hidden');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),false);
 assert.equal(app.node('brViewMore').classList.contains('hidden'),false);
 assert.equal(app.node('brViewBack').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
});

test('BR paused JSON import is its own screen; Back and Escape never resume the round',()=>{
 const store=new Map(),app=boot(store);
 app.node('play').click();app.frame(1000/60);app.emit('blur');
 const saved=store.get(KEY);
 app.node('brViewMore').click();
 app.node('brImport').click();
 assert.equal(app.node('overlay').classList.contains('menu-view-load'),true);
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),false);
 app.node('brImportText').value='example';
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),true);
 assert.equal(app.node('overlay').classList.contains('menu-view-load'),false);
 assert.equal(app.node('brImportPanel').classList.contains('hidden'),true);
 assert.equal(app.node('brImportText').value,'');
 assert.equal(store.get(KEY),saved);
 assert.equal(app.node('overlay').classList.contains('hidden'),false,
  'closing subpage must not resume a paused game');
 app.emit('keydown',{code:'Escape'});
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),false);
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
 app.node('play').click();app.frame(2000/60);
 assert.equal(app.node('overlay').classList.contains('hidden'),true);
 assert.equal(app.node('brViewBack').classList.contains('hidden'),true);
});

test('BR paused JSON export has its own fitted page, with explicit return to advanced menu',()=>{
 const app=boot();
 app.node('play').click();app.frame(1000/60);app.emit('blur');
 app.node('brViewMore').click();
 app.node('brExport').click();
 assert.equal(app.node('overlay').classList.contains('menu-view-export'),true);
 assert.equal(app.node('brExportPanel').classList.contains('hidden'),false);
 assert.ok(app.node('brExportText').value.length>100);
 app.node('brViewBack').click();
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),true);
 assert.equal(app.node('overlay').classList.contains('menu-view-export'),false);
 assert.equal(app.node('brExportPanel').classList.contains('hidden'),true);
 assert.equal(app.node('brExportText').value,'');
 assert.equal(app.node('overlay').classList.contains('hidden'),false);
});

test('BR menu navigation invalidates a late file.read so it cannot overwrite a second screen',async()=>{
 const app=boot();
 app.node('brViewMore').click();
 app.node('brImport').click();
 let done;
 app.node('brImportFile').dispatch('change',{target:{files:[{
  size:400,text:()=>new Promise(resolve=>{done=resolve;})
 }]}});
 assert.equal(typeof done,'function');
 app.node('brViewBack').click();
 assert.equal(app.node('overlay').classList.contains('menu-view-more'),true);
 app.node('brImport').click();
 assert.equal(app.node('brImportText').value,'');
 done('{"version":1,"fake":true}');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.node('brImportText').value,'');
 assert.equal(app.node('overlay').classList.contains('menu-view-load'),true);
 assert.equal(app.store.has(KEY),false);
});


test('BR graphics settings tabs switch entire screens without resuming paused world or changing disk save',()=>{
 const store=new Map(),app=boot(store);
 app.node('graphicsPanel').classList.add('hidden');
 app.node('play').click();app.frame(1000/60);app.emit('blur');
 const saved=store.get(KEY),frameBefore=app.game.elapsed;
 app.node('graphicsPauseOpen').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
 assert.equal(app.node('graphicsVisualPage').classList.contains('hidden'),false);
 assert.equal(app.node('graphicsControlsPage').classList.contains('hidden'),true);
 assert.equal(app.node('graphicsBenchmarkPage').classList.contains('hidden'),true);
 app.node('graphicsTabControls').click();
 assert.equal(app.node('graphicsVisualPage').classList.contains('hidden'),true);
 assert.equal(app.node('graphicsControlsPage').classList.contains('hidden'),false);
 assert.equal(app.node('graphicsBenchmarkPage').classList.contains('hidden'),true);
 assert.equal(app.node('graphicsTabControls').tabIndex,0);
 app.node('graphicsTabBenchmark').click();
 assert.equal(app.node('graphicsControlsPage').classList.contains('hidden'),true);
 assert.equal(app.node('graphicsBenchmarkPage').classList.contains('hidden'),false);
 app.node('graphicsTabVisual').click();
 assert.equal(app.node('graphicsVisualPage').classList.contains('hidden'),false);
 assert.equal(app.node('graphicsTabVisual').tabIndex,0);
 app.frame(2000/60);
 assert.equal(app.game.elapsed,frameBefore,'settings navigation must freeze 60Hz game');
 assert.equal(store.get(KEY),saved,'tab navigation must not write a checkpoint');
 app.node('graphicsClose').click();
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),true);
 assert.equal(app.node('overlay').classList.contains('hidden'),false,'closing tabs must not resume BR');
});

test('BR reopened PC settings defaults to visual screen while retaining changed controls',()=>{
 const app=boot();
 app.node('graphicsPanel').classList.add('hidden');
 app.node('graphicsPauseOpen').click();
 app.node('graphicsTabControls').click();
 const select=app.node('desktopSensitivity');
 select.value='1.5';select.dispatch('change');
 app.node('graphicsClose').click();
 app.node('graphicsPauseOpen').click();
 assert.equal(app.node('graphicsVisualPage').classList.contains('hidden'),false);
 assert.equal(app.node('graphicsControlsPage').classList.contains('hidden'),true);
 assert.equal(app.node('graphicsBenchmarkPage').classList.contains('hidden'),true);
 assert.equal(select.value,'1.5');
 assert.equal(app.node('graphicsPanel').classList.contains('hidden'),false);
});
