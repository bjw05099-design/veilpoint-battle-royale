/* VEILPOINT CH01 / original, fact-grounded mission radio exchanges.
 * This is textual narrative, not a generated voice, remote chat, or new
 * hidden information channel. Only observed saved story state is consulted.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryComms=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const line=(speaker,message)=>Object.freeze({speaker,message});
 // All these exchanges follow already saved, physically witnessed events.
 // They never add a quest arrow, rewrite the chapter state or infer distant
 // civilians from a private network/sensor. One human's recollection remains
 // an individual's voice, not a claim about every Yemeni resident.
 function localCharacterBeat(state){
  if(!state||!['records','decision','exit'].includes(state.phase))return null;
  const p=state.world?.player;
  // The captain can directly observe one person finishing a short street
  // walk only from nearby unobstructed positions; being saved as arrived
  // alone does not grant an omniscient radio report.
  if(state.civilianRerouted===true&&state.civilianWalker?.arrived===true&&
     p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
     Math.hypot(p.x-state.civilianWalker.x,p.z-state.civilianWalker.z)<=7){
   return line('이수혁 대위','한 주민이 스스로 고른 남쪽 접근로에 실제로 도착한 것을 봤다. 다른 주민이 모두 도착했다는 뜻은 아니다.');
  }
  if(state.waterReportFiled===true)
   return line('유수프 라할','직접 확인한 급수대 현장 보고는 접수했다. 이걸로 도시 전체의 물 공급이 복구됐다고 판단하지는 않겠다.');
  if(state.waterSurveyed===true)
   return line('이수혁 대위','공용 급수대 한 곳의 상태만 직접 확인했다. 주민 전체의 생활이 복구됐는지는 현지 구조단 확인이 필요하다.');
  if(state.workerInterviewed===true)
   return line('조현지','항구 작업자가 들려준 1990년 통일과 1994년 전쟁의 기억은 같은 가족 안에서도 달랐습니다. 우리가 판단할 수 있는 것은 그가 직접 말한 경험까지이며, 당시 시각이 미확인된 별도 진술로 기록합니다.');
  if(state.civilianRerouted===true)
   return line('이수혁 대위','주민이 자기 판단으로 남쪽 접근로를 택했다. 도착했는지 확인하지 않고 완료로 보고하지 않겠다.');
  if(state.mara?.arrived===true && p &&
     Math.hypot(p.x-state.mara.x,p.z-state.mara.z)<=8 &&
     !globalThis.VeilpointSim?.lineBlocked?.(p.x,p.z,state.mara.x,state.mara.z,state.world.obstacles))
   return line('마라','통로가 실제로 비어서 제가 걸어 나왔어요. 나머지 주민은 제가 확인하지 못했고, 이동 결정은 각자가 해야 합니다.');
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
 return Object.freeze({briefing,localCharacterBeat});
});
