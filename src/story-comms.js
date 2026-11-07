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
 function briefing(state){
  if(!state||typeof state!=='object')return line('현장 통신','교신 정보 확인 중');
  const phase=state.phase,found=Array.isArray(state.found)?state.found:[];
  if(phase==='terminal')return line('이수혁 대위','나흐린 중계기 상태를 현장에서 확인한다. 민간 대피 지원 범위에서 움직인다.');
  if(phase==='engagement')return line('조현지','현장 통신 불안정. 확인되지 않은 보고를 사실로 확정하지 않겠습니다.');
  if(phase==='records'||phase==='decision'){
   if(found.includes('recordA')&&found.includes('recordB'))
    return line('김지윤','항구 04:12, 대피소 04:07. 기록은 일치하지 않으며 원인은 아직 확인되지 않았습니다.');
   if(found.includes('recordA'))
    return line('김지윤','항구 기록 04:12 확인. 대피소 원본을 보기 전에는 선후관계를 확정할 수 없습니다.');
   if(found.includes('recordB'))
    return line('김지윤','대피소 기록 04:07 확인. 항구 측 기록도 직접 대조해야 합니다.');
   return line('김지윤','현지 구조단의 두 기록을 현장에서 확보한 후 대조하겠습니다.');
  }
  if(phase==='exit'&&state.choice==='verification'){
   if(state.logHandedOff)
    return line('조현지','확인된 중계 기록이 현지 통제소에 전달됐습니다. 후속 분석은 계속됩니다.');
   if(state.gateLogReviewed)
    return line('김지윤','04:12는 동일 통신문의 재전송으로 확인됐습니다. 최초 수신 기록은 04:07입니다.');
   return line('조현지','동쪽 통제문 개방은 현지 구조단 확인이 필요합니다. 미확인 정보는 전파하지 않습니다.');
  }
  if(phase==='exit'&&state.choice==='evacuation'){
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
   return line('이수혁 대위','남쪽 대피로를 확보한다. 민간인 확인은 현지 구조단과 협력한다.');
  }
  if(phase==='complete')return line('이수혁 대위','CH01 현장 임무 종료. 확정되지 않은 사건의 원인은 후속 조사로 남긴다.');
  if(phase==='failed')return line('현장 통신','신호가 중단됐습니다. 재시작 후 확인된 기록만 다시 보고합니다.');
  return line('현장 통신','임무 진행 상태를 확인 중입니다.');
 }
 return Object.freeze({briefing});
});
