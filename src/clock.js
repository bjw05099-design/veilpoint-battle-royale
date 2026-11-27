/* VEILPOINT v1.1 - render-independent fixed step simulation clock.
 * Deliberately does not access the DOM, animation timing, or network.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VeilpointClock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createClock(options = {}) {
    const hz = options.hz ?? 60;
    const maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
    const maxSteps = options.maxSteps ?? 8;
    if (!Number.isFinite(hz) || hz <= 0 || hz > 1000) throw new RangeError('hz must be in (0, 1000]');
    if (!Number.isFinite(maxFrameSeconds) || maxFrameSeconds <= 0) throw new RangeError('invalid maximum frame duration');
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new RangeError('maxSteps must be a positive integer');

    const stepSeconds = 1 / hz;
    const epsilon = stepSeconds * 1e-8;
    let accumulator = 0;
    let totalSteps = 0;
    let discardedSeconds = 0;
    // Keep diagnostic counters finite even after repeated extreme tab stalls.
    function discard(seconds) {
      if (seconds > 0) discardedSeconds = Math.min(Number.MAX_VALUE,
        seconds >= Number.MAX_VALUE - discardedSeconds ? Number.MAX_VALUE : discardedSeconds + seconds);
    }
    let advancing = false;
    let generation = 0;

    function advance(elapsedSeconds, onStep) {
      if (typeof onStep !== 'function') throw new TypeError('onStep must be a function');
      // A nested advance can replay the same held input before the outer tick
      // finishes. This is an invalid clock boundary, not a second render frame.
      if (advancing) throw new Error('clock_advance_reentrant');
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
      advancing = true;
      try {
      if (elapsedSeconds > maxFrameSeconds) discard(elapsedSeconds - maxFrameSeconds);
      accumulator += Math.min(elapsedSeconds, maxFrameSeconds);
      let executed = 0;
      while (accumulator + epsilon >= stepSeconds && executed < maxSteps) {
        // Account for this tick before invoking user simulation code. If a
        // callback partially mutates game state then throws, replaying the same
        // tick on the next animation frame can duplicate ammo/damage/loot.
        accumulator = Math.max(0, accumulator - stepSeconds);
        executed++;
        totalSteps++;
        try {
          const tickGeneration = generation;
          onStep(stepSeconds);
          // A gameplay callback may finish a match and reset the clock.
          // Never spend its old frame's remaining ticks on a new session.
          if (generation !== tickGeneration) break;
        } catch (error) {
          // Fail closed on stale queued inputs after a logic exception; retain
          // only the fractional remainder, exactly as for a normal long stall.
          if (accumulator >= stepSeconds) {
            const remainder = accumulator % stepSeconds;
            discard(accumulator - remainder);
            accumulator = remainder;
          }
          throw error;
        }
      }
      // A stalled tab must not spend seconds replaying obsolete inputs.
      if (accumulator >= stepSeconds) {
        const remainder = accumulator % stepSeconds;
        discard(accumulator - remainder);
        accumulator = remainder;
      }
      return executed;
      } finally { advancing = false; }
    }

    function reset() { accumulator = 0; generation++; }
    function stats() {
      return { hz, stepSeconds, totalSteps, discardedSeconds, alpha: accumulator / stepSeconds };
    }
    return { advance, reset, stats };
  }

  return { createClock };
});
