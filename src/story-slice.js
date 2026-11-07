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
  // A finite ten-minute prototype headlamp battery, advanced by fixed 60Hz steps.
  const HEADLAMP_TICKS = 10 * 60 * 60;
  const HOSTILE_POSITIONS = Object.freeze([{x:0,z:-28},{x:15,z:-34},{x:-15,z:-34}]);
  const HOSTILE_ROUNDS = 12;
  const HOSTILE_BODY_RADIUS = .75; // Same authored radius as hostile movement collision.
  const HOSTILE_ALERT_RANGE = 42, HOSTILE_CHASE_RADIUS = 6, HOSTILE_TURN_RATE = 1.4;
  const GATE_CLEARANCE_SECONDS = 8;
  // Original, motorized sliding checkpoint gate. Its geometry moves at fixed-step
  // speed after the local aid coordinator approves clearance; it never vanishes.
  const EAST_CHECKPOINT = Object.freeze({x:27,z:-53,w:12,d:.6,h:2.5,type:'gate',routeId:'east-checkpoint'});
  const GATE_TRAVEL = -12;
  // Authored, original harbor district shells. Each visible building/container
  // has the same footprint in the 60Hz collision world and the WebGL scene.
  // Keep the playable relay, evidence and two exits unobstructed.
  const STORY_STRUCTURES = Object.freeze([
    {x:-42,z:-38,w:15,d:20,h:8,type:'story-building'},
    {x:42,z:-38,w:16,d:20,h:9,type:'story-building'},
    {x:-44,z:-73,w:20,d:12,h:6,type:'story-warehouse'},
    {x:47,z:-77,w:18,d:15,h:7,type:'story-warehouse'},
    {x:-63,z:-53,w:12,d:3,h:2.6,type:'story-container'},
    {x:64,z:-53,w:12,d:3,h:2.6,type:'story-container'},
    {x:79,z:-81,w:5,d:5,h:14,type:'story-crane'},
    {x:55,z:-9,w:12,d:14,h:7,type:'story-building'},
    // A grounded local records counter: visible geometry matches fixed collision.
    {x:18,z:-42.9,w:1.6,d:.8,h:1.05,type:'story-desk'}
  ]);
  const GATE_SAFETY_RADIUS = .95; // Player body radius .85 + 10 cm motion buffer.
  const GUIDE_START=Object.freeze({x:-10.5,z:-55}); // Waiting civilian aid coordinator.
  function makeHostiles(disabled=false) {
    return HOSTILE_POSITIONS.map((p,id)=>({id,x:p.x,z:p.z,health:disabled?0:90,
      alive:!disabled,angle:Math.PI,moveTime:999,actionTime:999,skill:0,
      shots:disabled?HOSTILE_ROUNDS:0,lastSeenX:p.x,lastSeenZ:p.z,investigateUntil:0}));
  }
  const INTERACT_RADIUS = 4;
  const SUPPLY_REACH = 1.8; // Physical cache reach; larger radius remains for terminals/route triggers.
  const SWITCH_REACH = 1.1; // Reach the facade switch, not a remote 4m HUD activation.
  const POINTS = Object.freeze({
    terminal: Object.freeze({id:'terminal', x:0, z:-18, kind:'objective', label:'시민 중계기'}),
    supply: Object.freeze({id:'supply', x:5, z:-20, kind:'ammo', label:'현지 구조단 유한 보급 상자'}),
    recordA: Object.freeze({id:'recordA', x:17, z:-30, kind:'evidence', label:'항구 기록'}),
    recordB: Object.freeze({id:'recordB', x:-17, z:-30, kind:'evidence', label:'대피소 기록'}),
    decision: Object.freeze({id:'decision', x:0, z:-41, kind:'objective', label:'교차 확인 콘솔'}),
    relay: Object.freeze({id:'relay', x:8, z:-42, kind:'objective', label:'비상 통신 중계기 전원'}),
    beacon: Object.freeze({id:'beacon', x:-42, z:-27, kind:'objective', label:'항구 대피 안내 경고등 수동 스위치'}),
    evacPlan: Object.freeze({id:'evacPlan', x:-18, z:-47, kind:'evidence', label:'현지 구조단 남쪽 대피 계획 안내판'}),
    muster: Object.freeze({id:'muster', x:-9, z:-55, kind:'evidence', label:'현지 구조단 대피 인원 확인표'}),
    guide: Object.freeze({id:'guide', x:-9, z:-55, kind:'evac', label:'현지 대피 안내원과 동행 시작'}),
    guideRelease: Object.freeze({id:'guideRelease', x:-9, z:-55, kind:'evac', label:'현지 구조단에 안내원 동행 인계'}),
    guideTransfer: Object.freeze({id:'guideTransfer', x:-12, z:-60, kind:'evac', label:'남쪽 현지 구조단 안내원 인계'}),
    aidPickup: Object.freeze({id:'aidPickup', x:-7, z:-47, kind:'objective', label:'민간 구조용 비상 물품 상자'}),
    aidDrop: Object.freeze({id:'aidDrop', x:-12, z:-60, kind:'evac', label:'현지 구조단 비상 물품 인계 지점'}),
    aidStage: Object.freeze({id:'aidStage', x:-7, z:-55, kind:'objective', label:'민간 비상 물품 임시 적재대'}),
    aidResume: Object.freeze({id:'aidResume', x:-7, z:-55, kind:'objective', label:'임시 적재된 민간 비상 물품'}),
    exitEvac: Object.freeze({id:'exitEvac', x:0, z:-61, kind:'evac', label:'안전한 안뜰'}),
    exitVerify: Object.freeze({id:'exitVerify', x:27, z:-61, kind:'verify', label:'추가 확인 경로'}),
    gateLog: Object.freeze({id:'gateLog', x:27, z:-66, kind:'evidence', label:'동쪽 현장 중계 기록함'}),
    reportDesk: Object.freeze({id:'reportDesk', x:18, z:-45, kind:'evidence', label:'현지 통제소 기록 접수대'})
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
    world.scene='nahrin';
    // BR's newly authored service-yard barrier exists only in the BR map.
    // CH01 has its own independent harbor checkpoint and authored route.
    world.obstacles=world.obstacles.filter(o=>o.type!=='yard-gate'&&o.type!=='yard-fence'&&!o.type.startsWith('dock-'));
    world.obstacles.push(...STORY_STRUCTURES.map(o=>({...o})));
    return world;
  }
  function gateOpen(state) {
    return state.choice==='verification' && state.world.elapsed>=state.gateReadyAt;
  }
  function gateGeometry(state) {
    // An optional, physically restored radio link allows the local coordinator
    // to begin a shorter clearance cycle; the gate still travels over time.
    const duration=state.gateClearanceDuration;
    const fraction=state.choice==='verification'
      ?clamp((state.world.elapsed-state.gateReadyAt+duration)/duration,0,1):0;
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
    // The closest edge is not necessarily navigable: a legacy save may
    // overlap a neighboring solid object. Test both exits against the live
    // collision world before moving the player.
    // Legacy saves may be wedged between the sliding gate and later-added
    // scenery. Search both perpendicular sides AND the gate's short ends,
    // including clear corners, before rejecting an otherwise valid checkpoint.
    // This is load-time recovery only; normal 60Hz locomotion never teleports.
    const west=gate.x-gate.w/2-1,east=gate.x+gate.w/2+1;
    const candidates=[
      {x:p.x,z:north},{x:p.x,z:south},
      {x:west,z:p.z},{x:east,z:p.z},
      {x:west,z:north},{x:east,z:north},
      {x:west,z:south},{x:east,z:south}
    ].filter(q=>!Sim.blocked(q.x,q.z,.85,state.world.obstacles))
      .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-
        Math.hypot(b.x-p.x,b.z-p.z));
    // Do not silently return a restored checkpoint with the player's body
    // trapped in a solid barrier. Let the recovery layer try a known-good
    // previous generation instead.
    // Dense legacy checkpoints can have scenery blocking all gate-edge exits.
    // Search a bounded local ring before rejecting a recoverable offline save.
    // Every candidate is checked against the complete live collision world.
    if(!candidates.length){
      for(let radius=2;radius<=32 && !candidates.length;radius+=2){
        for(let i=0;i<16;i++){
          const angle=i*Math.PI/8;
          const q={x:p.x+radius*Math.cos(angle),z:p.z+radius*Math.sin(angle)};
          if(!Sim.blocked(q.x,q.z,.85,state.world.obstacles))candidates.push(q);
        }
      }
      candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-
        Math.hypot(b.x-p.x,b.z-p.z));
    }
    if(!candidates.length)throw new RangeError('No collision-free gate checkpoint recovery');
    p.x=candidates[0].x;p.z=candidates[0].z;
    return true;
  }
  function recoverSceneOverlap(state) {
    // Legacy checkpoints can overlap several newly authored solids at once.
    // Recover only at load time, with deterministic bounded candidates.
    const p=state.world.player;
    const structures=state.world.obstacles.filter(o=>o.type&&o.type.startsWith('story-'));
    if(!structures.some(o=>Sim.blocked(p.x,p.z,.85,[o])))return false;
    const original={x:p.x,z:p.z},candidates=[];
    for(const building of structures){
      if(!Sim.blocked(original.x,original.z,.85,[building]))continue;
      // Use clearance greater than the player radius; test every candidate
      // against the complete collision world, not just the first structure.
      const edge=1;
      for(const pos of [
        {x:building.x-building.w/2-edge,z:original.z},
        {x:building.x+building.w/2+edge,z:original.z},
        {x:original.x,z:building.z-building.d/2-edge},
        {x:original.x,z:building.z+building.d/2+edge},
        {x:building.x-building.w/2-edge,z:building.z-building.d/2-edge},
        {x:building.x+building.w/2+edge,z:building.z-building.d/2-edge},
        {x:building.x-building.w/2-edge,z:building.z+building.d/2+edge},
        {x:building.x+building.w/2+edge,z:building.z+building.d/2+edge}
      ])if(!Sim.blocked(pos.x,pos.z,.85,state.world.obstacles))candidates.push(pos);
    }
    // A legacy checkpoint may sit inside a dense cluster where every immediate
    // building-edge candidate intersects a second solid. Expand in bounded,
    // deterministic rings around the saved location, validating against the
    // entire world, rather than rejecting a recoverable offline save.
    if(!candidates.length){
      for(let radius=2;radius<=32 && !candidates.length;radius+=2){
        for(let i=0;i<16;i++){
          const angle=i*Math.PI/8;
          const pos={x:original.x+radius*Math.cos(angle),z:original.z+radius*Math.sin(angle)};
          if(!Sim.blocked(pos.x,pos.z,.85,state.world.obstacles))candidates.push(pos);
        }
      }
    }
    if(!candidates.length)throw new RangeError('No safe harbor checkpoint recovery');
    candidates.sort((a,b)=>Math.hypot(a.x-original.x,a.z-original.z)-
      Math.hypot(b.x-original.x,b.z-original.z));
    p.x=candidates[0].x;p.z=candidates[0].z;
    return true;
  }
  function recoverActorOverlap(state) {
    // Historic v2 saves can predate standing-body collision. Resolve only on
    // restore; never teleport an actor during live 60Hz gameplay. Keep the
    // nearest collision-free adjacent position, with deterministic tie order.
    if(state.phase!=='engagement')return false;
    const p=state.world.player;
    const living=state.world.bots.filter(b=>b.alive);
    const bodies=living.map(b=>({x:b.x,z:b.z,w:HOSTILE_BODY_RADIUS*2,d:HOSTILE_BODY_RADIUS*2}));
    if(!Sim.blocked(p.x,p.z,.85,bodies))return false;
    const distance=HOSTILE_BODY_RADIUS+.85+.05;
    const candidates=living.flatMap(b=>[
      {x:b.x,z:b.z+distance},{x:b.x,z:b.z-distance},
      {x:b.x+distance,z:b.z},{x:b.x-distance,z:b.z}
    ]);
    const safe=candidates.filter(pos=>!Sim.blocked(pos.x,pos.z,.85,
      state.world.obstacles.concat(bodies)));
    // Adjacent cardinal positions can all be blocked by nearby harbor scenery.
    // Fall back to a deterministic bounded ring, checking every living actor
    // and static obstacle. This runs only when loading legacy checkpoints.
    if(!safe.length){
      // Match the bounded 32m scenery recovery horizon: a dense harbor
      // checkpoint can obstruct the first eight meters without being lost.
      for(let radius=2;radius<=32;radius+=2){
        for(let i=0;i<16;i++){
          const angle=i*Math.PI/8;
          const pos={x:p.x+radius*Math.cos(angle),z:p.z+radius*Math.sin(angle)};
          if(!Sim.blocked(pos.x,pos.z,.85,state.world.obstacles.concat(bodies)))safe.push(pos);
        }
        if(safe.length)break;
      }
    }
    if(!safe.length)throw new RangeError('No collision-free story checkpoint recovery');
    safe.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
    p.x=safe[0].x;p.z=safe[0].z;
    return true;
  }
  function recoverGuideSceneryOverlap(state) {
    // Historical escort checkpoints may predate a newly authored solid harbor
    // object. Resolve an actively following/waiting guide once on load, never
    // during 60Hz gameplay; the normal collision and follow rules still apply.
    if(state.phase!=='exit'||state.choice!=='evacuation'||
       !state.guide.active||state.guide.arrived||state.guide.released)return false;
    const g=state.guide,p=state.world.player;
    if(!Sim.blocked(g.x,g.z,.55,state.world.obstacles))return false;
    const occupied=state.world.obstacles.concat(actorBlockers(state),
      [{x:p.x,z:p.z,w:1.7,d:1.7}]);
    const directions=[
      [0,-1],[0,1],[-1,0],[1,0],
      [-Math.SQRT1_2,-Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],
      [-Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,Math.SQRT1_2]
    ];
    const candidates=[];
    // Historical saves may place the guide inside a now-solid large harbor
    // structure. Expand only during checkpoint load, never in 60Hz gameplay.
    // Every candidate stays in the authored 19m evacuation district.
    for(const radius of [1,1.6,2.2,3,4,5,6,7.5,9,11,13]){
      for(const [dx,dz] of directions){
        const next={x:g.x+dx*radius,z:g.z+dz*radius};
        if(Math.hypot(next.x-GUIDE_START.x,next.z-GUIDE_START.z)>19||
           Sim.blocked(next.x,next.z,.55,occupied))continue;
        candidates.push(next);
      }
      // The first safe ring is the smallest permitted displacement; do
      // not roam farther once a physically clear local placement exists.
      if(candidates.length)break;
    }
    if(!candidates.length)throw new RangeError('No collision-free escort guide checkpoint recovery');
    candidates.sort((a,b)=>
      Math.hypot(a.x-g.x,a.z-g.z)-Math.hypot(b.x-g.x,b.z-g.z)||
      Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
    g.x=candidates[0].x;g.z=candidates[0].z;
    return true;
  }
  function recoverEscortOverlap(state) {
    // Some older checkpoints can restore the captain exactly on top of the
    // optional guide. Separate these two physical bodies once, at load time;
    // live 60Hz movement never teleports either actor.
    if(state.phase!=='exit'||state.choice!=='evacuation'||
       !state.musterConfirmed)return false;
    // The companion remains a solid world actor after physical courtyard
    // arrival and after a staffed handoff. Old saves can overlap this body
    // in any of those states, not only while an escort is still following.
    const p=state.world.player,g=state.guide;
    const guideBody={x:g.x,z:g.z,w:1.1,d:1.1};
    if(!Sim.blocked(p.x,p.z,.85,[guideBody]))return false;
    const original={x:p.x,z:p.z};
    const offsets=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0},
      {x:-.7071067811865476,z:-.7071067811865476},
      {x:.7071067811865476,z:-.7071067811865476},
      {x:-.7071067811865476,z:.7071067811865476},
      {x:.7071067811865476,z:.7071067811865476}];
    const occupied=state.world.obstacles.concat(actorBlockers(state),[guideBody]);
    const candidates=[];
    for(const radius of [1.7,2.3,3]){
      for(const offset of offsets){
        const q={x:g.x+offset.x*radius,z:g.z+offset.z*radius};
        if(Sim.blocked(q.x,q.z,.85,occupied)||
           Sim.lineBlocked(g.x,g.z,q.x,q.z,state.world.obstacles))continue;
        candidates.push(q);
      }
    }
    // A legacy overlap beside newly added harbor scenery can block every
    // immediate 1.7-3m placement. Search a bounded local ring before
    // discarding an otherwise valid offline checkpoint. Never move the guide,
    // and never place the captain inside scenery or through a solid wall.
    if(!candidates.length){
      for(let radius=3.5;radius<=12&&!candidates.length;radius+=.5){
        for(let i=0;i<32;i++){
          const angle=i*Math.PI/16;
          const q={x:g.x+Math.cos(angle)*radius,z:g.z+Math.sin(angle)*radius};
          if(Sim.blocked(q.x,q.z,.85,occupied)||
             Sim.lineBlocked(g.x,g.z,q.x,q.z,state.world.obstacles))continue;
          candidates.push(q);
        }
      }
    }
    if(!candidates.length)throw new RangeError('No collision-free escort checkpoint recovery');
    candidates.sort((a,b)=>
      Math.hypot(a.x-original.x,a.z-original.z)-
      Math.hypot(b.x-original.x,b.z-original.z));
    p.x=candidates[0].x;p.z=candidates[0].z;
    return true;
  }
  function createState(weaponId='carbine') {
    const state={version:VERSION,phase:'terminal',found:[],choice:null,relayRestored:false,beaconEnabled:false,flashlightOn:false,flashlightTicks:HEADLAMP_TICKS,gateLogReviewed:false,logHandedOff:false,musterConfirmed:false,planReviewed:false,
      aidPickedUp:false,aidDelivered:false,aidStaged:false,guide:{active:false,arrived:false,released:false,waiting:false,x:GUIDE_START.x,z:GUIDE_START.z},gateReadyAt:0,gateClearanceDuration:GATE_CLEARANCE_SECONDS,gateObstructed:false,world:createWorld(weaponId),
      combat:{started:false,cleared:false,supportUsed:false,supplyUsed:false,supplyRemaining:12,nextPulseAt:0},
      subtitle:'마라(기술자): 이 대위님, 현지 대피 지원 요청으로 승인된 임무예요. 통로 개방은 유수프 구조단이 결정하고, 국정원 보고는 현장 확인 전 참고자료예요.',message:'CH01 / 마지막 방송 · 제한적 대피 지원'};
    state.world.carryingAid=false;state.world.aidStaged=false;
    state.world.aidPickedUp=false;state.world.aidDelivered=false;
    syncRoute(state);syncMarkers(state);
    return state;
  }
  // A fixed facade-mounted warning light requires restored local power and
  // a separately reached manual switch; it never reveals unseen actors.
  function warningMarkers(state) {
    return state.relayRestored?[POINTS.beacon]:[];
  }
  function markers(state) {
    if (state.phase==='terminal') return [POINTS.terminal];
    if (state.phase==='engagement') return state.combat.supplyRemaining===0?[]:[POINTS.supply];
    if (state.phase==='records'||state.phase==='decision') return [
      ...(['recordA','recordB'].filter(id=>!state.found.includes(id)).map(id=>POINTS[id])),
      POINTS.decision,
      ...(!state.relayRestored||state.phase==='decision'?[POINTS.relay]:[]),
      ...warningMarkers(state),
      ...(state.combat.supplyRemaining>0?[POINTS.supply]:[])
    ];
    if (state.phase==='exit') return state.choice==='verification'
      ?[POINTS.exitVerify,...(state.combat.supplyRemaining>0?[POINTS.supply]:[]),...(!state.gateLogReviewed?[POINTS.decision]:[]),...(gateOpen(state)&&!state.gateLogReviewed?[POINTS.gateLog]:[]),
         ...(state.gateLogReviewed&&!state.logHandedOff?[POINTS.reportDesk]:[]),...warningMarkers(state),POINTS.relay]:
      [POINTS.exitEvac,...(state.combat.supplyRemaining>0?[POINTS.supply]:[]),...(!state.aidPickedUp&&!state.musterConfirmed&&state.found.length===2?[POINTS.decision]:[]),...(state.musterConfirmed?[]:[POINTS.muster]),
         ...(state.planReviewed?[]:[POINTS.evacPlan]),
        ...(state.musterConfirmed&&!state.guide.active&&!state.guide.released?[POINTS.guide]:[]),
        ...(state.guide.active&&!state.guide.arrived?[POINTS.guideRelease,POINTS.guideTransfer]:[]),
         // Companion control is an observed, local objective — never a hidden
         // moving marker on the map when the civilian is beyond visible range.
         ...(state.guide.active&&!state.guide.arrived&&
            Math.hypot(state.guide.x-state.world.player.x,state.guide.z-state.world.player.z)<7&&
            !Sim.lineBlocked(state.guide.x,state.guide.z,
              state.world.player.x,state.world.player.z,state.world.obstacles)
            ?[{id:'guideControl',x:state.guide.x,z:state.guide.z,kind:'evac',
              label:state.guide.waiting?'안내원 동행 재개':'안내원 현장 대기 지시'}]:[]),
        ...(!state.aidPickedUp?[POINTS.aidPickup]:[]),
        ...(state.aidPickedUp&&!state.aidDelivered?(state.aidStaged?[POINTS.aidResume]:[POINTS.aidStage,POINTS.aidDrop]):[]),...warningMarkers(state),POINTS.relay];
    return [];
  }
  function syncMarkers(state) {
    // Renderer consumes the same saved physical relay state as mission rules.
    state.world.guide=state.choice==='evacuation'?state.guide:null;
    state.world.relayRestored=state.relayRestored;
    state.world.beaconEnabled=state.beaconEnabled;
    state.world.flashlightOn=state.flashlightOn;
    state.world.flashlightTicks=state.flashlightTicks;
    state.world.gateLogReviewed=state.gateLogReviewed;
    state.world.logHandedOff=state.logHandedOff;
    // Preserve the authored marker identity separately from the renderer's
    // numeric id: two objectives can share the same kind and list length while
    // referring to different physical locations (e.g. aid pickup vs resume).
    state.world.loot=markers(state).map((p,i)=>({id:i,markerId:p.id,x:p.x,z:p.z,kind:p.kind,picked:false}));
    return state;
  }
  function refreshEscortWorldMarker(state) {
    // The guide may advance 60 times per second while PC rendering runs at
    // 165 Hz. Recreating every static 3D marker for each centimetre of movement
    // allocates a new array and new entities throughout the escort. Instead,
    // mutate only the observed companion marker, keeping renderer references
    // stable across fixed ticks. Rebuild on visibility or list changes.
    if(state.phase!=='exit'||state.choice!=='evacuation'||!state.guide.active)return;
    const visible=markers(state),rendered=state.world.loot;
    if(!Array.isArray(rendered)||rendered.length!==visible.length||
       visible.some((marker,i)=>!rendered[i]||rendered[i].kind!==marker.kind||
         rendered[i].markerId!==marker.id)){
      syncMarkers(state);
      return;
    }
    const guideIndex=visible.findIndex(marker=>marker.id==='guideControl');
    if(guideIndex<0)return;
    const guideMarker=rendered[guideIndex];
    if(guideMarker.x!==state.guide.x||guideMarker.z!==state.guide.z){
      guideMarker.x=state.guide.x;
      guideMarker.z=state.guide.z;
    }
  }
  function actorBlockers(state,except=null) {
    // Temporary AABB proxies keep the first-person controller from passing through
    // standing opponents. Ignore already-overlapping actors so legacy saves can escape.
    return state.world.bots.filter(b=>b.alive&&b!==except)
      .map(b=>({x:b.x,z:b.z,w:HOSTILE_BODY_RADIUS*2,d:HOSTILE_BODY_RADIUS*2}));
  }
  // CH01 shares one sight rule between movement AI and gunfire evidence.
  // A shot is audible behind cover, but only a directly observed player
  // yields an exact location; hearing alone retains a coarse estimate.
  function canSeePlayer(state,hostile) {
    const p=state.world.player;
    const dx=p.x-hostile.x,dz=p.z-hostile.z,distance=Math.hypot(dx,dz);
    // An illuminated headlamp is easier to observe from the same human field
    // of view, but never bypasses walls or grants an all-direction sensor.
    const sightRange=state.flashlightOn&&state.flashlightTicks>0?54:HOSTILE_ALERT_RANGE;
    if(distance<.001||distance>sightRange)return false;
    // CH01 uses the same bounded three-point standing silhouette as BR.
    // An exposed shoulder can be observed beside cover, but neither a wall
    // nor another standing person may reveal a completely concealed player.
    // This is a finite 2D visibility proxy, not an aim or damage shortcut.
    const sideX=-dz/distance*.85*.8,sideZ=dx/distance*.85*.8;
    const blockers=state.world.obstacles.concat(actorBlockers(state,hostile));
    const visible=(x,z)=>{
      const vx=x-hostile.x,vz=z-hostile.z,range=Math.hypot(vx,vz);
      if(range>sightRange||
        Sim.lineBlocked(hostile.x,hostile.z,x,z,blockers))return false;
      const bearing=Math.atan2(vx,-vz);
      const delta=Math.atan2(Math.sin(bearing-hostile.angle),Math.cos(bearing-hostile.angle));
      return Math.abs(delta)<=1.1;
    };
    return visible(p.x,p.z)||visible(p.x+sideX,p.z+sideZ)||
      visible(p.x-sideX,p.z-sideZ);
  }
  function nearest(state) {
    const p=state.world.player;
    let candidate=null,best=INTERACT_RADIUS,bestPriority=-1;
    for(const marker of markers(state)){
      const d=Math.hypot(marker.x-p.x,marker.z-p.z);
      // The coordinator's fixed desk is not a remote release button:
      // returning the guide requires arm's-reach contact with BOTH staff and
      // the actual civilian, with a clear path to each. The local E prompt
      // uses the same rule, preventing a misleading interaction HUD.
      const guideInReach=!['guideRelease','guideTransfer'].includes(marker.id)||(
        Math.hypot(state.guide.x-p.x,state.guide.z-p.z)<2.1&&
        (marker.id!=='guideTransfer'||
          Math.hypot(state.guide.x-POINTS.guideTransfer.x,
            state.guide.z-POINTS.guideTransfer.z)<2.1)&&
        !Sim.lineBlocked(p.x,p.z,state.guide.x,state.guide.z,state.world.obstacles)&&
        // A physical handoff requires the guide to reach the actual desk,
        // not just stand near a player who can see through another opening.
        !Sim.lineBlocked(state.guide.x,state.guide.z,
          marker.x,marker.z,state.world.obstacles));
      // At a staffed desk, the physically reached handoff must win E over
      // the nearby guide's pause/resume marker. Otherwise standing shoulder
      // to shoulder with the guide can make an authorized handoff unreachable
      // from the interaction HUD. Distance and cover checks are unchanged.
      const priority=marker.id==='guideRelease'||marker.id==='guideTransfer'?1:0;
      // A nearby objective is not reachable through solid cover, a closed gate,
      // or a building wall. The same test governs the HUD prompt and E/touch input.
      if(guideInReach&&(priority>bestPriority||(priority===bestPriority&&d<best))&&
        d<(marker.id==='beacon'?SWITCH_REACH:
          marker.id==='guideControl'||marker.id==='guideRelease'||marker.id==='guideTransfer'?SUPPLY_REACH:
          marker.kind==='ammo'?SUPPLY_REACH:INTERACT_RADIUS)&&
        !Sim.lineBlocked(p.x,p.z,marker.x,marker.z,state.world.obstacles)){
        best=d;bestPriority=priority;candidate=marker;
      }
    }
    return candidate;
  }
  // A nearby civilian can walk around a visible harbor obstacle instead of
  // becoming permanently stuck whenever the player rounds a corner. Use only
  // real geometry, short local detours and the same physical collision rules.
  // The waypoint is derived every fixed tick, so it does not alter v2 saves.
  function guideBodyPathBlocked(guide,player,obstacles) {
    // Shared by the fixed-step controller and visible PC mission HUD.
    const corridor=obstacles.map(o=>({...o,w:o.w+1.1,d:o.d+1.1}));
    return Sim.lineBlocked(guide.x,guide.z,player.x,player.z,corridor);
  }
  function guideDetour(state,guide,player) {
    // A bounded local visibility graph can pass more than one solid container.
    // Unlike the old one-corner choice, it does not assume the first corner
    // already has a clear line to the player. It contains no remote actor data.
    const near=state.world.obstacles.filter(wall=>
      Number.isFinite(wall.x)&&Number.isFinite(wall.z)&&
      Number.isFinite(wall.w)&&Number.isFinite(wall.d)&&wall.w>0&&wall.d>0&&
      Math.abs(wall.x-(guide.x+player.x)/2)<wall.w/2+7&&
      Math.abs(wall.z-(guide.z+player.z)/2)<wall.d/2+7)
      .map((wall,index)=>({
        wall,index,
        // Relevant route blockers must not be displaced from the limited
        // local graph by unrelated scenery listed earlier in the world.
        crosses:Sim.lineBlocked(guide.x,guide.z,player.x,player.z,
          [{...wall,w:wall.w+1.1,d:wall.d+1.1}]),
        distance:Math.hypot(wall.x-(guide.x+player.x)/2,
          wall.z-(guide.z+player.z)/2)
      }))
      .sort((a,b)=>Number(b.crosses)-Number(a.crosses)||
        a.distance-b.distance||a.index-b.index)
      .slice(0,12).map(entry=>entry.wall);
    // The margin leaves clearance for the civilian's collision radius.
    const clearance=.55+.3;
    const bodyMargin=.55;
    // Corner nodes are selected from the nearest blockers to bound the 60Hz
    // path search, but EVERY proposed walking edge must respect the entire
    // physical world. An obstacle omitted from the 12-node candidate shortlist
    // can still intersect a detour segment; otherwise the guide repeatedly
    // chooses an impossible waypoint and appears permanently stuck.
    const blockers=state.world.obstacles.filter(wall=>
      Number.isFinite(wall.x)&&Number.isFinite(wall.z)&&
      Number.isFinite(wall.w)&&Number.isFinite(wall.d)&&wall.w>0&&wall.d>0)
      .map(wall=>({...wall,w:wall.w+bodyMargin*2,d:wall.d+bodyMargin*2}));
    // A longer solid harbor wall can require a real walking route farther
    // than 12m beyond the straight-line gap. Keep the graph bounded while
    // allowing the guide to reach both ends instead of freezing behind it.
    const nodes=[{x:guide.x,z:guide.z}];
    for(const wall of near){
      for(const sx of [-1,1])for(const sz of [-1,1]){
        const target={x:wall.x+sx*(wall.w/2+clearance),
          z:wall.z+sz*(wall.d/2+clearance)};
        if(Math.min(Math.hypot(target.x-guide.x,target.z-guide.z),
           Math.hypot(target.x-player.x,target.z-player.z))>14||
           Sim.blocked(target.x,target.z,.55,state.world.obstacles))continue;
        nodes.push(target);
      }
    }
    const goal=nodes.length;
    nodes.push({x:player.x,z:player.z});
    const cost=Array(nodes.length).fill(Infinity),previous=Array(nodes.length).fill(-1);
    const visited=Array(nodes.length).fill(false);
    cost[0]=0;
    const clear=(a,b)=>!Sim.lineBlocked(a.x,a.z,b.x,b.z,blockers);
    for(let tick=0;tick<nodes.length;tick++){
      let current=-1;
      for(let i=0;i<nodes.length;i++)
        if(!visited[i]&&(current<0||cost[i]<cost[current]))current=i;
      if(current<0||!Number.isFinite(cost[current])||current===goal)break;
      visited[current]=true;
      for(let i=1;i<nodes.length;i++){
        if(i===current||visited[i]||!clear(nodes[current],nodes[i]))continue;
        const distance=Math.hypot(nodes[current].x-nodes[i].x,
          nodes[current].z-nodes[i].z);
        const next=cost[current]+distance;
        // A bounded physical walk around a long container is legitimate;
        // still reject paths beyond 36m rather than allow map-wide pursuit.
        // This relative bound is recalculated from live poses at each 60Hz tick.
        const direct=Math.hypot(guide.x-player.x,guide.z-player.z);
        if(next>Math.min(36,direct+16.5)||next>=cost[i]-1e-8)continue;
        cost[i]=next;previous[i]=current;
      }
    }
    if(!Number.isFinite(cost[goal]))return null;
    let first=goal;
    while(previous[first]>0)first=previous[first];
    return previous[first]===0&&first!==goal?nodes[first]:null;
  }
  function escortPaceAvailable(state) {
    // Only a locally observed, already-following civilian can set a walking
    // pace. A distant/occluded guide is not tracked or located by this HUD.
    if(state.phase!=='exit'||state.choice!=='evacuation'||
       !state.guide.active||state.guide.arrived||state.guide.released||
       state.guide.waiting)return false;
    const p=state.world.player,g=state.guide;
    return Math.hypot(g.x-p.x,g.z-p.z)<7&&
      !Sim.lineBlocked(p.x,p.z,g.x,g.z,state.world.obstacles);
  }
  function step(state, dt, input={}) {
    if(state.phase==='complete'||state.phase==='failed')return state;
    // A paused/invalid frame must never advance a hostile volley, route motor or RNG.
    if(!Number.isFinite(dt)||dt<=0)return state;
    const t=clamp(dt,0,.05),p=state.world.player;
    // Battery drain follows simulation time, never render FPS or background time.
    if(state.flashlightOn){
      const previousBattery=state.flashlightTicks;
      state.flashlightTicks=Math.max(0,state.flashlightTicks-Math.round(t*60));
      // The battery has a finite, player-readable warning before exhaustion.
      // Crossing the threshold (rather than polling below it) prevents repeated
      // subtitles and remains deterministic after a checkpoint restore.
      if(previousBattery>HEADLAMP_TICKS/10&&state.flashlightTicks<=HEADLAMP_TICKS/10){
        state.subtitle='이수혁 대위: 헤드램프 배터리 잔량이 약 10%입니다. 필요할 때만 사용하겠습니다.';
        state.message='헤드램프 배터리 부족 · 소등하면 잔량 보존';
      }
      if(state.flashlightTicks===0){
        state.flashlightOn=false;
        state.message='헤드램프 배터리 소진 · 추가 전원 없음';
      }
      state.world.flashlightOn=state.flashlightOn;
      state.world.flashlightTicks=state.flashlightTicks;
    }
    const wasGateOpen=gateOpen(state);
    let ix=Number(!!input.right)-Number(!!input.left);
    let iz=Number(!!input.forward)-Number(!!input.back);
    const len=Math.hypot(ix,iz)||1;ix/=len;iz/=len;
    // A bulky civilian supply crate occupies the player's hands. It is
    // physically carried to the aid team: no instant remote delivery or sprint.
    // Pressing Sprint while crouched must never drain running stamina. Near
    // the observed escort, crouch gives a deliberate, slower pace a civilian
    // can physically keep up with; ordinary crouch remains unchanged outside
    // the accepted, visible guide route.
    const sprint=!input.crouch&&!state.world.carryingAid&&Sim.canSprint(p,input,iz);
    const paced=!!input.crouch&&escortPaceAvailable(state);
    const speed=(input.crouch?(paced?1.6:3.1):sprint?9.5:6.1)*
      Sim.FIREARMS[p.weaponId].mobility*
      Sim.injuryMobility(p)*(state.world.carryingAid ? 0.72 : 1);
    const occupied=actorBlockers(state).filter(body=>!Sim.blocked(p.x,p.z,.85,[body]));
    // The guide remains a solid person while waiting at muster and after
    // the physical handoff, not an intangible prop when following stops.
    if(state.choice==='evacuation'&&state.musterConfirmed){
      const body={x:state.guide.x,z:state.guide.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
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
    // The optional local evacuation guide follows at walking speed, within
    // observation distance and through the same real harbor collision world.
    // Leaving the guide behind pauses the escort; no teleportation or map-wide
    // knowledge is used to manufacture an arrival.
    if(state.phase==='exit'&&state.choice==='evacuation'&&state.guide.active&&!state.guide.arrived&&!state.guide.waiting){
      const g=state.guide,dx=p.x-g.x,dz=p.z-g.z,range=Math.hypot(dx,dz);
      if(range>1.7&&range<14){
        // A long physical wall can increase separation beyond 11m while
        // the guide walks around its end. Permit a bounded 14m local
        // detour only when the corridor is obstructed, and keep the
        // ordinary 7m limit on clear open ground. No teleport or remote chase.
        const blocked=guideBodyPathBlocked(g,p,state.world.obstacles);
        const detour=blocked?guideDetour(state,g,p):null;
        // At the edge of a real wall the straight corridor becomes clear
        // before the guide is back within the ordinary 7m following radius.
        // Finish this locally bounded segment only while beside solid
        // scenery, without extending pursuit across open ground.
        const clearingDetour=!blocked&&range>=7&&range<14&&
          Sim.blocked(g.x,g.z,1.8,state.world.obstacles);
        const target=blocked?detour:((range<7||clearingDetour)?p:null);
        if(target){
          const vx=target.x-g.x,vz=target.z-g.z;
          const length=Math.hypot(vx,vz);
          const distance=Math.min(1.65*t,blocked?length:range-1.7);
          if(distance>1e-8&&length>1e-8)
            Sim.moveEntity(g,vx/length*distance/t,vz/length*distance/t,t,
              state.world.obstacles.concat([{x:p.x,z:p.z,w:1.7,d:1.7}]),.55);
        }
      }
      // Distance alone cannot certify an escorted arrival through a closed
      // wall or crate. Both actors must share the actual exit courtyard.
      // Use the same physical obstacles as movement, with no save-schema change.
      const exit=POINTS.exitEvac;
      if(Math.hypot(g.x-exit.x,g.z-exit.z)<2.4&&
         Math.hypot(p.x-exit.x,p.z-exit.z)<4&&
         !Sim.lineBlocked(g.x,g.z,exit.x,exit.z,state.world.obstacles)&&
         !Sim.lineBlocked(p.x,p.z,exit.x,exit.z,state.world.obstacles)){
        g.arrived=true;
        state.subtitle='유수프(현지 구조단): 안내원이 남쪽 안뜰에 직접 도착했어. 나머지 주민은 구조단이 인계할게.';
        state.message='현지 대피 안내원 안뜰 도착 · 동행 결과 기록';
      }
    }
    // Keep physical 3D E markers aligned with the actual guide location and
    // remove them as soon as the player loses direct observation. The mission
    // state and checkpoint schema are unchanged.
    refreshEscortWorldMarker(state);
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
        const tracking=canSeePlayer(state,hostile);
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
          if(Math.hypot(hostile.x+vx*t-anchor.x,hostile.z+vz*t-anchor.z)<=HOSTILE_CHASE_RADIUS+1e-8){
            const solids=state.world.obstacles.concat(actorBlockers(state,hostile),
              [{x:p.x,z:p.z,w:1.7,d:1.7}]);
            const startX=hostile.x,startZ=hostile.z;
            Sim.moveEntity(hostile,vx,vz,t,solids,HOSTILE_BODY_RADIUS);
            // When a solid harbor object blocks pursuit, try a short lateral
            // path instead of remaining stuck against its face. The alternate
            // step uses the SAME movement budget, solid geometry and authored
            // six-metre anchor radius; no knowledge of the player behind cover.
            if(Math.hypot(hostile.x-startX,hostile.z-startZ)<1e-8){
              const side=hostile.id%2===0?1:-1;
              for(const sign of [side,-side]){
                const sx=-vz*sign,sz=vx*sign;
                if(Math.hypot(startX+sx*t-anchor.x,startZ+sz*t-anchor.z)>HOSTILE_CHASE_RADIUS+1e-8)
                  continue;
                Sim.moveEntity(hostile,sx,sz,t,solids,HOSTILE_BODY_RADIUS);
                if(Math.hypot(hostile.x-startX,hostile.z-startZ)>1e-8)break;
              }
            }
          }
        }
      }
    }
    state.gateObstructed=false;
    if(state.phase==='exit'&&state.choice==='verification'&&!wasGateOpen){
      // A player standing in the gate's travel path pauses the mechanism instead
      // of being pushed, teleported, or passed through by an animated collider.
      const nextGate=gateGeometry(state);
      const currentGate=state.world.obstacles.find(o=>o.routeId==='east-checkpoint')||EAST_CHECKPOINT;
      // The whole motor travel is solid during this step, not just its final
      // footprint: a coarse catch-up frame must not sweep through the player.
      const sweptGate={...nextGate,x:(currentGate.x+nextGate.x)/2,
        w:nextGate.w+Math.abs(nextGate.x-currentGate.x)};
      if(Sim.blocked(p.x,p.z,GATE_SAFETY_RADIUS,[sweptGate])){
        state.gateObstructed=true;
        state.gateReadyAt+=t;
        state.subtitle='마라(기술자): 이동식 통제문이 접근자를 감지해 멈췄어. 문 이동 경로에서 벗어나 줘.';
        state.message='통제문 안전 정지 · 이동 경로를 비우세요';
      }
      syncRoute(state);
      if(gateOpen(state)){
        syncMarkers(state);
        state.subtitle='마라(기술자): 현지 구조단이 동쪽 통제문을 완전히 열었다고 확인했어. 이제 통과할 수 있어.';
        state.message='현지 구조단 확인 · 동쪽 통로 개방';
      }
    }
    if(state.phase==='engagement'&&state.world.elapsed>=state.combat.nextPulseAt){
      // Legacy checkpoint key nextPulseAt now schedules a grounded, finite hostile volley.
      state.combat.nextPulseAt=state.world.elapsed+3;
      for(const hostile of state.world.bots){
        if(!hostile.alive||hostile.shots>=HOSTILE_ROUNDS)continue;
        // A scheduled volley must reacquire the same bounded direct sight as
        // pursuit. The old 48m firing gate exceeded the 42m observation gate,
        // letting a hostile fire at a player it could not currently see.
        // Hearing or stale last-known positions can guide movement, not shots.
        if(!canSeePlayer(state,hostile))continue;
        const distance=Math.hypot(hostile.x-p.x,hostile.z-p.z);
        const bearing=Math.atan2(p.x-hostile.x,-(p.z-hostile.z));
        const facing=Math.atan2(Math.sin(bearing-hostile.angle),Math.cos(bearing-hostile.angle));
        if(Math.abs(facing)>1.1)continue; // No omniscient rear attacks.
        hostile.shots++;
        state.world.effects.push({x:hostile.x,z:hostile.z,t:0.28,type:'hostile'});
        // A shot follows a deterministic physical ray, not a post-fire
        // damage lottery. Range and actual movement increase bounded aim
        // instability. A miss spends a round and remains audible/visible.
        const shotSeed=(state.world.seed ^ Math.imul(hostile.id+1,0x9e3779b9) ^
          Math.imul(hostile.shots,0x85ebca6b))>>>0;
        const movedQuickly=t>0&&movedDistance/t>2.5;
        const spread=0.015+distance*0.0006+(movedQuickly?0.15:0);
        const shotAngle=bearing+Math.sin(Sim.rngFromSeed(shotSeed)()*2*Math.PI)*spread;
        const rayX=Math.sin(shotAngle),rayZ=-Math.cos(shotAngle);
        const toX=p.x-hostile.x,toZ=p.z-hostile.z;
        const forward=toX*rayX+toZ*rayZ;
        const lateral=Math.abs(toX*rayZ-toZ*rayX);
        if(forward>0&&lateral<0.85){
          const contact=forward-Math.sqrt(Math.max(0,0.85**2-lateral**2));
          if(contact>0&&contact<48&&
             !Sim.lineBlocked(hostile.x,hostile.z,
               hostile.x+rayX*contact,hostile.z+rayZ*contact,
               state.world.obstacles.concat(actorBlockers(state,hostile))))
            Sim.receiveDamage(state.world,4);
        }
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
  function fire(state,crouching=false) {
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
    const result=Sim.tag(state.world,crouching);
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
        const observed=canSeePlayer(state,hostile)?state.world.player:heard;
        hostile.lastSeenX=observed.x;hostile.lastSeenZ=observed.z;
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
        // BR's final-shot victory is not CH01 mission completion. The story
        // still requires player-led evidence, a route decision and an exit.
        // Keep the shared world live until the authored mission actually ends.
        state.world.status='playing';
        state.phase='records';state.combat.cleared=true;
        state.subtitle='조현지(국정원): 이 대위님의 현장 보고 확인했습니다. 중계 기록을 확인할 수 있어요.';
        state.message='안전 확보 · 기록 확인은 선택 사항';
        syncMarkers(state);
      }
    }
    return {...result,phase:state.phase,remaining:state.world.bots.filter(b=>b.alive).length};
  }
  // Preserve the mission's normal hit, subtitle and clearance transitions.
  function autoFire(state,held,crouching=false) {
    if(!held || !Sim.FIREARMS[state.world.player.weaponId]?.automatic)
      return {ok:false,reason:'manual_trigger'};
    return fire(state,crouching);
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
  function toggleFlashlight(state) {
    if(state.phase==='failed'||state.phase==='complete')return {ok:false,reason:'inactive'};
    if(state.flashlightTicks===0)return {ok:false,reason:'battery_empty'};
    state.flashlightOn=!state.flashlightOn;
    state.world.flashlightOn=state.flashlightOn;
    state.world.flashlightTicks=state.flashlightTicks;
    state.message=state.flashlightOn?'휴대 헤드램프 점등 · 설정된 키로 소등 가능':'휴대 헤드램프 소등 · 설정된 키로 점등 가능';
    return {ok:true,on:state.flashlightOn};
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
    }else if(marker.id==='supply'&&['engagement','records','decision','exit'].includes(state.phase)){
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
    }else if(marker.id==='relay'&&['records','decision','exit'].includes(state.phase)){
      // The local generator can be isolated before the route is approved.
      // This changes the subsequent authorization delay, but never retroactively
      // changes the motor cycle of an already approved east checkpoint.
      state.relayRestored=!state.relayRestored;
      if(!state.relayRestored)state.beaconEnabled=false;
      state.subtitle=state.relayRestored
        ?'마라(기술자): 현장 비상 전원을 연결했어. 통신과 수동 경고등이 복구됐어.'
        :'마라(기술자): 현장 전원을 분리했어. 경고등은 꺼지고 아직 요청하지 않은 통제문 준비에는 시간이 더 필요해.';
      state.message=state.relayRestored
        ?'현지 무전 복구 · 항구 벽등 점등 · 통제문 대기 8초 → 4초'
        :'현장 중계기 전원 차단 · 경고등 소등 · 신규 요청 8초';
    }else if(marker.id==='beacon'&&state.relayRestored&&
      ['records','decision','exit'].includes(state.phase)){
      // A reachable mechanical switch controls a powered warning fixture in
      // both directions. It never changes unseen actor knowledge or resources.
      state.beaconEnabled=!state.beaconEnabled;
      state.subtitle=state.beaconEnabled
        ?'유수프(현지 구조단): 항구 경고등 점등을 확인했어. 통로는 우리가 현장에서 계속 확인할게.'
        :'유수프(현지 구조단): 항구 경고등 소등을 확인했어. 필요하면 현장 스위치로 다시 켜 줘.';
      state.message=state.beaconEnabled
        ?'항구 경고등 수동 점등 · 현지 구조단에 현장 상태 공유'
        :'항구 경고등 수동 소등 · 현장 스위치로 재점등 가능';
    }else if(marker.id==='decision'&&state.phase==='records'){
      state.phase='decision';
      state.subtitle='마라(기술자): 유수프 구조단이 남쪽 대피 통로를 확보했어요. 동쪽 통로는 기록 두 건을 대조해야 현지 통제소에 개방을 요청할 수 있어요.';
      state.message='경로 선택 · 대피 우선은 언제나 선택할 수 있습니다.';
    }else if(marker.id==='decision'&&state.phase==='exit'){
      // A physical desk opens explicit choice UI: simply pressing E must never
      // silently change a route, clearance timer or saved consequences.
      if((state.choice==='evacuation'&&(state.aidPickedUp||state.musterConfirmed))||
         (state.choice==='verification'&&state.gateLogReviewed))
        return {ok:false,reason:'route_committed'};
      return {ok:true,event:'reconsider',phase:state.phase};
    }else if(marker.id==='aidPickup'&&state.phase==='exit'&&state.choice==='evacuation'&&!state.aidPickedUp){
      state.aidPickedUp=true;state.world.aidPickedUp=true;state.world.carryingAid=true;
      state.subtitle='유수프(현지 구조단): 민간 구조 물품을 직접 운반해 줘. 상자를 들고 있는 동안 뛰기는 어려워.';
      state.message='비상 물품 운반 중 · 남쪽 구조단 인계 지점으로 이동';
    }else if(marker.id==='aidStage'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.aidPickedUp&&!state.aidDelivered&&!state.aidStaged){
      // The physical staging table frees the player's hands without creating
      // a second crate or remotely transferring supplies to the aid team.
      state.aidStaged=true;state.world.aidStaged=true;state.world.carryingAid=false;
      state.subtitle='유수프(현지 구조단): 임시 적재대에 상자를 놓았어. 필요하면 같은 자리에서 다시 들어 인계해 줘.';
      state.message='비상 물품 임시 적재 · E로 다시 들 수 있습니다';
    }else if(marker.id==='aidResume'&&state.phase==='exit'&&state.choice==='evacuation'&&state.aidStaged){
      state.aidStaged=false;state.world.aidStaged=false;state.world.carryingAid=true;
      state.subtitle='유수프(현지 구조단): 적재대의 같은 상자를 다시 운반하는 거야. 남쪽 인계 지점은 그대로야.';
      state.message='비상 물품 운반 재개 · 달리기 제한';
    }else if(marker.id==='aidDrop'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.aidPickedUp&&!state.aidDelivered&&!state.aidStaged){
      state.aidDelivered=true;state.world.aidDelivered=true;state.world.carryingAid=false;
      state.subtitle='유수프(현지 구조단): 비상 물품을 현장에서 인수했어. 주민 지원은 우리 구조단이 맡을게.';
      state.message='민간 구조단 물품 인계 완료 · 안전한 안뜰로 이동';
    }else if(marker.id==='evacPlan'&&state.phase==='exit'&&state.choice==='evacuation'&&!state.planReviewed){
      // Physical review of a public local evacuation notice; no hidden intel.
      state.planReviewed=true;
      state.subtitle='유수프(현지 구조단): 남쪽 안뜰은 구조단이 통제한다. 인원 확인과 동행, 물품 인계는 현장에서 각각 확인해 줘.';
      state.message='남쪽 대피 계획 현장 확인 완료 · 선택 과제는 별도 수행';
    }else if(marker.id==='muster'&&state.phase==='exit'&&state.choice==='evacuation'&&!state.musterConfirmed){
      // Optional, physical civilian headcount review. No automatic knowledge,
      // teleportation, reward or competitive benefit is granted by this choice.
      state.musterConfirmed=true;
      state.subtitle='유수프(현지 구조단): 남쪽 집결지의 현장 인원 확인표를 대조했어. 미확인 인원은 후속 구조단에 인계하겠어.';
      state.message='남쪽 집결지 인원 확인 완료 · 안전한 안뜰로 이동하세요';
    }else if(marker.id==='guide'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.musterConfirmed&&!state.guide.active&&!state.guide.released){
      state.guide.active=true;
      state.guide.waiting=false;
      state.subtitle='유수프(현지 구조단): 안내원이 함께 이동할 거야. 멀어지면 기다릴 테니 천천히 안뜰로 가 줘.';
      state.message='현지 대피 안내원 동행 시작 · 걸어서 남쪽 안뜰로 이동';
    }else if(marker.id==='guideControl'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&!state.guide.arrived){
      // The locally reached companion holds their actual world position.
      // Reaching them again resumes finite-speed walking without teleportation.
      state.guide.waiting=!state.guide.waiting;
      state.subtitle=state.guide.waiting
        ?'유수프(현지 구조단): 안내원은 이곳에서 기다릴 거야. 직접 돌아와 동행을 재개해 줘.'
        :'유수프(현지 구조단): 안내원이 다시 함께 이동할 거야. 가까운 거리에서 천천히 안내해 줘.';
      state.message=state.guide.waiting?'안내원 현장 대기 · 접근 후 E로 재개':'안내원 동행 재개 · 남쪽 안뜰로 이동';
    }else if(marker.id==='guideTransfer'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&!state.guide.arrived){
      // Optional second physical handoff point: the staffed south aid station.
      // The E prompt requires the player, the actual guide and the aid station
      // to be locally reachable; no remote dismissal, teleport or extra escort.
      state.guide.active=false;
      state.guide.released=true;
      state.guide.waiting=false;
      state.subtitle='유수프(현지 구조단): 남쪽 비상 물품 접수소에서 안내원을 직접 인수했어. 안뜰 대피는 계속 진행해.';
      state.message='남쪽 구조단 안내원 현장 인계 완료 · 대피 통로로 이동';
    }else if(marker.id==='guideRelease'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&!state.guide.arrived){
      // This is a physical alternative to a stalled optional escort: return
      // to the local aid team's muster desk WITH the guide. No remote dismissal
      // or disappearing companion. The guide stays at their last world pose.
      if(Math.hypot(state.guide.x-GUIDE_START.x,state.guide.z-GUIDE_START.z)>2.1){
        state.subtitle='유수프(현지 구조단): 안내원과 함께 집결지로 돌아와야 동행 임무를 인계할 수 있어.';
        state.message='동행 인계 불가 · 안내원을 집결지로 다시 안내하세요';
        return {ok:false,reason:'guide_not_at_muster'};
      }
      state.guide.active=false;
      state.guide.released=true;
      state.guide.waiting=false;
      state.subtitle='유수프(현지 구조단): 안내원을 여기서 다시 인수하겠어. 대위는 남쪽 통로로 이동해도 돼.';
      state.message='안내원 현장 인계 완료 · 별도 동행 의무 해제';
    }else if(marker.id==='gateLog'&&state.phase==='exit'&&state.choice==='verification'&&gateOpen(state)){
       // The captain must reach a physical cabinet after local clearance; this
       // is a contemporaneous transmission record, not supernatural hindsight.
       state.gateLogReviewed=true;
       state.subtitle='조현지(국정원): 현장 기록함에 04:07 최초 수신과 04:12 동일 메시지 재전송이 구분돼 있어요. 두 기록의 시각 차이를 설명할 근거를 확보했습니다.';
       state.message='현장 중계 기록 대조 완료 · 04:12는 재전송';
     }else if(marker.id==='reportDesk'&&state.phase==='exit'&&state.choice==='verification'&&
       state.gateLogReviewed&&!state.logHandedOff){
       // A second, spatially separate action closes the evidence chain: the
       // captain physically delivers the corrected record to local staff.
       state.logHandedOff=true;
       state.subtitle='마라(기술자): 동쪽 기록함의 최초 수신과 재전송 내역을 접수했어요. 유수프 구조단에 확인된 사실만 전달하겠습니다.';
       state.message='현장 중계 기록 접수 완료 · 구조단 후속 확인에 전달';
     }else if((marker.id==='exitEvac'||marker.id==='exitVerify')&&state.phase==='exit'){
      // A player cannot finish an evacuation while still holding the bulky
      // crate. Deliver it, or physically leave it at the optional staging table.
      if(marker.id==='exitEvac'&&state.world.carryingAid){
        state.subtitle='유수프(현지 구조단): 상자를 든 채로 안뜰을 통과할 수 없어. 구조단에 인계하거나 임시 적재대에 내려놓아 줘.';
        state.message='운반 중 · 인계 또는 임시 적재 후 대피 가능';
        return {ok:false,reason:'cargo_handoff_required'};
      }
      // An opted-in local escort is a real mission obligation: pressing E at
      // the finish marker cannot silently strand the still-walking guide.
      // This only gates the OPTIONAL escort branch. Historic saves and the
      // standard evacuation exit remain immediately completable.
      if(marker.id==='exitEvac'&&state.guide.active&&!state.guide.arrived){
        // At the physical courtyard, the exit marker may win the nearest-E
        // selection over the companion control at the same position. A held
        // guide would otherwise be impossible to resume from that marker.
        // Only a locally observed guide can be resumed here; the following
        // fixed tick, not this keypress, verifies actual courtyard arrival.
        if(canResumeGuideAtExit(state)){
          state.guide.waiting=false;
          state.subtitle='유수프(현지 구조단): 안내원이 가까이 있어. 안뜰 도착을 현장에서 확인할게.';
          state.message='안내원 현장 대기 해제 · 동행 도착 확인 중';
          syncMarkers(state);
          return {ok:true,event:'guide_resume_at_exit',phase:state.phase};
        }
        state.subtitle='유수프(현지 구조단): 안내원이 아직 안뜰에 도착하지 못했어. 가까운 거리에서 천천히 동행해 줘.';
        state.message='동행 중 · 안내원 도착 전에는 대피 완료로 기록할 수 없습니다';
        return {ok:false,reason:'guide_not_arrived'};
      }
      if(marker.id==='exitVerify'&&!gateOpen(state)){
        // The same 60Hz gate motor can be paused by a real person in its swept
        // path. An E press must not present an advancing countdown while the
        // local safety interlock is engaged.
        if(state.gateObstructed){
          state.subtitle='유수프(현지 구조단): 통제문 이동 구역에 사람이 있어 안전 정지했습니다. 이동 경로를 비워 주세요.';
          state.message='동쪽 통제문 안전 정지 · 이동 경로를 비운 뒤 개방 확인';
        }else{
          state.subtitle='유수프(현지 구조단): 통제문 개방 작업이 아직 진행 중입니다. 출입 허가 후 통과하세요.';
          state.message='동쪽 통로 대기 · 현지 구조단 개방 확인 필요';
        }
        return {ok:false,reason:'awaiting_clearance'};
      }
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
    const reconsider=state.phase==='exit';
    if(!reconsider&&state.phase!=='decision')return {ok:false,reason:'not_choosing'};
    if(choice!=='evacuation'&&choice!=='verification')return {ok:false,reason:'invalid_choice'};
    if(choice==='verification'&&state.found.length!==2)return {ok:false,reason:'missing_evidence'};
    if(reconsider){
      // A menu cannot grant remote clearance or undo carried aid and confirmed
      // records. Use the same physically reachable marker as the PC E key.
      if(nearest(state)?.id!=='decision')return {ok:false,reason:'not_near_desk'};
      if((state.choice==='evacuation'&&(state.aidPickedUp||state.musterConfirmed))||
         (state.choice==='verification'&&state.gateLogReviewed))
        return {ok:false,reason:'route_committed'};
      // Reconfirming the current route must not reset its running gate motor.
      if(choice===state.choice)return {ok:true,event:'choice_unchanged',choice};
    }
    // Reselecting the opposite route revokes only this optional local review.
    if(choice!==state.choice)state.planReviewed=false;
    state.choice=choice;state.phase='exit';
    state.gateClearanceDuration=state.relayRestored?4:GATE_CLEARANCE_SECONDS;
    state.gateReadyAt=choice==='verification'?state.world.elapsed+state.gateClearanceDuration:0;
    state.gateObstructed=false;
    state.subtitle=choice==='verification'
      ?'마라(기술자): 현지 통제소에 동쪽 통로 개방을 요청했습니다. 실제 작업 시간이 필요해요.'
      :'유수프(현지 구조단): 남쪽 대피 통로를 현장에서 안내하겠어. 동쪽 개방 요청은 중단했어.';
    state.message=choice==='verification'?'현지 통제소 요청 · 동쪽 통로 개방 대기':'남쪽 대피 통로 선택 · 동쪽 통제소 차단';
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
  function missionTasks(state) {
    // Read-only progress derived entirely from the real CH01 world. The
    // tracker never grants completion, discovers an unseen actor, changes a
    // physical interaction, or adds fields to the versioned checkpoint.
    if((state.phase!=='exit'&&state.phase!=='complete')||!state.choice)
      return Object.freeze([]);
    const item=(id,label,status,optional=false)=>
      Object.freeze({id,label,status,optional});
    const completed=state.phase==='complete';
    if(state.choice==='evacuation'){
      const guide=state.guide;
      const guideDone=guide.arrived||guide.released;
      const guideStatus=guideDone?'done':guide.active
        ?guide.waiting?'waiting':'following'
        :state.musterConfirmed?'available':'locked';
      const aidStatus=state.aidDelivered?'done':state.aidStaged?'staged'
        :state.aidPickedUp?'carrying':'available';
      return Object.freeze([
        item('plan','남쪽 대피 계획 현장 확인',state.planReviewed?'done':'available',true),
        item('muster','집결지 인원 확인',state.musterConfirmed?'done':'available',true),
        item('guide','현장 안내원 동행·인계',guideStatus,true),
        item('aid','비상 물품 현장 인계',aidStatus,true),
        item('exit','남쪽 안뜰 도착',completed?'done':
          (state.world.carryingAid||(guide.active&&!guideDone))?'blocked':'available')
      ]);
    }
    return Object.freeze([
      item('evidence','기록 2건 확인',state.found.length===2?'done':'locked'),
      item('gate','동쪽 통제문 확인',gateOpen(state)?'done':'waiting'),
      item('log','현장 중계 기록 검토',state.gateLogReviewed?'done':gateOpen(state)?'available':'locked',true),
      item('handoff','현장 기록 전달',state.logHandedOff?'done':
        state.gateLogReviewed?'available':'locked',true),
      item('exit','동쪽 통로 이동',completed?'done':gateOpen(state)?'available':'blocked')
    ]);
  }
  // The courtyard marker may be the actual E target while a visible guide
  // is held beside the exit. Share one physical reach rule between the
  // interaction handler and HUD so players are not shown a false softlock.
  function canResumeGuideAtExit(state) {
    if(state.phase!=='exit'||state.choice!=='evacuation'||!state.guide.active||
       state.guide.arrived||!state.guide.waiting)return false;
    const exit=POINTS.exitEvac,g=state.guide,p=state.world.player;
    return Math.hypot(g.x-exit.x,g.z-exit.z)<2.4&&
      Math.hypot(p.x-exit.x,p.z-exit.z)<4&&
      Math.hypot(g.x-p.x,g.z-p.z)<3&&
      !Sim.lineBlocked(p.x,p.z,g.x,g.z,state.world.obstacles)&&
      !Sim.lineBlocked(g.x,g.z,exit.x,exit.z,state.world.obstacles);
  }
  function visibleEscortDistance(state) {
    // The player can estimate spacing only when the civilian is actually
    // visible and nearby. Never reveal their precise position through solid
    // scenery or from the other end of the map.
    if(state.phase!=='exit'||state.choice!=='evacuation'||
       !state.guide.active||state.guide.released||state.guide.arrived)return null;
    const p=state.world.player,g=state.guide;
    const distance=Math.hypot(p.x-g.x,p.z-g.z);
    if(distance>=7||Sim.lineBlocked(p.x,p.z,g.x,g.z,state.world.obstacles))
      return null;
    return Math.round(distance*10)/10;
  }
  function situation(state) {
    const count=state.found.length;
    return Object.freeze({
      mandate:'가상 사히르 임시행정부 요청에 따른 한국 측 제한적 민간 대피 지원 승인',
      command:'이수혁 대위: 한국 측 파견 지휘관의 승인 범위에서 임무 수행 · 현지 통로 개방은 유수프 구조단 결정 · 국정원은 정보 자문',
      liaison:'김지윤: 현지 구조단 전달 기록 검토 · 조현지: 현장 경로 상황 통보',
      evidence:state.logHandedOff?'현장 중계 로그 확인 · 04:07 최초 수신 / 04:12 재전송 · 현지 통제소 접수 완료':
        state.gateLogReviewed?'현장 중계 로그 확인 · 04:07 최초 수신 / 04:12 동일 메시지 재전송':
         count===2?'기록 2/2 · 04:07 대피소 / 04:12 항구 · 원인 미확정':`기록 ${count}/2 · 교차 확인 전 결론 보류`,
      eastGateOpen:gateOpen(state),
      eastGateObstructed:state.phase==='exit'&&state.choice==='verification'&&
        !gateOpen(state)&&state.gateObstructed,
      eastGateRemainingSeconds:state.choice==='verification'&&!gateOpen(state)?Math.max(0,Math.ceil((state.gateReadyAt-state.world.elapsed)*60-1e-8)/60):0,
      routeReviewAvailable:state.phase==='exit'&&markers(state).some(m=>m.id==='decision'),
      visibleEscortDistance:visibleEscortDistance(state),
      escortPaceAvailable:escortPaceAvailable(state),
      radio:state.relayRestored?'현지 비상 무전 복구 완료 · 항구 벽등 점등 · 동쪽 통제문 준비 4초':'비상 무전 미복구 · 동쪽 통제문 준비 8초',
      headlamp:state.flashlightTicks===0?'휴대 헤드램프 배터리 소진':`휴대 헤드램프 ${state.flashlightOn?'점등 · 노출 증가':'소등'} · 잔량 약 ${Math.ceil(state.flashlightTicks/60)}초`,
       warning:state.beaconEnabled?'현장 수동 경고등 점등 · 현지 구조단 확인':state.relayRestored?'항구 수동 경고등 소등 · 현장 재점등 가능':'항구 수동 경고등 미점등',
      route:state.choice==='verification'?(gateOpen(state)?'동쪽 통로: 현지 구조단 개방 확인':state.gateObstructed?'동쪽 통로: 접근자 감지로 안전 정지':'동쪽 통로: 현지 구조단 개방 작업 중'):'동쪽 통로: 현지 구조단 확인 전 통제 중',
      aidSupply:state.aidDelivered?'현지 구조단: 비상 물품 현장 인수 완료':
        state.aidStaged?'민간 비상 물품 임시 적재 중 · 현지 구조단 인계 전':
        state.aidPickedUp?'민간 비상 물품 운반 중 · 현지 구조단 인계 필요':
          '민간 비상 물품 미수령 · 남쪽 인계는 선택 사항',
      guideStatus:state.guide.released?(Math.hypot(state.guide.x-POINTS.guideTransfer.x,state.guide.z-POINTS.guideTransfer.z)<2.1?'대피 안내원 남쪽 구조단 인계 완료':'대피 안내원 집결지 현장 인계 완료'):state.guide.active?(state.guide.arrived?'대피 안내원 안뜰 도착':state.guide.waiting?(['guideRelease','guideTransfer'].includes(nearest(state)?.id)?'대피 안내원 현장 대기 · E로 구조단에 현장 인계 가능':nearest(state)?.id==='exitEvac'&&canResumeGuideAtExit(state)?'대피 안내원 안뜰 근처 대기 · 출구에서 E로 동행 재개 가능':nearest(state)?.id==='guideControl'?'대피 안내원 현장 대기 · E로 재개 가능':visibleEscortDistance(state)===null?'대피 안내원 현장 대기 · 마지막으로 확인한 위치로 돌아가세요':'대피 안내원 현장 대기 · 직접 닿을 만큼 다가가 E로 재개하세요'):Math.hypot(state.guide.x-state.world.player.x,state.guide.z-state.world.player.z)>=14?'대피 안내원과 거리 이탈 · 마지막으로 확인한 위치로 돌아가세요':guideBodyPathBlocked(state.guide,state.world.player,state.world.obstacles)?(guideDetour(state,state.guide,state.world.player)?'대피 안내원 장애물 우회 중 · 가까운 거리에서 천천히 이동하세요':'대피 안내원과 시야 단절 · 가까운 통로로 다시 접근하세요'):Math.hypot(state.guide.x-state.world.player.x,state.guide.z-state.world.player.z)>=7?'대피 안내원과 거리 이탈 · 마지막으로 확인한 위치로 돌아가세요':(nearest(state)?.id==='guideControl'?'대피 안내원 동행 중 · E로 대기 지시 가능':['guideRelease','guideTransfer'].includes(nearest(state)?.id)?'대피 안내원 동행 중 · E로 구조단 현장 인계 가능':'대피 안내원 동행 중 · 안내원 곁으로 다가가 E로 대기 지시하세요')):
        state.musterConfirmed&&state.choice==='evacuation'?'대피 안내원 동행 선택 가능':'대피 안내원 동행 미시작',
      civilianConsequence:state.choice==='evacuation'
        ?(state.musterConfirmed?'유수프 구조단: 남쪽 집결지 인원 확인표 대조 완료 · 후속 구조단 인계':'유수프 구조단: 남쪽 대피 인원 확인 우선 · 집결지 확인표 미대조')
        :state.choice==='verification'
          ?(gateOpen(state)?(state.gateLogReviewed?'유수프 구조단: 동쪽 통로 개방 · 현장 재전송 기록 확인':'유수프 구조단: 동쪽 통로 점검 완료 · 시각 차이 원인 조사 계속')
            :'유수프 구조단: 남쪽 대피 유지 · 동쪽 통제물 해제 대기')
          :'유수프 구조단: 남쪽 대피 통로 확보 · 추가 확인 여부는 현장 선택'
    });
  }
  // Read-only factual audit for the selected CH01 route. Optional tasks
  // cannot become mandatory, advance the world, or unlock any campaign content.
  function optionalTaskAudit(state){
    const optional=missionTasks(state).filter(task=>task.optional);
    const completed=optional.filter(task=>task.status==='done');
    const remaining=optional.filter(task=>task.status!=='done');
    return Object.freeze({
      total:optional.length,done:completed.length,
      finished:Object.freeze(completed.map(task=>task.label)),
      unfinished:Object.freeze(remaining.map(task=>task.label))
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
      optionalTasks:optionalTaskAudit(state),
      protagonist:'이수혁',route:state.choice,records,
      eastCheckpointCleared:verified&&gateOpen(state),
      emergencyRadioRestored:state.relayRestored,harborWarningEnabled:state.beaconEnabled,gateLogReviewed:state.gateLogReviewed,logHandedOff:state.logHandedOff,musterConfirmed:state.musterConfirmed,
      aidDelivered:state.aidDelivered,aidPickedUp:state.aidPickedUp,aidStaged:state.aidStaged,
      guideArrived:state.guide.arrived,guideReleased:state.guide.released,
      mandate:'limited-civilian-evacuation',intelligenceRole:'advisory-only',
      clockDiscrepancy:state.gateLogReviewed?'retransmission-confirmed':conflict?'unresolved':'not-cross-checked',
      civilianOutcome:verified?'east-clearance-confirmed':
        (state.musterConfirmed?'south-headcount-verified':'south-evacuation-prioritized'),
      summary:verified
        ?(state.gateLogReviewed?'동쪽 현장 기록함에서 04:07 최초 수신과 04:12 동일 메시지 재전송을 확인했습니다. 통로는 유수프 구조단이 개방했습니다.':'유수프 구조단의 동쪽 통로 개방을 확인했습니다. 두 기록의 5분 차이는 여전히 원인 미확정입니다.')+
          (state.logHandedOff?' 확인한 기록을 현지 통제소 접수대에 직접 전달했습니다.':'')
        :(state.musterConfirmed
          ?'남쪽 집결지 인원 확인표를 대조하고 미확인 인원을 후속 구조단에 인계했습니다. 동쪽 통로는 통제 중입니다.'
          :'유수프 구조단의 남쪽 대피를 우선했습니다. 동쪽 통로는 통제 중이며 기록 검증은 후속 과제입니다.')+
        (state.aidDelivered?' 현지 구조단에 비상 물품을 직접 전달했습니다.':
          state.aidStaged?' 비상 물품은 임시 적재대에 남겨 두었으며 구조단 인계는 미완료입니다.':'')+
        (state.guide.released?(Math.hypot(state.guide.x-POINTS.guideTransfer.x,state.guide.z-POINTS.guideTransfer.z)<2.1?' 안내원은 남쪽 물품 접수소의 현지 구조단에 직접 인계했습니다.':' 안내원은 집결지에서 현지 구조단에 직접 인계했습니다.'):state.guide.active?(state.guide.arrived?' 안내원이 실제로 남쪽 안뜰에 도착했습니다.':' 안내원이 대피 경로에서 아직 이동 중입니다.'):'')+
        (state.beaconEnabled?' 항구 수동 경고등을 켜 현지 구조단에 상태를 알렸습니다.':'')
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
      case 'records':return '선택: 양쪽 기록을 조사하거나 중앙 콘솔에서 대피 경로를 선택하세요.'+
        (state.combat.supplyRemaining>0?' 남은 현장 보급은 가까이에서 E로 수령할 수 있습니다.':'')+
        (!state.relayRestored?' 비상 통신 중계기 전원(황금 표식)을 E로 연결하면 동쪽 통제문 준비가 4초로 단축됩니다.':'');
      case 'decision':return state.found.length===2
        ?'두 기록의 시각 차이 확인 완료. 대피 우선 또는 추가 확인 경로를 선택하세요.'+
          (state.relayRestored?' 선택: 항구 건물의 수동 경고등을 E로 켜거나 끌 수 있습니다.':'')
        :'대피 우선을 선택하거나, 두 기록을 찾아 추가 확인 경로를 여세요.';
      case 'exit':return state.choice==='verification'
        ?(gateOpen(state)?'동쪽 추가 확인 경로(파란 표식)로 이동해 E를 누르세요.'+(state.gateLogReviewed?(state.logHandedOff?' 현장 중계 기록을 현지 통제소에 전달했습니다.':' 선택: 기록 접수대(파란 표식)에 E로 확인 결과를 전달할 수 있습니다.'):' 선택: 동쪽 기록함(파란 표식)을 E로 확인해 시각 차이를 검증할 수 있습니다.'):state.gateObstructed?'동쪽 통제문 안전 정지 · 이동 경로에서 벗어나세요.':'동쪽 통제소 개방 작업 중 · 약 '+Math.ceil(state.gateReadyAt-state.world.elapsed)+'초 후 통과 가능합니다.')
        :'남쪽 안전한 안뜰(초록 표식)로 이동해 E를 누르세요.'+
          (state.world.carryingAid?' 운반 중인 비상 물품은 구조단에 인계하거나 임시 적재대에 내려놓아야 출구를 통과할 수 있습니다.':'')+
          (state.musterConfirmed?' 집결지 인원 확인표 대조 완료.':' 선택: 근처 인원 확인표(황금 표식)를 E로 대조할 수 있습니다.')+
          (state.guide.released?(Math.hypot(state.guide.x-POINTS.guideTransfer.x,state.guide.z-POINTS.guideTransfer.z)<2.1?' 안내원은 남쪽 구조단 접수소에 현장 인계했습니다.':' 안내원은 집결지 구조단에 현장 인계했습니다.'):state.guide.arrived?' 안내원 안뜰 도착 확인.':state.guide.active
            ?(state.guide.waiting?' 안내원이 현장에서 대기 중입니다. 가까이에서 E로 동행 재개 또는 집결지 인계가 가능합니다.':' 안내원 동행 중입니다. E로 잠시 대기시킬 수 있습니다. 반드시 안뜰까지 함께 도착하거나 집결지 또는 남쪽 구조단 접수소에 직접 인계하세요.'):state.musterConfirmed
            ?' 집결지 안내원(초록 표식)에게 E로 동행을 요청할 수 있습니다.':'')+
          (state.aidDelivered?' 비상 물품 인계 완료.':state.aidStaged
            ?' 상자가 임시 적재대에 있습니다. E로 다시 들거나 그대로 대피할 수 있습니다.':state.aidPickedUp
            ?' 상자를 운반 중입니다. 구조단에 인계하거나 임시 적재대에 E로 내려놓으세요.'
            :' 선택: 비상 물품 상자를 E로 집어 구조단에 직접 인계할 수 있습니다.');
      default:return 'CH01 완료. 캠페인 전체 12시간은 아직 제작 중입니다.';
    }
  }
  // Save once when a civilian actually reaches the physical courtyard.
  // A normal five-second autosave remains the fallback for other travel.
  // A frame that has already arrived must not keep writing to localStorage.
  function escortArrivalCheckpoint(wasArrived,state) {
    return wasArrived===false&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&state.guide.arrived&&!state.guide.released;
  }
  function snapshot(state) {
    const p=state.world.player;
    return {version:VERSION,phase:state.phase,found:state.found.slice(),choice:state.choice,relayRestored:state.relayRestored,beaconEnabled:state.beaconEnabled,flashlightOn:state.flashlightOn,flashlightTicks:state.flashlightTicks,gateLogReviewed:state.gateLogReviewed,logHandedOff:state.logHandedOff,musterConfirmed:state.musterConfirmed,planReviewed:state.planReviewed,
      aidPickedUp:state.aidPickedUp,aidDelivered:state.aidDelivered,aidStaged:state.aidStaged,
      guide:{active:state.guide.active,arrived:state.guide.arrived,released:state.guide.released===true,
         waiting:state.guide.waiting===true,x:state.guide.x,z:state.guide.z},gateReadyAt:state.gateReadyAt,gateClearanceDuration:state.gateClearanceDuration,
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
    if(Object.keys(data).length<expectedKeys.length||Object.keys(data).length>expectedKeys.length+14||
      Object.keys(data).some(k=>!expectedKeys.concat('gateReadyAt','relayRestored','beaconEnabled','flashlightOn','flashlightTicks','gateLogReviewed','logHandedOff','musterConfirmed','aidPickedUp','aidDelivered','aidStaged','guide','gateClearanceDuration','planReviewed').includes(k))||
      (hasOwn(data,'relayRestored')&&typeof data.relayRestored!=='boolean')||
      (hasOwn(data,'beaconEnabled')&&typeof data.beaconEnabled!=='boolean')||
      // An unpowered repeater cannot sustain its locally wired warning fixture.
      (data.beaconEnabled===true&&data.relayRestored!==true)||
       (hasOwn(data,'flashlightOn')!==hasOwn(data,'flashlightTicks'))||
       (hasOwn(data,'flashlightOn')&&
         (typeof data.flashlightOn!=='boolean'||!Number.isInteger(data.flashlightTicks)||
          data.flashlightTicks<0||data.flashlightTicks>HEADLAMP_TICKS||
          (data.flashlightOn&&data.flashlightTicks===0)))||
       (hasOwn(data,'gateLogReviewed')&&typeof data.gateLogReviewed!=='boolean')||
       (hasOwn(data,'logHandedOff')&&typeof data.logHandedOff!=='boolean')||
      (hasOwn(data,'musterConfirmed')&&typeof data.musterConfirmed!=='boolean')||
      (hasOwn(data,'planReviewed')&&typeof data.planReviewed!=='boolean')||
      (hasOwn(data,'aidPickedUp')&&typeof data.aidPickedUp!=='boolean')||
      (hasOwn(data,'aidDelivered')&&typeof data.aidDelivered!=='boolean')||
      (hasOwn(data,'aidStaged')&&typeof data.aidStaged!=='boolean')||
      (data.aidStaged===true&&(data.aidPickedUp!==true||data.aidDelivered===true))||
      (data.aidDelivered===true&&data.aidPickedUp!==true)||
      // Legacy saves without this optional escort field retain their old route.
      (hasOwn(data,'guide')&&(!data.guide||typeof data.guide!=='object'||Array.isArray(data.guide)||
        !['active,arrived,x,z','active,arrived,released,x,z',
          'active,arrived,released,waiting,x,z',
          'active,arrived,waiting,x,z'].includes(Object.keys(data.guide).sort().join(','))||
        (hasOwn(data.guide,'released')&&typeof data.guide.released!=='boolean')||
         (hasOwn(data.guide,'waiting')&&typeof data.guide.waiting!=='boolean')||
         (data.guide.waiting===true&&(!data.guide.active||data.guide.arrived||
           data.phase!=='exit'||data.choice!=='evacuation'))||
        typeof data.guide.active!=='boolean'||typeof data.guide.arrived!=='boolean'||
        !Number.isFinite(data.guide.x)||!Number.isFinite(data.guide.z)||
        Math.hypot(data.guide.x-GUIDE_START.x,data.guide.z-GUIDE_START.z)>19||
        (data.guide.arrived&&(!data.guide.active||data.guide.released===true||
          Math.hypot(data.guide.x-POINTS.exitEvac.x,data.guide.z-POINTS.exitEvac.z)>2.4))||
        (data.guide.active&&(data.choice!=='evacuation'||data.musterConfirmed!==true||
          !['exit','complete'].includes(data.phase)))||
        (data.guide.released===true&&(
          data.guide.active||data.guide.arrived||data.choice!=='evacuation'||
          data.musterConfirmed!==true||!['exit','complete'].includes(data.phase)||
          (Math.hypot(data.guide.x-GUIDE_START.x,data.guide.z-GUIDE_START.z)>2.1&&
           Math.hypot(data.guide.x-POINTS.guideTransfer.x,data.guide.z-POINTS.guideTransfer.z)>2.1)))||
        (!data.guide.active&&data.guide.released!==true&&(data.guide.arrived||data.guide.x!==GUIDE_START.x||
          data.guide.z!==GUIDE_START.z))))||
      (hasOwn(data,'gateClearanceDuration')&&![4,GATE_CLEARANCE_SECONDS].includes(data.gateClearanceDuration))||
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
    // Records and route choices are acquired only AFTER clearing CH01 combat.
    // An engagement/failure checkpoint must not smuggle future knowledge or
    // an already-authorized exit into an earlier playable mission phase.
    if((data.logHandedOff===true&&
         (data.gateLogReviewed!==true||data.choice!=='verification'||
          !['exit','complete'].includes(data.phase)))||
       (data.gateLogReviewed===true&&
         (data.choice!=='verification'||!['exit','complete'].includes(data.phase)||
           !hasOwn(data,'gateReadyAt')||data.elapsed+1e-6<data.gateReadyAt))||
       (data.aidPickedUp===true&&
        (data.choice!=='evacuation'||!['exit','complete'].includes(data.phase)))||
      // Historical checkpoints could finish with undelivered cargo in hand.
      // Keep those finished saves readable; live exits now require staging or delivery.

      (hasOwn(data,'musterConfirmed')&&data.musterConfirmed&&
        (data.choice!=='evacuation'||!['exit','complete'].includes(data.phase)))||
      (data.planReviewed===true&&
        (data.choice!=='evacuation'||!['exit','complete'].includes(data.phase)))||
      (hasOwn(data,'relayRestored')&&data.relayRestored&&
        (['terminal','engagement','failed'].includes(data.phase)))||
      (data.beaconEnabled===true&&
        (data.relayRestored!==true||['terminal','engagement','failed'].includes(data.phase)))||
      (['terminal','engagement','failed'].includes(data.phase)&&
        (data.found.length!==0||data.choice!==null))||
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
    // Existing v1/v2 checkpoints predate the optional emergency radio action.
    state.relayRestored=hasOwn(data,'relayRestored')?data.relayRestored:false;
    state.beaconEnabled=hasOwn(data,'beaconEnabled')?data.beaconEnabled:false;
    state.flashlightOn=hasOwn(data,'flashlightOn')?data.flashlightOn:false;
    state.flashlightTicks=hasOwn(data,'flashlightTicks')?data.flashlightTicks:HEADLAMP_TICKS;
     state.gateLogReviewed=hasOwn(data,'gateLogReviewed')?data.gateLogReviewed:false;
    state.logHandedOff=hasOwn(data,'logHandedOff')?data.logHandedOff:false;
    // Older v1/v2 checkpoints never included an optional south muster review.
    state.musterConfirmed=hasOwn(data,'musterConfirmed')?data.musterConfirmed:false;
    state.planReviewed=hasOwn(data,'planReviewed')?data.planReviewed:false;
    state.aidPickedUp=hasOwn(data,'aidPickedUp')?data.aidPickedUp:false;
    state.aidDelivered=hasOwn(data,'aidDelivered')?data.aidDelivered:false;
    state.aidStaged=hasOwn(data,'aidStaged')?data.aidStaged:false;
    state.guide=hasOwn(data,'guide')?{...data.guide,released:data.guide.released===true,
       waiting:data.guide.waiting===true}:
      {active:false,arrived:false,released:false,x:GUIDE_START.x,z:GUIDE_START.z};
    state.world.carryingAid=state.aidPickedUp&&!state.aidDelivered&&!state.aidStaged;
    state.world.aidStaged=state.aidStaged;
    state.world.aidPickedUp=state.aidPickedUp;state.world.aidDelivered=state.aidDelivered;
    // Older verification saves already had an open route.
    state.gateReadyAt=hasOwn(data,'gateReadyAt')?data.gateReadyAt:0;
    // Old saves did not latch the approved gate travel duration. Infer the
    // historical cycle without changing a previously authorized deadline.
    state.gateClearanceDuration=hasOwn(data,'gateClearanceDuration')?data.gateClearanceDuration:
      (data.choice==='verification'&&state.relayRestored?4:GATE_CLEARANCE_SECONDS);
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
    if(recoverSceneOverlap(state))state.message='CH01 / 이전 저장 위치를 새 항구 건물 밖으로 안전하게 복구했습니다.';
    if(recoverActorOverlap(state))state.message='CH01 / 이전 저장 위치를 대치자와 겹치지 않게 안전하게 복구했습니다.';
    if(recoverGuideSceneryOverlap(state))
      state.message='CH01 / 새 항구 장애물 안의 동행 안내원을 가까운 안전 위치로 복구했습니다.';
    if(recoverEscortOverlap(state))state.message='CH01 / 이전 저장 위치를 동행 안내원과 겹치지 않게 복구했습니다.';
    return syncMarkers(state);
  }
  // Durable checkpoint recovery is a world-state transition, not a bypass of
  // the CH01 save validator: each candidate is restored through the complete
  // existing schema, physical collision, phase and finite-resource checks.
  // A corrupt latest save may fall back to the previous valid world; a valid
  // completed mission is never rolled back to an older playable checkpoint.
  function recoverCheckpoint(primary, backup) {
    let failedPrimary=null,firstError=null;
    for(const [source,raw] of [['primary',primary],['backup',backup]]) {
      if(typeof raw!=='string'||raw.length===0)continue;
      try {
        const state=restore(raw);
        if(source==='primary'&&state.phase==='failed'){
          failedPrimary={source,state};continue;
        }
        return {source,state};
      } catch(error){if(!firstError)firstError=error;}
    }
    if(failedPrimary)return failedPrimary;
    if(firstError)throw firstError;
    return null;
  }
  // The PC review action re-enters the exact completed physical mission world
  // instead of inventing a new outcome from an untrusted summary string. The
  // restored world, evidence, 60Hz clock and escort position are read-only.
  // Neither a failed nor an unfinished mission is a valid completion.
  function reviewCompletedMission(raw) {
    const state=restore(raw);
    if(state.phase!=='complete'||state.world.status!=='won')
      throw new RangeError('Only completed CH01 missions can be reviewed');
    const report=debrief(state);
    if(!report||report.previewOnly!==true||report.campaignUnlocked!==false)
      throw new RangeError('Invalid CH01 completion');
    return {state,report};
  }
  return Object.freeze({
    VERSION,POINTS,RECORDS,INTERACT_RADIUS,GATE_CLEARANCE_SECONDS,createState,step,markers,nearest,interact,toggleFlashlight,fire,autoFire,support,choose,
    objective,situation,missionTasks,optionalTaskAudit,debrief,escortArrivalCheckpoint,backToRecords,serialize,restore,recoverCheckpoint,reviewCompletedMission,validateSnapshot
  });
});
