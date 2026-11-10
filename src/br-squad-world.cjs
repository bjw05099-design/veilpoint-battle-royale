'use strict';
// A 96-human shared BR traversal slice. Every participant has an independently
// simulated 60Hz body in the same physical map; combat, public hosting and the
// full Aden-sized streaming world remain separate, unimplemented milestones.
const Sim=require('./simulation.js');
const {SQUADS,SQUAD_SIZE,CAPACITY,ENTRY_CHOICES}=require('./br-squad-lobby.cjs');
const {coastalWeatherAtTick}=require('./br-coastal-weather.cjs');
const {BrSpatialIndex}=require('./br-spatial-index.cjs');
const {assessPedestrianFlow}=require('./br96-pedestrian-flow.cjs');
const {brPlayableArea,positionInArea}=require('./br-playable-area.cjs');
const STEP=1/60, RADIUS=.85, SPEED=4.5, LEASE_TICKS=45;
// Server-authored movement budget: sprint is faster but finite, with a
// recovery threshold that prevents instant exhaustion-toggle exploits.
const SPRINT_SPEED=6.4, CROUCH_SPEED=2.7, SPRINT_DRAIN_PER_SECOND=16;
const STAMINA_RECOVERY_PER_SECOND=9, REST_RECOVERY_PER_SECOND=12.5, STAMINA_REARM=25;
// Existing fictional public benches are an optional place to sit and recover
// more comfortably, NOT the only place stamina can return. The participant
// must reach a real server-owned seat and may stand at any time.
const BENCH_RECOVERY_PER_SECOND=17;
const RESTABLE_SEAT=/^aden-[a-z-]+(?:bench|seat)$/;
// Recovery is about exertion, never a special zone. Resting anywhere in the
// physical map recovers faster than walking. Holding movement into a wall
// does not count as rest, and sprinting only drains on actual displacement.
const SIGNAL_TTL_TICKS=15*60, SIGNAL_COOLDOWN_TICKS=5*60;
// Human-only squad text. It never contains authentication tokens or opponent
// messages and is limited to a bounded history and 60Hz authoritative cadence.
const CHAT_LIMIT=6, CHAT_MAX_CHARS=96, CHAT_INTERVAL_TICKS=180;
// A brief, grounded hand acknowledgement. Human-owned, non-scoring and
// server-clock bounded; it never teleports a player or reveals a hidden rival.
const WAVE_TICKS=2*60,WAVE_COOLDOWN_TICKS=5*60;
// 10-second presence window is only a reconnect diagnostic; a stale
// connection never silently eliminates a human squad or awards a rank.
const PRESENCE_STALE_TICKS=10*60;
// An announced gameplay boundary has an explicit server-only, consecutive
// 8-second grace. Crossing outside is not instantly fatal; re-entering resets
// only the consecutive counter, not the historical exposure statistic.
const BOUNDARY_GRACE_TICKS=8*60;
// A 15-minute authoritative prototype round cannot stall indefinitely once
// public-area contraction ends. Multiple surviving squads share first place:
// there is no invented champion, combat outcome or client-side timer.
const ROUND_LIMIT_TICKS=15*60*60;
// Server-owned finite lamp; battery follows simulation ticks, not frames.
const HEADLAMP_TICKS=10*60*60;
// Only low, already-colliding fictional public benches can be stepped over.
const STEP_OVER_TICKS=48,STEP_OVER_RADIUS=RADIUS;
const STEPPABLE_BENCH=/^aden-(pedestrian|ferry-hall|market-court|transit-court)-bench$/;
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
    // The offline BR handcart's *same* world collider is shared by all 96
    // server bodies. Only one nearby participant may push it at a time.
    this.handcart={body:this.obstacles.find(o=>o.routeId==='br-dock-handcart'),operator:null};
    if(!this.handcart.body)throw new Error('missing_shared_dock_handcart');
    this.actors=new Map();this.tick=0;
    // No client may author a squad result. Only real server-owned eligibility
    // transitions change this scorecard; ties cannot be invented by the HUD.
    this.phase='moving';this.activeSquads=SQUADS;
    this.placements=Array(SQUADS).fill(null);
    // Real 60Hz squad exits are independently authored by the server. One
    // event per actual retiring human, bounded to exactly six per squad; no
    // rival identities, coordinates, authentication tokens or vote fiction.
    this.squadTimeline=Array.from({length:SQUADS},()=>[]);
    this.finishReason=null;
    // Map marker is emitted by the authoritative actor's OWN feet.
    // No client-supplied coordinates or opponent identities are accepted.
    this.squadSignals=new Map();
    this.squadChat=Array.from({length:SQUADS},()=>[]);this.chatSerial=0;
    const occupied=[];
    const teams=Array.from({length:SQUADS},(_,n)=>n);
    this.entryPlans=teams.map(team=>lobby.squadEntry(team).choice);
    for(const team of teams) {
      // Each squad starts at a nearby pedestrian entrance selected by its
      // actual six human votes BEFORE the server locks all 96 seats. Never
      // accept client-authored spawn coordinates or mid-round teleporting.
      const selection=ENTRY_CHOICES[this.entryPlans[team]];
      const cx=-111+Math.floor(team%4)*74+selection.dx;
      const cz=-111+Math.floor(team/4)*74+selection.dz;
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
          direction:{x:0,z:0},facing:0,moving:false,seq:-1,stanceSeq:-1,lastMoveTick:0,eligible:true,
          // Monotonic server clock only; no client-reported survival time.
          eliminatedAtTick:null,eliminationReason:null,
          lastSignalTick:-SIGNAL_COOLDOWN_TICKS,lastPresenceTick:0,
          landmarkMask:0,
          // Only actual accepted authoritative 60Hz displacement contributes
          // to this personal post-round travel record. No client-authored GPS.
          traveledMeters:0,sprintedMeters:0,benchRestTicks:0,
          outsideAreaTicks:0,outsideStreakTicks:0,
          stamina:100,sprintHeld:false,crouchHeld:false,sprintDepleted:false,
          headlampOn:false,headlampTicks:HEADLAMP_TICKS,
          resting:false,benchResting:false,spectateSlot:null,stepping:null,
          lastWaveTick:-WAVE_COOLDOWN_TICKS,waveUntilTick:0});
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
    // A rotated token must not inherit the old network session's held
    // movement, sprint or cart steering. Keep exact server-owned position,
    // stamina, squad, sequence and lifetime records intact until a NEW input.
    if(this.handcart.operator===actor)this.handcart.operator=null;
    actor.direction={x:0,z:0};
    actor.lastMoveTick=this.tick-LEASE_TICKS-1;
    actor.sprintHeld=false;actor.crouchHeld=false;
    // A server-accepted physical bench crossing already underway must
    // FINISH its swept 60Hz trajectory. Dropping it halfway could leave
    // the capsule inside a solid bench. Only stale free-movement is halted.
    // Likewise an occupied, stationary bench stays occupied on rebind.
    // The last observed movement flag is a snapshot of the previous tick;
    // the next server tick computes stationary motion from zero input.
    actor.lastPresenceTick=this.tick;
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
       !['sprint','crouch,sprint','seq,sprint','crouch,seq,sprint'].includes(Object.keys(command).sort().join(','))||
       typeof command.sprint!=='boolean'||
       (command.crouch!==undefined&&typeof command.crouch!=='boolean')||
       (command.seq!==undefined&&(!Number.isSafeInteger(command.seq)||
        command.seq<0||command.seq>2147483647)))
      throw new RangeError('invalid_pace');
    // A delayed HTTP request from an earlier input frame must not restore
    // sprint/crouch AFTER a newer neutral input. Legacy clients without a
    // sequence are accepted only until a sequenced PC command is observed.
    if(command.seq===undefined&&actor.stanceSeq>=0)
      return {ok:false,reason:'stance_sequence_required'};
    if(command.seq!==undefined&&command.seq<=actor.stanceSeq)
      return {ok:false,reason:'stale_stance'};
    actor.sprintHeld=command.sprint;
    actor.crouchHeld=command.crouch===true;
    if(command.seq!==undefined)actor.stanceSeq=command.seq;
    actor.lastPresenceTick=this.tick;
    return {ok:true,sprintHeld:actor.sprintHeld,crouched:actor.crouchHeld,
      stanceSeq:actor.stanceSeq,stamina:Math.round(actor.stamina*100)/100};
  }
  // No client-supplied power, timer, or rival discovery.
  headlamp(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)return {ok:false,reason:'out_of_round'};
    if(!actor.headlampOn&&actor.headlampTicks===0)return {ok:false,reason:'battery_empty'};
    actor.headlampOn=!actor.headlampOn;
    actor.lastPresenceTick=this.tick;
    return {ok:true,on:actor.headlampOn,ticks:actor.headlampTicks};
  }
  // One human can briefly acknowledge an actually present teammate or
  // passer-by. No target identity, position, squad vote or reward is accepted.
  wave(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)return {ok:false,reason:'out_of_round'};
    if(this.tick-actor.lastWaveTick<WAVE_COOLDOWN_TICKS)
      return {ok:false,reason:'wave_cooldown',retryTicks:
        WAVE_COOLDOWN_TICKS-(this.tick-actor.lastWaveTick)};
    actor.lastWaveTick=this.tick;
    actor.waveUntilTick=this.tick+WAVE_TICKS;
    actor.lastPresenceTick=this.tick;
    return {ok:true,untilTick:actor.waveUntilTick};
  }
  // An actual player can sit beside an existing PUBLIC seat they have walked
  // up to; no client-selected bench, world coordinate or objective teleport.
  // This is an optional local comfort action, not required for recovery.
  nearbyBench(actor){
    return this.obstacles.find(o=>RESTABLE_SEAT.test(o.type||'')&&
      o.h<=.85&&
      Math.hypot(Math.max(0,Math.abs(actor.x-o.x)-o.w/2),
        Math.max(0,Math.abs(actor.z-o.z)-o.d/2))<=1.25&&
      !Sim.lineBlocked(actor.x,actor.z,o.x,o.z,
        this.obstacles.filter(other=>other!==o)))||null;
  }
  benchRest(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    if(actor.benchResting){
      actor.benchResting=false;
      return {ok:true,seated:false,stamina:actor.stamina};
    }
    if(actor.moving||actor.stepping||
       Math.hypot(actor.direction.x,actor.direction.z)>1e-8)
      return {ok:false,reason:'still_moving'};
    if(!this.nearbyBench(actor))return {ok:false,reason:'bench_too_far'};
    actor.benchResting=true;
    actor.lastPresenceTick=this.tick;
    return {ok:true,seated:true,stamina:actor.stamina};
  }
  // Unified F interaction: classify ONLY authenticated server-owned nearby
  // geometry and the actor's actual location. The client never supplies a
  // target name, position or proximity override. If objects overlap, nearest
  // reachable wins; an existing held/seated action always releases first.
  interactNearby(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)
      return {ok:false,reason:'out_of_round'};
    if(this.handcart.operator===actor)
      return {kind:'handcart',...this.operateHandcart(token)};
    if(actor.benchResting)
      return {kind:'bench',...this.benchRest(token)};
    const options=[];
    for(const control of CIVIC_GATE.controls){
      const distance=Math.hypot(actor.x-control.x,actor.z-control.z);
      if(distance<=CIVIC_GATE.reach &&
         !Sim.lineBlocked(actor.x,actor.z,control.x,control.z,this.obstacles))
        options.push({kind:'gate',distance});
    }
    const cart=this.handcart.body;
    if(cart&&(!this.handcart.operator||this.cartHandoffAvailable(actor))){
      const distance=Math.hypot(actor.x-cart.x,actor.z-cart.z);
      if(distance>=1.45&&distance<=2.6 &&
         !Sim.lineBlocked(actor.x,actor.z,cart.x,cart.z,
           this.obstacles.filter(o=>o!==cart)))
        options.push({kind:'handcart',distance});
    }
    const bench=this.nearbyBench(actor);
    if(bench){
      const distance=Math.hypot(
        Math.max(0,Math.abs(actor.x-bench.x)-bench.w/2),
        Math.max(0,Math.abs(actor.z-bench.z)-bench.d/2));
      options.push({kind:'bench',distance});
    }
    options.sort((a,b)=>a.distance-b.distance||
      ['gate','handcart','bench'].indexOf(a.kind)-
      ['gate','handcart','bench'].indexOf(b.kind));
    if(!options.length){
      // A nearby player can see the real cart but cannot forcefully steal
      // a currently operated handle. Give the actual physical reason rather
      // than misleadingly saying that nothing is within reach.
      const occupied=this.handcart.operator&&cart&&!this.cartHandoffAvailable(actor)&&
        Math.hypot(actor.x-cart.x,actor.z-cart.z)>=1.45&&
        Math.hypot(actor.x-cart.x,actor.z-cart.z)<=2.6&&
        !Sim.lineBlocked(actor.x,actor.z,cart.x,cart.z,
          this.obstacles.filter(o=>o!==cart));
      return occupied?{kind:'handcart',ok:false,reason:'in_use'}:
        {ok:false,reason:'no_reachable_interaction'};
    }
    const chosen=options[0].kind;
    const result=chosen==='gate'?this.operateCivicGate(token):
      chosen==='handcart'?this.operateHandcart(token):this.benchRest(token);
    return {kind:chosen,...result};
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
  // Voluntary quick marks are placed only at the sender's authenticated
  // server position and shared with their six-person squad. The legacy
  // "regroup" signal kind now means "shall we meet here?" only: it imposes
  // NO vote, distance requirement, timer, progress or match reward.
  chat(token,raw){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)return {ok:false,reason:'out_of_round'};
    if(typeof raw!=='string'||raw!==raw.trim()||!raw||
       Array.from(raw).length>CHAT_MAX_CHARS||/[\u0000-\u001f\u007f-\u009f]/.test(raw))
      return {ok:false,reason:'invalid_chat'};
    if(this.tick-(actor.lastChatTick??-CHAT_INTERVAL_TICKS)<CHAT_INTERVAL_TICKS)
      return {ok:false,reason:'chat_cooldown'};
    actor.lastChatTick=this.tick;actor.lastPresenceTick=this.tick;
    const event={id:++this.chatSerial,slot:actor.slot+1,text:raw,tick:this.tick};
    const messages=this.squadChat[actor.team];
    messages.push(event);
    if(messages.length>CHAT_LIMIT)messages.shift();
    return {ok:true,message:event};
  }
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
  // 60Hz low-bench passage, without teleportation or client-supplied
  // destination. Tall buildings, fences and other benches remain solid.
  stepOver(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)return {ok:false,reason:'out_of_round'};
    if(actor.stepping||this.handcart.operator===actor||actor.crouchHeld||
       actor.sprintHeld)return {ok:false,reason:'busy'};
    if(this.tick-actor.lastMoveTick>LEASE_TICKS||
       Math.hypot(actor.direction.x,actor.direction.z)<.75)
      return {ok:false,reason:'approach_required'};
    for(const bench of this.obstacles){
      if(!STEPPABLE_BENCH.test(bench.type)||!(bench.h>0&&bench.h<=1.1))continue;
      const acrossX=bench.d>bench.w;
      const delta=acrossX?actor.x-bench.x:actor.z-bench.z;
      const extent=(acrossX?bench.w:bench.d)/2;
      const lateral=acrossX?actor.z-bench.z:actor.x-bench.x;
      const lateralExtent=(acrossX?bench.d:bench.w)/2;
      const side=Math.sign(delta);
      if(!side||Math.abs(delta)<extent+RADIUS-.04||
         Math.abs(delta)>extent+RADIUS+1.1||
         Math.abs(lateral)>lateralExtent-RADIUS*.6||
         (acrossX?actor.direction.x:actor.direction.z)*-side<.72)continue;
      const destination={x:acrossX?bench.x-side*(extent+RADIUS+.30):actor.x,
        z:acrossX?actor.z:bench.z-side*(extent+RADIUS+.30)};
      // Explicit landing must be physically clear for a capsule and cannot
      // overrun a living person. No target coordinate arrives over HTTP.
      if(Sim.blocked(destination.x,destination.z,RADIUS,this.obstacles)||
         [...this.actors.values()].some(p=>p!==actor&&p.eligible&&
           Math.hypot(p.x-destination.x,p.z-destination.z)<RADIUS*2+.1))
        continue;
      actor.stepping={bench,start:{x:actor.x,z:actor.z},
        destination,progress:0};
      actor.lastPresenceTick=this.tick;
      return {ok:true,kind:'public_bench',durationTicks:STEP_OVER_TICKS};
    }
    return {ok:false,reason:'no_reachable_low_bench'};
  }
  // One real human interacts at arm's reach. No client-positioned cart, speed
  // boost, magic carrying or remote mutation of another team's world state.
  // A stationary teammate can voluntarily take over a public handcart when
  // the original human pusher has stopped issuing movement for a full input
  // lease. No client can transfer another person's grip remotely, no vote or
  // opponent identity is exposed, and the cart never moves on its own.
  cartHandoffAvailable(actor){
    const owner=this.handcart.operator;
    return !!owner&&owner!==actor&&owner.team===actor.team&&
      owner.eligible&&actor.eligible&&
      this.phase==='moving'&&
      this.tick-owner.lastMoveTick>LEASE_TICKS&&
      Math.hypot(owner.direction.x,owner.direction.z)<1e-8&&
      Math.hypot(actor.x-this.handcart.body.x,actor.z-this.handcart.body.z)>=1.45&&
      Math.hypot(actor.x-this.handcart.body.x,actor.z-this.handcart.body.z)<=2.6&&
      !Sim.lineBlocked(actor.x,actor.z,this.handcart.body.x,this.handcart.body.z,
        this.obstacles.filter(o=>o!==this.handcart.body));
  }
  operateHandcart(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(this.phase!=='moving'||!actor.eligible)return {ok:false,reason:'out_of_round'};
    const cart=this.handcart,body=cart.body;
    if(cart.operator===actor){cart.operator=null;return {ok:true,action:'release'};}
    // Validate the physical handle before even reporting occupancy. A remote
    // client must not learn another human's cart-grip state by probing F.
    const dx=body.x-actor.x,dz=body.z-actor.z,dist=Math.hypot(dx,dz);
    if(dist<1.45||dist>2.6||Sim.lineBlocked(actor.x,actor.z,body.x,body.z,
       this.obstacles.filter(o=>o!==body)))return {ok:false,reason:'out_of_reach'};
    const handoff=this.cartHandoffAvailable(actor);
    if(cart.operator&&!handoff)return {ok:false,reason:'in_use'};
    // The actor's actual approach determines the push axis, never a user
    // supplied destination. The handle stays solid throughout the action.
    const alongX=Math.abs(dx)>=Math.abs(dz);
    const dirX=alongX?Math.sign(dx):0,dirZ=alongX?0:Math.sign(dz);
    cart.operator=actor;cart.dirX=dirX;cart.dirZ=dirZ;
    if(handoff){
      // A previous movement vector must NOT accidentally move an unattended
      // cart on the same tick as the F-key handoff. Explicit fresh input is
      // required from the new operator before the shared collider advances.
      actor.direction={x:0,z:0};
      actor.lastMoveTick=this.tick-LEASE_TICKS-1;
      actor.sprintHeld=false;
    }
    actor.lastPresenceTick=this.tick;
    return {ok:true,action:handoff?'handoff':'grip',
      cart:this.handcartSnapshot(token)};
  }
  handcartSnapshot(token){
    const body=this.handcart.body;
    const viewer=this.actors.get(token),owner=this.handcart.operator;
    return {x:body.x,z:body.z,w:body.w,d:body.d,h:body.h,
      heldBySelf:owner===viewer,moving:false,
      // Keep the existing empty-cart snapshot byte/shape-compatible with
      // older clients and the canonical 60Hz map geometry contract. The new
      // private ownership metadata exists ONLY while a real owner is present.
      ...(owner?{
        squadOperatorSlot:viewer&&viewer.team===owner.team?owner.slot+1:null,
        handoffAvailable:viewer?this.cartHandoffAvailable(viewer):false
      }:{})};
  }
  // The handcart and its human pusher move in lockstep at a bounded walking
  // speed on the next fixed tick. Both the swept cart and actor destination
  // must be clear. A blocked corridor leaves both stationary.
  advanceHandcart(){
    const cart=this.handcart,body=cart.body,actor=cart.operator;
    if(!actor)return null;
    if(!actor.eligible||this.phase!=='moving'){
      cart.operator=null;return null;
    }
    // A player who physically walks away cannot keep driving a cart by
    // sending forward input from elsewhere in the city. Release the handle.
    const gapX=body.x-actor.x,gapZ=body.z-actor.z;
    const separation=Math.hypot(gapX,gapZ);
    const ahead=gapX*cart.dirX+gapZ*cart.dirZ;
    if(separation>2.8||separation<1.3||ahead<1.3||
       Sim.lineBlocked(actor.x,actor.z,body.x,body.z,
         this.obstacles.filter(o=>o!==body))){
      cart.operator=null;
      return null;
    }
    const fresh=this.tick-actor.lastMoveTick<=LEASE_TICKS;
    const forward=actor.direction.x*cart.dirX+actor.direction.z*cart.dirZ;
    if(!fresh||forward<.85)return null;
    const distance=Sim.DOCK_HANDCART.speed*STEP;
    const offsetX=cart.dirX*distance,offsetZ=cart.dirZ*distance;
    const dest={...body,x:body.x+offsetX,z:body.z+offsetZ};
    if(Math.abs(dest.x)+dest.w/2>=175||Math.abs(dest.z)+dest.d/2>=175)
      return null;
    const solids=this.obstacles.filter(o=>o!==body);
    const swept={...body,x:(body.x+dest.x)/2,z:(body.z+dest.z)/2,
      w:body.w+Math.abs(offsetX),d:body.d+Math.abs(offsetZ)};
    if(solids.some(o=>Math.abs(dest.x-o.x)*2<dest.w+o.w&&
       Math.abs(dest.z-o.z)*2<dest.d+o.d))return null;
    for(const other of this.actors.values())if(other!==actor&&other.eligible&&
       Sim.blocked(other.x,other.z,RADIUS,[swept]))return null;
    const future={x:actor.x+offsetX,z:actor.z+offsetZ};
    if(Sim.blocked(future.x,future.z,RADIUS,solids)||
       [...this.actors.values()].some(other=>other!==actor&&other.eligible&&
         Math.hypot(other.x-future.x,other.z-future.z)<2*RADIUS))return null;
    body.x=dest.x;body.z=dest.z;
    actor.x=future.x;actor.z=future.z;
    return actor;
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
  recordSquadDeparture(actor){
    const log=this.squadTimeline[actor.team];
    if(log.length>=SQUAD_SIZE||
       log.some(event=>event.slot===actor.slot+1))
      throw new Error('duplicate_server_squad_departure');
    const remaining=[...this.actors.values()].filter(a=>
      a.team===actor.team&&a.eligible).length;
    log.push(Object.freeze({slot:actor.slot+1,tick:this.tick,
      reason:actor.eliminationReason,remainingMembers:remaining}));
  }
  withdraw(token){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
    if(!actor.eligible)return {ok:false,reason:'already_withdrawn'};
    if(this.phase!=='moving')return {ok:false,reason:'round_complete'};
    if(this.handcart.operator===actor)this.handcart.operator=null;
    actor.eligible=false;
    actor.eliminatedAtTick=this.tick;
    actor.eliminationReason='voluntary_withdrawal';
    this.recordSquadDeparture(actor);
    actor.headlampOn=false;actor.stepping=null;
    actor.direction={x:0,z:0};actor.moving=false;
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
    // Advance independent lamps at the very same authoritative 60Hz clock.
    for(const actor of this.actors.values()){
      if(!actor.eligible||!actor.headlampOn)continue;
      actor.headlampTicks=Math.max(0,actor.headlampTicks-1);
      if(actor.headlampTicks===0)actor.headlampOn=false;
    }
    const cartPusher=this.advanceHandcart();
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
      if(actor.benchResting&&(Math.hypot(direction.x,direction.z)>1e-8||
          actor.stepping||!this.nearbyBench(actor)))actor.benchResting=false;
      const next={x:actor.x,z:actor.z};
      const running=actor.sprintHeld&&!actor.crouchHeld&&!actor.sprintDepleted&&actor.stamina>0&&
        Math.hypot(direction.x,direction.z)>1e-8;
      // Reuse the very same fictional loading-apron ground truth as the
      // offline BR, rather than giving the online 96-person map a flat,
      // frictionless movement bonus. All locomotion remains server-owned.
      // The shallow wash follows the authoritative 60Hz tick, not client time.
      const terrain=Sim.wetApronFooting(actor);
      const wash=Sim.harborWaveWash(this.tick*STEP,actor);
      const flow=assessPedestrianFlow(actor,players,(ax,az,bx,bz)=>
        Sim.lineBlocked(ax,az,bx,bz,this.obstacles),direction);
      const pace=(running?SPRINT_SPEED:actor.crouchHeld?CROUCH_SPEED:SPEED)*
        terrain.mobility*wash.mobility*flow.mobility;
      let stepAdvance=false;
      if(actor.stepping){
        const movement=actor.stepping;
        const nextProgress=(movement.progress+1)/STEP_OVER_TICKS;
        const t=Math.min(1,nextProgress);
        const candidate={x:movement.start.x+
            (movement.destination.x-movement.start.x)*t,
          z:movement.start.z+(movement.destination.z-movement.start.z)*t};
        // The traversed bench is below the raised foot, but EVERY other
        // obstacle and human remains solid even during the passage.
        if(!Sim.blocked(candidate.x,candidate.z,RADIUS,
          this.obstacles.filter(o=>o!==movement.bench))){
          next.x=candidate.x;next.z=candidate.z;stepAdvance=true;
        }
      }else if(actor!==cartPusher)
        Sim.moveEntity(next,direction.x*pace,direction.z*pace,STEP,
          this.obstacles,RADIUS);
      // A near-neighbor body query needs no short-lived 96x96 collider
      // allocation on each server tick; moveEntity already swept all walls.
      const peers=nearbyBodies.nearby(next.x,next.z,2*RADIUS)
        .filter(other=>other!==actor&&
          Math.hypot(other.x-next.x,other.z-next.z)<2*RADIUS-1e-8)
        .sort((a,b)=>Math.hypot(a.x-next.x,a.z-next.z)-
          Math.hypot(b.x-next.x,b.z-next.z)||a.id-b.id);
      if(peers.length){
        // The original head-on rejection could leave two real human bodies
        // pressing forward indefinitely in a wide civilian square. Try ONE
        // radius-safe lateral foot placement instead of a teleport, push, or
        // client-authored collision override. Nonwalking bench/cart motions
        // remain subject to their existing authoritative physics.
        const other=peers[0],dx=next.x-actor.x,dz=next.z-actor.z;
        const stride=Math.hypot(dx,dz);
        const separationX=actor.x-other.x,separationZ=actor.z-other.z;
        const separation=Math.hypot(separationX,separationZ);
        const slide={x:actor.x,z:actor.z};
        if(!actor.stepping&&actor!==cartPusher&&stride>1e-8&&
           separation>=2*RADIUS-.05){
          const tangentX=-separationZ/separation,tangentZ=separationX/separation;
          const natural=dx*tangentX+dz*tangentZ;
          const sign=natural<0?-1:1;
          Sim.moveEntity(slide,sign*tangentX*stride/STEP,
            sign*tangentZ*stride/STEP,STEP,this.obstacles,RADIUS);
        }
        const safeSlide=Math.hypot(slide.x-actor.x,slide.z-actor.z)>1e-8&&
          nearbyBodies.nearby(slide.x,slide.z,2*RADIUS).every(peer=>
            peer===actor||Math.hypot(peer.x-slide.x,peer.z-slide.z)>=2*RADIUS-1e-8);
        next.x=safeSlide?slide.x:actor.x;
        next.z=safeSlide?slide.z:actor.z;
      }
      return {actor,next,running:actor.stepping?false:running,
        wantsMove:actor.stepping?true:Math.hypot(direction.x,direction.z)>1e-8,
        stepAdvance};
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
    for(const {actor,next,running,wantsMove,stepAdvance} of proposals){
      // A blocked body did not run. Only actual server-measured travel consumes
      // stamina, even when a wall or another player interrupts a sprint.
      const traveled=Math.hypot(next.x-actor.x,next.z-actor.z);
      actor.traveledMeters+=traveled;
      if(running&&traveled>1e-8)actor.sprintedMeters+=traveled;
      if(actor.benchResting&&!wantsMove&&traveled<1e-8)actor.benchRestTicks++;
      actor.resting=!wantsMove&&traveled<1e-8;
      // Body facing comes only from physically accepted 60Hz displacement.
      // A rejected wall/peer collision never changes remote avatar posture.
      actor.moving=traveled>1e-7;
      if(actor.moving)actor.facing=Math.atan2(next.x-actor.x,-(next.z-actor.z));
      if(running&&traveled>1e-8){
        actor.stamina=Math.max(0,actor.stamina-SPRINT_DRAIN_PER_SECOND*STEP);
        if(actor.stamina<=0)actor.sprintDepleted=true;
      }else{
        actor.stamina=Math.min(100,actor.stamina+
          (actor.benchResting&&actor.resting?BENCH_RECOVERY_PER_SECOND:
           actor.resting?REST_RECOVERY_PER_SECOND:STAMINA_RECOVERY_PER_SECOND)*STEP);
        if(actor.stamina>=STAMINA_REARM)actor.sprintDepleted=false;
      }
      actor.x=next.x;actor.z=next.z;
      if(actor.stepping&&stepAdvance&&traveled>1e-8){
        actor.stepping.progress++;
        if(actor.stepping.progress>=STEP_OVER_TICKS)actor.stepping=null;
      }
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
        actor.eliminatedAtTick=this.tick;
        actor.eliminationReason='area_expiry';
        actor.headlampOn=false;actor.stepping=null;
        actor.direction={x:0,z:0};actor.moving=false;
        if(this.squadSignals.get(actor.team)?.authorId===actor.id)
          this.squadSignals.delete(actor.team);
      }
      // The entire batch retires at one server tick before publishing any
      // same-tick timeline event. No iteration-order advantage or invented
      // intermediate squad placement is reported.
      for(const actor of expired.slice().sort((a,b)=>
        a.team-b.team||a.slot-b.slot))
        this.recordSquadDeparture(actor);
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
    // Finish only AFTER the same 60Hz tick's boundary events have been
    // resolved. Remaining real squads receive the same first-place rank;
    // already-retired squads retain their previously settled positions.
    if(this.phase==='moving'&&this.tick>=ROUND_LIMIT_TICKS){
      const liveTeams=new Set([...this.actors.values()]
        .filter(actor=>actor.eligible).map(actor=>actor.team));
      for(const team of liveTeams)if(this.placements[team]===null)
        this.placements[team]=1;
      this.phase='finished';this.finishReason='time_limit';
    }
  }
  snapshot(token){
    const me=this.actors.get(token);
    if(!me)throw new RangeError('unknown_session');
    const mates=[],seen=[];
    const survivingTicks=actor=>actor.eliminatedAtTick===null?
      this.tick:actor.eliminatedAtTick;
    const weather=coastalWeatherAtTick(this.tick);
    const playableArea=brPlayableArea(this.tick);
    // Self-only footing is computed from the actor's actual server position:
    // it is diagnostic, never a client-provided 96-person movement modifier.
    const terrain=Sim.wetApronFooting(me);
    const wash=Sim.harborWaveWash(this.tick*STEP,me);
    // Only the authenticated body's own nearby visible foot traffic reaches
    // its HUD. Never expose hidden rival counts or client-chosen density.
    const pedestrianFlow=me.eligible?assessPedestrianFlow(me,
      [...this.actors.values()].filter(p=>p.eligible),(ax,az,bx,bz)=>
        Sim.lineBlocked(ax,az,bx,bz,this.obstacles),
      me.moving&&this.tick-me.lastMoveTick<=LEASE_TICKS?me.direction:null):null;
    const surface=Object.freeze({wet:terrain.wet,
      waveActive:terrain.wet&&wash.active,
      mobility:Math.round(terrain.mobility*wash.mobility*10000)/10000});
    const active=Array(SQUADS).fill(0);
    const participants=[...this.actors.values()];
    for(const p of participants){
      if(p.eligible)active[p.team]++;
      if(p.team===me.team)mates.push({id:p.id,x:p.x,z:p.z,slot:p.slot+1,eligible:p.eligible,
        facing:p.facing,moving:p.eligible&&p.moving,crouched:p.crouchHeld,
        // Only physical squad proximity is shared with this authenticated
        // player. Personal exertion and opponent information remain private.
        nearbyTeammate:p!==me&&p.eligible&&me.eligible&&
          Math.hypot(p.x-me.x,p.z-me.z)<=12&&
          !Sim.lineBlocked(me.x,me.z,p.x,p.z,this.obstacles),
        benchResting:p.eligible&&p.benchResting,
        headlampOn:p.eligible&&p.headlampOn,
        waving:p.eligible&&p.waveUntilTick>this.tick,
        stepping:p.eligible&&!!p.stepping,
        stepOverProgress:p.eligible&&p.stepping?p.stepping.progress/STEP_OVER_TICKS:null,
        survivalTicks:survivingTicks(p),
        eliminationReason:p.eligible?null:p.eliminationReason,
        outsideArea:positionInArea(playableArea,p.x,p.z).outside,
        boundaryGraceTicksRemaining:!p.eligible?null:
          positionInArea(playableArea,p.x,p.z).outside
            ?Math.max(0,BOUNDARY_GRACE_TICKS-p.outsideStreakTicks):BOUNDARY_GRACE_TICKS,
        connection:p.eligible&&this.tick-p.lastPresenceTick<PRESENCE_STALE_TICKS?'fresh':'stale'});
    }
    // A withdrawn viewer has no free-flying camera: they can inspect the
    // genuine live viewpoint of one eligible squad mate. Every rival shown
    // must satisfy that participant's same live range and obstacle checks.
    const selected=!me.eligible&&this.phase==='moving'&&me.spectateSlot!==null
      ?participants.find(p=>p.team===me.team&&p.slot===me.spectateSlot-1&&p.eligible)
      :null;
    // If the selected real teammate later withdraws, continue the same
    // squad's live view through the next eligible real teammate in ascending
    // fixed seat order. Never switch across teams or create a free camera.
    // The viewer's chosen slot remains unchanged, so this fallback cannot
    // silently claim a new explicit selection or resurrect any actor.
    const fallback=!me.eligible&&this.phase==='moving'&&me.spectateSlot!==null&&!selected
      ?participants.filter(p=>p.team===me.team&&p.eligible)
        .sort((a,b)=>((a.slot-(me.spectateSlot-1)+SQUAD_SIZE)%SQUAD_SIZE)-
          ((b.slot-(me.spectateSlot-1)+SQUAD_SIZE)%SQUAD_SIZE))[0]||null
      :null;
    const watched=selected||fallback;
    const observer=me.eligible?me:watched;
    if(observer){
      // The broadphase cuts needless long-distance sightline tests while
      // preserving roster insertion order, true distance and wall occlusion.
      const nearby=new BrSpatialIndex(participants.filter(p=>p.eligible));
      for(const p of nearby.nearby(observer.x,observer.z,weather.visibilityMeters)){
        if(p.team===me.team||Math.hypot(p.x-observer.x,p.z-observer.z)>weather.visibilityMeters||
          Sim.lineBlocked(observer.x,observer.z,p.x,p.z,this.obstacles))continue;
        seen.push({id:p.id,x:p.x,z:p.z,facing:p.facing,
          moving:p.moving,crouched:p.crouchHeld,
          benchResting:p.benchResting,
          headlampOn:p.headlampOn,waving:p.waveUntilTick>this.tick,
          stepping:!!p.stepping,
          stepOverProgress:p.stepping?p.stepping.progress/STEP_OVER_TICKS:null});
      }
    }
    const signal=this.squadSignals.get(me.team);
    // A voluntary position pin is a suggestion, never a required destination,
    // vote, scored rendezvous, or attendance check. Its server-issued coordinates
    // remain visible only to the sender's squad until expiry.
    const ownSquad=participants.filter(p=>p.team===me.team);
    const squadLandmarks=Sim.LANDMARKS.flatMap((place,i)=>{
      // An optional six-person public-neighborhood visit records only the
      // actual server-observed footsteps of this squad's six human seats.
      // A ping, lobby vote, remote coordinate, or rival's discovery never
      // becomes an extra visitor. This grants no combat or score advantage.
      const physicallyVisited=ownSquad.reduce((count,p)=>
        count+((p.landmarkMask&(1<<i))!==0?1:0),0);
      return physicallyVisited?[{label:place.label,x:place.x,z:place.z,
        physicallyVisited,wholeSquadVisited:physicallyVisited===SQUAD_SIZE}]:[];
    });
    // Round completion is a server decision, never a client estimate from
    // disappearing dots. A simultaneous elimination of every squad is a
    // shared tie even when all placements are numerically 1.
    const champion=this.phase==='finished'&&this.activeSquads===1
      ?this.placements.findIndex(rank=>rank===1)+1:null;
    // A genuine PERSONAL journey record for this authenticated participant,
    // never invented squad achievements or another player's path telemetry.
    // Published only after a server-authoritative finished round.
    const personalRecap=this.phase==='finished'?Object.freeze({
      schema:'veilpoint-br96-personal-journey-v1',
      participantSlot:me.slot+1,squad:me.team+1,
      roundTicks:this.tick,
      activeSeconds:Math.round(survivingTicks(me)/60*100)/100,
      walkedMeters:Math.round((me.traveledMeters-me.sprintedMeters)*100)/100,
      sprintedMeters:Math.round(me.sprintedMeters*100)/100,
      totalMeters:Math.round(me.traveledMeters*100)/100,
      benchRestSeconds:Math.round(me.benchRestTicks/60*100)/100,
      locationsVisited:Sim.LANDMARKS.filter((_,i)=>(me.landmarkMask&(1<<i))!==0).length,
      ownSquadPlacement:this.placements[me.team],
      ownResult:me.eliminationReason||'active_at_finish'
    }):null;
    const matchOutcome=this.phase==='finished'?Object.freeze({
      kind:champion===null?(this.placements[me.team]===1?'shared_tie':'squad_placed'):
        me.team+1===champion?'squad_win':'squad_placed',
      winningSquad:champion,
      ownSquadPlacement:this.placements[me.team],
      finishedTick:this.tick,
      ...(this.finishReason==='time_limit'?{reason:'time_limit'}:{})
    }):null;
    return {mode:'br-96-traversal-prototype',phase:this.phase,tick:this.tick,
      matchOutcome,personalRecap,
      roundClock:Object.freeze({limitTicks:ROUND_LIMIT_TICKS,
        remainingTicks:Math.max(0,ROUND_LIMIT_TICKS-this.tick)}),
      coastalWeather:weather,
      playableArea,
      squadEntry:this.entryPlans[me.team],
      civicGate:this.gateSnapshot(),
      handcart:this.handcartSnapshot(token),
      squadSignal:signal&&signal.expiresAtTick>this.tick?{...signal}:null,
      squadChat:this.squadChat[me.team].map(message=>({...message})),
      squadTimeline:this.squadTimeline[me.team].map(event=>({...event})),
      squadLandmarks,
      spectatorView:watched?{playerId:watched.id,slot:watched.slot+1,
        x:watched.x,z:watched.z,automaticFallback:!!fallback}:null,
      capacity:CAPACITY,squadCount:SQUADS,squadSize:SQUAD_SIZE,
      remainingSquads:this.activeSquads,
      standings:active.map((count,i)=>({squad:i+1,eligibleMembers:count,
        placement:this.placements[i]})),
      self:{id:me.id,squad:me.team+1,slot:me.slot+1,
        landmarksVisited:Sim.LANDMARKS.filter((_,i)=>(me.landmarkMask&(1<<i))!==0).length,
        x:me.x,z:me.z,seq:me.seq,stanceSeq:me.stanceSeq,eligible:me.eligible,
        facing:me.facing,moving:me.eligible&&me.moving,
        headlampOn:me.eligible&&me.headlampOn,headlampTicks:me.headlampTicks,
        waving:me.eligible&&me.waveUntilTick>this.tick,
        stepOverProgress:me.stepping?me.stepping.progress/STEP_OVER_TICKS:null,
        survivalTicks:survivingTicks(me),
        eliminationReason:me.eligible?null:me.eliminationReason,
        surface,pedestrianFlow,
        stamina:Math.round(me.stamina*100)/100,
        resting:me.eligible&&me.resting,
        benchResting:me.eligible&&me.benchResting,
        sprintHeld:me.sprintHeld,crouched:me.crouchHeld,sprintDepleted:me.sprintDepleted,
        area:positionInArea(playableArea,me.x,me.z),
        outsideAreaTicks:me.outsideAreaTicks,
        boundaryGraceTicksRemaining:me.eligible&&positionInArea(playableArea,me.x,me.z).outside
          ?Math.max(0,BOUNDARY_GRACE_TICKS-me.outsideStreakTicks):me.eligible?BOUNDARY_GRACE_TICKS:null,
        connection:me.eligible&&this.tick-me.lastPresenceTick<PRESENCE_STALE_TICKS?'fresh':'stale',
        placement:this.placements[me.team]},squad:mates,visible:seen};
  }
}
module.exports={BrSquadWorld,STEP,RADIUS,SPEED,SPRINT_SPEED,CROUCH_SPEED,
  SPRINT_DRAIN_PER_SECOND,STAMINA_RECOVERY_PER_SECOND,STAMINA_REARM,LEASE_TICKS,
  SIGNAL_TTL_TICKS,SIGNAL_COOLDOWN_TICKS,PRESENCE_STALE_TICKS,
  BOUNDARY_GRACE_TICKS,REST_RECOVERY_PER_SECOND,HEADLAMP_TICKS,STEP_OVER_TICKS,
  ROUND_LIMIT_TICKS};
