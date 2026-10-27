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

    function advance(elapsedSeconds, onStep) {
      if (typeof onStep !== 'function') throw new TypeError('onStep must be a function');
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
      if (elapsedSeconds > maxFrameSeconds) discardedSeconds += elapsedSeconds - maxFrameSeconds;
      accumulator += Math.min(elapsedSeconds, maxFrameSeconds);
      let executed = 0;
      while (accumulator + epsilon >= stepSeconds && executed < maxSteps) {
        onStep(stepSeconds);
        accumulator = Math.max(0, accumulator - stepSeconds);
        executed++;
        totalSteps++;
      }
      // A stalled tab must not spend seconds replaying obsolete inputs.
      if (accumulator >= stepSeconds) {
        const remainder = accumulator % stepSeconds;
        discardedSeconds += accumulator - remainder;
        accumulator = remainder;
      }
      return executed;
    }

    function reset() { accumulator = 0; }
    function stats() {
      return { hz, stepSeconds, totalSteps, discardedSeconds, alpha: accumulator / stepSeconds };
    }
    return { advance, reset, stats };
  }

  return { createClock };
});
