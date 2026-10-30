'use strict';
// VEILPOINT / original, offline-first two-client authoritative objective prototype.
// Pure 60 Hz rules. Not a production FPS netcode or public internet service.
const {moveEntity, lineBlocked, injuryMobility} = require('./simulation.js');
const {performance} = require('node:perf_hooks');
const STEP = 1 / 60;
const SPEED = 4.5;
const CAPTURE_RADIUS = 2.6;
const CAPTURE_SECONDS = 2;
const WIN_SCORE = 3;
const MAX_PLAYERS = 2;
// Shared grounded geometry: the server owns cover, collision and visibility.
// Clear central access keeps the original two-player capture route playable.
const COVER = Object.freeze([
  Object.freeze({x: 0, z: 6, w: 3, d: 1.5}),
  Object.freeze({x: 0, z: -6, w: 3, d: 1.5})
]);
const PLAYER_RADIUS = 0.55;
// In clear air, all unobstructed positions in this bounded 48m x 48m
// prototype arena can be seen within the 120-degree view. This is not a
// real-world visibility measurement or an automatic target acquisition system.
const VISION_RANGE = 80;
const MIST_VISION_RANGE = 9;
// Fictional coastal mist is a public, deterministic environmental condition.
// It affects both teams' sight equally; it never damages, heals or reveals actors.
const MIST_END_TICK = 1500;
const VISION_COS = 0.5;
// Server raycast query bound exceeds the small 2D arena; this is NOT a firearm's
// real-world maximum range or an implementation of full external ballistics.
const FIRE_RANGE = 250;
const FIRE_DAMAGE = 34;
const FIRE_INTERVAL_TICKS = 18;
const MAGAZINE_ROUNDS = 12;
const SPARE_ROUNDS = 24;
const RELOAD_TICKS = 90;
const RELOAD_HESITATION_TICKS = 36;
const STRESS_THRESHOLD = 60;
const STRESS_DECAY_PER_TICK = 0.03;
// Fixed-step intent lease: disconnected/suspended input must not move or capture forever.
// Clients periodically renew held intent; heartbeat/state polling never renews it.
const INPUT_LEASE_TICKS = 90;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const validDirection = v => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === 2 && Object.keys(v).every(k => k === 'x' || k === 'z') &&
  Number.isFinite(v.x) && Number.isFinite(v.z) && Math.abs(v.x) <= 1 && Math.abs(v.z) <= 1;

// 60Hz authoritative passing-mist event: gradual arrival, a sustained bank,
// then gradual clearing. One bank per round; no client-controlled visibility.
// Accelerated durations are gameplay abstractions, not meteorological measurements.
function weatherAt(tick) {
  const phase = tick < 300 ? 'clear' :
    tick < 600 ? 'incoming' :
    tick < 1200 ? 'active' :
    tick < MIST_END_TICK ? 'clearing' : 'clear';
  const mist = phase !== 'clear';
  const nextTick = tick < 300 ? 300 : tick < 600 ? 600 :
    tick < 1200 ? 1200 : tick < MIST_END_TICK ? MIST_END_TICK : null;
  // No instantaneous sight jump at the warning or clearing boundary.
  // This same server-owned range drives both clients' opponent disclosure.
  const visibilityRange = phase === 'incoming'
    ? VISION_RANGE - (VISION_RANGE - MIST_VISION_RANGE) * (tick - 300) / 300
    : phase === 'clearing'
      ? MIST_VISION_RANGE + (VISION_RANGE - MIST_VISION_RANGE) * (tick - 1200) / 300
      : phase === 'active' ? MIST_VISION_RANGE : VISION_RANGE;
  return {eventId: 0, phase, kind: mist ? 'coastal_mist' : 'clear',
    visibilityRange, ticksUntilChange: nextTick === null ? null : nextTick - tick};
}

class TeamMatch {
  constructor({now = () => performance.now(), timeoutMs = 30000} = {}) {
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.players = new Map();
    this.nextPlayerId = 1;
    this.phase = 'lobby';
    this.score = {red: 0, blue: 0};
    this.progress = {red: 0, blue: 0};
    this.ticks = 0;
    this.winner = null;
    this.reason = null;
  }
  pruneIdleWaitingPlayers() {
    // An abandoned lobby/finished session must not reserve both local slots forever.
    // Active rounds instead terminate through the existing timeout winner rule.
    if (this.phase === 'playing') return;
    // One monotonic timestamp per sweep: a wall-clock adjustment or a clock
    // change between actors must not evict only the second lobby participant.
    const timestamp = this.now();
    for (const [token, player] of this.players) {
      if (timestamp - player.lastSeen > this.timeoutMs) this.players.delete(token);
    }
    if (this.players.size === 0 && this.phase === 'ended') this.phase = 'lobby';
  }
  join(token, name) {
    this.pruneIdleWaitingPlayers();
    if (this.players.size >= MAX_PLAYERS) throw new RangeError('match_full');
    if (this.players.has(token)) throw new RangeError('duplicate_token');
    if (typeof name !== 'string' || !name.trim() || name.length > 24) throw new RangeError('invalid_name');
    const red = [...this.players.values()].filter(p => p.team === 'red').length;
    const blue = this.players.size - red;
    const team = red <= blue ? 'red' : 'blue';
    const player = {id: this.nextPlayerId++, name: name.trim(), team,
      x: team === 'red' ? -8 : 8, z: 0, ready: false,
      direction: {x: 0, z: 0}, facing: {x: team === 'red' ? 1 : -1, z: 0},
      aiming: false, capturing: false, captureHeld: false, captureArmed: false, health: 100, ammo: MAGAZINE_ROUNDS, reserve: SPARE_ROUNDS,
      reloadTicks: 0, reloadHesitation: false, reloadAssist: false, stress: 0,
      lastShotTick: -FIRE_INTERVAL_TICKS, seq: 0, lastSeen: this.now(),
      lastMoveTick: 0, lastCaptureTick: 0, lastAimTick: 0, triggerHeld: false, lastTriggerTick: 0};
    this.players.set(token, player);
    return {id: player.id, team};
  }
  // A delayed HTTP command can arrive before the next 60Hz server tick.
  // Settle expired leases first, or an overdue heartbeat/move can resurrect
  // an abandoned session and alter the round result between ticks.
  expirePlayingLeases() {
    if (this.phase !== 'playing') return false;
    const timestamp = this.now();
    const connected = [...this.players.values()].filter(p => timestamp - p.lastSeen <= this.timeoutMs);
    if (connected.length === this.players.size) return false;
    this.finish(connected.length === 1 ? connected[0].team : null, 'connection_timeout');
    return true;
  }
  command(token, data) {
    const p = this.players.get(token);
    if (!p) throw new RangeError('unknown_player');
    // A deliberate leave is terminal, not a session-renewal attempt. Preserve
    // the existing player_left semantics, including no fictitious winner when
    // the remaining peer has already expired.
    if (data?.type !== 'leave' && this.expirePlayingLeases())
      throw new RangeError('connection_timeout');
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !Number.isSafeInteger(data.seq) || data.seq <= p.seq || data.seq > 1000000000 ||
      typeof data.type !== 'string') throw new RangeError('invalid_sequence');
    const keys = Object.keys(data);
    const expected = ['move', 'aim'].includes(data.type) ? ['seq', 'type', 'direction'] :
      data.type === 'capture' || data.type === 'trigger' ? ['seq', 'type', 'active'] :
      data.type === 'assist' ? ['seq', 'type', 'enabled'] :
      ['ready', 'leave', 'heartbeat', 'fire', 'reload', 'aimRelease'].includes(data.type) ? ['seq', 'type'] : null;
    if (!expected || keys.length !== expected.length || keys.some(k => !expected.includes(k)))
      throw new RangeError('invalid_command');
    if (['move', 'aim'].includes(data.type) &&
        (!validDirection(data.direction) ||
         (data.type === 'aim' && Math.hypot(data.direction.x, data.direction.z) < 1e-6)))
      throw new RangeError('invalid_direction');
    if (data.type === 'capture' && typeof data.active !== 'boolean') throw new RangeError('invalid_capture');
    if (data.type === 'trigger' && typeof data.active !== 'boolean') throw new RangeError('invalid_trigger');
    if (data.type === 'assist' && typeof data.enabled !== 'boolean') throw new RangeError('invalid_assist');
    if (this.phase !== 'playing' && ['move', 'aim', 'aimRelease', 'capture', 'fire', 'reload', 'trigger'].includes(data.type))
      throw new RangeError('not_playing');
    p.seq = data.seq;
    p.lastSeen = this.now();
    if (data.type === 'leave') {
      this.players.delete(token);
      if (this.phase === 'playing') {
        // A voluntary exit must not award a win to a participant whose lease
        // already expired before the next authoritative 60Hz timeout sweep.
        const timestamp = this.now();
        const connected = [...this.players.values()].find(other =>
          timestamp - other.lastSeen <= this.timeoutMs);
        this.finish(connected ? connected.team : null, 'player_left');
      }
      return {ok: true};
    }
    // State polling cannot keep a disconnected/abandoned player active forever.
    if (data.type === 'heartbeat') return {ok: true};
    // Accessibility preference is server-owned, validated and retained between rounds.
    if (data.type === 'assist') {p.reloadAssist = data.enabled;return {ok: true, enabled: p.reloadAssist};}
    if (data.type === 'ready') {
      if (this.phase !== 'playing') {
        p.ready = true;
        if (this.players.size === MAX_PLAYERS && [...this.players.values()].every(x => x.ready)) this.start();
      }
      return {ok: true};
    }
    if (data.type === 'aimRelease') {
      // Leaving the aim surface restores keyboard/touch movement-facing control.
      p.aiming = false;
      p.lastAimTick = 0;
      const len = Math.hypot(p.direction.x, p.direction.z);
      if (len > 0) p.facing = {x: p.direction.x / len, z: p.direction.z / len};
      return {ok: true};
    }
    if (data.type === 'aim') {
      // Aiming is a bounded player intent, not a client-supplied hit/target.
      // The server normalizes the direction and still owns all sight and damage.
      const len = Math.hypot(data.direction.x, data.direction.z);
      p.facing = {x: data.direction.x / len, z: data.direction.z / len};
      p.aiming = true;
      p.lastAimTick = this.ticks;
      return {ok: true};
    }
    if (data.type === 'fire') return this.fireShot(p);
    if (data.type === 'trigger') {
      // A held PC trigger is an expiring intent, not a client-authored shot or rate.
      p.triggerHeld = data.active;
      p.lastTriggerTick = this.ticks;
      // A brief trigger press between ticks still interrupts a relay operation.
      if (data.active) {
        p.capturing = false;
        p.captureArmed = false;
        this.progress[p.team] = 0;
      }
      return {ok: true};
    }
    if (data.type === 'reload') {
      if (p.reloadTicks > 0) {
        if (!p.reloadHesitation) return {ok: false, reason: 'already_reloading'};
        // A second deliberate input can recover from a visible hesitation, but
        // never beat the ordinary 90-tick reload or duplicate carried rounds.
        if (p.reloadTicks > RELOAD_TICKS + RELOAD_HESITATION_TICKS - 15)
          return {ok: false, reason: 'recover_not_ready'};
        p.reloadTicks = Math.max(1, p.reloadTicks - RELOAD_HESITATION_TICKS);
        p.reloadHesitation = false;
        return {ok: true, recovered: true, reloadTicks: p.reloadTicks};
      }
      if (p.ammo === MAGAZINE_ROUNDS) return {ok: false, reason: 'magazine_full'};
      if (p.reserve === 0) return {ok: false, reason: 'no_reserve'};
      p.reloadHesitation = p.stress >= STRESS_THRESHOLD && !p.reloadAssist;
      p.reloadTicks = RELOAD_TICKS + (p.reloadHesitation ? RELOAD_HESITATION_TICKS : 0);
      p.capturing = false;
      p.captureArmed = false;
      this.progress[p.team] = 0;
      return {ok: true, reloadTicks: p.reloadTicks, hesitation: p.reloadHesitation};
    }
    if (data.type === 'move') {
      const {x, z} = data.direction, len = Math.hypot(x, z);
      p.direction = len > 1 ? {x: x / len, z: z / len} : {x, z};
      // Stopping retains the last facing; a zero vector cannot reveal all directions.
      if (len > 0 && !p.aiming) p.facing = {x: x / len, z: z / len};
      p.lastMoveTick = this.ticks;
      // Start/stop movement commands inside one server tick cannot bank a relay.
      if (len > 1e-6) {
        p.captureArmed = false;
        p.capturing = false;
        this.progress[p.team] = 0;
      }
    } else {
      // A completed relay transmission requires a fresh physical release/press.
      // Repeated active:true lease renewals cannot farm multiple points.
      // A relay can only be armed by a fresh stationary, hands-free press at the console.
      // Movement, firing, reloading or a received hit invalidates that press;
      // merely renewing active:true must never queue future interaction.
       // Holding the key while approaching from outside must not queue a remote capture.
       if (data.active && !p.captureHeld)
         p.captureArmed = Math.hypot(p.x, p.z) <= CAPTURE_RADIUS &&
           Math.hypot(p.direction.x, p.direction.z) < 1e-6 &&
           p.reloadTicks === 0 && !p.triggerHeld;
      if (!data.active) {p.captureArmed = false;this.progress[p.team] = 0;}
      p.captureHeld = data.active;
      p.capturing = data.active;
      p.lastCaptureTick = this.ticks;
    }
    return {ok: true};
  }
  fireShot(p, deferredHits = null) {
    if (this.phase !== 'playing') return {ok: false, reason: 'not_playing'};
      if (p.reloadTicks > 0) return {ok: false, reason: 'reloading'};
      if (p.ammo === 0) return {ok: false, reason: 'empty_magazine'};
      if (this.ticks - p.lastShotTick < FIRE_INTERVAL_TICKS) return {ok: false, reason: 'cooldown'};
      p.lastShotTick = this.ticks;
      p.ammo--;
      p.capturing = false;
      p.captureArmed = false;
      this.progress[p.team] = 0;
      // A shot follows the server-owned facing ray, never an auto-selected target.
      // Visibility affects what the client KNOWS, not whether a shot can travel
      // through mist. The opponent's 2D collision radius is a simple hit proxy.
      const opponent = [...this.players.values()].find(other => other !== p);
      let confirmedHit = false;
      if (opponent && opponent.health > 0) {
        const dx = opponent.x - p.x, dz = opponent.z - p.z;
        const forward = dx * p.facing.x + dz * p.facing.z;
        const crossTrack = Math.abs(dx * p.facing.z - dz * p.facing.x);
        // Resolve the first contact on the actual server-owned shot ray.
        // A center-to-center cover test can falsely damage an actor when the
        // aimed ray crosses a wall but the line to the actor's center does not.
        const intersects = forward > 0 && crossTrack <= PLAYER_RADIUS;
        const contact = intersects
          ? Math.max(0, forward - Math.sqrt(Math.max(0, PLAYER_RADIUS ** 2 - crossTrack ** 2)))
          : Infinity;
        const hit = contact > 0 && contact <= FIRE_RANGE &&
          !lineBlocked(p.x, p.z, p.x + p.facing.x * contact,
            p.z + p.facing.z * contact, COVER);
        if (hit) {
          // Held triggers in the same 60Hz tick must resolve together. Otherwise
          // the first Map entry always wins an otherwise mutual final exchange.
          // Explicit one-shot HTTP commands retain their immediate semantics.
          if (deferredHits) deferredHits.push({opponent});
          else {
            opponent.health = Math.max(0, opponent.health - FIRE_DAMAGE);
            opponent.stress = clamp(opponent.stress + FIRE_DAMAGE * 1.15, 0, 100);
            opponent.capturing = false;
            opponent.captureArmed = false;
            this.progress[opponent.team] = 0;
            if (opponent.health === 0) this.finish(p.team, 'opponent_incapacitated');
          }
          // A hidden target can be physically struck without giving the shooter
          // omniscient hit confirmation through the client command response.
          confirmedHit = Math.hypot(dx, dz) <= weatherAt(this.ticks).visibilityRange;
        }
      }
      return {ok: true, hit: confirmedHit, ammo: p.ammo};
  }
  start() {
    this.phase = 'playing';
    this.score = {red: 0, blue: 0};
    this.progress = {red: 0, blue: 0};
    this.ticks = 0;
    this.winner = null;
    this.reason = null;
    for (const p of this.players.values()) {
      p.x = p.team === 'red' ? -8 : 8;
      p.z = 0;
      p.ready = false;
      p.direction = {x: 0, z: 0};
      p.facing = {x: p.team === 'red' ? 1 : -1, z: 0};
      p.aiming = false;
      p.lastAimTick = 0;
      p.capturing = false;
      p.captureHeld = false;
      p.captureArmed = false;
      p.health = 100;
      p.ammo = MAGAZINE_ROUNDS;
      p.reserve = SPARE_ROUNDS;
      p.reloadTicks = 0;
      p.reloadHesitation = false;
      p.stress = 0;
      p.lastShotTick = -FIRE_INTERVAL_TICKS;
      p.lastMoveTick = 0;
      p.lastCaptureTick = 0;
      p.triggerHeld = false;
      p.lastTriggerTick = 0;
    }
  }
  finish(winner, reason) {
    this.phase = 'ended';
    this.winner = winner;
    this.reason = reason;
    for (const p of this.players.values()) {
      p.direction = {x: 0, z: 0};
      p.aiming = false;
      p.lastAimTick = 0;
      p.capturing = false;
      p.captureHeld = false;
      p.captureArmed = false;
      p.triggerHeld = false;
      p.ready = false;
    }
  }
  step() {
    if (this.phase !== 'playing') {this.pruneIdleWaitingPlayers();return;}
    // Reuse the exact pre-command lease rule for authoritative tick fairness.
    if (this.expirePlayingLeases()) return;
    this.ticks++;
    // Resolve player movement against the same start-of-tick positions. Moving
    // one Map entry first gives the first joiner a physical collision advantage
    // in head-on contests, even though both commands are valid in the same tick.
    const proposals = [];
    for (const p of this.players.values()) {
      // Exertion settles gradually; no automatic healing or ammunition refill.
      p.stress = Math.max(0, p.stress - STRESS_DECAY_PER_TICK);
      if (p.aiming && this.ticks - p.lastAimTick > INPUT_LEASE_TICKS) {
        p.aiming = false;
        const len = Math.hypot(p.direction.x, p.direction.z);
        if (len > 0) p.facing = {x: p.direction.x / len, z: p.direction.z / len};
      }
      if (this.ticks - p.lastMoveTick > INPUT_LEASE_TICKS) p.direction = {x: 0, z: 0};
      if (this.ticks - p.lastCaptureTick > INPUT_LEASE_TICKS) {
        // A suspended/abandoned PC tab cannot preserve an armed physical relay
        // press after its authoritative intent lease has expired. Keep
        // captureHeld true: an overdue active:true renewal is NOT a new keydown.
        // The operator must release and press again at the actual console.
        p.capturing = false;
        p.captureArmed = false;
      }
      if (p.reloadTicks > 0) {
        p.reloadTicks--;
        if (p.reloadTicks === 0) {
          p.reloadHesitation = false;
          const transferred = Math.min(MAGAZINE_ROUNDS - p.ammo, p.reserve);
          p.ammo += transferred;
          p.reserve -= transferred;
        }
      }
      const from = {x: p.x, z: p.z};
      const next = {...from};
      const speed = SPEED * injuryMobility(p);
      moveEntity(next, p.direction.x * speed, p.direction.z * speed, STEP,
        COVER, PLAYER_RADIUS);
      next.x = clamp(next.x, -24 + PLAYER_RADIUS, 24 - PLAYER_RADIUS);
      next.z = clamp(next.z, -24 + PLAYER_RADIUS, 24 - PLAYER_RADIUS);
      proposals.push({p, from, next});
    }
    if (proposals.length === 2) {
      const [a, b] = proposals;
      const separation = t => Math.hypot(
        a.from.x + (a.next.x - a.from.x) * t -
          b.from.x - (b.next.x - b.from.x) * t,
        a.from.z + (a.next.z - a.from.z) * t -
          b.from.z - (b.next.z - b.from.z) * t);
      const initial = separation(0);
      const desired = separation(1);
      const minimum = PLAYER_RADIUS * 2;
      // Endpoints alone miss a glancing collision: both actors can enter and
      // leave each other's collision radius during a single 60Hz movement step.
      // Find the closest point on their relative swept segment before resolving.
      const startX = a.from.x - b.from.x, startZ = a.from.z - b.from.z;
      const deltaX = (a.next.x - a.from.x) - (b.next.x - b.from.x);
      const deltaZ = (a.next.z - a.from.z) - (b.next.z - b.from.z);
      const relativeSpeedSquared = deltaX * deltaX + deltaZ * deltaZ;
      const closestTick = relativeSpeedSquared > 0
        ? clamp(-(startX * deltaX + startZ * deltaZ) / relativeSpeedSquared, 0, 1)
        : 0;
      if (initial >= minimum - 1e-9 && separation(closestTick) < minimum - 1e-9) {
        // Stop both proposals at their shared first time of contact. Bisection
        // is bounded by closest approach, so it also catches pass-through
        // grazes whose ENDPOINT separation remains physically valid.
        let low = 0, high = closestTick;
        for (let i = 0; i < 24; i++) {
          const mid = (low + high) / 2;
          if (separation(mid) >= minimum) low = mid;
          else high = mid;
        }
        for (const proposal of proposals) {
          proposal.next.x = proposal.from.x + (proposal.next.x - proposal.from.x) * low;
          proposal.next.z = proposal.from.z + (proposal.next.z - proposal.from.z) * low;
        }
      } else if (initial < minimum - 1e-9 && desired < initial - 1e-9) {
        // Old overlapping sessions can separate, but cannot move deeper into
        // an overlap or exploit a corrupted spawn to phase through a body.
        for (const proposal of proposals) proposal.next = {...proposal.from};
      }
    }
    for (const {p, next} of proposals) {
      p.x = next.x;
      p.z = next.z;
      // Walking away physically releases the relay. A later active:true
      // renewal cannot re-arm it without a genuine key release and press.
      if (Math.hypot(p.x, p.z) > CAPTURE_RADIUS) {
        p.captureArmed = false;
        p.capturing = false;
      }
    }
    // Automatic PC fire advances only on the authoritative 60Hz tick. A lost
    // keyup or suspended tab expires without a renewed trigger command; HTTP
    // heartbeats and state polling do not renew this combat intent.
    const sameTickHits = [];
    for (const p of this.players.values()) {
      if (this.ticks - p.lastTriggerTick > INPUT_LEASE_TICKS) p.triggerHeld = false;
      if (p.triggerHeld && this.phase === 'playing') this.fireShot(p, sameTickHits);
    }
    // All participants who were able to fire at the start of this tick get
    // their shot resolved before the round ends. Never award a first-join
    // advantage when both actors become incapacitated on the same tick.
    for (const {opponent} of sameTickHits) {
      opponent.health = Math.max(0, opponent.health - FIRE_DAMAGE);
      opponent.stress = clamp(opponent.stress + FIRE_DAMAGE * 1.15, 0, 100);
      opponent.capturing = false;
      opponent.captureArmed = false;
      this.progress[opponent.team] = 0;
    }
    if (sameTickHits.length) {
      const survivors = [...this.players.values()].filter(p => p.health > 0);
      if (survivors.length === 0) this.finish(null, 'mutual_incapacitation');
      else if (survivors.length === 1) this.finish(survivors[0].team, 'opponent_incapacitated');
    }
    if (this.phase !== 'playing') return;
    const nearby = [...this.players.values()].filter(p => Math.hypot(p.x, p.z) <= CAPTURE_RADIUS);
    const teams = new Set(nearby.map(p => p.team));
    // An interrupted capture must restart; stored partial progress is exploitable.
    // A physical relay/control interaction needs a stationary operator with
    // hands free. Entering the objective while moving, reloading or holding
    // the trigger cannot silently earn score; interruption resets progress.
    // The server checks its own intent/weapon state, not a client claim.
    const operator = nearby.some(p => p.capturing && p.captureArmed &&
      Math.hypot(p.direction.x, p.direction.z) < 1e-6 &&
      p.reloadTicks === 0 && !p.triggerHeld);
    if (teams.size !== 1 || !operator) {
      this.progress.red = 0;
      this.progress.blue = 0;
      return;
    }
    const team = nearby[0].team;
    this.progress[team === 'red' ? 'blue' : 'red'] = 0;
    this.progress[team] += STEP;
    if (this.progress[team] + 1e-9 >= CAPTURE_SECONDS) {
      this.score[team]++;
      this.progress[team] = 0;
      // One operator interaction transmits one point, not a perpetual stream.
      // A held key/HTTP renewal cannot re-arm until a release arrives.
      for (const p of nearby) if (p.team === team) p.captureArmed = false;
      if (this.score[team] >= WIN_SCORE) this.finish(team, 'objective_score');
    }
  }
  snapshot(token) {
    const me = this.players.get(token);
    if (!me) throw new RangeError('unknown_player');
    // State polling never renews a lease. Settle expired sessions before
    // publishing a phase even when the 60Hz timer is delayed or disabled.
    this.expirePlayingLeases();
    const weather = weatherAt(this.ticks);
    const visible = [...this.players.values()].filter(p => {
      if (p === me) return true;
      const dx = p.x - me.x, dz = p.z - me.z, distance = Math.hypot(dx, dz);
      if (distance > weather.visibilityRange + PLAYER_RADIUS) return false;
      // A partially exposed actor at a wall edge must not be rendered invisible
      // while the same authoritative shot ray can contact the exposed body.
      // Three silhouette samples are a bounded 2D proxy, not full 3D occlusion.
      const sideX = distance > 1e-6 ? -dz / distance * PLAYER_RADIUS : 0;
      const sideZ = distance > 1e-6 ? dx / distance * PLAYER_RADIUS : 0;
      return [[p.x, p.z], [p.x + sideX, p.z + sideZ],
        [p.x - sideX, p.z - sideZ]].some(([x, z]) => {
        const vx = x - me.x, vz = z - me.z, range = Math.hypot(vx, vz);
        return range <= weather.visibilityRange &&
          vx * me.facing.x + vz * me.facing.z >= range * VISION_COS &&
          !lineBlocked(me.x, me.z, x, z, COVER);
      });
    });
    return {phase: this.phase, tick: this.ticks, score: {...this.score},
      progress: {...this.progress}, winner: this.winner, reason: this.reason,
      objective: {x: 0, z: 0, radius: CAPTURE_RADIUS}, cover: COVER, weather,
      self: {id: me.id, team: me.team, x: me.x, z: me.z, facing: {...me.facing},
        health: me.health, ammo: me.ammo, reserve: me.reserve, reloadTicks: me.reloadTicks,
        stress: me.stress, reloadAssist: me.reloadAssist, reloadHesitation: me.reloadHesitation,
        ready: me.ready, captureArmed: me.captureArmed, seq: me.seq},
      visible: visible.map(p => ({id: p.id, name: p.name, team: p.team, x: p.x, z: p.z}))};
  }
}
module.exports = {TeamMatch, STEP, SPEED, CAPTURE_SECONDS, WIN_SCORE, COVER,
  FIRE_RANGE, FIRE_INTERVAL_TICKS, MAGAZINE_ROUNDS, SPARE_ROUNDS, RELOAD_TICKS,
  RELOAD_HESITATION_TICKS, STRESS_THRESHOLD, INPUT_LEASE_TICKS, weatherAt, MIST_END_TICK};
