/* VEILPOINT campaign contract — planning/progression data, not rendered missions.
 * No network requests; reusable by browser prototype and native content pipeline.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VeilpointCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  // Canonical cast is fictional. ROK/NIS affiliations are narrative, not real operations.
  const LEAD = Object.freeze({
    id: 'captain-lee-suhyeok', nameKo: '이수혁', rankKo: '대위',
    affiliationKo: '대한민국 특수부대', isPlayer: true
  });
  const SUPPORT_CAST = Object.freeze([
    Object.freeze({id:'nis-kim-jiyun',nameKo:'김지윤',genderKo:'남성',roleKo:'국정원 요원',affiliationKo:'국가정보원'}),
    Object.freeze({id:'nis-jo-hyeonji',nameKo:'조현지',genderKo:'여성',roleKo:'국정원 요원',affiliationKo:'국가정보원'}),
    Object.freeze({id:'mara-dahan',nameKo:'마라 다한',roleKo:'나흐린 시민 통신기술자',affiliationKo:'나흐린 시민 공동체'}),
    Object.freeze({id:'yusuf-rahal',nameKo:'유수프 라할',roleKo:'현지 구조 책임자',affiliationKo:'시민 구조단'})
  ]);
  // Author-approved 12h pacing targets. They are NOT measured or already playable.
  // Character scenes support a war-led FPS rather than forcing constant choices.
  // The four categories are exclusive for future playtest timing; a subtitle
  // playing over active movement does not double-count elapsed seconds.
  const EXPERIENCE_SHARE_PERCENT = Object.freeze({
    combat:50,urgentMovementAndRescue:20,characterAndStory:22,exploration:8
  });
  const COMBAT_FOCUS = Object.freeze({targetShareMin:0.50,targetShareMax:0.50,
    fullyImplemented:false,measuredCombatShare:null});
  const MISSION_COMBAT_THEMES = Object.freeze([
    'urban-first-engagement', 'mobile-escort', 'desert-settlement',
    'vertical-district', 'harbor-conflict', 'mountain-relay',
    'district-crisis', 'multi-objective-city', 'separated-squad',
    'moving-transit', 'final-passage', 'multi-stage-finale'
  ]);
  // Story causality contract, not a second set of collectible mission documents.
  // The pre-departure briefing is already known to Lee; the escalation is not.
  // These beats are presentation metadata, not mandatory player interactions.
  const CH01_CAUSAL_BEATS = Object.freeze([
    Object.freeze({id:'korea-briefing',order:0,location:'korea',trigger:'opening',
      event:'이수혁은 출국 전에 합법적인 민간 통신 지원 파견 목적과 복귀 계획을 브리핑받는다.',
      consequence:'현지에서 파견 명령을 발견하거나 임무를 새로 배우지 않는다.',requiresInteraction:false}),
    Object.freeze({id:'harbor-arrival',order:1,location:'fictional-harbor',trigger:'arrival',
      event:'현지 구조 책임자 유수프가 예정된 민간 통신 지원 업무를 안내한다.',
      consequence:'이수혁은 현지인 주도 하에 통신 상태를 확인한다.',requiresInteraction:false}),
    Object.freeze({id:'unexpected-escalation',order:2,location:'fictional-harbor',trigger:'communications-fail',
      event:'예상하지 못한 내전 확대로 민간 통신이 두절되고 예정된 복귀가 불가능해진다.',
      consequence:'현지 구조단과 협의해 주민 대피 지원을 우선한다.',requiresInteraction:false}),
    Object.freeze({id:'civilian-agency',order:3,location:'fictional-harbor',trigger:'route-choice',
      event:'유수프와 주민들이 안전한 이동 경로를 결정하고 지원을 요청한다.',
      consequence:'이수혁은 현지 지휘권을 대신하지 않고 지원과 생존을 선택한다.',requiresInteraction:false})
  ]);
  function ch01Causality() {
    return CH01_CAUSAL_BEATS.map(beat=>({...beat}));
  }
  const MISSION_DEFS = [
    ['M01', '정전의 새벽', 'The Last Broadcast', 50, 'night-arrival', 'route', ['evacuation', 'verification']],
    ['M02', '두 개의 지도', 'Two Maps', 55, 'dynamic-travel', 'map', ['fast', 'verified']],
    ['M03', '소금바람', 'Salt Wind', 60, 'settlement-hub', 'witness', ['listen', 'move']],
    ['M04', '유리 회랑', 'Glass Corridor', 55, 'vertical-interiors', 'relay', ['reroute', 'restore']],
    ['M05', '갈라진 항구', 'Split Harbor', 65, 'changing-visibility', 'district', ['harbor', 'market']],
    ['M06', '마지막 중계', 'The Last Relay', 60, 'mountain-relay', 'signal', ['broadcast', 'quiet']],
    ['M07', '거짓된 평온', 'Borrowed Calm', 55, 'refuge-hub', 'trust', ['confide', 'verify']],
    ['M08', '도시의 심장', 'Heart of the City', 65, 'reactive-district', 'power', ['clinic', 'rail']],
    ['M09', '부서진 약속', 'Fractured Promise', 60, 'dual-perspective', 'account', ['joint', 'separate']],
    ['M10', '다섯 번째 신호', 'Fifth Signal', 60, 'moving-hub', 'priority', ['evidence', 'rescue']],
    ['M11', '침묵의 시간', 'Hours of Silence', 65, 'atmospheric-traverse', 'network', ['public', 'local']],
    ['M12', '남은 빛', 'After the Light', 70, 'multi-stage-finale', 'ending', ['reconcile', 'rebuild']]
  ];
  const MISSIONS = Object.freeze(MISSION_DEFS.map((m, i) => Object.freeze({
    id: m[0], order: i + 1, titleKo: m[1], titleEn: m[2],
    targetMinutes: m[3], signature: m[4],
    protagonistId: LEAD.id, combatTheme: MISSION_COMBAT_THEMES[i],
    decisionKey: m[5], options: Object.freeze(m[6].slice())
  })));
  const TARGET_MINUTES = MISSIONS.reduce((sum, m) => sum + m.targetMinutes, 0);

  // Planning-only budget derived from the actual 12-mission metadata.
  // Seconds preserve the exact 22% and 8% fractional-minute allocations.
  // No checkpoint or game-time state is changed by this projection.
  function plannedExperienceSeconds(){
    return Object.freeze(Object.fromEntries(Object.entries(EXPERIENCE_SHARE_PERCENT)
      .map(([category,percent])=>[category,TARGET_MINUTES*60*percent/100])));
  }
  // QA can later compare *observed*, mutually exclusive playtest durations
  // without pretending the twelve authored chapters are implemented.
  function reviewObservedPacing(seconds){
    if(!seconds||typeof seconds!=='object'||Array.isArray(seconds)||
      Object.keys(seconds).length!==Object.keys(EXPERIENCE_SHARE_PERCENT).length)
      throw new TypeError('Four measured activity durations required');
    const categories=Object.keys(EXPERIENCE_SHARE_PERCENT);
    if(!categories.every(key=>Object.prototype.hasOwnProperty.call(seconds,key)&&
       Number.isFinite(seconds[key])&&seconds[key]>=0))
      throw new TypeError('Invalid measured activity durations');
    const total=categories.reduce((sum,key)=>sum+seconds[key],0);
    // Individually finite telemetry can still overflow when accumulated.
    // Reject the sample rather than publishing NaN/zero pacing percentages.
    if(!Number.isFinite(total))
      throw new RangeError('Measured activity duration total overflow');
    if(total===0)return Object.freeze({measuredSeconds:0,observedPercent:null});
    const observedPercent=Object.fromEntries(categories.map(key=>
      [key,seconds[key]/total*100]));
    return Object.freeze({measuredSeconds:total,
      observedPercent:Object.freeze(observedPercent)});
  }

  function freshProgress() {
    return { version: VERSION, completed: [], choices: {} };
  }
  function validate(progress) {
    if (!progress || typeof progress !== 'object' || Array.isArray(progress))
      throw new TypeError('Invalid campaign progress');
    if (progress.version !== VERSION || !Array.isArray(progress.completed) ||
        !progress.choices || typeof progress.choices !== 'object' ||
        Array.isArray(progress.choices) || progress.completed.length > MISSIONS.length)
      throw new RangeError('Unsupported campaign progress');
    const choiceKeys = Object.keys(progress.choices);
    if (choiceKeys.length !== progress.completed.length ||
        choiceKeys.some(key => !progress.completed.includes(key)))
      throw new RangeError('Campaign decisions and completed missions differ');
    for (let i = 0; i < progress.completed.length; i++) {
      const mission = MISSIONS[i];
      if (progress.completed[i] !== mission.id ||
          !Object.prototype.hasOwnProperty.call(progress.choices, mission.id) ||
          !mission.options.includes(progress.choices[mission.id]))
        throw new RangeError('Campaign progress skips a mission or has invalid decision');
    }
    return true;
  }
  function nextMission(progress) {
    validate(progress);
    return MISSIONS[progress.completed.length] || null;
  }
  function completeMission(progress, missionId, option) {
    const expected = nextMission(progress);
    if (!expected || expected.id !== missionId)
      throw new RangeError('Only the next unfinished mission can be completed');
    if (!expected.options.includes(option))
      throw new RangeError('Invalid mission decision');
    const updated = {
      version: VERSION,
      completed: progress.completed.slice().concat([missionId]),
      choices: Object.assign({}, progress.choices)
    };
    Object.defineProperty(updated.choices, missionId,
      { value: option, enumerable: true, configurable: true, writable: true });
    validate(updated);
    return updated;
  }
  function plannedRemainingMinutes(progress) {
    validate(progress);
    return MISSIONS.slice(progress.completed.length)
      .reduce((sum, mission) => sum + mission.targetMinutes, 0);
  }
  function serialize(progress) {
    validate(progress);
    return JSON.stringify({
      version: VERSION, completed: progress.completed.slice(),
      choices: Object.fromEntries(progress.completed.map(id => [id, progress.choices[id]]))
    });
  }
  function deserialize(json) {
    if (typeof json !== 'string' || json.length > 8192)
      throw new TypeError('Invalid campaign save data');
    const parsed = JSON.parse(json);
    validate(parsed);
    return {
      version: VERSION,
      completed: parsed.completed.slice(),
      choices: Object.fromEntries(parsed.completed.map(id => [id, parsed.choices[id]]))
    };
  }
  function campaignStatus(progress) {
    const next = nextMission(progress);
    return {
      completedCount: progress.completed.length,
      totalMissions: MISSIONS.length,
      targetMinutes: TARGET_MINUTES,
      plannedRemainingMinutes: plannedRemainingMinutes(progress),
      nextMissionId: next ? next.id : null,
      // The sequence is metadata only: no authored chapter is certified playable.
      // A filled-out planning save must never claim a finished twelve-hour game.
      metadataSequenceComplete: next === null,
      playableMissionsVerified: 0,
      fullyCompleted: false,
      measuredPlaytimeMinutes: null
    };
  }
  return Object.freeze({
    VERSION, MISSIONS, TARGET_MINUTES, LEAD, SUPPORT_CAST, COMBAT_FOCUS,
    EXPERIENCE_SHARE_PERCENT, plannedExperienceSeconds, reviewObservedPacing,
    CH01_CAUSAL_BEATS, ch01Causality,
    freshProgress, validate,
    nextMission, completeMission, plannedRemainingMinutes,
    serialize, deserialize, campaignStatus
  });
});
