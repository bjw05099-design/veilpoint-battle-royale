/* Fictional CH01 opening: pre-departure briefing precedes unexpected escalation.
 * Narrative events only; no military procedures or real-unit claims.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VeilpointChapterOpening=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1;
  const SCENES=Object.freeze([
    Object.freeze({id:'briefed-in-korea',place:'대한민국 · 출국 전',speaker:'이수혁',line:'파견 목적과 복귀 일정은 출국 전 브리핑에서 확인했다. 현지 민간 연락망과 우리 인원의 안전을 먼저 점검한다.'}),
    Object.freeze({id:'arrival',place:'나흐린 · 항구 지구',speaker:'조현지',line:'도착했습니다. 현지 연락 담당자와 예정된 만남부터 진행하겠습니다.'}),
    Object.freeze({id:'escalation',place:'나흐린 · 항구 지구',speaker:'김지윤',line:'예상보다 빠르게 충돌이 번지고 있습니다. 현지 구조단이 대피 지원을 요청했습니다.'}),
    Object.freeze({id:'decision',place:'나흐린 · 항구 지구',speaker:'이수혁',line:'원래 파견 임무와는 다른 상황이다. 연락을 시도하면서 당장 위험한 사람들을 돕자.'})
  ]);
  function initial(){return {version:VERSION,scene:0,finished:false};}
  function restore(raw){
    if(!raw||typeof raw!=='object')return initial();
    const n=Number.isInteger(raw.scene)?Math.max(0,Math.min(SCENES.length,raw.scene)):0;
    return {version:VERSION,scene:n,finished:n===SCENES.length||raw.finished===true&&n===SCENES.length};
  }
  function current(state){const s=restore(state);return s.finished?null:SCENES[s.scene];}
  function advance(state){
    const s=restore(state);
    if(s.finished)return s;
    const scene=Math.min(SCENES.length,s.scene+1);
    return {version:VERSION,scene,finished:scene===SCENES.length};
  }
  return Object.freeze({VERSION,SCENES,initial,restore,current,advance});
});
