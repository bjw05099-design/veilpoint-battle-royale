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
  const BR_HEADLAMP_TICKS=120*60; // Two-minute finite dusk-only charge.
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
  // Cover has a finite height; movement still uses its ground footprint.
  // Older collision-only proxies without h remain opaque.
  function segmentBox(origin,direction,limit,box){
    let near=0,far=limit;
    const base=Number.isFinite(box.y)?box.y:0;
    const top=Number.isFinite(box.h)?base+box.h:Infinity;
    for(const [p,v,min,max] of [
      [origin.x,direction.x,box.x-box.w/2,box.x+box.w/2],
      [origin.y,direction.y,base,top],
      [origin.z,direction.z,box.z-box.d/2,box.z+box.d/2]
    ]){
      if(Math.abs(v)<1e-10){if(p<min||p>max)return Infinity;}
      else{
        let a=(min-p)/v,b=(max-p)/v;
        if(a>b)[a,b]=[b,a];
        near=Math.max(near,a);far=Math.min(far,b);
        if(near>far)return Infinity;
      }
    }
    return near<=far?near:Infinity;
  }
  function lineBlocked3D(ax,ay,az,bx,by,bz,obstacles){
    const origin={x:ax,y:ay,z:az},direction={x:bx-ax,y:by-ay,z:bz-az};
    return obstacles.some(o=>segmentBox(origin,direction,1,o)<=1);
  }
  // Original hitscan prototype; no penetration, drop or calibrated real data.
  // Nearest finite body wins, including an intervening friendly body.
  // Distance is horizontal metres, matching the existing class ranges.
  function traceShot(origin,yaw,pitch,range,obstacles,actors){
    const direction={x:Math.sin(yaw),y:Math.tan(pitch),z:-Math.cos(yaw)};
    let best=range,target=null;
    for(const box of obstacles)best=Math.min(best,segmentBox(origin,direction,range,box));
    for(const actor of actors){
      if(actor.alive===false||actor.eligible===false)continue;
      const radius=actor.bodyRadius||ACTOR_RADIUS;
      const vx=actor.x-origin.x,vz=actor.z-origin.z;
      const forward=vx*direction.x+vz*direction.z;
      const lateral=vx*direction.z-vz*direction.x;
      if(Math.abs(lateral)>=radius)continue;
      const half=Math.sqrt(radius*radius-lateral*lateral);
      let near=Math.max(0,forward-half),far=Math.min(best,forward+half);
      const low=.15,high=actor.crouched||actor.crouchHeld?1.25:1.9;
      if(Math.abs(direction.y)<1e-10){if(origin.y<low||origin.y>high)continue;}
      else{
        let a=(low-origin.y)/direction.y,b=(high-origin.y)/direction.y;
        if(a>b)[a,b]=[b,a];
        near=Math.max(near,a);far=Math.min(far,b);
      }
      if(near<=far&&near<best&&far>0){target=actor;best=near;}
    }
    return target?{actor:target,distance:best,x:origin.x+direction.x*best,
      y:origin.y+direction.y*best,z:origin.z+direction.z*best}:null;
  }
  // Shared walk-through loading hall. Every piece stays inside the former
  // solid footprint, keeping old exterior saves clear of the new walls.
  function harborPassage(x,z,w,d,h){
    const wall=.5,door=4,wing=(w-door)/2;
    const parts=[
      {x:x-w/2+wall/2,z,w:wall,d,h},
      {x:x+w/2-wall/2,z,w:wall,d,h},
      ...[-1,1].flatMap(end=>[-1,1].map(side=>({
        x:x+side*(door/2+wing/2),z:z+end*(d/2-wall/2),w:wing,d:wall,h
      }))),
      {x:x-w/2+2.4,z:z-2,w:2.4,d:3,h:1.3},
      {x:x+w/2-2.4,z:z+2,w:2.4,d:3,h:1.3}
    ];
    return parts.map((part,i)=>({...part,type:i<6?'harbor-passage-wall':'harbor-passage-crate'}));
  }
  // Finite, local sound awareness: walking is audible nearby, crouching quieter,
  // and sprinting farther. Sound-only memory is imprecise; cover attenuates the
  // authored hearing radius; this is a game abstraction, not an acoustic model.
  function hearsFootsteps(listener, source, movedDistance, sprinting, obstacles, crouching=false, wet=false) {
    if (!(movedDistance > 1e-7)) return false;
    // Wet boots splashing on the authored waterlogged apron are modestly
    // louder than dry steps; a wall still attenuates them. No exact-location
    // leak or global sound event is generated.
    const surfaceGain=wet?1.3:1;
    const clearRange=(crouching?1.5:sprinting?12:3.5)*surfaceGain;
    const occludedRange=(crouching?0.75:sprinting?6:1.75)*surfaceGain;
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
  function canSeeActor(observer, subject, obstacles, distance = dist(observer, subject), actors = null, sightRange=55) {
    if (distance >= sightRange) return false;
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
      if (range >= sightRange || lineBlocked3D(observer.x,observer.crouched?1.09:1.64,
        observer.z,x,subject.crouched?1.2:1.75,z,obstacles)) return false;
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
  // The north service-yard road has a physically sliding, locally controlled
  // gate. There is no remote unlocking, infinite stock or supernatural sensor.
  const SERVICE_YARD=Object.freeze({x:30,z:-24,switchX:30,switchZ:-21.8,slide:7.2,seconds:2});
  // Two identifiable, non-respawning supply shelves on the east-dock public
  // walkway. These reuse the existing 40 finite caches, never mint extra stock.
  // If an actor spawned on a shelf, leave that item at its original seeded
  // fallback rather than overlap a living participant.
  const DOCK_DEPOTS=Object.freeze([
    Object.freeze({x:108,z:-121}),Object.freeze({x:144,z:-121})
  ]);
  // Visible waterlogged loading apron near the center of the playable harbor.
  // Standing rainwater slows traction without artificial damage or buffs.
  // Geometry is also rendered in the WebGL/Canvas worlds and native map.
  const WET_LOADING_PAD=Object.freeze({x:35,z:-40,width:14,depth:18,mobility:.86});
  function wetApronFooting(actor){
    const wet=!!actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.z)&&
      Math.abs(actor.x-WET_LOADING_PAD.x)<=WET_LOADING_PAD.width/2&&
      Math.abs(actor.z-WET_LOADING_PAD.z)<=WET_LOADING_PAD.depth/2;
    return {wet,mobility:wet?WET_LOADING_PAD.mobility:1};
  }
  // Brief waves reach the low existing loading apron in a repeating weather
  // cycle. This is visible shallow wash, never HP damage, forced sliding or
  // client-controlled water level. The same game.elapsed 60Hz clock that is
  // already checkpointed determines the phase after resume, so no save schema
  // change or random teleports occur. No flooded real-world site is modeled.
  function harborWaveWash(elapsed,actor=null){
    const time=Number.isFinite(elapsed)&&elapsed>=0?elapsed:0;
    const phase=time%45;
    const active=phase>=12&&phase<18;
    const onApron=actor?wetApronFooting(actor).wet:true;
    return {active,mobility:active&&onApron?0.78:1,
      remaining:active?18-phase:phase<12?12-phase:57-phase};
  }
  // Permanently installed inspection shelter with a walk-in southern entrance.
  // Only its three physical walls collide; the roof is an elevated visual
  // surface. Interior and entrance remain traversable at the real actor radius.
  const INSPECTION_SHELTER=Object.freeze({x:-100,z:-132,width:16,depth:10,roofHeight:3.2});
  // One manually pushed, low-speed dock handcart: a real collision body,
  // not a free-floating movable marker or an instantly relocated supply.
  const DOCK_HANDCART=Object.freeze({x:132,z:-121,w:1.4,d:.9,h:1.0,speed:1.6});
  // A small, non-combat port service vehicle. This is an authored, low-speed
  // transport prototype, not an arcade boost or real driving instruction.
  const YARD_SHUTTLE=Object.freeze({x:22,z:-9,yaw:Math.PI/2,w:2.05,d:4.1,h:2.1,
    forwardSpeed:6,reverseSpeed:2.2,accelerate:2.5,coast:3,steering:.78,fuel:6});
  function shuttleAabb(yaw){
    const c=Math.abs(Math.cos(yaw)),t=Math.abs(Math.sin(yaw));
    return {w:YARD_SHUTTLE.w*c+YARD_SHUTTLE.d*t,
      d:YARD_SHUTTLE.w*t+YARD_SHUTTLE.d*c};
  }
  function shuttleBody(game){
    return game.obstacles.find(o=>o.routeId==='br-yard-shuttle');
  }
  function shuttleClear(game,x,z,yaw,actors=game.bots,stores=game.loot){
    // Three longitudinal probes approximate the vehicle's real footprint
    // against the same collidable world used for pedestrian movement.
    const staticWorld=game.obstacles.filter(o=>o.routeId!=='br-yard-shuttle');
    for(const offset of [-1.25,0,1.25]){
      const px=x+Math.sin(yaw)*offset,pz=z-Math.cos(yaw)*offset;
      if(blocked(px,pz,.95,staticWorld)||
        actors.some(b=>b.alive&&Math.hypot(b.x-px,b.z-pz)<1.65)||
        stores.some(item=>!item.picked&&Math.hypot(item.x-px,item.z-pz)<1.45))
        return false;
    }
    return true;
  }
  function shuttleStatus(game){
    if(!game?.vehicle||game.scene||game.status!=='playing')
      return {near:false,driving:false};
    const v=game.vehicle,p=game.player;
    const near=Math.hypot(v.x-p.x,v.z-p.z)<=3.5&&
      !lineBlocked(p.x,p.z,v.x,v.z,game.obstacles.filter(o=>o.routeId!=='br-yard-shuttle'));
    return {near:near||v.driver,driving:v.driver,speed:Math.abs(v.speed),
      braking:v.driver&&game.vehicleBrake===true,
      fuel:v.fuel,x:v.x,z:v.z};
  }
  function operateYardShuttle(game){
    const info=shuttleStatus(game);
    if(!info.near)return {ok:false,reason:'out_of_reach'};
    const v=game.vehicle,p=game.player;
    if(v.driver){
      if(Math.abs(v.speed)>.12)return {ok:false,reason:'vehicle_moving'};
      // Leave into a physical clear space beside the vehicle, never through
      // scenery. A stopped truck must not force the player into a wall.
      for(const side of [1,-1])for(const length of [2.5,3.25,4.0]){
        const x=v.x+side*Math.cos(v.yaw)*length;
        const z=v.z+side*Math.sin(v.yaw)*length;
        if(blocked(x,z,.85,game.obstacles)||
          game.bots.some(b=>b.alive&&Math.hypot(b.x-x,b.z-z)<1.8))continue;
        p.x=x;p.z=z;v.driver=false;v.speed=0;game.vehicleBrake=false;
        game.message='YARD VEHICLE PARKED · ON FOOT';game.messageTime=2;
        return {ok:true,event:'exit'};
      }
      return {ok:false,reason:'exit_obstructed'};
    }
    if(Math.abs(v.speed)>.01)return {ok:false,reason:'vehicle_moving'};
    if(game.handcart?.engaged)return {ok:false,reason:'hands_occupied'};
    v.driver=true;game.vehicleBrake=false;p.x=v.x;p.z=v.z;p.yaw=v.yaw;
    game.message='YARD VEHICLE · W/S DRIVE · A/D TURN · CROUCH BRAKE · E EXIT WHEN STOPPED';
    game.messageTime=4;
    return {ok:true,event:'enter'};
  }
  function advanceYardShuttle(game,dt,input={}){
    const v=game?.vehicle;
    if(!v?.driver){if(game)game.vehicleBrake=false;return false;}
    // The remappable crouch input becomes a real held service brake only
    // while seated. Driver cannot crouch or fire from this vehicle. Braking
    // uses fixed 60Hz deceleration, no instantaneous velocity reversal.
    const braking=!!input.crouch;
    game.vehicleBrake=braking;
    const forward=braking?0:Number(!!input.forward)-Number(!!input.back);
    if(v.fuel<=0){v.speed=0;return true;}
    if(braking){
      const reduction=8.5*dt;
      v.speed=Math.abs(v.speed)<=reduction?0:
        v.speed-Math.sign(v.speed)*reduction;
    }else if(forward!==0)
      v.speed=clamp(v.speed+forward*YARD_SHUTTLE.accelerate*dt,
        -YARD_SHUTTLE.reverseSpeed,YARD_SHUTTLE.forwardSpeed);
    else {
      const change=YARD_SHUTTLE.coast*dt;
      v.speed=Math.abs(v.speed)<=change?0:v.speed-Math.sign(v.speed)*change;
    }
    const steer=Number(!!input.right)-Number(!!input.left);
    const turn=steer*YARD_SHUTTLE.steering*dt*
      Math.min(1,Math.abs(v.speed)/2)*Math.sign(v.speed);
    const yaw=v.yaw+turn;
    const dx=Math.sin(yaw)*v.speed*dt,dz=-Math.cos(yaw)*v.speed*dt;
    const nextX=v.x+dx,nextZ=v.z+dz;
    if(shuttleClear(game,nextX,nextZ,yaw)){
      v.x=nextX;v.z=nextZ;v.yaw=yaw;
      const aabb=shuttleAabb(yaw),body=shuttleBody(game);
      if(body){body.x=v.x;body.z=v.z;body.w=aabb.w;body.d=aabb.d;}
      game.player.x=v.x;game.player.z=v.z;
      v.fuel=Math.max(0,v.fuel-Math.hypot(dx,dz)*.0025);
    }else v.speed=0;
    if(v.fuel===0){v.speed=0;game.message='YARD VEHICLE OUT OF FUEL';game.messageTime=2;}
    return true;
  }
  function makeObstacles(terrainRevision=1) {
    const o = [];
    const clusters = [
      [-85,-76], [70,-78], [-78,77], [83,76], [0,-105], [-111,4], [114,10], [6,105]
    ];
    clusters.forEach(([x,z], i) => {
      const horizontal = i % 2 === 0;
      if(i===6&&terrainRevision===1)o.push(...harborPassage(x,z,27,15,8));
      else o.push({ x, z, w: horizontal ? 27 : 15, d: horizontal ? 15 : 27, h: 8 + i % 3 * 2, type: 'building' });
      o.push({ x: x+30, z: z+14, w: 10, d: 9, h: 4.5, type: 'shed' });
      o.push({ x: x-24, z: z+23, w: 5, d: 12, h: 3, type: 'container' });
    });
    // East-dock district: an authored, navigable industrial yard. Every solid
    // structure is shared with the WebGL world and the 60 Hz collision map.
    // Keep a clear pedestrian/service lane along z=-121 and a 4 m central
    // access gap; avoid placing decorative invisible colliders.
    o.push({x:113,z:-137,w:24,d:10,h:9,type:'dock-warehouse'});
    o.push({x:113,z:-102,w:24,d:10,h:8,type:'dock-warehouse'});
    o.push({x:143,z:-137,w:9,d:5,h:2.6,type:'dock-container'});
    o.push({x:143,z:-103,w:9,d:5,h:2.6,type:'dock-container'});
    o.push({x:132,z:-154,w:5,d:5,h:12,type:'dock-crane'});
    // The western waterfront adds a genuinely navigable, protected quay
    // passage. Both walls have physical AABB bodies; the 18m-wide lane
    // between them remains open for the 60Hz player and rival controllers.
    // Locations are deliberately away from the initial fixed spawn.
    o.push({x:-135,z:-126,w:22,d:2,h:2.3,type:'dock-breakwater'});
    o.push({x:-135,z:-144,w:22,d:2,h:2.3,type:'dock-breakwater'});
    o.push({x:-151,z:-135,w:2,d:3,h:3,type:'dock-bollard'});
    // Original volcanic rock band inspired by Aden's jagged coastal ridges,
    // NOT satellite-measured historical structures or a military route.
    // Each large visible outcrop is the exact collidable BR AABB, and the
    // open spaces between them are ordinary on-foot traversable corridors.
    if(terrainRevision===1)for(const [x,z,w,d,h] of [
      [-158,43,7,9,5.3],[-155,62,8,7,6.5],
      [-151,82,7,10,4.7],[-133,74,9,7,3.9],
      [-116,97,7,9,5.1]
    ])o.push({x,z,w,d,h,type:'volcanic-outcrop'});
    // Open-front harbor inspection shelter: one rear wall and two side walls.
    // The southern-looking opening at z=-127 is intentionally not blocked.
    o.push({x:-100,z:-137,w:16,d:.8,h:3.2,type:'dock-inspection-wall'});
    o.push({x:-108,z:-132,w:.8,d:10,h:3.2,type:'dock-inspection-wall'});
    o.push({x:-92,z:-132,w:.8,d:10,h:3.2,type:'dock-inspection-wall'});
    // Two fixed perimeter segments flank the movable service gate. The gate
    // itself stays in the world array so both player and AI use its live body.
    o.push({x:SERVICE_YARD.x-10.5,z:SERVICE_YARD.z,w:15,d:.6,h:2.2,type:'yard-fence'});
    o.push({x:SERVICE_YARD.x+10.5,z:SERVICE_YARD.z,w:15,d:.6,h:2.2,type:'yard-fence'});
    o.push({x:SERVICE_YARD.x,z:SERVICE_YARD.z,w:6,d:.6,h:2.3,
      type:'yard-gate',routeId:'br-service-gate'});
    o.push({...DOCK_HANDCART,type:'dock-handcart',routeId:'br-dock-handcart'});
    const footprint=shuttleAabb(YARD_SHUTTLE.yaw);
    o.push({x:YARD_SHUTTLE.x,z:YARD_SHUTTLE.z,w:footprint.w,
      d:footprint.d,h:YARD_SHUTTLE.h,
      type:'yard-service-vehicle',routeId:'br-yard-shuttle'});
    // The original Aden-inspired civic quarter is SHARED, not duplicated:
    // both BR and CH01 consume these same fixed collision coordinates.
    // Five perimeter walls leave a six-metre street-level southern entrance,
    // and a staffed market stall occupies the west side of a walkable yard.
    // This independent neighborhood is well beyond existing central BR
    // encounter/industrial-yard fixtures and remains inside the map square.
    // Legacy revision-0 saves retain their earlier collision geography.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [64,125,.6,18,4,'aden-civic-wall'],
      [90,125,.6,18,4,'aden-civic-wall'],
      [77,134,26,.6,4,'aden-civic-wall'],
      [69,116,10,.6,4,'aden-civic-wall'],
      [85,116,10,.6,4,'aden-civic-wall'],
      [69,127,3,2,1.3,'aden-civic-stall']
    ])o.push({x,z,w,d,h,type});
    // Second shared public quarter: an open-west pedestrian arcade with a
    // real continuous six-metre entrance, a roofed lane and a public tap.
    // The eastern site uses ordinary fictional urban scale, not surveyed
    // layouts of any modern sensitive building in Aden.
    // These same solids are used by both BR and CH01 without duplicated maps.
    // Keep the feature in terrain revision 1; older BR saves remain exact.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [148,85,.6,18,3.8,'aden-arcade-wall'],
      [136,94,24,.6,3.8,'aden-arcade-wall'],
      [136,76,24,.6,3.8,'aden-arcade-wall'],
      [124,90,.6,8,3.8,'aden-arcade-wall'],
      [124,78,.6,4,3.8,'aden-arcade-wall'],
      [142,88,.9,.7,1.3,'aden-arcade-water']
    ])o.push({x,z,w,d,h,type});
    // A third, open pedestrian link physically joins the public courtyard
    // to the western doorway of the street arcade. Two benches and a post
    // are low-volume cover/streetscape, not magic barriers; the central
    // walkable lane stays clear and identical in BR and CH01.
    // This is a fictional Aden-inspired neighborhood, not a survey or
    // reproduction of any real military or protected facility.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [93,114,4,.65,.65,'aden-pedestrian-bench'],
      [111,101,3.4,.65,.65,'aden-pedestrian-bench'],
      [104,108,.65,.65,2.15,'aden-pedestrian-post']
    ])o.push({x,z,w,d,h,type});
    // A third shared civic place: a shaded, walk-through neighborhood court.
    // Four visible supports and two low side seats surround a genuinely open
    // north-south center aisle. The high canopy has NO ground-level collider;
    // BR and CH01 both use these same original non-sensitive urban footprints.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [35,67,.8,.8,3.2,'aden-shade-post'],
      [51,67,.8,.8,3.2,'aden-shade-post'],
      [35,83,.8,.8,3.2,'aden-shade-post'],
      [51,83,.8,.8,3.2,'aden-shade-post'],
      [37,75,.8,4,.7,'aden-shade-seat'],
      [49,75,.8,4,.7,'aden-shade-seat']
    ])o.push({x,z,w,d,h,type});
    // Shared civilian ferry waiting hall in the original fictional waterfront.
    // South opening and a six-metre northern doorway remain walkable by both
    // BR and CH01 players. Every low bench/column is a 60Hz collision body;
    // the high canopy is rendered separately and never an invisible wall.
    // This is NOT a reproduction of a real harbor or sensitive building.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-56,135,.6,20,3.3,'aden-ferry-hall-wall'],
      [-34,135,.6,20,3.3,'aden-ferry-hall-wall'],
      [-52,145,8,.6,3.3,'aden-ferry-hall-wall'],
      [-38,145,8,.6,3.3,'aden-ferry-hall-wall'],
      [-51,137,1.0,4,.68,'aden-ferry-hall-bench'],
      [-39,135,1.0,4,.68,'aden-ferry-hall-bench'],
      [-52,131,.65,1.1,1.65,'aden-ferry-hall-notice']
    ])o.push({x,z,w,d,h,type});
    // A fourth, genuinely walkable shared seaside market lane. Two parallel
    // public shopfronts flank a wide north-south passage; two short front
    // walls leave the northern center physically OPEN (not a painted door).
    // Original fictional civilian architecture, not an Aden site reconstruction.
    // No second CH01 copy: both modes consume this same authored collision.
    // Revision-zero historical rounds retain their original street geometry.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [16,147,.6,18,3.5,'aden-seafront-market-wall'],
      [40,147,.6,18,3.5,'aden-seafront-market-wall'],
      [20,156,8,.6,3.5,'aden-seafront-market-wall'],
      [36,156,8,.6,3.5,'aden-seafront-market-wall'],
      [20,146,1.8,3,1.1,'aden-seafront-market-counter'],
      [36,146,1.8,3,1.1,'aden-seafront-market-counter']
    ])o.push({x,z,w,d,h,type});
    // Original public market court on the fictional western shore. This
    // authored 12m-wide open pedestrian axis has physically separate side
    // counters and north/south entrances; no closed-volume fake interiors.
    // It is one shared collision source for CH01 and BR, never a surveyed
    // replica of Aden facilities. Revision-0 historical terrain stays intact.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-123,128,.6,28,3.5,'aden-market-court-wall'],
      [-91,128,.6,28,3.5,'aden-market-court-wall'],
      [-118,142,10,.6,3.5,'aden-market-court-wall'],
      [-96,142,10,.6,3.5,'aden-market-court-wall'],
      [-118,114,10,.6,3.5,'aden-market-court-wall'],
      [-96,114,10,.6,3.5,'aden-market-court-wall'],
      [-119,127,2.1,4,1.2,'aden-market-court-counter'],
      [-95,130,2.1,4,1.2,'aden-market-court-counter'],
      [-117,135,3.5,.7,.75,'aden-market-court-bench'],
      [-97,120,3.5,.7,.75,'aden-market-court-bench']
    ])o.push({x,z,w,d,h,type});
    // Walk-in western public fish hall, authored once for both offline BR and
    // CH01. The southern opening is genuinely unobstructed: a player can
    // enter, pass between the two counters, and leave without a prompt.
    // Distinct original fictional architecture, never an identifiable Aden site.
    // Only revision 1 adds these collision bodies; legacy revision 0 is intact.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-164,121,.6,18,3.4,'aden-fishhall-wall'],
      [-144,121,.6,18,3.4,'aden-fishhall-wall'],
      [-154,130,20,.6,3.4,'aden-fishhall-wall'],
      [-161,123,2.2,3.4,1.1,'aden-fishhall-counter'],
      [-147,123,2.2,3.4,1.1,'aden-fishhall-counter']
    ])o.push({x,z,w,d,h,type});
    // Eastern civilian transit forecourt. Open 14m-wide entrances at both
    // ends, two side benches and continuous ground-level pedestrian axis.
    // No real-world landmark replica. Story and BR use these SAME solids.
    // This extends revision-1 only; older stored terrain remains untouched.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [118,125,.75,26,3.1,'aden-transit-court-wall'],
      [150,125,.75,26,3.1,'aden-transit-court-wall'],
      [122,138,7,.75,3.1,'aden-transit-court-wall'],
      [146,138,7,.75,3.1,'aden-transit-court-wall'],
      [122,112,7,.75,3.1,'aden-transit-court-wall'],
      [146,112,7,.75,3.1,'aden-transit-court-wall'],
      [122,125,2.2,4,1.0,'aden-transit-court-bench'],
      [146,125,2.2,4,1.0,'aden-transit-court-bench']
    ])o.push({x,z,w,d,h,type});
    // Original fictional shoreline neighborhood between the ferry lobby and
    // inland shaded court. Four separate public canopy posts and low benches
    // leave a 12 m walkable central north-south passage. All bodies are
    // authored once here and shared by BR and CH01, not duplicated in either.
    // Visual canopy roofing has no invisible player-height collision.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-40,72,.7,.7,3,'aden-promenade-post'],
      [-16,72,.7,.7,3,'aden-promenade-post'],
      [-40,89,.7,.7,3,'aden-promenade-post'],
      [-16,89,.7,.7,3,'aden-promenade-post'],
      [-37,80,2.4,1,.7,'aden-promenade-seat'],
      [-19,80,2.4,1,.7,'aden-promenade-seat']
    ])o.push({x,z,w,d,h,type});
    // Walkable public shade-stop between the coastal promenade and the
    // eastern neighborhood. Four narrow supports and two seats leave the
    // entire central east-west aisle open. All six solids are shared with
    // CH01 via createWorld(), and are intentionally fictional civic scenery.
    // Existing revision-0 checkpoints retain their old geometry.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-9,48,.65,.65,3.0,'aden-shadestop-post'],
      [9,48,.65,.65,3.0,'aden-shadestop-post'],
      [-9,61,.65,.65,3.0,'aden-shadestop-post'],
      [9,61,.65,.65,3.0,'aden-shadestop-post'],
      [-7,55,2.4,1,.7,'aden-shadestop-seat'],
      [7,55,2.4,1,.7,'aden-shadestop-seat']
    ])o.push({x,z,w,d,h,type});
    // Civilian covered market gallery connects two original public
    // neighborhoods through an open, unobstructed 10 m pedestrian axis.
    // Columns and merchant counters are separate physical objects. This is
    // original fictional urban architecture, not a surveyed conflict site.
    // One source serves BR and CH01; revision-0 saves stay unchanged.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-78,105,.65,.65,3.2,'aden-gallery-post'],
      [-58,105,.65,.65,3.2,'aden-gallery-post'],
      [-78,119,.65,.65,3.2,'aden-gallery-post'],
      [-58,119,.65,.65,3.2,'aden-gallery-post'],
      [-76,113,2.6,1.6,1.1,'aden-gallery-counter'],
      [-60,113,2.6,1.6,1.1,'aden-gallery-counter']
    ])o.push({x,z,w,d,h,type});
    // Public craft hall and adjoining shaded pedestrian forecourt. This
    // fictional, non-georeferenced neighborhood is shared by BR and CH01.
    // Two usable side rooms open from a 12m CENTRAL passage; north and south
    // 10m doors are physical gaps, not painted portals. Exterior forecourt
    // furnishings remain solid, while roof panels are visual overhead only.
    // Keep revision-0 save geometry unchanged; no special mission trigger.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-80,36,.7,30,3.6,'aden-craft-hall-wall'],
      [-46,36,.7,30,3.6,'aden-craft-hall-wall'],
      [-74,51,12,.7,3.6,'aden-craft-hall-wall'],
      [-52,51,12,.7,3.6,'aden-craft-hall-wall'],
      [-74,21,12,.7,3.6,'aden-craft-hall-wall'],
      [-52,21,12,.7,3.6,'aden-craft-hall-wall'],
      [-70,35,.65,14,2.8,'aden-craft-hall-divider'],
      [-56,35,.65,14,2.8,'aden-craft-hall-divider'],
      [-75,31,2.8,1.2,1.45,'aden-craft-hall-shelf'],
      [-51,31,2.8,1.2,1.45,'aden-craft-hall-shelf'],
      [-75,42,3,1.6,.92,'aden-craft-hall-table'],
      [-51,42,3,1.6,.92,'aden-craft-hall-table'],
      [-77,57,.8,.8,3.15,'aden-craft-court-post'],
      [-49,57,.8,.8,3.15,'aden-craft-court-post'],
      [-77,64,.8,.8,3.15,'aden-craft-court-post'],
      [-49,64,.8,.8,3.15,'aden-craft-court-post'],
      [-74,61,4,1,.72,'aden-craft-court-seat'],
      [-52,61,4,1,.72,'aden-craft-court-seat']
    ])o.push({x,z,w,d,h,type});
    // Original public coastal shop street linking the open craft hall,
    // promenade and ferry approach. Two individually enterable street-front
    // rooms flank a 9m central on-foot lane. This is a local fictional
    // neighborhood, not an existing Aden establishment or mapped checkpoint.
    // Ground-level dividers stop SHORT of their south entrances. Each fixture
    // has a 60Hz collision body shared by CH01, offline BR and BR96.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-51,105,.65,16,3.5,'aden-laneshop-outer-wall'],
      [-40,109,.65,8,3.5,'aden-laneshop-inner-wall'],
      // A 5m ACTUAL northern public doorway avoids sealing the long-
      // established ferry-hall south approach at x=-45, z=112..121.
      [-49.5,113.5,3,.7,3.5,'aden-laneshop-back-wall'],
      [-41.5,113.5,3,.7,3.5,'aden-laneshop-back-wall'],
      [-19,105,.65,16,3.5,'aden-laneshop-outer-wall'],
      [-30,109,.65,8,3.5,'aden-laneshop-inner-wall'],
      [-24.5,113.5,11,.7,3.5,'aden-laneshop-back-wall'],
      [-47,109,2.2,1.2,1.2,'aden-laneshop-shelf'],
      [-23,109,2.2,1.2,1.2,'aden-laneshop-shelf'],
      [-46,101,2.5,1.0,.9,'aden-laneshop-counter'],
      [-24,101,2.5,1.0,.9,'aden-laneshop-counter'],
      [-50,96,.65,.65,3.15,'aden-laneshop-post'],
      [-40,96,.65,.65,3.15,'aden-laneshop-post'],
      [-30,96,.65,.65,3.15,'aden-laneshop-post'],
      [-20,96,.65,.65,3.15,'aden-laneshop-post'],
      [-26,118,1.0,1.0,1.15,'aden-laneshop-public-tap']
    ])o.push({x,z,w,d,h,type});
    // Original Crater-inspired public rainwater court: civilian urban
    // architecture, NOT a measured reproduction of Aden's protected historic
    // cisterns, wells, service networks or current operational facilities.
    // Two 8m doors are actual NORTH/SOUTH wall gaps; shallow dry stone basins
    // and seats are individually solid. Built once for BR/BR96 and CH01.
    // The central -80m X-axis remains clear for pedestrian traversal.
    if(terrainRevision===1)for(const [x,z,w,d,h,type] of [
      [-136,50,.65,28,3.7,'aden-raincourt-wall'],
      [-104,50,.65,28,3.7,'aden-raincourt-wall'],
      [-130,64,12,.65,3.7,'aden-raincourt-wall'],
      [-110,64,12,.65,3.7,'aden-raincourt-wall'],
      [-130,36,12,.65,3.7,'aden-raincourt-wall'],
      [-110,36,12,.65,3.7,'aden-raincourt-wall'],
      [-129,50,3.4,4.6,.72,'aden-raincourt-dry-basin'],
      [-111,50,3.4,4.6,.72,'aden-raincourt-dry-basin'],
      [-129,42,4,1,.68,'aden-raincourt-seat'],
      [-111,42,4,1,.68,'aden-raincourt-seat'],
      [-129,59,4,1,.68,'aden-raincourt-seat'],
      [-111,59,4,1,.68,'aden-raincourt-seat'],
      [-133,41,.7,.7,3.2,'aden-raincourt-post'],
      [-107,41,.7,.7,3.2,'aden-raincourt-post'],
      [-133,58,.7,.7,3.2,'aden-raincourt-post'],
      [-107,58,.7,.7,3.2,'aden-raincourt-post']
    ])o.push({x,z,w,d,h,type});
    return o;
  }
  // Fixed, surveyed BR entry sectors. This is a *new-round* deployment choice,
  // never a mid-match position command or a client-authored teleport.
  // All sectors are inside the initial 170m eligibility radius and outside
  // the current solid buildings, crates, service vehicle and yard gate.
  const BR_LIGHTING=Object.freeze({day:'day',dusk:'dusk'});
  const ENTRY_SITES=Object.freeze({
    central:Object.freeze({x:0,z:0,label:'Central approach'}),
    service:Object.freeze({x:46,z:-5,label:'North service road'}),
    east:Object.freeze({x:90,z:-90,label:'East harbor approach'}),
    west:Object.freeze({x:-98,z:-110,label:'West harbor approach'}),
    ferry:Object.freeze({x:-45,z:121,label:'Public ferry waiting hall · south entrance'}),
    promenade:Object.freeze({x:-28,z:65,label:'Public coastal promenade · open central walkway'})
  });
  // Optional public-neighborhood discoveries are earned by approaching their
  // walkable street-level marker with an unobstructed view. Nothing reveals
  // unseen opponents, private facilities, or a distant objective.
  // The real Aden peninsula's PUBLIC district relationships inform this
  // fictional city's placement. World Bank/JICA civic geography:
  // western Tawahi port -> northern Ma'alla coastal strip -> southeast
  // volcanic Crater -> northeast Khormaksar isthmus.
  // These are demo-local, non-georeferenced anchor coordinates, NOT GPS,
  // current checkpoints, base perimeters or real-world attackable sites.
  // Each anchor references ALREADY PHYSICAL, shared 60Hz BR/CH01 geometry.
  // Nothing about their ordering changes saved terrain revisions or pathing.
  const PUBLIC_CITY_DISTRICTS=Object.freeze([
    Object.freeze({id:'tawahi',reference:'서부 타와히 항만',
      label:'서부 항만 참고',x:-154,z:105,physicalType:'aden-fishhall-wall'}),
    Object.freeze({id:'mualla',reference:'마알라 북쪽 해안',
      label:'북쪽 해안 참고',x:-28,z:65,physicalType:'aden-promenade-post'}),
    Object.freeze({id:'crater',reference:'크레이터 화산 분지',
      label:'남동 시가지 참고',x:28,z:136,physicalType:'aden-seafront-market-wall'}),
    Object.freeze({id:'khormaksar',reference:'호르막사르 반도 연결부',
      label:'북동 연결부 참고',x:134,z:108,physicalType:'aden-transit-court-wall'})
  ]);
  const PUBLIC_CITY_ADJACENCY=Object.freeze([
    Object.freeze({from:'tawahi',to:'mualla',kind:'coastal-district-sequence'}),
    Object.freeze({from:'mualla',to:'crater',kind:'peninsula-commercial-transition'}),
    Object.freeze({from:'crater',to:'khormaksar',kind:'peninsula-isthmus-connection'})
  ]);
  // Four nonblocking public ground surfaces make the actual district
  // relationship visibly legible within the existing small demo. They are
  // local fictional civic spaces, not GPS or operational checkpoint layouts.
  // The same authored footprint feeds BR, CH01 and UE5 native blockout.
  // Keep historic revision-0 rounds unchanged by applying these in renderers.
  const PUBLIC_CITY_PAVEMENTS=Object.freeze(PUBLIC_CITY_DISTRICTS.map((place,i)=>
    Object.freeze({id:place.id,x:place.x,z:place.z,
      w:[12,13,10,12][i],d:[10,8,8,8][i],
      color:Object.freeze([
        [.40,.37,.31],[.38,.39,.35],[.50,.39,.30],[.42,.44,.39]
      ][i]),canvas:['#8b816e','#818779','#a99073','#92988a'][i]})));
  // Regional Aden identity beyond this 350m PLAYABLE demo. Sources:
  // NASA Earth Observatory (2016), UNESCO Historic City of Aden (2025):
  // a horseshoe-like volcanic range, dense low/mid-rise port city and the
  // sheltered maritime bay. Shapes are fictional artist-authored silhouettes,
  // explicitly NOT 1:1 terrain, current facility positions, geocoordinates,
  // hidden roads or a substitute for later surveyed/licensed landform art.
  // All pieces lie OUTSIDE the 175m playable limit and never enter the
  // 60Hz physics world, BR96 server geometry, saves or navigation decisions.
  const ADEN_GEOGRAPHIC_VISTA=Object.freeze({
    source:'NASA Earth Observatory 2016; UNESCO Historic City of Aden 2025',
    ocean:Object.freeze({x:-356,z:82,w:356,d:630,y:-.24}),
    ridges:Object.freeze([
      Object.freeze({id:'shamsan-arc',z:258,baseZ:222,
        tone:Object.freeze([.35,.295,.255]),canvas:'#62564e',
        peaks:Object.freeze([
          [-267,19],[-231,39],[-195,58],[-158,47],[-123,74],
          [-90,68],[-57,88],[-23,69],[13,95],[48,78],
          [87,57],[124,41],[164,24]
        ].map(([x,h])=>Object.freeze({x,h})))}),
      Object.freeze({id:'western-bay-headland',z:226,baseZ:207,
        tone:Object.freeze([.29,.27,.25]),canvas:'#55524e',
        peaks:Object.freeze([
          [-427,8],[-395,21],[-362,34],[-330,28],
          [-297,48],[-264,31],[-229,22],[-197,8]
        ].map(([x,h])=>Object.freeze({x,h})))}),
      Object.freeze({id:'isthmus-rise',z:280,baseZ:258,
        tone:Object.freeze([.43,.36,.30]),canvas:'#76665a',
        peaks:Object.freeze([
          [157,9],[189,24],[225,18],[257,33],[294,25],[332,12]
        ].map(([x,h])=>Object.freeze({x,h})))})
    ]),
    // Dense neutral port-town silhouette: exposed light render shells only.
    // Deterministic 4 x 12 city blocks, never colliding or spawning actors.
    buildings:Object.freeze(Array.from({length:48},(_,i)=>{
      const row=Math.floor(i/12),col=i%12;
      return Object.freeze({
        x:-157+col*27+(row%2?6:0),z:187+row*12,
        w:11+(i+row)%3*2,d:8+(i+1)%3*2,
        h:7+(i*7)%12,tone:(i+row)%4
      });
    }))
  });
  function publicDistrictAt(player,obstacles){
    if(!player||!Number.isFinite(player.x)||!Number.isFinite(player.z)||
       !Array.isArray(obstacles))return null;
    for(const place of PUBLIC_CITY_DISTRICTS){
      if(Math.hypot(player.x-place.x,player.z-place.z)<=9 &&
         obstacles.some(o=>o.type===place.physicalType &&
           Math.hypot(o.x-place.x,o.z-place.z)<=22) &&
         !lineBlocked(player.x,player.z,place.x,place.z,obstacles))
        return place;
    }
    return null;
  }
  const LANDMARKS=Object.freeze([
    Object.freeze({x:-45,z:121,label:'PUBLIC FERRY HALL'}),
    Object.freeze({x:43,z:75,label:'CIVIC SHADE COURT'}),
    Object.freeze({x:64,z:118,label:'PUBLIC CIVIC LANE'}),
    Object.freeze({x:140,z:-121,label:'HARBOR SERVICE ROAD'}),
    Object.freeze({x:-28,z:80,label:'PUBLIC COAST PROMENADE'})
  ]);
  function discoverLandmarks(game){
    if(!game||game.scene||game.status!=='playing')return 0;
    const p=game.player;
    if(!p||!p.alive)return 0;
    const before=game.landmarkMask;
    for(let i=0;i<LANDMARKS.length;i++){
      const bit=1<<i,spot=LANDMARKS[i];
      if((before&bit)!==0)continue;
      if(Math.hypot(p.x-spot.x,p.z-spot.z)<=8&&
          !lineBlocked(p.x,p.z,spot.x,spot.z,game.obstacles))
        game.landmarkMask|=bit;
    }
    return game.landmarkMask^before;
  }
  function visitedLandmarks(game){
    const mask=Number.isInteger(game?.landmarkMask)?game.landmarkMask:0;
    return LANDMARKS.filter((_,i)=>(mask&(1<<i))!==0);
  }
  const ZONE_PHASES = [
    { duration: 90, radius: 135 }, { duration: 95, radius: 96 },
    { duration: 90, radius: 62 }, { duration: 85, radius: 33 },
    { duration: 70, radius: 12 }, { duration: 999, radius: 1.5 }
  ];
  function newMatch(seed = Date.now(), botCount = 18, weaponId = 'carbine', previewEncounter = false, entrySite='central', lighting='day', terrainRevision=1) {
    const firearm=Object.prototype.hasOwnProperty.call(FIREARMS,weaponId)?FIREARMS[weaponId]:null;
    if(!firearm)throw new RangeError('Unknown firearm class');
    if(typeof entrySite!=='string'||!Object.prototype.hasOwnProperty.call(ENTRY_SITES,entrySite))
      throw new RangeError('Unknown BR entry sector');
    if(typeof lighting!=='string'||!Object.prototype.hasOwnProperty.call(BR_LIGHTING,lighting))
      throw new RangeError('Unknown BR lighting');
    if(terrainRevision!==0&&terrainRevision!==1)
      throw new RangeError('Invalid BR terrain revision');
    const random = rngFromSeed(seed);
    const obstacles = makeObstacles(terrainRevision);
    // Existing seeded offline matches must not reshuffle ALL opponents and
    // pickups simply because an additional, distant civic block was authored.
    // Draw from the original unmodified candidate sequence, then resolve only
    // rare local overlap with the new block deterministically below.
    const historicalSpawnObstacles=obstacles.filter(o=>!o.type.startsWith('aden-civic-')&&!o.type.startsWith('aden-arcade-')&&!o.type.startsWith('aden-pedestrian-')&&!o.type.startsWith('aden-shade-')&&
      !o.type.startsWith('aden-ferry-hall-')&&!o.type.startsWith('aden-seafront-market-')&&
      !o.type.startsWith('aden-market-court-')&&!o.type.startsWith('aden-transit-court-')&&!o.type.startsWith('aden-fishhall-')&&
      !o.type.startsWith('aden-craft-hall-')&&!o.type.startsWith('aden-craft-court-')&&
      !o.type.startsWith('aden-laneshop-')&&!o.type.startsWith('aden-raincourt-'));
    const deployment=ENTRY_SITES[entrySite];
    if(blocked(deployment.x,deployment.z,ACTOR_RADIUS+.1,obstacles)||
       Math.hypot(deployment.x,deployment.z)>169)
      throw new RangeError('BR entry sector obstructed');
    // The initial roster, the player and ground caches occupy physical space.
    // Reject colliding spawn proposals instead of relying on later actor movement
    // to resolve an impossible overlap. Keep the seeded 60Hz world reproducible.
    const occupiedActors = [{x:deployment.x,z:deployment.z}]; // Actual selected player entry.
    const safeSpot = (minRadius = 30, clearance = 0, occupied = [], maxRadius = Infinity) => {
      for (let tries=0; tries<2000; tries++) {
        const x = (random() * 2 - 1) * 152, z = (random() * 2 - 1) * 152;
        if (blocked(x,z,2.4,historicalSpawnObstacles) ||
            Math.hypot(x-deployment.x,z-deployment.z) <= minRadius ||
            Math.hypot(x-deployment.x,z-deployment.z) > maxRadius ||
            occupied.some(pos => Math.hypot(pos.x-x,pos.z-z) < clearance)) continue;
        return {x,z};
      }
      // Never silently put a rival or pickup at the player's feet when placement
      // constraints cannot be met; fail explicitly rather than corrupt a match.
      throw new RangeError('No collision-free BR spawn available');
    };
    const bots = Array.from({ length: clamp(botCount, 0, MAX_BOTS) }, (_, i) => {
      // The single-rival PC demo begins within a traversable on-foot radius.
      // Placement happens only at creation: no mid-match teleport or enemy radar.
      // The regular seeded 1/4/18-rival worlds and existing tests retain their historical distribution.
      const pos = safeSpot(36, ACTOR_RADIUS*2+0.2, occupiedActors,botCount===1&&previewEncounter===true?65:Infinity);
      occupiedActors.push(pos);
      return { id:i, ...pos, health:100, alive:true, angle:random()*Math.PI*2, moveTime:random()*4, actionTime:2+random()*3, skill:0.28+random()*0.65, loaded:MAGAZINE_SIZE, charges:36, reloadRemaining:0, disqualified:false,
        lastSeenX:pos.x,lastSeenZ:pos.z,lastSeenUntil:0 };
    });
    const occupiedCaches = [];
    const loot = Array.from({ length: 40 }, (_,i) => {
      // Consume the ordinary seeded proposal even when a dock shelf is used:
      // the source RNG and later random events retain a deterministic path.
      const fallback=safeSpot(15,1.2,occupiedActors.concat(occupiedCaches));
      const shelf=DOCK_DEPOTS[i];
      const dockClear=shelf&&!blocked(shelf.x,shelf.z,2.4,obstacles)&&
        occupiedActors.every(a=>dist(a,shelf)>ACTOR_RADIUS*2+2.4)&&
        occupiedCaches.every(c=>dist(c,shelf)>=1.2);
      const pos=dockClear?{x:shelf.x,z:shelf.z}:fallback;
      occupiedCaches.push(pos);
      return {id:i, ...pos, kind:i%2===0?'ammo':'magazine',
        weaponId:Object.keys(FIREARMS)[i%Object.keys(FIREARMS).length],
        remaining:i%2===0?12:24,picked:false};
    });
    // Only colliding newcomers move. No added RNG draws, no invisible actors
    // inside scenery and no wholesale reshuffle of established solo matches.
    if(terrainRevision===1){
      const residents=[...bots,...loot];
      for(const item of residents){
        if(!blocked(item.x,item.z,2.4,obstacles))continue;
        const origin={x:item.x,z:item.z};
        let found=null;
        for(let ring=1;ring<=20&&!found;ring++)for(let n=0;n<24&&!found;n++){
          const angle=n*Math.PI/12,radius=ring*2;
          const x=origin.x+Math.cos(angle)*radius,z=origin.z+Math.sin(angle)*radius;
          if(blocked(x,z,2.4,obstacles)||
             Math.hypot(x-deployment.x,z-deployment.z)<3||
             residents.some(other=>other!==item&&Math.hypot(other.x-x,other.z-z)<2.6))
            continue;
          found={x,z};
        }
        if(!found)throw new RangeError('No safe relocation from civic geometry');
        item.x=found.x;item.z=found.z;
        if(Object.prototype.hasOwnProperty.call(item,'lastSeenX')){
          item.lastSeenX=found.x;item.lastSeenZ=found.z;
        }
      }
    }
    return {
      seed, random, entrySite, lighting, terrainRevision, status:'ready', elapsed:0, kills:0, damageFlash:0,
      // The panel moves along its rail over actual 60 Hz simulation ticks.
      yardGate:{engaged:false,progress:0,closing:false},
      handcart:{x:DOCK_HANDCART.x,z:DOCK_HANDCART.z,engaged:false,dirX:0,dirZ:0},
      vehicle:{x:YARD_SHUTTLE.x,z:YARD_SHUTTLE.z,yaw:YARD_SHUTTLE.yaw,
        speed:0,fuel:YARD_SHUTTLE.fuel,driver:false},
      // One physical route sign is carried or planted, never duplicated.
      trailMarker:null,
      landmarkMask:0,
      brHeadlamp:{on:false,ticks:BR_HEADLAMP_TICKS},
      obstacles, bots, loot, player:{x:deployment.x,z:deployment.z,
        yaw:entrySite==='central'?0:entrySite==='ferry'?Math.PI:Math.atan2(-deployment.x,deployment.z),
        pitch:0,health:100,weaponId:firearm.id,charges:firearm.initialRounds,maxCharges:firearm.maxRounds,loaded:firearm.magazine,reloadRemaining:0,stamina:100,stress:0,reloadAssist:false,reloadHesitation:false,sprintExhausted:false,alive:true},
      zone:{ x:0,z:0, radius:170, phase:0, phaseRemaining:ZONE_PHASES[0].duration },
      effects:[], message:'', messageTime:0, lastTagAt:-2, recentDamage:0
    };
  }
  // A completed open panel is quiet despite keeping the engaged controller
  // latch for the next local closing interaction. This derives exclusively
  // from saved 60Hz gate progress and needs no unbounded noise timer.
  // Derive motor activity from the physical swept rail, not just the E switch.
  // A stalled gate must neither emit a motor clue nor claim to be moving.
  function gateMotionSample(game,dt=1/60) {
    const gate=game?.yardGate;
    if(!gate?.engaged||(!gate.closing&&gate.progress>=1))return null;
    const body=game.obstacles?.find(o=>o.routeId==='br-service-gate');
    if(!body)return null;
    const candidate=gate.progress+(gate.closing?-1:1)*dt/SERVICE_YARD.seconds;
    const next=gate.closing?(candidate<=1e-10?0:candidate):
      (candidate>=1-1e-10?1:candidate);
    const futureX=SERVICE_YARD.x+SERVICE_YARD.slide*next;
    const swept={...body,x:(body.x+futureX)/2,w:body.w+Math.abs(futureX-body.x)};
    const occupied=[game.player,...game.bots].some(actor=>actor.alive&&
      intersectsCircleAABB(actor.x,actor.z,ACTOR_RADIUS,swept));
    return {body,next,futureX,occupied};
  }
  function gateMotorActive(game) {
    const sample=gateMotionSample(game);
    return !!sample&&!sample.occupied;
  }
  function serviceGateStatus(game) {
    const gate=game.yardGate||{engaged:false,progress:0};
    const p=game.player;
    const distance=Math.hypot(p.x-SERVICE_YARD.switchX,p.z-SERVICE_YARD.switchZ);
    const near=distance<=2.1&&!lineBlocked(p.x,p.z,SERVICE_YARD.switchX,
      SERVICE_YARD.switchZ,game.obstacles.filter(o=>o.routeId!=='br-service-gate'));
    const motion=gateMotionSample(game);
    return {near,engaged:gate.engaged,open:gate.progress>=1,closing:gate.closing===true,
      motorActive:!!motion&&!motion.occupied,obstructed:!!motion?.occupied,
      progress:gate.progress,x:SERVICE_YARD.x,z:SERVICE_YARD.z};
  }
  // A local E interaction starts the yard panel once. A motorized slide takes
  // time and stops rather than passing through a living actor on the rail.
  function operateServiceGate(game) {
    if(game.status!=='playing')return {ok:false,reason:'inactive'};
    const state=serviceGateStatus(game);
    if(!state.near)return {ok:false,reason:'out_of_reach'};
    // A local operator can reverse a moving panel without teleporting it.
    // The rail, actor sweep and fixed-step motor remain authoritative.
    // A fully open panel closes; a fully closed panel opens.
    const gate=game.yardGate;
    if(gate.engaged&&gate.progress===0&&!gate.closing)return {ok:false,reason:'already_engaged'};
    const reversing=gate.engaged&&gate.progress>0&&gate.progress<1;
    const closing=reversing?!gate.closing:gate.progress>=1;
    gate.engaged=true;
    gate.closing=closing;
    game.message=reversing
      ?(closing?'SERVICE GATE REVERSED · CLOSING':'SERVICE GATE REVERSED · OPENING')
      :(closing?'SERVICE GATE CLOSING · KEEP TRACK CLEAR':'SERVICE GATE MOTOR STARTED · WAIT FOR PASSAGE');
    game.messageTime=3;
    return {ok:true,progress:gate.progress,reversed:reversing,closing};
  }
  function advanceServiceGate(game,dt) {
    const sample=gateMotionSample(game,dt);
    if(!sample)return;
    if(sample.occupied){
      game.message='SERVICE GATE STOPPED · TRACK OBSTRUCTED';game.messageTime=1.5;
      return;
    }
    game.yardGate.progress=sample.next;
    sample.body.x=sample.futureX;
    if(sample.next===1){game.message='SERVICE GATE OPEN · YARD ROAD ACCESSIBLE';game.messageTime=3;}
    if(sample.next===0&&game.yardGate.closing){game.yardGate.engaged=false;game.yardGate.closing=false;
      game.message='SERVICE GATE CLOSED · LOCAL CONTROL READY';game.messageTime=3;}
  }
  function handcartStatus(game) {
    const body=game?.obstacles?.find(o=>o.routeId==='br-dock-handcart');
    if(!body||!game.handcart||!game.player)return {near:false,engaged:false};
    const p=game.player;
    const distance=Math.hypot(p.x-body.x,p.z-body.z);
    const near=distance<=2.6&&
      !lineBlocked(p.x,p.z,body.x,body.z,game.obstacles.filter(o=>o!==body));
    return {near,engaged:game.handcart.engaged,x:body.x,z:body.z};
  }
  function operateHandcart(game) {
    if(!game||game.status!=='playing'||game.scene)return {ok:false,reason:'inactive'};
    const status=handcartStatus(game),cart=game.handcart;
    if(!status.near)return {ok:false,reason:'out_of_reach'};
    if(cart.engaged){
      cart.engaged=false;cart.dirX=0;cart.dirZ=0;
      game.message='DOCK HANDCART RELEASED · STATIONARY';
      game.messageTime=2;
      return {ok:true,action:'release'};
    }
    const p=game.player;
    const dx=status.x-p.x,dz=status.z-p.z;
    const axisX=Math.abs(dx)>=Math.abs(dz);
    const dirX=axisX?Math.sign(dx):0,dirZ=axisX?0:Math.sign(dz);
    const facing=dirX*Math.sin(p.yaw)-dirZ*Math.cos(p.yaw);
    if(facing<.75||Math.hypot(dx,dz)<1.45)
      return {ok:false,reason:'stand_behind_cart'};
    cart.engaged=true;cart.dirX=dirX;cart.dirZ=dirZ;
    game.message='DOCK HANDCART GRIPPED · WALK FORWARD TO PUSH · E RELEASE';
    game.messageTime=3;
    return {ok:true,action:'grip'};
  }
  function advanceHandcart(game,dt,input) {
    const cart=game.handcart;
    if(!cart?.engaged)return {engaged:false,moved:false};
    if(!input.forward||input.back||input.left||input.right||input.crouch)
      return {engaged:true,moved:false};
    const p=game.player;
    const facing=cart.dirX*Math.sin(p.yaw)-cart.dirZ*Math.cos(p.yaw);
    if(facing<.75)return {engaged:true,moved:false};
    const body=game.obstacles.find(o=>o.routeId==='br-dock-handcart');
    if(!body)return {engaged:true,moved:false};
    const offset=DOCK_HANDCART.speed*dt;
    const future={...body,x:body.x+cart.dirX*offset,z:body.z+cart.dirZ*offset};
    if(Math.abs(future.x)+future.w/2>=WORLD||Math.abs(future.z)+future.d/2>=WORLD)
      return {engaged:true,moved:false,blocked:true};
    const other=game.obstacles.filter(o=>o!==body);
    if(other.some(o=>Math.abs(future.x-o.x)*2<future.w+o.w&&
                     Math.abs(future.z-o.z)*2<future.d+o.d)||
       game.bots.some(b=>b.alive&&intersectsCircleAABB(b.x,b.z,ACTOR_RADIUS,future)))
      return {engaged:true,moved:false,blocked:true};
    // If the pusher would hit a wall or another person this tick, the cart
    // must not glide away while their own feet remain stationary.
    const actorFuture={x:p.x,z:p.z};
    moveEntity(actorFuture,cart.dirX*DOCK_HANDCART.speed,
      cart.dirZ*DOCK_HANDCART.speed,dt,other.concat(actorObstacles(game,p)));
    if(Math.hypot(actorFuture.x-p.x-cart.dirX*offset,
      actorFuture.z-p.z-cart.dirZ*offset)>1e-5)
      return {engaged:true,moved:false,blocked:true};
    body.x=future.x;body.z=future.z;
    cart.x=future.x;cart.z=future.z;
    return {engaged:true,moved:true};
  }
  // Optional dusk lamp: finite battery, fixed-step time, no opponent radar.
  function toggleBrHeadlamp(game){
    if(!game||game.status!=='playing'||game.scene)return {ok:false,reason:'inactive'};
    if(game.lighting!=='dusk')return {ok:false,reason:'daylight'};
    const lamp=game.brHeadlamp;
    if(!lamp||lamp.ticks<=0)return {ok:false,reason:'battery_empty'};
    lamp.on=!lamp.on;
    game.message=lamp.on?'DUSK HEADLAMP ON · FINITE BATTERY':'DUSK HEADLAMP OFF · BATTERY SAVED';
    game.messageTime=2;
    return {ok:true,on:lamp.on,ticks:lamp.ticks};
  }
  // PC J places or recovers one tangible field marker for self-navigation.
  // The marker is not a radar or teleport destination and cannot be recalled
  // remotely: recover it at arm's reach with an unobstructed path.
  function toggleTrailMarker(game) {
    if(!game||game.status!=='playing'||game.scene)return {ok:false,reason:'inactive'};
    const p=game.player,mark=game.trailMarker;
    if(mark){
      if(dist(p,mark)>=PICKUP_REACH||lineBlocked(p.x,p.z,mark.x,mark.z,game.obstacles))
        return {ok:false,reason:'out_of_reach'};
      game.trailMarker=null;
      game.message='ROUTE SIGN RECOVERED · READY TO PLACE';game.messageTime=2;
      return {ok:true,action:'recovered'};
    }
    const spot={x:p.x+Math.sin(p.yaw)*.9,z:p.z-Math.cos(p.yaw)*.9};
    if(Math.abs(spot.x)>WORLD-.5||Math.abs(spot.z)>WORLD-.5||
       blocked(spot.x,spot.z,.22,game.obstacles)||
       game.bots.some(b=>b.alive&&dist(spot,b)<ACTOR_RADIUS+.22))
      return {ok:false,reason:'blocked'};
    game.trailMarker=spot;
    game.message='PHYSICAL ROUTE SIGN SET · ONE SIGN CARRIED';game.messageTime=2;
    return {ok:true,action:'placed',...spot};
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
  // Local geometry-based waypointless navigation, separate from combat.
  // Probes only nearby solid bodies; a candidate must have a collision-free
  // *path*, not just a clear endpoint beyond a wall. Return a bearing only:
  // the actor still turns at its existing physical 60Hz angular rate.
  function localDetourHeading(actor, heading, obstacles, radius=.85, preferredSide=1) {
    const distance=2.25;
    const clear=(candidate)=>{
      const dx=Math.sin(candidate)*distance,dz=-Math.cos(candidate)*distance;
      for(const t of [1/3,2/3,1]){
        if(blocked(actor.x+dx*t,actor.z+dz*t,radius,obstacles))return false;
      }
      return true;
    };
    if(clear(heading))return heading;
    const side=preferredSide<0?-1:1;
    for(const arc of [.42,.82,1.20,Math.PI/2]){
      if(clear(heading+arc*side))return normalizeAngle(heading+arc*side);
      if(clear(heading-arc*side))return normalizeAngle(heading-arc*side);
    }
    // Cul-de-sac: existing limited sidestep/retreat handles local release.
    return heading;
  }
  function moveEntity(entity, vx, vz, dt, obstacles, radius=0.85) {
    // Sweep large displacements in bounded increments so a frame catch-up or
    // fast actor cannot tunnel through thin physical cover. Retain axis-wise
    // sliding at each increment, including deterministic corner behavior.
    if (!Number.isFinite(dt) || dt <= 0) return;
    const dx=vx*dt, dz=vz*dt;
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/Math.max(.1,radius*.5)));
    const sx=dx/steps, sz=dz/steps;
    for(let i=0;i<steps;i++){
      const nx=entity.x+sx, nz=entity.z+sz;
      if (!blocked(nx,entity.z,radius,obstacles)) entity.x=nx;
      if (!blocked(entity.x,nz,radius,obstacles)) entity.z=nz;
    }
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
  // Voluntary withdrawal is a competition result, not physical damage.
  // The captain remains at the last real position with unchanged finite
  // inventory and health, but is no longer eligible for the BR ranking.
  function forfeitMatch(game) {
    if(!game||game.status!=='playing'||!game.player?.alive)
      return {ok:false,reason:'inactive'};
    game.player.alive=false;
    game.status='lost';
    game.message='MATCH WITHDRAWN · ROUND ENDED';
    game.messageTime=3;
    return {ok:true,placement:getFinalPlacement(game)};
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
  // Optional field supplies have a finite carrying trade-off. Initial loadouts
  // remain unchanged; picking up extra stock can reduce mobility by at most
  // 12%, and returning that stock to a cache restores the original movement.
  // This is calculated from saved inventory, with no new checkpoint version.
  function supplyLoadMobility(player) {
    const kit=FIREARMS[player.weaponId]||FIREARMS.carbine;
    const capacity=Math.max(1,kit.maxRounds-kit.initialRounds);
    return 1-0.12*clamp((player.charges-kit.initialRounds)/capacity,0,1);
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
    if(game.vehicle?.driver)return {ok:false,reason:'vehicle_controls_active'};
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
    if(game.brHeadlamp?.on){
      game.brHeadlamp.ticks=Math.max(0,game.brHeadlamp.ticks-Math.round(dt*60));
      if(game.brHeadlamp.ticks===0){
        game.brHeadlamp.on=false;
        game.message='DUSK HEADLAMP BATTERY EXHAUSTED';game.messageTime=2;
      }
    }
    advanceReload(game,dt);
    advanceServiceGate(game,dt);
    const cartMotion=advanceHandcart(game,dt,input);
    game.damageFlash=Math.max(0,game.damageFlash-dt*2.4);
    game.messageTime=Math.max(0,game.messageTime-dt);
    const {player:p,obstacles} = game;
    p.crouched=!!input.crouch;
    let ix=Number(!!input.right)-Number(!!input.left), iz=Number(!!input.forward)-Number(!!input.back);
    const length=Math.hypot(ix,iz)||1; ix/=length; iz/=length;
    const driving=!!game.vehicle?.driver;
    const beforeX=p.x,beforeZ=p.z;
    if(driving)advanceYardShuttle(game,dt,input);
    const wantsSprint=!driving&&!cartMotion.engaged&&canSprint(p,input,iz);
    const loadMobility=supplyLoadMobility(p);
    const speed=driving?0:cartMotion.engaged?(cartMotion.moved?DOCK_HANDCART.speed:0):
      (input.crouch?3.1:wantsSprint?9.5:6.1)*(FIREARMS[p.weaponId]||FIREARMS.carbine).mobility*injuryMobility(p)*loadMobility*wetApronFooting(p).mobility*harborWaveWash(game.elapsed,p).mobility;
    const sin=Math.sin(p.yaw), cos=Math.cos(p.yaw);
    if(!driving)
      moveEntity(p,(cartMotion.engaged?game.handcart.dirX:ix*cos+iz*sin)*speed,
        (cartMotion.engaged?game.handcart.dirZ:ix*sin-iz*cos)*speed,dt,
        obstacles.concat(actorObstacles(game,p)));
    // Colliding with solid cover is not actual sprint travel. Exertion follows
    // resolved displacement, not a held key, while unobstructed movement is unchanged.
    const movedDistance=Math.hypot(p.x-beforeX,p.z-beforeZ);
    // Only the player can discover public landmarks through physically
    // traversed space; never infer discoveries from hidden bots or minimap.
    discoverLandmarks(game);
    const sprinting=wantsSprint&&movedDistance>1e-7;
    // Extra finite inventory increases effort only when actual sprint travel occurs.
    const sprintCost=20+8*(1-loadMobility)/0.12;
    p.stamina=clamp(p.stamina+(sprinting?-sprintCost:13)*dt,0,100);
    updateStress(p,dt,sprinting);
    const previousPhase=game.zone.phase;
    const next=phaseAt(game.elapsed); Object.assign(game.zone,next);
    // A published finite final deadline ends the offline competition even
    // if two eligible rivals survive. Never fabricate an outright winner.
    const finalLimitReached=next.phase===ZONE_PHASES.length-1&&next.phaseRemaining===0;
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
        if(d>=targetDistance||!canSeeActor(b,other,obstacles,d,visibleActors,
          game.lighting==='dusk'?37:55))return;
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
      } else if(!outsideBot&&gateMotorActive(game)&&
        // An operating gate motor is a local audible event, not a global AI alert.
        // A fence or building between the motor and listener attenuates it.
        Math.hypot(b.x-SERVICE_YARD.x,b.z-SERVICE_YARD.z)<=
          (lineBlocked(b.x,b.z,SERVICE_YARD.x,SERVICE_YARD.z,
            obstacles.filter(o=>o.routeId!=='br-service-gate'))?9:22)) {
        const heard=approximateSoundPosition(SERVICE_YARD);
        b.lastSeenX=heard.x;b.lastSeenZ=heard.z;
        b.lastSeenUntil=game.elapsed+1.5;
      } else if(!outsideBot&&!driving&&hearsFootsteps(b,p,movedDistance,sprinting,obstacles,!!input.crouch,wetApronFooting(p).wet)){
        // Investigate only the last audible footstep position. Quiet movement
        // behind cover cannot continuously update this memory.
        const heard=approximateSoundPosition(p); // Sound cannot reveal exact hidden coordinates.
        b.lastSeenX=heard.x;b.lastSeenZ=heard.z;
        b.lastSeenUntil=game.elapsed+2.5;
      }
      const investigating=!target&&!outsideBot&&b.lastSeenUntil>game.elapsed;
      const lastSeenDistance=investigating
        ?Math.hypot(b.lastSeenX-b.x,b.lastSeenZ-b.z):0;
      // Only locally visible physical stock can motivate a supply detour.
      // A rival never reads distant cache coordinates as global navigation data;
      // boundary safety and an observed opponent retain priority.
      let supplyTarget=null,supplyDistance=9;
      // A rival may seek locally visible supplies before its last magazine
      // runs dry. Existing finite cache inventory is shared with the player;
      // no additional rounds, world-spanning loot knowledge or new save data.
      if(!outsideBot&&!target&&!investigating&&b.charges<24){
        for(const cache of game.loot){
          if(cache.weaponId!=='carbine'||cache.remaining<=0)continue;
          const distance=dist(b,cache);
          if(distance>=supplyDistance||
             lineBlocked(b.x,b.z,cache.x,cache.z,obstacles))continue;
          supplyTarget=cache;supplyDistance=distance;
        }
      }
      let aim=b.angle;
      if(outsideBot)aim=Math.atan2(game.zone.x-b.x,-(game.zone.z-b.z));
      else if(target)aim=targetAngle;
      else if(investigating&&lastSeenDistance>1)
        aim=Math.atan2(b.lastSeenX-b.x,-(b.lastSeenZ-b.z));
      else if(supplyTarget&&supplyDistance>PICKUP_REACH*.65)
        aim=Math.atan2(supplyTarget.x-b.x,-(supplyTarget.z-b.z));
      // When a wall is directly ahead, steer toward its actual open side
      // instead of repeatedly returning toward an unreachable point.
      // Neither the route nor its candidate directions are exposed to HUD.
      const movementObstacles=obstacles.concat(actorObstacles(game,b));
      const navigatedAim=localDetourHeading(b,aim,movementObstacles,.85,b.id%2===0?1:-1);
      const desired=normalizeAngle(navigatedAim-b.angle);
      b.angle=normalizeAngle(b.angle+clamp(desired,-1.8*dt,1.8*dt));
      const botSpeed=(outsideBot?5.3:target&&targetDistance>18?3.2:
        investigating&&lastSeenDistance>3?2.0:supplyTarget&&supplyDistance>PICKUP_REACH*.65?2.4:1.0)*injuryMobility(b)*wetApronFooting(b).mobility*harborWaveWash(game.elapsed,b).mobility;
      const startX=b.x,startZ=b.z;
      const vx=Math.sin(b.angle)*botSpeed,vz=-Math.cos(b.angle)*botSpeed;
      moveEntity(b,vx,vz,dt,movementObstacles);
      // If solid cover stops a patrol, sidestep along its edge at the SAME
      // walking speed instead of walking into the wall until the zone kills it.
      // Only local collision is queried; no hidden target position or teleport.
      const initialStep=Math.hypot(b.x-startX,b.z-startZ);
      if(initialStep<botSpeed*dt*0.2){
        // Probe nearby traversable directions using only local solid geometry.
        // This avoids indefinitely pressing into a wall while pursuing a
        // visible actor or returning to the shrinking legal play area.
        // The probe is a collision query, not a teleport or hidden-path radar.
        const side=b.id%2===0?1:-1;
        let travelled=initialStep;
        for(const direction of [side,-side]){
          const remainingDt=Math.max(0,dt-travelled/botSpeed);
          if(remainingDt<=0)break;
          const previousX=b.x,previousZ=b.z;
          moveEntity(b,-vz*direction,vx*direction,remainingDt,movementObstacles);
          const sideStep=Math.hypot(b.x-previousX,b.z-previousZ);
          travelled+=sideStep;
          if(sideStep>=botSpeed*dt*0.2)break;
        }
        // When a perpendicular sidestep also fails, try a bounded diagonal
        // retreat from the obstacle. Its movement budget is the unused part
        // of this same simulation tick, never an extra displacement.
        if(travelled<botSpeed*dt*0.2){
          const remainingDt=Math.max(0,dt-travelled/botSpeed);
          const diagonal=1/Math.SQRT2;
          moveEntity(b,(-vx+side*-vz)*diagonal,
            (-vz+side*vx)*diagonal,remainingDt,movementObstacles);
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
      // Rivals must replenish finite ammunition from the same physical caches
      // the player can use. No global supply, teleport, or knowledge of hidden
      // cache positions: a rival can only collect a compatible nearby cache.
      // Existing charges, cache stock and checkpoint schema remain authoritative.
      if(b.charges<36){
        for(const cache of game.loot){
          if(cache.weaponId!=='carbine'||cache.remaining<=0||
             Math.hypot(cache.x-b.x,cache.z-b.z)>=PICKUP_REACH||
             lineBlocked(b.x,b.z,cache.x,cache.z,
               obstacles.concat(actorObstacles(game,b,null,false))))continue;
          const taken=Math.min(36-b.charges,cache.remaining);
          if(taken<=0)continue;
          b.charges+=taken;
          cache.remaining-=taken;
          cache.picked=cache.remaining===0;
          // Nearby survivors hear the handling and see the changed world stock;
          // distant survivors get no omniscient notification.
          if(Math.hypot(p.x-b.x,p.z-b.z)<18&&
             !lineBlocked(p.x,p.z,b.x,b.z,obstacles)){
            game.message='RIVAL RECOVERED '+taken+' FIELD ROUNDS';
            game.messageTime=2;
          }
          break;
        }
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
              const observed=canSeeActor(listener,b,obstacles,dist(listener,b),visibleActors,
                game.lighting==='dusk'?37:55)?b:heard;
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
               !lineBlocked3D(b.x,1.64,b.z,b.x+rayX*contact,
                 target.crouched?.8:1.2,b.z+rayZ*contact,
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
        if(!hearsFootsteps(listener,source,footstep.distance,false,obstacles,false,wetApronFooting(source).wet))continue;
        const heard=approximateSoundPosition(source);
        listener.lastSeenX=heard.x;listener.lastSeenZ=heard.z;
        listener.lastSeenUntil=game.elapsed+2.5;
      }
    }
    game.effects.forEach(e=>e.t-=dt);game.effects=game.effects.filter(e=>e.t>0);
    if(getAliveCount(game)===1&&p.alive){game.status='won';game.message='YOU ARE THE LAST SIGNAL';}
    else if(finalLimitReached&&p.alive&&getAliveCount(game)>1){
      game.status='draw';
      game.message='FINAL DEADLINE · NO SOLE SURVIVOR';
      game.messageTime=3;
    }
    return game;
  }
  function tag(game, crouching=false) {
    if(game.status!=='playing') return {ok:false,reason:'not_playing'};
    if(game.vehicle?.driver)return {ok:false,reason:'vehicle_controls_active'};
    const p=game.player,firearm=FIREARMS[p.weaponId]||FIREARMS.carbine;
    if(p.charges<=0) return {ok:false,reason:'empty'};
    if(p.reloadRemaining>0) return {ok:false,reason:'reloading'};
    if(p.loaded<=0) return {ok:false,reason:'reload_required'};
    if(game.elapsed-game.lastTagAt<firearm.fireInterval) return {ok:false,reason:'cooldown'};
    game.lastTagAt=game.elapsed;p.charges--;p.loaded--;
    const eyeHeight=crouching?1.09:1.64;
    p.crouched=!!crouching;
    const target=traceShot({x:p.x,y:eyeHeight,z:p.z},p.yaw,p.pitch,
      firearm.range,game.obstacles,game.bots)?.actor||null;
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
        const observed=canSeeActor(b,p,game.obstacles,dist(b,p),sightActors,
          game.lighting==='dusk'?37:55)?p:heard;
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
    // Resolve the last confirmed elimination before another 60Hz tick. A
    // pending checkpoint must not persist a live round with no rivals.
    if(target&&!target.alive&&p.alive&&getAliveCount(game)===1){
      game.status='won';
      game.message='YOU ARE THE LAST SIGNAL';
      game.messageTime=2.2;
    }
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
    return !lineBlocked(game.player.x,game.player.z,item.x,item.z,
      game.obstacles.concat(actorObstacles(game,game.player,null,false)));
  }
  // The same selection governs E/touch and the HUD. A nearby incompatible
  // cache must never block an accessible compatible cache in a crowded pile.
  // One scan, no frame-by-frame allocation or hidden pickups through cover.
  // A defeated BR rival can leave a finite physical reserve-ammunition pouch.
  // Rounds are transferred from checkpointed rival inventory, not generated.
  // Administrative boundary disqualification and CH01 never create pouches.
  function fieldPouch(game,bot) {
    if(game.scene || bot.alive || bot.disqualified || bot.health!==0 ||
       !Number.isInteger(bot.charges) || !Number.isInteger(bot.loaded) ||
       bot.charges<=bot.loaded)return null;
    return {id:'field-'+bot.id,x:bot.x,z:bot.z,kind:'ammo',
      weaponId:'carbine',remaining:Math.min(12,bot.charges-bot.loaded),
      picked:false,fieldPouch:true,sourceBot:bot};
  }
  function nearestReachablePickup(game) {
    let selected=null,nearest=Infinity,selectedCompatible=false;
    // Static caches and field pouches share physical reach and compatibility.
    const consider=item=>{
      if(!canReachPickup(game,item)||(item.kind!=='ammo'&&item.kind!=='magazine'))return;
      const compatible=!item.weaponId||item.weaponId===game.player.weaponId;
      const d=dist(item,game.player);
      if(!selected||(compatible&&!selectedCompatible)||
         (compatible===selectedCompatible&&d<nearest)){
        selected=item;nearest=d;selectedCompatible=compatible;
      }
    };
    for(const item of game.loot)consider(item);
    // No intermediate cache+bot arrays in the HUD's frequent pickup query.
    for(const bot of game.bots){
      const pouch=fieldPouch(game,bot);
      if(pouch)consider(pouch);
    }
    return selected;
  }
  function pickup(game) {
    if(game.status!=='playing'||game.vehicle?.driver) return null;
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
    if(closest.sourceBot){
      // Transfer reserve only; loaded rounds remain in the defeated equipment.
      closest.sourceBot.charges-=taken;
      game.message='FIELD POUCH '+taken+' ROUNDS RECOVERED · '+
        Math.max(0,closest.sourceBot.charges-closest.sourceBot.loaded)+' RESERVE LEFT';
    }else{
      closest.remaining=remaining-taken;
      closest.picked=closest.remaining===0;
      game.message=closest.kind.toUpperCase()+' '+taken+' ROUNDS · '+closest.remaining+' LEFT';
    }
    game.messageTime=2;
    return closest.kind;
  }
  // Return spare rounds to a physically reachable, matching fixed supply cache.
  // Loaded rounds cannot be deposited; the original finite cache capacity is
  // an absolute ceiling, so repeated deposits and withdrawals create nothing.
  function depositReserve(game) {
    if(game.status!=='playing')return {ok:false,reason:'inactive'};
    const p=game.player;
    const spare=p.charges-p.loaded;
    if(spare<=0)return {ok:false,reason:'no_reserve'};
    let chosen=null,best=Infinity;
    for(const item of game.loot){
      if(item.weaponId!==p.weaponId)continue;
      const cap=item.kind==='ammo'?12:24;
      if(item.remaining>=cap||dist(item,p)>=PICKUP_REACH||
         lineBlocked(p.x,p.z,item.x,item.z,
            game.obstacles.concat(actorObstacles(game,p,null,false))))continue;
      const d=dist(item,p);
      if(d<best){chosen=item;best=d;}
    }
    if(!chosen)return {ok:false,reason:'no_cache_space'};
    const capacity=(chosen.kind==='ammo'?12:24)-chosen.remaining;
    const moved=Math.min(spare,capacity);
    p.charges-=moved;chosen.remaining+=moved;chosen.picked=false;
    game.message='CACHE RESTOCKED '+moved+' ROUNDS · '+chosen.remaining+' STORED · MOBILITY '+Math.round(supplyLoadMobility(p)*100)+'%';
    game.messageTime=2;
    return {ok:true,moved,remaining:chosen.remaining};
  }
  // One shared physical reach/occlusion check drives both the E/HUD label
  // and the cache-shift action. A HUD never claims a cache can be moved
  // when the actual world collision considers it blocked.
  function nearestRelocatableCache(game) {
    if(!game||game.status!=='playing'||game.scene)return null;
    const p=game.player,cover=game.obstacles.concat(actorObstacles(game,p,null,false));
    let closest=null,best=Infinity;
    for(const item of game.loot){
      const distance=dist(item,p);
      if(distance>=PICKUP_REACH||distance>best||
         (distance===best&&closest&&item.id>=closest.id)||
         lineBlocked(p.x,p.z,item.x,item.z,cover))continue;
      closest=item;best=distance;
    }
    return closest;
  }
  // Physically move one existing field cache to an adjacent clear position.
  // No stock is created: the same cache ID and finite inventory travel together.
  // This lets a survivor reposition supplies before the next boundary deadline.
  function repositionCache(game) {
    if(game.status!=='playing'||game.scene)return {ok:false,reason:'inactive'};
    const p=game.player;
    const item=nearestRelocatableCache(game);
    if(!item)return {ok:false,reason:'no_reachable_cache'};
    // A short hand-carried shift, not a remote teleport or a through-wall pickup.
    const nx=item.x+Math.sin(p.yaw)*1.1,nz=item.z-Math.cos(p.yaw)*1.1;
    // Check the entire hand-carried path, not just the destination. A moving
    // rival or another cache may occupy the middle of the short transfer.
    // The source point is already reachable, but a blocking body anywhere
    // along the transfer must prevent the object passing through it.
    const steps=12;
    for(let step=1;step<=steps;step++){
      const fraction=step/steps;
      const cx=item.x+(nx-item.x)*fraction,cz=item.z+(nz-item.z)*fraction;
      if(blocked(cx,cz,.85,game.obstacles)||
         (Math.hypot(p.x-nx,p.z-nz)<1.7 ||
         game.bots.some(actor=>actor.alive&&Math.hypot(actor.x-cx,actor.z-cz)<1.7))||
         game.loot.some(other=>other!==item&&Math.hypot(other.x-cx,other.z-cz)<1.2))
        return {ok:false,reason:'path_blocked'};
    }
    item.x=nx;item.z=nz;
    game.message='FIELD CACHE MOVED · '+item.remaining+' ROUNDS REMAIN';
    game.messageTime=2;
    return {ok:true,id:item.id,x:nx,z:nz,remaining:item.remaining};
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
    if(typeof game.entrySite!=='string'||!Object.prototype.hasOwnProperty.call(ENTRY_SITES,game.entrySite))
      throw new RangeError('Invalid BR entry sector');
    if(typeof game.lighting!=='string'||!Object.prototype.hasOwnProperty.call(BR_LIGHTING,game.lighting))
      throw new RangeError('Invalid BR lighting');
    if(game.terrainRevision!==0&&game.terrainRevision!==1)
      throw new RangeError('Invalid BR terrain revision');
    if(!integer(game.landmarkMask,0,(1<<LANDMARKS.length)-1))
      throw new RangeError('Invalid discovered landmark flags');
    if(!game.brHeadlamp||typeof game.brHeadlamp.on!=='boolean'||
       !integer(game.brHeadlamp.ticks,0,BR_HEADLAMP_TICKS)||
       (game.brHeadlamp.on&&(game.lighting!=='dusk'||game.brHeadlamp.ticks===0)))
      throw new RangeError('Invalid BR headlamp state');
    const checkpoint={version:CHECKPOINT_VERSION,seed:game.seed,entrySite:game.entrySite,lighting:game.lighting,
      terrainRevision:game.terrainRevision,rngState:game.random.getState(),
      status:game.status,elapsed:game.elapsed,kills:game.kills,damageFlash:game.damageFlash,
      yardGate:{engaged:game.yardGate.engaged,progress:game.yardGate.progress,closing:game.yardGate.closing===true},
      handcart:game.handcart===null?null:{...game.handcart},
      vehicle:game.vehicle===null?null:{...game.vehicle},
      trailMarker:game.trailMarker===null?null:game.trailMarker&&{x:game.trailMarker.x,z:game.trailMarker.z},
      landmarkMask:game.landmarkMask,
       brHeadlamp:{on:game.brHeadlamp.on,ticks:game.brHeadlamp.ticks},
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
    if(checkpoint.handcart!==null){
      const c=checkpoint.handcart;
      if(!c||!finite(c.x,-WORLD,WORLD)||!finite(c.z,-WORLD,WORLD)||
         typeof c.engaged!=='boolean'||![-1,0,1].includes(c.dirX)||
         ![-1,0,1].includes(c.dirZ)||
         (c.engaged?Math.abs(c.dirX)+Math.abs(c.dirZ)!==1:c.dirX!==0||c.dirZ!==0))
        throw new RangeError('Invalid handcart checkpoint');
    }
    if(typeof checkpoint.yardGate.engaged!=='boolean' ||
       !finite(checkpoint.yardGate.progress,0,1) ||
       (!checkpoint.yardGate.engaged&&checkpoint.yardGate.progress!==0) ||
       (checkpoint.yardGate.closing&&(!checkpoint.yardGate.engaged||checkpoint.yardGate.progress<=0)))
      throw new RangeError('Invalid service-yard gate checkpoint');
    // The sign is a single physical authored prop. Legacy saves may omit it,
    // but new saves must reject impossible coordinates, arbitrary keys or
    // placement inside actual solid cover before overwriting localStorage.
    if(checkpoint.trailMarker!==null){
      const mark=checkpoint.trailMarker;
      if(!mark||typeof mark!=='object'||Array.isArray(mark)||
         Object.keys(mark).sort().join(',')!=='x,z'||
         !finite(mark.x,-WORLD,WORLD)||!finite(mark.z,-WORLD,WORLD)||
         blocked(mark.x,mark.z,.22,game.obstacles))
        throw new RangeError('Invalid BR route sign');
    }
    // Refuse to overwrite a usable save with internally contradictory actor
    // state. The restore path already rejects these, but autosave must too.
    if(checkpoint.vehicle!==null){
      const v=checkpoint.vehicle,body=shuttleBody(game);
      if(!v||typeof v!=='object'||Array.isArray(v)||
         Object.keys(v).sort().join(',')!=='driver,fuel,speed,x,yaw,z'||
         !finite(v.x,-WORLD,WORLD)||!finite(v.z,-WORLD,WORLD)||
         !finite(v.yaw,-100000,100000)||
         !finite(v.speed,-YARD_SHUTTLE.reverseSpeed,YARD_SHUTTLE.forwardSpeed)||
         !finite(v.fuel,0,YARD_SHUTTLE.fuel)||
         typeof v.driver!=='boolean'||(!v.driver&&Math.abs(v.speed)>.000001)||
         (v.fuel===0&&Math.abs(v.speed)>.000001)||
         !body||Math.abs(body.x-v.x)>1e-5||Math.abs(body.z-v.z)>1e-5||
         (v.driver&&(Math.abs(checkpoint.player.x-v.x)>1e-5||
           Math.abs(checkpoint.player.z-v.z)>1e-5))||
         !shuttleClear(game,v.x,v.z,v.yaw,checkpoint.bots,checkpoint.loot))
        throw new RangeError('Invalid BR yard vehicle checkpoint');
    }
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
        blocked(p.x,p.z,ACTOR_RADIUS,game.vehicle?.driver?
          game.obstacles.filter(o=>o.routeId!=='br-yard-shuttle'):game.obstacles) ||
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
    const rawMarker=saved.trailMarker===undefined?null:saved.trailMarker;
    if(rawMarker!==null&&(!rawMarker||typeof rawMarker!=='object'||
       Array.isArray(rawMarker)||Object.keys(rawMarker).sort().join(',')!=='x,z'||
       !finite(rawMarker.x,-WORLD,WORLD)||!finite(rawMarker.z,-WORLD,WORLD)))
      throw new RangeError('Invalid restored BR route sign');
    const weaponId=saved.player && saved.player.weaponId;
    if (!Object.prototype.hasOwnProperty.call(FIREARMS,weaponId)) throw new RangeError('Unknown saved firearm');
    const firearm=FIREARMS[weaponId];
    // Recreate authored cover once; saved positions are untrusted and must not
    // resume inside a wall or beyond the playable boundary.
    // Old saved BR games had a central deployment and remain readable.
    // Re-create the original procedural stream with the selected physical
    // starting point; the stored player/bot positions still win on restore.
    const entrySite=saved.entrySite===undefined?'central':saved.entrySite;
    if(typeof entrySite!=='string'||!Object.prototype.hasOwnProperty.call(ENTRY_SITES,entrySite))
      throw new RangeError('Invalid saved BR entry sector');
    const lighting=saved.lighting===undefined?'day':saved.lighting;
    if(typeof lighting!=='string'||!Object.prototype.hasOwnProperty.call(BR_LIGHTING,lighting))
      throw new RangeError('Invalid saved BR lighting');
    // Pre-volcanic-world checkpoints have no geological revision and MUST
    // retain the exact old collision map; never materialize a boulder inside
    // a saved participant, vehicle or cache after refresh.
    const terrainRevision=saved.terrainRevision===undefined?0:saved.terrainRevision;
    if(terrainRevision!==0&&terrainRevision!==1)
      throw new RangeError('Invalid saved BR terrain revision');
    const game=newMatch(saved.seed,saved.bots.length,weaponId,false,entrySite,lighting,terrainRevision);
    const savedLandmarks=saved.landmarkMask===undefined?0:saved.landmarkMask;
    if(!integer(savedLandmarks,0,(1<<LANDMARKS.length)-1))
      throw new RangeError('Invalid saved landmark flags');
    game.landmarkMask=savedLandmarks;
     const lamp=saved.brHeadlamp===undefined?{on:false,ticks:BR_HEADLAMP_TICKS}:saved.brHeadlamp;
     if(!lamp||typeof lamp!=='object'||Array.isArray(lamp)||
        Object.keys(lamp).sort().join(',')!=='on,ticks'||
        typeof lamp.on!=='boolean'||!integer(lamp.ticks,0,BR_HEADLAMP_TICKS)||
        (lamp.on&&(lighting!=='dusk'||lamp.ticks===0)))
       throw new RangeError('Invalid restored BR headlamp');
    if(rawMarker!==null&&blocked(rawMarker.x,rawMarker.z,.22,game.obstacles))
      throw new RangeError('Route sign inside solid cover');
    game.trailMarker=rawMarker===null?null:{x:rawMarker.x,z:rawMarker.z};
    // Old checkpoints predate the service gate, so the new physical gate is
    // closed until a player operates it. Never accept invented open progress.
    const oldGate=saved.yardGate===undefined?{engaged:false,progress:0}:saved.yardGate;
    if(!oldGate||typeof oldGate.engaged!=='boolean'||
      !finite(oldGate.progress,0,1)||(!oldGate.engaged&&oldGate.progress!==0)||
      (oldGate.closing!==undefined&&typeof oldGate.closing!=='boolean')||
      (oldGate.closing===true&&(!oldGate.engaged||oldGate.progress<=0)))
      throw new RangeError('Invalid restored service-yard gate');
    game.yardGate={engaged:oldGate.engaged,progress:oldGate.progress,
      ...(oldGate.closing===true?{closing:true}:{})};
      // A first-generation save may predate the utility vehicle. Never
    // materialize an occupied truck into an older valid player or bot spawn.
    if(saved.vehicle===undefined||saved.vehicle===null){
      game.vehicle=null;
      game.obstacles=game.obstacles.filter(o=>o.routeId!=='br-yard-shuttle');
    }else{
      const v=saved.vehicle;
      if(!v||typeof v!=='object'||Array.isArray(v)||
        Object.keys(v).sort().join(',')!=='driver,fuel,speed,x,yaw,z'||
        !finite(v.x,-WORLD,WORLD)||!finite(v.z,-WORLD,WORLD)||
        !finite(v.yaw,-100000,100000)||
        !finite(v.speed,-YARD_SHUTTLE.reverseSpeed,YARD_SHUTTLE.forwardSpeed)||
        !finite(v.fuel,0,YARD_SHUTTLE.fuel)||
        typeof v.driver!=='boolean'||(!v.driver&&Math.abs(v.speed)>.000001)||
        (v.fuel===0&&Math.abs(v.speed)>.000001))
        throw new RangeError('Invalid saved yard vehicle');
      game.vehicle={...v};
      const body=shuttleBody(game),bounds=shuttleAabb(v.yaw);
      if(!body)throw new RangeError('Missing vehicle collider');
      body.x=v.x;body.z=v.z;body.w=bounds.w;body.d=bounds.d;
      if(!shuttleClear(game,v.x,v.z,v.yaw,saved.bots,saved.loot))
        throw new RangeError('Saved vehicle intersects architecture');
      if(v.driver&&(Math.abs(saved.player.x-v.x)>1e-5||
        Math.abs(saved.player.z-v.z)>1e-5))
        throw new RangeError('Saved driver is not in vehicle');
    }
  // Pre-handcart checkpoints retain their original authored collision world.
    // Introducing a new movable crate inside an old active match could
    // invalidate legitimate historical spawn/loot placements.
    if(saved.handcart===undefined||saved.handcart===null){
      game.handcart=null;
      game.obstacles=game.obstacles.filter(o=>o.routeId!=='br-dock-handcart');
    }else{
      const c=saved.handcart;
      if(!c||Array.isArray(c)||typeof c!=='object'||
         Object.keys(c).sort().join(',')!=='dirX,dirZ,engaged,x,z'||
         !finite(c.x,-WORLD,WORLD)||!finite(c.z,-WORLD,WORLD)||
         typeof c.engaged!=='boolean'||
         ![-1,0,1].includes(c.dirX)||![-1,0,1].includes(c.dirZ)||
         (c.engaged?Math.abs(c.dirX)+Math.abs(c.dirZ)!==1:c.dirX!==0||c.dirZ!==0))
        throw new RangeError('Invalid saved handcart');
      const cartBody=game.obstacles.find(o=>o.routeId==='br-dock-handcart');
      const candidate={...cartBody,x:c.x,z:c.z};
      if(Math.abs(c.x)+cartBody.w/2>=WORLD||Math.abs(c.z)+cartBody.d/2>=WORLD||
         game.obstacles.some(o=>o!==cartBody&&
           Math.abs(o.x-c.x)*2<o.w+cartBody.w&&Math.abs(o.z-c.z)*2<o.d+cartBody.d))
        throw new RangeError('Handcart embedded in wall');
      cartBody.x=c.x;cartBody.z=c.z;
      game.handcart={x:c.x,z:c.z,engaged:c.engaged,dirX:c.dirX,dirZ:c.dirZ};
    }
    const gateBody=game.obstacles.find(o=>o.routeId==='br-service-gate');
    gateBody.x=SERVICE_YARD.x+SERVICE_YARD.slide*oldGate.progress;
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
    if (blocked(p.x,p.z,0.85,game.vehicle?.driver?
      game.obstacles.filter(o=>o.routeId!=='br-yard-shuttle'):game.obstacles))
      throw new RangeError('Invalid player collision');
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
      lastTagAt:extras.lastTagAt,recentDamage:extras.recentDamage,
       brHeadlamp:{on:lamp.on,ticks:lamp.ticks}});
    game.random.setState(saved.rngState);
    return game;
  }
  // Explicit offline field bookmark recovery is a genuine world-state rollback.
  // The regular checkpoint keeps the latest autosave, while a player-authored
  // P-key bookmark may rewind to an earlier *complete* world and RNG stream.
  // Reject foreign arenas, changed loadouts, future snapshots and terminal games.
  function restoreFieldBookmark(current, serialized) {
    if (!current || current.status !== 'playing' ||
        !Number.isFinite(current.elapsed)) throw new RangeError('No active BR round');
    const restored=restoreMatch(serialized);
    if (restored.seed!==current.seed ||
        restored.player.weaponId!==current.player.weaponId ||
        restored.bots.length!==current.bots.length ||
        restored.elapsed>current.elapsed+1e-6)
      throw new RangeError('Field bookmark belongs to another round or a future step');
    return restored;
  }
  // Two-generation offline save recovery. Only a validated full BR world may
  // replace a broken primary snapshot: this restores the original seed, zone,
  // actors, finite resources and RNG, never an invented fresh or terminal round.
  function recoverMatch(primary, backup) {
    let firstError=null;
    for(const [source,raw] of [['primary',primary],['backup',backup]]){
      if(typeof raw!=='string'||raw.length===0)continue;
      try{return {source,state:restoreMatch(raw)};}
      catch(error){if(!firstError)firstError=error;}
    }
    if(firstError)throw firstError;
    return null;
  }
  // Terminal match reports are local, noncompetitive history, NEVER an active
  // checkpoint. A refresh may show the last outcome and allow the same arena
  // to be replayed, but cannot resurrect finite supplies or undo a result.
  const LAST_RESULT_VERSION=1, LAST_RESULT_LIMIT=1024;
  function createLastResult(game) {
    if(!game||!['won','lost','draw'].includes(game.status)||
       !Array.isArray(game.bots)||!integer(game.seed,0,Number.MAX_SAFE_INTEGER)||
       !finite(game.elapsed,0,3600)||!integer(game.kills,0,game.bots.length)||
       !game.player||!Object.prototype.hasOwnProperty.call(FIREARMS,game.player.weaponId)||
       game.bots.length>MAX_BOTS)
      throw new RangeError('Only completed BR rounds can be archived');
    const placement=getFinalPlacement(game);
    const outcome=game.status;
    if((outcome==='won'&&(!game.player.alive||placement!==1))||
       (outcome==='lost'&&(game.player.alive||!integer(placement,2,game.bots.length+1)))||
       (outcome==='draw'&&(!game.player.alive||placement!==null)))
      throw new RangeError('Invalid BR final result');
    return Object.freeze({version:LAST_RESULT_VERSION,mode:'offline-br',
      seed:game.seed,weaponId:game.player.weaponId,rivals:game.bots.length,
      outcome,elapsed:game.elapsed,kills:game.kills,placement});
  }
  function restoreLastResult(raw) {
    if(typeof raw!=='string'||raw.length>LAST_RESULT_LIMIT)
      throw new RangeError('Invalid BR local result');
    let data;
    try{data=JSON.parse(raw);}catch(_){throw new RangeError('Malformed BR local result');}
    const fields=['version','mode','seed','weaponId','rivals','outcome','elapsed','kills','placement'];
    if(!data||typeof data!=='object'||Array.isArray(data)||
       Object.keys(data).length!==fields.length||
       fields.some(k=>!Object.prototype.hasOwnProperty.call(data,k))||
       data.version!==LAST_RESULT_VERSION||data.mode!=='offline-br'||
       !integer(data.seed,0,Number.MAX_SAFE_INTEGER)||
       !Object.prototype.hasOwnProperty.call(FIREARMS,data.weaponId)||
       !integer(data.rivals,0,MAX_BOTS)||!finite(data.elapsed,0,3600)||
       !integer(data.kills,0,data.rivals)||
       !['won','lost','draw'].includes(data.outcome)||
       (data.outcome==='won'&&data.placement!==1)||
       (data.outcome==='draw'&&data.placement!==null)||
       (data.outcome==='lost'&&!integer(data.placement,2,data.rivals+1)))
      throw new RangeError('Invalid BR local result fields');
    return Object.freeze({...data});
  }
  return {traceShot,lineBlocked3D,harborPassage,localDetourHeading,ENTRY_SITES,ADEN_GEOGRAPHIC_VISTA,PUBLIC_CITY_DISTRICTS,PUBLIC_CITY_ADJACENCY,PUBLIC_CITY_PAVEMENTS,publicDistrictAt,LANDMARKS,visitedLandmarks,discoverLandmarks,BR_LIGHTING,BR_HEADLAMP_TICKS,toggleBrHeadlamp,YARD_SHUTTLE,shuttleStatus,operateYardShuttle,advanceYardShuttle,toggleTrailMarker,gateMotorActive,boundaryStatus,WORLD,ZONE_PHASES,DOCK_DEPOTS,
    DOCK_HANDCART,handcartStatus,operateHandcart,advanceHandcart,INSPECTION_SHELTER,WET_LOADING_PAD,wetApronFooting,harborWaveWash,FIREARMS,MAGAZINE_SIZE,RELOAD_SECONDS,RELOAD_HESITATION_SECONDS,STRESS_THRESHOLD,SPRINT_RECOVERY_STAMINA,canSprint,supplyLoadMobility,SERVICE_YARD,serviceGateStatus,operateServiceGate,advanceServiceGate,hearsFootsteps,hearsImpulse,approximateSoundPosition,newMatch,tick,tag,autoFire,reload,advanceReload,updateStress,injuryMobility,setReloadAssist,pickup,depositReserve,repositionCache,nearestRelocatableCache,canReachPickup,nearestReachablePickup,getAliveCount,getFinalPlacement,forfeitMatch,phaseAt,blocked,lineBlocked,moveEntity,rngFromSeed,receiveDamage,snapshotMatch,restoreMatch,restoreFieldBookmark,recoverMatch,createLastResult,restoreLastResult};
});
