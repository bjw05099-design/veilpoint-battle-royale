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
    Object.freeze({id:'decision',place:'나흐린 · 항구 지구',speaker:'이수혁',line:'원래 파견 임무와는 다른 상황이다. 연락을 시도하면서 당장 위험한 사람들을 돕자.'}),
    // Non-interactive scene beats extend the 60Hz playable PC opening.
    // They make the unforeseen civilian impact tangible without assigning
    // a new investigation, inventing a witness, or altering saved V2 state.
    Object.freeze({id:'civic-uncertainty',place:'나흐린 · 민간 항구 접근로',speaker:'조현지',
      line:'중계기에 접속해도 도로에 남아 있는 사람들의 상태를 알 수는 없습니다. 현장 구조단과 직접 확인해야 해요.',durationTicks:240}),
    Object.freeze({id:'captain-commitment',place:'나흐린 · 민간 항구 접근로',speaker:'이수혁',
      line:'확인한 사실과 아직 모르는 것을 구분하자. 여기서 만나는 사람들의 선택을 존중하면서 함께 이동할 길을 찾는다.',durationTicks:240})
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
