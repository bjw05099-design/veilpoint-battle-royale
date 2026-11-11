'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');

function rig(){
 const prior=global.window,queue=new Map(),handlers=new Map(),buttons=new Map();
 const stats={paint:0,cancelled:0};let nextId=0;
 const ctx={fillRect(){stats.paint++},strokeRect(){},beginPath(){},
  moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext(){return ctx;}},status={textContent:''};
 const doc={hidden:false,
  addEventListener(k,f){handlers.set(k,f);},
  getElementById(k){
   if(k==='terrainCanvas')return canvas;
   if(k==='tileStatus')return status;
   if(!buttons.has(k))buttons.set(k,{setAttribute(){},addEventListener(){}});
   return buttons.get(k);
  }
 };
 global.window={
  addEventListener(k,fn){handlers.set(k,fn);},
  requestAnimationFrame(fn){const id=++nextId;queue.set(id,fn);return id;},
  cancelAnimationFrame(id){if(queue.delete(id))stats.cancelled++;}
 };
 const app=Explorer.attach(doc);
 function frame(time){
  assert.ok(queue.size>0,'real game-mode RAF must be scheduled');
  const [id,fn]=queue.entries().next().value;queue.delete(id);fn(time);
 }
 function key(type,key){
  const e={key,target:{tagName:'DIV'},preventDefault(){}};
  handlers.get(type)(e);
 }
 function dispose(){
  if(prior===undefined)delete global.window;
  else global.window=prior;
 }
 return{app,queue,handlers,doc,stats,frame,key,dispose};
}
test('loaded civic street residents continue their real fixed-step walk while player stands without WASD',()=>{
 const h=rig();
 try{
  assert.equal(h.app.toggleWalking(),true);
  const resident=h.app.getCivicWalkers();
  assert.ok(resident.length>=4);
  assert.equal(h.queue.size,1,'walking mode starts a live civilian animation clock');
  const player=h.app.getWalk();
  const firstPaint=h.stats.paint;
  for(let i=0;i<70;i++)h.frame(1000+i*(1000/60));
  const after=h.app.getCivicWalkers();
  assert.ok(h.app.getWalk().tick>=60);
  assert.equal(h.app.getWalk().x,player.x);
  assert.equal(h.app.getWalk().z,player.z);
  assert.ok(after.some(a=>{
   const original=resident.find(x=>x.id===a.id);
   return original&&Math.hypot(original.x-a.x,original.z-a.z)>.25;
  }),'simulated civilians must move while the player is still');
  assert.ok(h.stats.paint>firstPaint,'idle civilian animation is visibly repainted');
  assert.ok(h.queue.size===1,'civilian life continues until the user exits walk mode');
  assert.equal(h.app.toggleWalking(),false);
  assert.equal(h.queue.size,0);
  assert.equal(h.app.getCivicWalkers().length,0);
 }finally{h.dispose();}
});
test('release of WASD leaves civilian life animated without drifting the player, then input resumes',()=>{
 const h=rig();
 try{
  h.app.toggleWalking();
  h.key('keydown','d');
  for(let i=0;i<12;i++)h.frame(1000+i*17);
  const moved=h.app.getWalk();
  assert.ok(moved.x>0);
  h.key('keyup','d');
  for(let i=12;i<44;i++)h.frame(1000+i*17);
  const still=h.app.getWalk();
  assert.equal(still.x,moved.x);
  assert.ok(still.tick>moved.tick,'world continues running after movement stops');
  h.key('keydown','d');
  for(let i=44;i<57;i++)h.frame(1000+i*17);
  assert.ok(h.app.getWalk().x>moved.x);
 }finally{h.dispose();}
});
test('window hiding cancels real ambient simulation and avoids catch-up teleport on return',()=>{
 const h=rig();
 try{
  h.app.toggleWalking();
  for(let i=0;i<14;i++)h.frame(1000+i*17);
  const last=h.app.getWalk(),civilians=h.app.getCivicWalkers();
  h.doc.hidden=true;h.handlers.get('visibilitychange')();
  assert.equal(h.queue.size,0);
  assert.ok(h.stats.cancelled>0);
  h.doc.hidden=false;h.handlers.get('visibilitychange')();
  // A new player action reactivates the previous local simulated world.
  h.key('keydown','d');
  h.frame(20000);
  assert.equal(h.app.getWalk().tick,last.tick,
   'background wall-clock time must not be replayed as thousands of game ticks');
  h.frame(20017);
  assert.ok(h.app.getWalk().tick<=last.tick+2);
  for(const now of h.app.getCivicWalkers()){
   const prev=civilians.find(x=>x.id===now.id);
   assert.ok(Math.hypot(now.x-prev.x,now.z-prev.z)<=2*1.7/60+1e-6);
  }
 }finally{h.dispose();}
});
