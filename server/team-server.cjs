'use strict';
// Local-only, zero-dependency HTTP proof of a server-owned 2-client team round.
// Do not expose this prototype directly to the public internet.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {TeamMatch, STEP} = require('../src/team-match.cjs');
const {readJson} = require('./json-body.cjs');
const {performance} = require('node:perf_hooks');
const STEP_MS = STEP * 1000;
const MAX_CATCHUP_STEPS = 5;
// Node timers truncate fractional millisecond delays: setInterval(1000/60)
// effectively schedules 16ms, not 16.667ms, accelerating the match clock.
// Poll a monotonic accumulator and execute only full authoritative 60Hz steps.
// Bound catch-up after a suspended process rather than simulating seconds of
// unseen combat in one event-loop turn.
function createFixedStepClock(onStep) {
  let previous = null, remainder = 0;
  return now => {
    if (!Number.isFinite(now)) return 0;
    if (previous === null) {previous = now;return 0;}
    // Ignore backward/jittered timestamps without moving the high-water mark.
    // Otherwise a 10ms clock rollback followed by recovery is counted twice,
    // advancing invisible 60Hz gameplay despite no equivalent elapsed time.
    if (now <= previous) return 0;
    remainder += Math.min(250, now - previous);
    previous = now;
    const pendingSteps = Math.floor((remainder + 1e-8) / STEP_MS);
    const steps = Math.min(MAX_CATCHUP_STEPS, pendingSteps);
    for (let i = 0; i < steps; i++) {
      // Consume each authoritative tick BEFORE executing its callback.
      // If a simulation exception occurs after mutating the world, replaying
      // this tick on the next wakeup would duplicate shots or relay progress.
      remainder = Math.max(0, remainder - STEP_MS);
      try {
        onStep();
      } catch (error) {
        // The failed tick is spent; drop stale whole-tick input backlog while
        // preserving only a fractional remainder for the next valid wakeup.
        // Floating-point subtraction can leave a remainder infinitesimally
        // below a whole tick (e.g. 2*STEP_MS - epsilon). Treat such stale
        // whole ticks as spent rather than carrying a phantom extra step.
        const staleTicks = Math.floor((remainder + 1e-8) / STEP_MS);
        remainder = Math.max(0, remainder - staleTicks * STEP_MS);
        throw error;
      }
    }
    // Five legitimate ticks may leave a fractional tick to carry into the
    // next wakeup. Drop only *excess* full ticks after a real process stall;
    // clearing the fraction at exactly five silently slows active rounds.
    if (pendingSteps > MAX_CATCHUP_STEPS) {
      // Drop only stale WHOLE ticks. A 101ms stall includes six full ticks
      // and a real 1ms fraction: losing that fraction on every overloaded
      // wakeup slows the authoritative match clock and skews input leases.
      // The sixth overdue tick remains discarded; only newly elapsed time
      // can complete the fractional step on a later wakeup.
      const staleTicks = Math.floor((remainder + 1e-8) / STEP_MS);
      remainder = Math.max(0, remainder - staleTicks * STEP_MS);
    }
    return steps;
  };
}
function createTeamServer({host = '127.0.0.1', port = 8765, autoTick = true, now, bodyTimeoutMs = 5000} = {}) {
  // This proof must never silently bind to a publicly reachable interface.
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new RangeError('loopback_host_required');
  const match = new TeamMatch({now});
  // A lost /join response must not occupy another lobby seat on retry.
  // Attempt IDs are unpredictable, tab-scoped and only retained while the
  // corresponding server-owned seat exists; legacy {name} joins still work.
  const joinAttempts = new Map();
  const send = (res, status, value) => {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY'});
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      // Reject DNS-rebinding/Host-spoofing requests even when Origin matches forged Host.
      const authority = String(req.headers.host || '');
      if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/.test(authority) ||
          Number(authority.slice(authority.lastIndexOf(':') + 1)) !== server.address().port)
        return send(res, 403, {error: 'invalid_host'});
      // Scheme, host and port must match; malformed/opaque origins fail closed.
      if (origin) {
        try {
          if (new URL(origin).origin !== new URL('http://' + req.headers.host).origin)
            return send(res, 403, {error: 'cross_origin'});
        } catch {
          return send(res, 403, {error: 'cross_origin'});
        }
      }
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && ['/', '/team-client.js', '/desktop-controls.js'].includes(url.pathname)) {
        const isScript = url.pathname !== '/';
        const relative = url.pathname === '/' ? 'team.html' :
          url.pathname === '/team-client.js' ? 'src/team-client.js' : 'src/desktop-controls.js';
        const file = path.join(__dirname, '..', relative);
        const body = await fs.readFile(file);
        res.writeHead(200, {'Content-Type': isScript ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'"});
        return res.end(body);
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        // A failed authoritative tick is not a healthy server merely because
        // the HTTP listener still responds. Never advertise a live match.
        if (simulationFault) return send(res, 503, {status: 'degraded', protocol: 1,
          phase: 'ended', error: 'simulation_unavailable'});
        match.expirePlayingLeases();
        // Probe-only lobby cleanup keeps diagnostics honest without renewing
        // leases or erasing a finished result that participants may still read.
        if (match.phase === 'lobby') match.pruneIdleWaitingPlayers();
        return send(res, 200, {status: 'ok', protocol: 1, phase: match.phase,
          connectedPlayers: match.players.size,
          lobbyReadyPlayers: match.phase === 'lobby'
            ? [...match.players.values()].filter(player => player.ready).length : null,
          simulationTick: match.ticks});
      }
      // No state snapshot or game command may use a partially mutated world.
      // Static assets remain readable so the client can display an error.
      if (simulationFault && ['/state', '/join', '/command'].includes(url.pathname))
        return send(res, 503, {error: 'simulation_unavailable'});
      if (req.method === 'GET' && url.pathname === '/state')
        return send(res, 200, match.snapshot(req.headers['x-player-token']));
      if (req.method === 'POST' && ['/join', '/command'].includes(url.pathname)) {
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(String(req.headers['content-type'] || '')))
          return send(res, 415, {error: 'json_required'});
        const body = await readJson(req, 2048, bodyTimeoutMs);
        // Body upload is asynchronous: a 60Hz tick can fail while this request
        // is awaiting its final bytes. Recheck the fatal fault latch AFTER
        // decoding, before either route touches the authoritative match.
        // The earlier pre-read guard alone leaves a partially mutated round
        // writable by a previously admitted slow POST.
        if (simulationFault) return send(res, 503, {error: 'simulation_unavailable'});
        if (url.pathname === '/join') {
          const keys = body && typeof body === 'object' && !Array.isArray(body)
            ? Object.keys(body) : [];
          if (typeof body?.name !== 'string' ||
              !((keys.length === 1 && keys[0] === 'name') ||
                (keys.length === 2 && keys.includes('name') && keys.includes('attemptId') &&
                  typeof body.attemptId === 'string' && /^[a-f0-9]{32}$/.test(body.attemptId))))
            throw new RangeError('invalid_join');
          // A retry is not a heartbeat for an expired combatant. Settle
          // active-round timeouts BEFORE looking up a reusable join attempt,
          // then reclaim expired lobby/finished seats and their attempt IDs.
          match.expirePlayingLeases();
          match.pruneIdleWaitingPlayers();
          for (const [id, token] of joinAttempts)
            if (!match.players.has(token)) joinAttempts.delete(id);
          const previousToken = body.attemptId && joinAttempts.get(body.attemptId);
          if (previousToken) {
            const previous = match.players.get(previousToken);
            // A delayed/lost join response is genuine lobby activity: renew
            // that seat's lease instead of expiring it seconds after recovery.
            // Never extend an active match via a join retry; only authenticated
            // gameplay commands can keep a playing participant connected.
            if (match.phase !== 'playing') previous.lastSeen = match.now();
            // The client must reconcile server-owned seq and clear any
            // ghost held input before accepting controls for this old seat.
            return send(res, 200, {token: previousToken, id: previous.id,
              team: previous.team, name: previous.name, resumed: true});
          }
          const token = crypto.randomBytes(24).toString('hex');
          const player = match.join(token, body.name);
          if (body.attemptId) joinAttempts.set(body.attemptId, token);
          return send(res, 201, {token, ...player, name: match.players.get(token).name});
        }
        const result = match.command(req.headers['x-player-token'], body);
        // The server resolves hits authoritatively, but a remote client must
        // not receive an omniscient hit-confirmation bit from the API.
        if (body.type === 'fire' && result.ok) return send(res, 200, {ok: true, ammo: result.ammo});
        return send(res, 200, result);
      }
      send(res, 404, {error: 'not_found'});
    } catch (err) {
      send(res, err instanceof RangeError ? (err.message === 'body_too_large' ? 413 : err.message === 'request_timeout' ? 408 : 400) : 500,
        {error: err instanceof RangeError ? err.message : 'internal_error'});
    }
  });
  let timer, simulationFault = false;
  return {
    match,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      if (autoTick) {
        const advance = createFixedStepClock(() => match.step());
        advance(performance.now());
        timer = setInterval(() => {
          if (simulationFault) return;
          try {advance(performance.now());}
          catch (error) {
            // An uncaught timer exception would terminate the Node process.
            // A partially applied tick must never be replayed, published as
            // authoritative, or followed by another competitive round.
            simulationFault = true;
            clearInterval(timer);timer = null;
            try {match.finish(null, 'simulation_error');}
            catch (finishError) {console.error('VEILPOINT failed to settle damaged match:', finishError);}
            console.error('VEILPOINT authoritative simulation halted:', error);
          }
        }, 8);
        timer.unref();
      }
      return server.address();
    },
    async close() {if (timer) clearInterval(timer);await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));}
  };
}
if (require.main === module) {
  createTeamServer().listen().then(addr => {
    process.stdout.write(`VEILPOINT local team prototype listening at http://${addr.address}:${addr.port}\n`);
    process.stdout.write('Open the displayed URL in two separate browser tabs to test the team round.\n');
  }).catch(err => {console.error(err);process.exitCode = 1;});
}
module.exports = {createTeamServer, createFixedStepClock};
