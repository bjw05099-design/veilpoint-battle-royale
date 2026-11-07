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
    if(state&&state.musterConfirmed)note('muster','집결지 인원 확인',
      '유수프 구조단의 인원 확인표를 현장에서 직접 대조했다.');
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
    return Object.freeze(rows);
  }
  return Object.freeze({entries});
});
