/* VEILPOINT / CH01 browser story vertical slice.
 * Original fictional mission. Offline, no network or assets.
 * Pure mission rules are separated from DOM, renderer and campaign progression.
 */
(function (root, factory) {
  const api = factory(root.VeilpointSim || (typeof module === 'object' && module.exports ? require('./simulation.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VeilpointStorySlice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Sim) {
  'use strict';
  if (!Sim) throw new Error('VeilpointSim is required for story slice');
  const VERSION = 1;
  const SAVE_LIMIT = 4096;
  const INTERACT_RADIUS = 4;
  const POINTS = Object.freeze({
    terminal: Object.freeze({id:'terminal', x:0, z:-18, kind:'charge', label:'시민 중계기'}),
    recordA: Object.freeze({id:'recordA', x:17, z:-30, kind:'shield', label:'항구 기록'}),
    recordB: Object.freeze({id:'recordB', x:-17, z:-30, kind:'med', label:'대피소 기록'}),
    decision: Object.freeze({id:'decision', x:0, z:-41, kind:'charge', label:'교차 확인 콘솔'}),
    exitEvac: Object.freeze({id:'exitEvac', x:0, z:-61, kind:'med', label:'안전한 안뜰'}),
    exitVerify: Object.freeze({id:'exitVerify', x:27, z:-61, kind:'shield', label:'추가 확인 경로'})
  });
  const RECORDS = Object.freeze({
    recordA: Object.freeze({title:'항구 중계 기록', time:'04:12', text:'서부 해안도로의 신호가 먼저 끊겼다고 기록되어 있다.'}),
    recordB: Object.freeze({title:'대피소 수신 기록', time:'04:07', text:'해안도로의 통신 두절을 이미 다섯 분 전에 보고했다.'})
  });
  const phases = ['terminal','records','decision','exit','complete'];
  const hasOwn = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  function createWorld() {
    const world=Sim.newMatch(20261027,0);
    world.status='playing';
    world.loot=[];
    world.player.x=0;world.player.z=12;world.player.yaw=0;world.player.pitch=0;
    world.zone.radius=170;
    return world;
  }
  function createState() {
    const state={version:VERSION,phase:'terminal',found:[],choice:null,world:createWorld(),
      subtitle:'마라: 나흐린의 통신망이 멈췄어. 중계기를 찾아 기록을 확인하자.',message:'CH01 / 마지막 방송'};
    syncMarkers(state);
    return state;
  }
  function markers(state) {
    if (state.phase==='terminal') return [POINTS.terminal];
    if (state.phase==='records'||state.phase==='decision') return [
      ...(['recordA','recordB'].filter(id=>!state.found.includes(id)).map(id=>POINTS[id])),
      POINTS.decision
    ];
    if (state.phase==='exit') return [state.choice==='verification'?POINTS.exitVerify:POINTS.exitEvac];
    return [];
  }
  function syncMarkers(state) {
    state.world.loot=markers(state).map((p,i)=>({id:i,x:p.x,z:p.z,kind:p.kind,picked:false}));
    return state;
  }
  function nearest(state) {
    const p=state.world.player;
    let candidate=null,best=INTERACT_RADIUS;
    for(const marker of markers(state)){
      const d=Math.hypot(marker.x-p.x,marker.z-p.z);
      if(d<best){best=d;candidate=marker;}
    }
    return candidate;
  }
  function step(state, dt, input={}) {
    if(state.phase==='complete')return state;
    const t=clamp(Number.isFinite(dt)?dt:0,0,.05),p=state.world.player;
    let ix=Number(!!input.right)-Number(!!input.left);
    let iz=Number(!!input.forward)-Number(!!input.back);
    const len=Math.hypot(ix,iz)||1;ix/=len;iz/=len;
    const sprint=!!input.sprint&&iz>0&&p.stamina>1;
    const speed=input.crouch?3.1:sprint?9.5:6.1;
    Sim.moveEntity(p,(ix*Math.cos(p.yaw)+iz*Math.sin(p.yaw))*speed,
      (ix*Math.sin(p.yaw)-iz*Math.cos(p.yaw))*speed,t,state.world.obstacles);
    p.stamina=clamp(p.stamina+(sprint?-20:13)*t,0,100);
    state.world.elapsed+=t;
    return state;
  }
  function interact(state) {
    if(state.phase==='complete')return {ok:false,reason:'completed'};
    const marker=nearest(state);
    if(!marker)return {ok:false,reason:'too_far'};
    if(marker.id==='terminal'&&state.phase==='terminal'){
      state.phase='records';
      state.subtitle='마라: 중계기는 살아 있어. 항구와 대피소의 기록이 서로 다른 시각을 가리켜.';
      state.message='중계기 연결 완료 · 기록 확인은 선택 사항';
    }else if(hasOwn(RECORDS,marker.id)&&(state.phase==='records'||state.phase==='decision')){
      if(state.found.includes(marker.id))return {ok:false,reason:'already_found'};
      state.found.push(marker.id);
      const record=RECORDS[marker.id];
      state.subtitle=record.title+' / '+record.time+' — '+record.text;
      state.message=state.found.length===2
        ?'SIGNAL ECHO: 같은 사건의 시각이 5분 다릅니다. 추가 확인 경로가 열렸습니다.'
        :'기록 확보 · 다른 기록도 확인할 수 있습니다.';
    }else if(marker.id==='decision'&&state.phase==='records'){
      state.phase='decision';
      state.subtitle='마라: 지금 바로 사람들을 안내할까, 두 기록을 대조해 추가 경로를 열까?';
      state.message='경로 선택 · 대피 우선은 언제나 선택할 수 있습니다.';
    }else if((marker.id==='exitEvac'||marker.id==='exitVerify')&&state.phase==='exit'){
      state.phase='complete';state.world.status='won';
      state.subtitle=state.choice==='verification'
        ?'나디아: 두 기록의 시각이 달랐다는 사실을 공개했어. 다음 지역의 접근 경로가 바뀔 거야.'
        :'유수프: 사람들을 안전한 안뜰로 인도했어. 기록의 진실은 아직 남아 있어.';
      state.message='CH01 완료 · 첫 번째 신호가 복구되었습니다.';
    }else return {ok:false,reason:'unavailable'};
    syncMarkers(state);
    return {ok:true,event:marker.id,phase:state.phase};
  }
  function choose(state, choice) {
    if(state.phase!=='decision')return {ok:false,reason:'not_choosing'};
    if(choice!=='evacuation'&&choice!=='verification')return {ok:false,reason:'invalid_choice'};
    if(choice==='verification'&&state.found.length!==2)return {ok:false,reason:'missing_evidence'};
    state.choice=choice;state.phase='exit';
    state.subtitle=choice==='verification'
      ?'마라: 불일치를 확인했어. 동쪽 중계 경로를 통해 안뜰로 가자.'
      :'마라: 먼저 사람들을 안내하자. 남쪽 안뜰로 향해.';
    state.message=choice==='verification'?'추가 확인 경로 개방':'대피 경로 개방';
    syncMarkers(state);
    return {ok:true,event:'choice',choice};
  }
  function backToRecords(state) {
    if(state.phase!=='decision')return {ok:false,reason:'not_choosing'};
    state.phase='records';
    state.subtitle='마라: 기록을 조금 더 살펴보자. 바로 대피하는 선택도 남아 있어.';
    state.message='기록 조사로 돌아왔습니다.';
    syncMarkers(state);
    return {ok:true,event:'back'};
  }
  function objective(state) {
    switch(state.phase){
      case 'terminal':return '중계기(황금색 표식)로 이동해 E를 누르세요.';
      case 'records':return '선택: 양쪽 기록을 조사하세요. 또는 중앙 콘솔에서 바로 대피 경로를 선택하세요.';
      case 'decision':return state.found.length===2
        ?'두 기록의 시각 차이 확인 완료. 대피 우선 또는 추가 확인 경로를 선택하세요.'
        :'대피 우선을 선택하거나, 두 기록을 찾아 추가 확인 경로를 여세요.';
      case 'exit':return state.choice==='verification'
        ?'동쪽 추가 확인 경로(파란 표식)로 이동해 E를 누르세요.'
        :'남쪽 안전한 안뜰(초록 표식)로 이동해 E를 누르세요.';
      default:return 'CH01 완료. 캠페인 전체 12시간은 아직 제작 중입니다.';
    }
  }
  function snapshot(state) {
    const p=state.world.player;
    return {version:VERSION,phase:state.phase,found:state.found.slice(),choice:state.choice,
      player:{x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,stamina:p.stamina},elapsed:state.world.elapsed};
  }
  function validateSnapshot(data) {
    if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==VERSION||
      !phases.includes(data.phase)||!Array.isArray(data.found)||data.found.length>2||
      new Set(data.found).size!==data.found.length||data.found.some(id=>!hasOwn(RECORDS,id))||
      !data.player||typeof data.player!=='object'||Array.isArray(data.player))
      throw new RangeError('Invalid story checkpoint');
    const p=data.player;
    for(const k of ['x','z','yaw','pitch','stamina'])
      if(!Number.isFinite(p[k]))throw new RangeError('Invalid checkpoint coordinates');
    if(!Number.isFinite(data.elapsed)||data.elapsed<0||data.elapsed>86400||
      p.stamina<0||p.stamina>100||p.pitch<-.34||p.pitch>.36||
      Math.abs(p.yaw)>1e7||Sim.blocked(p.x,p.z,.85,Sim.newMatch(20261027,0).obstacles))
      throw new RangeError('Invalid checkpoint world state');
    if((data.phase==='terminal'&&(data.found.length!==0||data.choice!==null))||
      ((data.phase==='records'||data.phase==='decision')&&data.choice!==null)||
      ((data.phase==='exit'||data.phase==='complete')&&!['evacuation','verification'].includes(data.choice))||
      (data.choice==='verification'&&data.found.length!==2))
      throw new RangeError('Invalid checkpoint mission state');
    return true;
  }
  function serialize(state) {
    const data=snapshot(state);validateSnapshot(data);
    return JSON.stringify(data);
  }
  function restore(json) {
    if(typeof json!=='string'||json.length>SAVE_LIMIT)throw new TypeError('Invalid checkpoint save');
    const data=JSON.parse(json);validateSnapshot(data);
    const state=createState();
    state.phase=data.phase;state.found=data.found.slice();state.choice=data.choice;
    Object.assign(state.world.player,data.player);state.world.elapsed=data.elapsed;
    if(state.phase==='complete')state.world.status='won';
    state.subtitle='체크포인트를 불러왔습니다. '+objective(state);
    state.message='CH01 / 이어하기';
    return syncMarkers(state);
  }
  return Object.freeze({
    VERSION,POINTS,RECORDS,INTERACT_RADIUS,createState,step,markers,nearest,interact,choose,
    objective,backToRecords,serialize,restore,validateSnapshot
  });
});
