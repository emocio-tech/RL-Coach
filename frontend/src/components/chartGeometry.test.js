import { describe, expect, it } from "vitest";
import {
  AMP,
  BASE,
  FIELD_HALF_LENGTH,
  MID,
  TOP,
  X0,
  X1,
  areaPath,
  distancePaths,
  distanceScale,
  distanceY,
  fillGaps,
  lineSegments,
  positionY,
  timeTicks,
  xAt,
} from "./chartGeometry.js";

describe("fillGaps", () => {
  it("returns the same values when nothing is missing", () => {
    expect(fillGaps([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("fills holes with the last known value", () => {
    expect(fillGaps([5, null, null, 7, null])).toEqual([5, 5, 5, 7, 7]);
  });

  it("replaces leading nulls by 0", () => {
    expect(fillGaps([null, null, 4])).toEqual([0, 0, 4]);
  });

  it("keeps a real 0 instead of treating it as missing", () => {
    expect(fillGaps([3, 0, null])).toEqual([3, 0, 0]);
  });

  it("treats undefined like null", () => {
    expect(fillGaps([2, undefined])).toEqual([2, 2]);
  });

  it("returns an empty array for an empty input", () => {
    expect(fillGaps([])).toEqual([]);
  });

  it("returns only zeros when everything is null", () => {
    expect(fillGaps([null, null])).toEqual([0, 0]);
  });

  it("does not mutate its input", () => {
    const input = [null, 1];
    fillGaps(input);
    expect(input).toEqual([null, 1]);
  });
});

describe("xAt", () => {
  it("maps the first sample to X0", () => {
    expect(xAt(0, 5)).toBe(X0);
  });

  it("maps the last sample to X1", () => {
    expect(xAt(4, 5)).toBe(X1);
  });

  it("maps the middle sample to the middle of the range", () => {
    expect(xAt(1, 3)).toBe((X0 + X1) / 2);
  });

  it("returns X0 when there is a single sample", () => {
    expect(xAt(0, 1)).toBe(X0);
  });

  it("returns X0 when there is no sample", () => {
    expect(xAt(0, 0)).toBe(X0);
  });

  it("handles two samples as the two bounds", () => {
    expect(xAt(0, 2)).toBe(X0);
    expect(xAt(1, 2)).toBe(X1);
  });
});

describe("positionY", () => {
  it("puts y = 0 on the median line", () => {
    expect(positionY(0)).toBe(MID);
  });

  it("puts negative y (blue side) at the top", () => {
    expect(positionY(-FIELD_HALF_LENGTH)).toBe(MID - AMP);
    expect(positionY(-FIELD_HALF_LENGTH)).toBe(TOP);
    expect(positionY(-2560)).toBeLessThan(MID);
  });

  it("puts positive y (orange side) at the bottom", () => {
    expect(positionY(FIELD_HALF_LENGTH)).toBe(MID + AMP);
    expect(positionY(2560)).toBeGreaterThan(MID);
  });

  it("is linear between the median line and the goal", () => {
    expect(positionY(2560)).toBe(142);
    expect(positionY(-2560)).toBe(58);
  });

  it("clamps values beyond the goal lines to +-5120", () => {
    expect(positionY(10000)).toBe(positionY(FIELD_HALF_LENGTH));
    expect(positionY(-10000)).toBe(positionY(-FIELD_HALF_LENGTH));
  });

  it("does not clamp values just inside the bounds", () => {
    expect(positionY(5119)).toBeLessThan(positionY(FIELD_HALF_LENGTH));
    expect(positionY(-5119)).toBeGreaterThan(positionY(-FIELD_HALF_LENGTH));
  });
});

describe("areaPath", () => {
  const blue = (v) => Math.min(v, 0);
  const orange = (v) => Math.max(v, 0);

  it("builds a closed path starting and ending on the median line", () => {
    const path = areaPath([0, 0, 0], blue);

    expect(path.startsWith(`M${X0},${MID} L`)).toBe(true);
    expect(path.endsWith(`L${X1},${MID} Z`)).toBe(true);
  });

  it("lists one point per value, with x spread over the chart", () => {
    expect(areaPath([-2560, -2560], blue)).toBe("M96,100 L96.0,58.0 L984.0,58.0 L984,100 Z");
  });

  it("keeps only the blue (negative) side with Math.min", () => {
    // 2560 is flattened to 0 -> median line; -2560 stays above it.
    expect(areaPath([-2560, 2560], blue)).toBe("M96,100 L96.0,58.0 L984.0,100.0 L984,100 Z");
  });

  it("keeps only the orange (positive) side with Math.max", () => {
    expect(areaPath([-2560, 2560], orange)).toBe("M96,100 L96.0,100.0 L984.0,142.0 L984,100 Z");
  });

  it("clamps out-of-field values", () => {
    expect(areaPath([99999, 99999], orange)).toBe("M96,100 L96.0,184.0 L984.0,184.0 L984,100 Z");
  });

  it("still returns a closed path for an empty series", () => {
    const path = areaPath([], blue);

    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});

describe("lineSegments", () => {
  it("returns a single polyline when there is no hole", () => {
    expect(lineSegments([0, 2560, 0])).toEqual(["96.0,100.0 540.0,142.0 984.0,100.0"]);
  });

  it("splits the line at null values", () => {
    expect(lineSegments([0, 0, null, 0, 0])).toEqual([
      "96.0,100.0 318.0,100.0",
      "762.0,100.0 984.0,100.0",
    ]);
  });

  it("ignores runs made of a single point", () => {
    // index 1 is isolated between two nulls, indices 2-3 form the only real run
    expect(lineSegments([null, 0, null, 0, 0])).toEqual(["762.0,100.0 984.0,100.0"]);
  });

  it("returns [] when the only runs are single points", () => {
    expect(lineSegments([0, null, 0, null, 0])).toEqual([]);
  });

  it("returns [] when every value is null", () => {
    expect(lineSegments([null, null, null])).toEqual([]);
  });

  it("returns [] for an empty series", () => {
    expect(lineSegments([])).toEqual([]);
  });

  it("returns [] for a single sample", () => {
    expect(lineSegments([100])).toEqual([]);
  });

  it("handles leading and trailing nulls", () => {
    expect(lineSegments([null, 0, 0, null])).toEqual(["392.0,100.0 688.0,100.0"]);
  });
});

describe("timeTicks", () => {
  it("returns one tick per whole minute, labelled m:00", () => {
    // 121 samples at 1 s = 120 s
    expect(timeTicks(121, 1).map((t) => t.label)).toEqual(["0:00", "1:00", "2:00"]);
  });

  it("anchors the first tick at start, the last at end and the others in the middle", () => {
    expect(timeTicks(121, 1).map((t) => t.anchor)).toEqual(["start", "middle", "end"]);
  });

  it("places ticks proportionally between X0 and X1", () => {
    const xs = timeTicks(121, 1).map((t) => t.x);

    expect(xs[0]).toBe(X0);
    expect(xs[1]).toBeCloseTo((X0 + X1) / 2);
    expect(xs[2]).toBeCloseTo(X1);
  });

  it("does not add a tick for an incomplete last minute", () => {
    const ticks = timeTicks(91, 1); // 90 s

    expect(ticks.map((t) => t.label)).toEqual(["0:00", "1:00"]);
    expect(ticks[1].anchor).toBe("middle");
    expect(ticks[1].x).toBeLessThan(X1);
  });

  it("includes the tick falling exactly on the end of the match", () => {
    const ticks = timeTicks(61, 1); // 60 s

    expect(ticks.map((t) => t.label)).toEqual(["0:00", "1:00"]);
    expect(ticks[1].anchor).toBe("end");
  });

  it("returns only the 0:00 tick for a match shorter than a minute", () => {
    expect(timeTicks(31, 1).map((t) => t.label)).toEqual(["0:00"]);
  });

  it("uses the sample period to compute the duration", () => {
    expect(timeTicks(61, 2).map((t) => t.label)).toEqual(["0:00", "1:00", "2:00"]);
  });

  it("supports labels beyond 9 minutes", () => {
    expect(timeTicks(601, 1).map((t) => t.label).at(-1)).toBe("10:00");
  });

  it("returns [] with fewer than two samples", () => {
    expect(timeTicks(1, 1)).toEqual([]);
    expect(timeTicks(0, 1)).toEqual([]);
  });

  it("returns [] when the duration is zero or negative", () => {
    expect(timeTicks(10, 0)).toEqual([]);
    expect(timeTicks(10, -1)).toEqual([]);
  });

  it("returns [] when the sample period is not a number", () => {
    expect(timeTicks(10, undefined)).toEqual([]);
    expect(timeTicks(10, null)).toEqual([]);
  });
});

describe("distanceY", () => {
  it("maps 0 to the baseline", () => {
    expect(distanceY(0, 2000)).toBe(BASE);
  });

  it("maps the max to the top", () => {
    expect(distanceY(2000, 2000)).toBe(TOP);
  });

  it("maps half the max to the middle of the plot", () => {
    expect(distanceY(1000, 2000)).toBe((BASE + TOP) / 2);
  });
});

describe("distanceScale", () => {
  it("rounds the max up to the next multiple of 1000", () => {
    expect(distanceScale([0, 1500, 900]).max).toBe(2000);
  });

  it("keeps an exact multiple of 1000 as is", () => {
    expect(distanceScale([3000]).max).toBe(3000);
  });

  it("goes to the next thousand just above a multiple", () => {
    expect(distanceScale([3001]).max).toBe(4000);
    expect(distanceScale([2999]).max).toBe(3000);
  });

  it("never goes below 1000", () => {
    expect(distanceScale([0, 10]).max).toBe(1000);
    expect(distanceScale([0]).max).toBe(1000);
  });

  it("ignores null values", () => {
    expect(distanceScale([null, 2500, null]).max).toBe(3000);
  });

  it("falls back to 1000 when every value is null", () => {
    expect(distanceScale([null, null]).max).toBe(1000);
  });

  it("falls back to 1000 for an empty series", () => {
    expect(distanceScale([]).max).toBe(1000);
  });

  it("returns three ticks at 0, max / 2 and max", () => {
    const { ticks } = distanceScale([0, 2500]);

    expect(ticks.map((t) => t.value)).toEqual([0, 1500, 3000]);
  });

  it("positions the ticks from the baseline to the top", () => {
    const { ticks } = distanceScale([0, 2000]);

    expect(ticks[0].y).toBe(BASE);
    expect(ticks[1].y).toBe((BASE + TOP) / 2);
    expect(ticks[2].y).toBe(TOP);
  });
});

describe("distancePaths", () => {
  it("builds one line and one closed area for a continuous series", () => {
    const { lines, area } = distancePaths([0, 1000, 0], 1000);

    expect(lines).toEqual(["96.0,184.0 540.0,16.0 984.0,184.0"]);
    expect(area).toEqual(["M96.0,184 L96.0,184.0 L540.0,16.0 L984.0,184.0 L984.0,184 Z"]);
  });

  it("interrupts lines and areas at null values", () => {
    const { lines, area } = distancePaths([0, 0, null, 0, 0], 1000);

    expect(lines).toHaveLength(2);
    expect(area).toHaveLength(2);
  });

  it("closes every area on the baseline", () => {
    const { area } = distancePaths([100, 200, null, 300, 400], 1000);

    for (const a of area) {
      expect(a).toMatch(new RegExp(`^M[\\d.]+,${BASE} L`));
      expect(a).toMatch(new RegExp(`L[\\d.]+,${BASE} Z$`));
    }
  });

  it("ignores runs made of a single point", () => {
    const { lines, area } = distancePaths([100, null, 100, 100], 1000);

    expect(lines).toHaveLength(1);
    expect(area).toHaveLength(1);
  });

  it("returns empty lines and areas when every value is null", () => {
    expect(distancePaths([null, null], 1000)).toEqual({ lines: [], area: [] });
  });

  it("returns empty lines and areas for an empty series", () => {
    expect(distancePaths([], 1000)).toEqual({ lines: [], area: [] });
  });

  it("returns empty lines and areas for a single sample", () => {
    expect(distancePaths([500], 1000)).toEqual({ lines: [], area: [] });
  });
});
