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
    return Object.freeze(rows);
  }
  return Object.freeze({entries});
});
