/* VEILPOINT local two-client rules prototype UI; tab-scoped resume only, no external requests. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const canvas = el('arena'), ctx = canvas.getContext('2d');
  let token = null, seq = 0, state = null, lastDirection = '', capturing = false;
  let pending = Promise.resolve();
  let previousPhase = null;
  let actionFeedback = '', feedbackUntil = 0;
  const SESSION_KEY = 'veilpoint.team.tabSession';
  const keys = new Set();
  const request = async (path, body) => {
    const response = await fetch(path, {method: body ? 'POST' : 'GET',
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {'X-Player-Token': token} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const status = msg => {el('status').textContent = msg;};
  const send = (type, payload = {}) => {
    if (!token) return Promise.resolve();
    const command = {seq: ++seq, type, ...payload};
    pending = pending.then(() => request('/command', command)).then(result => {
      if (type === 'fire' || type === 'reload') {
        const messages = {cooldown: '발사 간격 유지', reloading: '재장전 중',
          empty_magazine: '탄창 비움 · R 재장전', already_reloading: '이미 재장전 중',
          magazine_full: '탄창 가득 참', no_reserve: '예비 탄약 없음'};
        actionFeedback = result.ok
          ? (type === 'fire' ? (result.hit ? '명중 확인' : '명중 미확인') : '재장전 시작')
          : (messages[result.reason] || '명령을 처리하지 못했습니다');
        feedbackUntil = (state?.tick || 0) + 90;
      }
      return result;
    }).catch(err => {status(`명령 실패: ${err.message}`);});
    return pending;
  };
  const direction = () => {
    const x = Number(keys.has('ArrowRight') || keys.has('KeyD') || keys.has('right')) -
      Number(keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('left'));
    const z = Number(keys.has('ArrowDown') || keys.has('KeyS') || keys.has('down')) -
      Number(keys.has('ArrowUp') || keys.has('KeyW') || keys.has('up'));
    return {x, z};
  };
  const updateInput = () => {
    if (!token || !state || state.phase !== 'playing') return;
    const d = direction(), key = `${d.x},${d.z}`;
    if (key !== lastDirection) {lastDirection = key;void send('move', {direction: d});}
  };
  const setCapture = active => {
    if (capturing === active) return;
    capturing = active;
    if (state?.phase === 'playing') void send('capture', {active});
  };
  const draw = () => {
    ctx.clearRect(0, 0, 500, 500);
    ctx.fillStyle = '#19272c';ctx.fillRect(0, 0, 500, 500);
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
      lastDirection = '';
      previousPhase = state.phase;
    }
    el('phase').textContent = state.phase.toUpperCase();
    el('team').textContent = state.self.team.toUpperCase();
    el('score').textContent = `${state.score.red} : ${state.score.blue}`;
    el('tick').textContent = String(state.tick);
    el('health').textContent = String(state.self.health);
    el('ammo').textContent = `${state.self.ammo} / ${state.self.reserve}`;
    el('reloadState').textContent = state.self.reloadTicks > 0 ? '재장전 중' : '준비';
    el('ready').disabled = state.phase === 'playing';
    if (state.phase === 'ended') status(`종료 · 승리 팀 ${state.winner} · 사유 ${state.reason}. 다시 준비하면 재대전할 수 있습니다.`);
    else if (state.phase === 'lobby') status('양쪽 플레이어가 준비 버튼을 눌러야 시작합니다.');
    else {
      const hint = '목표 원에서 E 점령 · F/SPACE 발사 · R 재장전. 위치·피해·탄약은 서버에서 검증합니다.';
      status(actionFeedback && state.tick <= feedbackUntil ? hint + ' · ' + actionFeedback : hint);
    }
    draw();
  };
  el('join').addEventListener('click', async () => {
    try {
      const result = await request('/join', {name: el('name').value});
      token = result.token;seq = 0;el('join').disabled = true;el('ready').disabled = false;
      try {window.sessionStorage.setItem(SESSION_KEY, token);} catch (_) { /* Optional storage. */ }
      el('name').disabled = true;status('입장 완료 · 다른 탭의 참가자를 기다립니다.');
    } catch (err) {status(`입장 실패: ${err.message}`);}
  });
  el('ready').addEventListener('click', () => void send('ready'));
  el('fire').addEventListener('click', () => {if (state?.phase === 'playing') void send('fire');});
  el('reload').addEventListener('click', () => {if (state?.phase === 'playing') void send('reload');});
  document.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (e.target === el('name')) return;
    keys.add(e.code);
    if (!e.repeat && state?.phase === 'playing') {
      if (e.code === 'KeyF' || e.code === 'Space') void send('fire');
      if (e.code === 'KeyR') void send('reload');
    }
    if (e.code === 'KeyE') setCapture(true);
    updateInput();
  });
  document.addEventListener('keyup', e => {keys.delete(e.code);if (e.code === 'KeyE') setCapture(false);updateInput();});
  window.addEventListener('blur', () => {keys.clear();setCapture(false);updateInput();});
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
    token = saved;
    try {
      state = await request('/state');
      seq = state.self.seq;
      el('join').disabled = true;el('name').disabled = true;
      el('ready').disabled = state.phase === 'playing';
      if (state.phase === 'playing') {
        await send('move', {direction: {x: 0, z: 0}});
        await send('capture', {active: false});
      }
      state = await request('/state');
      render();
    } catch (_) {
      token = null;seq = 0;state = null;
      try {window.sessionStorage.removeItem(SESSION_KEY);} catch (_) {}
      el('join').disabled = false;el('name').disabled = false;
      el('ready').disabled = true;
      status('이전 세션이 만료되었습니다. 다시 입장하세요.');
    }
  };
  void restoreTabSession();
  // A genuine connected client renews its server lease independently of read-only polling.
  setInterval(() => {if (token) void send('heartbeat');}, 10000);
  setInterval(async () => {
    if (!token) return;
    try {state = await request('/state');render();updateInput();}
    catch (err) {status(`연결 확인 필요: ${err.message}`);}
  }, 150);
  draw();
})();
