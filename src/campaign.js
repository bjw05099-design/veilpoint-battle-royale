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
  const MISSION_DEFS = [
    ['M01', '정전의 새벽', 'The First Blackout', 50, 'night-arrival', 'route', ['evacuation', 'verification']],
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
    decisionKey: m[5], options: Object.freeze(m[6].slice())
  })));
  const TARGET_MINUTES = MISSIONS.reduce((sum, m) => sum + m.targetMinutes, 0);

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
    if (choiceKeys.length !== progress.completed.length)
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
      fullyCompleted: next === null,
      // The estimate is *not* real playtime; an authored game is still required.
      measuredPlaytimeMinutes: null
    };
  }
  return Object.freeze({
    VERSION, MISSIONS, TARGET_MINUTES, freshProgress, validate,
    nextMission, completeMission, plannedRemainingMinutes,
    serialize, deserialize, campaignStatus
  });
});
