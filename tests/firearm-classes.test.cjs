'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');
const ids=['carbine','compact','marksman','shotgun','support','sidearm','precision'];
test('seven original firearm profiles have distinct finite loadouts and reject unknown IDs',()=>{
 assert.deepEqual(Object.keys(Sim.FIREARMS),ids);
 assert.throws(()=>Sim.newMatch(1,0,'__proto__'),RangeError);
 for(const id of ids){
  const profile=Sim.FIREARMS[id],g=Sim.newMatch(1,0,id);
  assert.equal(g.player.weaponId,id);
  assert.equal(g.player.loaded,profile.magazine);
  assert.equal(g.player.charges,profile.initialRounds);
  assert.ok(g.player.maxCharges>=g.player.charges);
  assert.ok(Object.isFrozen(profile));
 }
});
test('class-specific shot damage, cadence and finite magazines do not leak ammunition',()=>{
 for(const id of ids){
  const profile=Sim.FIREARMS[id],g=Sim.newMatch(4,1,id);
  g.status='playing';g.player.x=0;g.player.z=0;g.player.yaw=0;
  const b=g.bots[0];b.x=0;b.z=-12;b.health=100;
  const shot=Sim.tag(g);assert.equal(shot.ok,true);assert.equal(shot.hit,true);
  assert.equal(b.health,100-profile.damage);
  assert.equal(g.player.loaded,profile.magazine-1);
  assert.equal(g.player.charges,profile.initialRounds-1);
  assert.equal(Sim.tag(g).reason,'cooldown');
  g.elapsed+=profile.fireInterval+1/60;
  assert.equal(Sim.tag(g).ok,true);
  assert.equal(g.player.charges,profile.initialRounds-2);
 }
});
test('all class reloads conserve rounds, enforce own magazine size and stress assist',()=>{
 for(const id of ids){
  const profile=Sim.FIREARMS[id],g=Sim.newMatch(8,1,id);
  g.status='playing';const p=g.player;
  p.loaded=1;p.charges=profile.magazine+2;p.stress=90;
  const result=Sim.reload(g);
  assert.equal(result.duration,profile.reloadSeconds+Sim.RELOAD_HESITATION_SECONDS);
  assert.equal(result.hesitation,true);
  assert.equal(Sim.tag(g).reason,'reloading');
  for(let i=0;i<250;i++)Sim.advanceReload(g,1/60);
  assert.equal(p.loaded,profile.magazine);
  assert.equal(p.charges,profile.magazine+2);
  p.loaded=1;Sim.setReloadAssist(g,true);
  const assisted=Sim.reload(g);
  assert.equal(assisted.hesitation,false);
  assert.equal(assisted.duration,profile.reloadSeconds);
  for(let i=0;i<250;i++)Sim.advanceReload(g,1/60);
  assert.equal(p.charges,profile.magazine+2);
 }
});
test('class movement differences are deterministic at fixed 60Hz and obey collisions',()=>{
 const results=[];
 for(const id of ids){
  const a=Sim.newMatch(91,1,id),b=Sim.newMatch(91,1,id);
  a.status=b.status='playing';
  for(let i=0;i<60;i++){Sim.tick(a,1/60,{forward:true});Sim.tick(b,1/60,{forward:true});}
  assert.equal(a.player.z,b.player.z);
  results.push(a.player.z);
 }
 assert.ok(results[1]<results[0]&&results[0]<results[2]);
});
test('CH01 default carbine and its checkpoint format remain unchanged',()=>{
 const s=Story.createState(),p=s.world.player;
 assert.equal(p.weaponId,'carbine');
 assert.equal(p.loaded,Sim.MAGAZINE_SIZE);
 const restored=Story.restore(Story.serialize(s));
 assert.equal(restored.world.player.weaponId,'carbine');
 assert.equal(Story.serialize(restored),Story.serialize(s));
});

test('BR pickups reject incompatible class ammunition without consumption or resource creation',()=>{
 for(const id of ids){
  const g=Sim.newMatch(222,0,id);g.status='playing';
  g.loot.forEach(item=>{item.x=100;item.z=100;});
  const incompatible=g.loot.find(item=>item.weaponId!==id);
  const compatible=g.loot.find(item=>item.weaponId===id);
  const before=g.player.charges;
  incompatible.x=0;incompatible.z=0;
  assert.equal(Sim.pickup(g),null);
  assert.equal(incompatible.picked,false);
  assert.equal(g.player.charges,before);
  assert.match(g.message,/INCOMPATIBLE/);
  incompatible.x=100;incompatible.z=100;
  compatible.x=0;compatible.z=0;
  assert.equal(Sim.pickup(g),compatible.kind);
  assert.equal(compatible.picked,true);
  assert.ok(g.player.charges>before&&g.player.charges<=g.player.maxCharges);
  const after=g.player.charges;
  assert.equal(Sim.pickup(g),null);
  assert.equal(g.player.charges,after);
 }
});

test('short-range profile cannot damage distant opponents; all seven classes use bounded sight',()=>{
 for(const id of ids){
  const g=Sim.newMatch(240,1,id);g.status='playing';
  const p=g.player,b=g.bots[0];p.x=0;p.z=0;p.yaw=0;p.pitch=0;
  b.x=0;b.z=-60;b.health=100;
  const hit=Sim.tag(g);
  assert.equal(hit.ok,true);
  assert.equal(hit.hit,60<Sim.FIREARMS[id].range);
  assert.equal(b.health,hit.hit?100-Sim.FIREARMS[id].damage:100);
  assert.equal(p.charges,Sim.FIREARMS[id].initialRounds-1,'misses also spend finite ammunition');
 }
});
test('each newly introduced class is selectable in BR and CH01 and survives a CH01 checkpoint',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const br=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const story=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 for(const id of ids){
  assert.match(br,new RegExp('<option value="'+id+'">'));
  assert.match(story,new RegExp('<option value="'+id+'">'));
  const state=Story.createState(id);
  assert.equal(state.world.player.weaponId,id);
  const restored=Story.restore(Story.serialize(state));
  assert.equal(restored.world.player.weaponId,id);
  assert.equal(restored.world.player.charges,Sim.FIREARMS[id].initialRounds);
  assert.equal(restored.world.player.loaded,Sim.FIREARMS[id].magazine);
 }
});
test('every class receives physically finite, compatible BR pickups without respawning',()=>{
 for(const id of ids){
  const g=Sim.newMatch(241,0,id);g.status='playing';
  const p=g.player;
  assert.ok(g.loot.some(item=>item.weaponId===id),'each class has map ammunition');
  g.loot.forEach(item=>{item.x=120;item.z=120;});
  const compatible=g.loot.find(item=>item.weaponId===id);
  compatible.x=p.x;compatible.z=p.z;
  p.charges=p.loaded;
  const before=p.charges;
  assert.equal(Sim.pickup(g),compatible.kind);
  assert.ok(p.charges>before&&p.charges<=p.maxCharges);
  const after=p.charges;
  assert.equal(Sim.pickup(g),null);
  assert.equal(p.charges,after);
 }
});

test('all seven classes preserve 60Hz seeded combat replay including a miss and reload',()=>{
 for(const id of ids){
  const run=()=>{
   const g=Sim.newMatch(242,1,id);g.status='playing';
   g.bots[0].x=0;g.bots[0].z=-12;
   g.player.yaw=0;
   const events=[];
   for(let frame=0;frame<150;frame++){
    if(frame===0||frame===45||frame===90)events.push(Sim.tag(g));
    if(frame===95)events.push(Sim.reload(g));
    Sim.tick(g,1/60,{forward:frame%60<20,sprint:false});
   }
   return {events,health:g.player.health,ammo:g.player.charges,
    loaded:g.player.loaded,reloadRemaining:g.player.reloadRemaining,
    bot:g.bots.map(b=>({x:b.x,z:b.z,health:b.health,loaded:b.loaded,charges:b.charges})),
    elapsed:g.elapsed};
  };
  assert.deepEqual(run(),run(),id+' must be deterministic');
 }
});
