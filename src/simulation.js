/* VEILPOINT v1.0 - standalone deterministic battle royale simulation.
 * 100% original game logic; no external runtime dependencies.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VeilpointSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WORLD = 175, MAX_BOTS = 20, MAGAZINE_SIZE = 12, RELOAD_SECONDS = 1.8;
  const RELOAD_HESITATION_SECONDS = 0.6, STRESS_THRESHOLD = 60;
  // Original fictional class profiles; gameplay approximations, not real firearm instructions.
  // 'charges' remains the total carried rounds, including those in the current magazine.
  const FIREARMS = Object.freeze({
    carbine: Object.freeze({id:'carbine',label:'CARBINE',magazine:12,initialRounds:48,maxRounds:60,
      reloadSeconds:1.8,fireInterval:0.19,damage:45,aimTolerance:1,mobility:1,cueHz:420,cueSeconds:0.09}),
    compact: Object.freeze({id:'compact',label:'COMPACT',magazine:18,initialRounds:54,maxRounds:72,
      reloadSeconds:1.55,fireInterval:0.12,damage:26,aimTolerance:1.12,mobility:1.06,cueHz:550,cueSeconds:0.065}),
    marksman: Object.freeze({id:'marksman',label:'MARKSMAN',magazine:8,initialRounds:32,maxRounds:40,
      reloadSeconds:2.15,fireInterval:0.55,damage:68,aimTolerance:0.75,mobility:0.90,cueHz:320,cueSeconds:0.14})
  });
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const normalizeAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  function rngFromSeed(seed) {
    let v = (seed >>> 0) || 1;
    return function () { v ^= v << 13; v ^= v >>> 17; v ^= v << 5; return (v >>> 0) / 4294967296; };
  }
  function intersectsCircleAABB(x, z, r, o) {
    const xx = clamp(x, o.x - o.w / 2, o.x + o.w / 2);
    const zz = clamp(z, o.z - o.d / 2, o.z + o.d / 2);
    return (x - xx) ** 2 + (z - zz) ** 2 < r ** 2;
  }
  function blocked(x, z, r, obstacles) {
    return Math.abs(x) > WORLD - r || Math.abs(z) > WORLD - r || obstacles.some(o => intersectsCircleAABB(x, z, r, o));
  }
  function lineBlocked(ax, az, bx, bz, obstacles) {
    const dx = bx - ax, dz = bz - az;
    for (const o of obstacles) {
      let t0 = 0, t1 = 1;
      const minX = o.x - o.w / 2, maxX = o.x + o.w / 2;
      const minZ = o.z - o.d / 2, maxZ = o.z + o.d / 2;
      for (const [p, v, min, max] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
        if (Math.abs(v) < 1e-8) { if (p < min || p > max) { t0 = 2; break; } }
        else { let a = (min - p) / v, b = (max - p) / v; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
      }
      if (t0 <= t1 && t1 >= 0 && t0 <= 1) return true;
    }
    return false;
  }
  function makeObstacles() {
    const o = [];
    const clusters = [
      [-85,-76], [70,-78], [-78,77], [83,76], [0,-105], [-111,4], [114,10], [6,105]
    ];
    clusters.forEach(([x,z], i) => {
      const horizontal = i % 2 === 0;
      o.push({ x, z, w: horizontal ? 27 : 15, d: horizontal ? 15 : 27, h: 8 + i % 3 * 2, type: 'building' });
      o.push({ x: x+30, z: z+14, w: 10, d: 9, h: 4.5, type: 'shed' });
      o.push({ x: x-24, z: z+23, w: 5, d: 12, h: 3, type: 'container' });
    });
    return o;
  }
  const ZONE_PHASES = [
    { duration: 90, radius: 135 }, { duration: 95, radius: 96 },
    { duration: 90, radius: 62 }, { duration: 85, radius: 33 },
    { duration: 70, radius: 12 }, { duration: 999, radius: 1.5 }
  ];
  function newMatch(seed = Date.now(), botCount = 18, weaponId = 'carbine') {
    const firearm=Object.prototype.hasOwnProperty.call(FIREARMS,weaponId)?FIREARMS[weaponId]:null;
    if(!firearm)throw new RangeError('Unknown firearm class');
    const random = rngFromSeed(seed);
    const obstacles = makeObstacles();
    const safeSpot = (minRadius = 30) => {
      for (let tries=0; tries<2000; tries++) {
        const x = (random() * 2 - 1) * 152, z = (random() * 2 - 1) * 152;
        if (!blocked(x,z,2.4,obstacles) && Math.hypot(x,z) > minRadius) return {x,z};
      }
      return {x:0,z:0};
    };
    const bots = Array.from({ length: clamp(botCount, 0, MAX_BOTS) }, (_, i) => {
      const pos = safeSpot(36);
      return { id:i, ...pos, health:100, alive:true, angle:random()*Math.PI*2, moveTime:random()*4, actionTime:2+random()*3, skill:0.28+random()*0.65, loaded:MAGAZINE_SIZE, charges:36, reloadRemaining:0 };
    });
    const loot = Array.from({ length: 40 }, (_,i) => ({id:i, ...safeSpot(15),kind:i%2===0?'ammo':'magazine',weaponId:Object.keys(FIREARMS)[i%3],picked:false}));
    return {
      seed, random, status:'ready', elapsed:0, kills:0, damageFlash:0,
      obstacles, bots, loot, player:{x:0,z:0,yaw:0,pitch:0,health:100,shield:0,weaponId:firearm.id,charges:firearm.initialRounds,maxCharges:firearm.maxRounds,loaded:firearm.magazine,reloadRemaining:0,stamina:100,stress:0,reloadAssist:false,reloadHesitation:false,alive:true},
      zone:{ x:0,z:0, radius:170, phase:0, phaseRemaining:ZONE_PHASES[0].duration },
      effects:[], message:'', messageTime:0, lastTagAt:-2, recentDamage:0
    };
  }
  function getAliveCount(game) { return (game.player.alive ? 1 : 0) + game.bots.filter(b=>b.alive).length; }
  function phaseAt(t) {
    let passed = 0;
    for (let i=0;i<ZONE_PHASES.length;i++) {
      const d = ZONE_PHASES[i].duration;
      if (t < passed+d) {
        const startRadius=i===0?170:ZONE_PHASES[i-1].radius;
        return {phase:i, radius:startRadius+(ZONE_PHASES[i].radius-startRadius)*(t-passed)/d, phaseRemaining:d-(t-passed)};
      }
      passed+=d;
    }
    return {phase:ZONE_PHASES.length-1,radius:1.5,phaseRemaining:0};
  }
  function moveEntity(entity, vx, vz, dt, obstacles, radius=0.85) {
    const nx=entity.x+vx*dt, nz=entity.z+vz*dt;
    if (!blocked(nx,entity.z,radius,obstacles)) entity.x=nx;
    if (!blocked(entity.x,nz,radius,obstacles)) entity.z=nz;
  }

  // Lightweight collision bodies for living actors. Pre-existing overlaps are ignored
  // only for movement so legacy/procedural spawns can separate instead of trapping.
  function actorObstacles(game, actor, except=null, ignoreOverlaps=true) {
    return [game.player,...game.bots]
      .filter(other=>other!==actor&&other!==except&&other.alive&&
        (!ignoreOverlaps||!intersectsCircleAABB(actor.x,actor.z,.85,
          {x:other.x,z:other.z,w:1.2,d:1.2})))
      .map(other=>({x:other.x,z:other.z,w:1.2,d:1.2}));
  }
  function receiveDamage(game, damage) {
    if (!game.player.alive || damage<=0) return;
    // Legacy shield state is inert: received damage always affects health.
    game.player.shield=0;
    game.player.stress=clamp((game.player.stress||0)+damage*1.15,0,100);
    game.player.health=Math.max(0, game.player.health-damage);
    game.damageFlash=0.45;
    if(game.player.health===0){game.player.alive=false;game.status='lost';game.message='SIGNAL LOST';}
  }
  // Stress is a deterministic game abstraction of exertion and recent harm.
  // Injury changes movement without automatic healing or a supernatural status buff.
  // Smooth, bounded gameplay abstraction: fully healthy = 100%, severe injury = 78%.
  function injuryMobility(player) {
    return 1-0.22*clamp((100-player.health)/100,0,1);
  }
  function updateStress(player, dt, sprinting) {
    const t=clamp(Number.isFinite(dt)?dt:0,0,.05);
    player.stress=clamp((player.stress||0)+(sprinting?9:-3)*t,0,100);
    return player.stress;
  }
  function setReloadAssist(game, enabled) {
    game.player.reloadAssist=!!enabled;
    game.message=game.player.reloadAssist?'RELOAD ASSIST ON':'RELOAD ASSIST OFF';
    game.messageTime=1.6;
    return game.player.reloadAssist;
  }
  // Reloading transfers finite carried rounds to a magazine, without generating ammo.
  function advanceReload(game, dt) {
    const p=game.player,firearm=FIREARMS[p.weaponId]||FIREARMS.carbine;
    if(p.reloadRemaining<=0)return;
    p.reloadRemaining=Math.max(0,p.reloadRemaining-clamp(dt,0,.05));
    if(p.reloadRemaining===0){
      p.reloadHesitation=false;
      p.loaded=Math.min(firearm.magazine,p.charges);
      game.message='MAGAZINE READY';game.messageTime=1.4;
    }
  }
  function reload(game) {
    if(game.status!=='playing')return {ok:false,reason:'not_playing'};
    const p=game.player,firearm=FIREARMS[p.weaponId]||FIREARMS.carbine;
    if(p.reloadRemaining>0){
      // A stressed fumble has one recoverable, player-initiated correction.
      // The initial quarter-second must elapse before a second R/touch press can
      // recover it; no instant reload, repeated shortening or extra rounds.
      if(!p.reloadHesitation)return {ok:false,reason:'already_reloading'};
      if(p.reloadRemaining>firearm.reloadSeconds+RELOAD_HESITATION_SECONDS-0.25){
        game.message='RELOAD SETTLING · PRESS R AGAIN SHORTLY';game.messageTime=0.8;
        return {ok:false,reason:'recovery_not_ready'};
      }
      p.reloadRemaining=Math.max(0.25,p.reloadRemaining-RELOAD_HESITATION_SECONDS);
      p.reloadHesitation=false;
      game.message='RELOAD CORRECTED';game.messageTime=1.2;
      return {ok:true,recovery:true,duration:p.reloadRemaining};
    }
    if(p.loaded>=firearm.magazine)return {ok:false,reason:'magazine_full'};
    if(p.charges<=p.loaded)return {ok:false,reason:'no_reserve'};
    const hesitation=(p.stress||0)>=STRESS_THRESHOLD&&!p.reloadAssist;
    const duration=firearm.reloadSeconds+(hesitation?RELOAD_HESITATION_SECONDS:0);
    p.reloadRemaining=duration;
    p.reloadHesitation=hesitation;
    game.message=hesitation?'RELOAD HESITATION · RECOVERING':'RELOADING';
    game.messageTime=duration;
    return {ok:true,duration,hesitation};
  }
  function tick(game, dt, input={}) {
    if(game.status!=='playing') return game;
    dt=clamp(dt,0,0.05);
    game.elapsed+=dt;
    advanceReload(game,dt);
    game.damageFlash=Math.max(0,game.damageFlash-dt*2.4);
    game.messageTime=Math.max(0,game.messageTime-dt);
    const {player:p,obstacles} = game;
    let ix=Number(!!input.right)-Number(!!input.left), iz=Number(!!input.forward)-Number(!!input.back);
    const length=Math.hypot(ix,iz)||1; ix/=length; iz/=length;
    const wantsSprint=!!input.sprint&&iz>0&&p.stamina>1;
    const speed=(input.crouch?3.1:wantsSprint?9.5:6.1)*(FIREARMS[p.weaponId]||FIREARMS.carbine).mobility*injuryMobility(p);
    const sin=Math.sin(p.yaw), cos=Math.cos(p.yaw);
    const beforeX=p.x,beforeZ=p.z;
    moveEntity(p,(ix*cos+iz*sin)*speed,(ix*sin-iz*cos)*speed,dt,
      obstacles.concat(actorObstacles(game,p)));
    // Colliding with solid cover is not actual sprint travel. Exertion follows
    // resolved displacement, not a held key, while unobstructed movement is unchanged.
    const sprinting=wantsSprint&&Math.hypot(p.x-beforeX,p.z-beforeZ)>1e-7;
    p.stamina=clamp(p.stamina+(sprinting?-20:13)*dt,0,100);
    updateStress(p,dt,sprinting);
    const next=phaseAt(game.elapsed); Object.assign(game.zone,next);
    const outside=dist(p,game.zone)>game.zone.radius;
    if(outside) receiveDamage(game,(1.8+game.zone.phase*1.2)*dt);
    // Opponent behavior is intentionally simple and deterministic for a zero-asset offline prototype.
    for(const b of game.bots) {
      if(!b.alive) continue;
      b.moveTime-=dt;
      if(b.moveTime<=0){b.moveTime=1+game.random()*3; b.angle+=(game.random()-0.5)*2.8;}
      const outsideBot=dist(b,game.zone)>game.zone.radius;
      // Opponents notice only visible, nearby actors within their current view cone.
      // The nearest observed actor is selected without reading hidden player positions.
      let target=null, targetDistance=Infinity, targetAngle=0;
      const consider=(other)=>{
        if(other===b||!other.alive)return;
        const d=dist(b,other);
        if(d>=55||d>=targetDistance||lineBlocked(b.x,b.z,other.x,other.z,obstacles))return;
        const bearing=Math.atan2(other.x-b.x,-(other.z-b.z));
        if(Math.abs(normalizeAngle(bearing-b.angle))>1.4)return;
        target=other;targetDistance=d;targetAngle=bearing;
      };
      consider(p);
      for(const other of game.bots)consider(other);
      let aim=b.angle;
      if(outsideBot)aim=Math.atan2(game.zone.x-b.x,-(game.zone.z-b.z));
      else if(target)aim=targetAngle;
      const desired=normalizeAngle(aim-b.angle);
      b.angle=normalizeAngle(b.angle+clamp(desired,-1.8*dt,1.8*dt));
      const botSpeed=outsideBot?5.3:target&&targetDistance>18?3.2:1.0;
      moveEntity(b,Math.sin(b.angle)*botSpeed,-Math.cos(b.angle)*botSpeed,dt,
        obstacles.concat(actorObstacles(game,b)));
      if(outsideBot){
        b.health-=(2.3+game.zone.phase)*dt;
        if(b.health<=0){b.health=0;b.alive=false;continue;}
      }
      // Both player and rival encounters consume finite ammunition. Reload completion
      // cannot fire on the same frame, and a missed shot still spends one round.
      const wasReloading=b.reloadRemaining>0;
      if(wasReloading){
        b.reloadRemaining=Math.max(0,b.reloadRemaining-dt);
        if(b.reloadRemaining===0)b.loaded=Math.min(MAGAZINE_SIZE,b.charges);
      }
      b.actionTime-=dt;
      const bearingNow=target?Math.atan2(target.x-b.x,-(target.z-b.z)):0;
      const aimedAtTarget=target&&target.alive&&!outsideBot&&dist(b,target)<47&&
        Math.abs(normalizeAngle(bearingNow-b.angle))<=0.2&&
        !lineBlocked(b.x,b.z,target.x,target.z,
          obstacles.concat(actorObstacles(game,b,target,false)));
      if(!wasReloading&&b.actionTime<=0&&aimedAtTarget){
        if(b.loaded===0){
          if(b.charges>0)b.reloadRemaining=RELOAD_SECONDS;
          b.actionTime=b.charges>0?0.15:0.5;
        }else{
          b.actionTime=1.15+game.random()*2;
          b.loaded--;b.charges--;
          game.effects.push({x:b.x,z:b.z,t:0.28,type:'hostile'});
          if(game.random()<b.skill){
            const damage=6+game.random()*8;
            if(target===p)receiveDamage(game,damage);
            else{
              target.health=Math.max(0,target.health-damage);
              if(target.health===0)target.alive=false;
            }
          }
        }
      }
    }
    game.effects.forEach(e=>e.t-=dt);game.effects=game.effects.filter(e=>e.t>0);
    if(getAliveCount(game)===1&&p.alive){game.status='won';game.message='YOU ARE THE LAST SIGNAL';}
    return game;
  }
  function tag(game) {
    if(game.status!=='playing') return {ok:false,reason:'not_playing'};
    const p=game.player,firearm=FIREARMS[p.weaponId]||FIREARMS.carbine;
    if(p.charges<=0) return {ok:false,reason:'empty'};
    if(p.reloadRemaining>0) return {ok:false,reason:'reloading'};
    if(p.loaded<=0) return {ok:false,reason:'reload_required'};
    if(game.elapsed-game.lastTagAt<firearm.fireInterval) return {ok:false,reason:'cooldown'};
    game.lastTagAt=game.elapsed;p.charges--;p.loaded--;
    let target=null, best=85;
    const dx=Math.sin(p.yaw)*Math.cos(p.pitch), dz=-Math.cos(p.yaw)*Math.cos(p.pitch);
    for(const b of game.bots){
      if(!b.alive) continue;
      const vx=b.x-p.x,vz=b.z-p.z, d=Math.hypot(vx,vz);
      const forward=vx*dx+vz*dz;
      const lateral=Math.abs(vx*dz-vz*dx);
      if(forward>0 && d<85 && lateral<(0.85+d*0.012)*firearm.aimTolerance && Math.abs(p.pitch)<0.21 && d<best && !lineBlocked(p.x,p.z,b.x,b.z,game.obstacles)&&
          !lineBlocked(p.x,p.z,b.x,b.z,actorObstacles(game,p,b,false))) {target=b;best=d;}
    }
    game.effects.push({x:p.x+dx*Math.min(best,22),z:p.z+dz*Math.min(best,22),t:0.2,type:target?'hit':'tag'});
    if(target){target.health=Math.max(0,target.health-firearm.damage);if(target.health===0){target.alive=false;game.kills++;game.message='OPPONENT ELIMINATED';game.messageTime=2.2;}}
    return {ok:true,hit:!!target,elimination:!!target&&!target.alive};
  }
  // A pickup is physically accessible only within reach and without a solid wall
  // between the player and the item. Shared by E/touch interaction and the HUD.
  function canReachPickup(game,item) {
    if(!item||item.picked||dist(item,game.player)>=3.7)return false;
    return !lineBlocked(game.player.x,game.player.z,item.x,item.z,game.obstacles);
  }
  function pickup(game) {
    if(game.status!=='playing') return null;
    let closest=null, nearest=3.7;
    for(const item of game.loot){
      if(!canReachPickup(game,item))continue;
      const d=dist(item,game.player);
      if(d<nearest){nearest=d;closest=item;}
    }
    if(!closest) return null;
    const p=game.player;
    // Physical ammunition supply only; no pickup provides instant medical recovery or protection.
    if(closest.kind!=='ammo'&&closest.kind!=='magazine')return null;
    if(closest.weaponId&&closest.weaponId!==p.weaponId){
      game.message='INCOMPATIBLE AMMUNITION';game.messageTime=1.5;return null;
    }
    if(p.charges>=p.maxCharges)return null;
    p.charges=Math.min(p.maxCharges,p.charges+(closest.kind==='ammo'?12:24));
    closest.picked=true;game.message=closest.kind.toUpperCase()+' COLLECTED';game.messageTime=2;
    return closest.kind;
  }
  return {WORLD,ZONE_PHASES,FIREARMS,MAGAZINE_SIZE,RELOAD_SECONDS,RELOAD_HESITATION_SECONDS,STRESS_THRESHOLD,newMatch,tick,tag,reload,advanceReload,updateStress,injuryMobility,setReloadAssist,pickup,canReachPickup,getAliveCount,phaseAt,blocked,lineBlocked,moveEntity,rngFromSeed,receiveDamage};
});
