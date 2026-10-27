'use strict';
// VEILPOINT / original, offline-first two-client authoritative objective prototype.
// Pure 60 Hz rules. Not a production FPS netcode or public internet service.
const {moveEntity, lineBlocked} = require('./simulation.js');
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
// A local, movement-facing 120-degree view, not a radar of nearby opponents.
const VISION_RANGE = 14;
const VISION_COS = 0.5;
// Original game abstractions: bounded, server-owned combat, not real weapon instruction.
const FIRE_RANGE = 12;
const FIRE_COS = Math.cos(Math.PI / 12);
const FIRE_DAMAGE = 34;
const FIRE_INTERVAL_TICKS = 18;
const MAGAZINE_ROUNDS = 12;
const SPARE_ROUNDS = 24;
const RELOAD_TICKS = 90;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const validDirection = v => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === 2 && Object.keys(v).every(k => k === 'x' || k === 'z') &&
  Number.isFinite(v.x) && Number.isFinite(v.z) && Math.abs(v.x) <= 1 && Math.abs(v.z) <= 1;

class TeamMatch {
  constructor({now = () => Date.now(), timeoutMs = 30000} = {}) {
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
  join(token, name) {
    if (this.players.size >= MAX_PLAYERS) throw new RangeError('match_full');
    if (this.players.has(token)) throw new RangeError('duplicate_token');
    if (typeof name !== 'string' || !name.trim() || name.length > 24) throw new RangeError('invalid_name');
    const red = [...this.players.values()].filter(p => p.team === 'red').length;
    const blue = this.players.size - red;
    const team = red <= blue ? 'red' : 'blue';
    const player = {id: this.nextPlayerId++, name: name.trim(), team,
      x: team === 'red' ? -8 : 8, z: 0, ready: false,
      direction: {x: 0, z: 0}, facing: {x: team === 'red' ? 1 : -1, z: 0},
      capturing: false, health: 100, ammo: MAGAZINE_ROUNDS, reserve: SPARE_ROUNDS,
      reloadTicks: 0, lastShotTick: -FIRE_INTERVAL_TICKS, seq: 0, lastSeen: this.now()};
    this.players.set(token, player);
    return {id: player.id, team};
  }
  command(token, data) {
    const p = this.players.get(token);
    if (!p) throw new RangeError('unknown_player');
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !Number.isSafeInteger(data.seq) || data.seq <= p.seq || data.seq > 1000000000 ||
      typeof data.type !== 'string') throw new RangeError('invalid_sequence');
    const keys = Object.keys(data);
    const expected = data.type === 'move' ? ['seq', 'type', 'direction'] :
      data.type === 'capture' ? ['seq', 'type', 'active'] :
      ['ready', 'leave', 'heartbeat', 'fire', 'reload'].includes(data.type) ? ['seq', 'type'] : null;
    if (!expected || keys.length !== expected.length || keys.some(k => !expected.includes(k)))
      throw new RangeError('invalid_command');
    if (data.type === 'move' && !validDirection(data.direction)) throw new RangeError('invalid_direction');
    if (data.type === 'capture' && typeof data.active !== 'boolean') throw new RangeError('invalid_capture');
    if (this.phase !== 'playing' && (data.type === 'move' || data.type === 'capture'))
      throw new RangeError('not_playing');
    p.seq = data.seq;
    p.lastSeen = this.now();
    if (data.type === 'leave') {
      this.players.delete(token);
      if (this.phase === 'playing') this.finish(p.team === 'red' ? 'blue' : 'red', 'player_left');
      return {ok: true};
    }
    // State polling cannot keep a disconnected/abandoned player active forever.
    if (data.type === 'heartbeat') return {ok: true};
    if (data.type === 'ready') {
      if (this.phase !== 'playing') {
        p.ready = true;
        if (this.players.size === MAX_PLAYERS && [...this.players.values()].every(x => x.ready)) this.start();
      }
      return {ok: true};
    }
    if (data.type === 'fire') {
      if (p.reloadTicks > 0) return {ok: false, reason: 'reloading'};
      if (p.ammo === 0) return {ok: false, reason: 'empty_magazine'};
      if (this.ticks - p.lastShotTick < FIRE_INTERVAL_TICKS) return {ok: false, reason: 'cooldown'};
      p.lastShotTick = this.ticks;
      p.ammo--;
      p.capturing = false;
      // No client-provided target, damage, aim or position. Server validates facing and cover.
      const opponent = [...this.players.values()].find(other => other !== p);
      let hit = false;
      if (opponent && opponent.health > 0) {
        const dx = opponent.x - p.x, dz = opponent.z - p.z;
        const distance = Math.hypot(dx, dz);
        hit = distance > 0 && distance <= FIRE_RANGE &&
          dx * p.facing.x + dz * p.facing.z >= distance * FIRE_COS &&
          !lineBlocked(p.x, p.z, opponent.x, opponent.z, COVER);
        if (hit) {
          opponent.health = Math.max(0, opponent.health - FIRE_DAMAGE);
          opponent.capturing = false;
          if (opponent.health === 0) this.finish(p.team, 'opponent_incapacitated');
        }
      }
      return {ok: true, hit, ammo: p.ammo};
    }
    if (data.type === 'reload') {
      if (p.reloadTicks > 0) return {ok: false, reason: 'already_reloading'};
      if (p.ammo === MAGAZINE_ROUNDS) return {ok: false, reason: 'magazine_full'};
      if (p.reserve === 0) return {ok: false, reason: 'no_reserve'};
      p.reloadTicks = RELOAD_TICKS;
      p.capturing = false;
      return {ok: true, reloadTicks: p.reloadTicks};
    }
    if (data.type === 'move') {
      const {x, z} = data.direction, len = Math.hypot(x, z);
      p.direction = len > 1 ? {x: x / len, z: z / len} : {x, z};
      // Stopping retains the last facing; a zero vector cannot reveal all directions.
      if (len > 0) p.facing = {x: x / len, z: z / len};
    } else p.capturing = data.active;
    return {ok: true};
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
      p.capturing = false;
      p.health = 100;
      p.ammo = MAGAZINE_ROUNDS;
      p.reserve = SPARE_ROUNDS;
      p.reloadTicks = 0;
      p.lastShotTick = -FIRE_INTERVAL_TICKS;
    }
  }
  finish(winner, reason) {
    this.phase = 'ended';
    this.winner = winner;
    this.reason = reason;
    for (const p of this.players.values()) {
      p.direction = {x: 0, z: 0};
      p.capturing = false;
      p.ready = false;
    }
  }
  step() {
    if (this.phase !== 'playing') return;
    this.ticks++;
    for (const p of this.players.values()) {
      if (this.now() - p.lastSeen > this.timeoutMs) {
        this.finish(p.team === 'red' ? 'blue' : 'red', 'connection_timeout');
        return;
      }
      if (p.reloadTicks > 0) {
        p.reloadTicks--;
        if (p.reloadTicks === 0) {
          const transferred = Math.min(MAGAZINE_ROUNDS - p.ammo, p.reserve);
          p.ammo += transferred;
          p.reserve -= transferred;
        }
      }
      moveEntity(p, p.direction.x * SPEED, p.direction.z * SPEED, STEP, COVER, PLAYER_RADIUS);
      p.x = clamp(p.x, -24 + PLAYER_RADIUS, 24 - PLAYER_RADIUS);
      p.z = clamp(p.z, -24 + PLAYER_RADIUS, 24 - PLAYER_RADIUS);
    }
    const nearby = [...this.players.values()].filter(p => Math.hypot(p.x, p.z) <= CAPTURE_RADIUS);
    const teams = new Set(nearby.map(p => p.team));
    // An interrupted capture must restart; stored partial progress is exploitable.
    if (teams.size !== 1 || !nearby.some(p => p.capturing)) {
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
      if (this.score[team] >= WIN_SCORE) this.finish(team, 'objective_score');
    }
  }
  snapshot(token) {
    const me = this.players.get(token);
    if (!me) throw new RangeError('unknown_player');
    const visible = [...this.players.values()].filter(p => {
      if (p === me) return true;
      const dx = p.x - me.x, dz = p.z - me.z, distance = Math.hypot(dx, dz);
      return distance <= VISION_RANGE &&
        dx * me.facing.x + dz * me.facing.z >= distance * VISION_COS &&
        !lineBlocked(me.x, me.z, p.x, p.z, COVER);
    });
    return {phase: this.phase, tick: this.ticks, score: {...this.score},
      progress: {...this.progress}, winner: this.winner, reason: this.reason,
      objective: {x: 0, z: 0, radius: CAPTURE_RADIUS}, cover: COVER,
      self: {id: me.id, team: me.team, x: me.x, z: me.z, facing: {...me.facing},
        health: me.health, ammo: me.ammo, reserve: me.reserve, reloadTicks: me.reloadTicks,
        ready: me.ready, seq: me.seq},
      visible: visible.map(p => ({id: p.id, name: p.name, team: p.team, x: p.x, z: p.z}))};
  }
}
module.exports = {TeamMatch, STEP, SPEED, CAPTURE_SECONDS, WIN_SCORE, COVER,
  FIRE_RANGE, FIRE_INTERVAL_TICKS, MAGAZINE_ROUNDS, SPARE_ROUNDS, RELOAD_TICKS};
