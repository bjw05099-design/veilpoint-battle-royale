/* VEILPOINT v1.0 - standalone deterministic battle royale simulation.
 * 100% original game logic; no external runtime dependencies.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VeilpointSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WORLD = 175, MAX_BOTS = 20;
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
  function newMatch(seed = Date.now(), botCount = 18) {
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
      return { id:i, ...pos, health:100, alive:true, angle:random()*Math.PI*2, moveTime:random()*4, actionTime:2+random()*3, skill:0.28+random()*0.65, tags:0 };
    });
    const loot = Array.from({ length: 40 }, (_,i) => ({id:i, ...safeSpot(15),kind:i%3===0?'med':i%3===1?'shield':'charge',picked:false}));
    return {
      seed, random, status:'ready', elapsed:0, kills:0, damageFlash:0,
      obstacles, bots, loot, player:{x:0,z:0,yaw:0,pitch:0,health:100,shield:80,charges:48,maxCharges:60,stamina:100,alive:true},
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
  function receiveDamage(game, damage) {
    if (!game.player.alive || damage<=0) return;
    const shieldAbsorb=Math.min(game.player.shield,damage);
    game.player.shield-=shieldAbsorb;
    game.player.health=Math.max(0, game.player.health - (damage-shieldAbsorb));
    game.damageFlash=0.45;
    if(game.player.health===0){game.player.alive=false;game.status='lost';game.message='SIGNAL LOST';}
  }
  function tick(game, dt, input={}) {
    if(game.status!=='playing') return game;
    dt=clamp(dt,0,0.05);
    game.elapsed+=dt;
    game.damageFlash=Math.max(0,game.damageFlash-dt*2.4);
    game.messageTime=Math.max(0,game.messageTime-dt);
    const {player:p,obstacles} = game;
    let ix=Number(!!input.right)-Number(!!input.left), iz=Number(!!input.forward)-Number(!!input.back);
    const length=Math.hypot(ix,iz)||1; ix/=length; iz/=length;
    const wantsSprint=!!input.sprint&&iz>0&&p.stamina>1;
    const speed=input.crouch?3.1:wantsSprint?9.5:6.1;
    const sin=Math.sin(p.yaw), cos=Math.cos(p.yaw);
    moveEntity(p,(ix*cos+iz*sin)*speed,(ix*sin-iz*cos)*speed,dt,obstacles);
    p.stamina=clamp(p.stamina+(wantsSprint?-20:13)*dt,0,100);
    const next=phaseAt(game.elapsed); Object.assign(game.zone,next);
    const outside=dist(p,game.zone)>game.zone.radius;
    if(outside) receiveDamage(game,(1.8+game.zone.phase*1.2)*dt);
    // Opponent behavior is intentionally simple and deterministic for a zero-asset offline prototype.
    for(const b of game.bots) {
      if(!b.alive) continue;
      const dd=dist(p,b);
      b.moveTime-=dt;
      if(b.moveTime<=0){b.moveTime=1+game.random()*3; b.angle+= (game.random()-0.5)*2.8;}
      const outsideBot=dist(b,game.zone)>game.zone.radius;
      let aim=b.angle;
      if(outsideBot) aim=Math.atan2(game.zone.x-b.x,-(game.zone.z-b.z));
      else if(dd<55&&p.alive) aim=Math.atan2(p.x-b.x,-(p.z-b.z));
      const desired=normalizeAngle(aim-b.angle);
      b.angle=normalizeAngle(b.angle+clamp(desired,-1.8*dt,1.8*dt));
      const botSpeed=outsideBot?5.3:dd>18&&dd<65?3.2:1.0;
      moveEntity(b,Math.sin(b.angle)*botSpeed,-Math.cos(b.angle)*botSpeed,dt,obstacles);
      if(outsideBot){b.health-=(2.3+game.zone.phase)*dt; if(b.health<=0) b.alive=false;}
      b.actionTime-=dt;
      if(dd<47&&p.alive&&b.actionTime<=0&&!lineBlocked(b.x,b.z,p.x,p.z,obstacles)){
        b.actionTime=1.15+game.random()*2;
        if(game.random()<b.skill){receiveDamage(game,6+game.random()*8);game.effects.push({x:b.x,z:b.z,t:0.28,type:'hostile'});}
      }
    }
    game.effects.forEach(e=>e.t-=dt);game.effects=game.effects.filter(e=>e.t>0);
    if(getAliveCount(game)===1&&p.alive){game.status='won';game.message='YOU ARE THE LAST SIGNAL';}
    return game;
  }
  function tag(game) {
    if(game.status!=='playing') return {ok:false,reason:'not_playing'};
    const p=game.player;
    if(p.charges<=0) return {ok:false,reason:'empty'};
    if(game.elapsed-game.lastTagAt<0.19) return {ok:false,reason:'cooldown'};
    game.lastTagAt=game.elapsed;p.charges--;
    let target=null, best=85;
    const dx=Math.sin(p.yaw)*Math.cos(p.pitch), dz=-Math.cos(p.yaw)*Math.cos(p.pitch);
    for(const b of game.bots){
      if(!b.alive) continue;
      const vx=b.x-p.x,vz=b.z-p.z, d=Math.hypot(vx,vz);
      const forward=vx*dx+vz*dz;
      const lateral=Math.abs(vx*dz-vz*dx);
      if(forward>0 && d<85 && lateral<0.85+d*0.012 && Math.abs(p.pitch)<0.21 && d<best && !lineBlocked(p.x,p.z,b.x,b.z,game.obstacles)) {target=b;best=d;}
    }
    game.effects.push({x:p.x+dx*Math.min(best,22),z:p.z+dz*Math.min(best,22),t:0.2,type:target?'hit':'tag'});
    if(target){target.health-=45;if(target.health<=0){target.alive=false;game.kills++;game.message='OPPONENT ELIMINATED';game.messageTime=2.2;}}
    return {ok:true,hit:!!target,elimination:!!target&&!target.alive};
  }
  function pickup(game) {
    if(game.status!=='playing') return null;
    let closest=null, nearest=3.7;
    for(const item of game.loot){if(item.picked) continue; const d=dist(item,game.player);if(d<nearest){nearest=d;closest=item;}}
    if(!closest) return null;
    const p=game.player;
    if(closest.kind==='med')p.health=Math.min(100,p.health+45);
    if(closest.kind==='shield')p.shield=Math.min(100,p.shield+55);
    if(closest.kind==='charge')p.charges=Math.min(p.maxCharges,p.charges+24);
    closest.picked=true;game.message=closest.kind.toUpperCase()+' COLLECTED';game.messageTime=2;
    return closest.kind;
  }
  return {WORLD,ZONE_PHASES,newMatch,tick,tag,pickup,getAliveCount,phaseAt,blocked,lineBlocked,moveEntity,rngFromSeed,receiveDamage};
});
