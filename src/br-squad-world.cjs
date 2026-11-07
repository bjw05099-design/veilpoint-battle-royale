'use strict';
// A 96-human shared BR traversal slice. Every participant has an independently
// simulated 60Hz body in the same physical map; combat, public hosting and the
// full Aden-sized streaming world remain separate, unimplemented milestones.
const Sim=require('./simulation.js');
const {SQUADS,SQUAD_SIZE,CAPACITY}=require('./br-squad-lobby.cjs');
const {coastalWeatherAtTick}=require('./br-coastal-weather.cjs');
const STEP=1/60, RADIUS=.85, SPEED=4.5, LEASE_TICKS=45;
const SIGNAL_TTL_TICKS=15*60, SIGNAL_COOLDOWN_TICKS=5*60;
// 10-second presence window is only a reconnect diagnostic; a stale
// connection never silently eliminates a human squad or awards a rank.
const PRESENCE_STALE_TICKS=10*60;
const OFFSETS=Object.freeze([[-4,-3],[0,-3],[4,-3],[-4,3],[0,3],[4,3]]);
class BrSquadWorld {
  constructor(lobby,seed=20261108){
    if(!lobby||lobby.phase!=='roster_locked'||lobby.players.size!==CAPACITY)
      throw new RangeError('full_ready_roster_required');
    const game=Sim.newMatch(seed,0,'carbine');
    this.obstacles=game.obstacles.map(o=>({...o}));
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
          lastSignalTick:-SIGNAL_COOLDOWN_TICKS,lastPresenceTick:0});
      }
    }
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
    for(const [squad,notice] of this.squadSignals){
      if(this.tick>=notice.expiresAtTick)this.squadSignals.delete(squad);
    }
    const players=[...this.actors.values()].filter(p=>p.eligible);
    // All 96 proposals read the SAME start-of-tick actor poses. Updating
    // join-order first would grant early squad seats an unfair body advantage.
    const proposals=players.map(actor=>{
      const fresh=this.tick-actor.lastMoveTick<=LEASE_TICKS;
      const direction=fresh?actor.direction:{x:0,z:0};
      const next={x:actor.x,z:actor.z};
      Sim.moveEntity(next,direction.x*SPEED,direction.z*SPEED,STEP,
        this.obstacles,RADIUS);
      // A near-neighbor body query needs no short-lived 96x96 collider
      // allocation on each server tick; moveEntity already swept all walls.
      if(players.some(other=>other!==actor&&
        Math.abs(other.x-next.x)<2*RADIUS&&Math.abs(other.z-next.z)<2*RADIUS&&
        Math.hypot(other.x-next.x,other.z-next.z)<2*RADIUS-1e-8)){
        next.x=actor.x;next.z=actor.z;
      }
      return {actor,next};
    });
    for(let i=0;i<proposals.length;i++)for(let j=i+1;j<proposals.length;j++){
      const a=proposals[i],b=proposals[j];
      if(Math.hypot(a.next.x-b.next.x,a.next.z-b.next.z)<2*RADIUS-1e-8){
        a.next={x:a.actor.x,z:a.actor.z};
        b.next={x:b.actor.x,z:b.actor.z};
      }
    }
    for(const {actor,next} of proposals){actor.x=next.x;actor.z=next.z;}
  }
  snapshot(token){
    const me=this.actors.get(token);
    if(!me)throw new RangeError('unknown_session');
    const mates=[],seen=[];
    const weather=coastalWeatherAtTick(this.tick);
    const active=Array(SQUADS).fill(0);
    for(const p of this.actors.values())if(p.eligible)active[p.team]++;
    for(const p of this.actors.values()){
      const limited={id:p.id,x:p.x,z:p.z};
      if(p.team===me.team)mates.push({...limited,slot:p.slot+1,eligible:p.eligible,
        connection:p.eligible&&this.tick-p.lastPresenceTick<PRESENCE_STALE_TICKS?'fresh':'stale'});
      else if(me.eligible&&p.eligible&&Math.hypot(p.x-me.x,p.z-me.z)<=weather.visibilityMeters&&
        !Sim.lineBlocked(me.x,me.z,p.x,p.z,this.obstacles))seen.push(limited);
    }
    const signal=this.squadSignals.get(me.team);
    return {mode:'br-96-traversal-prototype',phase:this.phase,tick:this.tick,
      coastalWeather:weather,
      squadSignal:signal&&signal.expiresAtTick>this.tick?{...signal}:null,
      capacity:CAPACITY,squadCount:SQUADS,squadSize:SQUAD_SIZE,
      remainingSquads:this.activeSquads,
      standings:active.map((count,i)=>({squad:i+1,eligibleMembers:count,
        placement:this.placements[i]})),
      self:{id:me.id,squad:me.team+1,slot:me.slot+1,
        x:me.x,z:me.z,seq:me.seq,eligible:me.eligible,
        connection:me.eligible&&this.tick-me.lastPresenceTick<PRESENCE_STALE_TICKS?'fresh':'stale',
        placement:this.placements[me.team]},squad:mates,visible:seen};
  }
}
module.exports={BrSquadWorld,STEP,RADIUS,SPEED,LEASE_TICKS,
  SIGNAL_TTL_TICKS,SIGNAL_COOLDOWN_TICKS,PRESENCE_STALE_TICKS};
