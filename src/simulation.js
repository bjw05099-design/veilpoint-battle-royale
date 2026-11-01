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
  const SPRINT_RECOVERY_STAMINA = 25; // Hysteresis prevents exhausted one-frame sprint bursts.
  // Grounded arm's-reach interaction, not a three-metre remote loot vacuum.
  const PICKUP_REACH = 1.8;
  const ACTOR_RADIUS = 0.85; // Shared BR actor footprint for standing-body collision.
  // Original fictional class profiles; gameplay approximations, not real firearm instructions.
  // Ranges are fictional world-metre gameplay limits, not real firearm specifications.
  // Hitscan is an uncalibrated browser abstraction without ballistics or penetration.
  // 'charges' remains the total carried rounds, including those in the current magazine.
  const FIREARMS = Object.freeze({
    carbine: Object.freeze({id:'carbine',label:'CARBINE',magazine:12,initialRounds:48,maxRounds:60,
      reloadSeconds:1.8,fireInterval:0.19,damage:45,aimTolerance:1,mobility:1,cueHz:420,cueSeconds:0.09,range:145,recoilPitch:0.004,automatic:true}),
    compact: Object.freeze({id:'compact',label:'COMPACT',magazine:18,initialRounds:54,maxRounds:72,
      reloadSeconds:1.55,fireInterval:0.12,damage:26,aimTolerance:1.12,mobility:1.06,cueHz:550,cueSeconds:0.065,range:70,recoilPitch:0.003,automatic:true}),
    marksman: Object.freeze({id:'marksman',label:'MARKSMAN',magazine:8,initialRounds:32,maxRounds:40,
      reloadSeconds:2.15,fireInterval:0.55,damage:68,aimTolerance:0.75,mobility:0.90,cueHz:320,cueSeconds:0.14,range:185,recoilPitch:0.009}),
    shotgun: Object.freeze({id:'shotgun',label:'SHOTGUN',magazine:6,initialRounds:24,maxRounds:30,
      reloadSeconds:2.4,fireInterval:0.7,damage:72,aimTolerance:1.45,mobility:0.94,cueHz:270,cueSeconds:0.15,range:22,recoilPitch:0.014}),
    support: Object.freeze({id:'support',label:'SUPPORT',magazine:24,initialRounds:72,maxRounds:96,
      reloadSeconds:3.2,fireInterval:0.14,damage:27,aimTolerance:1.12,mobility:0.82,cueHz:360,cueSeconds:0.11,range:145,recoilPitch:0.006,automatic:true}),
    sidearm: Object.freeze({id:'sidearm',label:'SIDEARM',magazine:10,initialRounds:40,maxRounds:50,
      reloadSeconds:1.3,fireInterval:0.24,damage:28,aimTolerance:0.95,mobility:1.10,cueHz:620,cueSeconds:0.07,range:65,recoilPitch:0.007}),
    precision: Object.freeze({id:'precision',label:'PRECISION',magazine:5,initialRounds:20,maxRounds:25,
      reloadSeconds:2.7,fireInterval:1.1,damage:90,aimTolerance:0.55,mobility:0.84,cueHz:300,cueSeconds:0.16,range:260,recoilPitch:0.018})
  });
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const normalizeAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  function rngFromSeed(seed) {
    let v = (seed >>> 0) || 1;
    const next = function () { v ^= v << 13; v ^= v >>> 17; v ^= v << 5; return (v >>> 0) / 4294967296; };
    next.getState = () => v >>> 0;
    next.setState = state => { if (!Number.isInteger(state) || state < 1 || state > 0xffffffff) throw new RangeError('Invalid RNG state'); v = state >>> 0; };
    return next;
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
  // Finite, local sound awareness: walking is audible nearby, crouching quieter,
  // and sprinting farther. Sound-only memory is imprecise; cover attenuates the
  // authored hearing radius; this is a game abstraction, not an acoustic model.
  function hearsFootsteps(listener, source, movedDistance, sprinting, obstacles, crouching=false) {
    if (!(movedDistance > 1e-7)) return false;
    const clearRange=crouching?1.5:sprinting?12:3.5;
    const occludedRange=crouching?0.75:sprinting?6:1.75;
    const distance=dist(listener,source);
    if(distance>clearRange)return false;
    return distance<=(lineBlocked(listener.x,listener.z,source.x,source.z,obstacles)
      ?occludedRange:clearRange);
  }
  // Gunfire can be heard farther than footsteps, but cover attenuates it.
  // A coarse 2 m source estimate prevents acoustic detection from acting
  // as a perfect location feed. These radii are uncalibrated game abstractions.
  function hearsImpulse(listener, source, obstacles) {
    const distance = dist(listener, source);
    if (distance > 38) return false;
    return distance <= (lineBlocked(listener.x, listener.z, source.x, source.z, obstacles) ? 18 : 38);
  }
  // Visual observation is exact; fresh audible evidence is only approximate.
  // An old search clue must not suppress a new, physically audible shot.
  // A living person standing between an observer and a shooter blocks exact
  // visual identification. This cheap segment/circle test avoids per-target
  // obstacle arrays inside the 60Hz rival perception loop.
  function canSeeActor(observer, subject, obstacles, distance = dist(observer, subject), actors = null) {
    if (distance >= 55) return false;
    // A standing actor may be partially visible beside solid cover even when
    // their centre is concealed. Use three finite silhouette samples, as the
    // authoritative team snapshot does, rather than granting see-through walls
    // or requiring an impossible fully exposed centre. This is a 2D proxy.
    const dx = subject.x - observer.x, dz = subject.z - observer.z;
    const sideX = distance > 1e-6 ? -dz / distance * ACTOR_RADIUS * 0.8 : 0;
    const sideZ = distance > 1e-6 ? dx / distance * ACTOR_RADIUS * 0.8 : 0;
    const rayVisible = (x, z) => {
      const vx = x - observer.x, vz = z - observer.z;
      const range = Math.hypot(vx, vz);
      if (range >= 55 || lineBlocked(observer.x, observer.z, x, z, obstacles)) return false;
      const bearing = Math.atan2(vx, -vz);
      if (Math.abs(normalizeAngle(bearing - observer.angle)) > 1.4) return false;
      if (actors && range > 1e-6) {
        const lengthSquared = range * range;
        for (const actor of actors) {
          if (actor === observer || actor === subject || !actor.alive) continue;
          const projection = ((actor.x - observer.x) * vx + (actor.z - observer.z) * vz) / lengthSquared;
          if (projection <= 0 || projection >= 1) continue;
          const offsetX = observer.x + projection * vx - actor.x;
          const offsetZ = observer.z + projection * vz - actor.z;
          if (offsetX * offsetX + offsetZ * offsetZ < ACTOR_RADIUS * ACTOR_RADIUS) return false;
        }
      }
      return true;
    };
    return rayVisible(subject.x, subject.z) ||
      rayVisible(subject.x + sideX, subject.z + sideZ) ||
      rayVisible(subject.x - sideX, subject.z - sideZ);
  }
  function approximateSoundPosition(source) {
    return {x: Math.round(source.x / 2) * 2, z: Math.round(source.z / 2) * 2};
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
    // The initial roster, the player and ground caches occupy physical space.
    // Reject colliding spawn proposals instead of relying on later actor movement
    // to resolve an impossible overlap. Keep the seeded 60Hz world reproducible.
    const occupiedActors = [{x:0,z:0}]; // Fixed player spawn.
    const safeSpot = (minRadius = 30, clearance = 0, occupied = []) => {
      for (let tries=0; tries<2000; tries++) {
        const x = (random() * 2 - 1) * 152, z = (random() * 2 - 1) * 152;
        if (blocked(x,z,2.4,obstacles) || Math.hypot(x,z) <= minRadius ||
            occupied.some(pos => Math.hypot(pos.x-x,pos.z-z) < clearance)) continue;
        return {x,z};
      }
      // Never silently put a rival or pickup at the player's feet when placement
      // constraints cannot be met; fail explicitly rather than corrupt a match.
      throw new RangeError('No collision-free BR spawn available');
    };
    const bots = Array.from({ length: clamp(botCount, 0, MAX_BOTS) }, (_, i) => {
      const pos = safeSpot(36, ACTOR_RADIUS*2+0.2, occupiedActors);
      occupiedActors.push(pos);
      return { id:i, ...pos, health:100, alive:true, angle:random()*Math.PI*2, moveTime:random()*4, actionTime:2+random()*3, skill:0.28+random()*0.65, loaded:MAGAZINE_SIZE, charges:36, reloadRemaining:0, disqualified:false,
        lastSeenX:pos.x,lastSeenZ:pos.z,lastSeenUntil:0 };
    });
    const occupiedCaches = [];
    const loot = Array.from({ length: 40 }, (_,i) => {
      const pos = safeSpot(15, 1.2, occupiedActors.concat(occupiedCaches));
      occupiedCaches.push(pos);
      return {id:i, ...pos, kind:i%2===0?'ammo':'magazine',
        weaponId:Object.keys(FIREARMS)[i%Object.keys(FIREARMS).length],
        remaining:i%2===0?12:24,picked:false};
    });
    return {
      seed, random, status:'ready', elapsed:0, kills:0, damageFlash:0,
      obstacles, bots, loot, player:{x:0,z:0,yaw:0,pitch:0,health:100,weaponId:firearm.id,charges:firearm.initialRounds,maxCharges:firearm.maxRounds,loaded:firearm.magazine,reloadRemaining:0,stamina:100,stress:0,reloadAssist:false,reloadHesitation:false,sprintExhausted:false,alive:true},
      zone:{ x:0,z:0, radius:170, phase:0, phaseRemaining:ZONE_PHASES[0].duration },
      effects:[], message:'', messageTime:0, lastTagAt:-2, recentDamage:0
    };
  }
  function getAliveCount(game) { return (game.player.alive ? 1 : 0) + game.bots.filter(b=>b.alive).length; }
  // The shrinking area is a published match rule, not a supernatural source of
  // injury. Players have until the next phase deadline to return; disqualification
  // never changes health or fabricates a physical wound.
  function boundaryStatus(game) {
    const margin=game.zone.radius-dist(game.player,game.zone);
    return {outside:margin<0,near:margin<=12,meters:Math.ceil(Math.abs(margin))};
  }
  // Final placement counts surviving opponents ahead of the eliminated player.
  // A loss can never be labelled first place, including a simultaneous knockout.
  function getFinalPlacement(game) {
    if (!game || (game.status !== 'won' && game.status !== 'lost')) return null;
    return game.status === 'won' ? 1 : Math.max(2, getAliveCount(game) + 1);
  }
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
          {x:other.x,z:other.z,w:ACTOR_RADIUS*2,d:ACTOR_RADIUS*2})))
      .map(other=>({x:other.x,z:other.z,w:ACTOR_RADIUS*2,d:ACTOR_RADIUS*2}));
  }
  function receiveDamage(game, damage) {
    if (!game.player.alive || damage<=0) return;
    // Discard any injected legacy shield state; no shield exists in the live world.
    if(Object.prototype.hasOwnProperty.call(game.player,'shield'))delete game.player.shield;
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
  // Shared BR/CH01 rule: an exhausted runner must recover before sprinting again.
  // Crouched movement cannot spend sprint stamina or grant sprint speed.
  function canSprint(player, input, forwardAxis) {
    if(player.stamina<=1)player.sprintExhausted=true;
    else if(player.sprintExhausted&&player.stamina>=SPRINT_RECOVERY_STAMINA)
      player.sprintExhausted=false;
    return !!input.sprint&&!input.crouch&&forwardAxis>0&&player.stamina>1&&!player.sprintExhausted;
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
    // A zero, negative or non-finite frame must not advance AI, consume rounds,
    // mutate the RNG stream or poison the deterministic 60 Hz world state.
    if(!Number.isFinite(dt)||dt<=0)return game;
    dt=clamp(dt,0,0.05);
    game.elapsed+=dt;
    advanceReload(game,dt);
    game.damageFlash=Math.max(0,game.damageFlash-dt*2.4);
    game.messageTime=Math.max(0,game.messageTime-dt);
    const {player:p,obstacles} = game;
    let ix=Number(!!input.right)-Number(!!input.left), iz=Number(!!input.forward)-Number(!!input.back);
    const length=Math.hypot(ix,iz)||1; ix/=length; iz/=length;
    const wantsSprint=canSprint(p,input,iz);
    const speed=(input.crouch?3.1:wantsSprint?9.5:6.1)*(FIREARMS[p.weaponId]||FIREARMS.carbine).mobility*injuryMobility(p);
    const sin=Math.sin(p.yaw), cos=Math.cos(p.yaw);
    const beforeX=p.x,beforeZ=p.z;
    moveEntity(p,(ix*cos+iz*sin)*speed,(ix*sin-iz*cos)*speed,dt,
      obstacles.concat(actorObstacles(game,p)));
    // Colliding with solid cover is not actual sprint travel. Exertion follows
    // resolved displacement, not a held key, while unobstructed movement is unchanged.
    const movedDistance=Math.hypot(p.x-beforeX,p.z-beforeZ);
    const sprinting=wantsSprint&&movedDistance>1e-7;
    p.stamina=clamp(p.stamina+(sprinting?-20:13)*dt,0,100);
    updateStress(p,dt,sprinting);
    const previousPhase=game.zone.phase;
    const next=phaseAt(game.elapsed); Object.assign(game.zone,next);
    // The final announced phase also has an expiry: after its clock reaches
    // zero, crossing the final boundary is an immediate eligibility loss.
    // Otherwise a survivor could wait outside forever with no later phase edge.
    const boundaryDeadline=next.phase!==previousPhase ||
      (next.phase===ZONE_PHASES.length-1 && next.phaseRemaining===0);
    // Out-of-bounds is an announced competition rule, not unexplained damage.
    // The same deadline applies to the player and every opponent.
    if(boundaryDeadline&&dist(p,game.zone)>game.zone.radius){
      p.alive=false;game.status='lost';
      game.message='MATCH DISQUALIFIED · OUTSIDE BOUNDARY';game.messageTime=3;
    }
    // Collect actual rival footsteps after movement. Hearing uses only audible,
    // rounded positions and cannot grant sight or permission to shoot.
    const rivalFootsteps=[];
    const visibleActors=[p,...game.bots];
    // Opponent behavior is intentionally simple and deterministic for a zero-asset offline prototype.
    for(const b of game.bots) {
      // Once a live shot incapacitates the player, freeze later actors in the
      // same tick. Otherwise they can patrol, turn and consume random state
      // after the result has already been decided. A published boundary
      // deadline is different: every rival must still be assessed fairly.
      if(game.status!=='playing'&&!boundaryDeadline)break;
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
        if(d>=targetDistance||!canSeeActor(b,other,obstacles,d,visibleActors))return;
        target=other;targetDistance=d;
        targetAngle=Math.atan2(other.x-b.x,-(other.z-b.z));
      };
      consider(p);
      for(const other of game.bots)consider(other);
      if(target){
        // Memory is updated only from an actor actually observed in the
        // current field of view. No hidden live coordinates are consulted.
        b.lastSeenX=target.x;b.lastSeenZ=target.z;
        b.lastSeenUntil=game.elapsed+2.5;
      } else if(!outsideBot&&hearsFootsteps(b,p,movedDistance,sprinting,obstacles,!!input.crouch)){
        // Investigate only the last audible footstep position. Quiet movement
        // behind cover cannot continuously update this memory.
        const heard=approximateSoundPosition(p); // Sound cannot reveal exact hidden coordinates.
        b.lastSeenX=heard.x;b.lastSeenZ=heard.z;
        b.lastSeenUntil=game.elapsed+2.5;
      }
      const investigating=!target&&!outsideBot&&b.lastSeenUntil>game.elapsed;
      const lastSeenDistance=investigating
        ?Math.hypot(b.lastSeenX-b.x,b.lastSeenZ-b.z):0;
      let aim=b.angle;
      if(outsideBot)aim=Math.atan2(game.zone.x-b.x,-(game.zone.z-b.z));
      else if(target)aim=targetAngle;
      else if(investigating&&lastSeenDistance>1)
        aim=Math.atan2(b.lastSeenX-b.x,-(b.lastSeenZ-b.z));
      const desired=normalizeAngle(aim-b.angle);
      b.angle=normalizeAngle(b.angle+clamp(desired,-1.8*dt,1.8*dt));
      const botSpeed=(outsideBot?5.3:target&&targetDistance>18?3.2:
        investigating&&lastSeenDistance>3?2.0:1.0)*injuryMobility(b);
      const movementObstacles=obstacles.concat(actorObstacles(game,b));
      const startX=b.x,startZ=b.z;
      const vx=Math.sin(b.angle)*botSpeed,vz=-Math.cos(b.angle)*botSpeed;
      moveEntity(b,vx,vz,dt,movementObstacles);
      // If solid cover stops a patrol, sidestep along its edge at the SAME
      // walking speed instead of walking into the wall until the zone kills it.
      // Only local collision is queried; no hidden target position or teleport.
      const initialStep=Math.hypot(b.x-startX,b.z-startZ);
      if(initialStep<botSpeed*dt*0.2){
        const side=b.id%2===0?1:-1;
        // Even if both sides are tested, cumulative travel cannot exceed the
        // original single-step distance budget.
        let travelled=initialStep;
        for(const direction of [side,-side]){
          const previousX=b.x,previousZ=b.z;
          const remainingDt=Math.max(0,dt-travelled/botSpeed);
          moveEntity(b,-vz*direction,vx*direction,remainingDt,movementObstacles);
          const sideStep=Math.hypot(b.x-previousX,b.z-previousZ);
          travelled+=sideStep;
          if(sideStep>=botSpeed*dt*0.2)break;
        }
      }
      const movedBot=Math.hypot(b.x-startX,b.z-startZ);
      if(movedBot>1e-7)rivalFootsteps.push({source:b,distance:movedBot});
      // Assess the resolved post-movement position at the published deadline.
      // No environmental HP drain: an out-of-bounds rival is disqualified.
      if(boundaryDeadline&&dist(b,game.zone)>game.zone.radius){
        // Boundary removal is an administrative ruling, not a physical injury.
        // Preserve the rival's actual health for honest HUD and checkpoint state.
        b.alive=false;b.disqualified=true;continue;
      }
      // A round that already ended (boundary disqualification or injury)
      // must not produce further attacks, reloads or phantom ammunition use.
      // Still resolve each rival's physical deadline position above so
      // simultaneous boundary rulings remain symmetric.
      if(game.status!=='playing')continue;
      // Both player and rival encounters consume finite ammunition. Reload completion
      // cannot fire on the same frame, and a missed shot still spends one round.
      const wasReloading=b.reloadRemaining>0;
      if(wasReloading){
        b.reloadRemaining=Math.max(0,b.reloadRemaining-dt);
        if(b.reloadRemaining===0)b.loaded=Math.min(MAGAZINE_SIZE,b.charges);
      }
      b.actionTime-=dt;
      const bearingNow=target?Math.atan2(target.x-b.x,-(target.z-b.z)):0;
      // An opponent who sees an exposed body edge may attempt a shot even
      // when the target's centre is behind cover. Do not require a second
      // centre-only sight test: the actual spread ray below still stops at
      // solid cover and intervening actors, and every attempt spends a round.
      const aimedAtTarget=target&&target.alive&&!outsideBot&&dist(b,target)<47&&
        Math.abs(normalizeAngle(bearingNow-b.angle))<=0.2;
      if(!wasReloading&&b.actionTime<=0&&aimedAtTarget){
        if(b.loaded===0){
          if(b.charges>0)b.reloadRemaining=RELOAD_SECONDS;
          b.actionTime=b.charges>0?0.15:0.5;
        }else{
          b.actionTime=1.15+game.random()*2;
          b.loaded--;b.charges--;
          game.effects.push({x:b.x,z:b.z,t:0.28,type:'hostile'});
          // A rival's finite shot is audible to other nearby actors too. Only
          // an approximate source is remembered; hearing never supplies a live
          // target, bypasses solid cover or grants damage without line of sight.
          const heard=approximateSoundPosition(b);
          for(const listener of game.bots){
            if(listener!==b&&listener.alive&&hearsImpulse(listener,b,obstacles)){
              // A new shot supersedes old search memory, but unseen shooters
              // never disclose more than a coarse audible source estimate.
              const observed=canSeeActor(listener,b,obstacles,dist(listener,b),visibleActors)?b:heard;
              listener.lastSeenX=observed.x;listener.lastSeenZ=observed.z;
              listener.lastSeenUntil=game.elapsed+2.5;
            }
          }
          // The skill factor affects bounded aim stability, not a magical
          // hit-probability roll after the weapon fires. A missed shot spends
          // ammunition and is audible, but never causes remote damage.
          const spread=(1-b.skill)*0.22;
          const shotAngle=b.angle+(game.random()*2-1)*spread;
          const rayX=Math.sin(shotAngle),rayZ=-Math.cos(shotAngle);
          const toX=target.x-b.x,toZ=target.z-b.z;
          const forward=toX*rayX+toZ*rayZ;
          const lateral=Math.abs(toX*rayZ-toZ*rayX);
          if(forward>0&&lateral<ACTOR_RADIUS){
            const contact=forward-Math.sqrt(Math.max(0,ACTOR_RADIUS**2-lateral**2));
            if(contact>0&&contact<47&&
               !lineBlocked(b.x,b.z,b.x+rayX*contact,b.z+rayZ*contact,
                 obstacles.concat(actorObstacles(game,b,target,false)))){
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
    }
    // No further perception or audiovisual combat events after a terminal
    // outcome. Keep the result frozen for the end-of-match/restart screen.
    if(game.status!=='playing')return game;
    // Rival movement can be heard at close range just like player movement.
    // Process after all bot movement so iteration order cannot give early bots
    // knowledge of future positions. An existing direct observation takes priority.
    for(const footstep of rivalFootsteps){
      const source=footstep.source;
      if(!source.alive)continue;
      for(const listener of game.bots){
        if(listener===source||!listener.alive||listener.lastSeenUntil>game.elapsed)continue;
        if(!hearsFootsteps(listener,source,footstep.distance,false,obstacles))continue;
        const heard=approximateSoundPosition(source);
        listener.lastSeenX=heard.x;listener.lastSeenZ=heard.z;
        listener.lastSeenUntil=game.elapsed+2.5;
      }
    }
    game.effects.forEach(e=>e.t-=dt);game.effects=game.effects.filter(e=>e.t>0);
    if(getAliveCount(game)===1&&p.alive){game.status='won';game.message='YOU ARE THE LAST SIGNAL';}
    return game;
  }
  function tag(game, crouching=false) {
    if(game.status!=='playing') return {ok:false,reason:'not_playing'};
    const p=game.player,firearm=FIREARMS[p.weaponId]||FIREARMS.carbine;
    if(p.charges<=0) return {ok:false,reason:'empty'};
    if(p.reloadRemaining>0) return {ok:false,reason:'reloading'};
    if(p.loaded<=0) return {ok:false,reason:'reload_required'};
    if(game.elapsed-game.lastTagAt<firearm.fireInterval) return {ok:false,reason:'cooldown'};
    game.lastTagAt=game.elapsed;p.charges--;p.loaded--;
    let target=null, best=firearm.range;
    // Match the renderer's 1.64m standing / 1.09m crouched camera.
    // The browser uses a finite-height actor proxy, not full 3D ballistics.
    const eyeHeight=crouching?1.09:1.64;
    const dx=Math.sin(p.yaw), dz=-Math.cos(p.yaw);
    for(const b of game.bots){
      if(!b.alive)continue;
      const vx=b.x-p.x,vz=b.z-p.z;
      const forward=vx*dx+vz*dz;
      const lateral=Math.abs(vx*dz-vz*dx);
      // Physical contact must intersect the actor's finite body, not a
      // distance-growing aim-assist cone that bends a shot into a nearby bot.
      if(forward<=0||lateral>=ACTOR_RADIUS)continue;
      const contact=forward-Math.sqrt(Math.max(0,ACTOR_RADIUS**2-lateral**2));
      if(contact<=0||contact>=best)continue;
      // An upward or downward ray must actually cross the standing actor's
      // finite vertical silhouette at the horizontal contact point. The old
      // fixed pitch cutoff could hit a 210m actor while aiming far above it.
      const impactHeight=eyeHeight+Math.tan(p.pitch)*contact;
      if(impactHeight<0.15||impactHeight>1.9)continue;
      const hitX=p.x+dx*contact,hitZ=p.z+dz*contact;
      // Trace cover and intervening bodies along the ACTUAL shot ray. A
      // center-to-center visibility line can miss cover at a wall edge.
      if(lineBlocked(p.x,p.z,hitX,hitZ,game.obstacles)||
         lineBlocked(p.x,p.z,hitX,hitZ,actorObstacles(game,p,b,false)))continue;
      target=b;best=contact;
    }
    // A missed round has no magical floating impact marker. A confirmed
    // contact gets only a brief, muted physical debris cue at the contact point.
    if(target)game.effects.push({x:target.x,z:target.z,t:0.2,type:'hit'});
    // An actual fired round produces one audible event even on a miss.
    // Sound never grants a hit, damage, or live target coordinates.
    const heard=approximateSoundPosition(p);
    const sightActors=[p,...game.bots];
    for(const b of game.bots){
      if(b.alive&&hearsImpulse(b,p,game.obstacles)){
        // A fresh sound replaces stale search evidence, while visible
        // actors remain precise and hidden actors stay imprecise.
        const observed=canSeeActor(b,p,game.obstacles,dist(b,p),sightActors)?p:heard;
        b.lastSeenX=observed.x;b.lastSeenZ=observed.z;
        b.lastSeenUntil=game.elapsed+2.5;
      }
    }
    if(target){target.health=Math.max(0,target.health-firearm.damage);if(target.health===0){target.alive=false;game.kills++;game.message='OPPONENT ELIMINATED';game.messageTime=2.2;}}
    // The shot is resolved using the pre-kick sight ray. A finite, class-specific
    // upward camera impulse then requires the PC player to correct subsequent aim.
    // No RNG, extra ammunition or automatic recentering: checkpointed pitch is
    // already part of the deterministic 60Hz BR and CH01 player state.
    p.pitch=clamp(p.pitch+firearm.recoilPitch,-.35,.35);
    return {ok:true,hit:!!target,elimination:!!target&&!target.alive};
  }
  // Only authored automatic classes respond to a continuously held PC trigger.
  // Cadence uses the fixed 60Hz world clock, never operating-system key-repeat.
  function autoFire(game, held, crouching=false) {
    if(!held || !game || !game.player || !FIREARMS[game.player.weaponId]?.automatic)
      return {ok:false,reason:'manual_trigger'};
    return tag(game,crouching);
  }
  // A pickup is physically accessible only within reach and without a solid wall
  // between the player and the item. Shared by E/touch interaction and the HUD.
  function canReachPickup(game,item) {
    if(!item||item.picked||item.remaining===0||dist(item,game.player)>=PICKUP_REACH)return false;
    return !lineBlocked(game.player.x,game.player.z,item.x,item.z,game.obstacles);
  }
  // The same selection governs E/touch and the HUD. A nearby incompatible
  // cache must never block an accessible compatible cache in a crowded pile.
  // One scan, no frame-by-frame allocation or hidden pickups through cover.
  function nearestReachablePickup(game) {
    let selected=null,nearest=Infinity,selectedCompatible=false;
    for(const item of game.loot){
      if(!canReachPickup(game,item)||(item.kind!=='ammo'&&item.kind!=='magazine'))continue;
      const compatible=!item.weaponId||item.weaponId===game.player.weaponId;
      const d=dist(item,game.player);
      if(!selected||(compatible&&!selectedCompatible)||
         (compatible===selectedCompatible&&d<nearest)){
        selected=item;nearest=d;selectedCompatible=compatible;
      }
    }
    return selected;
  }
  function pickup(game) {
    if(game.status!=='playing') return null;
    const closest=nearestReachablePickup(game);
    if(!closest) return null;
    const p=game.player;
    // Physical ammunition supply only; no pickup provides instant medical recovery or protection.
    if(closest.weaponId&&closest.weaponId!==p.weaponId){
      game.message='INCOMPATIBLE AMMUNITION';game.messageTime=1.5;return null;
    }
    if(p.charges>=p.maxCharges)return null;
    // Collect only what the player can physically carry. An older/custom map
    // item without remaining metadata still starts with its original stock.
    const remaining=Number.isInteger(closest.remaining)?closest.remaining:
      (closest.kind==='ammo'?12:24);
    if(remaining<=0)return null;
    const taken=Math.min(remaining,p.maxCharges-p.charges);
    p.charges+=taken;
    closest.remaining=remaining-taken;
    closest.picked=closest.remaining===0;
    game.message=closest.kind.toUpperCase()+' '+taken+' ROUNDS · '+closest.remaining+' LEFT';
    game.messageTime=2;
    return closest.kind;
  }
  // Offline BR checkpoints preserve the random stream as well as the visible world.
  // All persisted fields are explicitly bounded; old or modified localStorage cannot
  // reintroduce shield fields or out-of-range resources. This is not anti-tamper security.
  const CHECKPOINT_VERSION = 1;
  const MAX_CHECKPOINT_CHARS = 65536; // Hard bound before parsing untrusted browser storage.
  const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  function checkedFields(source, fields) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new RangeError('Invalid checkpoint object');
    const result = {};
    for (const [key, min, max, whole] of fields) {
      if (!(whole ? integer(source[key], min, max) : finite(source[key], min, max)))
        throw new RangeError('Invalid checkpoint field: ' + key);
      result[key] = source[key];
    }
    return result;
  }
  const POSITION_FIELDS = [['x',-WORLD,WORLD],['z',-WORLD,WORLD]];
  const PLAYER_FIELDS = [...POSITION_FIELDS,['yaw',-100000,100000],['pitch',-.35,.35],
    ['health',0,100],['charges',0,96,true],['maxCharges',1,96,true],['loaded',0,24,true],
    ['reloadRemaining',0,10],['stamina',0,100],['stress',0,100]];
  const BOT_FIELDS = [...POSITION_FIELDS,['id',0,MAX_BOTS-1,true],['health',0,100],
    ['angle',-Math.PI,2*Math.PI],['moveTime',-1,10],['actionTime',-3600,10],['skill',0,1],
    ['loaded',0,MAGAZINE_SIZE,true],['charges',0,36,true],['reloadRemaining',0,RELOAD_SECONDS],
    ['lastSeenX',-WORLD-1,WORLD+1],['lastSeenZ',-WORLD-1,WORLD+1],['lastSeenUntil',0,3605]];
  const LOOT_FIELDS = [...POSITION_FIELDS,['id',0,39,true],['remaining',0,24,true]];
  // A checkpoint may preserve a recent observation or an in-progress reload,
  // but it must never manufacture future perception or lock the player's gun
  // for minutes. Use the same bounds on write and restore, including object saves.
  function validateCheckpointTiming(data, firearm) {
    const tolerance = 1e-6;
    if (!firearm || data.lastTagAt > data.elapsed + tolerance ||
        data.bots.some(b => b.lastSeenUntil > data.elapsed + 2.5 + tolerance) ||
        data.player.reloadRemaining > firearm.reloadSeconds + RELOAD_HESITATION_SECONDS + tolerance ||
        (data.player.reloadRemaining > 0 &&
          (data.player.loaded >= firearm.magazine || data.player.charges <= data.player.loaded)) ||
        // Rivals only start reloading after the last loaded round. A forged
        // timer with rounds still loaded, or no reserve, must not persist.
        data.bots.some(b => b.reloadRemaining > 0 && (b.loaded !== 0 || b.charges === 0)))
      throw new RangeError('Invalid BR checkpoint timing');
  }
  // A valid live checkpoint cannot place two standing actors in the same
  // physical footprint. Fallen opponents are not blocking living actors.
  function overlappingLivingActors(player,bots) {
    const actors=[...(player.alive?[player]:[]),...bots.filter(b=>b.alive)];
    for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)
      if(dist(actors[i],actors[j])<ACTOR_RADIUS*2-1e-6)return true;
    return false;
  }
  function snapshotMatch(game) {
    if (!game || game.status !== 'playing' || !game.random || typeof game.random.getState !== 'function')
      throw new RangeError('Only active BR matches can be checkpointed');
    // Reject writer-only corruption before replacing a resumable local save.
    if (!integer(game.seed,0,Number.MAX_SAFE_INTEGER) ||
        !integer(game.random.getState(),1,0xffffffff) ||
        !integer(game.kills,0,MAX_BOTS) ||
        !Array.isArray(game.bots) || game.bots.length>MAX_BOTS ||
        !Array.isArray(game.loot) || !Array.isArray(game.effects) ||
        game.effects.length>256 ||
        typeof game.message!=='string' || game.message.length>120)
      throw new RangeError('Invalid BR checkpoint metadata');
    checkedFields(game,[['damageFlash',0,1],['messageTime',0,10],
      ['lastTagAt',-2,3600],['recentDamage',0,100]]);
    const checkpoint={version:CHECKPOINT_VERSION,seed:game.seed,rngState:game.random.getState(),
      status:game.status,elapsed:game.elapsed,kills:game.kills,damageFlash:game.damageFlash,
      player:{...checkedFields(game.player,PLAYER_FIELDS),weaponId:game.player.weaponId,
        alive:game.player.alive,reloadAssist:game.player.reloadAssist,
        reloadHesitation:game.player.reloadHesitation,sprintExhausted:game.player.sprintExhausted},
      bots:game.bots.map(b=>({...checkedFields(b,BOT_FIELDS),alive:b.alive,
        disqualified:b.disqualified===true})), 
      loot:game.loot.map(item=>({...checkedFields(item,LOOT_FIELDS),kind:item.kind,
        weaponId:item.weaponId,picked:item.picked})),
      zone:checkedFields(game.zone,[...POSITION_FIELDS,['radius',0,170],
        ['phase',0,ZONE_PHASES.length-1,true],['phaseRemaining',0,999]]),
      effects:game.effects.map(e=>{
        if(e?.type!=='hit'&&e?.type!=='hostile')throw new RangeError('Invalid BR checkpoint effect');
        return {...checkedFields(e,[...POSITION_FIELDS,['t',0,1]]),type:e.type};
      }),
      message:game.message,messageTime:game.messageTime,
      lastTagAt:game.lastTagAt,recentDamage:game.recentDamage};
    // Refuse to overwrite a usable save with internally contradictory actor
    // state. The restore path already rejects these, but autosave must too.
    if (checkpoint.player.alive !== true || checkpoint.player.health <= 0 ||
        typeof checkpoint.player.reloadAssist !== 'boolean' ||
        typeof checkpoint.player.reloadHesitation !== 'boolean' ||
        typeof checkpoint.player.sprintExhausted !== 'boolean' ||
        checkpoint.bots.some(b => typeof b.alive !== 'boolean' ||
          typeof b.disqualified !== 'boolean' ||
          (b.disqualified ? (b.alive || b.health <= 0) : b.alive !== (b.health > 0)) ||
          b.loaded > b.charges) ||
        checkpoint.kills > checkpoint.bots.filter(b => !b.alive).length)
      throw new RangeError('Invalid BR checkpoint actor state');
    // Validate on WRITE, not only on restore. Otherwise one corrupted frame
    // can overwrite the last usable offline checkpoint with an unloadable save.
    // This is local save integrity, not multiplayer anti-tamper protection.
    const firearm=FIREARMS[checkpoint.player.weaponId];
    const p=checkpoint.player;
    if (!firearm || p.maxCharges!==firearm.maxRounds || p.charges>p.maxCharges ||
        p.loaded>p.charges || p.loaded>firearm.magazine ||
        (p.reloadHesitation && p.reloadRemaining<=0) ||
        blocked(p.x,p.z,ACTOR_RADIUS,game.obstacles) ||
        checkpoint.bots.some((b,i)=>b.id!==i ||
          blocked(b.x,b.z,ACTOR_RADIUS,game.obstacles)) ||
        overlappingLivingActors(checkpoint.player,checkpoint.bots))
      throw new RangeError('Invalid BR checkpoint inventory or collision');
    if (checkpoint.loot.length!==40 || checkpoint.loot.some((item,i)=>
        item.id!==i || item.kind!==(i%2===0?'ammo':'magazine') ||
        !Object.prototype.hasOwnProperty.call(FIREARMS,item.weaponId) ||
        item.remaining>(i%2===0?12:24) ||
        typeof item.picked!=='boolean' ||
        item.picked!==(item.remaining===0) ||
        blocked(item.x,item.z,ACTOR_RADIUS,game.obstacles)))
      throw new RangeError('Invalid BR checkpoint pickup state');
    const expectedZone=phaseAt(checkpoint.elapsed);
    if (!finite(checkpoint.elapsed,0,3600) ||
        checkpoint.zone.x!==0 || checkpoint.zone.z!==0 ||
        checkpoint.zone.phase!==expectedZone.phase ||
        Math.abs(checkpoint.zone.radius-expectedZone.radius)>1e-6 ||
        Math.abs(checkpoint.zone.phaseRemaining-expectedZone.phaseRemaining)>1e-6)
      throw new RangeError('Invalid BR checkpoint zone clock');
    // A boundary disqualification must have an observable spatial cause.
    // Reject fabricated non-injured eliminations inside the legal play area.
    if(checkpoint.bots.some(b=>b.disqualified &&
        dist(b,checkpoint.zone)<=checkpoint.zone.radius))
      throw new RangeError('Invalid BR checkpoint boundary ruling');
    validateCheckpointTiming(checkpoint,firearm);
    const serialized=JSON.stringify(checkpoint);
    if (serialized.length > MAX_CHECKPOINT_CHARS) throw new RangeError('BR checkpoint too large');
    return serialized;
  }
  function restoreMatch(serialized) {
    if (typeof serialized === 'string' && serialized.length > MAX_CHECKPOINT_CHARS)
      throw new RangeError('BR checkpoint too large');
    let saved;
    try { saved = typeof serialized === 'string' ? JSON.parse(serialized) : serialized; }
    catch (_) { throw new RangeError('Malformed BR checkpoint'); }
    if (!saved || saved.version !== CHECKPOINT_VERSION || saved.status !== 'playing' ||
        !integer(saved.seed,0,Number.MAX_SAFE_INTEGER) || !integer(saved.rngState,1,0xffffffff) ||
        !finite(saved.elapsed,0,3600) || !integer(saved.kills,0,MAX_BOTS) ||
        !Array.isArray(saved.bots) || saved.bots.length>MAX_BOTS || saved.kills>saved.bots.length ||
        !Array.isArray(saved.loot) || saved.loot.length!==40 ||
        !Array.isArray(saved.effects) || saved.effects.length>256 ||
        typeof saved.message!=='string' || saved.message.length>120)
      throw new RangeError('Invalid BR checkpoint');
    const weaponId=saved.player && saved.player.weaponId;
    if (!Object.prototype.hasOwnProperty.call(FIREARMS,weaponId)) throw new RangeError('Unknown saved firearm');
    const firearm=FIREARMS[weaponId];
    // Recreate authored cover once; saved positions are untrusted and must not
    // resume inside a wall or beyond the playable boundary.
    const game=newMatch(saved.seed,saved.bots.length,weaponId);
    // Reject malformed checkpoint flags instead of silently coercing strings,
    // numbers or null to false. Older v1 saves may omit the optional control
    // flags, which legitimately default to false for backward compatibility.
    if (saved.player.alive !== true ||
        ['reloadAssist','reloadHesitation','sprintExhausted'].some(key =>
          saved.player[key] !== undefined && typeof saved.player[key] !== 'boolean'))
      throw new RangeError('Invalid player checkpoint flags');
    const p={...checkedFields(saved.player,PLAYER_FIELDS),weaponId,
      alive:true,reloadAssist:saved.player.reloadAssist===true,
      reloadHesitation:saved.player.reloadHesitation===true,
      sprintExhausted:saved.player.sprintExhausted===true};
    if (!p.alive || p.health<=0 || p.charges>p.maxCharges || p.maxCharges!==firearm.maxRounds ||
        p.loaded>firearm.magazine || p.loaded>p.charges ||
        (p.reloadHesitation && p.reloadRemaining<=0)) throw new RangeError('Invalid player inventory');
    if (blocked(p.x,p.z,0.85,game.obstacles)) throw new RangeError('Invalid player collision');
    const bots=saved.bots.map((raw,i)=>{
      if (!raw || typeof raw.alive !== 'boolean' ||
          (raw.disqualified !== undefined && typeof raw.disqualified !== 'boolean'))
        throw new RangeError('Invalid opponent checkpoint flag');
      // Existing v3 saves did not have this flag; their combat eliminations
      // remain valid. New boundary rulings preserve positive health.
      const b={...checkedFields(raw,BOT_FIELDS),alive:raw.alive,
        disqualified:raw.disqualified===true};
      if (b.id!==i || b.loaded>b.charges ||
          (b.disqualified ? (b.alive || b.health<=0) : b.alive !== (b.health>0)) ||
          blocked(b.x,b.z,0.85,game.obstacles))
        throw new RangeError('Invalid opponent state');
      return b;
    });
    if (saved.kills>bots.filter(b=>!b.alive).length)
      throw new RangeError('Invalid elimination count');
    if (overlappingLivingActors(p,bots))
      throw new RangeError('Invalid living actor overlap');
    const loot=saved.loot.map((raw,i)=>{
      if (!raw || typeof raw.picked !== 'boolean')
        throw new RangeError('Invalid pickup checkpoint flag');
      const item={...checkedFields(raw,LOOT_FIELDS),kind:raw.kind,weaponId:raw.weaponId,
        picked:raw.picked};
      if (item.id!==i || item.kind!==(i%2===0?'ammo':'magazine') ||
          !Object.prototype.hasOwnProperty.call(FIREARMS,item.weaponId) ||
          item.remaining>(i%2===0?12:24) || item.picked!==(item.remaining===0) ||
          blocked(item.x,item.z,0.85,game.obstacles))
        throw new RangeError('Invalid pickup state');
      return item;
    });
    const zone=checkedFields(saved.zone,[...POSITION_FIELDS,['radius',0,170],
      ['phase',0,ZONE_PHASES.length-1,true],['phaseRemaining',0,999]]);
    const expected=phaseAt(saved.elapsed);
    if (bots.some(b=>b.disqualified && dist(b,zone)<=zone.radius))
      throw new RangeError('Invalid opponent boundary ruling');
    if (zone.phase!==expected.phase || Math.abs(zone.radius-expected.radius)>1e-6 ||
        Math.abs(zone.phaseRemaining-expected.phaseRemaining)>1e-6 || zone.x!==0 || zone.z!==0)
      throw new RangeError('Invalid zone clock');
    const effects=saved.effects.map(raw=>{
      const e=checkedFields(raw,[...POSITION_FIELDS,['t',0,1]]);
      if (raw.type!=='hit' && raw.type!=='hostile') throw new RangeError('Invalid effect');
      return {...e,type:raw.type};
    });
    const extras=checkedFields(saved,[['damageFlash',0,1],['messageTime',0,10],
      ['lastTagAt',-2,3600],['recentDamage',0,100]]);
    validateCheckpointTiming({elapsed:saved.elapsed,lastTagAt:extras.lastTagAt,player:p,bots},firearm);
    Object.assign(game,{status:'playing',elapsed:saved.elapsed,kills:saved.kills,
      damageFlash:extras.damageFlash,player:p,bots,loot,zone,effects,
      message:saved.message,messageTime:extras.messageTime,
      lastTagAt:extras.lastTagAt,recentDamage:extras.recentDamage});
    game.random.setState(saved.rngState);
    return game;
  }
  return {boundaryStatus,WORLD,ZONE_PHASES,FIREARMS,MAGAZINE_SIZE,RELOAD_SECONDS,RELOAD_HESITATION_SECONDS,STRESS_THRESHOLD,SPRINT_RECOVERY_STAMINA,canSprint,hearsFootsteps,hearsImpulse,approximateSoundPosition,newMatch,tick,tag,autoFire,reload,advanceReload,updateStress,injuryMobility,setReloadAssist,pickup,canReachPickup,nearestReachablePickup,getAliveCount,getFinalPlacement,phaseAt,blocked,lineBlocked,moveEntity,rngFromSeed,receiveDamage,snapshotMatch,restoreMatch};
});
