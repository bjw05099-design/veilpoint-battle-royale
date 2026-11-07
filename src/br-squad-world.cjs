'use strict';
// A 96-human shared BR traversal slice. Every participant has an independently
// simulated 60Hz body in the same physical map; combat, public hosting and the
// full Aden-sized streaming world remain separate, unimplemented milestones.
const Sim=require('./simulation.js');
const {SQUADS,SQUAD_SIZE,CAPACITY}=require('./br-squad-lobby.cjs');
const STEP=1/60, RADIUS=.85, SPEED=4.5, LEASE_TICKS=45;
const OFFSETS=Object.freeze([[-4,-3],[0,-3],[4,-3],[-4,3],[0,3],[4,3]]);
class BrSquadWorld {
  constructor(lobby,seed=20261108){
    if(!lobby||lobby.phase!=='roster_locked'||lobby.players.size!==CAPACITY)
      throw new RangeError('full_ready_roster_required');
    const game=Sim.newMatch(seed,0,'carbine');
    this.obstacles=game.obstacles.map(o=>({...o}));
    this.actors=new Map();this.tick=0;
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
          direction:{x:0,z:0},seq:-1,lastMoveTick:0});
      }
    }
  }
  move(token,command){
    const actor=this.actors.get(token);
    if(!actor)throw new RangeError('unknown_session');
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
    return {ok:true,seq:actor.seq};
  }
  step(){
    this.tick++;
    const players=[...this.actors.values()];
    // All 96 proposals read the SAME start-of-tick actor poses. Updating
    // join-order first would grant early squad seats an unfair body advantage.
    const proposals=players.map(actor=>{
      const fresh=this.tick-actor.lastMoveTick<=LEASE_TICKS;
      const direction=fresh?actor.direction:{x:0,z:0};
      const next={x:actor.x,z:actor.z};
      Sim.moveEntity(next,direction.x*SPEED,direction.z*SPEED,STEP,
        this.obstacles,RADIUS);
      const solids=players.filter(other=>other!==actor).map(other=>({
        x:other.x,z:other.z,w:2*RADIUS,d:2*RADIUS
      }));
      Sim.moveEntity(next,0,0,STEP,solids,RADIUS);
      // Moving into another player's start-of-tick body is not allowed.
      if(solids.some(o=>Math.hypot(o.x-next.x,o.z-next.z)<2*RADIUS-1e-8)){
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
    for(const p of this.actors.values()){
      const limited={id:p.id,x:p.x,z:p.z};
      if(p.team===me.team)mates.push({...limited,slot:p.slot+1});
      else if(Math.hypot(p.x-me.x,p.z-me.z)<=18&&
        !Sim.lineBlocked(me.x,me.z,p.x,p.z,this.obstacles))seen.push(limited);
    }
    return {mode:'br-96-traversal-prototype',phase:'moving',tick:this.tick,
      capacity:CAPACITY,squadCount:SQUADS,squadSize:SQUAD_SIZE,
      self:{id:me.id,squad:me.team+1,slot:me.slot+1,
        x:me.x,z:me.z,seq:me.seq},squad:mates,visible:seen};
  }
}
module.exports={BrSquadWorld,STEP,RADIUS,SPEED,LEASE_TICKS};
