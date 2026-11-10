/* VEILPOINT BR96: real six-person squad panel, never inferred enemy state.
 * Rendered from the server-owned lobby identities and the SAME authenticated
 * team's world snapshot. No lobby votes, new controls or player coordinates.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointBR96SquadPanel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const COUNT=6;
 function roster(state){
  if(!state||!Array.isArray(state.squad))return '분대 대기 중';
  const own=state.squad,world=state.world?.mode==='br-96-traversal-prototype'?state.world:null;
  // Never accept client-created membership or extrapolate an unseen person.
  const visible=Array.isArray(world?.squad)?world.squad:[];
  const lines=Array.from({length:COUNT},(_,index)=>{
   const seat=index+1,member=own[index];
   if(!member||!Number.isInteger(member.id))return seat+'. 빈 좌석';
   const name=typeof member.name==='string'?member.name:'분대원';
   if(!world)return seat+'. '+name+' · '+(member.ready?'준비':'대기');
   const reported=visible.find(p=>p&&p.slot===seat&&p.id===member.id);
   if(!reported)return seat+'. '+name+' · 상태 확인 중';
   if(reported.eligible===false){
    const cause=reported.eliminationReason==='area_expiry'?'구역 밖 체류 만료':
      reported.eliminationReason==='voluntary_withdrawal'?'본인 경기 포기':'종료 원인 확인 중';
    return seat+'. '+name+' · 경기 종료 ('+cause+')';
   }
   if(reported.eligible!==true)return seat+'. '+name+' · 상태 확인 중';
   // 'stale' means no recent authenticated input, NOT proven disconnect.
   // The server verifies a nearby, unoccluded HUMAN teammate on this
   // viewer's real 60Hz body. No private stamina or opponent observations.
   const nearby=reported.nearbyTeammate===true?
     (reported.moving===true?' · 주변에서 이동 중':' · 가까이 있음'):'';
   return seat+'. '+name+' · '+(reported.connection==='stale'?'응답 대기':'참가 중')+
     nearby;
  });
  const label=world?(world.phase==='finished'?'우리 분대 · 최종 상태':'우리 분대 · 실시간 참가 상태'):'우리 분대 · 준비 명단';
  return label+'\n'+lines.join('\n');
 }
 // PC chat is an actual six-person human channel. Keep a user's draft
 // intact while a slow server response is in flight, and never let a prior
 // session/round acknowledgement consume text typed by a new participant.
 // A bounded single-flight guard avoids submitting the same Enter+click twice.
 function createDraftGuard(){
  let pending=null;
  const same=(a,b)=>!!a&&!!b&&a.token===b.token&&a.round===b.round;
  function begin(token,round,draft){
   if(typeof token!=='string'||!token||
      !Number.isSafeInteger(round)||round<1||
      typeof draft!=='string'||!draft.trim())return false;
   // An in-flight request belongs to its original authenticated session.
   // A new session/round must not inherit a permanently locked composer if
   // that request never settles (e.g. offline host or transport loss).
   if(pending&&same(pending,{token,round}))return false;
   pending=Object.freeze({token,round,draft});return true;
  }
  function shouldClear(token,round,editValue){
   return same(pending,{token,round})&&editValue===pending.draft;
  }
  function finish(token,round){
   if(!same(pending,{token,round}))return false;
   pending=null;return true;
  }
  return Object.freeze({begin,shouldClear,finish,
   pending:()=>pending!==null,reset:()=>{pending=null;}});
 }
 return Object.freeze({COUNT,roster,createDraftGuard});
});
