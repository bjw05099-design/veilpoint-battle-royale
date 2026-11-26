'use strict';
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
// VEILPOINT BR / server-owned 96-human squad staging rules.
// This is a real shared lobby model, NOT yet 96-player live world replication.
const SQUADS = 16, SQUAD_SIZE = 6, CAPACITY = SQUADS * SQUAD_SIZE;
// Original fictional staging neighborhoods. Choices are small, distinct
// WALK-IN offsets within each squad's existing private sector, not
// player-supplied GPS coordinates or jumps during a running match.
const ENTRY_CHOICES=Object.freeze({
  block:Object.freeze({dx:0,dz:0,label:'중앙 접근로'}),
  promenade:Object.freeze({dx:8,dz:0,label:'공공 해안 보행로'}),
  lane:Object.freeze({dx:0,dz:8,label:'주민가 골목 입구'})
});
const ENTRY_ORDER=Object.freeze(Object.keys(ENTRY_CHOICES));
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
    // Separate optional ballot table preserves the original stable human
    // player record shape and all legacy roster/debug consumers.
    this.entryVotes=new Map();
    // Authenticated six-person staging chat, separate from live 60Hz radio.
    // Server time owns the cooldown; opponents never receive messages.
    this.lobbyChat=Array.from({length:SQUADS},()=>[]);
    this.lobbyChatLast=new Map();this.lobbyChatSerial=0;
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
  chat(token,raw,nowMs=Math.floor(performance.now())){
    const member=this.players.get(token);
    if(!member)throw new RangeError('unknown_session');
    if(this.phase!=='assembling')return {ok:false,reason:'roster_locked'};
    if(typeof raw!=='string'||raw!==raw.trim()||!raw||
       Array.from(raw).length>96||INVALID_NAME.test(raw))
      return {ok:false,reason:'invalid_chat'};
    if(!Number.isSafeInteger(nowMs)||nowMs<0)
      throw new RangeError('invalid_server_clock');
    const last=this.lobbyChatLast.get(token);
    // Use a monotonic server clock by default. A wall-clock correction must
    // not extend a player's 3s cooldown by minutes or hours.
    if(last!==undefined&&nowMs-last<3000)return {ok:false,reason:'chat_cooldown'};
    this.lobbyChatLast.set(token,nowMs);
    const event={id:++this.lobbyChatSerial,slot:member.slot+1,text:raw,authorId:member.id};
    const history=this.lobbyChat[member.team];history.push(event);
    if(history.length>6)history.shift();
    return {ok:true,message:{id:event.id,slot:event.slot,text:event.text}};
  }
  voteEntry(token,choice){
    const member=this.players.get(token);
    if(!member)throw new RangeError('unknown_session');
    if(this.phase!=='assembling')return {ok:false,reason:'roster_locked'};
    if(member.ready)return {ok:false,reason:'unready_to_vote'};
    if(typeof choice!=='string'||!Object.hasOwn(ENTRY_CHOICES,choice))
      throw new RangeError('invalid_entry_choice');
    this.entryVotes.set(token,choice);
    return {ok:true,choice,decision:this.squadEntry(member.team).choice};
  }
  squadEntry(team){
    if(!Number.isInteger(team)||team<0||team>=SQUADS)
      throw new RangeError('invalid_squad');
    const tally=Object.fromEntries(ENTRY_ORDER.map(x=>[x,0]));
    for(const token of this.seats[team]){
      const member=token===null?null:this.players.get(token);
      if(member&&this.entryVotes.has(token))tally[this.entryVotes.get(token)]++;
    }
    // Six human members vote. Abstention never counts as a fake vote;
    // ties favor the original central walk-in sector, then stable labels.
    const winner=ENTRY_ORDER.reduce((best,key)=>
      tally[key]>tally[best]?key:best,'block');
    return {choice:winner,tally};
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
    this.entryVotes.delete(token);
    this.lobbyChatLast.delete(token);
    // Former squad members cannot leave private text visible to newly
    // assigned occupants of their released seat.
    this.lobbyChat[p.team]=this.lobbyChat[p.team].filter(message=>message.authorId!==p.id);
    // A departed leader cannot continue recruiting players to their old seat.
    for(const [code,inv] of this.invites)if(inv.owner===token)this.invites.delete(code);
    return {ok:true};
  }
  // The new 256-bit secret is server-generated after the original player
  // authenticates. Rotating a credential cannot create seats or change squads.
  rebindSession(oldToken,newToken){
    const player=this.players.get(oldToken);
    if(!player)throw new RangeError('unknown_session');
    if(!['assembling','roster_locked'].includes(this.phase))
      return {ok:false,reason:'invalid_lobby_phase'};
    if(typeof newToken!=='string'||!SECRET.test(newToken)||this.players.has(newToken))
      throw new RangeError('invalid_session');
    if(this.seats[player.team][player.slot]!==oldToken)
      throw new Error('inconsistent_squad_identity');
    this.players.delete(oldToken);
    this.players.set(newToken,player);
    if(this.entryVotes.has(oldToken)){
      this.entryVotes.set(newToken,this.entryVotes.get(oldToken));
      this.entryVotes.delete(oldToken);
    }
    // Preserve a genuine player's pre-round invite capabilities and
    // cooldown across secure transport rotation. Losing them would invalidate
    // invitations already shared with real squad members or let the user
    // bypass the existing three-second conversation cadence.
    if(this.lobbyChatLast.has(oldToken)){
      this.lobbyChatLast.set(newToken,this.lobbyChatLast.get(oldToken));
      this.lobbyChatLast.delete(oldToken);
    }
    for(const invite of this.invites.values())
      if(invite.owner===oldToken)invite.owner=newToken;
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
      lobbyChat:this.phase==='assembling'
        ?this.lobbyChat[me.team].map(({id,slot,text})=>({id,slot,text})):[],
      entry:{...this.squadEntry(me.team),selfChoice:this.entryVotes.get(token)||null,
        options:ENTRY_ORDER.map(id=>({id,label:ENTRY_CHOICES[id].label}))},
      // A player can see their own real squad, not private opposing identities
      // or any player's secret reconnect token.
      squad:this.seats[me.team].map(token=>token===null?null:(()=>{
        const p=this.players.get(token);
        return {id:p.id,name:p.name,slot:p.slot+1,ready:p.ready};
      })())
    };
  }
}
module.exports={BrSquadLobby,SQUADS,SQUAD_SIZE,CAPACITY,ENTRY_CHOICES,ENTRY_ORDER};
