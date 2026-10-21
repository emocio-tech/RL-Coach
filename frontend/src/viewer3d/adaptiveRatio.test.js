import { describe, expect, it } from "vitest";
import { createRatioController } from "./adaptiveRatio.js";

// Pushes `n` frames of `ms` and returns the non-null results.
function feed(controller, n, ms) {
  const changes = [];
  for (let i = 0; i < n; i++) {
    const r = controller.push(ms);
    if (r !== null) changes.push(r);
  }
  return changes;
}

const WARMUP = 30;
const WINDOW = 90;

describe("createRatioController", () => {
  it("starts at the first step capped by maxRatio", () => {
    expect(createRatioController({ maxRatio: 2 }).ratio).toBe(2);
    expect(createRatioController({ maxRatio: 1.5 }).ratio).toBe(1.5);
    expect(createRatioController({ maxRatio: 1 }).ratio).toBe(1);
  });

  it("does not change while the average stays under the threshold", () => {
    const c = createRatioController({ maxRatio: 2 });
    expect(feed(c, 1000, 16.7)).toEqual([]);
    expect(c.ratio).toBe(2);
  });

  it("does not change when the average is exactly the threshold", () => {
    const c = createRatioController({ maxRatio: 2 });
    expect(feed(c, 1000, 28)).toEqual([]);
  });

  it("goes from 2 to 1.5 after a slow window", () => {
    const c = createRatioController({ maxRatio: 2 });
    expect(feed(c, WARMUP + WINDOW - 1, 40)).toEqual([]);
    expect(c.push(40)).toBe(1.5);
    expect(c.ratio).toBe(1.5);
  });

  it("uses the average of the window, not a single frame", () => {
    const c = createRatioController({ maxRatio: 2 });
    feed(c, WARMUP, 16);
    // 89 frames at 16 ms and one at 200 ms: average ~18 ms.
    feed(c, WINDOW - 1, 16);
    expect(c.push(200)).toBeNull();
    expect(c.ratio).toBe(2);
  });

  it("steps down successively to 1 then stops", () => {
    const c = createRatioController({ maxRatio: 2 });
    const changes = feed(c, WARMUP + WINDOW * 10, 40);
    expect(changes).toEqual([1.5, 1.25, 1]);
    expect(c.ratio).toBe(1);
  });

  it("ignores the warm-up frames", () => {
    const c = createRatioController({ maxRatio: 2 });
    feed(c, WARMUP, 200);
    // The window then only sees fast frames.
    expect(feed(c, WINDOW * 3, 16)).toEqual([]);
    expect(c.ratio).toBe(2);
  });

  it("ignores frames longer than 250 ms", () => {
    const c = createRatioController({ maxRatio: 2 });
    feed(c, WARMUP, 16);
    expect(feed(c, 500, 251)).toEqual([]);
    expect(feed(c, 500, 5000)).toEqual([]);
    expect(c.ratio).toBe(2);
    // They do not count in the window either: it still takes 90 valid frames.
    expect(feed(c, WINDOW - 1, 40)).toEqual([]);
    expect(c.push(40)).toBe(1.5);
  });

  it("accepts a frame of exactly 250 ms", () => {
    const c = createRatioController({ maxRatio: 2, windowFrames: 2, warmupFrames: 0 });
    expect(c.push(250)).toBeNull();
    expect(c.push(250)).toBe(1.5);
  });

  it("ignores non finite values", () => {
    const c = createRatioController({ maxRatio: 2 });
    feed(c, WARMUP, 16);
    expect(feed(c, 300, NaN)).toEqual([]);
    expect(feed(c, 300, Infinity)).toEqual([]);
    expect(feed(c, 300, undefined)).toEqual([]);
    expect(c.ratio).toBe(2);
    expect(feed(c, WINDOW, 40)).toEqual([1.5]);
  });

  it("never goes back up after fast frames", () => {
    const c = createRatioController({ maxRatio: 2 });
    feed(c, WARMUP + WINDOW, 40);
    expect(c.ratio).toBe(1.5);
    expect(feed(c, 2000, 5)).toEqual([]);
    expect(c.ratio).toBe(1.5);
  });

  it("never changes on a standard screen (maxRatio 1)", () => {
    const c = createRatioController({ maxRatio: 1 });
    expect(feed(c, 2000, 100)).toEqual([]);
    expect(c.ratio).toBe(1);
  });

  it("starts at 1.5 with maxRatio 1.5 and goes down to 1.25 then 1", () => {
    const c = createRatioController({ maxRatio: 1.5 });
    expect(c.ratio).toBe(1.5);
    expect(feed(c, WARMUP + WINDOW * 5, 40)).toEqual([1.25, 1]);
  });

  it("never goes below 1", () => {
    const c = createRatioController({ maxRatio: 2, steps: [2, 1.5, 0.75] });
    expect(feed(c, WARMUP + WINDOW * 10, 40)).toEqual([1.5]);
    expect(c.ratio).toBe(1.5);
  });

  it("reset forgets the current window but keeps the warm-up and the ratio", () => {
    const c = createRatioController({ maxRatio: 2 });
    feed(c, WARMUP + WINDOW - 1, 40);
    c.reset();
    expect(c.push(40)).toBeNull(); // the window restarts from zero
    expect(feed(c, WINDOW - 2, 40)).toEqual([]);
    expect(c.push(40)).toBe(1.5);
  });
});
