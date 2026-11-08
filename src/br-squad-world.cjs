'use strict';
// A 96-human shared BR traversal slice. Every participant has an independently
// simulated 60Hz body in the same physical map; combat, public hosting and the
// full Aden-sized streaming world remain separate, unimplemented milestones.
const Sim=require('./simulation.js');
const {SQUADS,SQUAD_SIZE,CAPACITY}=require('./br-squad-lobby.cjs');
const {coastalWeatherAtTick}=require('./br-coastal-weather.cjs');
const {BrSpatialIndex}=require('./br-spatial-index.cjs');
const {brPlayableArea,positionInArea}=require('./br-playable-area.cjs');
const STEP=1/60, RADIUS=.85, SPEED=4.5, LEASE_TICKS=45;
// Server-authored movement budget: sprint is faster but finite, with a
// recovery threshold that prevents instant exhaustion-toggle exploits.
const SPRINT_SPEED=6.4, SPRINT_DRAIN_PER_SECOND=16;
const STAMINA_RECOVERY_PER_SECOND=9, STAMINA_REARM=25;
const SIGNAL_TTL_TICKS=15*60, SIGNAL_COOLDOWN_TICKS=5*60;
const REGROUP_RADIUS_METERS=12;
// 10-second presence window is only a reconnect diagnostic; a stale
// connection never silently eliminates a human squad or awards a rank.
const PRESENCE_STALE_TICKS=10*60;
// An announced gameplay boundary has an explicit server-only, consecutive
// 8-second grace. Crossing outside is not instantly fatal; re-entering resets
// only the consecutive counter, not the historical exposure statistic.
const BOUNDARY_GRACE_TICKS=8*60;
const OFFSETS=Object.freeze([[-4,-3],[0,-3],[4,-3],[-4,3],[0,3],[4,3]]);
// Fictional public ferry hall access shutter, built for this online 96-body
// simulation only. No real-world base, tactical machinery or site is copied.
const CIVIC_GATE=Object.freeze({closedX:-45,openX:-53,z:145,w:5.6,d:.6,
  height:2.4,speed:3,controls:[{x:-45,z:139},{x:-45,z:150}],reach:6.5});
class BrSquadWorld {
  constructor(lobby,seed=20261108){
    if(!lobby||lobby.phase!=='roster_locked'||lobby.players.size!==CAPACITY)
      throw new RangeError('full_ready_roster_required');
    const game=Sim.newMatch(seed,0,'carbine');
    this.obstacles=game.obstacles.map(o=>({...o}));
    const door={x:CIVIC_GATE.closedX,z:CIVIC_GATE.z,w:CIVIC_GATE.w,
      d:CIVIC_GATE.d,h:CIVIC_GATE.height,type:'br96-civic-shutter'};
    this.obstacles.push(door);
    this.civicGate={door,targetX:CIVIC_GATE.closedX};
    this.actors=new Map();this.tick=0;
    // No client may author a squad result. Only real server-owned eligibility
    // transitions change this scorecard; ties cannot be invented by the HUD.
    this.phase='moving';this.activeSquads=SQUADS;
    this.placements=Array(SQUADS).fill(null);
    // Map marker is emitted by the authoritative actor's OWN feet.
    // No client-supplied coordinates or opponent identities are accepted.
    this.squadSignals=new Map();
    const occupied=[];
    const teams=Array.from({length:SQUADS},(_,n)=>n);
    for(const team of teams) {
      const cx=-111+Math.floor(team%4)*74,cz=-111+Math.floor(team/4)*74;
      for(let slot=0;slot<SQUAD_SIZE;slot++) {
        const token=lobby.seats[team][slot];
        if(!token)throw new Error('incomplete_squad');
        const player=lobby.players.get(token);
        if(!player||player.team!==team||player.slot!==slot)
          throw new Error('invalid_roster_identity');
        let point=null;
        // Reproducible fallback search around each real deployment district;
        // no spawned person or standing body may intersect a building or peer.
        const [ox,oz]=OFFSETS[slot];
        for(let ring=0;ring<22&&!point;ring++){
          const radius=ring===0?0:ring*2.4;
          for(let theta=0;theta<16&&!point;theta++){
            const angle=theta*Math.PI/8;
            const x=cx+ox+radius*Math.cos(angle),z=cz+oz+radius*Math.sin(angle);
            if(Math.abs(x)>170||Math.abs(z)>170||
               Sim.blocked(x,z,RADIUS,this.obstacles)||
               occupied.some(p=>Math.hypot(p.x-x,p.z-z)<RADIUS*2+.2))continue;
            point={x,z};
          }
        }
        if(!point)throw new Error('no_room_for_96_real_bodies');
        occupied.push(point);
        this.actors.set(token,{id:player.id,team,slot,x:point.x,z:point.z,
          direction:{x:0,z:0},seq:-1,lastMoveTick:0,eligible:true,
          lastSignalTick:-SIGNAL_COOLDOWN_TICKS,lastPresenceTick:0,
          landmarkMask:0,
          outsideAreaTicks:0,outsideStreakTicks:0,
          stamina:100,sprintHeld:false,sprintDepleted:false,spectateSlot:null});
      }
    }
  }
  // Transfer the same actor to a fresh server-secret session without moving,
  // reviving, or resetting its 60Hz input sequence, rank or squad membership.
  rebindSession(oldToken,newToken){
    const actor=this.actors.get(oldToken);
    if(!actor)throw new RangeError('unknown_session');
    if(typeof newToken!=='string'||!/^[a-f0-9]{64}$/.test(newToken)||
       this.actors.has(newToken))throw new RangeError('invalid_session');
    // Retain original 96-seat iteration order: squad snapshots, equal-time
    // broadphase proposals and existing UI roster order cannot jump merely
    // because a player's authenticated transport secret changed.
    this.actors=new Map([...this.actors].map(([key,body])=>
      [key===oldToken?newToken:key,body]));
    return {ok:true,playerId:actor.id,squad:actor.team+1,slot:actor.slot+1};
  }
  move(token,command){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    if(!command||typeof command!=='object'||Array.isArray(command)||
       Object.keys(command).sort().join(',')!=='dx,dz,seq'||
       !Number.isSafeInteger(command.seq)||command.seq<0||command.seq>2147483647||
       !Number.isFinite(command.dx)||!Number.isFinite(command.dz)||
       Math.abs(command.dx)>1||Math.abs(command.dz)>1)
      throw new RangeError('invalid_movement');
    if(command.seq<=actor.seq)return {ok:false,reason:'stale_input'};
    const length=Math.hypot(command.dx,command.dz);
    actor.direction=length>1?{x:command.dx/length,z:command.dz/length}:
      {x:command.dx,z:command.dz};
    actor.seq=command.seq;actor.lastMoveTick=this.tick;
    actor.lastPresenceTick=this.tick;
    return {ok:true,seq:actor.seq};
  }
  // An authenticated input changes only the caller's movement pace. This is
  // not a client-provided velocity, stamina value or world position.
  pace(token,command){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    if(!command||typeof command!=='object'||Array.isArray(command)||
       Object.keys(command).length!==1||typeof command.sprint!=='boolean')
      throw new RangeError('invalid_pace');
    actor.sprintHeld=command.sprint;
    actor.lastPresenceTick=this.tick;
    return {ok:true,sprintHeld:actor.sprintHeld,stamina:Math.round(actor.stamina*100)/100};
  }
  // An explicit authenticated heartbeat refreshes server-side presence.
  // Dropped network connections must not invent a sixth squad elimination:
  // presence is observational, while competitive eligibility is independent.
  heartbeat(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    actor.lastPresenceTick=this.tick;
    return {ok:true,tick:this.tick};
  }
  // Team-only, time-limited in-world field signals are authored at the
  // caller's actual server pose. They never identify an unseen opponent or
  // reveal distant team positions to other squads.
  signal(token,kind){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(kind!=='regroup'&&kind!=='location')throw new RangeError('invalid_signal_kind');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    const remaining=SIGNAL_COOLDOWN_TICKS-(this.tick-actor.lastSignalTick);
    if(remaining>0)return {ok:false,reason:'signal_cooldown',retryTicks:remaining};
    actor.lastSignalTick=this.tick;
    actor.lastPresenceTick=this.tick;
    const notice={squad:actor.team+1,authorId:actor.id,
      kind,x:actor.x,z:actor.z,issuedAtTick:this.tick,
      expiresAtTick:this.tick+SIGNAL_TTL_TICKS};
    this.squadSignals.set(actor.team,notice);
    return {ok:true,signal:{...notice}};
  }
  // A nearby human can physically operate this public passenger hall shutter
  // from either side; clients never supply gate pose, velocity or coordinates.
  operateCivicGate(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    const reachable=CIVIC_GATE.controls.some(control=>
      Math.hypot(actor.x-control.x,actor.z-control.z)<=CIVIC_GATE.reach&&
      !Sim.lineBlocked(actor.x,actor.z,control.x,control.z,this.obstacles));
    if(!reachable)return {ok:false,reason:'too_far'};
    const gate=this.civicGate;
    if(Math.abs(gate.door.x-gate.targetX)>1e-7)
      return {ok:false,reason:'in_motion'};
    gate.targetX=gate.targetX===CIVIC_GATE.closedX
      ?CIVIC_GATE.openX:CIVIC_GATE.closedX;
    actor.lastPresenceTick=this.tick;
    return {ok:true,gate:this.gateSnapshot()};
  }
  gateSnapshot(){
    const gate=this.civicGate,delta=gate.targetX-gate.door.x;
    return {x:gate.door.x,z:gate.door.z,w:gate.door.w,d:gate.door.d,
      state:Math.abs(delta)>1e-7?(delta<0?'opening':'closing'):
        gate.targetX===CIVIC_GATE.openX?'open':'closed'};
  }
  // A withdrawn participant may view one still-eligible member of their OWN
  // six-person squad. Target selection is by fixed roster slot, not a player
  // token or arbitrary world coordinate. This never revives an actor.
  spectate(token,command){
    const me=this.actors.get(token);
    if(!me)throw new RangeError('unknown_session');
    if(!command||typeof command!=='object'||Array.isArray(command)||
       Object.keys(command).length!==1||!Number.isInteger(command.slot)||
       command.slot<1||command.slot>SQUAD_SIZE)
      throw new RangeError('invalid_spectator_slot');
    if(this.phase!=='moving'||me.eligible)
      return {ok:false,reason:'spectating_unavailable'};
    const teammate=[...this.actors.values()].find(p=>
      p.team===me.team&&p.slot===command.slot-1&&p.eligible);
    if(!teammate)return {ok:false,reason:'teammate_unavailable'};
    me.spectateSlot=command.slot;
    return {ok:true,slot:command.slot,playerId:teammate.id};
  }
  // A participant may withdraw only their OWN authenticated body.
  // Later elimination sources must live behind the game server, not a client
  // command naming another actor. There is deliberately no arbitrary
  // "eliminate opponent" HTTP endpoint or hidden remote interaction.
  withdraw(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(!actor.eligible)return {ok:false,reason:'already_withdrawn'};
    if(this.phase!=='moving')return {ok:false,reason:'round_complete'};
    actor.eligible=false;
    actor.direction={x:0,z:0};
    if(this.squadSignals.get(actor.team)?.authorId===actor.id)
      this.squadSignals.delete(actor.team);
    const peers=[...this.actors.values()];
    if(!peers.some(p=>p.team===actor.team&&p.eligible)){
      this.activeSquads--;
      this.squadSignals.delete(actor.team);
      this.placements[actor.team]=this.activeSquads+1;
      if(this.activeSquads===1){
        const champion=peers.find(p=>p.eligible);
        if(!champion)throw new Error('missing_winning_squad');
        this.placements[champion.team]=1;
        this.phase='finished';
      }
    }
    return {ok:true,eligible:false,remainingSquads:this.activeSquads,
      squadPlacement:this.placements[actor.team],phase:this.phase};
  }
  step(){
    if(this.phase!=='moving')return;
    this.tick++;
    const gate=this.civicGate;
    if(Math.abs(gate.targetX-gate.door.x)>1e-7){
      const previous=gate.door.x;
      const difference=gate.targetX-previous;
      const advance=Math.sign(difference)*Math.min(Math.abs(difference),
        CIVIC_GATE.speed*STEP);
      const next=previous+advance;
      // A moving solid must not teleport through a living human body.
      // Check its swept footprint, not only the final 60Hz door position.
      const swept={...gate.door,x:(next+previous)/2,
        w:gate.door.w+Math.abs(advance)};
      const occupied=[...this.actors.values()].some(body=>body.eligible&&
        Sim.blocked(body.x,body.z,RADIUS,[swept]));
      if(!occupied)gate.door.x=next;
    }
    for(const [squad,notice] of this.squadSignals){
      if(this.tick>=notice.expiresAtTick)this.squadSignals.delete(squad);
    }
    const players=[...this.actors.values()].filter(p=>p.eligible);
    const nearbyBodies=new BrSpatialIndex(players);
    // All 96 proposals read the SAME start-of-tick actor poses. Updating
    // join-order first would grant early squad seats an unfair body advantage.
    const proposals=players.map(actor=>{
      const fresh=this.tick-actor.lastMoveTick<=LEASE_TICKS;
      const direction=fresh?actor.direction:{x:0,z:0};
      const next={x:actor.x,z:actor.z};
      const running=actor.sprintHeld&&!actor.sprintDepleted&&actor.stamina>0&&
        Math.hypot(direction.x,direction.z)>1e-8;
      // Reuse the very same fictional loading-apron ground truth as the
      // offline BR, rather than giving the online 96-person map a flat,
      // frictionless movement bonus. All locomotion remains server-owned.
      // The shallow wash follows the authoritative 60Hz tick, not client time.
      const terrain=Sim.wetApronFooting(actor);
      const wash=Sim.harborWaveWash(this.tick*STEP,actor);
      const pace=(running?SPRINT_SPEED:SPEED)*terrain.mobility*wash.mobility;
      Sim.moveEntity(next,direction.x*pace,direction.z*pace,STEP,
        this.obstacles,RADIUS);
      // A near-neighbor body query needs no short-lived 96x96 collider
      // allocation on each server tick; moveEntity already swept all walls.
      if(nearbyBodies.nearby(next.x,next.z,2*RADIUS).some(other=>other!==actor&&
        Math.hypot(other.x-next.x,other.z-next.z)<2*RADIUS-1e-8)){
        next.x=actor.x;next.z=actor.z;
      }
      return {actor,next,running};
    });
    for(let i=0;i<proposals.length;i++)for(let j=i+1;j<proposals.length;j++){
      const a=proposals[i],b=proposals[j];
      if(Math.hypot(a.next.x-b.next.x,a.next.z-b.next.z)<2*RADIUS-1e-8){
        a.next={x:a.actor.x,z:a.actor.z};
        b.next={x:b.actor.x,z:b.actor.z};
      }
    }
    const area=brPlayableArea(this.tick);
    const expired=[];
    for(const {actor,next,running} of proposals){
      // A blocked body did not run. Only actual server-measured travel consumes
      // stamina, even when a wall or another player interrupts a sprint.
      const traveled=Math.hypot(next.x-actor.x,next.z-actor.z);
      if(running&&traveled>1e-8){
        actor.stamina=Math.max(0,actor.stamina-SPRINT_DRAIN_PER_SECOND*STEP);
        if(actor.stamina<=0)actor.sprintDepleted=true;
      }else{
        actor.stamina=Math.min(100,actor.stamina+STAMINA_RECOVERY_PER_SECOND*STEP);
        if(actor.stamina>=STAMINA_REARM)actor.sprintDepleted=false;
      }
      actor.x=next.x;actor.z=next.z;
      // A real squad earns each public neighborhood only by its own
      // member physically approaching the landmark in the 60Hz world.
      // Static public labels can be shared; opponents and unvisited places
      // are never discovered by the client's claimed GPS or a distant ping.
      for(let i=0;i<Sim.LANDMARKS.length;i++){
        const bit=1<<i,place=Sim.LANDMARKS[i];
        if((actor.landmarkMask&bit)!==0)continue;
        if(Math.hypot(actor.x-place.x,actor.z-place.z)<=8&&
           !Sim.lineBlocked(actor.x,actor.z,place.x,place.z,this.obstacles))
          actor.landmarkMask|=bit;
      }
      if(positionInArea(area,next.x,next.z).outside){
        actor.outsideAreaTicks++;
        actor.outsideStreakTicks++;
        if(actor.outsideStreakTicks>=BOUNDARY_GRACE_TICKS)expired.push(actor);
      }else actor.outsideStreakTicks=0;
    }
    // Evaluate all same-tick boundary expirations as ONE authoritative event.
    // Sequential withdraw() calls could otherwise invent a champion midway
    // through a simultaneous elimination, so batch ties must remain ties.
    if(expired.length){
      for(const actor of expired){
        actor.eligible=false;
        actor.direction={x:0,z:0};
        if(this.squadSignals.get(actor.team)?.authorId===actor.id)
          this.squadSignals.delete(actor.team);
      }
      const surviving=Array(SQUADS).fill(0);
      for(const actor of this.actors.values())if(actor.eligible)surviving[actor.team]++;
      const eliminated=[];
      for(let team=0;team<SQUADS;team++){
        if(!surviving[team]&&this.placements[team]===null){
          eliminated.push(team);
          this.squadSignals.delete(team);
        }
      }
      if(eliminated.length){
        const tiedRank=this.activeSquads-eliminated.length+1;
        for(const team of eliminated)this.placements[team]=tiedRank;
        this.activeSquads-=eliminated.length;
        if(this.activeSquads<=1){
          this.phase='finished';
          // There is no fabricated sole champion if all remaining squads
          // retire on the same tick: their placement is an honest shared tie.
          if(this.activeSquads===1){
            const champion=surviving.findIndex((count,team)=>count>0&&
              this.placements[team]===null);
            if(champion<0)throw new Error('missing_winning_squad');
            this.placements[champion]=1;
          }
        }
      }
    }
  }
  snapshot(token){
    const me=this.actors.get(token);
    if(!me)throw new RangeError('unknown_session');
    const mates=[],seen=[];
    const weather=coastalWeatherAtTick(this.tick);
    const playableArea=brPlayableArea(this.tick);
    // Self-only footing is computed from the actor's actual server position:
    // it is diagnostic, never a client-provided 96-person movement modifier.
    const terrain=Sim.wetApronFooting(me);
    const wash=Sim.harborWaveWash(this.tick*STEP,me);
    const surface=Object.freeze({wet:terrain.wet,
      waveActive:terrain.wet&&wash.active,
      mobility:Math.round(terrain.mobility*wash.mobility*10000)/10000});
    const active=Array(SQUADS).fill(0);
    const participants=[...this.actors.values()];
    for(const p of participants){
      if(p.eligible)active[p.team]++;
      if(p.team===me.team)mates.push({id:p.id,x:p.x,z:p.z,slot:p.slot+1,eligible:p.eligible,
        outsideArea:positionInArea(playableArea,p.x,p.z).outside,
        boundaryGraceTicksRemaining:!p.eligible?null:
          positionInArea(playableArea,p.x,p.z).outside
            ?Math.max(0,BOUNDARY_GRACE_TICKS-p.outsideStreakTicks):BOUNDARY_GRACE_TICKS,
        connection:p.eligible&&this.tick-p.lastPresenceTick<PRESENCE_STALE_TICKS?'fresh':'stale'});
    }
    // A withdrawn viewer has no free-flying camera: they can inspect the
    // genuine live viewpoint of one eligible squad mate. Every rival shown
    // must satisfy that participant's same live range and obstacle checks.
    const watched=!me.eligible&&this.phase==='moving'&&me.spectateSlot!==null
      ?participants.find(p=>p.team===me.team&&p.slot===me.spectateSlot-1&&p.eligible)
      :null;
    const observer=me.eligible?me:watched;
    if(observer){
      // The broadphase cuts needless long-distance sightline tests while
      // preserving roster insertion order, true distance and wall occlusion.
      const nearby=new BrSpatialIndex(participants.filter(p=>p.eligible));
      for(const p of nearby.nearby(observer.x,observer.z,weather.visibilityMeters)){
        if(p.team===me.team||Math.hypot(p.x-observer.x,p.z-observer.z)>weather.visibilityMeters||
          Sim.lineBlocked(observer.x,observer.z,p.x,p.z,this.obstacles))continue;
        seen.push({id:p.id,x:p.x,z:p.z});
      }
    }
    const signal=this.squadSignals.get(me.team);
    // An active regroup signal measures actual authenticated teammate bodies
    // at its original server-confirmed position. No remote ready toggle, new
    // mission UI, bonus score, opponent coordinates or arbitrary client pose.
    const activeMates=mates.filter(p=>p.eligible);
    const squadVisited=participants.filter(p=>p.team===me.team)
      .reduce((mask,p)=>mask|p.landmarkMask,0);
    const squadLandmarks=Sim.LANDMARKS.filter((_,i)=>(squadVisited&(1<<i))!==0)
      .map(place=>({label:place.label,x:place.x,z:place.z}));
    const regroup=signal?.kind==='regroup'&&signal.expiresAtTick>this.tick
      ?Object.freeze({eligibleMembers:activeMates.length,
        arrived:activeMates.filter(p=>Math.hypot(p.x-signal.x,p.z-signal.z)<=REGROUP_RADIUS_METERS).length,
        radiusMeters:REGROUP_RADIUS_METERS,
        ready:activeMates.length>=2&&activeMates.every(p=>
          Math.hypot(p.x-signal.x,p.z-signal.z)<=REGROUP_RADIUS_METERS)})
      :null;
    return {mode:'br-96-traversal-prototype',phase:this.phase,tick:this.tick,
      coastalWeather:weather,
      playableArea,
      civicGate:this.gateSnapshot(),
      squadSignal:signal&&signal.expiresAtTick>this.tick?{...signal}:null,
      squadRegroup:regroup,
      squadLandmarks,
      spectatorView:watched?{playerId:watched.id,slot:watched.slot+1,
        x:watched.x,z:watched.z}:null,
      capacity:CAPACITY,squadCount:SQUADS,squadSize:SQUAD_SIZE,
      remainingSquads:this.activeSquads,
      standings:active.map((count,i)=>({squad:i+1,eligibleMembers:count,
        placement:this.placements[i]})),
      self:{id:me.id,squad:me.team+1,slot:me.slot+1,
        landmarksVisited:Sim.LANDMARKS.filter((_,i)=>(me.landmarkMask&(1<<i))!==0).length,
        x:me.x,z:me.z,seq:me.seq,eligible:me.eligible,
        surface,
        stamina:Math.round(me.stamina*100)/100,
        sprintHeld:me.sprintHeld,sprintDepleted:me.sprintDepleted,
        area:positionInArea(playableArea,me.x,me.z),
        outsideAreaTicks:me.outsideAreaTicks,
        boundaryGraceTicksRemaining:me.eligible&&positionInArea(playableArea,me.x,me.z).outside
          ?Math.max(0,BOUNDARY_GRACE_TICKS-me.outsideStreakTicks):me.eligible?BOUNDARY_GRACE_TICKS:null,
        connection:me.eligible&&this.tick-me.lastPresenceTick<PRESENCE_STALE_TICKS?'fresh':'stale',
        placement:this.placements[me.team]},squad:mates,visible:seen};
  }
}
module.exports={BrSquadWorld,STEP,RADIUS,SPEED,SPRINT_SPEED,
  SPRINT_DRAIN_PER_SECOND,STAMINA_RECOVERY_PER_SECOND,STAMINA_REARM,LEASE_TICKS,
  SIGNAL_TTL_TICKS,SIGNAL_COOLDOWN_TICKS,REGROUP_RADIUS_METERS,PRESENCE_STALE_TICKS,
  BOUNDARY_GRACE_TICKS};
