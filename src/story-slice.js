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
  const VERSION = 2;
  const SAVE_LIMIT = 8192;
  const HOSTILE_POSITIONS = Object.freeze([{x:0,z:-28},{x:15,z:-34},{x:-15,z:-34}]);
  const HOSTILE_ROUNDS = 12; // Finite fictional encounter supply; no auto-replenishment.
  // Fictional local checkpoint obstacle; open only after responders authorize the route.
  const EAST_CHECKPOINT = Object.freeze({x:27,z:-53,w:12,d:3,h:2.5,type:'container',routeId:'east-checkpoint'});
  function makeHostiles(disabled=false) {
    return HOSTILE_POSITIONS.map((p,id)=>({id,x:p.x,z:p.z,health:disabled?0:90,
      alive:!disabled,angle:Math.PI,moveTime:999,actionTime:999,skill:0,
      shots:disabled?HOSTILE_ROUNDS:0}));
  }
  const INTERACT_RADIUS = 4;
  const POINTS = Object.freeze({
    terminal: Object.freeze({id:'terminal', x:0, z:-18, kind:'objective', label:'시민 중계기'}),
    recordA: Object.freeze({id:'recordA', x:17, z:-30, kind:'evidence', label:'항구 기록'}),
    recordB: Object.freeze({id:'recordB', x:-17, z:-30, kind:'evidence', label:'대피소 기록'}),
    decision: Object.freeze({id:'decision', x:0, z:-41, kind:'objective', label:'교차 확인 콘솔'}),
    exitEvac: Object.freeze({id:'exitEvac', x:0, z:-61, kind:'evac', label:'안전한 안뜰'}),
    exitVerify: Object.freeze({id:'exitVerify', x:27, z:-61, kind:'verify', label:'추가 확인 경로'})
  });
  const RECORDS = Object.freeze({
    recordA: Object.freeze({title:'항구 중계 기록', time:'04:12', text:'서부 해안도로의 신호가 먼저 끊겼다고 기록되어 있다.'}),
    recordB: Object.freeze({title:'대피소 수신 기록', time:'04:07', text:'해안도로의 통신 두절을 이미 다섯 분 전에 보고했다.'})
  });
  const phases = ['terminal','engagement','records','decision','exit','complete','failed'];
  const hasOwn = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  function createWorld() {
    const world=Sim.newMatch(20261027,0);
    world.status='playing';
    world.loot=[];
    world.player.x=0;world.player.z=12;world.player.yaw=0;world.player.pitch=0;
    world.zone.radius=170;
    world.player.shield=0;
    return world;
  }
  function syncRoute(state) {
    // Reconstruct physical access from the decision on every load; no drifting save flag.
    state.world.obstacles=state.world.obstacles.filter(o=>o.routeId!=='east-checkpoint');
    if(state.choice!=='verification')state.world.obstacles.push({...EAST_CHECKPOINT});
    return state;
  }
  function recoverGateOverlap(state) {
    // Older v2 saves predate the authored barrier and can place the player inside it.
    // Relocate only those overlapping the new checkpoint, never rewrite valid positions.
    const p=state.world.player;
    if(state.choice==='verification'||!Sim.blocked(p.x,p.z,.85,[EAST_CHECKPOINT]))return false;
    const north=EAST_CHECKPOINT.z+EAST_CHECKPOINT.d/2+1;
    const south=EAST_CHECKPOINT.z-EAST_CHECKPOINT.d/2-1;
    p.z=Math.abs(p.z-north)<=Math.abs(p.z-south)?north:south;
    return true;
  }
  function createState() {
    const state={version:VERSION,phase:'terminal',found:[],choice:null,world:createWorld(),
      combat:{started:false,cleared:false,supportUsed:false,nextPulseAt:0},
      subtitle:'마라(기술자): 이 대위님, 현지 대피 지원 요청으로 승인된 임무예요. 민간 통로만 확인하고, 기록의 진위는 단정하지 마세요.',message:'CH01 / 마지막 방송 · 제한적 대피 지원'};
    syncRoute(state);syncMarkers(state);
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
    if(state.phase==='complete'||state.phase==='failed')return state;
    const t=clamp(Number.isFinite(dt)?dt:0,0,.05),p=state.world.player;
    let ix=Number(!!input.right)-Number(!!input.left);
    let iz=Number(!!input.forward)-Number(!!input.back);
    const len=Math.hypot(ix,iz)||1;ix/=len;iz/=len;
    const sprint=!!input.sprint&&iz>0&&p.stamina>1;
    const speed=input.crouch?3.1:sprint?9.5:6.1;
    Sim.moveEntity(p,(ix*Math.cos(p.yaw)+iz*Math.sin(p.yaw))*speed,
      (ix*Math.sin(p.yaw)-iz*Math.cos(p.yaw))*speed,t,state.world.obstacles);
    p.stamina=clamp(p.stamina+(sprint?-20:13)*t,0,100);
    Sim.updateStress(p,t,sprint);
    state.world.elapsed+=t;
    Sim.advanceReload(state.world,t);
    if(state.phase==='engagement'&&state.world.elapsed>=state.combat.nextPulseAt){
      // Legacy checkpoint key nextPulseAt now schedules a grounded, finite hostile volley.
      state.combat.nextPulseAt=state.world.elapsed+3;
      for(const hostile of state.world.bots){
        if(!hostile.alive||hostile.shots>=HOSTILE_ROUNDS)continue;
        const distance=Math.hypot(hostile.x-p.x,hostile.z-p.z);
        if(distance>=48||Sim.lineBlocked(hostile.x,hostile.z,p.x,p.z,state.world.obstacles))continue;
        const bearing=Math.atan2(p.x-hostile.x,-(p.z-hostile.z));
        const facing=Math.atan2(Math.sin(bearing-hostile.angle),Math.cos(bearing-hostile.angle));
        if(Math.abs(facing)>1.1)continue; // No omniscient rear attacks.
        hostile.shots++;
        state.world.effects.push({x:hostile.x,z:hostile.z,t:0.28,type:'hostile'});
        Sim.receiveDamage(state.world,4);
        if(p.health===0)break;
      }
      if(state.world.status==='lost'){
        state.phase='failed';
        state.subtitle='김지윤(국정원): 교전이 중단됐습니다. 체크포인트에서 다시 시도하세요.';
        state.message='임무 중단 · 메뉴에서 다시 시작';
      }
    }
    return state;
  }
  // Fictional, non-graphic hitscan encounter; finite ammunition and sight-gated hostile response.
  function fire(state) {
    if(state.phase!=='engagement')return {ok:false,reason:'not_in_encounter'};
    // Finite carried supply: no spontaneous ammunition or charge generation.
    // Starting a fresh mission is always available through the menu.
    if(state.world.player.charges===0){
      state.subtitle='마라(기술자): 남은 발사 자원이 없습니다. 메뉴에서 임무를 다시 시작할 수 있습니다.';
      state.message='자원 소진 · 임무 재시작 가능';
      return {ok:false,reason:'empty'};
    }
    const result=Sim.tag(state.world);
    if(!result.ok){
      if(result.reason==='reload_required'){
        state.subtitle='이수혁 대위: 탄창이 비었습니다. R키 또는 재장전 버튼을 누르세요.';
        state.message='탄창 비움 · R 재장전';
      }
      return result;
    }
    if(result.elimination){
      const remaining=state.world.bots.filter(b=>b.alive).length;
      state.subtitle='조현지(국정원): 위협 인원 '+(3-remaining)+'/3 차단. 경로를 확보하고 있어요.';
      state.message='무장 대치자 '+remaining+'기 남음';
      if(remaining===0){
        state.phase='records';state.combat.cleared=true;
        state.subtitle='조현지(국정원): 위협이 사라졌습니다. 중계 기록을 확인할 수 있어요.';
        state.message='안전 확보 · 기록 확인은 선택 사항';
        syncMarkers(state);
      }
    }
    return {...result,phase:state.phase,remaining:state.world.bots.filter(b=>b.alive).length};
  }
  function support(state) {
    if(state.phase!=='engagement')return {ok:false,reason:'not_in_encounter'};
    if(state.combat.supportUsed)return {ok:false,reason:'already_used'};
    state.combat.supportUsed=true;
    state.world.player.shield=0;
    state.subtitle='김지윤(국정원): 현지 구조단이 공유한 대피소 수신 시각은 04:07입니다. 제 정보는 현장 확인 전이니 기록과 대조해 주세요.';
    state.message='출처 명시된 무선 보고 · 현장 검증 필요';
    return {ok:true,event:'support',report:true};
  }
  function interact(state) {
    if(state.phase==='complete')return {ok:false,reason:'completed'};
    if(state.phase==='failed')return {ok:false,reason:'inactive'};
    const marker=nearest(state);
    if(!marker)return {ok:false,reason:'too_far'};
    if(marker.id==='terminal'&&state.phase==='terminal'){
      state.phase='engagement';state.combat.started=true;
      state.combat.nextPulseAt=state.world.elapsed+3;
      state.world.bots=makeHostiles();
      state.subtitle='조현지(국정원): 중계기 주변에 무장 대치자 세 명이 있습니다. 안전을 확보해 주세요.';
      state.message='무장 대치자 3명 · 클릭/SPACE 발사 · Q 상황 보고';
    }else if(hasOwn(RECORDS,marker.id)&&(state.phase==='records'||state.phase==='decision')){
      if(state.found.includes(marker.id))return {ok:false,reason:'already_found'};
      state.found.push(marker.id);
      const record=RECORDS[marker.id];
      state.subtitle=record.title+' / '+record.time+' — '+record.text;
      state.message=state.found.length===2
        ?'SIGNAL ECHO: 04:07과 04:12 기록은 5분 차이입니다. 시계 오차 여부는 미확정이며, 동쪽 통로 승인 요청이 가능합니다.'
        :'기록 확보 · 다른 기록도 확인할 수 있습니다.';
    }else if(marker.id==='decision'&&state.phase==='records'){
      state.phase='decision';
      state.subtitle='마라(기술자): 유수프 구조단이 남쪽 대피 통로를 확보했어요. 동쪽 통로는 기록 두 건을 대조해야 현지 통제소에 개방을 요청할 수 있어요.';
      state.message='경로 선택 · 대피 우선은 언제나 선택할 수 있습니다.';
    }else if((marker.id==='exitEvac'||marker.id==='exitVerify')&&state.phase==='exit'){
      state.phase='complete';state.world.status='won';
      state.subtitle=state.choice==='verification'
        ?'나디아: 동쪽 통로가 개방됐어. 기록 시각이 다른 원인은 아직 확인 중이야.'
        :'유수프: 남쪽 안뜰의 대피 인원을 확인했어. 동쪽 통제소는 아직 닫혀 있어.';
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
      ?'마라(기술자): 두 기록을 전달했어. 유수프 구조단이 동쪽 통제물을 치우고 통로를 개방했대. 원인은 아직 미확정이야.'
      :'마라(기술자): 현지 구조단이 확인한 남쪽 대피 통로로 가자. 동쪽 통제소는 계속 닫혀 있어.';
    state.message=choice==='verification'?'현지 구조단 승인 · 동쪽 통로 개방':'남쪽 대피 통로 유지 · 동쪽 통제소 차단';
    syncRoute(state);syncMarkers(state);
    return {ok:true,event:'choice',choice};
  }
  function backToRecords(state) {
    if(state.phase!=='decision')return {ok:false,reason:'not_choosing'};
    state.phase='records';
    state.subtitle='마라(기술자): 기록을 조금 더 살펴보자. 바로 대피하는 선택도 남아 있어.';
    state.message='기록 조사로 돌아왔습니다.';
    syncMarkers(state);
    return {ok:true,event:'back'};
  }
  function situation(state) {
    const count=state.found.length;
    return Object.freeze({
      mandate:'가상 사히르 임시행정부 요청에 따른 한국 측 제한적 민간 대피 지원 승인',
      liaison:'김지윤: 현지 구조단 전달 기록 검토 · 조현지: 현장 경로 상황 통보',
      evidence:count===2?'기록 2/2 · 04:07 대피소 / 04:12 항구 · 원인 미확정':`기록 ${count}/2 · 교차 확인 전 결론 보류`,
      eastGateOpen:state.choice==='verification',
      route:state.choice==='verification'?'동쪽 통로: 현지 구조단 개방 승인':'동쪽 통로: 현지 구조단 확인 전 통제 중'
    });
  }
  function objective(state) {
    switch(state.phase){
      case 'terminal':return '중계기(황금색 표식)로 이동해 E를 누르세요.';
      case 'engagement':return '무장 대치자 3명을 제압해 안전을 확보하세요. 클릭/SPACE 발사, R 재장전, Q 동료 상황 보고(1회).';
      case 'failed':return '신호가 끊겼습니다. 메뉴에서 미션을 다시 시작하세요.';
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
      player:{x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,stamina:p.stamina,
        health:p.health,shield:0,charges:p.charges,
         loaded:Math.min(p.loaded,p.charges),reloadRemaining:p.reloadRemaining,
         stress:p.stress||0,reloadAssist:!!p.reloadAssist,reloadHesitation:!!p.reloadHesitation},elapsed:state.world.elapsed,
      combat:{...state.combat,drones:state.world.bots.map(b=>({id:b.id,health:b.health,alive:b.alive,shots:b.shots}))}};
  }
  function validateSnapshot(data) {
    if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==VERSION||
      !phases.includes(data.phase)||!Array.isArray(data.found)||data.found.length>2||
      new Set(data.found).size!==data.found.length||data.found.some(id=>!hasOwn(RECORDS,id))||
      !data.player||typeof data.player!=='object'||Array.isArray(data.player))
      throw new RangeError('Invalid story checkpoint');
    // Checkpoint data is untrusted local JSON; never copy arbitrary keys into world entities.
    const expectedKeys=['version','phase','found','choice','player','elapsed','combat'];
    if(Object.keys(data).length!==expectedKeys.length||
      Object.keys(data).some(k=>!expectedKeys.includes(k)))
      throw new RangeError('Unknown checkpoint fields');
    const p=data.player;
    const playerKeys=['x','z','yaw','pitch','stamina','health','shield','charges'];
    const extendedKeys=playerKeys.concat(['loaded','reloadRemaining']);
    const modernKeys=extendedKeys.concat(['stress','reloadAssist','reloadHesitation']);
    const keys=Object.keys(p),modern=keys.length===modernKeys.length;
    const extended=modern||keys.length===extendedKeys.length;
    const expected=modern?modernKeys:extended?extendedKeys:playerKeys;
    if(keys.length!==expected.length||keys.some(k=>!expected.includes(k)))
      throw new RangeError('Unknown player checkpoint fields');
    for(const k of expected.filter(k=>k!=='reloadAssist'&&k!=='reloadHesitation'))
      if(!Number.isFinite(p[k]))throw new RangeError('Invalid checkpoint coordinates');
    if(modern&&(p.stress<0||p.stress>100||typeof p.reloadAssist!=='boolean'||
       typeof p.reloadHesitation!=='boolean'))throw new RangeError('Invalid reload stress state');
    if(!Number.isFinite(data.elapsed)||data.elapsed<0||data.elapsed>86400||
      p.stamina<0||p.stamina>100||p.health<0||p.health>100||
      p.shield<0||p.shield>100||!Number.isInteger(p.charges)||p.charges<0||p.charges>60||
      (extended&&(!Number.isInteger(p.loaded)||p.loaded<0||p.loaded>Sim.MAGAZINE_SIZE||
        p.loaded>p.charges||p.reloadRemaining<0||
         p.reloadRemaining>Sim.RELOAD_SECONDS+(modern?Sim.RELOAD_HESITATION_SECONDS:0)||
        (p.reloadRemaining>0&&(p.charges<=p.loaded||p.loaded===Sim.MAGAZINE_SIZE))))||
      p.pitch<-.34||p.pitch>.36||
      Math.abs(p.yaw)>1e7||Sim.blocked(p.x,p.z,.85,Sim.newMatch(20261027,0).obstacles))
      throw new RangeError('Invalid checkpoint world state');
    const c=data.combat;
    if(!c||typeof c!=='object'||Array.isArray(c)||
      Object.keys(c).length!==5||
      ['started','cleared','supportUsed','nextPulseAt','drones'].some(k=>!hasOwn(c,k))||
      ['started','cleared','supportUsed'].some(k=>typeof c[k]!=='boolean')||
      !Number.isFinite(c.nextPulseAt)||c.nextPulseAt<0||c.nextPulseAt>86410||
      !Array.isArray(c.drones)||c.drones.length!==(c.started?3:0)||
      c.drones.some((b,i)=>!b||typeof b!=='object'||Array.isArray(b)||
        ![3,4].includes(Object.keys(b).length)||
        Object.keys(b).some(k=>!['id','health','alive','shots'].includes(k))||
        b.id!==i||!Number.isFinite(b.health)||b.health<0||b.health>90||
        typeof b.alive!=='boolean'||b.alive!==(b.health>0)||
        (hasOwn(b,'shots')&&(!Number.isInteger(b.shots)||b.shots<0||b.shots>HOSTILE_ROUNDS)))||
      (data.phase==='terminal'&&(c.started||c.cleared||c.supportUsed||c.nextPulseAt!==0))||
      (data.phase!=='terminal'&&!c.started)||
      (['engagement','failed'].includes(data.phase)&&c.cleared)||
      (['records','decision','exit','complete'].includes(data.phase)&&!c.cleared)||
      (c.cleared&&c.drones.some(b=>b.alive))||
      (data.phase==='failed'&&p.health!==0)||
      (data.phase!=='failed'&&p.health===0))
      throw new RangeError('Invalid combat checkpoint');
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
  function upgradeLegacy(data) {
    if(!data||data.version!==1)return data;
    const keys=['version','phase','found','choice','player','elapsed'];
    if(Object.keys(data).length!==keys.length||keys.some(k=>!hasOwn(data,k))||
      !data.player||typeof data.player!=='object'||Array.isArray(data.player)||
      Object.keys(data.player).length!==5||
      ['x','z','yaw','pitch','stamina'].some(k=>!hasOwn(data.player,k)))
      throw new RangeError('Invalid legacy checkpoint');
    const started=data.phase!=='terminal';
    return {...data,version:VERSION,
      player:{...data.player,health:100,shield:0,charges:48},
      combat:{started,cleared:started,supportUsed:false,nextPulseAt:0,
        drones:started?makeHostiles(true).map(b=>({id:b.id,health:0,alive:false,shots:HOSTILE_ROUNDS})):[]}};
  }
  function restore(json) {
    if(typeof json!=='string'||json.length>SAVE_LIMIT)throw new TypeError('Invalid checkpoint save');
    const data=upgradeLegacy(JSON.parse(json));validateSnapshot(data);
    const state=createState();
    state.phase=data.phase;state.found=data.found.slice();state.choice=data.choice;
    for(const key of ['x','z','yaw','pitch','stamina','health','shield','charges'])state.world.player[key]=key==='shield'?0:data.player[key];
    // Older v2 checkpoints have no magazine metadata; total saved rounds stay finite.
    state.world.player.loaded=hasOwn(data.player,'loaded')?data.player.loaded:Math.min(Sim.MAGAZINE_SIZE,data.player.charges);
    state.world.player.reloadRemaining=hasOwn(data.player,'reloadRemaining')?data.player.reloadRemaining:0;
    state.world.player.stress=hasOwn(data.player,'stress')?data.player.stress:0;
    state.world.player.reloadAssist=hasOwn(data.player,'reloadAssist')?data.player.reloadAssist:false;
    state.world.player.reloadHesitation=hasOwn(data.player,'reloadHesitation')?data.player.reloadHesitation:false;
    state.combat={started:data.combat.started,cleared:data.combat.cleared,
      supportUsed:data.combat.supportUsed,nextPulseAt:data.combat.nextPulseAt};
    state.world.bots=data.combat.drones.map((b,i)=>({...makeHostiles()[i],health:b.health,alive:b.alive,shots:hasOwn(b,'shots')?b.shots:0}));
    state.world.elapsed=data.elapsed;
    if(state.phase==='complete')state.world.status='won';
    if(state.phase==='failed'){state.world.status='lost';state.world.player.alive=false;}
    state.subtitle='체크포인트를 불러왔습니다. '+objective(state);
    state.message='CH01 / 이어하기';
    syncRoute(state);
    if(recoverGateOverlap(state))state.message='CH01 / 이전 저장 위치를 통제소 밖으로 안전하게 복구했습니다.';
    return syncMarkers(state);
  }
  return Object.freeze({
    VERSION,POINTS,RECORDS,INTERACT_RADIUS,createState,step,markers,nearest,interact,fire,support,choose,
    objective,situation,backToRecords,serialize,restore,validateSnapshot
  });
});
