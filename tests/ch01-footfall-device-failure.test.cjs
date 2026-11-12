'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Footfall = require('../src/story-footfall.js');

function audioClass({ failStart = false } = {}) {
  return class FakeAudio {
    constructor() { this.sampleRate = 44100; this.currentTime = 0; this.destination = {}; this.closed = false; }
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      return { playbackRate: { value: 1 }, connect() {}, disconnect() {},
        start() { if (failStart) throw new Error('audio device lost'); }, stop() {} };
    }
    createBiquadFilter() {
      return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    close() { this.closed = true; return Promise.resolve(); }
  };
}
function walkingStory() {
  return { phase: 'arrival', world: { scene: 'nahrin', elapsed: 0,
    player: { x: 0, z: 0 }, obstacles: [] } };
}
test('failed device start closes the audio graph and never reports a played footstep', () => {
  const sound = Footfall.create({ AudioContextClass: audioClass({ failStart: true }) });
  assert.equal(sound.enable(), true);
  const story = walkingStory();
  assert.equal(sound.update(story, true), null);
  story.world.player.x = 1.3;
  story.world.elapsed = .2;
  assert.equal(sound.update(story, true), null);
  assert.equal(sound.enabled(), false);
  assert.equal(sound.stats().cues, 0);
  assert.equal(sound.stats().tracking, false);
});
test('valid walking audio reports one cue, while muted output does not fabricate a cue', () => {
  const sound = Footfall.create({ AudioContextClass: audioClass() });
  assert.equal(sound.enable(), true);
  const story = walkingStory();
  sound.update(story, true);
  story.world.player.x = 1.3;
  story.world.elapsed = .2;
  assert.equal(sound.update(story, true)?.surface, 'earth');
  assert.equal(sound.stats().cues, 1);
  sound.setVolume(0);
  story.world.player.x = 2.6;
  story.world.elapsed = .4;
  assert.equal(sound.update(story, true), null);
  assert.equal(sound.stats().cues, 1);
});
