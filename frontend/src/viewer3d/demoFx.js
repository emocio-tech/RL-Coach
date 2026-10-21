// Demolition effect: pure functions of the match time, with no import of three.
// Coordinates are those of Rocket League (z up).

export const DEMO_FX_DURATION = 1.0; // seconds of match time
export const DEMO_PARTICLE_COUNT = 60;
export const DEMO_RESPAWN_FALLBACK = 3; // seconds before the car is back when the data do not show the respawn
export const DEMO_SCALE = 0.3; // sparks travel this share of the goal sparks' distance
export const DEMO_MIN_ORIGIN_Z = 30; // the explosion never starts under the floor

const ORIGIN_BEFORE = 0.4; // seconds before the demolition within which the frozen car is looked for
const ORIGIN_AFTER = 1.0; // seconds after it

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const known = (track, i) => i >= 0 && i < track.t.length && track.x[i] != null && track.y[i] != null;

// A demolished car stays frozen with a null speed; a car in play always has a speed.
const frozen = (track, i) => known(track, i) && track.speed?.[i] == null;
const alive = (track, i) => known(track, i) && track.speed?.[i] != null;

// Index of the sample closest to t that has a known position, or -1.
function nearestKnown(track, t) {
  let best = -1;
  for (let i = 0; i < track.t.length; i++) {
    if (known(track, i) && (best < 0 || Math.abs(track.t[i] - t) < Math.abs(track.t[best] - t))) best = i;
  }
  return best;
}

// First sample with a null speed and a known position within [t - 0.4, t + 1.0], else the nearest known one.
function originIndex(track, t) {
  for (let i = 0; i < track.t.length; i++) {
    if (track.t[i] > t + ORIGIN_AFTER) break;
    if (track.t[i] >= t - ORIGIN_BEFORE && frozen(track, i)) return i;
  }
  return nearestKnown(track, t);
}

// demos: [{ t, victim }] (seconds, same base as the tracks).
// playerTracks: raw [{ name, t[], x[], y[], z[], speed[] }] with possible nulls.
// Returns { [victim]: [{ t, resume, origin }] } sorted by t. The car is hidden from t to resume, which is
// the first sample after the freeze where the car is back in play (known position and speed).
export function buildDemoWindows(demos, playerTracks) {
  const byName = new Map((playerTracks ?? []).filter((p) => p?.t?.length).map((p) => [p.name, p]));
  const windows = {};
  const sorted = (demos ?? []).filter((d) => Number.isFinite(d?.t)).sort((a, b) => a.t - b.t);
  for (const { t, victim } of sorted) {
    const track = byName.get(victim);
    if (!track) continue;
    const anchor = originIndex(track, t);
    if (anchor < 0) continue;
    const origin = { x: track.x[anchor], y: track.y[anchor], z: Math.max(DEMO_MIN_ORIGIN_Z, track.z?.[anchor] ?? 0) };
    let resume = t + DEMO_RESPAWN_FALLBACK;
    for (let i = anchor + 1; i < track.t.length; i++) {
      if (track.t[i] > t && alive(track, i)) {
        resume = track.t[i];
        break;
      }
    }
    (windows[victim] ??= []).push({ t, resume, origin });
  }
  // A car hidden by one demolition never stays hidden past the next one.
  for (const list of Object.values(windows)) {
    for (let k = 0; k + 1 < list.length; k++) list[k].resume = Math.min(list[k].resume, list[k + 1].t);
  }
  return windows;
}

// State of the demolition effect of a victim at time t: null when nothing is shown and the car is visible.
// The visual effect is active while 0 <= age <= DEMO_FX_DURATION; the car stays hidden until demo.resume.
export function demoFxAt(windows, victim, t) {
  const list = windows?.[victim];
  let lo = 0;
  let hi = (list?.length ?? 0) - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const demo = list[found];
  const age = t - demo.t;
  const carHidden = t >= demo.t && t < demo.resume;
  if (age > DEMO_FX_DURATION && !carHidden) return null;
  return { demo, age, progress: clamp(age / DEMO_FX_DURATION, 0, 1), carHidden };
}
