const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/simulation.js');
test('seeded maps and opponents reproduce',()=>{
 const a=S.newMatch(301,18),b=S.newMatch(301,18);
 assert.deepEqual(a.bots.map(({x,z})=>({x,z})),b.bots.map(({x,z})=>({x,z})));
});
test('movement is collision-clamped',()=>{
 const a=S.newMatch(2,0), p=a.player; a.status='playing';p.x=174;p.z=0;p.yaw=Math.PI/2;
 S.tick(a,0.05,{forward:true,sprint:true});assert.ok(p.x<=174.2);
});
test('phase radius always decreases',()=>{
 let prev=Infinity;for(let t=0;t<450;t+=3){const r=S.phaseAt(t).radius;assert.ok(r<=prev);prev=r;}
});
test('battle royale damage directly affects health even if legacy shield is injected',()=>{
 const a=S.newMatch(2,0);
 assert.equal(a.player.shield,0);
 a.player.shield=90;
 S.receiveDamage(a,50);
 assert.equal(a.player.shield,0);
 assert.equal(a.player.health,50);
 S.receiveDamage(a,50);
 assert.equal(a.player.health,0);
 assert.equal(a.player.alive,false);
 assert.equal(a.status,'lost');
});
test('tag consumes one charge and rejects rapid repeats',()=>{
 const a=S.newMatch(2,0);a.status='playing';const count=a.player.charges;
 assert.equal(S.tag(a).ok,true);assert.equal(a.player.charges,count-1);
 assert.equal(S.tag(a).reason,'cooldown');
});
test('all battle royale pickups are finite ammunition and cannot instantly restore health or shield',()=>{
 const a=S.newMatch(2,0);a.status='playing';a.player.health=35;a.player.charges=25;
 assert.equal(a.loot.length,40);
 assert.ok(a.loot.every(x=>x.kind==='ammo'||x.kind==='magazine'));
 a.loot.forEach(item=>{item.x=130;item.z=130;});
 const ammo=a.loot.find(x=>x.kind==='ammo');ammo.x=0;ammo.z=0;
 assert.equal(S.pickup(a),'ammo');assert.equal(a.player.charges,37);
 assert.equal(a.player.health,35);assert.equal(a.player.shield,0);
 assert.equal(S.pickup(a),null);
 const magazine=a.loot.find(x=>x.kind==='magazine'&&x.weaponId===a.player.weaponId);magazine.x=0;magazine.z=0;
 assert.equal(S.pickup(a),'magazine');assert.equal(a.player.charges,60);
 assert.equal(a.player.health,35);assert.equal(a.player.shield,0);
 const next=a.loot.find(x=>!x.picked);next.x=0;next.z=0;
 assert.equal(S.pickup(a),null);
 assert.equal(next.picked,false);
});
test('victory when all rivals eliminated',()=>{
 const a=S.newMatch(2,0);a.status='playing';S.tick(a,0.03,{});assert.equal(a.status,'won');
});
test('world obstacles block crossing',()=>{
 const a=S.newMatch(2,0);const b=a.obstacles[0];assert.equal(S.blocked(b.x,b.z,1,a.obstacles),true);
});

test('offline BR map keeps opponents undisclosed by the minimap UI',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(app,/for\(const bot of simulation\.bots\)/);
 assert.doesNotMatch(html,/id="shieldNum"|id="shieldBar"/);
 assert.match(html,/MAGAZINE \/ RESERVE/);
});

test('opponents cannot track or chase the player through solid buildings',()=>{
 const a=S.newMatch(301,1),b=a.bots[0],p=a.player;
 a.status='playing';
 b.x=-85;b.z=-100;b.angle=0;b.moveTime=999;b.actionTime=0;
 p.x=-85;p.z=-52;p.health=100;
 assert.equal(S.lineBlocked(b.x,b.z,p.x,p.z,a.obstacles),true);
 S.tick(a,1/60,{});
 assert.equal(b.angle,0);
 assert.equal(p.health,100);
});
test('visible nearby players can still influence opponent orientation',()=>{
 const a=S.newMatch(301,1),b=a.bots[0],p=a.player;
 a.status='playing';
 b.x=0;b.z=-25;b.angle=2;b.moveTime=999;b.actionTime=999;
 p.x=0;p.z=0;
 assert.equal(S.lineBlocked(b.x,b.z,p.x,p.z,a.obstacles),false);
 S.tick(a,1/60,{});
 assert.ok(b.angle>2);
});
test('browser firing feedback never reveals hidden hit confirmation',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(app,/TARGET TAGGED|SCANNING \/ CLEAR|result\.hit\?710/);
 assert.match(app,/SHOT FIRED/);
 assert.match(html,/CLICK — FIRE/);
});

test('opponents use finite magazines and cannot attack after exhausting carried rounds',()=>{
 const g=S.newMatch(314,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=0;p.z=0;b.x=0;b.z=-20;b.moveTime=999;b.actionTime=0;b.skill=1;
 b.angle=Math.PI;b.loaded=1;b.charges=1;
 S.tick(g,1/60,{});
 assert.equal(b.loaded,0);assert.equal(b.charges,0);
 assert.ok(p.health<100);
 assert.ok(g.effects.some(e=>e.type==='hostile'));
 const health=p.health;
 for(let i=0;i<240;i++)S.tick(g,1/60,{});
 assert.equal(p.health,health);
 assert.equal(b.loaded,0);assert.equal(b.charges,0);
 assert.equal(b.reloadRemaining,0);
});
test('opponent reload blocks shots for a fixed 60Hz interval without creating ammo',()=>{
 const g=S.newMatch(315,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=0;p.z=0;b.x=0;b.z=-20;b.moveTime=999;b.actionTime=0;b.skill=1;
 b.angle=Math.PI;b.loaded=0;b.charges=2;
 S.tick(g,1/60,{});
 assert.equal(b.reloadRemaining,S.RELOAD_SECONDS);
 for(let i=0;i<100;i++)S.tick(g,1/60,{});
 assert.equal(b.loaded,0);assert.equal(p.health,100);
 let reloadFrames=0;
 while(b.reloadRemaining>0&&reloadFrames<120){S.tick(g,1/60,{});reloadFrames++;}
 assert.ok(100+reloadFrames>=108&&100+reloadFrames<=109);
 assert.equal(b.reloadRemaining,0);assert.equal(b.loaded,2);
 assert.equal(b.charges,2);assert.equal(p.health,100);
 S.tick(g,1/60,{});
 assert.equal(b.loaded,1);assert.equal(b.charges,1);
 assert.ok(p.health<100);
});
test('opponent finite-ammunition simulation is reproducible at fixed 60Hz',()=>{
 const make=()=>{const g=S.newMatch(316,1),b=g.bots[0];g.status='playing';
   g.player.x=0;g.player.z=0;b.x=0;b.z=-20;b.moveTime=999;b.actionTime=0;
   b.angle=Math.PI;b.loaded=2;b.charges=4;return g;};
 const a=make(),b=make();
 for(let i=0;i<300;i++){S.tick(a,1/60,{});S.tick(b,1/60,{});}
 const snapshot=g=>({health:g.player.health,bot:{loaded:g.bots[0].loaded,charges:g.bots[0].charges,
   reloadRemaining:g.bots[0].reloadRemaining,actionTime:g.bots[0].actionTime,x:g.bots[0].x,z:g.bots[0].z},elapsed:g.elapsed});
 assert.deepEqual(snapshot(a),snapshot(b));
 assert.ok(a.bots[0].charges<=4);
});

test('opponents do not detect or damage a player behind their field of view',()=>{
 const g=S.newMatch(401,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=0;p.z=0;b.x=0;b.z=-20;b.angle=0;b.moveTime=999;b.actionTime=0;b.skill=1;
 for(let i=0;i<60;i++)S.tick(g,1/60,{});
 assert.equal(p.health,100);assert.equal(b.charges,36);assert.equal(b.loaded,12);
 b.angle=Math.PI;
 S.tick(g,1/60,{});
 assert.ok(p.health<100);assert.equal(b.charges,35);
});
test('opponents cannot fire during their gradual turn into alignment',()=>{
 const g=S.newMatch(402,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=0;p.z=0;b.x=0;b.z=-20;b.angle=2;b.moveTime=999;b.actionTime=0;b.skill=1;
 S.tick(g,1/60,{});
 assert.equal(p.health,100);assert.equal(b.charges,36);
 for(let i=0;i<120;i++)S.tick(g,1/60,{});
 assert.ok(b.charges<36,'aligned opponent should eventually be able to fire');
 assert.ok(p.health<100);
});

test('rival AI firefights obey sight, aim and finite ammunition without player hit leakage',()=>{
 const g=S.newMatch(501,2),[a,b]=g.bots;g.status='playing';
 g.player.x=0;g.player.z=75;
 a.x=-10;a.z=-20;b.x=10;b.z=-20;
 a.angle=Math.PI/2;b.angle=-Math.PI/2;
 a.moveTime=b.moveTime=999;a.actionTime=b.actionTime=0;a.skill=b.skill=1;
 S.tick(g,1/60,{});
 assert.equal(a.charges,35);assert.equal(b.charges,35);
 assert.ok(a.health<100&&b.health<100,'rivals must damage each other');
 assert.equal(g.player.health,100);
 assert.equal(g.kills,0,'AI eliminations are not credited to the player');
 assert.equal(g.effects.filter(e=>e.type==='hostile').length,2);
});
test('rivals cannot detect or shoot through buildings',()=>{
 const g=S.newMatch(502,2),[a,b]=g.bots;g.status='playing';
 g.player.x=0;g.player.z=75;
 a.x=-85;a.z=-100;b.x=-85;b.z=-52;
 a.angle=Math.PI;b.angle=0;
 a.moveTime=b.moveTime=999;a.actionTime=b.actionTime=0;a.skill=b.skill=1;
 assert.equal(S.lineBlocked(a.x,a.z,b.x,b.z,g.obstacles),true);
 for(let i=0;i<60;i++)S.tick(g,1/60,{});
 assert.equal(a.health,100);assert.equal(b.health,100);
 assert.equal(a.charges,36);assert.equal(b.charges,36);
});
test('rival eliminations advance the offline match without awarding fake player kills',()=>{
 const g=S.newMatch(503,2),[a,b]=g.bots;g.status='playing';
 g.player.x=0;g.player.z=75;
 a.x=-10;a.z=-20;b.x=10;b.z=-20;
 a.angle=Math.PI/2;b.angle=-Math.PI/2;
 a.moveTime=b.moveTime=999;a.actionTime=b.actionTime=0;
 a.skill=1;b.skill=0;b.health=1;b.loaded=0;b.charges=0;
 S.tick(g,1/60,{});
 assert.equal(b.alive,false);assert.equal(b.health,0);
 assert.equal(g.kills,0);assert.equal(S.getAliveCount(g),2);
 g.player.x=0;g.player.z=-20;g.player.yaw=-Math.PI/2;
 for(let i=0;i<3;i++){g.elapsed+=.21;assert.equal(S.tag(g).hit,true);}
 S.tick(g,1/60,{});
 assert.equal(g.status,'won');assert.equal(g.kills,1);
});
test('rival combat and ammo transitions replay identically at fixed 60Hz',()=>{
 const make=()=>{
  const g=S.newMatch(504,2),[a,b]=g.bots;g.status='playing';
  g.player.x=0;g.player.z=75;
  a.x=-10;a.z=-20;b.x=10;b.z=-20;
  a.angle=Math.PI/2;b.angle=-Math.PI/2;
  a.moveTime=b.moveTime=999;a.actionTime=b.actionTime=0;
  return g;
 };
 const a=make(),b=make();
 for(let i=0;i<300;i++){S.tick(a,1/60,{});S.tick(b,1/60,{});}
 const snapshot=g=>({status:g.status,elapsed:g.elapsed,kills:g.kills,health:g.player.health,
  bots:g.bots.map(({x,z,health,alive,angle,loaded,charges,reloadRemaining,actionTime})=>
   ({x,z,health,alive,angle,loaded,charges,reloadRemaining,actionTime}))});
 assert.deepEqual(snapshot(a),snapshot(b));
 assert.ok(a.bots.some(x=>x.charges<36),'at least one rival must spend ammo');
});
test('an opponent eliminated by the zone cannot fire on its death frame',()=>{
 const g=S.newMatch(505,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=165;p.z=0;b.x=171;b.z=0;b.angle=-Math.PI/2;
 b.health=.001;b.actionTime=0;b.moveTime=999;b.skill=1;
 S.tick(g,1/60,{});
 assert.equal(b.alive,false);assert.equal(b.health,0);
 assert.equal(p.health,100);assert.equal(b.charges,36);
});

test('stress reload hesitation is recoverable and conserves rounds',()=>{
 const g=S.newMatch(700,0);g.status='playing';const p=g.player;
 p.charges=31;p.loaded=4;p.stress=80;
 const result=S.reload(g);
 assert.equal(result.hesitation,true);
 assert.equal(result.duration,S.RELOAD_SECONDS+S.RELOAD_HESITATION_SECONDS);
 assert.equal(S.tag(g).reason,'reloading');
 for(let i=0;i<150;i++)S.advanceReload(g,1/60);
 assert.equal(p.reloadRemaining,0);assert.equal(p.reloadHesitation,false);
 assert.equal(p.loaded,12);assert.equal(p.charges,31);
 p.loaded=5;S.setReloadAssist(g,true);
 const assisted=S.reload(g);
 assert.equal(assisted.duration,S.RELOAD_SECONDS);
 assert.equal(assisted.hesitation,false);assert.equal(p.charges,31);
});
test('sprint and injury raise deterministic stress while rest lowers it',()=>{
 const a=S.newMatch(701,1),b=S.newMatch(701,1);
 a.status=b.status='playing';
 for(let i=0;i<180;i++){S.tick(a,1/60,{forward:true,sprint:true});S.tick(b,1/60,{forward:true,sprint:true});}
 assert.equal(a.player.stress,b.player.stress);assert.ok(a.player.stress>0);
 const before=a.player.stress;
 for(let i=0;i<60;i++)S.tick(a,1/60,{});
 assert.ok(a.player.stress<before);
 S.receiveDamage(a,20);assert.ok(a.player.stress>before);
});

test('offline BR player cannot pass through a living opponent during 60Hz traversal',()=>{
 const g=S.newMatch(910,2),b=g.bots[0],p=g.player;g.status='playing';
 g.bots[1].x=100;g.bots[1].z=100;g.bots[1].actionTime=999;
 p.x=0;p.z=0;p.yaw=0;b.x=0;b.z=-4;b.angle=0;
 b.moveTime=999;b.actionTime=999;
 for(let i=0;i<90;i++)S.tick(g,1/60,{forward:true});
 assert.ok(Math.hypot(p.x-b.x,p.z-b.z)>=1.7-1e-7,
   'moving opponents must remain separated by both body radii');
 assert.equal(p.alive,true);
 b.alive=false;b.health=0;
 for(let i=0;i<90;i++)S.tick(g,1/60,{forward:true});
 assert.ok(p.z<b.z,'defeated opponent no longer blocks passage');
});

test('offline BR opposing actors cannot pass through each other and movement is reproducible',()=>{
 const make=()=>{const g=S.newMatch(911,2),[a,b]=g.bots;g.status='playing';
   g.player.x=0;g.player.z=100;
   a.x=b.x=0;a.z=-10;b.z=-14;a.angle=0;b.angle=Math.PI;
   a.moveTime=b.moveTime=999;a.actionTime=b.actionTime=999;return g;};
 const a=make(),b=make();
 for(let i=0;i<120;i++){S.tick(a,1/60,{});S.tick(b,1/60,{});}
 const positions=g=>g.bots.map(bot=>[bot.x,bot.z,bot.health,bot.charges]);
 assert.deepEqual(positions(a),positions(b));
 assert.ok(Math.hypot(a.bots[0].x-a.bots[1].x,a.bots[0].z-a.bots[1].z)>=1.7-1e-7);
});

test('offline BR old overlapping actors can separate without collision deadlock',()=>{
 const g=S.newMatch(912,1),b=g.bots[0],p=g.player;g.status='playing';
 p.x=b.x=0;p.z=b.z=0;p.yaw=0;
 b.angle=0;b.moveTime=999;b.actionTime=999;
 S.tick(g,1/60,{forward:true});
 assert.ok(p.z<0,'player can move out of a pre-existing overlap');
});


test('BR E/touch pickup and HUD visibility reject supplies behind solid cover',()=>{
 const g=S.newMatch(808,0);g.status='playing';g.player.charges=12;
 g.loot.forEach(item=>{item.x=130;item.z=130;});
 const blocked=g.loot.find(item=>item.kind==='ammo'&&item.weaponId===g.player.weaponId);
 const accessible=g.loot.find(item=>item!==blocked&&item.kind==='ammo'&&item.weaponId===g.player.weaponId);
 blocked.x=0;blocked.z=-1.7;
 g.obstacles.push({x:0,z:-.9,w:2,d:.5,h:2,type:'wall'});
 assert.equal(S.lineBlocked(0,0,0,-1.7,g.obstacles),true);
 assert.equal(S.canReachPickup(g,blocked),false);
 assert.equal(S.pickup(g),null);
 assert.equal(blocked.picked,false);
 assert.equal(g.player.charges,12);
 // A second, unobstructed cache can be collected even if the blocked one is closer.
 accessible.x=1.4;accessible.z=0;
 assert.equal(S.canReachPickup(g,accessible),true);
 assert.equal(S.pickup(g),'ammo');
 assert.equal(accessible.picked,true);
 assert.equal(blocked.picked,false);
 assert.equal(g.player.charges,24);
 g.obstacles.pop();
 assert.equal(S.canReachPickup(g,blocked),true);
 assert.equal(S.pickup(g),'ammo');
 assert.equal(g.player.charges,36);
 const app=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../src/app.js'),'utf8');
 assert.ok(app.includes('Game.nearestReachablePickup(s)'));
});

test('stress reload correction requires a readable delay, is single-use and never duplicates ammunition',()=>{
 const g=S.newMatch(820,0);g.status='playing';const p=g.player;
 p.loaded=3;p.charges=29;p.stress=85;
 const initial=S.reload(g);
 assert.equal(initial.hesitation,true);
 assert.equal(S.reload(g).reason,'recovery_not_ready','double-click must not instantly bypass a stumble');
 for(let i=0;i<16;i++)S.advanceReload(g,1/60);
 const before=p.reloadRemaining,ammo=p.charges;
 const recovered=S.reload(g);
 assert.equal(recovered.ok,true);assert.equal(recovered.recovery,true);
 assert.ok(p.reloadRemaining>=0.25&&p.reloadRemaining<before);
 assert.equal(p.reloadHesitation,false);
 assert.equal(S.reload(g).reason,'already_reloading','no repeated time shaving');
 assert.equal(p.charges,ammo);
 for(let i=0;i<240;i++)S.advanceReload(g,1/60);
 assert.equal(p.loaded,S.FIREARMS.carbine.magazine);
 assert.equal(p.charges,ammo);
 assert.equal(p.reloadRemaining,0);
});

test('premature correction gives a bounded, non-magical player feedback cue',()=>{
 const g=S.newMatch(821,0);g.status='playing';
 g.player.loaded=1;g.player.stress=100;
 assert.equal(S.reload(g).hesitation,true);
 assert.equal(S.reload(g).reason,'recovery_not_ready');
 assert.match(g.message,/RELOAD SETTLING/);
 assert.equal(g.player.reloadHesitation,true);
 assert.equal(g.player.charges,S.FIREARMS.carbine.initialRounds);
});

test('injury slows BR movement predictably without healing or affecting finite ammunition',()=>{
 const healthy=S.newMatch(910,1),injured=S.newMatch(910,1);
 healthy.status=injured.status='playing';
 for(const g of [healthy,injured]){g.bots[0].x=140;g.bots[0].z=140;g.bots[0].actionTime=999;}
 injured.player.health=40;
 const rounds=injured.player.charges;
 for(let i=0;i<60;i++){S.tick(healthy,1/60,{forward:true});S.tick(injured,1/60,{forward:true});}
 assert.ok(healthy.player.z<injured.player.z,'wounded player covers less ground');
 assert.equal(injured.player.health,40,'moving does not magically heal');
 assert.equal(injured.player.charges,rounds);
 assert.ok(Math.abs(S.injuryMobility(injured.player)-0.868)<1e-10);
 assert.equal(S.injuryMobility(healthy.player),1);
 assert.ok(S.injuryMobility({health:0})>0.75);
});

test('injured BR opponents move more slowly without spontaneous recovery at 60Hz',()=>{
  const make=health=>{
    const g=S.newMatch(20261028,1),b=g.bots[0];g.status='playing';
    g.player.x=0;g.player.z=75;
    b.x=0;b.z=-20;b.angle=0;b.moveTime=999;b.actionTime=999;b.health=health;
    return g;
  };
  const healthy=make(100),injured=make(50),replay=make(50);
  for(let i=0;i<60;i++){S.tick(healthy,1/60,{});S.tick(injured,1/60,{});S.tick(replay,1/60,{});}
  assert.ok(healthy.bots[0].z<injured.bots[0].z,'an injured rival travels less over the same interval');
  assert.equal(injured.bots[0].health,50);
  assert.equal(injured.bots[0].z,replay.bots[0].z,'injury mobility replays deterministically');
});

test('BR finite supplies require physical proximity even with unobstructed line of sight',()=>{
 const g=S.newMatch(920,0);g.status='playing';g.player.charges=10;
 g.loot.forEach(item=>{item.x=130;item.z=130;});
 const ammo=g.loot.find(item=>item.kind==='ammo'&&item.weaponId===g.player.weaponId);
 ammo.x=2.6;ammo.z=0;
 assert.equal(S.lineBlocked(0,0,ammo.x,ammo.z,g.obstacles),false);
 assert.equal(S.canReachPickup(g,ammo),false);
 assert.equal(S.pickup(g),null);
 assert.equal(g.player.charges,10);
 assert.equal(ammo.picked,false);
 ammo.x=1.4;
 assert.equal(S.canReachPickup(g,ammo),true);
 assert.equal(S.pickup(g),'ammo');
 assert.equal(g.player.charges,22);
 assert.equal(S.pickup(g),null,'a finite cache cannot be collected twice');
});

test('BR crouching with sprint held never grants sprint speed or spends exertion',()=>{
 const g=S.newMatch(20261028,0);g.status='playing';const p=g.player;
 p.stamina=50;p.stress=0;
 const z=p.z;S.tick(g,1/60,{forward:true,crouch:true,sprint:true});
 assert.ok(Math.abs((z-p.z)-3.1/60)<1e-9);
 assert.ok(p.stamina>50,'crouching recovers stamina');
 assert.equal(p.stress,0,'crouching is not sprint exertion');
 assert.equal(p.sprintExhausted,false);
});
test('BR sprint exhaustion has deterministic recovery hysteresis, not infinite micro-bursts',()=>{
 const a=S.newMatch(20261028,1),b=S.newMatch(20261028,1);
 a.status=b.status='playing';a.player.stamina=b.player.stamina=1;
 for(let i=0;i<90;i++){
   const before=a.player.z;
   S.tick(a,1/60,{forward:true,sprint:true});
   S.tick(b,1/60,{forward:true,sprint:true});
   assert.ok(Math.abs((before-a.player.z)-6.1/60)<1e-8,'exhausted runner walks');
   assert.equal(a.player.sprintExhausted,true);
 }
 assert.deepEqual([a.player.z,a.player.stamina,a.player.sprintExhausted],
   [b.player.z,b.player.stamina,b.player.sprintExhausted]);
 a.player.stamina=25;
 const before=a.player.z;S.tick(a,1/60,{forward:true,sprint:true});
 assert.equal(a.player.sprintExhausted,false);
 assert.ok(Math.abs((before-a.player.z)-9.5/60)<1e-8,'sprint resumes only after recovery');
});

test('BR compatible ammo wins over closer incompatible loot for E/touch and HUD',()=>{
 const g=S.newMatch(2801,0,'shotgun');g.status='playing';
 g.player.charges=g.player.loaded;
 g.loot.forEach(item=>{item.x=100;item.z=100;});
 const wrong=g.loot.find(item=>item.weaponId==='carbine');
 const right=g.loot.find(item=>item.weaponId==='shotgun');
 assert.ok(wrong&&right);
 wrong.x=g.player.x;wrong.z=g.player.z;
 right.x=g.player.x+0.5;right.z=g.player.z;
 assert.equal(S.nearestReachablePickup(g),right);
 const before=g.player.charges;
 assert.equal(S.pickup(g),right.kind);
 assert.equal(right.picked,true);
 assert.equal(wrong.picked,false);
 assert.ok(g.player.charges>before);
 assert.equal(S.nearestReachablePickup(g),wrong,'remaining incompatible cache is still visible');
 assert.equal(S.pickup(g),null);
 assert.match(g.message,/INCOMPATIBLE/);
});
test('BR pickup selector never bypasses cover, distance, depletion or class capacity',()=>{
 const g=S.newMatch(2802,0,'precision');g.status='playing';
 g.player.charges=g.player.loaded;
 g.loot.forEach(item=>{item.x=100;item.z=100;});
 const right=g.loot.find(item=>item.weaponId==='precision');
 right.x=g.player.x;right.z=g.player.z;
 assert.equal(S.nearestReachablePickup(g),right);
 right.picked=true;
 assert.equal(S.nearestReachablePickup(g),null);
 right.picked=false;
 right.x=5;right.z=0;
 assert.equal(S.nearestReachablePickup(g),null);
 right.x=0;right.z=0;
 g.player.charges=g.player.maxCharges;
 assert.equal(S.pickup(g),null);
 assert.equal(right.picked,false);
});

test('footstep awareness is finite, movement-gated and attenuated by solid cover',()=>{
 const listener={x:0,z:-10},far={x:0,z:0},near={x:0,z:-4};
 const wall=[{x:0,z:-7,w:4,d:1}];
 assert.equal(S.hearsFootsteps(listener,far,.16,true,[]),true);
 assert.equal(S.hearsFootsteps(listener,far,0,true,[]),false);
 assert.equal(S.hearsFootsteps(listener,far,.16,false,[]),false);
 assert.equal(S.hearsFootsteps(listener,far,.16,true,wall),false);
 assert.equal(S.hearsFootsteps(listener,near,.16,true,wall),true);
});
test('walking is locally audible, crouching quieter and cover attenuates footsteps',()=>{
 const listener={x:0,z:0},walk={x:0,z:3},near={x:0,z:1};
 const wall=[{x:0,z:1.5,w:3,d:.4}];
 assert.equal(S.hearsFootsteps(listener,walk,.1,false,[]),true);
 assert.equal(S.hearsFootsteps(listener,walk,.1,false,[],true),false);
 assert.equal(S.hearsFootsteps(listener,near,.1,false,[],true),true);
 assert.equal(S.hearsFootsteps(listener,walk,.1,false,wall),false);
 assert.equal(S.hearsFootsteps(listener,near,0,false,[]),false);
});
test('BR hidden opponent hears walking but not crouched movement at equal distance',()=>{
 const setup=()=>{
  const g=S.newMatch(302,1),b=g.bots[0];
  g.status='playing';g.player.x=0;g.player.z=-8;g.player.yaw=0;
  b.x=0;b.z=-10;b.angle=0;b.moveTime=999;b.actionTime=999;b.lastSeenUntil=0;
  return g;
 };
 const walking=setup(),crouching=setup();
 S.tick(walking,1/60,{forward:true});
 S.tick(crouching,1/60,{forward:true,crouch:true});
 assert.equal(walking.bots[0].lastSeenZ,S.approximateSoundPosition(walking.player).z);
 assert.ok(walking.bots[0].lastSeenUntil>walking.elapsed);
 assert.equal(crouching.bots[0].lastSeenUntil,0);
});
test('BR hidden opponent investigates only last audible sprint position at 60Hz',()=>{
 const make=()=>{
  const g=S.newMatch(301,1),b=g.bots[0];
  g.status='playing';g.player.x=0;g.player.z=0;g.player.yaw=0;
  b.x=0;b.z=-10;b.angle=0;b.moveTime=999;b.actionTime=999;b.lastSeenUntil=0;
  return g;
 };
 const a=make(),c=make();
 S.tick(a,1/60,{forward:true,sprint:true});
 S.tick(c,1/60,{forward:true,sprint:true});
 assert.equal(a.bots[0].lastSeenZ,S.approximateSoundPosition(a.player).z);
 assert.notEqual(a.bots[0].lastSeenZ,a.player.z,'hidden footsteps are not exact coordinates');
 assert.ok(a.bots[0].lastSeenUntil>a.elapsed);
 assert.equal(a.bots[0].charges,36);
 assert.deepEqual([a.bots[0].lastSeenZ,a.bots[0].angle],
   [c.bots[0].lastSeenZ,c.bots[0].angle]);
 const heard=a.bots[0].lastSeenZ;
 a.obstacles.push({x:0,z:-5,w:4,d:1});
 for(let i=0;i<190;i++)S.tick(a,1/60,{});
 assert.equal(a.bots[0].lastSeenZ,heard,'silent hidden player is not tracked');
 assert.ok(a.elapsed>a.bots[0].lastSeenUntil,'footstep memory expires');
 assert.equal(a.player.health,100);
});

test('gunfire sound has finite cover-attenuated reach and an imprecise location',()=>{
 const source={x:1.3,z:0.7},far={x:1.3,z:-25};
 const wall=[{x:1.3,z:-12,w:4,d:1}];
 assert.equal(S.hearsImpulse(far,source,[]),true);
 assert.equal(S.hearsImpulse(far,source,wall),false);
 assert.equal(S.hearsImpulse({x:1.3,z:-14},source,wall),true);
 assert.deepEqual(S.approximateSoundPosition(source),{x:2,z:0});
});
test('BR a missed finite shot alerts a nearby hidden opponent without authorizing damage',()=>{
 const make=(wall=false)=>{
  const g=S.newMatch(400,1),b=g.bots[0];
  g.status='playing';g.player.x=0;g.player.z=0;g.player.yaw=Math.PI;
  b.x=0;b.z=-20;b.angle=0;b.moveTime=999;b.actionTime=999;
  b.lastSeenUntil=0;
  if(wall)g.obstacles.push({x:0,z:-10,w:4,d:1});
  return g;
 };
 const a=make(),b=make(),occluded=make(true);
 const before=a.player.charges;
 assert.equal(S.tag(a).hit,false);
 assert.equal(S.tag(b).hit,false);
 assert.equal(a.player.charges,before-1);
 assert.equal(a.bots[0].health,100);
 assert.equal(a.bots[0].lastSeenZ,0);
 assert.ok(a.bots[0].lastSeenUntil>a.elapsed);
 assert.deepEqual([a.bots[0].lastSeenX,a.bots[0].lastSeenUntil],
   [b.bots[0].lastSeenX,b.bots[0].lastSeenUntil]);
 assert.equal(S.tag(occluded).ok,true);
 assert.equal(occluded.bots[0].lastSeenUntil,0);
 assert.equal(occluded.bots[0].health,100);
});

test('BR rival gunfire alerts only nearby listeners with coarse memory, not wallhack damage',()=>{
 const make=(listenerZ=0,fire=true)=>{
  const g=S.newMatch(918,3),[shooter,target,listener]=g.bots;g.status='playing';
  g.player.x=100;g.player.z=100;
  shooter.x=0;shooter.z=-14;shooter.angle=0;shooter.moveTime=999;shooter.actionTime=0;shooter.skill=1;
  target.x=0;target.z=-25;target.angle=0;target.moveTime=999;target.actionTime=999;
  target.loaded=0;target.charges=0;
  listener.x=0;listener.z=listenerZ;listener.angle=Math.PI;
  listener.moveTime=999;listener.actionTime=999;listener.lastSeenUntil=0;
  g.obstacles.push({x:0,z:-8,w:6,d:3});
  if(!fire){shooter.loaded=0;shooter.charges=0;}
  return g;
 };
 const a=make(),b=make(),far=make(20),silent=make(0,false);
 for(const g of [a,b,far,silent])S.tick(g,1/60,{});
 const shooter=a.bots[0],listener=a.bots[2];
 assert.equal(shooter.charges,35,'a real rival shot spends one finite round');
 assert.ok(listener.lastSeenUntil>a.elapsed,'a shot is heard through nearby cover');
 assert.equal(listener.lastSeenZ,S.approximateSoundPosition(shooter).z);
 assert.notEqual(listener.lastSeenZ,shooter.z,'sound never exposes exact coordinates');
 assert.equal(listener.charges,36,'hearing does not permit shooting through cover');
 assert.equal(a.player.health,100);
 assert.equal(far.bots[2].lastSeenUntil,0,'cover attenuates distant gunfire');
 assert.equal(silent.bots[2].lastSeenUntil,0,'an empty weapon makes no gunshot');
 assert.deepEqual(
  a.bots.map(({x,z,health,charges,lastSeenX,lastSeenZ,lastSeenUntil})=>
   ({x,z,health,charges,lastSeenX,lastSeenZ,lastSeenUntil})),
  b.bots.map(({x,z,health,charges,lastSeenX,lastSeenZ,lastSeenUntil})=>
   ({x,z,health,charges,lastSeenX,lastSeenZ,lastSeenUntil})),
  'two fixed-step replays have identical sound memory and finite resources'
 );
});

test('BR zero, negative and non-finite frame deltas never mutate combat or RNG',()=>{
 const g=S.newMatch(919,1),b=g.bots[0];g.status='playing';
 g.player.x=0;g.player.z=0;
 b.x=0;b.z=-20;b.angle=Math.PI;b.moveTime=999;b.actionTime=0;b.skill=1;
 const snapshot=()=>JSON.stringify({
  elapsed:g.elapsed,player:g.player,bots:g.bots,zone:g.zone,effects:g.effects,
  damageFlash:g.damageFlash,randomNext:null
 });
 const before=snapshot();
 for(const dt of [0,-1,NaN,Infinity,-Infinity])S.tick(g,dt,{forward:true,sprint:true});
 assert.equal(snapshot(),before);
 S.tick(g,1/60,{});
 assert.equal(g.elapsed,1/60);
 assert.equal(b.charges,35,'the next valid frame still runs normally');
});
