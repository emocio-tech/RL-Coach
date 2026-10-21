// Adaptive render resolution (pure, no three.js import).
// Feed it the raw frame time (ms) of consecutively rendered frames: when the average over a window is above the
// threshold it moves to the next lower pixel ratio. It never goes back up, so it cannot oscillate.
export function createRatioController({ maxRatio, steps = [2, 1.5, 1.25, 1], thresholdMs = 28, windowFrames = 90, warmupFrames = 30 }) {
  let ratio = Math.min(maxRatio, steps[0]);
  let seen = 0; // frames pushed so far (warm-up included)
  let sum = 0;
  let count = 0;

  return {
    get ratio() {
      return ratio;
    },
    // Forgets the frames of the current window (not the warm-up): used when the measure was interrupted.
    reset() {
      sum = 0;
      count = 0;
    },
    // Returns the new ratio when it has just been lowered, otherwise null.
    push(dtMs) {
      seen += 1;
      if (seen <= warmupFrames) return null;
      if (!Number.isFinite(dtMs) || dtMs > 250) return null;
      sum += dtMs;
      count += 1;
      if (count < windowFrames) return null;
      const average = sum / count;
      sum = 0;
      count = 0;
      if (average <= thresholdMs) return null;
      const lower = steps.filter((s) => s < ratio && s >= 1).sort((a, b) => b - a)[0];
      if (lower === undefined) return null;
      ratio = lower;
      return ratio;
    },
  };
}
