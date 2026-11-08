'use strict';
const crypto=require('node:crypto');
// VEILPOINT BR / server-owned 96-human squad staging rules.
// This is a real shared lobby model, NOT yet 96-player live world replication.
const SQUADS = 16, SQUAD_SIZE = 6, CAPACITY = SQUADS * SQUAD_SIZE;
const SECRET = /^[a-f0-9]{64}$/;
const INVITE = /^[a-f0-9]{32}$/;
const INVALID_NAME = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const nameValid = value => typeof value === 'string' &&
  value.normalize('NFC').trim().length > 0 &&
  [...value.normalize('NFC').trim()].length <= 24 &&
  !INVALID_NAME.test(value) &&
  /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(value);
class BrSquadLobby {
  constructor() {
    this.phase = 'assembling';
    this.seats = Array.from({length:SQUADS}, () => Array(SQUAD_SIZE).fill(null));
    this.players = new Map();
    this.sequence = 0;
    // An invite is a private, unguessable capability issued to an existing
    // squad member. It never contains a member's authentication token.
    this.invites = new Map();
  }
  invite(token) {
    const member=this.players.get(token);
    if(!member)throw new RangeError('unknown_session');
    if(this.phase!=='assembling')return {ok:false,reason:'roster_locked'};
    if(this.seats[member.team].every(Boolean))return {ok:false,reason:'squad_full'};
    for(const [code,inv] of this.invites){
      if(inv.owner===token)return {ok:true,code,squad:member.team+1};
    }
    // A capability can be forwarded by the inviter, not fetched by peers.
    let code;
    do{code=crypto.randomBytes(16).toString('hex');}while(this.invites.has(code));
    this.invites.set(code,{owner:token,team:member.team});
    return {ok:true,code,squad:member.team+1};
  }
  join(token, name, inviteCode=null) {
    if (typeof token !== 'string' || !SECRET.test(token)) throw new RangeError('invalid_session');
    if (!nameValid(name)) throw new RangeError('invalid_display_name');
    if(inviteCode!==null&&(typeof inviteCode!=='string'||!INVITE.test(inviteCode)))
      throw new RangeError('invalid_invite_code');
    const canonical = name.normalize('NFC').trim();
    const existing = this.players.get(token);
    if (existing) {
      if (existing.name !== canonical) throw new RangeError('session_name_mismatch');
      return {ok:true,joined:false,team:existing.team,slot:existing.slot};
    }
    if (this.phase !== 'assembling') return {ok:false,reason:'roster_locked'};
    if (this.players.size >= CAPACITY) return {ok:false,reason:'lobby_full'};
    const invite=inviteCode===null?null:this.invites.get(inviteCode);
    if(inviteCode!==null&&(!invite||!this.players.has(invite.owner)||
      this.players.get(invite.owner).team!==invite.team))
      return {ok:false,reason:'invite_unavailable'};
    // Uninvited players use the first vacant seat. Invited players are
    // allocated ONLY within their real inviter's own six-person squad.
    // The caller never supplies or controls an arbitrary team/seat index.
    const eligibleTeams=invite?[invite.team]:Array.from({length:SQUADS},(_,i)=>i);
    for (const team of eligibleTeams) for(let slot=0;slot<SQUAD_SIZE;slot++) {
      if (this.seats[team][slot] !== null) continue;
      const player = {id:++this.sequence,name:canonical,team,slot,ready:false};
      this.seats[team][slot] = token;
      this.players.set(token,player);
      return {ok:true,joined:true,team,slot};
    }
    if(invite)return {ok:false,reason:'squad_full'};
    throw new Error('inconsistent_squad_roster');
  }
  ready(token, value) {
    const p = this.players.get(token);
    if (!p) throw new RangeError('unknown_session');
    if (typeof value !== 'boolean') throw new RangeError('invalid_ready');
    if (this.phase !== 'assembling') return {ok:false,reason:'roster_locked'};
    p.ready = value;
    // Full launch is a SERVER decision; never trust a client start command.
    if (this.players.size===CAPACITY && [...this.players.values()].every(q=>q.ready)) {
      this.phase='roster_locked';
      this.invites.clear();
    }
    return {ok:true,locked:this.phase==='roster_locked'};
  }
  leave(token) {
    const p = this.players.get(token);
    if (!p) throw new RangeError('unknown_session');
    if (this.phase !== 'assembling') return {ok:false,reason:'roster_locked'};
    this.seats[p.team][p.slot]=null;
    this.players.delete(token);
    // A departed leader cannot continue recruiting players to their old seat.
    for(const [code,inv] of this.invites)if(inv.owner===token)this.invites.delete(code);
    return {ok:true};
  }
  // The new 256-bit secret is server-generated after the original player
  // authenticates. Rotating a credential cannot create seats or change squads.
  rebindSession(oldToken,newToken){
    const player=this.players.get(oldToken);
    if(!player)throw new RangeError('unknown_session');
    if(this.phase!=='roster_locked')return {ok:false,reason:'round_not_started'};
    if(typeof newToken!=='string'||!SECRET.test(newToken)||this.players.has(newToken))
      throw new RangeError('invalid_session');
    if(this.seats[player.team][player.slot]!==oldToken)
      throw new Error('inconsistent_squad_identity');
    this.players.delete(oldToken);
    this.players.set(newToken,player);
    this.seats[player.team][player.slot]=newToken;
    return {ok:true,playerId:player.id,squad:player.team+1,slot:player.slot+1};
  }
  snapshot(token) {
    const me=this.players.get(token);
    if (!me) throw new RangeError('unknown_session');
    const counts=this.seats.map(team=>team.filter(Boolean).length);
    const ready=[...this.players.values()].filter(p=>p.ready).length;
    return {
      phase:this.phase,capacity:CAPACITY,squadCount:SQUADS,squadSize:SQUAD_SIZE,
      participants:this.players.size,readyCount:ready,squadSizes:counts,
      self:{id:me.id,name:me.name,squad:me.team+1,slot:me.slot+1,ready:me.ready},
      // A player can see their own real squad, not private opposing identities
      // or any player's secret reconnect token.
      squad:this.seats[me.team].map(token=>token===null?null:(()=>{
        const p=this.players.get(token);
        return {id:p.id,name:p.name,slot:p.slot+1,ready:p.ready};
      })())
    };
  }
}
module.exports={BrSquadLobby,SQUADS,SQUAD_SIZE,CAPACITY};
