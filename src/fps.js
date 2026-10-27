/* VEILPOINT v1.2 — configurable render frame cap; does not affect 60 Hz game simulation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VeilpointFPS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FPS_OPTIONS = Object.freeze([30, 60, 90, 120, 144, 165]);
  function validate(value) {
    if (!FPS_OPTIONS.includes(value)) throw new RangeError('Unsupported FPS cap');
    return value;
  }
  function createFrameLimiter(initialCap = 60) {
    let cap = validate(initialCap);
    let nextAt = null, sampleStart = null, sampledFrames = 0, actualFps = 0;
    let renderedFrames = 0;
    function reset() {
      nextAt = null;
      sampleStart = null;
      sampledFrames = 0;
      actualFps = 0;
    }
    function setLimit(value) {
      cap = validate(value);
      reset();
      return cap;
    }
    function shouldRender(timeMs) {
      if (!Number.isFinite(timeMs)) return false;
      if (nextAt !== null && timeMs + 0.05 < nextAt) return false;
      const interval = 1000 / cap;
      // Preserve phase at stable refresh rates, but never burst-render after a tab stall.
      nextAt = nextAt === null || timeMs - nextAt >= interval
        ? timeMs + interval
        : nextAt + interval;
      renderedFrames++;
      if (sampleStart === null) {
        sampleStart = timeMs;
        sampledFrames = 1;
      } else {
        sampledFrames++;
        const elapsed = timeMs - sampleStart;
        if (elapsed >= 1000) {
          actualFps = Math.max(0, Math.round((sampledFrames - 1) * 1000 / elapsed));
          sampleStart = timeMs;
          sampledFrames = 1;
        }
      }
      return true;
    }
    function stats() { return { cap, actualFps, renderedFrames }; }
    return { shouldRender, setLimit, reset, stats };
  }
  return { FPS_OPTIONS, createFrameLimiter };
});
