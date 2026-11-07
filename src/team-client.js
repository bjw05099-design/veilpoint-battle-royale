/* VEILPOINT local two-client rules prototype UI; tab-scoped resume only, no external requests. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const canvas = el('arena'), ctx = canvas.getContext('2d');
  let token = null, seq = 0, state = null, lastDirection = '', capturing = false;
  let lastMoveRefreshTick = -Infinity, lastCaptureRefreshTick = -Infinity;
  let lastCrouchIntent = false, lastCrouchRefreshTick = -Infinity;
  let lastSprintIntent = false, lastSprintRefreshTick = -Infinity;
  let triggering = false, lastTriggerRefreshTick = -Infinity;
  let lastAimTick = -Infinity, lastAimVector = null, lastAimPoint = null;
  let lastAimReleaseRefreshTick = -Infinity;
  // Mouse input must not wait for the next 150ms server snapshot to change aim.
  // Throttle changed directions to 60Hz; the next poll flushes a final
  // movement that arrived inside the throttle window. Simulation stays 60Hz.
  const AIM_DIRECTION_EPSILON = .0025;
  // A lost PC aim packet should recover from authoritative self state well
  // before the normal 20-tick stationary lease refresh (no opponent data).
  const AIM_RETRY_TICKS = 6;
  let lastAimSentAt = -Infinity;
  let aimFlushTimer = null;
  const cancelAimFlush = () => {
    if (aimFlushTimer !== null) clearTimeout(aimFlushTimer);
    aimFlushTimer = null;
  };
  let activeTouchAimPointer = null;
  let joining = false, restoring = false, polling = false, leaving = false;
  let authorityStale = false; // A disconnected PC tab cannot keep issuing gameplay intents.
  let windowFocused = true; // A visible but unfocused desktop window is also inactive.
  let pending = Promise.resolve();
  // Coalesce only consecutive unsent aim or movement intents of the SAME type.
  // Slow HTTP must not replay stale mouse flicks or released keyboard directions.
  // Fire, release, capture and other commands remain strict ordering barriers.
  let queuedInput = null;
  let previousPhase = null;
  // A rapid second PC click must cancel the *last requested* lobby consent,
  // not resend "ready" because the 150ms authoritative snapshot is stale.
  // The sequence ID keeps optimistic UI state until the server acknowledges it.
  let readyIntent = null, readyIntentSeq = 0, readyIntentGeneration = 0;
  let actionFeedback = '', feedbackUntil = 0;
  const SESSION_KEY = 'veilpoint.team.tabSession';
  const JOIN_ATTEMPT_KEY = 'veilpoint.team.pendingJoin';
  let joinAttemptId = null;
  function pendingJoinId() {
    if (joinAttemptId) return joinAttemptId;
    try {
      const saved = window.sessionStorage.getItem(JOIN_ATTEMPT_KEY);
      if (saved && /^[a-f0-9]{32}$/.test(saved)) return (joinAttemptId = saved);
    } catch (_) { /* Private storage may be unavailable. */ }
    // A retry identifier is a secret capability, never a timestamp or Math.random.
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function')
      throw new Error('secure_random_unavailable');
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    joinAttemptId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    try {window.sessionStorage.setItem(JOIN_ATTEMPT_KEY, joinAttemptId);} catch (_) {}
    return joinAttemptId;
  }
  function clearPendingJoin() {
    joinAttemptId = null;
    try {window.sessionStorage.removeItem(JOIN_ATTEMPT_KEY);} catch (_) {}
  }
  // Share PC keyboard preferences with the BR and CH01 browser prototypes.
  // The server remains authoritative for all movement and gameplay commands.
  const Desktop = window.VeilpointDesktopControls;
  // Browser privacy policy can deny the localStorage property itself, before
  // Desktop.load() has a chance to catch getItem failures.
  const desktopStorage = (() => {try {return window.localStorage;} catch (_) {return null;}})();
  let controls = Desktop.load(desktopStorage);
  const keys = new Set();
  const physicalTrigger = Desktop.createTriggerLatch();
  // Capture the identity when a request is queued: an old command must never
  // be sent using a newly joined tab's token after an expired-session reset.
  // Bound both network and JSON-response waits. One stalled local HTTP call
  // must not block every later PC key release, ready vote or reconnection.
  // A timeout rejects the queued command; subsequent higher sequences remain
  // valid server-side. Abort the transport when supported, without requiring it.
  const REQUEST_TIMEOUT_MS = 8000;
  const request = async (path, body, authToken = token) => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('request_timeout'));
        if (controller) controller.abort();
      }, REQUEST_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([fetch(path, {method: body ? 'POST' : 'GET',
        headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(authToken ? {'X-Player-Token': authToken} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
        ...(controller ? {signal: controller.signal} : {})}), timeout]);
      const data = await Promise.race([response.json(), timeout]);
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  };
  const status = msg => {el('status').textContent = msg;};
  const readableError = err => err.message === 'simulation_unavailable'
    ? '서버 시뮬레이션이 중단되었습니다. 로컬 서버를 재시작한 뒤 재연결하세요.' : err.message;
  function invalidateSession(expiredToken, retryable = false) {
    if (!expiredToken || token !== expiredToken) return;
    // A restarted local server may forget the token while this tab stays open.
    // Drop all held PC input and old snapshots before enabling a fresh join.
    token = null; seq = 0; state = null; previousPhase = null;
    authorityStale = false;
    readyIntent = null; readyIntentSeq = 0; readyIntentGeneration++;
    lastDirection = ''; lastMoveRefreshTick = -Infinity;
    lastCrouchIntent = false; lastCrouchRefreshTick = -Infinity;
    lastSprintIntent = false; lastSprintRefreshTick = -Infinity;
    lastCaptureRefreshTick = -Infinity; lastTriggerRefreshTick = -Infinity;
    lastAimTick = -Infinity; lastAimSentAt = -Infinity; lastAimVector = null; lastAimPoint = null;
    lastAimReleaseRefreshTick = -Infinity;
    cancelAimFlush();queuedInput = null;activeTouchAimPointer = null; keys.clear(); physicalTrigger.clear();
    capturing = false; triggering = false; actionFeedback = '';
    // A transient reset/network failure must not strand a still-valid server
    // seat by deleting its only tab token. Keep it solely for explicit retry.
    if (!retryable) try {window.sessionStorage.removeItem(SESSION_KEY);} catch (_) {}
    el('join').disabled = false; el('ready').disabled = true; el('leave').disabled = true;
    el('join').textContent = retryable ? '재연결' : '입장';
    el('loadout').disabled = true;
    el('name').disabled = retryable;
    status(retryable
      ? '입력 초기화 확인 실패 · 재연결을 눌러 안전하게 다시 시도하세요.'
      : '서버 세션이 만료되었습니다. 새로 입장할 수 있습니다.');
    draw();
  }
  const send = (type, payload = {}) => {
    // Until the server acknowledges an atomic reset, no new PC intent may
    // race the resumed tab's stale movement, aim, trigger or relay state.
    if (!token || restoring || leaving || authorityStale) return Promise.resolve();
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
      else if (err.message === 'simulation_unavailable') {
        // Fatal server state is not a retryable input failure. Stop all PC
        // intents and drop the old tab token before a new server is launched.
        // Keep a waiting lobby seat recoverable on a transient outage;
        // an already-running round with a fatal authority cannot continue.
        if (state?.phase === 'playing') invalidateSession(sessionToken);
        status(readableError(err));
      } else status(`명령 실패: ${readableError(err)}`);
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
  const aimAtWorld = (tx, tz, forceRetry = false, beforeClick = false) => {
    if (leaving || !token || state?.phase !== 'playing') return;
    const dx = tx - state.self.x, dz = tz - state.self.z;
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len)) return;
    if (len < 0.1) {
      // Even with a stationary cursor, moving the avatar onto that cursor's
      // world point destroys the aim ray. A later server poll must stop held
      // mouse fire rather than endlessly renewing the stale trigger.
      // Leave touch-only behavior unchanged in this PC-focused fix.
      if (lastAimPoint?.pointerType === 'mouse') {
        setTrigger(physicalTrigger.release('mouse'));
        releaseAim();
      }
      return;
    }
    const aim = {x: dx / len, z: dz / len};
    // Stationary aim renews only after 20 server ticks, before the 90-tick
    // lease expires. Changed PC pointer aim is instead limited by a monotonic
    // 60Hz *input send* budget, not by 150ms state polling. The final pointer
    // position is retained and retried by the next state poll if throttled.
    const change = lastAimVector
      ? Math.hypot(aim.x - lastAimVector.x, aim.z - lastAimVector.z) : Infinity;
    // A 0.035 direction deadband (~2 degrees) swallowed one-pixel PC mouse
    // corrections for up to 20 server ticks. Keep a small noise floor instead;
    // the independent 60Hz send throttle still bounds network traffic.
    if (change < AIM_DIRECTION_EPSILON && !forceRetry && state.tick - lastAimTick < 20) return;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() : Date.now();
    if (!beforeClick && (change >= AIM_DIRECTION_EPSILON || forceRetry) && now >= lastAimSentAt && now - lastAimSentAt < 1000 / 60) {
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
  const aimFromPointer = (event, beforeClick = false) => {
    if (!token || state?.phase !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Invert the same top-down projection as draw(); send only direction.
    const tx = ((event.clientX - rect.left) / rect.width * canvas.width - canvas.width / 2) / 9.5;
    const tz = ((event.clientY - rect.top) / rect.height * canvas.height - canvas.height / 2) / 9.5;
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
    // The local map cannot define a facing ray at the player's own position.
    // For a PC mouse, release a stale aim override immediately so keyboard
    // facing is not blocked for the 90-tick server lease. Do not change touch.
    if (event.pointerType === 'mouse' &&
        Math.hypot(tx - state.self.x, tz - state.self.z) < 0.1) {
      // Dragging a held mouse trigger onto the player's own marker also loses
      // its physical firing ray. Release only the mouse latch: a separately
      // held PC keyboard trigger must remain active until its own keyup.
      // Otherwise automatic fire continues in the last stale direction.
      setTrigger(physicalTrigger.release('mouse'));
      releaseAim();
      return;
    }
    lastAimPoint = {x: tx, z: tz, pointerType: event.pointerType};
    // A discrete PC click must enqueue its current sight ray before the shot.
    // Bypass only the pointer-move send throttle on this edge: otherwise a
    // fast flick-click fires along the previous direction and spends a round.
    // The server still owns shot cadence, ammunition, cover and hit resolution.
    aimAtWorld(tx, tz, false, beforeClick);
    return true;
  };
  const releaseAim = () => {
    // A canceled touch must not keep renewing a server-side aim override.
    activeTouchAimPointer = null;
    cancelAimFlush();
    if (!lastAimPoint) return;
    lastAimPoint = null;lastAimVector = null;lastAimTick = -Infinity;lastAimSentAt = -Infinity;
    lastAimReleaseRefreshTick = state?.tick ?? -Infinity;
    if (token && state?.phase === 'playing') void send('aimRelease');
  };
  canvas.addEventListener('pointerdown', event => {
    if (leaving) return;
    // On hybrid devices, a mouse event must not steal a held touch gesture.
    if (activeTouchAimPointer !== null && event.pointerType !== 'touch') return;
    if (event.pointerType === 'touch') {
      // Ignore a second finger: only the gesture that began aiming can update
      // or release this server-owned facing intent.
      if (activeTouchAimPointer !== null) return;
      activeTouchAimPointer = event.pointerId ?? -1;
    }
    const validAim = aimFromPointer(event, event.pointerType === 'mouse' && event.button === 0);
    if (validAim && event.pointerType === 'mouse' && event.button === 0 && state?.phase === 'playing') {
      // A click exactly on the local avatar has no physical aim ray: do not
      // spend finite rounds or latch automatic fire in the previous direction.
      // Valid PC pointer aim and fire still share the canvas and server cadence.
      void send('fire');
      setTrigger(physicalTrigger.press('mouse'));
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (leaving) return;
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
    if (leaving || !token || !state || state.phase !== 'playing') return;
    const d = direction(), key = `${d.x},${d.z}`;
    // A lost keyup must not leave the server walking for its full 90-tick lease.
    // Read only this player's authoritative direction, never an opponent input.
    const serverMoving = state.self?.direction &&
      Math.hypot(state.self.direction.x, state.self.direction.z) > 1e-6;
    const lostStop = key === '0,0' && serverMoving &&
      state.tick - lastMoveRefreshTick >= 20;
    // Renew active movement, or retry a physically released input only if the
    // latest server snapshot still disagrees with the local PC keyboard.
    if (key !== lastDirection || (key !== '0,0' && state.tick - lastMoveRefreshTick >= 20) || lostStop) {
      lastDirection = key;lastMoveRefreshTick = state.tick;
      void send('move', {direction: d});
    }
    // PC crouch is a held, leased intent. Send both press and release, and
    // renew while held so an abandoned tab cannot remain crouched forever.
    const crouch = held('crouch');
    if (crouch !== lastCrouchIntent ||
        ((crouch || state.self?.crouching) && state.tick - lastCrouchRefreshTick >= 20)) {
      lastCrouchIntent = crouch;
      lastCrouchRefreshTick = state.tick;
      void send('crouch', {active: crouch});
    }
    // Shift sprint is a renewed PC intent. The server alone owns movement
    // speed, exertion, fatigue lockout and crouch precedence at fixed 60Hz.
    const sprint = held('sprint');
    if (sprint !== lastSprintIntent ||
        ((sprint || state.self?.sprintHeld) && state.tick - lastSprintRefreshTick >= 20)) {
      lastSprintIntent = sprint;
      lastSprintRefreshTick = state.tick;
      void send('sprint', {active: sprint});
    }
  };
  const setCapture = active => {
    if (leaving) {capturing = false;return;}
    // A lobby/finished key or button press is not an authorized round intent.
    // Do not queue it for the next server-owned phase.
    if (state?.phase !== 'playing') {capturing = false;return;}
    if (capturing === active) return;
    capturing = active;
    lastCaptureRefreshTick = state.tick;
    void send('capture', {active});
  };
  const setTrigger = active => {
    if (leaving) {triggering = false;return;}
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
    // Both team arcs show ONLY the public relay clock published by the
    // authoritative 60Hz game. Draw in the physical arena, not a new panel
    // that would overflow the 1024x600 PC viewport.
    const duration=state.objective?.requiredSeconds;
    const progress=state.progress;
    const hasPublicProgress=state.phase==='playing'&&
      Number.isFinite(duration)&&duration>0&&
      Number.isFinite(progress?.red)&&progress.red>=0&&
      Number.isFinite(progress?.blue)&&progress.blue>=0;
    if(hasPublicProgress){
      for(const [team,radius,color] of [
        ['red',32,'#e58b84'],['blue',38,'#8abcf2']
      ]){
        const fraction=Math.min(1,progress[team]/duration);
        if(fraction<=0)continue;
        ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=3;
        ctx.arc(250,250,radius,-Math.PI/2,-Math.PI/2+2*Math.PI*fraction);
        ctx.stroke();
      }
    }
    // Server-authored cover is shown in both views; opponents behind it stay hidden.
    ctx.fillStyle = '#677b79';
    for (const wall of state.cover || []) {
      const topLeft = point(wall.x - wall.w / 2, wall.z - wall.d / 2);
      ctx.fillRect(topLeft.x, topLeft.y, wall.w * 9.5, wall.d * 9.5);
    }
    for (const p of state.visible) {
      const pos = point(p.x,p.z);
      ctx.fillStyle = p.team === 'red' ? '#e58b84' : '#8abcf2';
      if (p.incapacitated) {
        // A finished combatant must not remain a standing actor marker.
        // Non-graphic 2D cue only; not a skeletal fall animation.
        ctx.globalAlpha = 0.6;
        ctx.fillRect(pos.x - 8, pos.y - 3, 16, 6);
        ctx.globalAlpha = 1;
      } else {
        // A smaller marker is a visible stance cue, not a stealth or hitbox claim.
        const radius = p.crouching ? (p.id===state.self.id?7:5) : (p.id===state.self.id?9:7);
        ctx.beginPath();ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);ctx.fill();
      }
      if (p.id===state.self.id && !p.incapacitated) {
        ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
        const f = state.self.facing || {x: state.self.team === 'red' ? 1 : -1, z: 0};
        ctx.beginPath();ctx.moveTo(pos.x,pos.y);
        ctx.lineTo(pos.x+f.x*17,pos.y+f.z*17);ctx.stroke();
      }
    }
  };
  const render = () => {
    if (!state) return;
    if (state.phase === 'playing') {
      // Server has accepted both participants; an older lobby intent cannot
      // overwrite the new round's controls or the ready button label.
      readyIntent = null;
    }
    if (state.phase !== previousPhase) {
      // A new round resets the server's direction; never retain a stale input cache.
      // A held key from the lobby/previous round is not fresh gameplay input.
      // Require a new physical keydown after the server changes phase.
      keys.clear();
      lastDirection = '';
      lastMoveRefreshTick = -Infinity;
      lastCrouchIntent = false;
      lastCrouchRefreshTick = -Infinity;
      lastSprintIntent = false;
      lastSprintRefreshTick = -Infinity;
      lastCaptureRefreshTick = -Infinity;
      lastTriggerRefreshTick = -Infinity;
      physicalTrigger.clear();
      triggering = false;
      lastAimTick = -Infinity;lastAimVector = null;lastAimPoint = null;
      lastAimReleaseRefreshTick = -Infinity;
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
    // Both relay progress numbers are explicitly published by the server;
    // a client never invents capture time or discloses hidden actor positions.
    const relayDuration=state.objective?.requiredSeconds;
    const ownTeam=state.self.team;
    const enemyTeam=ownTeam==='red'?'blue':'red';
    const validRelay=Number.isFinite(relayDuration)&&relayDuration>0&&
      Number.isFinite(state.progress?.[ownTeam])&&
      Number.isFinite(state.progress?.[enemyTeam]);
    const asPercent=value=>Math.round(Math.min(1,Math.max(0,value/relayDuration))*100);
    el('relayProgress').textContent=state.phase==='playing'&&validRelay
      ?'우리 팀 '+asPercent(state.progress[ownTeam])+'% · 상대 팀 '+
       asPercent(state.progress[enemyTeam])+'% · 서버 진행'
      :state.phase==='lobby'?'대전 시작 전':'중계 진행 기록 없음';
    // The server discloses only our own local relay eligibility, never why
    // the other team may be preventing progress behind cover or in coastal mist.
    const relayHints={inactive:'',approach:'중계기 가까이 이동',
      stop:'중계기에서 정지',wait_reload:'재장전 완료 후 시도',
      hands_free:'조작 전에 입력 해제',release_press:'조작 키를 놓고 다시 누르기',
      press:'중계기에서 상호작용 키 누르기',
      transmitting:'중계기 연결 진행 중',server_checking:'서버 확인 중'};
    const localHint=Object.prototype.hasOwnProperty.call(relayHints,state.self.relayInteraction)
      ?relayHints[state.self.relayInteraction]:'';
    // Server-published public fixed relay plus the authenticated player's
    // own location: show distance to the circular console reach boundary,
    // not a guessed route or a hidden opponent's position.
    const goal=state.objective;
    const px=state.self?.x,pz=state.self?.z;
    const validReach=Number.isFinite(px)&&Number.isFinite(pz)&&
      Number.isFinite(goal?.x)&&Number.isFinite(goal?.z)&&
      Number.isFinite(goal?.radius)&&goal.radius>0;
    const reach=validReach
      ?Math.ceil(Math.max(0,Math.hypot(px-goal.x,pz-goal.z)-goal.radius))
      :null;
    if(state.phase==='playing'&&validRelay&&localHint)
      el('relayProgress').textContent+=' · '+localHint+
        (state.self.relayInteraction==='approach'&&reach!==null?' · 접근까지 약 '+reach+'m':'');
    // The remaining time comes from the server's 60Hz simulation, not the
    // browser's wall clock. Keep older mock/protocol snapshots compatible.
    const remainingTicks = state.round?.remainingTicks;
    if (Number.isSafeInteger(remainingTicks) && remainingTicks >= 0) {
      const seconds = Math.ceil(remainingTicks / 60);
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      el('tick').textContent = state.tick + ' · 남은 시간 ' + mm + ':' + ss;
    } else el('tick').textContent = String(state.tick);
    // Public server event, identical for both teams; never display hidden actor locations.
    const weatherLabels = {clear: '맑음', incoming: '해안 안개 접근 예보',
      active: '해안 안개 · 시야 제한', clearing: '안개 약화 중 · 시야 제한'};
    // Published weather transitions are authoritative 60Hz server facts.
    // Do not invent a forecast when the server offers no finite deadline.
    const changeTicks=state.weather?.ticksUntilChange;
    const weatherTimer=Number.isSafeInteger(changeTicks) && changeTicks>=0
      ? ' · 다음 변화까지 '+String(Math.floor(Math.ceil(changeTicks/60)/60)).padStart(2,'0')+
        ':'+String(Math.ceil(changeTicks/60)%60).padStart(2,'0')
      : '';
    el('weather').textContent = (weatherLabels[state.weather?.phase] || '관측 대기') +
      (Number.isFinite(state.weather?.visibilityRange)
        ? ` · 시야 약 ${state.weather.visibilityRange.toFixed(1)}m` : '') + weatherTimer;
    el('health').textContent = String(state.self.health);
    el('ammo').textContent = `${state.self.ammo} / ${state.self.reserve}`;
    el('loadout').value = state.self.weaponId || 'carbine';
    el('loadout').disabled = state.phase === 'playing' || state.self.ready;
    el('reloadState').textContent = state.self.reloadTicks > 0
      ? (state.self.reloadHesitation ? '긴장으로 지연 · R 재입력' : '재장전 중') : '준비';
    el('stress').textContent = Math.round(state.self.stress);
    // The server reports actual posture; never infer it from an unacknowledged key.
    el('stress').textContent += state.self.crouching ? ' · 낮은 자세' : '';
    el('stamina').textContent = Math.round(state.self.stamina ?? 100) + '/100' +
      (state.self.sprintExhausted ? ' · 질주 회복 중' : state.self.sprinting ? ' · 질주 중' : '');
    el('assist').textContent = state.self.reloadAssist ? '장전 보조 ON' : '장전 보조 OFF';
    const displayedReady = readyIntent === null ? state.self.ready : readyIntent;
    el('ready').disabled = state.phase === 'playing';
    el('ready').textContent = state.phase === 'playing' ? '대전 중' :
      displayedReady ? '준비 취소' : '준비 / 재대전';
    if (state.phase === 'ended') {
      const outcome = state.winner ? '승리 팀 ' + state.winner :
        state.reason === 'mutual_incapacitation' ? '동시 전투 불능 · 무승부' :
        state.reason === 'time_limit' ? '제한 시간 종료 · 동점 무승부' :
        state.reason === 'player_left' ? '승리 팀 없음 (퇴장 시 상대 연결 만료)' :
        '승리 팀 없음 (양측 연결 종료)';
      // A finished match preserves its result while the server awaits two
      // independent rematch votes. Never infer the peer's private identity
      // or declare a second round from a local button press.
      const seats=state.lobby?.participants;
      const readyVotes=state.lobby?.ready;
      const consent=Number.isSafeInteger(seats)&&seats>=0&&seats<=2&&
        Number.isSafeInteger(readyVotes)&&readyVotes>=0&&readyVotes<=seats
        ?(seats<2?'상대 참가자 입장 대기':
          '재대전 준비 '+readyVotes+'/2'+
          (displayedReady?' · 내 준비 확인':' · 준비 버튼으로 참여'))
        :'재대전 준비 상태 확인 중';
      const reasons={objective_score:'중계기 점수 달성',
        time_limit:'경기 제한 시간 종료',opponent_incapacitated:'경기 참가자 활동 불가',
        mutual_incapacitation:'양측 활동 불가',player_left:'참가자 퇴장',
        connection_timeout:'참가자 연결 만료'};
      const cause=reasons[state.reason]||'서버 판정';
      status('종료 · '+outcome+' · '+cause+' · '+consent);
    }
    else if (state.phase === 'lobby') {
      const participants = state.lobby?.participants ?? 2;
      const ready = state.lobby?.ready ?? (state.self.ready ? 1 : 0);
      status(participants < 2
        ? '상대 입장 대기 · 양쪽 플레이어가 준비해야 시작합니다.'
        : displayedReady
          ? `${readyIntent === null ? '준비 완료' : '준비 요청/확인 중'} (${ready}/2) · 상대 준비 대기 · 준비 취소 가능`
          : `양쪽 플레이어가 준비 버튼을 눌러야 시작합니다. (${ready}/2)`);
    }
    else {
      const hint = '목표 원에서 정지 후 '+controls.bindings.interact+' 점령 (이동/재장전/발사/피격 시 중단) · 지도 조준(밖으로 이동/Q 해제) · '+
        controls.bindings.fire+' 누르면 발사/유지하면 연속 발사 · '+controls.bindings.reload+' 재장전 · '+
        controls.bindings.crouch+' 낮은 자세 · '+controls.bindings.sprint+' 누르면 지구력 범위에서 질주 (낮은 자세에서는 불가). 시야·피해·탄약·이동은 서버에서 검증합니다.';
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
    if (joining || restoring || leaving || token) return;
    // Retry the same authenticated seat before allocating another player.
    // The server must acknowledge resetInput again before PC controls resume.
    let saved = null;
    try {saved = window.sessionStorage.getItem(SESSION_KEY);} catch (_) {}
    if (saved && /^[a-f0-9]{48}$/.test(saved)) {
      void restoreTabSession();
      return;
    }
    joining = true;el('join').disabled = true;
    try {
      const result = await request('/join', {name: el('name').value, attemptId: pendingJoinId()});
      // The first response may have been lost: the server returns the original
      // seat and canonical display name instead of allocating a second player.
      if (typeof result.name === 'string') el('name').value = result.name;
      // A retried /join may recover an already-playing seat with a high
      // sequence and stale held fire. Fresh joins must NOT pay for an extra
      // state round trip; only the server-marked retry needs reconciliation.
      token = result.token;seq = 0;
      try {window.sessionStorage.setItem(SESSION_KEY, token);} catch (_) { /* Optional storage. */ }
      if (result.resumed === true) {
        await restoreTabSession(result.token);
        // Keep the same attempt if reset was not acknowledged.
        if (token === result.token) clearPendingJoin();
      } else {
        clearPendingJoin();
        el('join').disabled = true;el('ready').disabled = false;el('leave').disabled = false;
        el('loadout').disabled = false;
        el('name').disabled = true;status('입장 완료 · 다른 탭의 참가자를 기다립니다.');
      }
    } catch (err) {
      el('join').disabled = false;
      status(err.message === 'invalid_name'
        ? '이름에 줄바꿈·보이지 않는 문자만 있거나 길이가 맞지 않습니다. 보이는 글자·숫자·이모지를 포함하세요.'
        : err.message === 'name_in_use'
          ? '다른 참가자가 사용 중인 이름입니다. 구별되는 이름으로 다시 입력하세요.'
          : `입장 실패: ${readableError(err)}`);
    } finally {joining = false;}
  });
  // A participant must be able to vacate a local server seat immediately, not
  // wait for the 30-second lease or refresh into a stale identity. This is a
  // sequenced server command: do not erase the only session token until the
  // authority acknowledges departure. In-flight intents drain before leave.
  el('leave').addEventListener('click', async () => {
    if (!token || restoring || leaving) return;
    const departingToken = token;
    leaving = true;
    el('leave').disabled = true;
    // Stop accepting any new physical PC input while departure is pending.
    keys.clear();physicalTrigger.clear();capturing = false;triggering = false;
    lastDirection = '';lastAimPoint = null;lastAimVector = null;
    lastAimTick = -Infinity;lastAimSentAt = -Infinity;
    cancelAimFlush();activeTouchAimPointer = null;
    try {
      await pending;
      if (token !== departingToken) return;
      const result = await request('/command', {seq: ++seq, type: 'leave'}, departingToken);
      if (result?.ok !== true) throw new Error('leave_unacknowledged');
      if (token !== departingToken) return;
      token = null;seq = 0;state = null;previousPhase = null;queuedInput = null;
      readyIntent = null;readyIntentSeq = 0;readyIntentGeneration++;
      lastMoveRefreshTick = -Infinity;lastCaptureRefreshTick = -Infinity;
      lastTriggerRefreshTick = -Infinity;
      try {window.sessionStorage.removeItem(SESSION_KEY);} catch (_) {}
      el('join').disabled = false;el('join').textContent = '서버 입장';
      el('name').disabled = false;el('ready').disabled = true;
      el('loadout').disabled = true;el('leave').disabled = true;
      status('퇴장 완료 · 새 참가자로 다시 입장할 수 있습니다.');
      draw();
    } catch (err) {
      if (token !== departingToken) return;
      if (err.message === 'unknown_player') invalidateSession(departingToken);
      else {
        // An unacknowledged leave may already have reached the server.
        // Preserve the tab token for a safe retry/reconciliation; never
        // allocate a duplicate seat on an uncertain network outcome.
        el('leave').disabled = false;
        status('퇴장 확인 실패 · 재시도하거나 연결 상태를 확인하세요: ' + err.message);
      }
    } finally {leaving = false;}
  });
  el('ready').addEventListener('click', () => {
    if (!token || restoring || leaving || state?.phase === 'playing') return;
    const desired = !(readyIntent === null ? !!state?.self?.ready : readyIntent);
    readyIntent = desired;
    const generation = ++readyIntentGeneration, sessionToken = token;
    // send() allocates the monotonically increasing sequence synchronously,
    // then queues the request. Both clicks therefore preserve their order.
    const acknowledgement = send(desired ? 'ready' : 'unready');
    readyIntentSeq = seq;
    el('ready').textContent = desired ? '준비 취소' : '준비 / 재대전';
    void acknowledgement.then(result => {
      if (token !== sessionToken || generation !== readyIntentGeneration) return;
      if (!result?.ok) {
        // A rejected/timed-out command cannot leave the UI permanently
        // optimistic. The next authoritative poll reconciles actual consent.
        readyIntent = null;
        if (state) render();
      }
    });
  });
  el('loadout').addEventListener('change', () => {
    if (token && state?.phase !== 'playing') void send('loadout', {weaponId: el('loadout').value});
  });
  el('fire').addEventListener('click', () => {if (state?.phase === 'playing') void send('fire');});
  el('reload').addEventListener('click', () => {if (state?.phase === 'playing') void send('reload');});
  el('assist').addEventListener('click', () => {if (token && state) void send('assist', {enabled: !state.self.reloadAssist});});
  document.addEventListener('keydown', e => {
    if (leaving) return;
    // Any focused form/menu control owns its keyboard events; no ghost fire,
    // movement or objective capture while entering names or navigating UI.
    if (Desktop.isInteractiveTarget(e.target)) return;
    if (Desktop.isGameplayShortcut(e)) {
      // Release old server-held intent before ignoring the OS/IME chord.
      if (keys.size || physicalTrigger.held || capturing || triggering) releaseHeldInput();
      return;
    }
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
      if (action === 'fire' || (e.code === 'KeyF' && (action === null || action === 'headlamp') && controls.bindings.fire === 'Space')) {
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
         ['headlamp',null].includes(Desktop.actionFor(e.code, controls)))) setTrigger(physicalTrigger.release('keyboard'));
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
    if (event.storageArea && event.storageArea !== desktopStorage) return;
    releaseHeldInput();
    controls = Desktop.load(desktopStorage);
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
  const restoreTabSession = async (authenticatedToken = null) => {
    // Explicitly supplied token also works when sessionStorage is blocked.
    let saved = authenticatedToken;
    if (!saved) try {saved = window.sessionStorage.getItem(SESSION_KEY);} catch (_) {return;}
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
        // One sequenced command releases every old held PC intent.
        // Separate HTTP calls previously left ghost fire/movement active
        // until the final response on slow or interrupted connections.
        // Do not use the normal fire-and-forget send queue here: it absorbs
        // HTTP errors for interactive controls. A failed or unacknowledged
        // reset must fail closed rather than render a live stale-input session.
        const reset = await request('/command', {seq: ++seq, type: 'resetInput'}, saved);
        if (reset?.ok !== true) throw new Error('reset_unacknowledged');
      }
      state = await request('/state');
      // A refreshed PC tab starts with the HTML default name. The token's
      // canonical server identity is authoritative, including normalized
      // Korean/Arabic spelling; never show a different player name on resume.
      if (typeof state.self?.name === 'string') el('name').value = state.self.name;
      el('leave').disabled = false;
      render();
      // A failed recovered-join reset may have preserved this attempt. Clear
      // it only after an authenticated state/reset handshake succeeds.
      clearPendingJoin();
    } catch (err) {
      if (err.message === 'simulation_unavailable') {
        invalidateSession(saved, state?.phase !== 'playing');
        status(readableError(err));
      } else invalidateSession(saved, err.message !== 'unknown_player' &&
        err.message !== 'connection_timeout');
    } finally {restoring = false;}
  };
  void restoreTabSession();
  // A genuine connected client renews its server lease independently of read-only polling.
  setInterval(() => {if (token && !document.hidden && windowFocused) void send('heartbeat');}, 10000);
  setInterval(async () => {
    // Slow responses must not overlap and overwrite newer game snapshots.
    if (!token || document.hidden || !windowFocused || polling || restoring || leaving) return;
    polling = true;
    const polledToken = token;
    try {
      let nextState = await request('/state', undefined, polledToken);
      if (token !== polledToken) return;
      if (authorityStale) {
        // A timed-out snapshot may conceal an active server-held movement,
        // aim or relay intent. A fresh snapshot alone is not a reset receipt.
        // Clear local keys and get one server-authoritative atomic release
        // before re-enabling PC input after the network has returned.
        releaseHeldInput();
        if (nextState.phase === 'playing') {
          const resetSeq = Math.max(seq, nextState.self.seq) + 1;
          const acknowledged = await request('/command',
            {seq: resetSeq, type: 'resetInput'}, polledToken);
          if (acknowledged?.ok !== true) throw new Error('reset_unacknowledged');
          seq = resetSeq;
          nextState = await request('/state', undefined, polledToken);
          if (token !== polledToken) return;
        }
        authorityStale = false;
      }
      // A fresh server sequence is authoritative even if a newly joined peer
      // revoked an earlier solo ready vote. Do not leave a stale optimistic
      // consent stuck on screen when the server legitimately reset it.
      if (readyIntent !== null && (nextState.phase === 'playing' ||
          nextState.self.seq >= readyIntentSeq))
        readyIntent = null;
      state = nextState;render();updateInput();
      // Recompute aim against the latest server-owned player position while
      // the pointer stays over a fixed world point (no stale direction drift).
      if (lastAimPoint) {
        // An HTTP aim request can be lost even while the local pointer remains
        // stationary. The server's own aiming/facing state is the evidence:
        // retry promptly when it disagrees, without an omniscient target feed.
        // Allow six authoritative ticks for in-flight snapshots to settle.
        const retryAim = state.phase === 'playing' && lastAimVector &&
          state.tick - lastAimTick >= AIM_RETRY_TICKS &&
          (!state.self.aiming ||
            Math.hypot(state.self.facing.x - lastAimVector.x,
              state.self.facing.z - lastAimVector.z) > AIM_DIRECTION_EPSILON);
        aimAtWorld(lastAimPoint.x,lastAimPoint.z,!!retryAim);
      }
      // A lost pointer-leave/keyup release must not lock PC keyboard facing
      // for the full 90-tick server lease. Reconcile only the player's own aim.
      if (!lastAimPoint && state.phase === 'playing' && state.self.aiming &&
          state.tick - lastAimReleaseRefreshTick >= 20) {
        lastAimReleaseRefreshTick = state.tick;
        void send('aimRelease');
      }
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
      // Lost release packets are reconciled from server-owned SELF intent,
      // not from a stale optimistic client flag or hidden opponent data.
      if (!triggering && state.phase === 'playing' && state.self.triggerHeld &&
          state.tick - lastTriggerRefreshTick >= 20) {
        lastTriggerRefreshTick = state.tick;
        void send('trigger', {active: false});
      }
      if (!capturing && state.phase === 'playing' && state.self.captureHeld &&
          state.tick - lastCaptureRefreshTick >= 20) {
        lastCaptureRefreshTick = state.tick;
        void send('capture', {active: false});
      }
    }
    catch (err) {
      if (token !== polledToken) return;
      if (err.message === 'unknown_player') invalidateSession(polledToken);
      else if (err.message === 'simulation_unavailable') {
        if (state?.phase === 'playing') invalidateSession(polledToken);
        status(readableError(err));
      } else {
        if (state?.phase === 'playing') {
          authorityStale = true;
          releaseHeldInput();
          status('연결 확인 필요 · PC 입력 일시 정지 · 서버 조작 초기화 후 재개: '+readableError(err));
        } else status(`연결 확인 필요: ${readableError(err)}`);
      }
    }
    finally {polling = false;}
  }, 150);
  draw();
})();
