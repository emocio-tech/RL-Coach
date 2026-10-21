// Goal explosion: pure functions of the match time, with no import of three.
// Coordinates are those of Rocket League (z up).

export const FX_DURATION = 1.8; // seconds of match time
export const MOVE_TOLERANCE = 50; // uu the ball may drift from the goal line before it counts as moved
export const FREEZE_SEARCH = 2; // seconds after the goal within which the frozen ball is looked for
export const FREEZE_EPSILON = 1; // uu below which two consecutive samples count as the same point
export const MIN_ORIGIN_Z = 60; // the explosion never starts under the floor
export const GRAVITY_DROP = 320; // uu/s² pulling the sparks down
export const PARTICLE_COUNT = 200;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const known = (ball, i) => i >= 0 && i < ball.t.length && ball.x[i] != null && ball.y[i] != null;

// Index of the ball sample closest to t that has a known position, or -1.
function nearestIndex(ball, t) {
  const n = ball.t.length;
  let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(ball.t[i] - t) < Math.abs(ball.t[best] - t)) best = i;
  for (let d = 0; d < n; d++) {
    for (const i of [best - d, best + d]) if (known(ball, i)) return i;
  }
  return -1;
}

// After a goal the ball freezes on the goal line: anchor on the first sample whose successor is
// (almost) the same point, within FREEZE_SEARCH seconds. The sample nearest to t may still be before the line.
function anchorIndex(ball, t) {
  const start = nearestIndex(ball, t);
  if (start < 0) return -1;
  for (let i = start; i + 1 < ball.t.length && ball.t[i] - t <= FREEZE_SEARCH; i++) {
    if (known(ball, i) && known(ball, i + 1) && Math.hypot(ball.x[i + 1] - ball.x[i], ball.y[i + 1] - ball.y[i]) < FREEZE_EPSILON) return i;
  }
  return start;
}

// goals: [{ t }] (seconds, same base as the tracks). ballTrack: raw { t, x, y, z } with possible nulls.
// Returns [{ t, team, resume, origin }] sorted by t, where team is the side that wins the point:
// team 1 when the ball stays at y < 0 (team 0 defends y < 0), team 0 otherwise.
export function buildGoalWindows(goals, ballTrack) {
  if (!ballTrack?.t?.length || !goals?.length) return [];
  const times = ballTrack.t;
  const end = times[times.length - 1];
  const sorted = goals.map((g) => g.t).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const windows = [];
  for (const t of sorted) {
    const anchor = anchorIndex(ballTrack, t);
    if (anchor < 0) continue;
    const origin = { x: ballTrack.x[anchor], y: ballTrack.y[anchor], z: Math.max(MIN_ORIGIN_Z, ballTrack.z?.[anchor] ?? 0) };
    let resume = end;
    for (let i = anchor + 1; i < times.length; i++) {
      if (times[i] <= t) continue;
      const x = ballTrack.x[i];
      const y = ballTrack.y[i];
      if (x == null || y == null || Math.hypot(x - origin.x, y - origin.y) > MOVE_TOLERANCE) {
        resume = times[i];
        break;
      }
    }
    windows.push({ t, team: origin.y < 0 ? 1 : 0, resume, origin });
  }
  // A ball hidden by one goal never stays hidden past the next goal.
  for (let k = 0; k + 1 < windows.length; k++) windows[k].resume = Math.min(windows[k].resume, windows[k + 1].t);
  return windows;
}

// State of the goal effect at time t: null when nothing is shown and the ball is visible.
// The visual effect is active while age <= FX_DURATION; the ball stays hidden until goal.resume.
export function goalFxAt(windows, t) {
  let lo = 0;
  let hi = (windows?.length ?? 0) - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (windows[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const goal = windows[found];
  const age = t - goal.t;
  const ballHidden = t < goal.resume;
  if (age > FX_DURATION && !ballHidden) return null;
  return { goal, age, progress: clamp(age / FX_DURATION, 0, 1), ballHidden };
}

// mulberry32: tiny seeded PRNG, so the explosion is identical on every replay and seek.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Unit directions over the whole sphere (slightly biased upwards) and speeds (uu travelled in FX_DURATION).
export function makeParticles(count, seed) {
  const rand = mulberry32(seed);
  const dir = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = clamp((rand() * 2 - 1) * 0.8 + 0.2, -1, 1);
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    dir[i * 3] = r * Math.cos(phi);
    dir[i * 3 + 1] = r * Math.sin(phi);
    dir[i * 3 + 2] = z;
    speed[i] = 500 + rand() * 1500;
  }
  return { count, dir, speed };
}

// Ease-out cubic of the time spent since the goal (1 once the effect is over).
export const ease = (age, duration = FX_DURATION) => {
  const u = clamp(age / duration, 0, 1);
  return 1 - (1 - u) * (1 - u) * (1 - u);
};

// Position of particle i at the given age, written into out ({ x, y, z }); no allocation.
// options (all optional): duration of the effect, scale of the travelled distance, gravity (uu/s²).
export function particlePosition(particles, i, age, origin, out, options) {
  const duration = options?.duration ?? FX_DURATION;
  const scale = options?.scale ?? 1;
  const gravity = options?.gravity ?? GRAVITY_DROP;
  const d = ease(age, duration) * particles.speed[i] * scale;
  const a = clamp(age, 0, duration);
  out.x = origin.x + particles.dir[i * 3] * d;
  out.y = origin.y + particles.dir[i * 3 + 1] * d;
  out.z = Math.max(8, origin.z + particles.dir[i * 3 + 2] * d - gravity * a * a);
  return out;
}
