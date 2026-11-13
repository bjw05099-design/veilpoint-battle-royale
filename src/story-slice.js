/* VEILPOINT / CH01 browser story vertical slice.
 * Original fictional mission. Offline, no network or assets.
 * Pure mission rules are separated from DOM, renderer and campaign progression.
 */
(function (root, factory) {
  const api = factory(
    root.VeilpointSim || (typeof module === 'object' && module.exports ? require('./simulation.js') : null),
    root.VeilpointStoryConsequences || (typeof module === 'object' && module.exports ? require('./story-consequences.js') : null),
    root.VeilpointCivicRecovery || (typeof module === 'object' && module.exports ? require('./ch01-civic-recovery.js') : null),
    root.VeilpointStreetFlood || (typeof module === 'object' && module.exports ? require('./ch01-street-flood.js') : null),
    root.VeilpointPublicHall || (typeof module === 'object' && module.exports ? require('./aden-public-hall.js') : null),
    root.VeilpointPublicFootpaths || (typeof module === 'object' && module.exports ? require('./public-city-footpaths.js') : null),
     root.VeilpointStoryPublicCourt || (typeof module === 'object' && module.exports ? require('./story-public-court.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VeilpointStorySlice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Sim, Consequences, Civic, StreetFlood, Hall, Footpaths, Court) {
  'use strict';
  if (!Sim) throw new Error('VeilpointSim is required for story slice');
  // Older embedded CH01 clients omit optional history; never block the game.
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
    ...Sim.harborPassage(42,-38,16,20,9),
    {x:-44,z:-73,w:20,d:12,h:6,type:'story-warehouse'},
    {x:47,z:-77,w:18,d:15,h:7,type:'story-warehouse'},
    {x:-63,z:-53,w:12,d:3,h:2.6,type:'story-container'},
    {x:64,z:-53,w:12,d:3,h:2.6,type:'story-container'},
    {x:79,z:-81,w:5,d:5,h:14,type:'story-crane'},
    {x:55,z:-9,w:12,d:14,h:7,type:'story-building'},
    // Two distinct freight stacks on the outer harbor apron. Their full
    // footprints are solid in the same fixed-step world used by rendering.
    // They are deliberately outside both CH01 evacuation/verification routes.
    {x:-72,z:-84,w:9,d:4,h:5.2,type:'story-container'},
    {x:72,z:-91,w:9,d:4,h:2.6,type:'story-container'},
    // Public harbor water kiosk beside the physical pedestrian path;
    // the body and roof share one small, collidable authored footprint.
    {x:34,z:-12,w:2.6,d:2.2,h:2.4,type:'story-water-kiosk'},
    // Shore maintenance apron: an upturned workboat and a separate physical
    // lifesaving-equipment cabinet. Both are solid, visible from the public
    // quay and deliberately clear of CH01's two mission exits.
    {x:-67,z:-106,w:8,d:3.2,h:2.2,type:'story-drydock-hull'},
    {x:-56,z:-106,w:1.8,d:1.2,h:1.8,type:'story-rescue-locker'},
    // Public harbor community office: five separate wall segments form
    // a physically walkable room with a four-metre SOUTH entrance.
    // No solid cuboid or invisible door blocks entering on foot.
    {x:80,z:25,w:.5,d:16,h:4,type:'story-office-wall'},
    {x:94,z:25,w:.5,d:16,h:4,type:'story-office-wall'},
    {x:87,z:33,w:14,d:.5,h:4,type:'story-office-wall'},
    {x:82.5,z:17,w:5,d:.5,h:4,type:'story-office-wall'},
    {x:91.5,z:17,w:5,d:.5,h:4,type:'story-office-wall'},
    {x:87,z:30,w:2,d:.7,h:1,type:'story-office-desk'},
    // A grounded local records counter: visible geometry matches fixed collision.
    {x:18,z:-42.9,w:1.6,d:.8,h:1.05,type:'story-desk'},
    // Solid intake counter, reached from the open southern walkway.
    {x:-24,z:-55,w:1.6,d:.8,h:1.05,type:'story-desk'},
    // Story-first accessible civilian hall. The map's ordinary solid walls,
    // desk and seat share a single data module with the future BR authoring
    // pipeline. Do not insert them into already serialized BR matches.
    ...(Hall?Hall.PARTS:[]),
    // Eight REAL colliders in the relocated original public court. Above-
    // head canopy and decorative paving are VISUAL only in this 2D AABB world;
    // the same eight solids are authored as UE5 editor meshes at equal metres.
    ...(Court?Court.SOLIDS:[])
  ]);
  // A loose civilian market awning comes down during the unplanned escalation.
  // It creates one short physical walking detour, never a collectable or another
  // investigation task. Older checkpoints without the event keep their old
  // traversable street geometry, so loading cannot spawn a wall on top of them.
  const FALLEN_AWNING=Object.freeze({x:24,z:-35,w:4.0,d:2.4,h:.72,
    type:'story-fallen-awning',routeId:'story-fallen-awning'});
  // CH01 optional physical clearance: a lightweight fallen market awning
  // moves only while the captain remains at its actual handle. There is no
  // document clue, route unlock, remote command or hidden new mission gate.
  const AWNING_SLIDE=4.8, AWNING_SLIDE_SECONDS=4;
  // Mara decides to use an actually cleared, public street. This is optional
  // local life, never a player escort assignment or guaranteed evacuation.
  const MARA_PATH=Object.freeze({startX:19.5,startZ:-35,endX:25,endZ:-39.5,
    speed:1.05,radius:.55});
  const newMarketMara=()=>({x:MARA_PATH.startX,z:MARA_PATH.startZ,arrived:false});
  // Kim Jiyoon is a physical companion, not an omniscient radio or HUD pin.
  // He starts beside the same authored arrival street as the captain; later
  // his own 60Hz footsteps respond to the witnessed neighborhood change.
  const KIM_JIYOON_START=Object.freeze({x:-3,z:9});
  const KIM_JIYOON_STAFFED=Object.freeze({x:-9,z:-10});
  const newKimJiyoon=()=>({...KIM_JIYOON_START});
  // After personally restoring the public relay, Jo physically walks along
  // the staffed harbour pavement. She does not teleport, direct a rescue,
  // or provide omniscient reports; this position persists in old v2 saves.
  const LIAISON_WALK=Object.freeze({x:12,startZ:-39,endZ:-46,
    speed:1.05,radius:.55});
  const AWNING_HANDLE=Object.freeze({id:'awningHandle',x:20.5,z:-38,
    kind:'objective',label:'쓰러진 차양 틀을 직접 치워 보행 통로 확보'});
  const GATE_SAFETY_RADIUS = .95; // Player body radius .85 + 10 cm motion buffer.
  const GUIDE_START=Object.freeze({x:-10.5,z:-55}); // Waiting civilian aid coordinator.
  // CH01 civilian harbor worker traverses one small publicly reachable
  // sidewalk at walking speed. No military intelligence or courier objective.
  const WORKER_PATH=Object.freeze({minX:20,maxX:28,z:-12,safeZ:-8,
    speed:1.05,shelterSpeed:1.0,radius:.55});
  // A civilian-owned shuttle approaches on an original public harbor road.
  // Arrival is an observed physical fact, not proof of completed evacuation.
  const CIVILIAN_SHUTTLE=Object.freeze({x:10,startZ:-82,endZ:-64,w:2.4,d:3.8,h:2.35,
    speed:1.5,driverWalkSpeed:1.6,boardZ:-79.4});
  const VAN_CROSSING_YIELD_SECONDS=5;
  // The driver first walks from the staffed approach to the actual parked
  // vehicle. The old checkpoint without driverZ means already boarded.
  function transportWitness(state) {
    if(!['exit','complete'].includes(state.phase)||
       (state.choice!=='evacuation'&&state.transportContact===0))return null;
    const v=state.transportVan;
    if(!v||!hasOwn(v,'driverZ'))
      return {x:POINTS.transportDriver.x,z:POINTS.transportDriver.z};
    return v.driverZ>CIVILIAN_SHUTTLE.boardZ+1e-8
      ?{x:CIVILIAN_SHUTTLE.x,z:v.driverZ}:null;
  }
  // The same civic courtyard collision/road geometry is authored once in
  // Sim.makeObstacles and reused by both BR and this story chapter.
  const CIVIC_COURTYARD=Object.freeze({x:77,z:125,arrivalRadius:4.1});
  const newWorker=()=>({x:WORKER_PATH.minX,z:WORKER_PATH.z,direction:1});
  // A local resident, not an escort or an extra mission objective, decides to
  // walk to the staffed south courtyard once the immediate danger has cleared.
  // Position and arrival are saved; time cannot teleport this person to safety.
  const CIVILIAN_WALK=Object.freeze({x:-2,startZ:-46,endZ:-58,speed:1.25,aidLaneX:-4});
  const newCivilianWalker=()=>({x:CIVILIAN_WALK.x,z:CIVILIAN_WALK.startZ,arrived:false});
  function makeHostiles(disabled=false) {
    return HOSTILE_POSITIONS.map((p,id)=>({id,x:p.x,z:p.z,health:disabled?0:90,
      alive:!disabled,angle:Math.PI,moveTime:999,actionTime:999,skill:0,
      shots:disabled?HOSTILE_ROUNDS:0,lastSeenX:p.x,lastSeenZ:p.z,investigateUntil:0}));
  }
  const INTERACT_RADIUS = 4;
  const SUPPLY_REACH = 1.8; // Physical cache reach; larger radius remains for terminals/route triggers.
  const SWITCH_REACH = 1.1; // Reach the facade switch, not a remote 4m HUD activation.
  // Alternative staffed-side on-foot approach: deliberately off the historic
  // main x=0 records-counter corridor so older E-based playthroughs never
  // unexpectedly receive a dialog while walking their original path.
  const ROUTE_FORK=Object.freeze({x:-7,z:-43,radius:2.5});
  const POINTS = Object.freeze({
    terminal: Object.freeze({id:'terminal', x:0, z:-18, kind:'objective', label:'시민 중계기'}),
    supply: Object.freeze({id:'supply', x:5, z:-20, kind:'ammo', label:'현지 구조단 유한 보급 상자'}),
    recordA: Object.freeze({id:'recordA', x:17, z:-30, kind:'evidence', label:'항구 기록'}),
    recordB: Object.freeze({id:'recordB', x:-17, z:-30, kind:'evidence', label:'대피소 기록'}),
    decision: Object.freeze({id:'decision', x:0, z:-41, kind:'objective', label:'교차 확인 콘솔'}),
    relay: Object.freeze({id:'relay', x:8, z:-42, kind:'objective', label:'비상 통신 중계기 전원'}),
    // Jo Hyunji is present at this original public relay footpath after
    // unforeseen escalation, not remotely summoned from an unknown site.
    liaisonAssist: Object.freeze({id:'liaisonAssist',x:12,z:-39,
      kind:'objective',label:'조현지 · 현장 비상 통신 협의'}),
    beacon: Object.freeze({id:'beacon', x:-42, z:-27, kind:'objective', label:'항구 대피 안내 경고등 수동 스위치'}),
    muster: Object.freeze({id:'muster', x:-9, z:-55, kind:'evac', label:'유수프 구조단 집결지 현장 담당자'}),
    coordinatorRequest: Object.freeze({id:'coordinatorRequest',x:-9,z:-55,kind:'evac',label:'유수프 구조 책임자와 직접 대피 지원 협의'}),
    // A second staff-guided pedestrian approach, not a paperwork collection.
    eastLocalRequest: Object.freeze({id:'eastLocalRequest',x:19,z:-53,kind:'verify',label:'동쪽 현지 통제 담당자와 현장 통행 협의'}),
    dispatchLedger: Object.freeze({id:'dispatchLedger',x:-24,z:-57,kind:'evidence',label:'남쪽 구조단 접수 장부'}),
    // An observed person, not a remotely read dossier or a confirmed bus.
    transportDriver: Object.freeze({id:'transportDriver',x:10,z:-54,kind:'evac',label:'운송 담당자 나딤 · 현장 대화'}),
    driverReportDesk: Object.freeze({id:'driverReportDesk',x:-24,z:-57,kind:'evidence',label:'접수 장부에 운송 담당자 진술 대조·접수'}),
    guide: Object.freeze({id:'guide', x:-9, z:-55, kind:'evac', label:'현지 대피 안내원과 동행 시작'}),
    volunteer: Object.freeze({id:'volunteer', x:GUIDE_START.x, z:GUIDE_START.z, kind:'evac', label:'현지 안내원에게 직접 동행 요청'}),
    guideRelease: Object.freeze({id:'guideRelease', x:-9, z:-55, kind:'evac', label:'현지 구조단에 안내원 동행 인계'}),
    guideTransfer: Object.freeze({id:'guideTransfer', x:-12, z:-60, kind:'evac', label:'남쪽 현지 구조단 안내원 인계'}),
    aidPickup: Object.freeze({id:'aidPickup', x:-7, z:-47, kind:'objective', label:'민간 구조용 비상 물품 상자'}),
    aidDrop: Object.freeze({id:'aidDrop', x:-12, z:-60, kind:'evac', label:'현지 구조단 비상 물품 인계 지점'}),
    aidStage: Object.freeze({id:'aidStage', x:-7, z:-55, kind:'objective', label:'민간 비상 물품 임시 적재대'}),
    aidResume: Object.freeze({id:'aidResume', x:-7, z:-55, kind:'objective', label:'임시 적재된 민간 비상 물품'}),
    exitEvac: Object.freeze({id:'exitEvac', x:0, z:-61, kind:'evac', label:'안전한 안뜰'}),
    exitVerify: Object.freeze({id:'exitVerify', x:27, z:-61, kind:'verify', label:'추가 확인 경로'}),
    gateLog: Object.freeze({id:'gateLog', x:27, z:-66, kind:'evidence', label:'동쪽 현장 중계 기록함'}),
    reportDesk: Object.freeze({id:'reportDesk', x:18, z:-45, kind:'evidence', label:'현지 통제소 기록 접수대'}),
    officeBoard: Object.freeze({id:'officeBoard', x:87, z:26, kind:'evidence', label:'항구 주민 안내소 내부 게시판'}),
  });
  const RECORDS = Object.freeze({
    recordA: Object.freeze({title:'항구 중계 기록', time:'04:12', text:'서부 해안도로의 신호가 먼저 끊겼다고 기록되어 있다.'}),
    recordB: Object.freeze({title:'대피소 수신 기록', time:'04:07', text:'해안도로의 통신 두절을 이미 다섯 분 전에 보고했다.'})
  });
  // A concise non-blocking, three-beat predeparture/arrival reminder. The
  // captain ALREADY knows his deployment and return instructions before
  // leaving Korea. This is a camera/HUD narrative cue, never a collectible,
  // mission gate, change of authority, or new save-file field. The first
  // 10 seconds of genuine 60Hz playable CH01 time show the scenes once.
  const OPENING_BEATS=Object.freeze([
    Object.freeze({until:3.4,location:'출국 전 · 대한민국',
      subtitle:'이수혁 대위(회상): 정식 파견 지시와 복귀 계획을 한국에서 확인했다. 민간 통신 협력과 구호 인력 지원. 그게 원래 임무다.'}),
    Object.freeze({until:6.8,location:'도착 · 가상 해안 도시 나흐린',
      subtitle:'김지윤(현지 합류): 한국에서 브리핑받은 일정대로 연락을 점검한 뒤 복귀하겠습니다. 현지 판단은 유수프 구조단이 맡습니다.'}),
    Object.freeze({until:10.2,location:'도착 후 · 예상 밖 상황 변화',
      subtitle:'조현지(현장 무전): 도착한 뒤 충돌이 예상보다 빠르게 확대됐습니다. 복귀 경로를 재확인하고, 주민 이동은 유수프 구조단과 협의하겠습니다.'})
  ]);
  function openingBeat(state){
    if(!state||!['terminal','engagement'].includes(state.phase)||
      !Number.isFinite(state.world?.elapsed)||state.world.elapsed<0)return null;
    const beat=OPENING_BEATS.find(b=>state.world.elapsed<b.until);
    return beat?Object.freeze({location:beat.location,subtitle:beat.subtitle}):null;
  }
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
    world.obstacles=world.obstacles.filter(o=>o.type!=='yard-gate'&&o.type!=='yard-fence'&&o.type!=='yard-service-vehicle'&&o.type!=='volcanic-outcrop'&&!o.type.startsWith('dock-'));
    world.obstacles.push(...STORY_STRUCTURES.map(o=>({...o})));
    return world;
  }
  // The fictional civilian minibus and its on-foot driver must yield to ALL
  // existing living civilians and companions, not only the player/worker.
  // Bodies are read from this 60Hz world: no remote NPC detection, new quest,
  // extra F action, hidden route marker or client-supplied collision override.
  function localPublicPedestrians(state){
    return [state.world.player,state.worker,state.mara,state.kimJiyoon,
      state.world.liaison,state.civilianWalker,
      state.civicCrossing?.civilian,
      state.choice==='evacuation'&&state.musterConfirmed?state.guide:null]
      .filter(a=>a&&Number.isFinite(a.x)&&Number.isFinite(a.z));
  }
  // All authored civilians share one physical standing-body constraint,
  // not merely the captain and the chosen guide. The real player ALWAYS
  // obstructs an NPC even when an older save starts them overlapped (the
  // original liaison behavior). Other already-overlapped NPCs may walk OUT
  // to avoid trapping old v2 checkpoints. No teleport or remote guidance.
  function localCivilianBodies(state,mover,radius){
    const player=state.world.player,colliders=[];
    for(const person of localPublicPedestrians(state)){
      if(person===mover)continue;
      const width=person===player?1.7:1.1;
      const body={x:person.x,z:person.z,w:width,d:width};
      if(person===player||!Sim.blocked(mover.x,mover.z,radius,[body]))
        colliders.push(body);
    }
    return colliders;
  }
  function civilianVehiclePathClear(state,swept,van){
    return !state.world.obstacles.filter(o=>o!==van).some(o=>
        Math.abs(o.x-swept.x)*2<o.w+swept.w&&
        Math.abs(o.z-swept.z)*2<o.d+swept.d)&&
      localPublicPedestrians(state).every(a=>
        !Sim.blocked(a.x,a.z,.9,[swept]));
  }
  function syncCivilianShuttle(state){
    const v=state.transportVan,obstacles=state.world.obstacles;
    const i=obstacles.findIndex(o=>o.routeId==='story-civil-transport');
    if(!v){if(i>=0)obstacles.splice(i,1);state.world.transportVan=null;return;}
    if(i>=0)obstacles[i].z=v.z;
    else obstacles.push({x:CIVILIAN_SHUTTLE.x,z:v.z,w:CIVILIAN_SHUTTLE.w,
      d:CIVILIAN_SHUTTLE.d,h:CIVILIAN_SHUTTLE.h,
      type:'story-civil-transport',routeId:'story-civil-transport'});
    // The rendering state is derived from the SAME currently occupied road
    // that owns actual vehicle motion. Check it during every world sync, too:
    // other existing scene updates can rebuild this object after the car
    // motion tick, and an old save must regain a correct brake-light state.
    const body=obstacles.find(o=>o.routeId==='story-civil-transport');
    const boarded=!hasOwn(v,'driverZ')||
      v.driverZ<=CIVILIAN_SHUTTLE.boardZ+1e-8;
    const ahead=Math.min(CIVILIAN_SHUTTLE.endZ,
      v.z+CIVILIAN_SHUTTLE.speed/60);
    const swept={x:CIVILIAN_SHUTTLE.x,z:(ahead+v.z)/2,
      w:CIVILIAN_SHUTTLE.w,d:CIVILIAN_SHUTTLE.d+ahead-v.z};
    const physicallyHeld=!v.arrived&&boarded&&body&&ahead>v.z+1e-8&&
      !civilianVehiclePathClear(state,swept,body);
    state.world.transportVan={x:CIVILIAN_SHUTTLE.x,z:v.z,arrived:v.arrived,
      yielding:!v.arrived&&
        ((Number.isFinite(v.pauseUntil)&&v.pauseUntil>state.world.elapsed)||
         physicallyHeld)};
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
    const debrisIndex=state.world.obstacles.findIndex(o=>o.routeId==='story-fallen-awning');
    const awningX=FALLEN_AWNING.x+state.awningShift*AWNING_SLIDE;
    if(state.awningFallen&&debrisIndex<0)
      state.world.obstacles.push({...FALLEN_AWNING,x:awningX});
    else if(state.awningFallen&&debrisIndex>=0)
      state.world.obstacles[debrisIndex].x=awningX;
    else if(debrisIndex>=0)
      state.world.obstacles.splice(debrisIndex,1);
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
  // Presentation-only 60Hz body orientation for existing visible civilians.
  // Heading follows witnessed displacement; a stationary character turns
  // toward a physically nearby, unobstructed captain only. A remote player
  // never rotates an unseen person through a wall. This does not change
  // authored decisions, body collision, quest markers or V2 save schema.
  function syncVisibleCharacterFacing(state,dt){
    const world=state.world,p=world.player;
    const memory=world.civilianFacing||(world.civilianFacing=Object.create(null));
    const roles=[
      ['kimJiyoon',state.kimJiyoon,world.kimJiyoon],
      ['mara',state.mara,world.mara],
      ['liaison',world.liaison,world.liaison],
      ['civicCrossing',state.civicCrossing?.civilian,world.civicCrossing]
    ];
    for(const [key,person,visible] of roles){
      if(!person||!visible||!Number.isFinite(person.x)||!Number.isFinite(person.z))
       continue;
      const old=memory[key],dx=old?person.x-old.x:0,dz=old?person.z-old.z:0;
      let target=old?old.yaw:0;
      if(Math.hypot(dx,dz)>1e-4)
       target=Math.atan2(dx,-dz);
      else if(Math.hypot(person.x-p.x,person.z-p.z)<=4.8&&
              !Sim.lineBlocked(person.x,person.z,p.x,p.z,world.obstacles))
       target=Math.atan2(p.x-person.x,-(p.z-person.z));
      const current=old?old.yaw:target;
      const change=Math.atan2(Math.sin(target-current),Math.cos(target-current));
      const maxTurn=3*Math.max(0,Math.min(dt,.05));
      const yaw=Math.atan2(Math.sin(current+clamp(change,-maxTurn,maxTurn)),
       Math.cos(current+clamp(change,-maxTurn,maxTurn)));
      // Only the renderer's existing world clone receives an orientation.
      // It is never added to the saved physical actor record.
      visible.angle=yaw;
      memory[key]={x:person.x,z:person.z,yaw};
    }
  }
  function createState(weaponId='carbine') {
    const state={version:VERSION,phase:'terminal',found:[],choice:null,relayRestored:false,beaconEnabled:false,flashlightOn:false,flashlightTicks:HEADLAMP_TICKS,gateLogReviewed:false,logHandedOff:false,musterConfirmed:false,dispatchReviewed:false,transportContact:0,driverReportFiled:false,officeBoardRead:false,civicVisited:false,waterSurveyed:false,waterReportFiled:false,
      passageWarningHeard:false,transportVan:null,awningFallen:false,awningShift:0,awningWorking:false,civilianRerouted:false,
      mara:newMarketMara(),liaisonZ:LIAISON_WALK.startZ,
      kimJiyoon:newKimJiyoon(),kimAftercareReviewed:false,kimWaiting:false,
      civicCrossing:Civic?Civic.initial():null,
      // Retained solely to load v2 saves produced before the Korea-briefing correction.
      deploymentReviewed:false,
      aidPickedUp:false,aidDelivered:false,aidStaged:false,drainCleared:false,drainClearTicks:0,worker:newWorker(),workerInterviewed:false,civilianWalker:newCivilianWalker(),guide:{active:false,arrived:false,released:false,waiting:false,x:GUIDE_START.x,z:GUIDE_START.z},gateReadyAt:0,gateClearanceDuration:GATE_CLEARANCE_SECONDS,gateObstructed:false,world:createWorld(weaponId),
      combat:{started:false,cleared:false,supportUsed:false,supplyUsed:false,supplyRemaining:12,nextPulseAt:0},
      subtitle:'김도겸 중사(무전): 대위님, 한국에서 출국하기 전에 받은 파견 지시는 현지 연락망 확인과 구호 인력 지원이었습니다. 우리가 도착한 뒤 내전이 예상보다 빠르게 번졌고, 귀환 경로도 불확실해졌습니다. 유수프 구조단이 주민 대피 지원을 요청하고 있습니다.',message:'CH01 / 마지막 방송 · 예상 밖 내전 격화'};
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
  // A moving witness only offers an optional, *local* conversation.
  // Do not expose a worker's position through walls or from across the map.
  function workerInterviewMarkers(state) {
    if(state.workerInterviewed||!state.worker||
       !['records','decision','exit'].includes(state.phase))return [];
    const w=state.worker,p=state.world.player;
    if(Math.hypot(w.x-p.x,w.z-p.z)>=7||
       Sim.lineBlocked(p.x,p.z,w.x,w.z,state.world.obstacles))return [];
    return [{id:'harborWorker',x:w.x,z:w.z,kind:'evidence',
      label:'항구 작업자에게 현장에서 목격 사실 확인'}];
  }
  // A resident chooses their own short approach after an actual face-to-face
  // exchange. This is optional, temporary and LOCAL: no remote quest pointer,
  // escort order or second paperwork pickup is created.
  function residentRouteMarkers(state){
    const w=state.civilianWalker,p=state.world.player;
    if(!w||w.arrived||w.z<=-54||state.civilianRerouted||!state.combat.cleared||
       !['records','decision','exit'].includes(state.phase))return [];
    if(Math.hypot(w.x-p.x,w.z-p.z)>=3.5||
       Sim.lineBlocked(p.x,p.z,w.x,w.z,state.world.obstacles))return [];
    return [{id:'residentRoute',x:w.x,z:w.z,kind:'evac',
      label:'현지 주민과 구조단 접근로 직접 대화'}];
  }
  // Unlike a quest arrow, a crossing resident offers a local optional F
  // interaction only after the player has observed the disrupted street.
  // Reaching the physical far curb, rather than accepting a conversation,
  // is the persistent consequence of this locally witnessed city event.
  // Older v2 checkpoints already carry the full crossing position; no new
  // save field, quest gate or omniscient remote report is introduced.
  function civicCrossingReached(state){
    const c=state.civicCrossing;
    return !!(c&&c.disrupted&&c.assisted&&
      Math.hypot(c.civilian.x-c.destination.x,c.civilian.z-c.destination.z)<1e-6);
  }
  function civicCrossingArrivalCheckpoint(wasReached,state){
    return wasReached===false&&civicCrossingReached(state)&&
      ['records','decision','exit','complete'].includes(state.phase);
  }
  function civicCrossingMarkers(state){
    if(!Civic||!state.civicCrossing?.disrupted||
       state.civicCrossing.assisted||
       !['records','decision','exit'].includes(state.phase))return [];
    const p=state.world.player,m=Civic.CROSSING;
    if(Math.hypot(p.x-m.x,p.z-m.z)>=6||
       Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles))return [];
    return [{id:'civicCrossing',x:m.x,z:m.z,kind:'evac',
      label:'통행로 옆 현지 주민에게 직접 길을 안내'}];
  }
  function onsiteLiaisonMarkers(state){
    if(!state.combat?.cleared||state.relayRestored||
       !['records','decision'].includes(state.phase))return [];
    const p=state.world.player,m=POINTS.liaisonAssist;
    return Math.hypot(p.x-m.x,p.z-m.z)<6&&
      !Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles)?[m]:[];
  }
  // A face-to-face civilian-led evacuation request is offered only when the
  // coordinator is actually in reach and visible. No paperwork, remote route
  // menu, map-wide actor tracking or checkpoint schema change is introduced.
  function coordinatorRequestMarkers(state) {
    if(!['records','decision'].includes(state.phase))return [];
    const p=state.world.player,m=POINTS.coordinatorRequest;
    return Math.hypot(p.x-m.x,p.z-m.z)<7&&
      !Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles)?[m]:[];
  }
  // A face-to-face, purely optional street-side request to a visible local
  // driver. No paperwork, remote vehicle dispatch or invented passenger rescue.
  // The vehicle remains a physical collider and its route never teleports.
  function eastLocalRequestMarkers(state){
    if(!state.combat?.cleared||!['records','decision'].includes(state.phase))return [];
    const p=state.world.player,m=POINTS.eastLocalRequest;
    return Math.hypot(p.x-m.x,p.z-m.z)<6&&
      !Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles)?[m]:[];
   }
  function transportYieldMarkers(state){
    const v=state.transportVan,p=state.world.player;
    if(!v||v.arrived||state.phase!=='exit'||state.choice!=='evacuation'||
      (hasOwn(v,'driverZ')&&v.driverZ>CIVILIAN_SHUTTLE.boardZ+1e-8))return [];
    const marker={id:'transportYield',x:CIVILIAN_SHUTTLE.x+CIVILIAN_SHUTTLE.w/2+1.1,
      z:v.z,kind:'evac',label:v.pauseUntil>state.world.elapsed
        ?'나딤 운송 차량에 현장에서 출발 신호':'나딤 운송 차량에 현장에서 잠시 정차 요청'};
    if(Math.hypot(p.x-marker.x,p.z-marker.z)>6||
      Sim.lineBlocked(p.x,p.z,marker.x,marker.z,
        state.world.obstacles.filter(o=>o.routeId!=='story-civil-transport')))return [];
    return [marker];
  }
  function officeMarkers(state) {
    // Keep physical interaction objects in the original world collection.
    // Hiding the authoritative marker breaks old saved interactions and
    // E-key fixtures; visibility is a separate PC navigation concern.
    return state.officeBoardRead?[]:[POINTS.officeBoard];
  }
  function localAwningMarker(state) {
    if(!state.awningFallen||state.awningShift>=1||!state.combat.cleared||
       !['records','decision','exit'].includes(state.phase))return [];
    const p=state.world.player;
    return Math.hypot(p.x-AWNING_HANDLE.x,p.z-AWNING_HANDLE.z)<6 &&
      !Sim.lineBlocked(p.x,p.z,AWNING_HANDLE.x,AWNING_HANDLE.z,state.world.obstacles)
      ?[AWNING_HANDLE]:[];
  }
  // Optional, fully local character scene: after Mara has PHYSICALLY crossed
  // the cleared market lane, the captain may talk to her at arm's reach.
  // This adds no investigation, route gate, quest arrow or save-file field.
  function maraConversationMarkers(state) {
    if(!state.mara?.arrived||state.awningShift!==1||
       !['records','decision','exit'].includes(state.phase))return [];
    const p=state.world.player,m=state.mara;
    return Math.hypot(p.x-m.x,p.z-m.z)<4.8&&
      !Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles)
      ?[{id:'maraConversation',x:m.x,z:m.z,kind:'objective',
        label:'마라와 현장에서 직접 대화'}]:[];
  }
  // This is a nearby, *optional* civic action only after the crisis. It does
  // not add a global objective or change either existing exit requirement.
  function streetDrainMarkers(state) {
    if(!StreetFlood||!state.combat?.cleared||state.drainCleared||
       state.drainClearTicks>0||!['records','decision','exit'].includes(state.phase))return [];
    const p=state.world.player,m=StreetFlood.DRAIN;
    return Math.hypot(p.x-m.x,p.z-m.z)<5&&
      !Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles)?[m]:[];
  }
  // Optional ON-SITE character beat: Kim Jiyoon reflects only on a civilian
  // action that was physically completed or witnessed. This is never a remote
  // contact, map-wide quest marker, mandatory paperwork or second exit gate.
  // His own 60Hz collidable location, the player's reach and solid-wall LOS
  // determine whether F can start a real conversation in the existing level.
  function kimAftercareMarkers(state){
    if(state.kimAftercareReviewed||!state.kimJiyoon||
       !state.combat?.cleared||
       !['records','decision','exit'].includes(state.phase)||
       !(state.aidDelivered||state.guide.released||
         state.civicCrossing?.assisted||
         state.workerInterviewed||state.logHandedOff))
      return [];
    const p=state.world.player,k=state.kimJiyoon;
    if(Math.hypot(p.x-k.x,p.z-k.z)>5.5||
       Sim.lineBlocked(p.x,p.z,k.x,k.z,state.world.obstacles))return [];
    return [{id:'kimAftercare',x:k.x,z:k.z,kind:'objective',
      label:'김지윤 · 확인한 민간 현장 상황 직접 공유'}];
  }
  // A genuinely nearby companion can be asked to hold position and then
  // resume walking. This is optional human coordination, not a global squad
  // command, teleport, route gate or new campaign objective. Every prompt
  // is grounded in actual body distance and an unobstructed local view.
  function kimControlMarkers(state){
    if(!state.kimJiyoon||!state.combat?.cleared||
       !['records','decision','exit'].includes(state.phase))return [];
    const p=state.world.player,k=state.kimJiyoon;
    if(Math.hypot(p.x-k.x,p.z-k.z)>3.0||
       Sim.lineBlocked(p.x,p.z,k.x,k.z,state.world.obstacles))return [];
    return [{id:'kimControl',x:k.x,z:k.z,kind:'objective',
      label:state.kimWaiting?'김지윤 · 현장 동행 재개':'김지윤 · 이 자리에서 대기 요청'}];
  }
  function markers(state) {
    if (state.phase==='terminal') return [POINTS.terminal];
    if (state.phase==='engagement') return state.combat.supplyRemaining===0?[]:[POINTS.supply];
    if (state.phase==='records'||state.phase==='decision') return [
      ...(['recordA','recordB'].filter(id=>!state.found.includes(id)).map(id=>POINTS[id])),
      POINTS.decision,
      ...coordinatorRequestMarkers(state),...eastLocalRequestMarkers(state),...onsiteLiaisonMarkers(state),...kimAftercareMarkers(state),...kimControlMarkers(state),
      ...(!state.relayRestored||state.phase==='decision'?[POINTS.relay]:[]),
      ...warningMarkers(state),...workerInterviewMarkers(state),...residentRouteMarkers(state),...civicCrossingMarkers(state),...localAwningMarker(state),...maraConversationMarkers(state),...streetDrainMarkers(state),...officeMarkers(state),
      ...(state.combat.supplyRemaining>0?[POINTS.supply]:[])
    ];
    if (state.phase==='exit') return state.choice==='verification'
      ?[POINTS.exitVerify,...kimAftercareMarkers(state),...kimControlMarkers(state),...officeMarkers(state),...workerInterviewMarkers(state),...residentRouteMarkers(state),...civicCrossingMarkers(state),...localAwningMarker(state),...maraConversationMarkers(state),...streetDrainMarkers(state),...(state.combat.supplyRemaining>0?[POINTS.supply]:[]),...(!state.gateLogReviewed?[POINTS.decision]:[]),...(gateOpen(state)&&!state.gateLogReviewed?[POINTS.gateLog]:[]),
         ...(state.gateLogReviewed&&!state.logHandedOff?[POINTS.reportDesk]:[]),...warningMarkers(state),POINTS.relay]:
      [POINTS.exitEvac,...kimAftercareMarkers(state),...kimControlMarkers(state),...officeMarkers(state),...workerInterviewMarkers(state),...residentRouteMarkers(state),...civicCrossingMarkers(state),...localAwningMarker(state),...maraConversationMarkers(state),...streetDrainMarkers(state),...transportYieldMarkers(state),...(!state.dispatchReviewed&&!state.transportVan?[POINTS.dispatchLedger]:[]),
         ...((state.transportContact===0||(state.transportContact===1&&!state.transportVan))?[POINTS.transportDriver]:[]),
         ...(state.dispatchReviewed&&state.transportContact===2&&!state.driverReportFiled&&!state.transportVan?[POINTS.driverReportDesk]:[]),
         ...(state.combat.supplyRemaining>0?[POINTS.supply]:[]),...(!state.aidPickedUp&&!state.musterConfirmed&&state.found.length===2?[POINTS.decision]:[]),...(state.musterConfirmed?[]:[POINTS.muster]),
         // The actual waiting volunteer can be approached directly. This is
         // optional physical assistance, not another form or mission gate.
         ...(!state.musterConfirmed&&!state.guide.active&&
           Math.hypot(state.world.player.x-GUIDE_START.x,state.world.player.z-GUIDE_START.z)<6&&
           !Sim.lineBlocked(state.world.player.x,state.world.player.z,
             GUIDE_START.x,GUIDE_START.z,state.world.obstacles)?[POINTS.volunteer]:[]),
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
  // Physical interaction authority remains in markers()/nearest(). Only the
  // informational PC navigation display is filtered: routine civilian aid,
  // papers, notices and local actors never become cross-city quest arrows.
  // The key route decisions and exits remain findable from older checkpoints.
  const ROUTE_WIDE_MARKERS=Object.freeze(new Set([
    'terminal','decision','exitEvac','exitVerify'
  ]));
  function navigationMarkers(state) {
    const p=state.world.player;
    return markers(state).filter(marker=>{
      if(ROUTE_WIDE_MARKERS.has(marker.id))return true;
      // A legacy optional paper notice never becomes a distant HUD errand.
      // Its E-key world marker is retained for old checkpoint compatibility.
      const maxDistance=marker.id==='officeBoard'?7:
        marker.id==='relay'?7:9;
      return Math.hypot(marker.x-p.x,marker.z-p.z)<=maxDistance&&
        !Sim.lineBlocked(p.x,p.z,marker.x,marker.z,state.world.obstacles);
    });
  }
  // A local civilian announcement is only readable while the player is in
  // physical earshot of the powered relay. It conveys no secret civilian
  // positions, does not issue a new task and adds no checkpoint fields.
  function localPublicAddress(state) {
    if(!state.relayRestored||
      !['records','decision','exit'].includes(state.phase))return null;
    const p=state.world.player,r=POINTS.relay;
    if(Math.hypot(p.x-r.x,p.z-r.z)>14||
       Sim.lineBlocked(p.x,p.z,r.x,r.z,state.world.obstacles))return null;
    const line=state.choice==='evacuation'
      ?'유수프 구조단이 남쪽 현장 통로를 맡고 있습니다. 주민 접수와 실제 이동 여부는 담당자에게 직접 확인해 주십시오.'
      :state.choice==='verification'
        ?'동쪽 통로의 개방 여부는 현지 담당자의 안내를 따르십시오. 확인되지 않은 복귀 교통편은 안내할 수 없습니다.'
        :'남쪽 주민 지원은 현지 구조단이 진행합니다. 이동 경로는 담당자와 직접 협의해 주십시오.';
    return Object.freeze({speaker:'현지 구조단 안내 방송 · 텍스트 미리보기',message:line});
  }
  function syncMarkers(state) {
    // Renderer consumes the same saved physical relay state as mission rules.
    state.world.guide=state.choice==='evacuation'?state.guide:null;
    state.world.worker=state.worker;
    state.world.mara=state.mara?{...state.mara,role:'mara'}:null;
    state.world.kimJiyoon=state.kimJiyoon?
      {...state.kimJiyoon,role:'kim-jiyoon'}:null;
    state.world.liaison=state.combat.cleared&&
      ['records','decision','exit','complete'].includes(state.phase)
      ?{x:LIAISON_WALK.x,z:state.liaisonZ,role:'jo-hyunji'}:null;
    state.world.civilianWalker=state.civilianWalker;
    state.world.civicCrossing=state.civicCrossing?
      {...state.civicCrossing.civilian,role:'civic-crossing-resident'}:null;
    state.world.civicCrossingArrived=civicCrossingReached(state);
    syncCivilianShuttle(state);
    state.world.witness=transportWitness(state);
    // The occupied harbor's original civic street lamps are lit while the
    // captain first walks the neighborhood. The unexpected local grid loss
    // switches them off at the actual 60Hz incident. Restoring the emergency
    // relay powers only its OWN small wall lamps, not the entire city grid.
    // Derive this directly from validated mission phase: legacy V2 checkpoint
    // saves never receive an invented global power restoration flag.
    state.world.publicStreetPowered=state.phase==='terminal';
    state.world.relayRestored=state.relayRestored;
    state.world.beaconEnabled=state.beaconEnabled;
    state.world.flashlightOn=state.flashlightOn;
    state.world.flashlightTicks=state.flashlightTicks;
    // Derive the same public street-water patch after a witnessed disruption.
    // v2 saves need no new checkpoint field: their validated phase persists.
    state.world.streetFlood=StreetFlood&&StreetFlood.visible(state.phase)
      ?(state.drainCleared?{...StreetFlood.PATCH,cleared:true}:
        state.drainClearTicks>0?{...StreetFlood.PATCH,
          repairProgress:state.drainClearTicks/StreetFlood.CLEAR_TICKS}:
          StreetFlood.PATCH):null;
    state.world.gateLogReviewed=state.gateLogReviewed;
    state.world.logHandedOff=state.logHandedOff;
    // Preserve the authored marker identity separately from the renderer's
    // numeric id: two objectives can share the same kind and list length while
    // referring to different physical locations (e.g. aid pickup vs resume).
    state.world.loot=markers(state).map((p,i)=>({id:i,markerId:p.id,x:p.x,z:p.z,kind:p.kind,picked:false}));
    return state;
  }
  function refreshMovingActorMarkers(state) {
    // Both the on-foot witness and optional escort can move at 60Hz. Retain
    // static marker identity and update only the position of locally visible
    // actors. Rebuild markers only when approaching/leaving observation range
    // or when an interaction changes the available objectives.
    const visible=markers(state),rendered=state.world.loot;
    if(!Array.isArray(rendered)||rendered.length!==visible.length||
       visible.some((marker,i)=>!rendered[i]||rendered[i].kind!==marker.kind||
         rendered[i].markerId!==marker.id)){
      syncMarkers(state);
      return;
    }
    for(const id of ['guideControl','harborWorker','residentRoute','kimAftercare']){
      const i=visible.findIndex(marker=>marker.id===id);
      if(i<0)continue;
      rendered[i].x=visible[i].x;
      rendered[i].z=visible[i].z;
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
    // Finite-height cover is sampled at the head/shoulders, not used as an aim shortcut.
    const sideX=-dz/distance*.85*.8,sideZ=dx/distance*.85*.8;
    const blockers=state.world.obstacles.concat(actorBlockers(state,hostile));
    const visible=(x,z)=>{
      const vx=x-hostile.x,vz=z-hostile.z,range=Math.hypot(vx,vz);
      if(range>sightRange||
        Sim.lineBlocked3D(hostile.x,1.64,hostile.z,x,p.crouched?1.2:1.75,z,blockers))return false;
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
      // the actual civilian, with a clear path to each. The local F prompt
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
          marker.id==='transportDriver'||marker.id==='transportYield'?2.3:
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
  // Reaching a physically open, staffed corridor should conclude the short
  // preview by actual travel, not a magic F press on an invisible finish box.
  // The historical F interaction remains supported for saved game sessions.
  // Derived from existing V2 evidence on both first completion and
  // checkpoint restore. Never persist a transient voice line or invent
  // unseen civilian results when reloading an already finished chapter.
  function completionRecap(state){
    return state.choice==='verification'
      ?'이수혁 대위: 동쪽 통로가 실제로 열렸다. 기록 시각이 다른 원인은 아직 확인되지 않았다.'
      :state.musterConfirmed===true
        ?'이수혁 대위: 남쪽 구조단 담당자와 직접 협의했다. 확인되지 않은 주민의 이동까지 완료로 보고하지 않겠다.'
        :'이수혁 대위: 남쪽 안뜰에 실제로 도착했다. 주민 접수 인원과 현장 이송 결과는 아직 확인하지 못했다.';
  }
  function finishAtExit(state){
    state.phase='complete';state.world.status='won';
    state.subtitle=completionRecap(state);
    state.message='CH01 완료 · 첫 번째 신호가 복구되었습니다.';
  }
  function step(state, dt, input={}) {
    if(state.phase==='complete'||state.phase==='failed')return state;
    // A paused/invalid frame must never advance a hostile volley, route motor or RNG.
    if(!Number.isFinite(dt)||dt<=0)return state;
    const t=clamp(dt,0,.05),p=state.world.player;
    p.crouched=!!input.crouch;
    // Battery drain follows the ALREADY PERSISTED world clock's crossed 60Hz
    // boundaries, not the number or size of render/frame callbacks.
    // Four 1/240-second slices consume exactly one tick, just like one
    // 1/60-second update; an interrupted V2 save retains the same phase with
    // NO new checkpoint fields. Paused/off time never consumes the battery.
    if(state.flashlightOn){
      const previousBattery=state.flashlightTicks;
      const beforeTick=Math.floor(state.world.elapsed*60+1e-7);
      const afterTick=Math.floor((state.world.elapsed+t)*60+1e-7);
      const drain=Math.max(0,Math.min(3,afterTick-beforeTick));
      state.flashlightTicks=Math.max(0,state.flashlightTicks-drain);
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
      Sim.injuryMobility(p)*(state.world.carryingAid
        ?0.72*(0.78+0.22*p.stamina/100):1)*
      (StreetFlood?StreetFlood.mobility(state.phase,p.x,p.z,state.drainCleared||state.world.streetFlood):1);
    const occupied=actorBlockers(state).filter(body=>!Sim.blocked(p.x,p.z,.85,[body]));
    // A real actor blocks walking through their position. Historic saves
    // starting in an overlap can still move out of the footprint.
    if(state.world.witness){
      const w=state.world.witness,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
    // The civilian worker is also a collidable human, never an intangible
    // figure that the player can walk through on a pedestrian path.
    if(state.worker){
      const w=state.worker,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
    if(state.mara){
      const w=state.mara,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
    if(state.world.liaison){
      const w=state.world.liaison,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
    if(state.kimJiyoon){
      const w=state.kimJiyoon,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
    if(state.civilianWalker){
      const w=state.civilianWalker,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
    if(state.civicCrossing){
      const w=state.civicCrossing.civilian,body={x:w.x,z:w.z,w:1.1,d:1.1};
      if(!Sim.blocked(p.x,p.z,.85,[body]))occupied.push(body);
    }
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
    // The captain reports an opening only after physically crossing this new
    // hall's doorway during combat. No distant route discovery, mandatory
    // investigation or new checklist: walking through the hall is sufficient.
    if(state.phase==='engagement'&&Math.abs(p.x-42)<1.15&&
      ((beforeZ>-27.75&&p.z<=-27.75)||(beforeZ<-48.25&&p.z>=-48.25))){
      state.subtitle='이수혁 대위(무전): 창고 안쪽 통로가 열려 있다. 화물 뒤를 확인하며 반대편으로 이동한다.';
      state.message='항구 창고 진입 · 반대편 출입구로 통과 가능';
    }
    // Carrying real relief supplies is tiring when ACTUALLY walking, but
    // stopping anywhere lets the captain recover. The same server-clocked
    // body displacement drives effort; pressing into a wall does not drain
    // stamina, and crouching with the crate requires less sustained effort.
    // This derives entirely from existing V2-stored stamina/cargo state.
    const moving=movedDistance>1e-7,sprinting=sprint&&moving;
    const loadedWalking=state.world.carryingAid&&moving;
    const exertion=sprinting?-20:loadedWalking?(input.crouch?-3:-7):13;
    p.stamina=clamp(p.stamina+exertion*t,0,100);
    Sim.updateStress(p,t,sprinting);
    state.world.elapsed+=t;
    // Repair takes three REAL seconds beside a reachable public drain.
    // Walking away, carrying the large aid crate or leaving the active scene
    // cancels progress. The player never repairs anything remotely or at pause.
    if(StreetFlood&&state.drainClearTicks>0&&!state.drainCleared){
      const m=StreetFlood.DRAIN;
      const near=Math.hypot(p.x-m.x,p.z-m.z)<=m.radius&&
        !Sim.lineBlocked(p.x,p.z,m.x,m.z,state.world.obstacles);
      if(!near||state.world.carryingAid||
         !['records','decision','exit'].includes(state.phase)){
        state.drainClearTicks=0;
      }else{
        state.drainClearTicks=Math.min(StreetFlood.CLEAR_TICKS,
          state.drainClearTicks+Math.max(1,Math.round(t*60)));
        if(state.drainClearTicks===StreetFlood.CLEAR_TICKS){
          state.drainClearTicks=0;state.drainCleared=true;
          state.subtitle='현지 주민: 막혔던 배수구가 정리됐어요. 물이 모두 마른 것은 아니지만 이제 바닥이 덜 미끄럽겠네요.';
          state.message='공공 보행로 배수구 정리 완료 · 젖은 노면은 남아 있음';
          syncMarkers(state);
        }
      }
    }
    // The renderer reads the same 60Hz progress as gameplay, never a
    // cosmetic independent countdown. A cancelled repair clears its preview.
    if(StreetFlood&&!state.drainCleared&&StreetFlood.visible(state.phase))
      state.world.streetFlood=state.drainClearTicks>0
        ?{...StreetFlood.PATCH,repairProgress:state.drainClearTicks/StreetFlood.CLEAR_TICKS}
        :StreetFlood.PATCH;
    if(Civic&&state.civicCrossing){
      // Nearby people occupy the SAME physical pavement as this resident.
      // Exclude the moving resident itself; positions come from the live
      // story world, never from a remote NPC marker or client GPS.
      const crossing=state.civicCrossing.civilian;
      const pedestrians=localPublicPedestrians(state).filter(person=>
        person!==p&&person!==crossing);
      state.civicCrossing=Civic.step(state.civicCrossing,{
        disruption:state.phase!=='terminal',player:p,pedestrians,
        blocked:(x,z)=>Sim.blocked(x,z,.55,state.world.obstacles)
      });
      state.world.civicCrossing={
        ...state.civicCrossing.civilian,role:'civic-crossing-resident'
      };
      state.world.civicCrossingArrived=civicCrossingReached(state);
    }
    // Unlike a fixed escort waypoint, Kim independently changes behavior
    // when the ordinary harbor becomes unsafe. He moves to the existing
    // staffed street during the first crisis and follows the captain once
    // the immediate episode clears. No teleports, distant sensor reports,
    // new mission checklist or UI-follow arrow.
    if(state.kimJiyoon&&['terminal','engagement','records','decision','exit'].includes(state.phase)){
      const w=state.kimJiyoon;
      const keepNear=state.phase==='terminal'||state.combat.cleared;
      const goal=keepNear?{
        x:p.x-Math.sin(p.yaw)*2.6,
        z:p.z+Math.cos(p.yaw)*2.6
      }:KIM_JIYOON_STAFFED;
      const dx=goal.x-w.x,dz=goal.z-w.z,distance=Math.hypot(dx,dz);
      // No forced sprint toward an unobserved distant player.
      const followSpeed=distance>8?5:distance>3?3.3:1.8;
      if(!state.kimWaiting&&distance>.36&&distance<55){
        const others=[p,state.worker,state.mara,state.civilianWalker,
          state.world.liaison,state.choice==='evacuation'&&state.guide.active?
            state.guide:null].filter(Boolean)
          .map(person=>({x:person.x,z:person.z,w:1.1,d:1.1}));
        const solids=state.world.obstacles.concat(actorBlockers(state),others);
        // Story companion steering first checks real building colliders.
        // An obstacle between him and the captain means walking around it,
        // never walking straight into the facade forever or teleporting.
        // Recompute from saved 60Hz poses each step: no hidden route cache
        // or new v2 checkpoint fields that change replay after Continue.
        // Keep each search deliberately bounded for an offline PC frame.
        let target=goal;
        if(Footpaths&&distance>2){
          const widened=state.world.obstacles.map(o=>({
            x:o.x,z:o.z,w:o.w+1.1,d:o.d+1.1
          }));
          if(Sim.lineBlocked(w.x,w.z,goal.x,goal.z,widened)){
            const path=Footpaths.plan(w,goal,state.world.obstacles,{maxVisits:420});
            if(path&&path.length>1)target=path[1];
          }
        }
        const stepX=target.x-w.x,stepZ=target.z-w.z,
          steerDistance=Math.hypot(stepX,stepZ);
        if(steerDistance>1e-8){
          // The companion stands on the same shallow civilian street as the
          // captain. His independent walking must respect that terrain too:
          // otherwise an NPC glides at dry-ground pace through the flooded
          // patch while the player is physically slowed. This reads the
          // existing 60Hz drain state and adds no checkpoint or quest flag.
          const footing=StreetFlood
            ?StreetFlood.mobility(state.phase,w.x,w.z,state.drainCleared||state.world.streetFlood):1;
          const pace=Math.min((keepNear?followSpeed:1.8)*footing,
            steerDistance/t);
          Sim.moveEntity(w,stepX/steerDistance*pace,stepZ/steerDistance*pace,
            t,solids,.55);
        }
      }
      if(state.world.kimJiyoon){
        state.world.kimJiyoon.x=w.x;
        state.world.kimJiyoon.z=w.z;
      }
    }
    // The lightweight awning frame is pulled along the actual street edge
    // over multiple fixed ticks. Stop if an actor occupies its swept footprint
    // or the captain walks away; never jump, vanish or overlap a pedestrian.
    if(state.awningWorking&&state.awningShift<1 &&
       Math.hypot(p.x-AWNING_HANDLE.x,p.z-AWNING_HANDLE.z)<4.5) {
      const current=FALLEN_AWNING.x+state.awningShift*AWNING_SLIDE;
      const traveled=state.awningShift+t/AWNING_SLIDE_SECONDS;
      const fraction=traveled>=1-1e-9?1:traveled;
      const proposed=FALLEN_AWNING.x+fraction*AWNING_SLIDE;
      const swept={...FALLEN_AWNING,x:(current+proposed)/2,
        w:FALLEN_AWNING.w+Math.abs(proposed-current)};
      const actors=[p,...state.world.bots.filter(bot=>bot.alive),
        state.worker,state.civilianWalker,state.mara,
        state.guide.active?state.guide:null].filter(Boolean);
      if(!actors.some(body=>Sim.blocked(body.x,body.z,.8,[swept]))) {
        state.awningShift=fraction;
        if(state.awningShift===1){
          state.awningWorking=false;
          state.subtitle='마라(현지 기술자): 차양이 통행 구역에서 벗어났습니다. 길은 확보됐지만 주민 이동은 구조단이 판단합니다.';
          state.message='차양 프레임을 실제 이동으로 치움 · 보행 통로 확보';
        }
        syncRoute(state);
      }
    }
    // After the real awning clears, Mara independently crosses the public
    // market walkway. At any 60Hz step, a physical wall or person stops her.
    // No client-assigned route, remote rescue notification, or new quest.
    if(state.mara&&!state.mara.arrived&&state.awningShift===1&&
       ['records','decision','exit'].includes(state.phase)){
      const w=state.mara,dx=MARA_PATH.endX-w.x,dz=MARA_PATH.endZ-w.z;
      const distance=Math.hypot(dx,dz);
      if(distance>.001){
        const pedestrians=localCivilianBodies(state,w,MARA_PATH.radius);
        Sim.moveEntity(w,dx/distance*MARA_PATH.speed,dz/distance*MARA_PATH.speed,
          t,state.world.obstacles.concat(actorBlockers(state),pedestrians),MARA_PATH.radius);
        w.x=clamp(w.x,MARA_PATH.startX,MARA_PATH.endX);
        w.z=clamp(w.z,MARA_PATH.endZ,MARA_PATH.startZ);
        if(state.world.mara){state.world.mara.x=w.x;state.world.mara.z=w.z;}
        if(Math.hypot(w.x-MARA_PATH.endX,w.z-MARA_PATH.endZ)<.028){
          w.x=MARA_PATH.endX;w.z=MARA_PATH.endZ;w.arrived=true;
          // The visible scene and the saved pedestrian must agree on the exact
          // arrival tick, including the final centimetres of the 60Hz walk.
          if(state.world.mara){state.world.mara.x=w.x;state.world.mara.z=w.z;state.world.mara.arrived=true;}
          if(Math.hypot(p.x-w.x,p.z-w.z)<9&&
             !Sim.lineBlocked(p.x,p.z,w.x,w.z,state.world.obstacles)){
            state.subtitle='마라(현지 기술자): 통로가 비어서 제 판단으로 골목으로 갑니다. 다른 주민들은 아직 확인하지 못했어요.';
            state.message='마라의 실제 보행 도착 확인 · 다른 주민은 미확인';
          }
        }
      }
    }
    // Once the local relay is really restored, Jo moves from its control
    // point toward the already walkable staffed footpath. The captain may
    // stand in her way; then she waits. The position is part of the same
    // validated v2 checkpoint, not a camera-only NPC or scripted jump.
    if(state.relayRestored&&state.world.liaison &&
       ['records','decision','exit'].includes(state.phase)&&
       state.liaisonZ>LIAISON_WALK.endZ+1e-8){
      const actor=state.world.liaison;
      const otherPeople=localCivilianBodies(state,actor,LIAISON_WALK.radius);
      const colliders=state.world.obstacles.concat(actorBlockers(state),otherPeople);
      const speed=Math.min(LIAISON_WALK.speed,
        (state.liaisonZ-LIAISON_WALK.endZ)/t);
      Sim.moveEntity(actor,0,-speed,t,colliders,LIAISON_WALK.radius);
      state.liaisonZ=clamp(actor.z,LIAISON_WALK.endZ,LIAISON_WALK.startZ);
      // Fixed-step arithmetic can leave a few femtometres at the end point.
      // Snap only once the actual swept step is already within 1 micrometre;
      // never skip a collision or leap across a person.
      if(Math.abs(state.liaisonZ-LIAISON_WALK.endZ)<1e-6)
        state.liaisonZ=LIAISON_WALK.endZ;
      actor.z=state.liaisonZ;
    }
    // An unexpected escalation occurs in the actually visited harbor after
    // the short Korea/arrival recap. No recovered deployment paper, arbitrary
    // checkpoint checklist or press-E console is necessary. Retain the older
    // direct F interaction and save fields for legacy checkpoint compatibility.
    if(state.phase==='terminal'&&state.world.elapsed>=OPENING_BEATS[OPENING_BEATS.length-1].until&&
       Math.hypot(p.x-POINTS.terminal.x,p.z-POINTS.terminal.z)<=6)
      startUnexpectedEscalation(state);
    // CH01's first substantive route choice is earned by the captain
    // physically reaching the staffed harbor corridor after the unexpected
    // escalation, not by searching ledgers or pressing E on a paper console.
    // This is an OPTIONAL automatic entry to the EXISTING decision dialog.
    // Legacy F interaction and all v2 checkpoint fields remain compatible.
    // Merely restoring a checkpoint already inside the area never triggers it.
    if(state.phase==='records'&&movedDistance>1e-7){
      const from=Math.hypot(beforeX-ROUTE_FORK.x,beforeZ-ROUTE_FORK.z);
      const reached=Math.hypot(p.x-ROUTE_FORK.x,p.z-ROUTE_FORK.z);
      if(from>ROUTE_FORK.radius&&reached<=ROUTE_FORK.radius&&
         !Sim.lineBlocked(beforeX,beforeZ,p.x,p.z,state.world.obstacles)){
        state.phase='decision';
        state.subtitle='김도겸 중사(무전): 현지 상황이 바뀌었습니다. 유수프 구조단의 남쪽 주민 대피 통로와 현지 승인 후 열리는 동쪽 통로 중 선택해야 합니다. 기록 조사는 필수가 아닙니다.';
        state.message='현장 접근 후 경로 선택 · 민간 구조단과 협력';
        syncMarkers(state);
      }
    }
    // A player or local pedestrian in the lane stops the van rather than
    // letting its collision body pass through them or teleport to the stop.
    if(state.transportVan&&!state.transportVan.arrived){
      const v=state.transportVan,body=state.world.obstacles.find(o=>o.routeId==='story-civil-transport');
      if(body&&hasOwn(v,'driverZ')&&v.driverZ>CIVILIAN_SHUTTLE.boardZ+1e-8){
        // Authored public road: the civilian must physically walk to their
        // parked van before it drives. The visible standing person and the
        // 60Hz pedestrian collider share the exact same actual coordinate.
        const next=Math.max(CIVILIAN_SHUTTLE.boardZ,
          v.driverZ-CIVILIAN_SHUTTLE.driverWalkSpeed*t);
        const swept={x:CIVILIAN_SHUTTLE.x,z:(next+v.driverZ)/2,
          w:1.10,d:Math.abs(next-v.driverZ)+1.10};
        const bystanders=localPublicPedestrians(state);
        // Face-to-face interaction starts with the player next to this
        // human. They can walk AWAY from that original overlap; only newly
        // entered pedestrian footprints block future swept travel.
        const start={x:CIVILIAN_SHUTTLE.x,z:v.driverZ,w:1.10,d:1.10};
        if(!bystanders.some(actor=>
             !Sim.blocked(actor.x,actor.z,.65,[start])&&
             Sim.blocked(actor.x,actor.z,.65,[swept]))&&
           !state.world.obstacles.filter(o=>o!==body).some(o=>
             Math.abs(o.x-swept.x)*2<o.w+swept.w&&
             Math.abs(o.z-swept.z)*2<o.d+swept.d))v.driverZ=next;
        state.world.witness=transportWitness(state);
      }
      if(body&&(!hasOwn(v,'driverZ')||v.driverZ<=CIVILIAN_SHUTTLE.boardZ+1e-8)){
        const next=Math.min(CIVILIAN_SHUTTLE.endZ,v.z+CIVILIAN_SHUTTLE.speed*t);
        const sweep={x:CIVILIAN_SHUTTLE.x,z:(next+v.z)/2,
          w:CIVILIAN_SHUTTLE.w,d:CIVILIAN_SHUTTLE.d+next-v.z};
        const clear=civilianVehiclePathClear(state,sweep,body);
        // Unlike a remote player's explicit 5s hold, spontaneous yielding to
        // an observed living pedestrian is purely physical and ends when that
        // person walks out of the swept body footprint. No global timer.
        if(clear&&!(v.pauseUntil>state.world.elapsed))v.z=next;
        if(v.z>=CIVILIAN_SHUTTLE.endZ-1e-7){
          v.z=CIVILIAN_SHUTTLE.endZ;v.arrived=true;state.transportContact=2;
          state.subtitle='나딤(현지 운송 담당자): 차량이 남쪽 공공 도로 승차 지점에 도착했습니다. 주민 이동은 구조단과 함께 확인하겠습니다.';
          state.message='현지 운송 차량 실제 도착 · 수송 및 철수 완료를 의미하지 않음';
        }
        syncCivilianShuttle(state);
        // syncCivilianShuttle derives actual road occupation consistently
        // for this frame and also for restored/rewritten world snapshots.
      }
    }
    // A brief contextual announcement is triggered by the captain's actual
    // approach to an evacuation corridor. No fictional field paperwork or
    // extra F interaction is created, and this does not block either exit.
    const reachedCorridor=state.phase==='exit'&&state.choice&&
      Math.hypot(p.x-(state.choice==='evacuation'?POINTS.exitEvac.x:POINTS.exitVerify.x),
                 p.z-(state.choice==='evacuation'?POINTS.exitEvac.z:POINTS.exitVerify.z))<=12;
    if(!state.passageWarningHeard&&reachedCorridor){
      state.passageWarningHeard=true;
      if(state.choice==='evacuation'){
        // Local actors react to witnessed progress, not a checklist of papers.
        // An observed parked vehicle is not proof of civilian transportation.
        const vehicle=state.transportVan?.arrived
          ?' 나딤의 차량은 승차 지점에 도착했지만 주민 탑승은 확인되지 않았습니다.'
          :state.transportVan
            ?' 나딤의 차량은 아직 이동 중이므로 도착을 확정할 수 없습니다.':'';
        const walker=state.civilianWalker?.arrived
          ?' 주민 한 명은 걸어서 도착했습니다. 다른 주민은 아직 미확인입니다.'
          :state.civilianRerouted
            ?' 현지 주민이 접근로를 선택했지만 실제 도착은 아직 확인되지 않았습니다.':'';
        state.subtitle='유수프(현지 구조단): 이 통로는 주민을 집결지로 안내하는 길입니다. 대위님이 출국 전에 들은 복귀 일정과는 별개의 상황입니다. 다음 이동편은 현지에서 다시 확인해야 합니다.'+vehicle+walker;
        state.message='남쪽 대피 통로 도착 · 민간인 이동 지원 · 기존 복귀 일정 불확실'+
          (state.transportVan?.arrived?' · 차량 현장 도착 확인':state.transportVan?' · 차량 이동 중':'')+
          (state.civilianWalker?.arrived?' · 주민 보행 도착 확인':'');
      }else{
        const radio=state.relayRestored
          ?' 비상 통신은 복구됐지만 통로의 개방 권한은 여전히 현지 구조단에 있습니다.'
          :' 현장 통신은 아직 안정적으로 복구되지 않았으며 확인되지 않은 개방을 약속할 수 없습니다.';
        state.subtitle='조현지(국정원): 동쪽 통로에 도착했습니다. 내전 확대로 출국 전 귀환 계획을 그대로 실행할 수 없습니다. 어떤 정치적 발표도 이 골목의 출입권을 대신 주지 못합니다. 동쪽 개방 여부는 현지 구조단과 통제소의 확인이 필요합니다.'+radio;
        state.message='동쪽 현장 통로 도착 · 귀환 계획 재검토 필요'+
          (state.relayRestored?' · 통신 복구와 통로 개방 별개':' · 현장 통신 미확인');
      }
    }
    // An optional geographically distant story beat is earned by walking
    // into the real shared civic courtyard, not by map clicking or remote
    // reading. Do not infer which civilians or vehicles have actually left.
    if(!state.civicVisited&&['records','decision','exit'].includes(state.phase)&&
       Math.hypot(p.x-CIVIC_COURTYARD.x,p.z-CIVIC_COURTYARD.z)<
         CIVIC_COURTYARD.arrivalRadius){
      state.civicVisited=true;
      state.subtitle='조현지: 오래된 항구 거리에서 주민 공동 안뜰까지 직접 확인했습니다. 현지 구조단의 접수 상태는 아직 확인되지 않았습니다.';
      state.message='공통 도시 안뜰 직접 도착 · 실제 현장 확인 완료';
    }
    // A different civilian uses actual 60Hz movement and the same walkable
    // scene AABBs as the captain. If the lane is occupied, the worker waits,
    // rather than clipping through a person or teleporting to the far end.
    if(state.worker){
      const w=state.worker;
      // Before the unexpected escalation the harbor worker follows a normal
      // short, observable work route. Once the local encounter starts, walking
      // back and forth as if nothing changed would be implausible. They move
      // toward the existing side of the pedestrian lane and stay there;
      // no new quest, teleport, new collision object or hidden danger radar.
      const conflictActive=state.phase!=='terminal';
      if(conflictActive)w.direction=1;
      else if(w.x>=WORKER_PATH.maxX-1e-8)w.direction=-1;
      else if(w.x<=WORKER_PATH.minX+1e-8)w.direction=1;
      const toEnd=w.direction>0?WORKER_PATH.maxX-w.x:w.x-WORKER_PATH.minX;
      const step=Math.max(0,Math.min((conflictActive?1.45:WORKER_PATH.speed)*t,toEnd));
      if(step>0){
        const solids=state.world.obstacles.concat(
          localCivilianBodies(state,w,WORKER_PATH.radius),actorBlockers(state));
        const start=w.x;
        Sim.moveEntity(w,w.direction*step/t,0,t,solids,WORKER_PATH.radius);
        // Never drift off the authored path due to floating point movement.
        w.x=clamp(w.x,WORKER_PATH.minX,WORKER_PATH.maxX);
        if(Math.abs(w.x-start)<1e-8)w.x=start;
      }
      // The local worker heads for a nearby pedestrian lane DURING the
      // unexpected escalation, rather than waiting for the captain to finish
      // the encounter. This is a real 60Hz voluntary movement with collision,
      // not a teleport, an extra quest, or an order issued by the player.
      if(['engagement','records','decision','exit'].includes(state.phase)&&
         w.x>=WORKER_PATH.maxX-1e-6&&w.z<WORKER_PATH.safeZ){
        // This person makes their own decision to leave an exposed public
        // walkway when danger begins. The captain's
        // optional E interview does not unlock or command a civilian body.
        const before=w.z;
        const solids=state.world.obstacles.concat(
          localCivilianBodies(state,w,WORKER_PATH.radius),actorBlockers(state));
        Sim.moveEntity(w,0,Math.min(WORKER_PATH.shelterSpeed,
          (WORKER_PATH.safeZ-w.z)/t),t,solids,WORKER_PATH.radius);
        w.z=clamp(w.z,before,WORKER_PATH.safeZ);
        if(before<WORKER_PATH.safeZ&&w.z>=WORKER_PATH.safeZ-1e-6){
          w.z=WORKER_PATH.safeZ;
          if(Math.hypot(w.x-p.x,w.z-p.z)<9&&
             !Sim.lineBlocked(w.x,w.z,p.x,p.z,state.world.obstacles)){
            state.subtitle=state.workerInterviewed
              ?'항구 작업자: 말씀드린 대로 공용 보행 골목으로 옮겼어요. 다른 주민의 대피는 확인하지 못했습니다.'
              :'항구 작업자: 길을 비워 두려고 가까운 골목으로 스스로 이동했습니다. 다른 주민들의 상황은 아직 모릅니다.';
            state.message='현지 작업자의 자발적 보행 이동 완료 · 다른 주민은 미확인';
          }
        }
      }
    }
    // Independent local agency: the resident does not wait for the captain
    // to accept a repeated escort quest. Only the physically cleared encounter
    // begins their autonomous walk along the public pavement. Bodies in the
    // way stop real movement; the 60Hz step never moves through scenery.
    if(state.civilianWalker&&!state.civilianWalker.arrived&&state.combat.cleared&&
       ['records','decision','exit'].includes(state.phase)){
      const w=state.civilianWalker,start=w.z;
      const preferredX=state.civilianRerouted?CIVILIAN_WALK.aidLaneX:CIVILIAN_WALK.x;
      // Choose the neighboring public lane BEFORE reaching a stationary
      // person, then stay on it until physically past them. Otherwise a
      // direct-to-destination walk can undo each lateral step on the next
      // 60Hz tick and trap the civilian beside the same human.
      const pedestrianNearby=Math.abs(w.z-p.z)<4&&p.z<w.z+1&&
        Math.abs(p.x-preferredX)<1.6;
      const destinationX=pedestrianNearby
        ?(preferredX===CIVILIAN_WALK.x?CIVILIAN_WALK.aidLaneX:CIVILIAN_WALK.x)
        :preferredX;
      const dx=destinationX-w.x,dz=CIVILIAN_WALK.endZ-w.z;
      const distance=Math.hypot(dx,dz);
      // The final frame must use only the remaining distance, rather than
      // adding a visible .04m snap after a full walking step.
      const pace=Math.min(CIVILIAN_WALK.speed,distance/t);
      const bodies=localCivilianBodies(state,w,.55);
      const solids=state.world.obstacles.concat(bodies,actorBlockers(state));
      const previousX=w.x,previousZ=w.z;
      if(distance>1e-8)Sim.moveEntity(w,dx/distance*pace,
        dz/distance*pace,t,solids,.55);
      // A civilian encountering a standing person or fixed street fixture
      // tries the OTHER side of this already authored two-metre pavement.
      // This is a finite, collision-checked walking step, not pathfinding
      // through buildings, teleportation, or a player-issued escort order.
      // No new checkpoint field is needed: the real x/z position is saved.
      if(Math.hypot(w.x-previousX,w.z-previousZ)<1e-8&&
         w.z>CIVILIAN_WALK.endZ+.05){
        const alternate=destinationX===CIVILIAN_WALK.x
          ?CIVILIAN_WALK.aidLaneX:CIVILIAN_WALK.x;
        if(Math.abs(alternate-w.x)>.03){
          const side=Math.sign(alternate-w.x);
          Sim.moveEntity(w,side*CIVILIAN_WALK.speed,0,t,solids,.55);
        }
      }
      w.x=clamp(w.x,CIVILIAN_WALK.aidLaneX,CIVILIAN_WALK.x);
      w.z=clamp(w.z,CIVILIAN_WALK.endZ,start);
      if(Math.hypot(w.x-destinationX,w.z-CIVILIAN_WALK.endZ)<1e-6){
        w.x=destinationX;w.z=CIVILIAN_WALK.endZ;w.arrived=true;
        // Do not provide a magical remote notification across the map.
        if(Math.hypot(p.x-w.x,p.z-w.z)<12&&
           !Sim.lineBlocked(p.x,p.z,w.x,w.z,state.world.obstacles)){
          state.subtitle='남쪽 주민: 구조단이 관리하는 안뜰까지 걸어서 도착했어요. 다른 주민들의 상황은 아직 몰라요.';
          state.message='현지 주민 1명 보행 도착 · 다른 주민 대피 완료 여부는 미확인';
        }
      }
    }
    // The optional local evacuation guide follows at walking speed, within
    // observation distance and through the same real harbor collision world.
    // Leaving the guide behind pauses the escort; no teleportation or map-wide
    // knowledge is used to manufacture an arrival.
    if(state.phase==='exit'&&state.choice==='evacuation'&&state.guide.active&&!state.guide.arrived&&!state.guide.waiting){
      const g=state.guide,dx=p.x-g.x,dz=p.z-g.z,range=Math.hypot(dx,dz);
      // Once the captain leaves the locally navigable escort corridor, the
      // civilian holds their actual position. The PC objective and checkpoint
      // now reflect this physical pause rather than falsely claiming following.
      // Resume requires returning within sight and pressing E beside the guide.
      if(range>=14){
        g.waiting=true;
        state.subtitle='유수프(현지 구조단): 안내원이 뒤처져 현장에서 기다리고 있어. 직접 돌아가 동행을 재개해 줘.';
        state.message='안내원 거리 이탈 · 현장 대기 · 접근 후 F로 재개';
      }
      if(!g.waiting&&range>1.7&&range<14){
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
    // Keep physical 3D F markers aligned with the actual moving civilian
    // or escort, removing them when their local observation range ends.
    refreshMovingActorMarkers(state);
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
             !Sim.lineBlocked3D(hostile.x,1.64,hostile.z,
               hostile.x+rayX*contact,p.crouched?.8:1.2,hostile.z+rayZ*contact,
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
    // Walking through the genuine exit is enough. The old E path is retained
    // below, and a fabricated player coordinate jump never earns completion:
    // crossing must have occurred during this resolved fixed-step movement.
    if(state.phase==='exit'&&state.world.status==='playing'){
      const isSouth=state.choice==='evacuation';
      const exit=isSouth?POINTS.exitEvac:POINTS.exitVerify;
      // The green/blue F marker is INSIDE the busy local courtyard; reaching
      // its 2m sphere cannot terminate the chapter before the player chooses
      // to speak to Yusuf, hand over supplies or inspect the nearby cabinet.
      // Cross a separate physical threshold BEYOND that site to leave:
      // south passage continues down the walkway; east passage turns east.
      // Neither line lies on the authored optional task walkways.
      const southEdge=exit.z-4.5,eastEdge=exit.x+6.5;
      const crossed=isSouth
        ?beforeZ>southEdge&&p.z<=southEdge&&Math.abs(p.x-exit.x)<2.2
        :beforeX<eastEdge&&p.x>=eastEdge&&Math.abs(p.z-exit.z)<2.2;
      // The same exact gate/cargo/guide rule owns both HUD and physical
      // threshold completion. A player never sees "available" while the
      // 60Hz exit refuses the very same real state.
      if(crossed&&movedDistance>1e-7&&exitReadiness(state).ready&&
         !Sim.lineBlocked(beforeX,beforeZ,p.x,p.z,state.world.obstacles)){
        finishAtExit(state);
        syncMarkers(state);
      }
    }
    syncVisibleCharacterFacing(state,t);
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
        ?'유수프(현지 구조단): 표시된 유한 보급 상자에 남은 장비가 있어. 가까이 가서 F로 확보해.'
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
      state.subtitle='이수혁 대위(무전): 현장에서 확인한 교전 결과를 보고합니다. 주변 경계를 유지하며 상황을 계속 보고하겠습니다.';
      state.message='현장 교전 결과 확인 · 주변 경계 유지';
      if(remaining===0){
        // BR's final-shot victory is not CH01 mission completion. The story
        // still requires player-led evidence, a route decision and an exit.
        // Keep the shared world live until the authored mission actually ends.
        state.world.status='playing';
        state.phase='records';state.combat.cleared=true;
        state.subtitle=state.combat.supportUsed
          ?'조현지(국정원): 이 대위님의 현장 보고 확인했습니다. 김지윤의 연락도 접수했습니다. 사전 파견 목적은 그대로이며, 지금은 현지 구조단이 주민 이동을 결정합니다.'
          :'조현지(국정원): 이 대위님의 현장 보고 확인했습니다. 구조단이 주민 이동을 맡고 있습니다. 추가 기록은 선택적으로 확인할 수 있습니다.';
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
    // This is a one-time field liaison call, not an instruction to search
    // another ledger or an invented new deployment order. The captain already
    // received his original mission and return briefing in Korea.
    state.subtitle='김지윤(국정원): 한국에서 전달된 최초 파견 임무는 현지 연락망 확인과 구호 인력 지원입니다. 현지 구조단이 공유한 04:07 수신 시각은 현장 확인 전 정보입니다. 지금 주민 이동은 유수프 구조단과 직접 협의하세요.';
    state.message='김지윤 현장 연락 접수 · 원래 파견 목적 유지 · 주민 이동은 현지 협의';
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
  // Both real-time witnessed arrival and the original F interaction enter
  // exactly the same one-shot event. Never treat it as the deployment's purpose.
  function startUnexpectedEscalation(state){
    if(state.phase!=='terminal')return false;
    state.phase='engagement';state.combat.started=true;
    state.awningFallen=true;
    syncRoute(state);
    state.combat.nextPulseAt=state.world.elapsed+3;
    state.world.bots=makeHostiles();
    state.subtitle='조현지(국정원): 현지 내전이 예상 밖으로 확대됐습니다. 동측 상가 골목의 차양도 쓰러졌습니다. 출국 전 계획대로 복귀하기도 어려운 상황입니다. 주민들에게는 조금 전까지 이어지던 평범한 일상도 갑자기 끊긴 겁니다. 현지 구조단의 결정을 먼저 들어야 합니다.';
    state.message='갑작스러운 현지 충돌 확대 · 현장 대응과 주민 보호';
    syncMarkers(state);
    return true;
  }
  function interact(state) {
    if(state.phase==='complete')return {ok:false,reason:'completed'};
    if(state.phase==='failed')return {ok:false,reason:'inactive'};
    const marker=nearest(state);
    if(!marker)return {ok:false,reason:'too_far'};
    if(marker.id==='kimControl'&&kimControlMarkers(state).length){
      state.kimWaiting=!state.kimWaiting;
      state.subtitle=state.kimWaiting
        ?'김지윤(국정원): 여기서 기다리겠습니다. 현장을 직접 확인하고 돌아오십시오. 다른 구역의 상황은 제가 단정할 수 없습니다.'
        :'김지윤(국정원): 다시 함께 이동하겠습니다. 실제 걸을 수 있는 길로 따라가겠습니다.';
      state.message=state.kimWaiting
        ?'김지윤 현장 대기 · 직접 복귀해 F로 동행 재개'
        :'김지윤 현장 동행 재개 · 실제 60Hz 이동';
      syncMarkers(state);
      return {ok:true,event:state.kimWaiting?'kim_wait':'kim_follow',phase:state.phase};
    }
    if(marker.id==='kimAftercare'&&kimAftercareMarkers(state).length){
      state.kimAftercareReviewed=true;
      const known=state.aidDelivered
        ?'현지 구조단이 실제로 인수한 물품만 확인했습니다. 이후 주민 이동은 아직 확인이 필요합니다.'
        :state.guide.released
          ?'함께 걸었던 안내원을 현지 구조단에 인계한 사실은 확인했습니다. 다른 주민의 소재는 단정할 수 없습니다.'
          :state.civilianWalker?.arrived
            ?'그 주민 한 명이 실제로 도착한 것은 확인했습니다. 도시 전체의 대피 완료를 뜻하지 않습니다.'
            :state.civicCrossing?.assisted
              ?'현지 주민에게 직접 길을 설명했지만, 실제 도착은 계속 현장에서 확인해야 합니다.'
              :state.mara?.arrived
                ?'마라가 실제로 길을 걸어 나온 사실만 확인했습니다. 다른 상가 주민들의 결정은 존중해야 합니다.'
                :state.workerInterviewed
                  ?'작업자의 직접 진술은 확인했습니다. 시간과 귀환 경로는 검증되지 않았습니다.'
                  :'현지 담당자에게 직접 전한 기록은 확인됐습니다. 그 이상 추정하지 않겠습니다.';
      state.subtitle='김지윤(국정원): '+known+' 한국에서 받은 본래 파견 지시는 바뀌지 않았습니다.';
      state.message='김지윤과 가까이서 현장 확인 사실 공유 · 후속 판단은 미확정';
      syncMarkers(state);
      return {ok:true,event:'kim_local_aftercare',phase:state.phase};
    }
    if(marker.id==='streetDrain'&&!state.drainCleared&&
       state.drainClearTicks===0&&StreetFlood){
      if(state.world.carryingAid)return {ok:false,reason:'hands_occupied'};
      state.drainClearTicks=1;
      state.subtitle='이수혁 대위: 주민이 지목한 배수구의 낙엽과 가벼운 잔해를 치우겠습니다. 잠시 이 자리에서 정리하겠습니다.';
      state.message='공공 보행로 배수구 정리 중 · 3초간 가까이 머무르세요';
      syncMarkers(state);
      return {ok:true,event:'street_drain_started',phase:state.phase};
    }
    if(marker.id==='civicCrossing'&&Civic&&state.civicCrossing?.disrupted&&
       !state.civicCrossing.assisted){
      state.civicCrossing=Civic.step(state.civicCrossing,{
        assist:true,player:state.world.player
      });
      state.subtitle='현지 주민: 저쪽 보행로는 아직 막혀 있지 않군요. 제가 걸어서 이동해 보겠습니다. 다른 주민들도 무사히 도착했다고 말할 수는 없습니다.';
      state.message='현지 주민에게 실제 가까이서 길 안내 · 보행 여부는 현장에서 확인';
      syncMarkers(state);
      return {ok:true,event:'civic_crossing_assist',phase:state.phase};
    }
    if(marker.id==='liaisonAssist'&&state.combat.cleared&&
       !state.relayRestored&&['records','decision'].includes(state.phase)){
      // One on-site civilian relay can be restored, without granting any
      // imaginary global communications, passage approval or extraction.
      state.relayRestored=true;
      state.subtitle='조현지(국정원 · 현장): 출국 전에 브리핑받은 임무는 민간 연락망 협력이었습니다. 현지 구조단과 협력해 이 중계 회선만 연결하겠습니다. 주민 이동과 복귀 경로는 유수프 측의 별도 현장 확인이 필요합니다.';
      state.message='조현지와 현장 통신 협력 · 민간 중계 회선 복구 · 철수 여부 미확정';
      syncMarkers(state);
      return {ok:true,event:'onsite_liaison_relay',phase:state.phase};
    }
    if(marker.id==='eastLocalRequest'&&state.combat.cleared&&
       ['records','decision'].includes(state.phase)){
       // No field paperwork, route vote or teleported clearance. This local
       // request only starts the existing timed, collision-checked gate.
       const previous=state.phase;
       state.phase='decision';
       const selected=choose(state,'verification');
       if(!selected.ok){state.phase=previous;syncMarkers(state);return selected;}
       state.subtitle='동쪽 현지 통제 담당자: 지금은 동쪽 통로로 이동할 수 있도록 현장 개방을 요청하겠습니다. 제가 문을 열기 전에는 통과하지 마세요. 출국 전 파견 임무와 귀환 계획은 이미 알고 계시겠지만, 이곳 사정은 도착 후 달라졌습니다.';
       state.message='현지 담당자에게 직접 통행 요청 · 통제문 실제 개방 대기';
       return {ok:true,event:'east_route_in_person',choice:'verification',phase:state.phase};
    }
    if(marker.id==='transportYield'&&state.transportVan&&!state.transportVan.arrived&&
       state.phase==='exit'&&state.choice==='evacuation'){
      const v=state.transportVan;
      if(hasOwn(v,'driverZ')&&v.driverZ>CIVILIAN_SHUTTLE.boardZ+1e-8)
        return {ok:false,reason:'driver_not_boarded'};
      const currentlyYielding=v.pauseUntil>state.world.elapsed;
      v.pauseUntil=currentlyYielding?state.world.elapsed:
        state.world.elapsed+VAN_CROSSING_YIELD_SECONDS;
      syncCivilianShuttle(state);syncMarkers(state);
      state.subtitle=currentlyYielding
        ?'나딤(현지 운송 담당자): 통행로가 비었군요. 요청대로 천천히 다시 이동하겠습니다.'
        :'나딤(현지 운송 담당자): 사람들 먼저 지나가도록 잠깐 멈추겠습니다. 안전하면 다시 출발하겠습니다.';
      state.message=currentlyYielding
        ?'현지 운송 차량 양보 종료 · 실제 보행 통로 확인'
        :'현지 운송 차량 잠시 정차 · 도로 양보 5초 이내 · 원래 임무와 별개';
      return {ok:true,event:currentlyYielding?'transport_resume':'transport_yield',phase:state.phase};
    }
    if(marker.id==='awningHandle'&&state.awningFallen&&state.combat.cleared&&
       state.awningShift<1&&['records','decision','exit'].includes(state.phase)){
      state.awningWorking=true;
      state.subtitle='이수혁 대위: 쓰러진 가벼운 차양 틀을 길 가장자리로 끌어내겠다. 손잡이 근처에서 작업을 이어간다.';
      state.message='차양 틀 이동 중 · 가까이 머무르면 실제로 이동합니다';
      syncMarkers(state);
      return {ok:true,event:'awning_clear_started',phase:state.phase};
    }
    if(marker.id==='maraConversation'&&state.mara?.arrived&&
       state.awningShift===1&&['records','decision','exit'].includes(state.phase)){
      // A human who really walked the cleared public market path can speak
      // about THAT route only; she cannot know distant arrivals or grant the
      // east gate permission. Different active choices change her response.
      const response=state.choice==='evacuation'
        ?'남쪽 안뜰의 주민 인계는 유수프 구조단이 결정합니다. 이 골목이 열렸다고 주민 전부가 도착한 건 아니에요.'
        :state.choice==='verification'
          ?'동쪽 통로는 현지 담당자의 개방 확인이 먼저예요. 이쪽 시장 통로를 제가 걸어 나온 것과는 별개입니다.'
          :'지금 어느 길을 선택하든 현지 사람과 먼저 이야기하세요. 문서가 아니라 실제 통행 상황이 중요해요.';
      state.subtitle='마라(현지 기술자): 쓰러진 차양이 옮겨진 뒤에야 이 길을 직접 걸어 나올 수 있었어요. 누군가가 제 대신 걸어온 건 아닙니다. '+response;
      state.message='마라와 현장에서 직접 대화 · 실제 통행 범위만 확인';
      // Do not fall through into the unrelated old loot/record handler:
      // the dialog is itself a completed local E-key interaction.
      syncMarkers(state);
      return {ok:true,event:'maraConversation',phase:state.phase};
    }else if(marker.id==='officeBoard'&&!state.officeBoardRead&&
       ['records','decision','exit'].includes(state.phase)){
      // The optional physical board says only that residents were asked to
      // check in at the staffed south courtyard. It cannot confirm arrivals,
      // missing persons, dispatch completion or the disputed signal times.
      state.officeBoardRead=true;
      state.subtitle='항구 주민 안내소 공지: 주민 대피 문의는 남쪽 구조단 접수소에서 현장 확인합니다. 게시 시각과 실제 수송 완료 여부는 기록되지 않았습니다.';
      state.message='실내 주민 안내 공지 직접 확인 · 미확인 정보는 확정하지 않음';
      syncMarkers(state);
      return {ok:true,event:'office_board',phase:state.phase};
    }
    if(marker.id==='residentRoute'&&state.civilianWalker&&!state.civilianWalker.arrived&&
       !state.civilianRerouted&&state.civilianWalker.z>-54&&state.combat.cleared){
      state.civilianRerouted=true;
      state.subtitle='현지 주민: 남쪽 구조단이 있는 길로 제가 직접 가겠습니다. 정전이 오면 급수 펌프부터 멎어요. 남은 물이 걱정돼 집에 돌아가고 싶지만, 지금은 제가 길을 고르겠습니다. 다른 주민들의 이동은 제가 확인할 수 없어요.';
      state.message='현지 주민이 구조단 쪽 접근로를 스스로 선택 · 실제 보행 중';
      syncMarkers(state);
      return {ok:true,event:'resident_route_conversation',phase:state.phase};
    }
    if(marker.id==='harborWorker'&&!state.workerInterviewed&&state.worker){
      // This is testimony obtained directly from a moving person on the
      // pedestrian lane, never a remote position ping or verified timestamp.
      state.workerInterviewed=true;
      state.subtitle=state.worker.z>=WORKER_PATH.safeZ-1e-6
        ?'항구 작업자: 이쪽 골목으로 이미 이동했습니다. 아버지는 1990년 통일을 기회라 기억하고, 삼촌은 1994년 전쟁 뒤 잃어버린 일자리를 말해요. 같은 가족도 기억이 다르죠. 정비 구역 조명이 잠깐 약해진 건 기억하지만 정확한 시각은 모릅니다.'
        :'항구 작업자: 아버지는 1990년 통일을 기회라 했지만 삼촌은 1994년 전쟁 뒤 일자리를 잃었다고 했어요. 정비 구역 조명이 잠깐 약해진 건 기억해요. 정확한 시간은 모릅니다. 가까운 보행 골목으로 스스로 이동하겠습니다.';
      state.message='현지 작업자 직접 면담 · 이동은 주민 본인이 결정';
      syncMarkers(state);
      return {ok:true,event:'harbor_worker_interview',phase:state.phase};
    }
    if(marker.id==='terminal'&&state.phase==='terminal'){
      startUnexpectedEscalation(state);
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
        ?'마라(기술자): 현장 비상 전원을 연결했어. 통신과 수동 경고등이 복구됐어. 주민들은 전기가 돌아왔다는 말과 생활이 돌아왔다는 말을 구분해 왔지. 복구한 건 이 회선 하나야. 물과 병원, 다른 통로까지 모두 살아난 건 아니야.'
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
    }else if(marker.id==='coordinatorRequest'&&
      ['records','decision'].includes(state.phase)){
      // The local civilian coordinator decides the open south passage. The
      // captain can agree in person after the disruption without first
      // manipulating a records console or collecting unrelated documents.
      const previousPhase=state.phase;
      state.phase='decision';
      const selected=choose(state,'evacuation');
      if(!selected.ok){state.phase=previousPhase;syncMarkers(state);return selected;}
      // A genuine face-to-face conversation depends on what people have
      // physically seen, and on local jurisdiction. Political memory is one
      // resident's perspective, not a claim that a political declaration
      // authorized an invented street-level route.
      const observedResident=state.civilianWalker?.arrived===true
        ?' 유수프: 남쪽까지 걸어온 주민 한 명은 봤어. 나머지 사람들은 아직 확인 중이야.'
        :state.civilianRerouted
          ?' 유수프: 주민이 스스로 접근로를 골랐다는 건 들었어. 도착 전에는 안전하다고 적지 마.'
          :' 유수프: 아직 우리 눈으로 확인하지 못한 주민을 모두 대피했다고 말할 수는 없어.';
      const link=state.relayRestored
        ?' 마라가 복구한 비상 회선은 도움이 돼. 하지만 무전 하나가 다른 골목을 열어 주지는 않아.'
        :' 통신이 닿지 않는 동안은 현장에 있는 사람끼리 사실을 확인할 수밖에 없어.';
      const memory=state.workerInterviewed
        ?' 이수혁: 항구 작업자는 1990년과 1994년을 한 가족 안에서도 다르게 기억하더군요. 제가 들은 한 사람의 말로 이 도시 전체를 판단하지 않겠습니다.'
        :'';
      // The 2011 protests, 2014 Sana'a takeover and 2015 Aden violence are
      // historical Yemen context, not events performed by a real-life actor.
      // This fictional civilian's local agency still changes only witnessed
      // responses, never foreign orders or the saved completion requirements.
      state.subtitle='유수프(현지 구조단): 2011년 예멘의 시위 때는 우리도 새 질서를 기대했지. 2014년 사나가 장악됐다는 소식이 들렸고, 2015년 들어 아덴까지 위기가 번졌어. 가족마다 서로 다른 길을 택했지. 수도의 정치가 이 골목의 통행 허가를 대신할 순 없어. 남쪽 통로는 우리가 관리한다. 약속할 수 있는 범위만 말해 줘.'+
        observedResident+link+memory+
        ' 이수혁: 한국에서 받은 임무는 바뀌지 않았습니다. 이동 판단은 여러분과 함께 확인하겠습니다.';
      state.message='유수프와 직접 협의 · 현지 구조단 결정 존중 · '+
        (state.civilianWalker?.arrived?'주민 한 명의 현장 도착 확인':
          state.civilianRerouted?'주민의 이동 선택만 확인':'주민 이동 결과 미확인')+
        ' · 남쪽 경로 지원';
    }else if(marker.id==='decision'&&state.phase==='records'){
      state.phase='decision';
      state.subtitle='김도겸 중사(무전): 한국에서 지시받은 임무와 상황이 달라졌습니다. 귀환은 아직 불확실합니다. 유수프 구조단이 남쪽 통로를 관리하고 있고, 동쪽도 현장 확인이 가능합니다. 어느 경로든 실제 이동과 현지 승인이 필요합니다.';
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
      state.message='비상 물품 임시 적재 · F로 다시 들 수 있습니다';
    }else if(marker.id==='aidResume'&&state.phase==='exit'&&state.choice==='evacuation'&&state.aidStaged){
      state.aidStaged=false;state.world.aidStaged=false;state.world.carryingAid=true;
      state.subtitle='유수프(현지 구조단): 적재대의 같은 상자를 다시 운반하는 거야. 남쪽 인계 지점은 그대로야.';
      state.message='비상 물품 운반 재개 · 달리기 제한';
    }else if(marker.id==='aidDrop'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.aidPickedUp&&!state.aidDelivered&&!state.aidStaged){
      state.aidDelivered=true;state.world.aidDelivered=true;state.world.carryingAid=false;
      state.subtitle='유수프(현지 구조단): 비상 물품을 현장에서 인수했어. 주민 지원은 우리 구조단이 맡을게.';
      state.message='민간 구조단 물품 인계 완료 · 안전한 안뜰로 이동';
    }else if(marker.id==='dispatchLedger'&&state.phase==='exit'&&state.choice==='evacuation'&&!state.dispatchReviewed){
      // Inspect only the local signed intake sheet; no inferred civilian location.
      state.dispatchReviewed=true;
      state.subtitle='조현지(국정원): 접수 장부를 확인했어요. 비상 물품 요청은 접수됐지만 인수 서명란은 아직 비어 있어요. 실제 전달 여부는 현장에서 확인해야 해요.';
      state.message='현장 접수 장부 확인 · 실제 물품 인계와 안내원 동행은 별도 확인';
    }else if(marker.id==='driverReportDesk'&&state.phase==='exit'&&
      state.choice==='evacuation'&&state.dispatchReviewed&&state.transportContact===2&&!state.driverReportFiled){
      // The player has physically questioned the driver AND read the staffed
      // ledger. Filing the two-source account changes the final CH01 report,
      // but does not fabricate a vehicle arrival or transport completion.
      state.driverReportFiled=true;
      state.subtitle='조현지(국정원): 나딤의 진술과 현장 접수 장부를 함께 대조했습니다. 배차 요청은 확인됐지만 차량 도착 증빙은 없습니다. 확인된 범위만 접수하겠습니다.';
      state.message='운송 진술·접수 장부 대조 후 현장 기록 접수 완료 · 차량 도착 미확인';
    }else if(marker.id==='transportDriver'&&state.phase==='exit'&&
      state.choice==='evacuation'&&state.transportContact<2){
      if(state.transportVan)return {ok:false,reason:'vehicle_en_route'};
      if(state.transportContact===0){
        state.transportVan={z:CIVILIAN_SHUTTLE.startZ,arrived:false,driverZ:POINTS.transportDriver.z};
        state.transportContact=1;
        state.subtitle='나딤(현지 운송 담당자): 도로를 다시 열자는 말과 실제로 차량이 다닐 수 있는 상황은 다릅니다. 주차된 차량까지 직접 걸어가 탑승한 다음 남쪽 승차 지점으로 운전하겠습니다. 실제 승객 수송은 별도로 확인해야 합니다.';
        state.message='현지 운송 담당자가 주차된 차량으로 이동 중 · 아직 출발 전';
        syncCivilianShuttle(state);
      }else{
        // Older saved first interviews still permit their historic result,
        // without claiming an unobserved vehicle arrival.
        state.transportContact=2;
        state.subtitle='조현지: 이전 현장 진술은 남아 있습니다. 차량 도착은 아직 미확인입니다.';
        state.message='기존 면담 진행 보존 · 차량 도착 미확인';
      }
    }else if(marker.id==='volunteer'&&state.phase==='exit'&&
      state.choice==='evacuation'&&!state.musterConfirmed&&!state.guide.active){
      // One local face-to-face E action replaces two routine confirmation
      // presses. The volunteer is already standing here; never teleport them.
      state.musterConfirmed=true;
      state.guide.active=true;
      state.guide.waiting=false;
      state.subtitle='유수프(현지 구조단): 안내원이 여기서 직접 합류했어. 구조단이 통로를 맡고 있으니 함께 안뜰로 가 줘.';
      state.message='현지 안내원 동행 시작 · 남쪽 안뜰까지 실제 이동';
    }else if(marker.id==='muster'&&state.phase==='exit'&&state.choice==='evacuation'&&!state.musterConfirmed){
      // Optional direct conversation with the coordinator physically present at
      // muster. No hidden headcount, remote paperwork or automatic reward.
      state.musterConfirmed=true;
      state.subtitle='유수프(현지 구조단): 내가 남쪽 집결지를 맡고 있어. 안내원과 비상 물품은 여기서 직접 인수할게. 미확인 주민은 후속 구조단이 찾고 있어.';
      state.message='현지 구조단 담당자 직접 확인 · 안전한 안뜰로 이동';
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
      state.message=state.guide.waiting?'안내원 현장 대기 · 접근 후 F로 재개':'안내원 동행 재개 · 남쪽 안뜰로 이동';
    }else if(marker.id==='guideTransfer'&&state.phase==='exit'&&state.choice==='evacuation'&&
      state.guide.active&&!state.guide.arrived){
      // Optional second physical handoff point: the staffed south aid station.
      // The F prompt requires the player, the actual guide and the aid station
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
        // path. An F press must not present an advancing countdown while the
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
      finishAtExit(state);
    }else return {ok:false,reason:'unavailable'};
    syncMarkers(state);
    return {ok:true,event:marker.id,phase:state.phase};
  }
  function choose(state, choice) {
    const reconsider=state.phase==='exit';
    if(!reconsider&&state.phase!=='decision')return {ok:false,reason:'not_choosing'};
    if(choice!=='evacuation'&&choice!=='verification')return {ok:false,reason:'invalid_choice'};
    // East passage is a field route request to local controllers, not a reward
    // for reading two unrelated historical records. The physically moving gate
    // and its local safety interlock remain authoritative; source records are
    // optional evidence, not a prerequisite to travelling there.
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
    state.choice=choice;state.phase='exit';
    state.gateClearanceDuration=state.relayRestored?4:GATE_CLEARANCE_SECONDS;
    state.gateReadyAt=choice==='verification'?state.world.elapsed+state.gateClearanceDuration:0;
    state.gateObstructed=false;
    state.subtitle=choice==='verification'
      ?'마라(기술자): 동쪽 통로의 현장 개방을 요청했습니다. 이런 혼란 속에서도 도로 개방은 별도 협의가 필요해요. 기록이나 무전 한 줄로 문이 열렸다고 할 순 없습니다. 실제 통제문 작업과 현지 승인 확인이 필요해요.'
      :'유수프(현지 구조단): 남쪽 대피 통로는 내가 현장에서 안내하겠어. 동쪽 개방 요청은 중단했어. 이동한 주민과 아직 못 만난 주민을 섞어 "모두 안전하다"고 보고하지는 말아 줘.';
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
  // One source of truth for the ACTUAL CH01 exit crossing and PC progress
  // HUD: a visible green/blue marker is never permission to teleport, and
  // optional civilian tasks cannot be silently converted into mandatory
  // objectives. Only voluntarily carried aid and an already-following guide
  // may hold the south threshold; only physical gate travel holds the east.
  // All values derive from existing V2 world fields, no new save schema.
  function exitReadiness(state){
    if(state.phase==='complete')
      return Object.freeze({ready:true,reason:'completed',label:'현장 경로 종료 확인'});
    if(state.phase!=='exit'||!['evacuation','verification'].includes(state.choice))
      return Object.freeze({ready:false,reason:'route_not_selected',label:'경로 선택 전'});
    if(state.choice==='verification'){
      if(!gateOpen(state))
        return Object.freeze({ready:false,
          reason:state.gateObstructed?'gate_safety_stop':'gate_opening',
          label:state.gateObstructed
            ?'동쪽 통제문 이동 경로에서 벗어나 개방을 기다리세요'
            :'동쪽 통제문 실제 개방을 기다리세요'});
      return Object.freeze({ready:true,reason:'east_clear',label:'동쪽 통로 직접 통과 가능'});
    }
    if(state.world.carryingAid)
      return Object.freeze({ready:false,reason:'aid_in_hands',
        label:'운반 중인 물품을 구조단에 인계하거나 임시 적재대에 내려놓으세요'});
    const guide=state.guide;
    if(guide.active&&!guide.arrived&&!guide.released)
      return Object.freeze({ready:false,
        reason:guide.waiting?'guide_waiting':'guide_en_route',
        label:guide.waiting?'동행 안내원이 대기 중입니다. 가까이서 F로 재개하거나 구조단에 인계하세요':
          '안내원과 함께 실제 안뜰에 도착하거나 구조단에 인계하세요'});
    return Object.freeze({ready:true,reason:'south_clear',label:'남쪽 안뜰 출구 직접 통과 가능'});
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
        item('muster','집결지 인원 확인',state.musterConfirmed?'done':'available',true),
         item('guide','현장 안내원 동행·인계',guideStatus,true),
        item('aid','비상 물품 현장 인계',aidStatus,true),
        item('exit','남쪽 안뜰 도착',completed?'done':
          exitReadiness(state).ready?'available':'blocked')
      ]);
    }
    return Object.freeze([
      item('evidence','통신 기록 2건 추가 확인',state.found.length===2?'done':'available',true),
      item('gate','동쪽 통제문 확인',gateOpen(state)?'done':'waiting'),
      item('log','현장 중계 기록 검토',state.gateLogReviewed?'done':gateOpen(state)?'available':'locked',true),
      item('handoff','현장 기록 전달',state.logHandedOff?'done':
        state.gateLogReviewed?'available':'locked',true),
      item('exit','동쪽 통로 이동',completed?'done':
        exitReadiness(state).ready?'available':'blocked')
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
    // A nearby but rearward companion is NOT a visually observed exact
    // distance. Only a genuine forward-facing sightline may populate HUD.
    const yaw=p.yaw,dx=g.x-p.x,dz=g.z-p.z;
    if(!Number.isFinite(yaw)||distance>1e-6&&
       (dx*Math.sin(yaw)-dz*Math.cos(yaw))/distance<.34)return null;
    return Math.round(distance*10)/10;
  }
  function situation(state) {
    const count=state.found.length;
    return Object.freeze({
      mandate:'한국 출국 전 브리핑받은 민간 통신망 점검·구호 인력 지원 파견 · 현지 도착 후 예기치 못한 내전 확대로 민간 대피 지원 확대',
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
      exitReadiness:exitReadiness(state),
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
      guideStatus:state.guide.released?(Math.hypot(state.guide.x-POINTS.guideTransfer.x,state.guide.z-POINTS.guideTransfer.z)<2.1?'대피 안내원 남쪽 구조단 인계 완료':'대피 안내원 집결지 현장 인계 완료'):state.guide.active?(state.guide.arrived?'대피 안내원 안뜰 도착':state.guide.waiting?(['guideRelease','guideTransfer'].includes(nearest(state)?.id)?'대피 안내원 현장 대기 · F로 구조단에 현장 인계 가능':nearest(state)?.id==='exitEvac'&&canResumeGuideAtExit(state)?'대피 안내원 안뜰 근처 대기 · 출구에서 F로 동행 재개 가능':nearest(state)?.id==='guideControl'?'대피 안내원 현장 대기 · F로 재개 가능':visibleEscortDistance(state)===null?'대피 안내원 현장 대기 · 마지막으로 확인한 위치로 돌아가세요':'대피 안내원 현장 대기 · 직접 닿을 만큼 다가가 F로 재개하세요'):Math.hypot(state.guide.x-state.world.player.x,state.guide.z-state.world.player.z)>=14?'대피 안내원과 거리 이탈 · 마지막으로 확인한 위치로 돌아가세요':guideBodyPathBlocked(state.guide,state.world.player,state.world.obstacles)?(guideDetour(state,state.guide,state.world.player)?'대피 안내원 장애물 우회 중 · 가까운 거리에서 천천히 이동하세요':'대피 안내원과 시야 단절 · 가까운 통로로 다시 접근하세요'):Math.hypot(state.guide.x-state.world.player.x,state.guide.z-state.world.player.z)>=7?'대피 안내원과 거리 이탈 · 마지막으로 확인한 위치로 돌아가세요':(nearest(state)?.id==='guideControl'?'대피 안내원 동행 중 · F로 대기 지시 가능':['guideRelease','guideTransfer'].includes(nearest(state)?.id)?'대피 안내원 동행 중 · F로 구조단 현장 인계 가능':'대피 안내원 동행 중 · 안내원 곁으로 다가가 F로 대기 지시하세요')):
        state.musterConfirmed&&state.choice==='evacuation'?'대피 안내원 동행 선택 가능':'대피 안내원 동행 미시작',
      civilianConsequence:state.choice==='evacuation'
        ?(state.musterConfirmed?'유수프 구조단: 집결지 담당자와 직접 협조 · 미확인 주민은 후속 구조단 확인':'유수프 구조단: 남쪽 현장 담당자와 아직 만나지 않음')
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
  // The end of CH01 is a scene with local decision-makers, not another form
  // to collect. All lines derive from witnessed actions in the completed
  // physical world. Unknown civilian movements and blocked return routes
  // remain explicitly unresolved; no campaign chapter is silently unlocked.
  function closingScene(state) {
    if(state.phase!=='complete')return null;
    const east=state.choice==='verification';
    const local=east
      ?'마라(현지 기술자): 동쪽 문이 실제로 열렸어요. 통로 운영은 현지 구조단이 맡습니다.'
      :(state.aidDelivered
        ?'유수프(현지 구조단): 물품은 우리가 현장에서 인수했어. 주민 접수는 계속할게.'
        :'유수프(현지 구조단): 남쪽 안뜰은 우리가 관리하고 있어. 아직 확인하지 못한 주민도 있어.');
    const civilian=state.civilianWalker?.arrived===true
      ?(state.civilianRerouted
        ?'조현지: 현장에서 직접 이야기한 주민이 스스로 구조단 접근로를 선택해 걸어서 도착했습니다. 다른 주민은 미확인입니다.'
        :'조현지: 걸어서 도착한 주민 한 명은 확인됐습니다. 다른 주민의 대피 완료까지 단정할 수는 없습니다.')
      :(state.civilianRerouted
        ?'조현지: 주민이 본인 판단으로 구조단 접근로를 선택했지만, 실제 도착은 아직 확인되지 않았습니다.'
        :'조현지: 현지 주민의 이동은 아직 확인되지 않았습니다. 구조단과 확인된 범위를 구분해 보고하겠습니다.');
    // The market walkway is a visible, physical consequence of a player's
    // optional in-world action, never a new document task or invisible gate.
    // A partial movement is not reported as a completed clearance.
    const workerSafe=state.worker?.z>=WORKER_PATH.safeZ-1e-6;
    const workerReport=workerSafe
      ?' 항구 작업자는 별도의 지시 없이 가까운 공용 보행 골목으로 걸어서 이동했습니다. 다른 주민의 안전은 미확인입니다.'
      :null;
    const rememberedSouth=state.workerInterviewed
      ?' 작업자의 가족은 통일과 전쟁을 서로 다르게 기억했습니다. 그 가족의 말을 도시 전체의 목소리로 적지 않겠습니다.'
      :'';
    // Closing dialogue reports only existing, physically earned civic events.
    const drainOutcome=state.drainCleared===true
      ?' 공공 배수구의 잔해는 제거했지만 노면이 즉시 마른 것은 아닙니다.':'';
    const crossingOutcome=civicCrossingReached(state)
      ?' 한 주민이 실제로 건널목 반대편에 도착했습니다. 다른 주민의 이동은 미확인입니다.'
      :state.civicCrossing?.assisted===true
        ?' 주민의 건널목 이동을 도왔지만 목적지 도착은 확인하지 못했습니다.':'';
    const yieldedVan=state.transportVan&&hasOwn(state.transportVan,'pauseUntil')
      ?' 나딤 운송 담당자가 요청받은 위치에서 차량을 잠시 멈춰 현장 통행을 양보했습니다. 승객 수송 및 철수 완료는 확인되지 않았습니다.'
      :'';
    const street=state.awningFallen
      ?(state.awningShift===1
        ?'시장의 쓰러진 차양은 통행 구역에서 치웠습니다. 주민 이동 판단은 현지 구조단이 맡습니다.'
        :'시장 통행로에는 쓰러진 차양이 아직 남아 있습니다.')
      :null;
    const radio=(state.relayRestored
      ?'김지윤: 현장 비상 통신은 복구됐습니다. 그래도 본래 복귀 계획의 재승인과 이동 안전은 별개의 문제입니다.'
      :'김지윤: 통신 복구 여부는 미확인입니다. 한국에서 승인받은 복귀 일정대로 움직일 수 있는지도 재확인이 필요합니다.')+
      (state.combat.supportUsed?' 교전 중 교신은 원래 파견 지시를 변경하지 않았습니다. 확인된 사실만 계속 보고하겠습니다.':'');
    return Object.freeze({
      location:east?'현지 동쪽 통로':'남쪽 주민 집결지',
      route:east?'east-physically-opened':'south-civilian-priority',
      lines:Object.freeze([local,civilian,radio+
        (state.kimAftercareReviewed?' 김지윤은 현장에서 직접 확인된 한정된 민간 상황만 대위와 대조했습니다. 추가 주민 수송과 본국 복귀는 아직 확정되지 않았습니다.':''),
        '이수혁 대위: 한국에서 받은 지시는 그대로입니다. 달라진 건 이곳의 상황입니다. 우리가 확인한 것과 모르는 것, 주민이 스스로 결정한 일을 분리해 보고하겠습니다. 복귀는 다시 승인받아야 합니다.'+
        (street?' '+street:'')+
        (state.mara?.arrived?' 마라는 통행 공간이 열린 뒤 자신이 고른 공용 골목까지 걸었습니다. 다른 주민의 이동은 미확인입니다.':'')+
        (workerReport||'')+yieldedVan+rememberedSouth+drainOutcome+crossingOutcome]),
      // This durable follow-up thread is derived exclusively from the existing
      // validated V2 CH01 world. It is not a second campaign chapter or a
      // fabricated civilian headcount, and never gates the existing exit.
      aftercare:state.choice==='evacuation'&&state.aidDelivered
        ?'verified_local_supply_handoff':state.civilianWalker?.arrived
          ?'one_witnessed_walk_in':'unverified',
      nextChapter:state.choice==='evacuation'&&state.aidDelivered
        ?'후속 장면: 현지 구조단 물품 인수 확인 · 주민 접수와 복귀 경로는 계속 미확정 · CH01 프리뷰 종료'
        :'후속 상황과 복귀 계획은 미확정 · CH01 프리뷰 종료'
    });
  }
  function debrief(state) {
    if(state.phase!=='complete')return null;
    const verified=state.choice==='verification';
    const records=Object.freeze(state.found.slice().sort());
    const conflict=records.length===2;
    return Object.freeze({
      version:2,mission:'CH01',previewOnly:true,campaignUnlocked:false,
      closingScene:closingScene(state),
      causalTimeline:Consequences?Consequences.fromMission(state):null,
      optionalTasks:optionalTaskAudit(state),
      protagonist:'이수혁',route:state.choice,records,
      eastCheckpointCleared:verified&&gateOpen(state),
      marketWalkwayCleared:state.awningFallen&&state.awningShift===1,
      maraUsedOpenMarketLane:state.awningShift===1&&state.mara?.arrived===true,
      harborWorkerReachedShelter:!!state.worker&&state.worker.z>=WORKER_PATH.safeZ-1e-6,
      civilianVehicleYieldRequested:!!state.transportVan&&hasOwn(state.transportVan,'pauseUntil'),
      kimAftercareWitnessed:state.kimAftercareReviewed===true,
      publicStreetDrainCleared:state.drainCleared===true,
      civicCrossingAssisted:state.civicCrossing?.assisted===true,
      civicCrossingReached:civicCrossingReached(state),
      // Read-only dramatic consequences: character memory never alters v2 saves,
      // unobserved civilian counts, the player's original orders or mission gates.
      southernFamilyPerspectiveHeard:state.workerInterviewed,
      civilianAgencyObserved:state.civilianRerouted&&state.civilianWalker?.arrived===true,
      verifiedInformationOnly:state.combat.supportUsed||state.gateLogReviewed||state.logHandedOff,
      emergencyRadioRestored:state.relayRestored,predepartureBriefingAcknowledged:true,harborWarningEnabled:state.beaconEnabled,gateLogReviewed:state.gateLogReviewed,logHandedOff:state.logHandedOff,musterConfirmed:state.musterConfirmed,
      aidDelivered:state.aidDelivered,aidPickedUp:state.aidPickedUp,aidStaged:state.aidStaged,
      localAidHandoffVerified:state.choice==='evacuation'&&state.aidDelivered,
      driverReportFiled:state.driverReportFiled,civilianVehicleArrived:state.transportVan?.arrived===true,civilianWalkerArrived:state.civilianWalker?.arrived===true,civilianRerouted:state.civilianRerouted,workerInterviewed:state.workerInterviewed,officeBoardRead:state.officeBoardRead,civicVisited:state.civicVisited,
      passageWarningHeard:state.passageWarningHeard,waterSurveyed:state.waterSurveyed,waterReportFiled:state.waterReportFiled,deploymentReviewed:state.deploymentReviewed,
      guideArrived:state.guide.arrived,guideReleased:state.guide.released,
      mandate:'preapproved-civilian-communications-cooperation',intelligenceRole:'advisory-only',
      clockDiscrepancy:state.gateLogReviewed?'retransmission-confirmed':conflict?'unresolved':'not-cross-checked',
      civilianOutcome:verified?'east-clearance-confirmed':
        (state.musterConfirmed?'south-headcount-verified':'south-evacuation-prioritized'),
      summary:verified
        ?(state.gateLogReviewed?'동쪽 현장 기록함에서 04:07 최초 수신과 04:12 동일 메시지 재전송을 확인했습니다. 통로는 유수프 구조단이 개방했습니다.':'유수프 구조단의 동쪽 통로 개방을 확인했습니다. 두 기록의 5분 차이는 여전히 원인 미확정입니다.')+
          (state.logHandedOff?' 확인한 기록을 현지 통제소 접수대에 직접 전달했습니다.':'')
        :(state.musterConfirmed
          ?'남쪽 집결지의 구조단 담당자와 직접 상황을 확인했습니다. 미확인 주민은 후속 구조단의 현장 확인 대상입니다. 동쪽 통로는 통제 중입니다.'
          :'유수프 구조단의 남쪽 대피를 우선했습니다. 동쪽 통로는 통제 중이며 기록 검증은 후속 과제입니다.')+
        (state.aidDelivered?' 현지 구조단에 비상 물품을 직접 전달했습니다.':
          state.aidStaged?' 비상 물품은 임시 적재대에 남겨 두었으며 구조단 인계는 미완료입니다.':'')+
        (state.guide.released?(Math.hypot(state.guide.x-POINTS.guideTransfer.x,state.guide.z-POINTS.guideTransfer.z)<2.1?' 안내원은 남쪽 물품 접수소의 현지 구조단에 직접 인계했습니다.':' 안내원은 집결지에서 현지 구조단에 직접 인계했습니다.'):state.guide.active?(state.guide.arrived?' 안내원이 실제로 남쪽 안뜰에 도착했습니다.':' 안내원이 대피 경로에서 아직 이동 중입니다.'):'')+
        (state.beaconEnabled?' 항구 수동 경고등을 켜 현지 구조단에 상태를 알렸습니다.':'')+
        (state.transportVan?.arrived?' 현지 운송 차량이 실제 승차 지점에 도착했습니다. 승객 수송과 귀환은 아직 확인되지 않았습니다.':state.transportVan?' 현지 운송 차량이 이동 중이나 도착과 수송은 미확인입니다.':'')+
         (state.driverReportFiled?' 운송 담당자 진술을 장부와 대조해 현장에 접수했으며 차량 도착은 확인되지 않았습니다.':'')+
        (state.awningFallen?(state.awningShift===1?' 시장 통행로의 쓰러진 차양을 실제로 옮겨 보행 공간을 확보했습니다.':' 시장 통행로의 쓰러진 차양은 아직 정리되지 않았습니다.'): '')+
        (state.workerInterviewed?' 항구 작업자의 직접 목격담은 시간 미확인 진술로 별도 보존했습니다.':'')+
        (state.officeBoardRead?' 항구 주민 안내소의 남쪽 구조단 접수 공지를 직접 확인했으나 실제 수송 완료는 확인되지 않았습니다.':'')+

        (state.passageWarningHeard?' 원래 귀환 일정과 현재 지역 이동 여건이 달라졌으며, 현지 담당자의 추가 확인이 필요합니다.':'')+
        (state.civicVisited?' 항구에서 도심 주민 공동 안뜰까지 직접 이동해 현장을 확인했으나 추가 주민 접수 결과는 미확인입니다.':'')+
        (state.waterReportFiled?' 공동 급수대 상태를 직접 확인해 현지 구조단에 현장 기록을 인계했습니다. 복구 완료 여부는 미확인입니다.':
          state.waterSurveyed?' 공동 급수대의 현장 상태를 확인했으나 구조단에 아직 인계하지 않았습니다.':'')+
        (state.drainCleared===true?' 공공 배수구의 장애물을 정리했지만 도로의 물기가 모두 마른 것은 아닙니다.':'')+
        (civicCrossingReached(state)?' 건널목을 건넌 주민 한 명이 실제로 도착했습니다. 다른 주민의 이동은 미확인입니다.':
          state.civicCrossing?.assisted===true?' 주민의 건널목 이동은 도왔지만 도착까지 확인하지는 못했습니다.':'')
    });
  }
  // The real E-key target decides which locally staffed option is playable.
  // This is presentation derived from existing 60Hz markers and collision;
  // no magical range, new required research or checkpoint field is added.
  function localRouteOffer(state){
    if(!state.combat?.cleared||
       !['records','decision'].includes(state.phase))return null;
    const marker=nearest(state);
    if(marker?.id==='coordinatorRequest')
      return Object.freeze({kind:'south',speaker:'유수프 구조단',
        action:'남쪽 주민 지원 현장 협의'});
    if(marker?.id==='eastLocalRequest')
      return Object.freeze({kind:'east',speaker:'동쪽 현지 통로 담당자',
        action:'동쪽 통행 직접 요청'});
    return null;
  }
  function objective(state) {
    switch(state.phase){
      case 'terminal':return '현지 민간 통신 협력 임무를 이어가세요. 시민 중계기에 가까이 접근하면 현장 상황이 바뀝니다. F로 직접 점검할 수도 있습니다.';
      case 'engagement':return '무장 대치자와의 교전에 대응하세요. 클릭/SPACE 발사, R 재장전, Q 상황 보고.'+
        (state.combat.supplyRemaining===0?' 유한 보급은 이미 사용되어 소진되었습니다.':
        state.world.player.charges>=state.world.player.maxCharges
          ?' 보급 상자 잔량 '+state.combat.supplyRemaining+'발 · 휴대 한도에 도달했습니다.'
          :' 보급 상자 잔량 '+state.combat.supplyRemaining+'발은 가까이에서 F로 확보할 수 있습니다.');
      case 'failed':return '신호가 끊겼습니다. 메뉴에서 미션을 다시 시작하세요.';
      case 'records':return (localRouteOffer(state)
        ?localRouteOffer(state).speaker+' 바로 앞입니다. F키로 '+localRouteOffer(state).action+'를 진행할 수 있습니다. 서류는 필요하지 않습니다.'
        :'현지 구조단에 직접 접근하면 남쪽 주민 지원을 협의할 수 있습니다. 동쪽 담당자에게 직접 접근하면 통행을 요청할 수 있습니다. 기록 조사는 선택 사항입니다.')+
        (state.combat.supplyRemaining>0?' 남은 현장 보급은 가까이에서 F로 수령할 수 있습니다.':'')+
        (!state.relayRestored?' 비상 통신 중계기 전원(황금 표식)을 F로 연결하면 동쪽 통제문 준비가 4초로 단축됩니다.':'');
      case 'decision':return localRouteOffer(state)
        ?localRouteOffer(state).speaker+'에게 F키로 '+localRouteOffer(state).action+'를 진행할 수 있습니다.'
        :state.found.length===2
        ?'현장 기록을 추가 확인했습니다. 남쪽 대피 지원과 동쪽 통로 현장 확인 중 선택하세요.'
        :'두 경로 모두 선택할 수 있습니다. 동쪽 통로는 현지 통제소의 실제 개방을 기다려야 하며 기록 검토는 선택 사항입니다.';
      case 'exit':return state.choice==='verification'
        ?(gateOpen(state)?'동쪽 추가 확인 경로(파란 표식)의 실제 통로를 걸어서 통과하세요. 가까운 표식은 F로 직접 확인할 수도 있습니다.'+(state.gateLogReviewed?(state.logHandedOff?' 현장 중계 기록을 현지 통제소에 전달했습니다.':' 선택: 기록 접수대(파란 표식)에 F로 확인 결과를 전달할 수 있습니다.'):' 선택: 동쪽 기록함(파란 표식)을 F로 확인해 시각 차이를 검증할 수 있습니다.'):state.gateObstructed?'동쪽 통제문 안전 정지 · 이동 경로에서 벗어나세요.':'동쪽 통제소 개방 작업 중 · 약 '+Math.ceil(state.gateReadyAt-state.world.elapsed)+'초 후 통과 가능합니다.')
        :'남쪽 안뜰(초록 표식) 뒤의 실제 출구를 걸어서 통과하세요. 가까운 표식은 F로 직접 확인할 수도 있습니다.'+
          (state.world.carryingAid?' 운반 중인 비상 물품은 구조단에 인계하거나 임시 적재대에 내려놓아야 출구를 통과할 수 있습니다.':'')+
          (state.musterConfirmed?' 집결지 구조단 담당자와 현장 협의 완료.':' 선택: 집결지의 유수프 구조단 담당자에게 직접 접근해 F로 협의할 수 있습니다.')+
          (state.guide.released?(Math.hypot(state.guide.x-POINTS.guideTransfer.x,state.guide.z-POINTS.guideTransfer.z)<2.1?' 안내원은 남쪽 구조단 접수소에 현장 인계했습니다.':' 안내원은 집결지 구조단에 현장 인계했습니다.'):state.guide.arrived?' 안내원 안뜰 도착 확인.':state.guide.active
            ?(state.guide.waiting?' 안내원이 현장에서 대기 중입니다. 가까이에서 F로 동행 재개 또는 집결지 인계가 가능합니다.':' 안내원 동행 중입니다. F로 잠시 대기시킬 수 있습니다. 반드시 안뜰까지 함께 도착하거나 집결지 또는 남쪽 구조단 접수소에 직접 인계하세요.'):state.musterConfirmed
            ?' 집결지 안내원(초록 표식)에게 F로 동행을 요청할 수 있습니다.':'')+
          (state.aidDelivered?' 비상 물품 인계 완료.':state.aidStaged
            ?' 상자가 임시 적재대에 있습니다. F로 다시 들거나 그대로 대피할 수 있습니다.':state.aidPickedUp
            ?' 상자를 운반 중입니다. 구조단에 인계하거나 임시 적재대에 F로 내려놓으세요.'
            :' 선택: 비상 물품 상자를 F로 집어 구조단에 직접 인계할 수 있습니다.');
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
    return {version:VERSION,phase:state.phase,found:state.found.slice(),choice:state.choice,relayRestored:state.relayRestored,beaconEnabled:state.beaconEnabled,flashlightOn:state.flashlightOn,flashlightTicks:state.flashlightTicks,gateLogReviewed:state.gateLogReviewed,logHandedOff:state.logHandedOff,musterConfirmed:state.musterConfirmed,dispatchReviewed:state.dispatchReviewed,transportContact:state.transportContact,driverReportFiled:state.driverReportFiled,officeBoardRead:state.officeBoardRead,civicVisited:state.civicVisited,waterSurveyed:state.waterSurveyed,waterReportFiled:state.waterReportFiled,deploymentReviewed:state.deploymentReviewed,
      passageWarningHeard:state.passageWarningHeard,
      awningFallen:state.awningFallen,awningShift:state.awningShift,awningWorking:state.awningWorking,
      mara:{x:state.mara.x,z:state.mara.z,arrived:state.mara.arrived},
      liaisonZ:state.liaisonZ,
      kimJiyoon:state.kimJiyoon?{x:state.kimJiyoon.x,z:state.kimJiyoon.z}:null,
      kimAftercareReviewed:state.kimAftercareReviewed,kimWaiting:state.kimWaiting,
      ...(state.civicCrossing?{civicCrossing:state.civicCrossing}:{}),
      transportVan:state.transportVan?{z:state.transportVan.z,arrived:state.transportVan.arrived,
        ...(hasOwn(state.transportVan,'driverZ')?{driverZ:state.transportVan.driverZ}:{}),
        ...(hasOwn(state.transportVan,'pauseUntil')?{pauseUntil:state.transportVan.pauseUntil}:{})}:null,
      aidPickedUp:state.aidPickedUp,aidDelivered:state.aidDelivered,aidStaged:state.aidStaged,
      drainCleared:state.drainCleared,drainClearTicks:state.drainClearTicks,
      workerInterviewed:state.workerInterviewed,
      worker:state.worker?{x:state.worker.x,z:state.worker.z,direction:state.worker.direction}:null,
      civilianWalker:state.civilianWalker?{x:state.civilianWalker.x,z:state.civilianWalker.z,arrived:state.civilianWalker.arrived}:null,
      civilianRerouted:state.civilianRerouted,
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
    if(Object.keys(data).length<expectedKeys.length||// Fourteen current optional fields plus one recognized retired v2 field.
      // Unknown fields are still rejected by the explicit allowlist below.
      Object.keys(data).length>expectedKeys.length+39||
      Object.keys(data).some(k=>!expectedKeys.concat('gateReadyAt','relayRestored','beaconEnabled','flashlightOn','flashlightTicks','gateLogReviewed','logHandedOff','musterConfirmed','dispatchReviewed','transportContact','driverReportFiled','transitReviewed','aidPickedUp','aidDelivered','aidStaged','drainCleared','drainClearTicks','guide','gateClearanceDuration','worker','workerInterviewed','officeBoardRead','civicVisited','waterSurveyed','waterReportFiled','deploymentReviewed','passageWarningHeard','transportVan','civilianWalker','civilianRerouted','awningFallen','awningShift','awningWorking','mara','liaisonZ','kimJiyoon','civicCrossing','kimAftercareReviewed','kimWaiting').includes(k))||
      (hasOwn(data,'kimWaiting')&&(
        typeof data.kimWaiting!=='boolean'||
        (data.kimWaiting&&(!data.kimJiyoon||
          !['records','decision','exit','complete'].includes(data.phase)||
          data.combat?.cleared!==true))))||
      (hasOwn(data,'kimAftercareReviewed')&&
        (typeof data.kimAftercareReviewed!=='boolean'||
         (data.kimAftercareReviewed&&
          (!['records','decision','exit','complete'].includes(data.phase)||
           !data.kimJiyoon||
           !(data.aidDelivered||data.guide?.released||
             data.civicCrossing?.assisted||
             data.workerInterviewed||data.logHandedOff)))))||
      (hasOwn(data,'awningFallen')&&
        (typeof data.awningFallen!=='boolean'||
         (data.awningFallen&&data.phase==='terminal')||
         (data.awningFallen&&data.player&&
           Sim.blocked(data.player.x,data.player.z,.85,
             [{...FALLEN_AWNING,x:FALLEN_AWNING.x+
               (data.awningShift===undefined?0:data.awningShift)*AWNING_SLIDE}]))))||
      (hasOwn(data,'mara')&&(
        !data.mara||typeof data.mara!=='object'||Array.isArray(data.mara)||
        Object.keys(data.mara).sort().join(',')!=='arrived,x,z'||
        typeof data.mara.arrived!=='boolean'||
        !Number.isFinite(data.mara.x)||!Number.isFinite(data.mara.z)||
        data.mara.x<MARA_PATH.startX||data.mara.x>MARA_PATH.endX||
        data.mara.z<MARA_PATH.endZ||data.mara.z>MARA_PATH.startZ||
        data.mara.arrived!==(data.mara.x===MARA_PATH.endX&&
          data.mara.z===MARA_PATH.endZ)||
        ((data.awningShift===undefined||data.awningShift<1)&&
          (data.mara.x!==MARA_PATH.startX||data.mara.z!==MARA_PATH.startZ))))||
      (hasOwn(data,'awningShift')!==hasOwn(data,'awningWorking'))||
      (hasOwn(data,'awningShift')&&(!Number.isFinite(data.awningShift)||
        data.awningShift<0||data.awningShift>1||
        typeof data.awningWorking!=='boolean'||
        ((data.awningShift>0||data.awningWorking)&&data.awningFallen!==true)||
        (data.awningWorking&&
          (data.awningShift>=1||!['records','decision','exit'].includes(data.phase)))))||
      (hasOwn(data,'relayRestored')&&typeof data.relayRestored!=='boolean')||
      (hasOwn(data,'civicCrossing')&&(
        !Civic||(()=>{
          try{
            const crossing=Civic.restore(data.civicCrossing);
            const c=crossing.civilian,init=Civic.initial();
            return crossing.tick>86400*60||
              (crossing.assisted&&crossing.tick===0)||
              (!crossing.assisted&&(c.x!==init.civilian.x||c.z!==init.civilian.z))||
              (crossing.disrupted&&data.phase==='terminal')||
              c.x<init.civilian.x||c.x>init.destination.x||
              c.z<init.civilian.z-2.4-1e-8||c.z>init.civilian.z+2.4+1e-8||
              crossing.destination.x!==init.destination.x||
              crossing.destination.z!==init.destination.z||
              (crossing.assisted&&!['records','decision','exit','complete'].includes(data.phase));
          }catch(_){return true;}
        })()))||
      (hasOwn(data,'kimJiyoon')&&data.kimJiyoon!==null&&(
        !data.kimJiyoon||typeof data.kimJiyoon!=='object'||
        Array.isArray(data.kimJiyoon)||
        Object.keys(data.kimJiyoon).sort().join(',')!=='x,z'||
        !Number.isFinite(data.kimJiyoon.x)||
        !Number.isFinite(data.kimJiyoon.z)||
        Math.abs(data.kimJiyoon.x)>180||Math.abs(data.kimJiyoon.z)>180||
        Sim.blocked(data.kimJiyoon.x,data.kimJiyoon.z,.55,
          Sim.newMatch(20261027,0).obstacles.filter(o=>o.type!=='yard-gate'&&
            o.type!=='yard-fence'&&o.type!=='yard-service-vehicle'&&
            o.type!=='volcanic-outcrop'&&!o.type.startsWith('dock-'))
          .concat(STORY_STRUCTURES)) ))||
      (hasOwn(data,'liaisonZ')&&
       (!Number.isFinite(data.liaisonZ)||
        data.liaisonZ<LIAISON_WALK.endZ||data.liaisonZ>LIAISON_WALK.startZ||
        (data.liaisonZ<LIAISON_WALK.startZ&&
         (!data.combat?.cleared||
          !['records','decision','exit','complete'].includes(data.phase)))))||
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
      (hasOwn(data,'dispatchReviewed')&&
        (typeof data.dispatchReviewed!=='boolean'||
         (data.dispatchReviewed&&(data.choice!=='evacuation'||
           !['exit','complete'].includes(data.phase)))))||
       (hasOwn(data,'transportVan')&&data.transportVan!==null&&(
         !data.transportVan||typeof data.transportVan!=='object'||Array.isArray(data.transportVan)||
         !['arrived,z','arrived,driverZ,z','arrived,pauseUntil,z','arrived,driverZ,pauseUntil,z'].includes(Object.keys(data.transportVan).sort().join(','))||
         (hasOwn(data.transportVan,'pauseUntil')&&(
           !Number.isFinite(data.transportVan.pauseUntil)||
           data.transportVan.pauseUntil<0||
           data.transportVan.pauseUntil>data.elapsed+VAN_CROSSING_YIELD_SECONDS+1e-7||
           (hasOwn(data.transportVan,'driverZ')&&
             data.transportVan.driverZ>CIVILIAN_SHUTTLE.boardZ+1e-8)))||
         (hasOwn(data.transportVan,'driverZ')&&
           (!Number.isFinite(data.transportVan.driverZ)||
            data.transportVan.driverZ<CIVILIAN_SHUTTLE.boardZ||
            data.transportVan.driverZ>POINTS.transportDriver.z||
            (data.transportVan.driverZ>CIVILIAN_SHUTTLE.boardZ&&
             (data.transportVan.z!==CIVILIAN_SHUTTLE.startZ||
              data.transportVan.arrived))))||
         typeof data.transportVan.arrived!=='boolean'||!Number.isFinite(data.transportVan.z)||
         data.transportVan.z<CIVILIAN_SHUTTLE.startZ||data.transportVan.z>CIVILIAN_SHUTTLE.endZ||
         data.transportVan.arrived!==(data.transportVan.z===CIVILIAN_SHUTTLE.endZ)||
         data.transportContact!==(data.transportVan.arrived?2:1)||
         !['exit','complete'].includes(data.phase)))||
       (hasOwn(data,'transportContact')&&(
          !Number.isInteger(data.transportContact)||
          data.transportContact<0||data.transportContact>2||
          (data.transportContact>0&&!['exit','complete'].includes(data.phase))))||
       (hasOwn(data,'deploymentReviewed')&&typeof data.deploymentReviewed!=='boolean')||
       (hasOwn(data,'passageWarningHeard')&&
         (typeof data.passageWarningHeard!=='boolean'||
           (data.passageWarningHeard&&!['exit','complete'].includes(data.phase))))||
       (hasOwn(data,'drainCleared')!==hasOwn(data,'drainClearTicks'))||
       (hasOwn(data,'drainCleared')&&(
         typeof data.drainCleared!=='boolean'||
         !Number.isSafeInteger(data.drainClearTicks)||
         data.drainClearTicks<0||data.drainClearTicks>=(StreetFlood?.CLEAR_TICKS||180)||
         (data.drainCleared&&data.drainClearTicks!==0)||
         ((data.drainCleared||data.drainClearTicks>0)&&
           !['records','decision','exit','complete'].includes(data.phase))||
         (data.drainClearTicks>0&&data.phase==='complete'))) ||
       (hasOwn(data,'waterSurveyed')&&
         (typeof data.waterSurveyed!=='boolean'||
          (data.waterSurveyed&&(data.civicVisited!==true||
            !['records','decision','exit','complete'].includes(data.phase)))))||
       (hasOwn(data,'waterReportFiled')&&
         (typeof data.waterReportFiled!=='boolean'||
          (data.waterReportFiled&&data.waterSurveyed!==true)))||
       (hasOwn(data,'civicVisited')&&
         (typeof data.civicVisited!=='boolean'||
          (data.civicVisited&&!['records','decision','exit','complete'].includes(data.phase))))||
       (hasOwn(data,'officeBoardRead')&&
        (typeof data.officeBoardRead!=='boolean'||
         (data.officeBoardRead&&['terminal','engagement','failed'].includes(data.phase))))||
       (hasOwn(data,'driverReportFiled')&&
         (typeof data.driverReportFiled!=='boolean'||
           (data.driverReportFiled&&(data.choice!=='evacuation'||
             !['exit','complete'].includes(data.phase)||
             data.dispatchReviewed!==true||data.transportContact!==2))))||
       (hasOwn(data,'transitReviewed')&&typeof data.transitReviewed!=='boolean')||
      // Existing saves omit the worker; they stay on the old NPC layout.
      (hasOwn(data,'workerInterviewed')&&
       (typeof data.workerInterviewed!=='boolean'||
        (data.workerInterviewed&&
         (['terminal','engagement'].includes(data.phase)||data.worker===null))))||
      (hasOwn(data,'worker')&&data.worker!==null&&
       (!data.worker||typeof data.worker!=='object'||Array.isArray(data.worker)||
        Object.keys(data.worker).sort().join(',')!=='direction,x,z'||
        !Number.isFinite(data.worker.x)||!Number.isFinite(data.worker.z)||
        data.worker.x<WORKER_PATH.minX||data.worker.x>WORKER_PATH.maxX||
        // Historical saves keep their previous sidewalk position. The worker
        // can now move to shelter during the actual crisis without a new key.
        (['engagement','records','decision','exit','complete','failed'].includes(data.phase)
          ?data.worker.z<WORKER_PATH.z-1e-8||
            data.worker.z>WORKER_PATH.safeZ+1e-8||
            (data.worker.z>WORKER_PATH.z+1e-8&&
              data.worker.x<WORKER_PATH.maxX-1e-6)
          :Math.abs(data.worker.z-WORKER_PATH.z)>1e-8)||
        ![-1,1].includes(data.worker.direction)))||
      (hasOwn(data,'civilianRerouted')&&typeof data.civilianRerouted!=='boolean')||
      (data.civilianRerouted===true&&!hasOwn(data,'civilianWalker'))||
      (hasOwn(data,'civilianWalker')&&(
        !data.civilianWalker||typeof data.civilianWalker!=='object'||Array.isArray(data.civilianWalker)||
        Object.keys(data.civilianWalker).sort().join(',')!=='arrived,x,z'||
        (!data.civilianRerouted&&data.civilianWalker.x!==CIVILIAN_WALK.x)||
        (data.civilianRerouted===true&&
          (!Number.isFinite(data.civilianWalker.x)||
           data.civilianWalker.x<CIVILIAN_WALK.aidLaneX||
           data.civilianWalker.x>CIVILIAN_WALK.x))||
        !Number.isFinite(data.civilianWalker.z)||
        data.civilianWalker.z<CIVILIAN_WALK.endZ||data.civilianWalker.z>CIVILIAN_WALK.startZ||
        typeof data.civilianWalker.arrived!=='boolean'||
        data.civilianWalker.arrived!==(data.civilianWalker.z===CIVILIAN_WALK.endZ&&
          data.civilianWalker.x===(data.civilianRerouted===true
            ?CIVILIAN_WALK.aidLaneX:CIVILIAN_WALK.x))||
        (['terminal','engagement','failed'].includes(data.phase)&&
          data.civilianWalker.z!==CIVILIAN_WALK.startZ)))||
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
      (data.transitReviewed===true&&(data.musterConfirmed!==true||
        data.choice!=='evacuation'||!['exit','complete'].includes(data.phase)))||
      (hasOwn(data,'relayRestored')&&data.relayRestored&&
        (['terminal','engagement','failed'].includes(data.phase)))||
      (data.beaconEnabled===true&&
        (data.relayRestored!==true||['terminal','engagement','failed'].includes(data.phase)))||
      (['terminal','engagement','failed'].includes(data.phase)&&
        (data.found.length!==0||data.choice!==null))||
      ((data.phase==='records'||data.phase==='decision')&&data.choice!==null)||
      ((data.phase==='exit'||data.phase==='complete')&&!['evacuation','verification'].includes(data.choice))||
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
    // Existing checkpoint generations predate this optional observed journal.
    state.dispatchReviewed=hasOwn(data,'dispatchReviewed')?data.dispatchReviewed:false;
    // Old current and completed story saves predate the optional conversation.
    state.transportContact=hasOwn(data,'transportContact')?data.transportContact:0;
     state.transportVan=hasOwn(data,'transportVan')&&data.transportVan!==null?{...data.transportVan}:null;
    state.driverReportFiled=hasOwn(data,'driverReportFiled')?data.driverReportFiled:false;
    state.officeBoardRead=hasOwn(data,'officeBoardRead')?data.officeBoardRead:false;
    state.civicVisited=hasOwn(data,'civicVisited')?data.civicVisited:false;
    state.passageWarningHeard=hasOwn(data,'passageWarningHeard')?data.passageWarningHeard:false;
    state.awningFallen=hasOwn(data,'awningFallen')?data.awningFallen:false;
    state.awningShift=hasOwn(data,'awningShift')?data.awningShift:0;
    state.awningWorking=hasOwn(data,'awningWorking')?data.awningWorking:false;
    state.mara=hasOwn(data,'mara')?{...data.mara}:newMarketMara();
    // Older checkpoints have no companion; do not retroactively create a
    // character beside the starting point in a late-game loaded mission.
    state.kimJiyoon=hasOwn(data,'kimJiyoon')?
      (data.kimJiyoon?{...data.kimJiyoon}:null):null;
    state.kimAftercareReviewed=hasOwn(data,'kimAftercareReviewed')?
      data.kimAftercareReviewed:false;
    // Existing V2 saves did not expose a companion pause/resume interaction.
    state.kimWaiting=hasOwn(data,'kimWaiting')?data.kimWaiting:false;
    // Older v2 saves must not suddenly spawn a new resident at the crossing.
    state.civicCrossing=Civic&&hasOwn(data,'civicCrossing')?
      Civic.restore(data.civicCrossing):null;
    state.liaisonZ=hasOwn(data,'liaisonZ')?data.liaisonZ:LIAISON_WALK.startZ;
    state.waterSurveyed=hasOwn(data,'waterSurveyed')?data.waterSurveyed:false;
    state.waterReportFiled=hasOwn(data,'waterReportFiled')?data.waterReportFiled:false;
    // Compatibility only: older v2 saves may retain a record of a retired
    // on-site document action. It no longer gates or alters the campaign.
    state.deploymentReviewed=hasOwn(data,'deploymentReviewed')?data.deploymentReviewed:false;
     // Historic v2 files may carry a now-retired, non-essential planning-board
     // flag. It is validated above but intentionally discarded on restore;
     // genuine escort, supply and evidence progress remains untouched.
    state.aidPickedUp=hasOwn(data,'aidPickedUp')?data.aidPickedUp:false;
    state.aidDelivered=hasOwn(data,'aidDelivered')?data.aidDelivered:false;
    state.aidStaged=hasOwn(data,'aidStaged')?data.aidStaged:false;
    state.drainCleared=hasOwn(data,'drainCleared')?data.drainCleared:false;
    state.drainClearTicks=hasOwn(data,'drainClearTicks')?data.drainClearTicks:0;
    state.worker=hasOwn(data,'worker')?(data.worker===null?null:{...data.worker}):null;
    state.workerInterviewed=hasOwn(data,'workerInterviewed')?data.workerInterviewed:false;
    state.civilianWalker=hasOwn(data,'civilianWalker')?{...data.civilianWalker}:newCivilianWalker();
    state.civilianRerouted=hasOwn(data,'civilianRerouted')?data.civilianRerouted:false;
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
    state.subtitle=state.phase==='complete'
      ?completionRecap(state)
      :'체크포인트를 불러왔습니다. '+objective(state);
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
    VERSION,POINTS,RECORDS,INTERACT_RADIUS,GATE_CLEARANCE_SECONDS,createState,step,markers,navigationMarkers,localPublicAddress,nearest,localRouteOffer,interact,toggleFlashlight,fire,autoFire,support,choose,
    objective,situation,exitReadiness,openingBeat,missionTasks,optionalTaskAudit,debrief,closingScene,escortArrivalCheckpoint,backToRecords,serialize,restore,recoverCheckpoint,reviewCompletedMission,validateSnapshot,civicCrossingReached,civicCrossingArrivalCheckpoint
  });
});
