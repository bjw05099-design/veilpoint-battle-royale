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
  const HOSTILE_ROUNDS = 12;
  const HOSTILE_BODY_RADIUS = .75; // Same authored radius as hostile movement collision.
  const HOSTILE_ALERT_RANGE = 42, HOSTILE_CHASE_RADIUS = 6, HOSTILE_TURN_RATE = 1.4;
  const GATE_CLEARANCE_SECONDS = 8;
  // Original, motorized sliding checkpoint gate. Its geometry moves at fixed-step
  // speed after the local aid coordinator approves clearance; it never vanishes.
  const EAST_CHECKPOINT = Object.freeze({x:27,z:-53,w:12,d:.6,h:2.5,type:'gate',routeId:'east-checkpoint'});
  const GATE_TRAVEL = -12;
  const GATE_SAFETY_RADIUS = .95; // Player body radius .85 + 10 cm motion buffer.
  function makeHostiles(disabled=false) {
    return HOSTILE_POSITIONS.map((p,id)=>({id,x:p.x,z:p.z,health:disabled?0:90,
      alive:!disabled,angle:Math.PI,moveTime:999,actionTime:999,skill:0,
      shots:disabled?HOSTILE_ROUNDS:0,lastSeenX:p.x,lastSeenZ:p.z,investigateUntil:0}));
  }
  const INTERACT_RADIUS = 4;
  const SUPPLY_REACH = 1.8; // Physical cache reach; larger radius remains for terminals/route triggers.
  const POINTS = Object.freeze({
    terminal: Object.freeze({id:'terminal', x:0, z:-18, kind:'objective', label:'시민 중계기'}),
    supply: Object.freeze({id:'supply', x:5, z:-20, kind:'ammo', label:'현지 구조단 유한 보급 상자'}),
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
  function createWorld(weaponId='carbine') {
    const world=Sim.newMatch(20261027,0,weaponId);
    world.status='playing';
    world.loot=[];
    world.player.x=0;world.player.z=12;world.player.yaw=0;world.player.pitch=0;
    world.zone.radius=170;
    return world;
  }
  function gateOpen(state) {
    return state.choice==='verification' && state.world.elapsed>=state.gateReadyAt;
  }
  function gateGeometry(state) {
    const fraction=state.choice==='verification'
      ?clamp((state.world.elapsed-state.gateReadyAt+GATE_CLEARANCE_SECONDS)/GATE_CLEARANCE_SECONDS,0,1):0;
    return {...EAST_CHECKPOINT,x:EAST_CHECKPOINT.x+GATE_TRAVEL*fraction};
  }
  function syncRoute(state) {
    // Preserve the live obstacle and array identity across 60Hz updates; the
    // renderer and collision code observe the same moving gate without churn.
    const gate=state.world.obstacles.find(o=>o.routeId==='east-checkpoint');
    const x=gateGeometry(state).x;
    if(gate)gate.x=x;
    else state.world.obstacles.push({...EAST_CHECKPOINT,x});
    return state;
  }
  function recoverGateOverlap(state) {
    // Older v2 saves predate the authored barrier and can place the player inside it.
    // Relocate only those overlapping the new checkpoint, never rewrite valid positions.
    const p=state.world.player;
    const gate=gateGeometry(state);
    // Touching the collision boundary is a valid save; relocate only legacy
    // positions that are deeply inside the gate, not players safely beside it.
    if(!Sim.blocked(p.x,p.z,.80,[gate]))return false;
    const north=gate.z+gate.d/2+1;
    const south=gate.z-gate.d/2-1;
    p.z=Math.abs(p.z-north)<=Math.abs(p.z-south)?north:south;
    return true;
  }
  function createState(weaponId='carbine') {
    const state={version:VERSION,phase:'terminal',found:[],choice:null,gateReadyAt:0,gateObstructed:false,world:createWorld(weaponId),
      combat:{started:false,cleared:false,supportUsed:false,supplyUsed:false,supplyRemaining:12,nextPulseAt:0},
      subtitle:'마라(기술자): 이 대위님, 현지 대피 지원 요청으로 승인된 임무예요. 통로 개방은 유수프 구조단이 결정하고, 국정원 보고는 현장 확인 전 참고자료예요.',message:'CH01 / 마지막 방송 · 제한적 대피 지원'};
    syncRoute(state);syncMarkers(state);
    return state;
  }
  function markers(state) {
    if (state.phase==='terminal') return [POINTS.terminal];
    if (state.phase==='engagement') return state.combat.supplyRemaining===0?[]:[POINTS.supply];
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
  function actorBlockers(state,except=null) {
    // Temporary AABB proxies keep the first-person controller from passing through
    // standing opponents. Ignore already-overlapping actors so legacy saves can escape.
    return state.world.bots.filter(b=>b.alive&&b!==except)
      .map(b=>({x:b.x,z:b.z,w:HOSTILE_BODY_RADIUS*2,d:HOSTILE_BODY_RADIUS*2}));
  }
  function nearest(state) {
    const p=state.world.player;
    let candidate=null,best=INTERACT_RADIUS;
    for(const marker of markers(state)){
      const d=Math.hypot(marker.x-p.x,marker.z-p.z);
      // A nearby objective is not reachable through solid cover, a closed gate,
      // or a building wall. The same test governs the HUD prompt and E/touch input.
      if(d<best&&d<(marker.kind==='ammo'?SUPPLY_REACH:INTERACT_RADIUS)&&
        !Sim.lineBlocked(p.x,p.z,marker.x,marker.z,state.world.obstacles)){
        best=d;candidate=marker;
      }
    }
    return candidate;
  }
  function step(state, dt, input={}) {
    if(state.phase==='complete'||state.phase==='failed')return state;
    // A paused/invalid frame must never advance a hostile volley, route motor or RNG.
    if(!Number.isFinite(dt)||dt<=0)return state;
    const t=clamp(dt,0,.05),p=state.world.player;
    const wasGateOpen=gateOpen(state);
    let ix=Number(!!input.right)-Number(!!input.left);
    let iz=Number(!!input.forward)-Number(!!input.back);
    const len=Math.hypot(ix,iz)||1;ix/=len;iz/=len;
    const sprint=Sim.canSprint(p,input,iz);
    const speed=(input.crouch?3.1:sprint?9.5:6.1)*Sim.FIREARMS[p.weaponId].mobility*Sim.injuryMobility(p);
    const occupied=actorBlockers(state).filter(body=>!Sim.blocked(p.x,p.z,.85,[body]));
    const beforeX=p.x,beforeZ=p.z;
    Sim.moveEntity(p,(ix*Math.cos(p.yaw)+iz*Math.sin(p.yaw))*speed,
      (ix*Math.sin(p.yaw)-iz*Math.cos(p.yaw))*speed,t,state.world.obstacles.concat(occupied));
    const movedDistance=Math.hypot(p.x-beforeX,p.z-beforeZ);
    // Keep CH01 fatigue consistent with the BR controller: a blocked forward
    // sprint does not spend stamina or create exertion without actual travel.
    const sprinting=sprint&&movedDistance>1e-7;
    p.stamina=clamp(p.stamina+(sprinting?-20:13)*t,0,100);
    Sim.updateStress(p,t,sprinting);
    state.world.elapsed+=t;
    // CH01 runs its own fixed-step loop instead of Sim.tick: expire transient
    // shot/impact visuals and damage feedback here, or they persist indefinitely.
    state.world.damageFlash=Math.max(0,state.world.damageFlash-t*2.4);
    state.world.messageTime=Math.max(0,state.world.messageTime-t);
    for(let i=state.world.effects.length-1;i>=0;i--){
      state.world.effects[i].t-=t;
      if(state.world.effects[i].t<=0)state.world.effects.splice(i,1);
    }
    Sim.advanceReload(state.world,t);
    if(state.phase==='engagement'&&t>0){
      // Human opponents can orient and advance only after observing a visible player.
      // They cannot magically know a position behind cover or outside their view.
      for(const hostile of state.world.bots){
        if(!hostile.alive)continue;
        const dx=p.x-hostile.x,dz=p.z-hostile.z,distance=Math.hypot(dx,dz);
        const canSee=distance>=.001&&distance<=HOSTILE_ALERT_RANGE&&
          !Sim.lineBlocked(hostile.x,hostile.z,p.x,p.z,
             state.world.obstacles.concat(actorBlockers(state,hostile)));
        const bearing=Math.atan2(dx,-dz);
        const sightDelta=Math.atan2(Math.sin(bearing-hostile.angle),Math.cos(bearing-hostile.angle));
        const tracking=canSee&&Math.abs(sightDelta)<=1.1;
        const audible=!tracking&&Sim.hearsFootsteps(hostile,p,movedDistance,sprinting,state.world.obstacles,!!input.crouch);
        if(tracking||audible){
          // Sight or actual nearby footsteps can reveal a bounded last-known
          // location; neither grants live coordinates once the player goes quiet.
          // The existing checkpoint records this same finite search memory.
          const heard=tracking?p:Sim.approximateSoundPosition(p);
          hostile.lastSeenX=heard.x;hostile.lastSeenZ=heard.z;
          hostile.investigateUntil=state.world.elapsed+3;
        }
        const investigating=!tracking&&hostile.investigateUntil>state.world.elapsed;
        if(!tracking&&!investigating)continue;
        const goalX=tracking?p.x:hostile.lastSeenX,goalZ=tracking?p.z:hostile.lastSeenZ;
        const goalDistance=Math.hypot(goalX-hostile.x,goalZ-hostile.z);
        const goalBearing=Math.atan2(goalX-hostile.x,-(goalZ-hostile.z));
        const delta=Math.atan2(Math.sin(goalBearing-hostile.angle),Math.cos(goalBearing-hostile.angle));
        hostile.angle=Math.atan2(Math.sin(hostile.angle+clamp(delta,-HOSTILE_TURN_RATE*t,HOSTILE_TURN_RATE*t)),
          Math.cos(hostile.angle+clamp(delta,-HOSTILE_TURN_RATE*t,HOSTILE_TURN_RATE*t)));
        const anchor=HOSTILE_POSITIONS[hostile.id];
        const remaining=HOSTILE_CHASE_RADIUS-Math.hypot(hostile.x-anchor.x,hostile.z-anchor.z);
        if(goalDistance>(tracking?18:3)&&remaining>0){
          // Hostiles use the same bounded injury slowdown as the player, scaled
          // to their authored 90-point starting health; no automatic recovery.
          const mobility=Sim.injuryMobility({health:hostile.health/90*100});
          const move=Math.min(1.6*mobility*t,remaining);
          const vx=Math.sin(hostile.angle)*move/t,vz=-Math.cos(hostile.angle)*move/t;
          if(Math.hypot(hostile.x+vx*t-anchor.x,hostile.z+vz*t-anchor.z)<=HOSTILE_CHASE_RADIUS+1e-8)
            Sim.moveEntity(hostile,vx,vz,t,state.world.obstacles.concat(actorBlockers(state,hostile),
              [{x:p.x,z:p.z,w:1.7,d:1.7}]),HOSTILE_BODY_RADIUS);
        }
      }
    }
    state.gateObstructed=false;
    if(state.phase==='exit'&&state.choice==='verification'&&!wasGateOpen){
      // A player standing in the gate's travel path pauses the mechanism instead
      // of being pushed, teleported, or passed through by an animated collider.
      const nextGate=gateGeometry(state);
      if(Sim.blocked(p.x,p.z,GATE_SAFETY_RADIUS,[nextGate])){
        state.gateObstructed=true;
        state.gateReadyAt+=t;
        state.subtitle='마라(기술자): 이동식 통제문이 접근자를 감지해 멈췄어. 문 이동 경로에서 벗어나 줘.';
        state.message='통제문 안전 정지 · 이동 경로를 비우세요';
      }
      syncRoute(state);
      if(gateOpen(state)){
        state.subtitle='마라(기술자): 현지 구조단이 동쪽 통제문을 완전히 열었다고 확인했어. 이제 통과할 수 있어.';
        state.message='현지 구조단 확인 · 동쪽 통로 개방';
      }
    }
    if(state.phase==='engagement'&&state.world.elapsed>=state.combat.nextPulseAt){
      // Legacy checkpoint key nextPulseAt now schedules a grounded, finite hostile volley.
      state.combat.nextPulseAt=state.world.elapsed+3;
      for(const hostile of state.world.bots){
        if(!hostile.alive||hostile.shots>=HOSTILE_ROUNDS)continue;
        const distance=Math.hypot(hostile.x-p.x,hostile.z-p.z);
        if(distance>=48||Sim.lineBlocked(hostile.x,hostile.z,p.x,p.z,
             state.world.obstacles.concat(actorBlockers(state,hostile))))continue;
        const bearing=Math.atan2(p.x-hostile.x,-(p.z-hostile.z));
        const facing=Math.atan2(Math.sin(bearing-hostile.angle),Math.cos(bearing-hostile.angle));
        if(Math.abs(facing)>1.1)continue; // No omniscient rear attacks.
        hostile.shots++;
        state.world.effects.push({x:hostile.x,z:hostile.z,t:0.28,type:'hostile'});
        // A visible, correctly facing opponent can still miss. A shot always
        // consumes one of twelve finite rounds; range and actual player travel
        // reduce accuracy. Seed each shot from saved id/count so a checkpoint
        // cannot reroll a miss into a hit or alter the 60 Hz replay.
        const accuracy=clamp(0.96-distance*0.011-(t>0&&movedDistance/t>2.5?0.12:0),0.2,0.92);
        const shotSeed=(state.world.seed ^ Math.imul(hostile.id+1,0x9e3779b9) ^
          Math.imul(hostile.shots,0x85ebca6b))>>>0;
        if(Sim.rngFromSeed(shotSeed)()<accuracy)Sim.receiveDamage(state.world,4);
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
      const cacheAvailable=state.combat.supplyRemaining>0;
      state.subtitle=cacheAvailable
        ?'유수프(현지 구조단): 표시된 유한 보급 상자에 남은 장비가 있어. 가까이 가서 E로 확보해.'
        :'마라(기술자): 남은 발사 자원이 없습니다. 메뉴에서 임무를 다시 시작할 수 있습니다.';
      state.message=cacheAvailable?'자원 소진 · 보급 상자 E 확보 또는 임무 재시작 가능':'자원 소진 · 임무 재시작 가능';
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
    // A real shot can alert nearby opponents even when it misses. They search
    // a coarse audible location and must still acquire line of sight to fire.
    const heard=Sim.approximateSoundPosition(state.world.player);
    for(const hostile of state.world.bots){
      if(hostile.alive&&Sim.hearsImpulse(hostile,state.world.player,state.world.obstacles)){
        hostile.lastSeenX=heard.x;hostile.lastSeenZ=heard.z;
        hostile.investigateUntil=state.world.elapsed+3;
      }
    }
    if(result.elimination){
      const remaining=state.world.bots.filter(b=>b.alive).length;
      // Only the captain can confirm a visible target he just engaged. The NIS
      // liaison receives his explicit radio report; she has no omniscient feed.
      state.subtitle='이수혁 대위(무전): 현장에서 확인한 위협 인원 '+(3-remaining)+'/3. 상황을 계속 보고하겠습니다.';
      state.message='무장 대치자 '+remaining+'기 남음';
      if(remaining===0){
        state.phase='records';state.combat.cleared=true;
        state.subtitle='조현지(국정원): 이 대위님의 현장 보고 확인했습니다. 중계 기록을 확인할 수 있어요.';
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
    if(hasOwn(state.world.player,'shield'))delete state.world.player.shield;
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
    }else if(marker.id==='supply'&&state.phase==='engagement'){
      // A physical cache is not consumed wholesale when only one round fits.
      // Remaining rounds stay at the same reachable location until collected.
      const p=state.world.player;
      if(state.combat.supplyRemaining===0)return {ok:false,reason:'already_used'};
      if(p.charges>=p.maxCharges)return {ok:false,reason:'inventory_full'};
      const taken=Math.min(state.combat.supplyRemaining,p.maxCharges-p.charges);
      p.charges+=taken;
      state.combat.supplyRemaining-=taken;
      state.combat.supplyUsed=state.combat.supplyRemaining===0;
      state.subtitle='유수프(현지 구조단): 보급 상자에서 '+taken+'발을 확보했어. 상자 잔량은 '+state.combat.supplyRemaining+'발이야.';
      state.message=state.combat.supplyUsed
        ?'현지 구조단 보급 소진 · 추가 보급 없음'
        :'보급 '+taken+'발 확보 · 상자 잔량 '+state.combat.supplyRemaining+'발';
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
      if(marker.id==='exitVerify'&&!gateOpen(state))return {ok:false,reason:'awaiting_clearance'};
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
    state.gateReadyAt=choice==='verification'?state.world.elapsed+GATE_CLEARANCE_SECONDS:0;
    state.subtitle=choice==='verification'
      ?'마라(기술자): 두 기록을 전달했어. 유수프 구조단이 동쪽 통제물을 치우는 동안 기다려야 해. 원인은 아직 미확정이야.'
      :'마라(기술자): 현지 구조단이 확인한 남쪽 대피 통로로 가자. 동쪽 통제소는 계속 닫혀 있어.';
    state.message=choice==='verification'?'현지 구조단 요청 수락 · 동쪽 통로 개방 작업 중':'남쪽 대피 통로 유지 · 동쪽 통제소 차단';
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
      command:'이수혁 대위: 한국 측 파견 지휘관의 승인 범위에서 임무 수행 · 현지 통로 개방은 유수프 구조단 결정 · 국정원은 정보 자문',
      liaison:'김지윤: 현지 구조단 전달 기록 검토 · 조현지: 현장 경로 상황 통보',
      evidence:count===2?'기록 2/2 · 04:07 대피소 / 04:12 항구 · 원인 미확정':`기록 ${count}/2 · 교차 확인 전 결론 보류`,
      eastGateOpen:gateOpen(state),
      route:state.choice==='verification'?(gateOpen(state)?'동쪽 통로: 현지 구조단 개방 확인':state.gateObstructed?'동쪽 통로: 접근자 감지로 안전 정지':'동쪽 통로: 현지 구조단 개방 작업 중'):'동쪽 통로: 현지 구조단 확인 전 통제 중',
      civilianConsequence:state.choice==='evacuation'
        ?'유수프 구조단: 남쪽 대피 인원 확인 우선 · 동쪽 기록 확인 보류'
        :state.choice==='verification'
          ?(gateOpen(state)?'유수프 구조단: 동쪽 통로 점검 완료 · 시각 차이 원인 조사 계속'
            :'유수프 구조단: 남쪽 대피 유지 · 동쪽 통제물 해제 대기')
          :'유수프 구조단: 남쪽 대피 통로 확보 · 추가 확인 여부는 현장 선택'
    });
  }
  // A completed *preview* produces a factual, bounded handoff for future authored
  // scenes. No unseen motive, chapter unlock, or resolved clock discrepancy is invented.
  function debrief(state) {
    if(state.phase!=='complete')return null;
    const verified=state.choice==='verification';
    const records=Object.freeze(state.found.slice().sort());
    const conflict=records.length===2;
    return Object.freeze({
      version:2,mission:'CH01',previewOnly:true,campaignUnlocked:false,
      protagonist:'이수혁',route:state.choice,records,
      eastCheckpointCleared:verified&&gateOpen(state),
      mandate:'limited-civilian-evacuation',intelligenceRole:'advisory-only',
      clockDiscrepancy:conflict?'unresolved':'not-cross-checked',
      civilianOutcome:verified?'east-clearance-confirmed':'south-evacuation-prioritized',
      summary:verified
        ?'유수프 구조단의 동쪽 통로 개방을 확인했습니다. 두 기록의 5분 차이는 여전히 원인 미확정입니다.'
        :'유수프 구조단의 남쪽 대피를 우선했습니다. 동쪽 통로는 통제 중이며 기록 검증은 후속 과제입니다.'
    });
  }
  function objective(state) {
    switch(state.phase){
      case 'terminal':return '중계기(황금색 표식)로 이동해 E를 누르세요.';
      case 'engagement':return '무장 대치자 3명을 제압하세요. 클릭/SPACE 발사, R 재장전, Q 상황 보고.'+
        (state.combat.supplyRemaining===0?' 유한 보급은 이미 사용되어 소진되었습니다.':
        state.world.player.charges>=state.world.player.maxCharges
          ?' 보급 상자 잔량 '+state.combat.supplyRemaining+'발 · 휴대 한도에 도달했습니다.'
          :' 보급 상자 잔량 '+state.combat.supplyRemaining+'발은 가까이에서 E로 확보할 수 있습니다.');
      case 'failed':return '신호가 끊겼습니다. 메뉴에서 미션을 다시 시작하세요.';
      case 'records':return '선택: 양쪽 기록을 조사하세요. 또는 중앙 콘솔에서 바로 대피 경로를 선택하세요.';
      case 'decision':return state.found.length===2
        ?'두 기록의 시각 차이 확인 완료. 대피 우선 또는 추가 확인 경로를 선택하세요.'
        :'대피 우선을 선택하거나, 두 기록을 찾아 추가 확인 경로를 여세요.';
      case 'exit':return state.choice==='verification'
        ?(gateOpen(state)?'동쪽 추가 확인 경로(파란 표식)로 이동해 E를 누르세요.':state.gateObstructed?'동쪽 통제문 안전 정지 · 이동 경로에서 벗어나세요.':'동쪽 통제소 개방 작업 중 · 약 '+Math.ceil(state.gateReadyAt-state.world.elapsed)+'초 후 통과 가능합니다.')
        :'남쪽 안전한 안뜰(초록 표식)로 이동해 E를 누르세요.';
      default:return 'CH01 완료. 캠페인 전체 12시간은 아직 제작 중입니다.';
    }
  }
  function snapshot(state) {
    const p=state.world.player;
    return {version:VERSION,phase:state.phase,found:state.found.slice(),choice:state.choice,gateReadyAt:state.gateReadyAt,
      player:{x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,stamina:p.stamina,
        health:p.health,charges:p.charges,weaponId:p.weaponId,
         loaded:Math.min(p.loaded,p.charges),reloadRemaining:p.reloadRemaining,
         stress:p.stress||0,reloadAssist:!!p.reloadAssist,reloadHesitation:!!p.reloadHesitation,
         sprintExhausted:!!p.sprintExhausted},elapsed:state.world.elapsed,
      combat:{...state.combat,lastShotAt:state.world.lastTagAt,drones:state.world.bots.map(b=>({id:b.id,health:b.health,alive:b.alive,shots:b.shots,x:b.x,z:b.z,angle:b.angle,
        lastSeenX:Number.isFinite(b.lastSeenX)?b.lastSeenX:b.x,
        lastSeenZ:Number.isFinite(b.lastSeenZ)?b.lastSeenZ:b.z,
        investigateUntil:Number.isFinite(b.investigateUntil)?b.investigateUntil:0}))}};
  }
  function validateSnapshot(data) {
    if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==VERSION||
      !phases.includes(data.phase)||!Array.isArray(data.found)||data.found.length>2||
      new Set(data.found).size!==data.found.length||data.found.some(id=>!hasOwn(RECORDS,id))||
      !data.player||typeof data.player!=='object'||Array.isArray(data.player))
      throw new RangeError('Invalid story checkpoint');
    // Checkpoint data is untrusted local JSON; never copy arbitrary keys into world entities.
    const expectedKeys=['version','phase','found','choice','player','elapsed','combat'];
    if(![expectedKeys.length,expectedKeys.length+1].includes(Object.keys(data).length)||
      Object.keys(data).some(k=>!expectedKeys.concat('gateReadyAt').includes(k))||
      (hasOwn(data,'gateReadyAt')&&(!Number.isFinite(data.gateReadyAt)||data.gateReadyAt<0||
        data.gateReadyAt>86410||(data.choice!=='verification'&&data.gateReadyAt!==0)||
        (data.choice==='verification'&&data.gateReadyAt>data.elapsed+GATE_CLEARANCE_SECONDS+1e-6))))
      throw new RangeError('Unknown checkpoint fields');
    const p=data.player;
    // Legacy v2 checkpoints included an inert shield field; current saves omit it.
    const playerKeys=['x','z','yaw','pitch','stamina','health','shield','charges'];
    const extendedKeys=playerKeys.concat(['loaded','reloadRemaining']);
    const modernKeys=extendedKeys.concat(['stress','reloadAssist','reloadHesitation']);
    const currentKeys=modernKeys.concat('sprintExhausted');
    // Each historical v2 schema is accepted with or without the new class ID.
    // Never accept arbitrary subsets: only exact, known checkpoint generations.
    const variants=[playerKeys,extendedKeys,modernKeys,currentKeys,
      playerKeys.concat('sprintExhausted'),extendedKeys.concat('sprintExhausted'),
      playerKeys.concat('weaponId'),extendedKeys.concat('weaponId'),modernKeys.concat('weaponId'),currentKeys.concat('weaponId'),
      playerKeys.concat(['weaponId','sprintExhausted']),extendedKeys.concat(['weaponId','sprintExhausted'])];
    const keys=Object.keys(p);
    const acceptedVariants=variants.concat(variants.map(fields=>fields.filter(k=>k!=='shield')));
    const expected=acceptedVariants.find(fields=>fields.length===keys.length&&keys.every(k=>fields.includes(k)));
    if(!expected)throw new RangeError('Unknown player checkpoint fields');
    const modern=expected.includes('stress'),extended=expected.includes('loaded');
    const firearm=hasOwn(p,'weaponId')?Sim.FIREARMS[p.weaponId]:Sim.FIREARMS.carbine;
    if(!firearm||!hasOwn(Sim.FIREARMS,firearm.id))throw new RangeError('Invalid checkpoint firearm');
    for(const k of expected.filter(k=>k!=='reloadAssist'&&k!=='reloadHesitation'&&k!=='weaponId'&&k!=='sprintExhausted'))
      if(!Number.isFinite(p[k]))throw new RangeError('Invalid checkpoint coordinates');
    if(modern&&(p.stress<0||p.stress>100||typeof p.reloadAssist!=='boolean'||
       typeof p.reloadHesitation!=='boolean'))throw new RangeError('Invalid reload stress state');
    if(expected.includes('sprintExhausted')&&typeof p.sprintExhausted!=='boolean')
      throw new RangeError('Invalid sprint fatigue state');
    if(!Number.isFinite(data.elapsed)||data.elapsed<0||data.elapsed>86400||
      p.stamina<0||p.stamina>100||p.health<0||p.health>100||
      p.shield<0||p.shield>100||!Number.isInteger(p.charges)||p.charges<0||p.charges>firearm.maxRounds||
      (extended&&(!Number.isInteger(p.loaded)||p.loaded<0||p.loaded>firearm.magazine||
        p.loaded>p.charges||p.reloadRemaining<0||
         p.reloadRemaining>firearm.reloadSeconds+(modern?Sim.RELOAD_HESITATION_SECONDS:0)||
        (p.reloadRemaining>0&&(p.charges<=p.loaded||p.loaded===firearm.magazine))))||
      p.pitch<-.34||p.pitch>.36||
      Math.abs(p.yaw)>1e7||Sim.blocked(p.x,p.z,.85,Sim.newMatch(20261027,0).obstacles))
      throw new RangeError('Invalid checkpoint world state');
    const c=data.combat;
    if(!c||typeof c!=='object'||Array.isArray(c)||
      ![5,6,7,8].includes(Object.keys(c).length)||
      Object.keys(c).some(k=>!['started','cleared','supportUsed','supplyUsed','supplyRemaining','nextPulseAt','drones','lastShotAt'].includes(k))||
      ['started','cleared','supportUsed','nextPulseAt','drones'].some(k=>!hasOwn(c,k))||
      ['started','cleared','supportUsed'].some(k=>typeof c[k]!=='boolean')||
      (hasOwn(c,'supplyUsed')&&typeof c.supplyUsed!=='boolean')||
      (hasOwn(c,'supplyRemaining')&&
        (!Number.isInteger(c.supplyRemaining)||c.supplyRemaining<0||
         c.supplyRemaining>12||
         (hasOwn(c,'supplyUsed')&&c.supplyUsed!==(c.supplyRemaining===0))))||
      !Number.isFinite(c.nextPulseAt)||c.nextPulseAt<0||c.nextPulseAt>86410||
      // A forged far-future hostile timer would make a resumed encounter
      // artificially harmless. The authored volley interval is three seconds.
      c.nextPulseAt>data.elapsed+3+1e-6||
      (hasOwn(c,'lastShotAt')&&(!Number.isFinite(c.lastShotAt)||c.lastShotAt< -2||c.lastShotAt>data.elapsed))||
      !Array.isArray(c.drones)||c.drones.length!==(c.started?3:0)||
      c.drones.some((b,i)=>!b||typeof b!=='object'||Array.isArray(b)||
        ![3,4,6,7,9,10].includes(Object.keys(b).length)||
        Object.keys(b).some(k=>!['id','health','alive','shots','x','z','angle','lastSeenX','lastSeenZ','investigateUntil'].includes(k))||
        b.id!==i||!Number.isFinite(b.health)||b.health<0||b.health>90||
        typeof b.alive!=='boolean'||b.alive!==(b.health>0)||
        (hasOwn(b,'shots')&&(!Number.isInteger(b.shots)||b.shots<0||b.shots>HOSTILE_ROUNDS))||
        (['x','z','angle'].some(k=>hasOwn(b,k))&&
          (['x','z','angle'].some(k=>!hasOwn(b,k)||!Number.isFinite(b[k]))||
           Math.hypot(b.x-HOSTILE_POSITIONS[i].x,b.z-HOSTILE_POSITIONS[i].z)>HOSTILE_CHASE_RADIUS+1e-6||
           Math.abs(b.angle)>Math.PI+1e-6))||
        (['lastSeenX','lastSeenZ','investigateUntil'].some(k=>hasOwn(b,k))&&
          (['lastSeenX','lastSeenZ','investigateUntil'].some(k=>!hasOwn(b,k)||!Number.isFinite(b[k]))||
           Math.abs(b.lastSeenX)>Sim.WORLD||Math.abs(b.lastSeenZ)>Sim.WORLD||
           b.investigateUntil<0||b.investigateUntil>data.elapsed+3+1e-6)))||
      (data.phase==='terminal'&&(c.started||c.cleared||c.supportUsed||c.supplyUsed===true||
        (hasOwn(c,'supplyRemaining')&&c.supplyRemaining!==12)||c.nextPulseAt!==0))||
      (data.phase!=='terminal'&&!c.started)||
      (['engagement','failed'].includes(data.phase)&&c.cleared)||
      // A checkpoint with no surviving opponents but no cleared transition
      // cannot ever unlock records. Reject it instead of restoring a soft-lock.
      (data.phase==='engagement'&&c.drones.length===3&&c.drones.every(b=>!b.alive))||
      (['records','decision','exit','complete'].includes(data.phase)&&!c.cleared)||
      (c.cleared&&c.drones.some(b=>b.alive))||
      (data.phase==='failed'&&p.health!==0)||
      (data.phase!=='failed'&&p.health===0))
      throw new RangeError('Invalid combat checkpoint');
    if((data.phase==='terminal'&&(data.found.length!==0||data.choice!==null))||
      ((data.phase==='records'||data.phase==='decision')&&data.choice!==null)||
      ((data.phase==='exit'||data.phase==='complete')&&!['evacuation','verification'].includes(data.choice))||
      (data.choice==='verification'&&data.found.length!==2)||
      // A saved verified completion must follow actual clearance, not precede it.
      (data.phase==='complete'&&data.choice==='verification'&&hasOwn(data,'gateReadyAt')&&
        data.elapsed+1e-6<data.gateReadyAt))
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
    const weaponId=hasOwn(data.player,'weaponId')?data.player.weaponId:'carbine';
    const state=createState(weaponId);
    state.phase=data.phase;state.found=data.found.slice();state.choice=data.choice;
    // Older verification saves already had an open route.
    state.gateReadyAt=hasOwn(data,'gateReadyAt')?data.gateReadyAt:0;
    for(const key of ['x','z','yaw','pitch','stamina','health','charges'])state.world.player[key]=data.player[key];
    // Older v2 checkpoints have no magazine metadata; total saved rounds stay finite.
    state.world.player.loaded=hasOwn(data.player,'loaded')?data.player.loaded:Math.min(Sim.FIREARMS[weaponId].magazine,data.player.charges);
    state.world.player.reloadRemaining=hasOwn(data.player,'reloadRemaining')?data.player.reloadRemaining:0;
    state.world.player.stress=hasOwn(data.player,'stress')?data.player.stress:0;
    state.world.player.reloadAssist=hasOwn(data.player,'reloadAssist')?data.player.reloadAssist:false;
    state.world.player.reloadHesitation=hasOwn(data.player,'reloadHesitation')?data.player.reloadHesitation:false;
    // Older v2 checkpoints lack fatigue lockout; never grant an exhausted save a free sprint.
    state.world.player.sprintExhausted=hasOwn(data.player,'sprintExhausted')
      ?data.player.sprintExhausted:data.player.stamina<=1;
    state.combat={started:data.combat.started,cleared:data.combat.cleared,
      supportUsed:data.combat.supportUsed,
      // Preserve stable checkpoint field ordering for byte-for-byte 60Hz replay.
      supplyUsed:hasOwn(data.combat,'supplyRemaining')
        ?data.combat.supplyRemaining===0:!!data.combat.supplyUsed,
      supplyRemaining:hasOwn(data.combat,'supplyRemaining')?data.combat.supplyRemaining:
        (data.combat.supplyUsed?0:12),
      nextPulseAt:data.combat.nextPulseAt};
    state.world.bots=data.combat.drones.map((b,i)=>({...makeHostiles()[i],health:b.health,alive:b.alive,shots:hasOwn(b,'shots')?b.shots:0,
      ...(hasOwn(b,'x')?{x:b.x,z:b.z,angle:b.angle}:{}),
      ...(hasOwn(b,'investigateUntil')?{lastSeenX:b.lastSeenX,lastSeenZ:b.lastSeenZ,
        investigateUntil:b.investigateUntil}:{})}));
    // Older v2 checkpoints omitted the previous shot time. For an active encounter,
    // conservatively resume its cooldown rather than granting a free instant shot.
    state.world.lastTagAt=hasOwn(data.combat,'lastShotAt')?data.combat.lastShotAt:
      (data.phase==='engagement'?data.elapsed:-2);
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
    VERSION,POINTS,RECORDS,INTERACT_RADIUS,GATE_CLEARANCE_SECONDS,createState,step,markers,nearest,interact,fire,support,choose,
    objective,situation,debrief,backToRecords,serialize,restore,validateSnapshot
  });
});
