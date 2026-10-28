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
 for(const file of ['src/simulation.js','src/visibility.js','src/performance.js','src/graphics.js','src/clock.js','src/fps.js','src/app.js'])
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
