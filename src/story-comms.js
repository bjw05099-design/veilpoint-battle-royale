/* VEILPOINT CH01 / original, fact-grounded mission radio exchanges.
 * This is textual narrative, not a generated voice, remote chat, or new
 * hidden information channel. Only observed saved story state is consulted.
 */
(function(root,factory){
 const sim=typeof module==='object'&&module.exports?
   require('./simulation.js'):root.VeilpointSim;
 const hall=typeof module==='object'&&module.exports?
   require('./aden-hall-lights.js'):root.VeilpointHallLights;
 const api=factory(sim,hall);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryComms=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Sim,HallLights){
 'use strict';
 const line=(speaker,message)=>Object.freeze({speaker,message});
 // A physically nearby civilian can speak directly; location, blocked sight
 // and actual arrived poses are all from the saved, 60Hz simulation.
 // A public speaker cannot drown out the human standing beside the player.
 function onsiteWitness(state){
  if(!state||!['records','decision','exit'].includes(state.phase))return null;
  const p=state.world?.player,obstacles=state.world?.obstacles;
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||
     !Array.isArray(obstacles))return null;
  const observed=(person,reach)=>person&&Number.isFinite(person.x)&&
    Number.isFinite(person.z)&&
    Math.hypot(p.x-person.x,p.z-person.z)<=reach&&
    !Sim.lineBlocked(p.x,p.z,person.x,person.z,obstacles);
  // Only a physically arrived walker may be reported as an eyewitness
  // outcome. Old/restored flags alone cannot substitute for the actual
  // authored civilian destination in the 60Hz world.
  if(state.civilianRerouted===true&&state.civilianWalker?.arrived===true&&
     state.civilianWalker.x===-4&&state.civilianWalker.z===-58&&
     observed(state.civilianWalker,7))
   return line('이수혁 대위','한 주민이 스스로 고른 남쪽 접근로에 실제로 도착한 것을 봤다. 다른 주민이 모두 도착했다는 뜻은 아니다.');
  if(state.mara?.arrived===true&&observed(state.mara,8))
   return line('마라','통로가 실제로 비어서 제 판단으로 걸어 나왔어요. 나머지 주민은 제가 확인하지 못했고, 이동 결정은 각자가 해야 합니다.');
  // The same civilian already visible in the 60Hz world reacts to assistance
  // ONLY within ordinary conversational range and unobstructed sight.
  // A crossing request is not proof of arrival; actual saved metre-space
  // destination and person positions determine the two different outcomes.
  const crossing=state.civicCrossing;
  if(crossing?.disrupted===true&&crossing.assisted===true&&
     observed(crossing.civilian,6)){
    const arrived=[crossing.civilian.x,crossing.civilian.z,
      crossing.destination?.x,crossing.destination?.z].every(Number.isFinite)&&
      Math.hypot(crossing.civilian.x-crossing.destination.x,
       crossing.civilian.z-crossing.destination.z)<1e-6;
    return arrived
      ?line('현지 주민','건너편 보행로에 직접 도착했어요. 다른 주민들이 어디 있는지까지는 저도 알 수 없어요.')
      :line('현지 주민','길을 안내해 주셔서 고맙습니다. 아직 반대편에 도착하지 않았으니 여기서 움직임을 확인할게요.');
  }
  return null;
 }
 // Three local, non-omniscient dramatic beats rely on actual 60Hz actor
 // poses or on a room the player has physically entered. There is NO quest
 // flag, global notification, automatic investigation or additional save key.
 // Existing V2 checkpoints can hear these beats after resuming, while the
 // opening and active incident keep their established dialogue unchanged.
 function onsiteColleague(state){
  if(!state?.combat?.cleared||
     !['records','decision','exit'].includes(state.phase))return null;
  const p=state.world?.player,obstacles=state.world?.obstacles;
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Array.isArray(obstacles))return null;
  const nearby=(person,reach)=>person&&Number.isFinite(person.x)&&
    Number.isFinite(person.z)&&
    Math.hypot(p.x-person.x,p.z-person.z)<=reach&&
    !Sim.lineBlocked(p.x,p.z,person.x,person.z,obstacles);
  if(nearby(state.world.liaison,5.0)){
    return state.relayRestored
      ?line('조현지','우리가 직접 복구한 공용 중계기는 이 골목까지만 연결됩니다. 한국에서 받은 복귀 지시가 바뀐 것은 아니고, 실제 운송편과 주민 이동도 별도로 확인해야 합니다.')
      :line('조현지','공용 중계기가 끊긴 동안 현지 구조단은 직접 사람을 보내 소식을 전했습니다. 복귀할 수 있다는 보고는 아직 확인되지 않았습니다.');
  }
  if(nearby(state.world.kimJiyoon,5.0)){
    return state.workerInterviewed
      ?line('김지윤','작업자의 가족이 1990년 통일과 1994년 전쟁을 서로 다르게 기억한다는 말을 직접 들었습니다. 진술의 범위를 넘어 모든 주민의 뜻으로 기록할 수는 없습니다.')
      :line('김지윤','한국에서 받은 본래 임무는 민간 연락 협력입니다. 이 항구에서 확인한 사실만 구분해 보고해야 합니다. 아직 모르는 인원과 이동은 빈칸으로 남겨두겠습니다.');
  }
  return null;
 }
 function onsitePublicHall(state){
  if(!state?.combat?.cleared||
     !['records','decision','exit'].includes(state.phase))return null;
  const p=state.world?.player,obstacles=state.world?.obstacles;
  if(!p||!Array.isArray(obstacles)||!Number.isFinite(p.x)||!Number.isFinite(p.z))return null;
  // A room must exist physically in the same CH01 collision map. A forged
  // client coordinate or old save with no authored hall cannot narrate it.
  if(!obstacles.some(o=>o.id==='harbor-hall-north'&&o.type==='story-public-hall-wall')||
     p.x<25||p.x>31||p.z<30||p.z>39||
     obstacles.some(o=>{
      const dx=Math.max(0,Math.abs(p.x-o.x)-o.w/2),
        dz=Math.max(0,Math.abs(p.z-o.z)-o.d/2);
      return dx*dx+dz*dz<.85*.85;
     }))return null;
  const localCircuitOn=HallLights?.level(state.world)===1;
  const observedLight=localCircuitOn
    ?'아까 연결한 공용 중계기 회선 덕분에 이 주민 회관의 내부 조명만 켜져 있다. 도시 전체의 전기가 복구된 것은 아니다.'
    :'주민 회관 조명은 여전히 꺼져 있다. 복구되지 않은 실내를 보고 다른 지역의 전력 상태를 추측할 수는 없다.';
  return state.musterConfirmed
    ?line('이수혁 대위',observedLight+' 실제 구조단 접수는 남쪽에서 확인했다. 이 회관에 사람이 보이지 않는다고 모두 이동했다고 말할 수는 없다.')
    :line('이수혁 대위',observedLight+' 이 주민 회관은 지금 비어 있다. 누구의 이동도 아직 확인되지 않았다. 주민 이동 여부는 유수프 구조단에 직접 확인해야 한다.');
 }
 // All these exchanges follow already saved, physically witnessed events.
 // They never add a quest arrow, rewrite the chapter state or infer distant
 // civilians from a private network/sensor. One human's recollection remains
 // an individual's voice, not a claim about every Yemeni resident.
 function localCharacterBeat(state){
  if(!state||!['records','decision','exit'].includes(state.phase))return null;
  const witnessed=onsiteWitness(state);
  if(witnessed)return witnessed;
  // A filed report is a fact, not proof that a remote coordinator can be
  // heard speaking here. Without a physically nearby character or an
  // authenticated radio transmission, narrate the captain's own observation.
  if(state.waterReportFiled===true)
   return line('이수혁 대위','급수대 한 곳의 현장 보고를 구조단에 직접 인계했다. 접수 사실만 확인했고 도시 전체의 급수 복구는 아직 확인하지 못했다.');
  if(state.waterSurveyed===true)
   return line('이수혁 대위','공용 급수대 한 곳의 상태만 직접 확인했다. 주민 전체의 생활이 복구됐는지는 현지 구조단 확인이 필요하다.');
  if(state.workerInterviewed===true)
   return line('이수혁 대위','항구 작업자가 직접 말한 가족의 기억은 서로 달랐다. 내가 확인한 것은 그 개인의 진술뿐이다. 당시 시각은 미확인으로 기록했다.');
  if(state.civilianRerouted===true)
   return line('이수혁 대위','주민이 자기 판단으로 남쪽 접근로를 택했다. 도착했는지 확인하지 않고 완료로 보고하지 않겠다.');

  if(state.awningShift>=1&&state.combat?.cleared===true)
   return line('마라','쓰러진 차양을 길 가장자리로 옮긴 건 확인했어. 그렇다고 골목 전체가 안전해졌다고 보장할 수는 없어.');
  return null;
 }

 function briefing(state){
  if(!state||typeof state!=='object')return line('현장 통신','교신 정보 확인 중');
  const phase=state.phase,found=Array.isArray(state.found)?state.found:[];
  if(phase==='terminal')return line('이수혁 대위','출국 전 승인된 현지 통신 협력 임무와 복귀 계획을 한국에서 이미 브리핑받았다. 중계기 상태를 확인한다. 예정에 없던 교전에 참여하기 위해 파견된 것은 아니다.');
  if(phase==='engagement'){
   // Every status comes only from the captain's own playable 60Hz state
   // or an explicitly completed ally report. Never disclose opponents
   // hidden behind cover, live coordinates or unobserved activity.
   const p=state.world?.player;
   if(p&&Number.isFinite(p.health)&&p.health>0&&p.health<=35)
    return line('이수혁 대위','부상 상태를 확인했다. 현장 상황에 따라 임무 진행 여부를 판단하겠다.');
   if(p&&Number.isFinite(p.reloadRemaining)&&p.reloadRemaining>0)
    return line('김도겸 중사','대위님 장비 상태를 확인 중입니다. 상황이 정리되는 대로 다시 보고하겠습니다.');
   if(p&&Number.isFinite(p.charges)&&p.charges<=5)
    return line('이수혁 대위','휴대 자원이 얼마 남지 않았다. 보유량을 정확히 확인하겠다.');
   if(state.combat?.supportUsed===true)
    return line('김도겸 중사','요청하신 현장 확인 보고는 전달했습니다. 확인되지 않은 대상의 위치는 알 수 없습니다.');
   return line('조현지','출국 전 계획에 없던 충돌이 확산되고 있습니다. 현장 통신 불안정. 확인되지 않은 보고를 사실로 확정하지 않겠습니다.');
  }
  if(phase==='records'||phase==='decision'){
   // Immediate witnessed civilian consequences outrank optional archival context.
   // The captain does not stop a live local encounter to recite paperwork.
   const witnessed=localCharacterBeat(state);
   if(witnessed)return witnessed;
   if(found.includes('recordA')&&found.includes('recordB'))
    return state.workerInterviewed
      ?line('김지윤','항구 04:12, 대피소 04:07은 원본 기록입니다. 현장 작업자의 조명 이상 목격담은 시각이 미확인된 별도 진술로 보존하겠습니다.')
      :line('김지윤','항구 04:12, 대피소 04:07. 기록은 일치하지 않으며 원인은 아직 확인되지 않았습니다.');
   if(found.includes('recordA'))
    return line('김지윤','항구 기록 04:12 확인. 선후관계는 아직 확정되지 않았습니다.');
   if(found.includes('recordB'))
    return line('김지윤','대피소 기록 04:07 확인. 다른 시각의 원인은 아직 불명확합니다.');
   // Local character conflict comes from real encounters, not another
   // invented paperwork objective or scripted forced-choice menu.
   // The captain can choose the practical civilian route without being
   // given an artificial assignment to collect more ledgers.
   return line('김지윤','남쪽 주민 이동 지원은 유수프 구조단과 직접 협의하면 됩니다. 동쪽 통로도 현지 담당자에게 직접 요청할 수 있습니다. 기록 비교는 선택 사항인 별도 과정이며, 한국에서 받은 임무는 이미 브리핑받았습니다.');
  }
  if(phase==='exit'&&state.choice==='verification'){
   if(state.gateObstructed===true)
    return line('조현지','동쪽 통제문이 보행자와 부딪힐 위험으로 멈췄습니다. 실제 개방 전에 통행 완료로 판단할 수 없습니다. 현지 담당자의 확인이 필요합니다.');
   if(state.logHandedOff)
    return line('조현지','확인된 중계 기록이 현지 통제소에 전달됐습니다. 후속 분석은 계속됩니다.');
   if(state.gateLogReviewed)
    return line('김지윤','04:12는 동일 통신문의 재전송으로 확인됐습니다. 최초 수신 기록은 04:07입니다.');
   if(state.passageWarningHeard)
    return line('조현지','동쪽 통로에 직접 도착했지만 현지 통제소의 개방 확인은 아직 없습니다. 한국 출국 전 복귀 계획을 그대로 진행할 수는 없습니다.');
   return line('조현지','동쪽 통제문 개방은 현지 구조단 확인이 필요합니다. 미확인 정보는 전파하지 않습니다.');
  }
  if(phase==='exit'&&state.choice==='evacuation'){
   if(state.transportVan?.arrived)
    return line('조현지','나딤의 차량이 실제 승차 지점에 도착했습니다. 주민 탑승과 출발은 현지 구조단 확인이 필요합니다.');
   if(state.transportVan)
    return line('유수프 라할','현지 운송 차량이 공공 도로로 접근 중입니다. 도착 전에는 이송 완료로 기록하지 않습니다.');
   if(state.driverReportFiled)
    return line('김지윤','운송 담당자 진술과 현장 장부가 함께 접수됐습니다. 배차 사실과 실제 차량 도착 여부는 분리해 후속 확인하겠습니다.');
   if(state.guide?.arrived||state.guide?.released)
    return line('조현지','대피 안내원의 현장 도착 또는 구조단 인계를 확인했습니다.');
   if(state.aidDelivered)
    return line('이수혁 대위','비상 물품 인계를 확인했다. 대피 인원 확인은 현지 구조단 기록을 따른다.');
   if(state.guide?.active&&state.guide?.waiting)
    return line('조현지','안내원에게 현장 대기를 지시했습니다. 직접 다시 접근해 동행을 재개해야 합니다.');
   if(state.guide?.active)
    return line('조현지','안내원 동행 중입니다. 실제 도착 또는 구조단 인계 전에는 완료로 기록하지 않습니다.');
   if(state.world?.carryingAid)
    return line('이수혁 대위','구조용 물품을 직접 운반 중이다. 현지 구조단에 인계하기 전까지 완료로 보고하지 않는다.');
   if(state.aidStaged)
    return line('이수혁 대위','구조 물품은 현장 적재대에 있다. 구조단 인계는 아직 확인되지 않았다.');
   // Human consequences can be heard after normal route tasks, without
   // requiring a sixth form, ledger, route vote or manual flag.
   const witnessed=localCharacterBeat(state);
   if(witnessed)return witnessed;
   if(state.passageWarningHeard)
    return line('유수프 라할','남쪽 통로의 주민 인도를 진행 중입니다. 복귀 이동편의 실제 도착 여부는 아직 확인되지 않았습니다.');
   return line('이수혁 대위','남쪽 대피로를 확보한다. 민간인 확인은 현지 구조단과 협력한다.');
  }
  if(phase==='complete')return line('이수혁 대위','CH01 현장 임무 종료. 확정되지 않은 사건의 원인은 후속 조사로 남긴다.');
  if(phase==='failed')return line('현장 통신','신호가 중단됐습니다. 재시작 후 확인된 기록만 다시 보고합니다.');
  return line('현장 통신','임무 진행 상태를 확인 중입니다.');
 }
 // The actual HUD previously selected localPublicAddress first. That made
 // real characters invisible whenever the player could hear a relay nearby.
 // No persistent gameplay state changes; old v2 checkpoints still work.
 function fieldRadio(state,publicAddress=null){
  return onsiteWitness(state)||onsiteColleague(state)||onsitePublicHall(state)||
    publicAddress||briefing(state);
 }
 return Object.freeze({briefing,localCharacterBeat,onsiteWitness,onsiteColleague,onsitePublicHall,fieldRadio});
});
