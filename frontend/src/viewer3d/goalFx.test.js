import { describe, expect, it } from "vitest";
import { FX_DURATION, GRAVITY_DROP, buildGoalWindows, ease, goalFxAt, makeParticles, particlePosition } from "./goalFx.js";

// Ball track at 5 Hz from t = 0 to 30 s built from a function t -> [x, y, z] | null.
function track(position, end = 30) {
  const out = { t: [], x: [], y: [], z: [] };
  for (let i = 0; i <= Math.round(end * 5); i++) {
    const t = Math.round(i * 2) / 10;
    const p = position(t);
    out.t.push(t);
    out.x.push(p ? p[0] : null);
    out.y.push(p ? p[1] : null);
    out.z.push(p ? p[2] : null);
  }
  return out;
}

// Goal at 10 s in the y < 0 net, ball frozen until 14 s, missing for two samples, then at the centre.
const frozen = (t) => {
  if (t < 10) return [0, -1000 + t * 400, 200];
  if (t <= 14) return [200, -5200, 300];
  if (t < 14.5) return null;
  return [0, 0, 93];
};

describe("buildGoalWindows", () => {
  it("gives the point to team 1 when the ball stops at y < 0", () => {
    const [w] = buildGoalWindows([{ t: 10 }], track(frozen));
    expect(w.team).toBe(1);
    expect(w.origin).toEqual({ x: 200, y: -5200, z: 300 });
  });

  it("anchors on the frozen ball when the goal is dated just before it reaches the line", () => {
    // Real data: the sample nearest to the goal is still ~70 uu short of the line, the next ones are frozen.
    const late = (t) => (t < 10.2 ? [-330, -5130, 300] : t <= 14 ? [-360, -5200, 256] : t < 14.5 ? null : [0, 0, 93]);
    const [w] = buildGoalWindows([{ t: 10 }], track(late));
    expect(w.origin).toEqual({ x: -360, y: -5200, z: 256 });
    expect(w.resume).toBe(14.2);
    expect(goalFxAt([w], 10.5).ballHidden).toBe(true);
    expect(goalFxAt([w], 13.9).ballHidden).toBe(true);
  });

  it("gives the point to team 0 when the ball stops at y > 0, whatever the scorer's team", () => {
    // The goal objects only carry t: the scorer's team (wrong for an own goal) is never read.
    const [w] = buildGoalWindows([{ t: 10, team: 1 }], track((t) => (t <= 12 ? [0, 5200, 250] : [0, 0, 93])));
    expect(w.team).toBe(0);
  });

  it("detects the resume at the first raw null after the goal", () => {
    const [w] = buildGoalWindows([{ t: 10 }], track(frozen));
    expect(w.resume).toBeCloseTo(14.2, 5);
  });

  it("detects the resume when the ball moves more than 50 uu", () => {
    const [w] = buildGoalWindows([{ t: 10 }], track((t) => (t <= 12 ? [0, -5200, 200] : [0, 0, 93])));
    expect(w.resume).toBeCloseTo(12.2, 5);
    const [small] = buildGoalWindows([{ t: 10 }], track((t) => (t <= 12 ? [0, -5200, 200] : [30, -5200, 200]), 14));
    expect(small.resume).toBe(14);
  });

  it("ends at the end of the match when the ball never moves again", () => {
    const [w] = buildGoalWindows([{ t: 10 }], track((t) => (t < 10 ? [0, 0, 93] : [0, -5200, 200])));
    expect(w.resume).toBe(30);
  });

  it("clamps the origin height above the floor", () => {
    const [w] = buildGoalWindows([{ t: 10 }], track((t) => [0, -5200, t < 10 ? 93 : 10]));
    expect(w.origin.z).toBe(60);
  });

  it("ignores goals without ball track", () => {
    expect(buildGoalWindows([{ t: 10 }], { t: [], x: [], y: [], z: [] })).toEqual([]);
    expect(buildGoalWindows([{ t: 10 }], undefined)).toEqual([]);
    expect(buildGoalWindows([{ t: 10 }], track(() => null))).toEqual([]);
  });

  it("sorts the goals and stops a window at the next goal", () => {
    const ball = track((t) => (t < 20 ? [0, -5200, 200] : [0, 5200, 200]));
    const ws = buildGoalWindows([{ t: 25 }, { t: 5 }], ball);
    expect(ws.map((w) => w.t)).toEqual([5, 25]);
    expect(ws[0].resume).toBeLessThanOrEqual(25);
    expect(ws[0].team).toBe(1);
    expect(ws[1].team).toBe(0);
  });
});

describe("goalFxAt", () => {
  const windows = buildGoalWindows([{ t: 10 }], track(frozen));
  const [goal] = windows;

  it("is null before the goal", () => {
    expect(goalFxAt(windows, 0)).toBeNull();
    expect(goalFxAt(windows, 9.99)).toBeNull();
    expect(goalFxAt([], 5)).toBeNull();
  });

  it("starts exactly at the goal time", () => {
    const fx = goalFxAt(windows, 10);
    expect(fx.goal).toBe(goal);
    expect(fx.age).toBe(0);
    expect(fx.progress).toBe(0);
    expect(fx.ballHidden).toBe(true);
  });

  it("is half way at half the duration", () => {
    const fx = goalFxAt(windows, 10 + FX_DURATION / 2);
    expect(fx.progress).toBeCloseTo(0.5, 8);
    expect(fx.ballHidden).toBe(true);
  });

  it("keeps the ball hidden after the effect, until the resume", () => {
    const fx = goalFxAt(windows, 10 + FX_DURATION + 1);
    expect(fx.age).toBeGreaterThan(FX_DURATION);
    expect(fx.progress).toBe(1);
    expect(fx.ballHidden).toBe(true);
  });

  it("is null after the resume", () => {
    expect(goalFxAt(windows, goal.resume)).toBeNull();
    expect(goalFxAt(windows, 20)).toBeNull();
  });

  it("gives the same output when seeking backwards", () => {
    const first = goalFxAt(windows, 11);
    goalFxAt(windows, 25);
    goalFxAt(windows, 3);
    expect(goalFxAt(windows, 11)).toEqual(first);
  });

  it("keeps progress within [0, 1]", () => {
    for (let t = 0; t < 30; t += 0.05) {
      const fx = goalFxAt(windows, t);
      if (fx) {
        expect(fx.progress).toBeGreaterThanOrEqual(0);
        expect(fx.progress).toBeLessThanOrEqual(1);
      }
    }
  });

  it("lets the last goal win when two goals are close", () => {
    const ball = track((t) => (t < 10 ? [0, 0, 93] : [0, t < 12 ? -5200 : 5200, 200]));
    const ws = buildGoalWindows([{ t: 10 }, { t: 12.4 }], ball);
    expect(goalFxAt(ws, 11).goal.t).toBe(10);
    const fx = goalFxAt(ws, 12.5);
    expect(fx.goal.t).toBe(12.4);
    expect(fx.goal.team).toBe(0);
    expect(fx.age).toBeCloseTo(0.1, 8);
    expect(ws[0].resume).toBeLessThanOrEqual(12.4);
  });
});

describe("particles", () => {
  const origin = { x: 200, y: -5200, z: 300 };

  it("is deterministic for a given seed and differs between seeds", () => {
    const a = makeParticles(50, 7);
    const b = makeParticles(50, 7);
    expect(Array.from(a.dir)).toEqual(Array.from(b.dir));
    expect(Array.from(a.speed)).toEqual(Array.from(b.speed));
    expect(Array.from(makeParticles(50, 8).dir)).not.toEqual(Array.from(a.dir));
  });

  it("makes unit directions with finite speeds", () => {
    const p = makeParticles(200, 41);
    for (let i = 0; i < 200; i++) {
      expect(Math.hypot(p.dir[i * 3], p.dir[i * 3 + 1], p.dir[i * 3 + 2])).toBeCloseTo(1, 5);
      expect(p.speed[i]).toBeGreaterThan(0);
    }
  });

  it("gives the same positions for the same age, with no NaN, without allocating", () => {
    const p = makeParticles(200, 41);
    const out = { x: 0, y: 0, z: 0 };
    for (const age of [0, 0.3, 0.9, FX_DURATION, FX_DURATION + 5]) {
      const first = [];
      for (let i = 0; i < 200; i++) {
        const r = particlePosition(p, i, age, origin, out);
        expect(r).toBe(out);
        expect(Number.isFinite(r.x + r.y + r.z)).toBe(true);
        first.push([r.x, r.y, r.z]);
      }
      for (let i = 0; i < 200; i++) {
        particlePosition(p, i, age, origin, out);
        expect([out.x, out.y, out.z]).toEqual(first[i]);
      }
    }
  });

  it("keeps the same output without the options argument (backward compatible)", () => {
    const p = makeParticles(20, 41);
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    for (const age of [0, 0.5, 1.2, FX_DURATION, FX_DURATION + 3]) {
      for (let i = 0; i < 20; i++) {
        particlePosition(p, i, age, origin, a);
        particlePosition(p, i, age, origin, b, { duration: FX_DURATION, scale: 1, gravity: GRAVITY_DROP });
        expect(b).toEqual(a);
        const d = ease(age) * p.speed[i];
        const t = Math.min(age, FX_DURATION);
        expect(a.x).toBeCloseTo(origin.x + p.dir[i * 3] * d, 4);
        expect(a.z).toBeCloseTo(Math.max(8, origin.z + p.dir[i * 3 + 2] * d - GRAVITY_DROP * t * t), 4);
      }
    }
  });

  it("scales the distance and uses the given duration and gravity", () => {
    const p = makeParticles(10, 3);
    const out = { x: 0, y: 0, z: 0 };
    const high = { x: 0, y: 0, z: 5000 };
    const full = { x: 0, y: 0, z: 0 };
    particlePosition(p, 0, 1, high, full, { duration: 1, gravity: 0 });
    particlePosition(p, 0, 1, high, out, { duration: 1, scale: 0.3, gravity: 0 });
    expect(out.x).toBeCloseTo(high.x + (full.x - high.x) * 0.3, 5);
    expect(out.z).toBeCloseTo(high.z + (full.z - high.z) * 0.3, 5);
    // After `duration` the sparks are at their final distance.
    particlePosition(p, 0, 1, high, full, { duration: 1, gravity: 0 });
    particlePosition(p, 0, 7, high, out, { duration: 1, gravity: 0 });
    expect(out).toEqual(full);
    // Half of a short duration is further than half of the default one.
    particlePosition(p, 0, 0.5, high, out, { duration: 1, gravity: 0 });
    particlePosition(p, 0, 0.5, high, full, { gravity: 0 });
    expect(Math.abs(out.x)).toBeGreaterThan(Math.abs(full.x));
  });

  it("starts at the origin and moves away from it", () => {
    const p = makeParticles(10, 3);
    const out = { x: 0, y: 0, z: 0 };
    particlePosition(p, 0, 0, origin, out);
    expect(out).toEqual(origin);
    particlePosition(p, 0, 1, origin, out);
    expect(Math.hypot(out.x - origin.x, out.y - origin.y, out.z - origin.z)).toBeGreaterThan(100);
  });
});
