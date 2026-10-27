'use strict';
// Actual BR browser controller exercised in a deterministic Node DOM/WebGL stub.
// This does not replace real desktop/mobile browser or GPU acceptance testing.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

function boot({touch = false, store = new Map()} = {}) {
  const nodes = new Map(), listeners = new Map();
  let now = 0, frameCallback = null, latestGame = null;
  const ctx = {};
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill']) ctx[name] = () => {};
  const add = (map, key, callback) => map.set(key, [...(map.get(key) || []), callback]);
  const emit = (map, key, event = {}) => {
    for (const callback of map.get(key) || []) callback({preventDefault() {}, pointerId: 1, ...event});
  };
  const classList = () => {
    const values = new Set();
    return {
      add: x => values.add(x), remove: x => values.delete(x),
      contains: x => values.has(x),
      toggle(x, force) {
        if (force === true || (force === undefined && !values.has(x))) values.add(x);
        else values.delete(x);
      }
    };
  };
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const events = new Map();
    const value = {
      id, value: '', checked: false, disabled: false, style: {}, title: '',
      textContent: '', innerHTML: '', width: 240, height: 240,
      classList: classList(),
      getContext: () => ctx,
      getBoundingClientRect: () => ({x: 0, y: 0, width: 88, height: 88}),
      setPointerCapture() {},
      addEventListener: (key, callback) => add(events, key, callback),
      dispatch: (key, event) => emit(events, key, event),
      click() {this.dispatch('click');},
      requestPointerLock() {document.pointerLockElement = this;}
    };
    nodes.set(id, value);
    return value;
  }
  const selectors = new Map();
  const document = {
    pointerLockElement: null,
    getElementById: node,
    querySelector: selector => {
      if (!selectors.has(selector)) selectors.set(selector, node('selector-' + selector));
      return selectors.get(selector);
    },
    addEventListener: (key, callback) => add(listeners, key, callback),
    exitPointerLock() {this.pointerLockElement = null;}
  };
  const context = {
    document,
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value))
    },
    performance: {now: () => now},
    matchMedia: () => ({matches: touch}),
    requestAnimationFrame: callback => {frameCallback = callback;},
    setTimeout: () => 1,
    addEventListener: (key, callback) => add(listeners, key, callback),
    console,
    VeilpointRenderer: class {
      constructor(canvas) {this.canvas = canvas;this.gpuTimer = {supported: false};}
      setGraphicsQuality() {}
      draw(game) {latestGame = game;}
      setAdaptiveResolution() {}
    }
  };
  context.globalThis = context;
  for (const filename of ['src/simulation.js', 'src/visibility.js', 'src/performance.js',
    'src/graphics.js', 'src/clock.js', 'src/fps.js', 'src/app.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'),
      context, {filename, timeout: 1500});
  }
  return {
    node, store, context, selectors,
    emit: (key, event) => emit(listeners, key, event),
    frame(ms) {
      now = ms;
      const callback = frameCallback;
      assert.equal(typeof callback, 'function');
      callback(ms);
    },
    get game() {return latestGame;}
  };
}

test('offline BR browser UI starts, loses, returns to menu and restarts with fresh finite resources', () => {
  const app = boot();
  app.node('play').click();
  assert.equal(app.node('overlay').classList.contains('hidden'), true);
  app.frame(1000 / 60);
  const first = app.game;
  assert.equal(first.status, 'playing');
  assert.equal(first.player.charges, 48);
  app.context.VeilpointSim.receiveDamage(first, 100);
  app.frame(2000 / 60);
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.equal(app.node('play').textContent, '다시 시작');
  app.node('play').click();
  app.frame(3000 / 60);
  assert.notEqual(app.game, first);
  assert.equal(app.game.status, 'playing');
  assert.equal(app.game.player.charges, 48);
  assert.equal(app.node('overlay').classList.contains('hidden'), true);
});

test('offline BR browser UI announces victory only after simulation resolves the last rival', () => {
  const app = boot();
  app.node('play').click();
  app.frame(1000 / 60);
  const game = app.game;
  game.bots.forEach(bot => {bot.alive = false;});
  app.frame(2000 / 60);
  assert.equal(game.status, 'won');
  assert.equal(app.node('overlay').classList.contains('hidden'), false);
  assert.match(app.selectors.get('.eyebrow').textContent, /CHAMPION/);
});

test('keyboard fire/reload and touch fire consume finite BR ammo without adding rounds', () => {
  const desktop = boot();
  desktop.node('play').click();
  desktop.frame(1000 / 60);
  const game = desktop.game;
  desktop.emit('keydown', {code: 'Space'});
  assert.equal(game.player.charges, 47);
  assert.equal(game.player.loaded, 11);
  desktop.emit('keydown', {code: 'KeyR'});
  assert.ok(game.player.reloadRemaining > 0);
  assert.equal(game.player.charges, 47);
  for (let frame = 2; frame <= 120; frame++) desktop.frame(frame * 1000 / 60);
  assert.equal(game.player.reloadRemaining, 0);
  assert.equal(game.player.loaded, 12);
  assert.equal(game.player.charges, 47);
  const mobile = boot({touch: true});
  mobile.node('play').click();
  mobile.frame(1000 / 60);
  mobile.node('tagButton').dispatch('pointerdown');
  assert.equal(mobile.game.player.charges, 47);
  assert.equal(mobile.game.player.loaded, 11);
});

test('graphics presets persist across BR UI restarts without changing the 60Hz simulation', () => {
  const store = new Map();
  const app = boot({store});
  app.node('graphicsPreset').value = 'balanced';
  app.node('graphicsPreset').dispatch('change');
  const settings = JSON.parse(store.get('veilpoint.graphics'));
  assert.equal(settings.fpsCap, 120);
  const next = boot({store});
  assert.equal(next.node('graphicsPreset').value, 'balanced');
  next.node('play').click();
  next.frame(1000 / 60);
  assert.equal(next.game.status, 'playing');
});
