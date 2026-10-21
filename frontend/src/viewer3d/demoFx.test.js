import { describe, expect, it } from "vitest";
import { DEMO_FX_DURATION, DEMO_RESPAWN_FALLBACK, buildDemoWindows, demoFxAt } from "./demoFx.js";

// Raw player track at 5 Hz from t = 0 to 30 s built from a function t -> [x, y, z, speed] | null.
function track(name, sample, end = 30) {
  const out = { name, t: [], x: [], y: [], z: [], speed: [] };
  for (let i = 0; i <= Math.round(end * 5); i++) {
    const t = Math.round(i * 2) / 10;
    const s = sample(t);
    out.t.push(t);
    out.x.push(s ? s[0] : null);
    out.y.push(s ? s[1] : null);
    out.z.push(s ? s[2] : null);
    out.speed.push(s ? s[3] : null);
  }
  return out;
}

// Real shape: driving, impact at 10 s, car frozen with a null speed until 12.6, two empty samples, respawn at 12.8.
const demolished = (t) => {
  if (t < 10) return [100 + t * 10, 200, 17, 1200];
  if (t <= 10.2) return [300, 200, 30, 1100]; // impact sample: still moving
  if (t <= 12.6) return [310, 205, 39, null]; // frozen
  if (t < 13) return null;
  return [-2688, 4605, 17, 900];
};

describe("buildDemoWindows", () => {
  const players = [track("Banshee", demolished)];

  it("anchors the origin on the first sample with a null speed", () => {
    const [w] = buildDemoWindows([{ t: 10, victim: "Banshee" }], players).Banshee;
    expect(w.origin).toEqual({ x: 310, y: 205, z: 39 });
  });

  it("falls back on the nearest known sample when no speed is null", () => {
    const moving = [track("Banshee", (t) => [t * 100, 0, 17, 1000])];
    const [w] = buildDemoWindows([{ t: 10.05, victim: "Banshee" }], moving).Banshee;
    expect(w.origin.x).toBeCloseTo(1000, 5);
    expect(w.resume).toBeCloseTo(10.2, 5);
  });

  it("puts the resume at the first sample back in play after the freeze", () => {
    const [w] = buildDemoWindows([{ t: 10, victim: "Banshee" }], players).Banshee;
    expect(w.resume).toBeCloseTo(13, 5);
  });

  it("falls back on t + 3 s when the data never show the respawn", () => {
    const never = [track("Banshee", (t) => (t < 10 ? [0, 0, 17, 900] : t <= 10.2 ? [5, 5, 17, 900] : [5, 5, 30, null]))];
    const [w] = buildDemoWindows([{ t: 10, victim: "Banshee" }], never).Banshee;
    expect(w.resume).toBe(10 + DEMO_RESPAWN_FALLBACK);
  });

  it("clamps the origin height above the floor", () => {
    const low = [track("Banshee", (t) => [0, 0, 5, t < 10 ? 900 : null])];
    const [w] = buildDemoWindows([{ t: 10, victim: "Banshee" }], low).Banshee;
    expect(w.origin.z).toBe(30);
  });

  it("handles two simultaneous victims independently", () => {
    const other = track("Other", (t) => (t < 10 ? [0, 0, 17, 900] : t <= 11 ? [50, 60, 20, null] : [0, 0, 17, 900]));
    const ws = buildDemoWindows([{ t: 10, victim: "Banshee" }, { t: 10, victim: "Other" }], [...players, other]);
    expect(ws.Banshee[0].origin.x).toBe(310);
    expect(ws.Other[0].origin).toEqual({ x: 50, y: 60, z: 30 });
    expect(ws.Banshee[0].resume).toBeCloseTo(13, 5);
    expect(ws.Other[0].resume).toBeCloseTo(11.2, 5);
    expect(demoFxAt(ws, "Other", 12)).toBeNull();
    expect(demoFxAt(ws, "Banshee", 12).carHidden).toBe(true);
  });

  it("stops the window of a victim at its next demolition", () => {
    const twice = [track("Banshee", (t) => (t < 10 ? [0, 0, 17, 900] : [40, 40, 20, null]), 20)];
    const ws = buildDemoWindows([{ t: 12, victim: "Banshee" }, { t: 10, victim: "Banshee" }], twice).Banshee;
    expect(ws.map((w) => w.t)).toEqual([10, 12]);
    expect(ws[0].resume).toBeLessThanOrEqual(12);
  });

  it("ignores a victim without a usable track", () => {
    expect(buildDemoWindows([{ t: 10, victim: "Nobody" }], players)).toEqual({});
    expect(buildDemoWindows([{ t: 10, victim: "Banshee" }], [track("Banshee", () => null)])).toEqual({});
    expect(buildDemoWindows([{ t: 10, victim: "Banshee" }], undefined)).toEqual({});
    expect(buildDemoWindows(undefined, players)).toEqual({});
  });
});

describe("demoFxAt", () => {
  const windows = buildDemoWindows([{ t: 10, victim: "Banshee" }], [track("Banshee", demolished)]);
  const [demo] = windows.Banshee;

  it("is null before the demolition, for other cars and without windows", () => {
    expect(demoFxAt(windows, "Banshee", 9.99)).toBeNull();
    expect(demoFxAt(windows, "Other", 10.5)).toBeNull();
    expect(demoFxAt({}, "Banshee", 10.5)).toBeNull();
    expect(demoFxAt(undefined, "Banshee", 10.5)).toBeNull();
  });

  it("starts exactly at the demolition time with the car hidden", () => {
    const fx = demoFxAt(windows, "Banshee", 10);
    expect(fx.demo).toBe(demo);
    expect(fx.age).toBe(0);
    expect(fx.progress).toBe(0);
    expect(fx.carHidden).toBe(true);
  });

  it("keeps the car hidden until the respawn, then shows it", () => {
    expect(demoFxAt(windows, "Banshee", 12.9).carHidden).toBe(true);
    expect(demoFxAt(windows, "Banshee", demo.resume)).toBeNull();
    expect(demoFxAt(windows, "Banshee", 20)).toBeNull();
  });

  it("ends the effect after DEMO_FX_DURATION while the car is still hidden", () => {
    const fx = demoFxAt(windows, "Banshee", 10 + DEMO_FX_DURATION + 0.5);
    expect(fx.age).toBeGreaterThan(DEMO_FX_DURATION);
    expect(fx.progress).toBe(1);
    expect(fx.carHidden).toBe(true);
  });

  it("is half way at half the duration", () => {
    expect(demoFxAt(windows, "Banshee", 10 + DEMO_FX_DURATION / 2).progress).toBeCloseTo(0.5, 8);
  });

  it("gives the same output whatever the order of the calls (seek backwards)", () => {
    const first = demoFxAt(windows, "Banshee", 10.6);
    demoFxAt(windows, "Banshee", 25);
    demoFxAt(windows, "Banshee", 3);
    expect(demoFxAt(windows, "Banshee", 10.6)).toEqual(first);
  });

  it("keeps progress within [0, 1]", () => {
    for (let t = 0; t < 30; t += 0.05) {
      const fx = demoFxAt(windows, "Banshee", t);
      if (fx) {
        expect(fx.progress).toBeGreaterThanOrEqual(0);
        expect(fx.progress).toBeLessThanOrEqual(1);
      }
    }
  });
});
