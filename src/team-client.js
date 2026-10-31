/* VEILPOINT local two-client rules prototype UI; tab-scoped resume only, no external requests. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const canvas = el('arena'), ctx = canvas.getContext('2d');
  let token = null, seq = 0, state = null, lastDirection = '', capturing = false;
  let lastMoveRefreshTick = -Infinity, lastCaptureRefreshTick = -Infinity;
  let triggering = false, lastTriggerRefreshTick = -Infinity;
  let lastAimTick = -Infinity, lastAimVector = null, lastAimPoint = null;
  // Mouse input must not wait for the next 150ms server snapshot to change aim.
  // Throttle changed directions to 60Hz; the next poll flushes a final
  // movement that arrived inside the throttle window. Simulation stays 60Hz.
  let lastAimSentAt = -Infinity;
  let aimFlushTimer = null;
  const cancelAimFlush = () => {
    if (aimFlushTimer !== null) clearTimeout(aimFlushTimer);
    aimFlushTimer = null;
  };
  let activeTouchAimPointer = null;
  let joining = false, restoring = false, polling = false;
  let windowFocused = true; // A visible but unfocused desktop window is also inactive.
  let pending = Promise.resolve();
  // Coalesce only consecutive unsent aim or movement intents of the SAME type.
  // Slow HTTP must not replay stale mouse flicks or released keyboard directions.
  // Fire, release, capture and other commands remain strict ordering barriers.
  let queuedInput = null;
  let previousPhase = null;
  let actionFeedback = '', feedbackUntil = 0;
  const SESSION_KEY = 'veilpoint.team.tabSession';
  // Share PC keyboard preferences with the BR and CH01 browser prototypes.
  // The server remains authoritative for all movement and gameplay commands.
  const Desktop = window.VeilpointDesktopControls;
  let controls = Desktop.load(window.localStorage);
  const keys = new Set();
  const physicalTrigger = Desktop.createTriggerLatch();
  // Capture the identity when a request is queued: an old command must never
  // be sent using a newly joined tab's token after an expired-session reset.
  const request = async (path, body, authToken = token) => {
    const response = await fetch(path, {method: body ? 'POST' : 'GET',
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(authToken ? {'X-Player-Token': authToken} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const status = msg => {el('status').textContent = msg;};
  function invalidateSession(expiredToken) {
    if (!expiredToken || token !== expiredToken) return;
    // A restarted local server may forget the token while this tab stays open.
    // Drop all held PC input and old snapshots before enabling a fresh join.
    token = null; seq = 0; state = null; previousPhase = null;
    lastDirection = ''; lastMoveRefreshTick = -Infinity;
    lastCaptureRefreshTick = -Infinity; lastTriggerRefreshTick = -Infinity;
    lastAimTick = -Infinity; lastAimSentAt = -Infinity; lastAimVector = null; lastAimPoint = null;
    cancelAimFlush();queuedInput = null;activeTouchAimPointer = null; keys.clear(); physicalTrigger.clear();
    capturing = false; triggering = false; actionFeedback = '';
    try {window.sessionStorage.removeItem(SESSION_KEY);} catch (_) {}
    el('join').disabled = false; el('ready').disabled = true;
    el('loadout').disabled = true;
    el('name').disabled = false;
    status('서버 세션이 만료되었습니다. 새로 입장할 수 있습니다.');
    draw();
  }
  const send = (type, payload = {}) => {
    if (!token) return Promise.resolve();
    const sessionToken = token;
    const command = {seq: ++seq, type, ...payload};
    const coalescible = type === 'aim' || type === 'move';
    if (coalescible && queuedInput && queuedInput.token === sessionToken &&
        queuedInput.type === type) {
      // The server accepts increasing sequences with gaps. Only an UNSENT
      // same-type intent can be replaced; intervening actions retain order.
      queuedInput.command = command;
      return queuedInput.promise;
    }
    queuedInput = null;
    const inputSlot = coalescible ? {type, token: sessionToken, command, promise: null} : null;
    pending = pending.then(() => {
      if (inputSlot && queuedInput === inputSlot) queuedInput = null;
      if (token !== sessionToken) return null;
      return request('/command', inputSlot ? inputSlot.command : command, sessionToken);
    }).then(result => {
      if (!result || token !== sessionToken) return result;
      if (type === 'fire' || type === 'reload') {
        const messages = {cooldown: '발사 간격 유지', reloading: '재장전 중',
          empty_magazine: '탄창 비움 · R 재장전', already_reloading: '이미 재장전 중',
          magazine_full: '탄창 가득 참', no_reserve: '예비 탄약 없음',
          recover_not_ready: '안정화 필요 · 잠시 후 R로 재시도'};
        actionFeedback = result.ok
          ? (type === 'fire' ? '발사 완료 · 명중 여부는 시야로 판단' : result.recovered ? '재장전 지연 회복' : result.hesitation ? '긴장으로 재장전 지연 · R로 회복 가능' : '재장전 시작')
          : (messages[result.reason] || '명령을 처리하지 못했습니다');
        feedbackUntil = (state?.tick || 0) + 90;
      }
      return result;
    }).catch(err => {
      if (token !== sessionToken) return;
      if (err.message === 'unknown_player') invalidateSession(sessionToken);
      else status(`명령 실패: ${err.message}`);
    });
    if (inputSlot) {
      inputSlot.promise = pending;
      queuedInput = inputSlot;
    }
    return pending;
  };
  const held = action => {
    for (const code of keys) if (Desktop.actionFor(code, controls) === action) return true;
    return false;
  };
  const direction = () => {
    const x = Number(held('right') || keys.has('right')) -
      Number(held('left') || keys.has('left'));
    const z = Number(held('back') || keys.has('down')) -
      Number(held('forward') || keys.has('up'));
    return {x, z};
  };
  const aimAtWorld = (tx, tz) => {
    if (!token || state?.phase !== 'playing') return;
    const dx = tx - state.self.x, dz = tz - state.self.z;
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 0.1) return;
    const aim = {x: dx / len, z: dz / len};
    // Stationary aim renews only after 20 server ticks, before the 90-tick
    // lease expires. Changed PC pointer aim is instead limited by a monotonic
    // 60Hz *input send* budget, not by 150ms state polling. The final pointer
    // position is retained and retried by the next state poll if throttled.
    const change = lastAimVector
      ? Math.hypot(aim.x - lastAimVector.x, aim.z - lastAimVector.z) : Infinity;
    if (change < .035 && state.tick - lastAimTick < 20) return;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() : Date.now();
    if (change >= .035 && now >= lastAimSentAt && now - lastAimSentAt < 1000 / 60) {
      // A quick final flick must not wait up to 150ms for the next snapshot.
      // Keep only one trailing timer; it always reads the latest world point.
      if (aimFlushTimer === null) {
        const sessionToken = token;
        const remaining = 1000 / 60 - (now - lastAimSentAt);
        aimFlushTimer = setTimeout(() => {
          aimFlushTimer = null;
          if (token === sessionToken && state?.phase === 'playing' && lastAimPoint)
            aimAtWorld(lastAimPoint.x, lastAimPoint.z);
        }, Math.ceil(remaining) + 1);
      }
      return;
    }
    cancelAimFlush();
    lastAimSentAt = now;
    lastAimTick = state.tick;lastAimVector = aim;
    void send('aim', {direction: aim});
  };
  const aimFromPointer = event => {
    if (!token || state?.phase !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Invert the same top-down projection as draw(); send only direction.
    const tx = ((event.clientX - rect.left) / rect.width * canvas.width - canvas.width / 2) / 9.5;
    const tz = ((event.clientY - rect.top) / rect.height * canvas.height - canvas.height / 2) / 9.5;
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
    lastAimPoint = {x: tx, z: tz};
    aimAtWorld(tx, tz);
  };
  const releaseAim = () => {
    // A canceled touch must not keep renewing a server-side aim override.
    activeTouchAimPointer = null;
    cancelAimFlush();
    if (!lastAimPoint) return;
    lastAimPoint = null;lastAimVector = null;lastAimTick = -Infinity;lastAimSentAt = -Infinity;
    if (token && state?.phase === 'playing') void send('aimRelease');
  };
  canvas.addEventListener('pointerdown', event => {
    // On hybrid devices, a mouse event must not steal a held touch gesture.
    if (activeTouchAimPointer !== null && event.pointerType !== 'touch') return;
    if (event.pointerType === 'touch') {
      // Ignore a second finger: only the gesture that began aiming can update
      // or release this server-owned facing intent.
      if (activeTouchAimPointer !== null) return;
      activeTouchAimPointer = event.pointerId ?? -1;
    }
    aimFromPointer(event);
    if (event.pointerType === 'mouse' && event.button === 0 && state?.phase === 'playing') {
      // PC mouse aim and fire share the canvas; server still owns shot cadence.
      void send('fire');
      setTrigger(physicalTrigger.press('mouse'));
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (activeTouchAimPointer !== null && event.pointerType !== 'touch') return;
    if (event.pointerType === 'touch') {
      if (activeTouchAimPointer === null || activeTouchAimPointer !== (event.pointerId ?? -1)) return;
    } else if (event.pointerType !== 'mouse' && !event.buttons) return;
    aimFromPointer(event);
  });
  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, event => {
      if (event.pointerType === 'mouse' && (type === 'pointercancel' || event.button === 0))
        setTrigger(physicalTrigger.release('mouse'));
      if (event.pointerType === 'touch') {
        if (activeTouchAimPointer === (event.pointerId ?? -1)) releaseAim();
      } else if (type === 'pointercancel' && activeTouchAimPointer === null) {
        // Browser/OS may cancel a mouse or pen pointer without pointerleave.
        // Do not leave the server aim lease refreshing indefinitely.
        releaseAim();
      }
    });
  }
  canvas.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') setTrigger(physicalTrigger.release('mouse'));
    // A different finger leaving the arena must not cancel the primary aim.
    // The primary finger leaving does release, even if pointerup is not fired.
    if (activeTouchAimPointer !== null &&
        (event.pointerType !== 'touch' || activeTouchAimPointer !== (event.pointerId ?? -1))) return;
    releaseAim();
  });
  const updateInput = () => {
    if (!token || !state || state.phase !== 'playing') return;
    const d = direction(), key = `${d.x},${d.z}`;
    // Renew only active movement at a bounded interval. Server expires intent after 90 ticks.
    if (key !== lastDirection || (key !== '0,0' && state.tick - lastMoveRefreshTick >= 20)) {
      lastDirection = key;lastMoveRefreshTick = state.tick;
      void send('move', {direction: d});
    }
  };
  const setCapture = active => {
    // A lobby/finished key or button press is not an authorized round intent.
    // Do not queue it for the next server-owned phase.
    if (state?.phase !== 'playing') {capturing = false;return;}
    if (capturing === active) return;
    capturing = active;
    lastCaptureRefreshTick = state.tick;
    void send('capture', {active});
  };
  const setTrigger = active => {
    if (state?.phase !== 'playing') {triggering = false;return;}
    if (triggering === active) return;
    triggering = active;
    lastTriggerRefreshTick = state.tick;
    void send('trigger', {active});
  };
  const draw = () => {
    ctx.clearRect(0, 0, 500, 500);
    // The small 2D proof mirrors the server's gradual mist intensity. This
    // background tint is only a UI cue, not a photoreal volumetric fog renderer.
    // Match the server's 80m clear-arena disclosure bound and 9m dense mist.
    // This only tints the local map; it does not simulate volumetric optics.
    const fog = Math.max(0, Math.min(1, (80 - (state?.weather?.visibilityRange ?? 80)) / 71));
    ctx.fillStyle = `rgb(${Math.round(25 + 23 * fog)},${Math.round(39 + 22 * fog)},${Math.round(44 + 21 * fog)})`;
    ctx.fillRect(0, 0, 500, 500);
    ctx.strokeStyle = '#41565a';ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {ctx.beginPath();ctx.moveTo(i*50,0);ctx.lineTo(i*50,500);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,i*50);ctx.lineTo(500,i*50);ctx.stroke();}
    const point = (x,z) => ({x:250+x*9.5,y:250+z*9.5});
    ctx.strokeStyle = '#d8c88d';ctx.lineWidth = 3;ctx.beginPath();ctx.arc(250,250,25,0,Math.PI*2);ctx.stroke();
    if (!state) return;
    // Server-authored cover is shown in both views; opponents behind it stay hidden.
    ctx.fillStyle = '#677b79';
    for (const wall of state.cover || []) {
      const topLeft = point(wall.x - wall.w / 2, wall.z - wall.d / 2);
      ctx.fillRect(topLeft.x, topLeft.y, wall.w * 9.5, wall.d * 9.5);
    }
    for (const p of state.visible) {
      const pos = point(p.x,p.z);
      ctx.fillStyle = p.team === 'red' ? '#e58b84' : '#8abcf2';
      ctx.beginPath();ctx.arc(pos.x,pos.y,p.id===state.self.id?9:7,0,Math.PI*2);ctx.fill();
      if (p.id===state.self.id) {
        ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
        const f = state.self.facing || {x: state.self.team === 'red' ? 1 : -1, z: 0};
        ctx.beginPath();ctx.moveTo(pos.x,pos.y);
        ctx.lineTo(pos.x+f.x*17,pos.y+f.z*17);ctx.stroke();
      }
    }
  };
  const render = () => {
    if (!state) return;
    if (state.phase !== previousPhase) {
      // A new round resets the server's direction; never retain a stale input cache.
      // A held key from the lobby/previous round is not fresh gameplay input.
      // Require a new physical keydown after the server changes phase.
      keys.clear();
      lastDirection = '';
      lastMoveRefreshTick = -Infinity;
      lastCaptureRefreshTick = -Infinity;
      lastTriggerRefreshTick = -Infinity;
      physicalTrigger.clear();
      triggering = false;
      lastAimTick = -Infinity;lastAimVector = null;lastAimPoint = null;
      cancelAimFlush();activeTouchAimPointer = null;
      // Clear held capture on *both* edges: lobby -> playing is especially
      // important because the old client could auto-capture after the first poll.
      capturing = false;
      previousPhase = state.phase;
      // A ready button can retain focus after the server starts the round.
      // Transfer PC keyboard ownership to the arena only on the phase edge,
      // never on each poll (which would steal focus from deliberate UI use).
      if(state.phase === 'playing') Desktop.focusGameplay(document,canvas);
    }
    el('phase').textContent = state.phase.toUpperCase();
    el('team').textContent = state.self.team.toUpperCase();
    el('score').textContent = `${state.score.red} : ${state.score.blue}`;
    el('tick').textContent = String(state.tick);
    // Public server event, identical for both teams; never display hidden actor locations.
    const weatherLabels = {clear: '맑음', incoming: '해안 안개 접근 예보',
      active: '해안 안개 · 시야 제한', clearing: '안개 약화 중 · 시야 제한'};
    el('weather').textContent = (weatherLabels[state.weather?.phase] || '관측 대기') +
      (Number.isFinite(state.weather?.visibilityRange)
        ? ` · 시야 약 ${state.weather.visibilityRange.toFixed(1)}m` : '');
    el('health').textContent = String(state.self.health);
    el('ammo').textContent = `${state.self.ammo} / ${state.self.reserve}`;
    el('loadout').value = state.self.weaponId || 'carbine';
    el('loadout').disabled = state.phase === 'playing' || state.self.ready;
    el('reloadState').textContent = state.self.reloadTicks > 0
      ? (state.self.reloadHesitation ? '긴장으로 지연 · R 재입력' : '재장전 중') : '준비';
    el('stress').textContent = Math.round(state.self.stress);
    el('assist').textContent = state.self.reloadAssist ? '장전 보조 ON' : '장전 보조 OFF';
    el('ready').disabled = state.phase === 'playing';
    if (state.phase === 'ended') {
      const outcome = state.winner ? '승리 팀 ' + state.winner :
        state.reason === 'mutual_incapacitation' ? '동시 전투 불능 · 무승부' :
        state.reason === 'player_left' ? '승리 팀 없음 (퇴장 시 상대 연결 만료)' :
        '승리 팀 없음 (양측 연결 종료)';
      status(`종료 · ${outcome} · 사유 ${state.reason}. 다시 준비하면 재대전할 수 있습니다.`);
    }
    else if (state.phase === 'lobby') status('양쪽 플레이어가 준비 버튼을 눌러야 시작합니다.');
    else {
      const hint = '목표 원에서 정지 후 '+controls.bindings.interact+' 점령 (이동/재장전/발사/피격 시 중단) · 지도 조준(밖으로 이동/Q 해제) · '+
        controls.bindings.fire+' 누르면 발사/유지하면 연속 발사 · '+controls.bindings.reload+' 재장전. 시야·피해·탄약은 서버에서 검증합니다.';
      const rearmHint = capturing && !state.self.captureArmed
        ? ' · 중계 중단/목표 이탈/전송 완료: 점령 키를 놓고 다시 눌러 중계기 근처에서 재시도하세요' : '';
      status((actionFeedback && state.tick <= feedbackUntil
        ? hint + ' · ' + actionFeedback : hint) + rearmHint);
    }
    draw();
  };
  // Labels must match the active PC profile, not hard-coded default keys.
  const refreshControlLabels = () => {
    el('fire').textContent = controls.bindings.fire + ' 발사';
    el('reload').textContent = controls.bindings.reload + ' 재장전';
    el('capture').textContent = controls.bindings.interact + ' 점령';
  };
  refreshControlLabels();
  el('join').addEventListener('click', async () => {
    // A rapid double-click must never consume both two-player lobby slots.
    if (joining || restoring || token) return;
    joining = true;el('join').disabled = true;
    try {
      const result = await request('/join', {name: el('name').value});
      token = result.token;seq = 0;el('join').disabled = true;el('ready').disabled = false;
       el('loadout').disabled = false;
      try {window.sessionStorage.setItem(SESSION_KEY, token);} catch (_) { /* Optional storage. */ }
      el('name').disabled = true;status('입장 완료 · 다른 탭의 참가자를 기다립니다.');
    } catch (err) {el('join').disabled = false;status(`입장 실패: ${err.message}`);}
    finally {joining = false;}
  });
  el('ready').addEventListener('click', () => void send('ready'));
  el('loadout').addEventListener('change', () => {
    if (token && state?.phase !== 'playing') void send('loadout', {weaponId: el('loadout').value});
  });
  el('fire').addEventListener('click', () => {if (state?.phase === 'playing') void send('fire');});
  el('reload').addEventListener('click', () => {if (state?.phase === 'playing') void send('reload');});
  el('assist').addEventListener('click', () => {if (token && state) void send('assist', {enabled: !state.self.reloadAssist});});
  document.addEventListener('keydown', e => {
    // Any focused form/menu control owns its keyboard events; no ghost fire,
    // movement or objective capture while entering names or navigating UI.
    if (Desktop.isInteractiveTarget(e.target)) return;
    const action = Desktop.actionFor(e.code, controls);
    if (action || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
      e.preventDefault();
    // After a phase change keys.clear() requires a fresh physical press.
    // An OS repeat from a key held in the lobby must not resurrect movement
    // or capture, even if the next server snapshot is already playing.
    if (e.repeat && !keys.has(e.code)) return;
    keys.add(e.code);
    if (!e.repeat && state?.phase === 'playing') {
      // F is a legacy alias only while the default Space fire binding is active.
      if (action === 'fire' || (e.code === 'KeyF' && action === null && controls.bindings.fire === 'Space')) {
        void send('fire'); // Immediate click feedback; the authority enforces cooldown.
        setTrigger(physicalTrigger.press('keyboard'));
      }
      if (action === 'reload') void send('reload');
    }
    if (action === 'interact' && !e.repeat) setCapture(true);
    if (e.code === 'KeyQ' && !e.repeat && action === 'support') releaseAim();
    updateInput();
  });
  document.addEventListener('keyup', e => {
    // Always release an earlier held key, even if focus moved into a form.
    keys.delete(e.code);
    if (Desktop.actionFor(e.code, controls) === 'interact') setCapture(false);
    if (Desktop.actionFor(e.code, controls) === 'fire' ||
        (e.code === 'KeyF' && controls.bindings.fire === 'Space' &&
         Desktop.actionFor(e.code, controls) === null)) setTrigger(physicalTrigger.release('keyboard'));
    updateInput();
  });
  const releaseHeldInput = () => {physicalTrigger.clear();setTrigger(false);keys.clear();setCapture(false);updateInput();releaseAim();};
  // Focusing an in-page form/button does not blur the window. Stop movement,
  // held fire and objective capture immediately instead of waiting for leases.
  document.addEventListener('focusin', event => {
    if (Desktop.isInteractiveTarget(event.target)) releaseHeldInput();
  });
  // The BR and CH01 menus share these bindings. A remap in another PC tab
  // must not leave this tab using stale keys or a stale held-fire command.
  window.addEventListener('storage', event => {
    if (event.key !== Desktop.STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    releaseHeldInput();
    controls = Desktop.load(window.localStorage);
    refreshControlLabels();
    if (state) render();
  });
  window.addEventListener('blur', () => {windowFocused = false;releaseHeldInput();});
  window.addEventListener('focus', () => {
    windowFocused = true;
    // Regain the lease promptly on a normal PC window switch, not just a tab switch.
    if (token && !document.hidden) void send('heartbeat');
  });
  // Releasing outside the arena must not leave a mouse trigger latched.
  window.addEventListener('mouseup', e => {
    if (e.button === 0) setTrigger(physicalTrigger.release('mouse'));
  });
  // Mobile tab switches may suspend polling without dispatching window.blur.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseHeldInput();
    // A backgrounded PC tab must not silently keep a competitive slot alive.
    // On return, renew promptly so a brief alt-tab does not wait for the next
    // 10-second heartbeat interval and accidentally time out.
    else if (token) void send('heartbeat');
  });
  for (const btn of document.querySelectorAll('[data-dir]')) {
    const key = btn.dataset.dir;
    btn.addEventListener('pointerdown', e => {e.preventDefault();keys.add(key);updateInput();});
    for (const event of ['pointerup','pointercancel','pointerleave']) btn.addEventListener(event, () => {keys.delete(key);updateInput();});
  }
  el('capture').addEventListener('pointerdown', e => {e.preventDefault();setCapture(true);});
  for (const event of ['pointerup','pointercancel','pointerleave']) el('capture').addEventListener(event, () => setCapture(false));
  // A reload can resume the same guest identity within the server lease window.
  // Clear old held movement/capture on resume so a refresh cannot ghost-capture.
  const restoreTabSession = async () => {
    let saved = null;
    try {saved = window.sessionStorage.getItem(SESSION_KEY);} catch (_) {return;}
    if (!saved || !/^[a-f0-9]{48}$/.test(saved)) return;
    restoring = true;
    token = saved;
    try {
      state = await request('/state');
      seq = state.self.seq;
      el('join').disabled = true;el('name').disabled = true;
       el('loadout').disabled = state.phase === 'playing' || state.self.ready;
      el('ready').disabled = state.phase === 'playing';
      if (state.phase === 'playing') {
        await send('move', {direction: {x: 0, z: 0}});
        await send('capture', {active: false});
        // A tab refresh can skip blur/pointerleave. Never inherit an old aim
        // override that would prevent keyboard-only turning after resume.
        await send('aimRelease');
        await send('trigger', {active: false});
      }
      state = await request('/state');
      render();
    } catch (_) {
      invalidateSession(saved);
    } finally {restoring = false;}
  };
  void restoreTabSession();
  // A genuine connected client renews its server lease independently of read-only polling.
  setInterval(() => {if (token && !document.hidden && windowFocused) void send('heartbeat');}, 10000);
  setInterval(async () => {
    // Slow responses must not overlap and overwrite newer game snapshots.
    if (!token || document.hidden || !windowFocused || polling || restoring) return;
    polling = true;
    const polledToken = token;
    try {
      const nextState = await request('/state', undefined, polledToken);
      if (token !== polledToken) return;
      state = nextState;render();updateInput();
      // Recompute aim against the latest server-owned player position while
      // the pointer stays over a fixed world point (no stale direction drift).
      if (lastAimPoint) aimAtWorld(lastAimPoint.x,lastAimPoint.z);
      if (triggering && state.phase === 'playing' &&
          state.tick - lastTriggerRefreshTick >= 20) {
        lastTriggerRefreshTick = state.tick;
        void send('trigger', {active: true});
      }
      if (capturing && state.phase === 'playing' &&
          state.tick - lastCaptureRefreshTick >= 20) {
        lastCaptureRefreshTick = state.tick;
        void send('capture', {active: true});
      }
    }
    catch (err) {
      if (token !== polledToken) return;
      if (err.message === 'unknown_player') invalidateSession(polledToken);
      else status(`연결 확인 필요: ${err.message}`);
    }
    finally {polling = false;}
  }, 150);
  draw();
})();
