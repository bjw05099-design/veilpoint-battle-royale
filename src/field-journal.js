(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VeilpointFieldJournal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const evidence=Object.freeze({
    recordA:Object.freeze({title:'항구 중계 기록',time:'04:12',detail:'서부 해안도로의 신호가 먼저 끊겼다고 기록되어 있다.'}),
    recordB:Object.freeze({title:'대피소 수신 기록',time:'04:07',detail:'해안도로의 통신 두절을 이미 다섯 분 전에 보고했다.'})
  });
  function entries(state){
    const found=Array.isArray(state&&state.found)?state.found:[];
    const rows=Object.keys(evidence).map(id=>Object.freeze({
      id,unlocked:found.includes(id),title:found.includes(id)?evidence[id].title:'미확인 현장 기록',
      detail:found.includes(id)?evidence[id].time+' · '+evidence[id].detail:'현장에서 직접 조사해야 열람할 수 있습니다.'
    }));
    if(found.includes('recordA')&&found.includes('recordB'))rows.push(Object.freeze({
      id:'comparison',unlocked:true,title:'기록 교차 확인',
      detail:'대피소 04:07 / 항구 04:12 · 기록 시각이 다르지만 원인은 아직 확정되지 않았습니다.'
    }));
    // These events require earned physical CH01 actions. A field journal
    // cannot infer an unlocked radio or manually operated warning light from
    // an unvisited marker or an incomplete future objective.
    const event=(id,title,detail)=>rows.push(Object.freeze({
      id,unlocked:true,title,detail
    }));
    if(state&&state.combat&&state.combat.supportUsed)
      event('support','동료 현장 보고','이수혁 대위가 현장에서 동료 상황 보고를 수신했다. 아직 확인하지 않은 기록의 내용까지 검증한 것은 아니다.');
    if(state&&state.relayRestored)
      event('relay','비상 무전 중계기 복구','현장에서 예비 전원을 직접 연결해 현지 비상 무전과 항구 벽등을 복구했다.');
    if(state&&state.beaconEnabled&&state.relayRestored)
      event('beacon','수동 항구 경고등 점등','전원이 복구된 항구 경고등의 현장 스위치를 직접 작동했다. 현지 구조단의 이후 판단을 대신하지 않는다.');
    if(state&&state.gateLogReviewed)rows.push(Object.freeze({
      id:'gateLog',unlocked:true,title:'현장 중계 로그',
      detail:'04:07 최초 수신 / 04:12 동일 메시지 재전송'+(state.logHandedOff?' · 현지 통제소 접수 완료':' · 현지 통제소 전달 전')
    }));
    // Contextual civilian outcomes are earned by physical actions in the live
    // CH01 world. No unpublished location, hidden evidence, future campaign
    // chapter or invented mission result is revealed in the field notebook.
    const note=(id,title,detail)=>rows.push(Object.freeze({id,unlocked:true,title,detail}));
    if(state&&state.choice==='evacuation')note('route','선택 경로 / 남쪽 대피',
      '유수프 구조단이 남쪽 대피 통로를 확보했다. 집결지 확인과 물품 인계 및 안내원 동행은 현장 선택 과제다.');
    else if(state&&state.choice==='verification'){
      const elapsed=state.world&&state.world.elapsed;
      // Only the existing authored local gate clock may confirm opening. The
      // notebook must never claim future access before the 60Hz world earns it.
      const gateOpen=Number.isFinite(elapsed)&&Number.isFinite(state.gateReadyAt)&&
        elapsed>=state.gateReadyAt;
      note('route','선택 경로 / 동쪽 추가 확인',
        gateOpen?'현지 구조단의 동쪽 통제문 개방 확인. 현장 중계 기록은 직접 열람해야 한다.':
        '동쪽 통제문 개방 요청 접수. 현지 구조단의 현장 개방 작업이 끝나기 전에는 통과할 수 없다.');
    }
    if(state&&state.dispatchReviewed)note('dispatch','남쪽 구조단 접수 장부',
      '현장에서 직접 읽은 접수 장부: 비상 물품 요청은 접수됐지만 인수 서명란은 비어 있다. 실제 현장 인계 여부는 별도로 확인해야 한다.');
    if(state&&state.musterConfirmed)note('muster','집결지 인원 확인',
      '남쪽 집결지에 실제로 있는 유수프 구조단 담당자와 대피 지원을 직접 협의했다. 미확인 인원은 확인된 수로 간주하지 않는다.');
    if(state&&state.aidPickedUp)note('aid','민간 비상 물품',
      state.aidDelivered?'비상 물품을 현지 구조단에 직접 전달했다.':
        state.aidStaged?'비상 물품이 임시 적재대에 남아 있다. 구조단 현장 인계는 아직 완료되지 않았다.':
        '비상 물품을 운반 중이다. 구조단 현장 인계는 아직 완료되지 않았다.');
    if(state&&state.guide){
      const guide=state.guide;
      if(guide.released)note('guide','안내원 현장 인계',
        '대피 안내원을 현지 구조단에 직접 인계했다.');
      else if(guide.arrived)note('guide','안내원 안뜰 도착',
        '동행 안내원이 실제로 남쪽 안뜰에 도착했다.');
      else if(guide.active)note('guide','안내원 동행 진행',
        guide.waiting?'안내원은 현장에서 대기 중이다. 가까이 돌아가서 동행을 재개할 수 있다.':
          '안내원이 함께 이동 중이다. 안뜰 도착이나 구조단 인계는 아직 완료되지 않았다.');
    }
    // A debrief is earned only after the existing world completes a physical
    // exit. It summarizes observed outcomes; it never awards optional tasks.
    if(state&&state.phase==='complete'&&state.world&&state.world.status==='won'&&
       ['evacuation','verification'].includes(state.choice)){
      const facts=state.choice==='evacuation'
        ?['남쪽 안뜰 대피 경로 완료',
          state.musterConfirmed?'구조단 담당자 현장 협의 완료':'구조단 담당자 현장 협의 미실시',
          state.dispatchReviewed?'접수 장부 현장 열람 완료':'접수 장부 현장 미열람',
          state.aidDelivered?'비상 물품 인계 완료':'비상 물품 인계 미완료',
          state.guide?.arrived?'안내원 안뜰 도착':
            state.guide?.released?'안내원 구조단 인계 완료':'안내원 동행 선택 미완료']
        :['동쪽 추가 확인 경로 완료',
          state.gateLogReviewed?'현장 중계 로그 열람 완료':'현장 중계 로그 미열람',
          state.logHandedOff?'현장 기록 전달 완료':'현장 기록 미전달'];
      note('debrief','CH01 현장 종료 보고',facts.join(' · '));
    }
    return Object.freeze(rows);
  }
  return Object.freeze({entries});
});
