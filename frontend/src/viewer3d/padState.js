// Animation state of a boost pad, as a pure function of time (no three.js, no incremental state):
// the same time always gives the same result, whatever the order of the calls (seeks, replays).

export const BLINK_DURATION = 0.5; // s of blinking after a pickup
export const BLINK_PERIOD = 0.17; // s, square wave: 3 flashes in BLINK_DURATION
export const BLINK_ON = 1.5;
export const OFF = 0.02;
export const FLASH_DURATION = 0.35; // s of the flash when the pad is available again
export const FLASH_PEAK = 1.6;

const lerp = (a, b, f) => a + (b - a) * f;

// Last pickup whose time is <= t, or null. Pickups are sorted by time.
function lastPickup(pickups, t) {
  let lo = 0;
  let hi = pickups.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pickups[mid].t <= t) {
      found = pickups[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// pickups: [{ t, back }] sorted by t (back: time the pad is available again, or null).
// Returns { intensity }: a factor applied to the original emissive intensity / opacity of the pad.
export function padStateAt(pickups, t) {
  const pickup = pickups?.length ? lastPickup(pickups, t) : null;
  if (!pickup) return { intensity: 1 };

  if (pickup.back != null && t >= pickup.back) {
    const sinceBack = t - pickup.back;
    if (sinceBack >= FLASH_DURATION) return { intensity: 1 };
    const f = sinceBack / FLASH_DURATION;
    return { intensity: f < 0.5 ? lerp(OFF, FLASH_PEAK, f * 2) : lerp(FLASH_PEAK, 1, (f - 0.5) * 2) };
  }

  const sincePickup = t - pickup.t;
  if (sincePickup < BLINK_DURATION) {
    const on = (sincePickup % BLINK_PERIOD) < BLINK_PERIOD / 2;
    return { intensity: on ? BLINK_ON : OFF };
  }
  return { intensity: OFF };
}

// For each pad of the track data, the nearest pad of the scenery within `tolerance` uu (or null).
// Returns [{ scenery, pickups }] (only the matched ones); a pad of the scenery without data is not listed.
export function matchPads(sceneryPads, trackPads, tolerance = 50) {
  const matches = [];
  for (const track of trackPads ?? []) {
    let best = null;
    let bestDistance = tolerance;
    for (const pad of sceneryPads) {
      const distance = Math.hypot(pad.x - track.x, pad.y - track.y);
      if (distance <= bestDistance) {
        best = pad;
        bestDistance = distance;
      }
    }
    if (best) matches.push({ scenery: best, pickups: track.pickups ?? [] });
  }
  return matches;
}
