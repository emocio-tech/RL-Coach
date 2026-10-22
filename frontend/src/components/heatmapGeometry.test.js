import { describe, expect, it } from "vitest";
import {
  BALL_RAMP,
  BLUE_RAMP,
  FULL_OPACITY_AT,
  HEAT_GAMMA,
  HEAT_IMAGE_SIZE,
  HEAT_RAMPS,
  IMAGE_SCALE,
  FIELD,
  ORANGE_RAMP,
  SCALE_PERCENTILE,
  TEAM_DOTS,
  buildHeatImage,
  dotFor,
  heatColor,
  heatOpacity,
  heatRatio,
  heatRgb,
  heatScale,
  maxCount,
  rampFor,
  rampGradient,
  sampleCubic,
  smoothCounts,
  toRgb,
} from "./heatmapGeometry.js";

const grid = (rows, cols, fill = 0) => Array.from({ length: rows }, () => Array(cols).fill(fill));

describe("toRgb", () => {
  it("formats a colour triplet", () => {
    expect(toRgb([21, 87, 224])).toBe("rgb(21,87,224)");
  });

  it("rounds fractional channels", () => {
    expect(toRgb([20.4, 20.5, 20.6])).toBe("rgb(20,21,21)");
  });
});

describe("heatColor", () => {
  const ramp = [[0, 0, 0], [100, 100, 100], [200, 200, 200]];

  it("returns the first stop at t=0", () => {
    expect(heatColor(ramp, 0)).toBe("rgb(0,0,0)");
  });

  it("returns the middle stop at t=0.5", () => {
    expect(heatColor(ramp, 0.5)).toBe("rgb(100,100,100)");
  });

  it("returns the last stop at t=1", () => {
    expect(heatColor(ramp, 1)).toBe("rgb(200,200,200)");
  });

  it("interpolates inside each half", () => {
    expect(heatColor(ramp, 0.25)).toBe("rgb(50,50,50)");
    expect(heatColor(ramp, 0.75)).toBe("rgb(150,150,150)");
  });

  it("works with the real team and ball ramps", () => {
    expect(heatColor(HEAT_RAMPS[0], 0)).toBe(toRgb(HEAT_RAMPS[0][0]));
    expect(heatColor(BALL_RAMP, 1)).toBe(toRgb(BALL_RAMP[BALL_RAMP.length - 1]));
  });

  it("clamps t outside 0..1 to the end stops", () => {
    expect(heatColor(ramp, -0.5)).toBe("rgb(0,0,0)");
    expect(heatColor(ramp, 3)).toBe("rgb(200,200,200)");
  });

  describe("with 5 stops", () => {
    const five = [[0, 0, 0], [40, 40, 40], [80, 80, 80], [120, 120, 120], [160, 160, 160]];

    it("returns each stop at its evenly spaced position", () => {
      [0, 0.25, 0.5, 0.75, 1].forEach((t, i) => expect(heatColor(five, t)).toBe(toRgb(five[i])));
    });

    it("interpolates inside each segment", () => {
      expect(heatColor(five, 0.125)).toBe("rgb(20,20,20)");
      expect(heatColor(five, 0.625)).toBe("rgb(100,100,100)");
      expect(heatColor(five, 0.875)).toBe("rgb(140,140,140)");
    });
  });
});

describe("BALL_RAMP", () => {
  it("is a thermal ramp: field background, cyan, green, yellow, red", () => {
    expect(BALL_RAMP).toHaveLength(5);
    expect(BALL_RAMP[0]).toEqual([14, 22, 64]); // #0e1640, the field background
    const [, cyan, green, yellow, red] = BALL_RAMP;
    expect(cyan[0]).toBeLessThan(50); // no red: cyan hue
    expect(cyan[1]).toBeGreaterThan(cyan[0] + 80);
    expect(cyan[2]).toBeGreaterThan(cyan[0] + 80);
    expect(Math.abs(cyan[1] - cyan[2])).toBeLessThan(30); // green and blue about level
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(green[1]).toBeGreaterThan(green[2]);
    expect(yellow[0]).toBeGreaterThan(200);
    expect(yellow[1]).toBeGreaterThan(200);
    expect(yellow[2]).toBeLessThan(50);
    expect(red[0]).toBeGreaterThan(200);
    expect(red[1]).toBeLessThan(80);
    expect(red[2]).toBeLessThan(80);
  });

  describe("brightness", () => {
    // Rec. 709 luma of the sRGB channels.
    const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const [background, cyan, green, yellow] = BALL_RAMP;

    it("has a cyan between the background and the green in brightness", () => {
      expect(luma(cyan)).toBeGreaterThan(luma(background));
      expect(luma(cyan)).toBeLessThan(luma(green));
    });

    it("has a cyan about midway between the background and the green", () => {
      const midway = (luma(background) + luma(green)) / 2;

      expect(Math.abs(luma(cyan) - midway)).toBeLessThan(10);
    });

    it("brightens steadily from the background to the yellow", () => {
      expect(luma(background)).toBeLessThan(luma(cyan));
      expect(luma(cyan)).toBeLessThan(luma(green));
      expect(luma(green)).toBeLessThan(luma(yellow));
    });
  });
});

describe("heatOpacity", () => {
  it("starts at 0 for t=0, so the edge of the heat has no step", () => {
    expect(heatOpacity(0)).toBe(0);
  });

  it("is 0 for a negative ratio", () => {
    expect(heatOpacity(-1)).toBe(0);
  });

  it("is fully opaque from FULL_OPACITY_AT on, so the colours stay vivid", () => {
    expect(heatOpacity(FULL_OPACITY_AT)).toBeCloseTo(1);
    expect(heatOpacity(0.5)).toBe(1);
    expect(heatOpacity(1)).toBe(1);
  });

  it("is capped at 1 above 1", () => {
    expect(heatOpacity(5)).toBe(1);
  });

  it("fades in linearly over the coolest cells", () => {
    expect(heatOpacity(FULL_OPACITY_AT * 0.25)).toBeLessThan(heatOpacity(FULL_OPACITY_AT * 0.5));
    expect(heatOpacity(FULL_OPACITY_AT * 0.5)).toBeLessThan(heatOpacity(FULL_OPACITY_AT * 0.75));
    expect(heatOpacity(FULL_OPACITY_AT * 0.75)).toBeLessThan(1);
    expect(heatOpacity(FULL_OPACITY_AT * 0.5)).toBeCloseTo(0.5); // halfway to FULL_OPACITY_AT
    expect(heatOpacity(FULL_OPACITY_AT * 0.25)).toBeCloseTo(0.25);
  });

  it("stays within [0, 1] over 0..1", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(heatOpacity(t)).toBeGreaterThanOrEqual(0);
      expect(heatOpacity(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe("rampFor", () => {
  it("returns the blue ramp for team 0", () => {
    expect(rampFor(0)).toBe(HEAT_RAMPS[0]);
  });

  it("returns the orange ramp for team 1", () => {
    expect(rampFor(1)).toBe(HEAT_RAMPS[1]);
  });

  it("returns the ball ramp for the ball variant, whatever the team", () => {
    expect(rampFor(0, "ball")).toBe(BALL_RAMP);
    expect(rampFor(1, "ball")).toBe(BALL_RAMP);
    expect(rampFor(undefined, "ball")).toBe(BALL_RAMP);
  });

  it("falls back to blue for an unknown team", () => {
    expect(rampFor(7)).toBe(HEAT_RAMPS[0]);
    expect(rampFor(undefined)).toBe(HEAT_RAMPS[0]);
    expect(rampFor(null)).toBe(HEAT_RAMPS[0]);
  });

  it("ignores an unknown variant", () => {
    expect(rampFor(1, "other")).toBe(HEAT_RAMPS[1]);
  });
});

describe("team ramps", () => {
  // Hue in degrees, Rec. 709 luma and HSL lightness of a colour.
  const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    if (max === r) return ((g - b) / d + (g < b ? 6 : 0)) * 60;
    if (max === g) return ((b - r) / d + 2) * 60;
    return ((r - g) / d + 4) * 60;
  };
  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const lightness = ([r, g, b]) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  const samples = (ramp, n = 200) => Array.from({ length: n + 1 }, (_, i) => heatRgb(ramp, i / n));

  it("indexes the team ramps by team number: blue then orange", () => {
    expect(HEAT_RAMPS).toEqual([BLUE_RAMP, ORANGE_RAMP]);
  });

  it("starts every ramp from the field background", () => {
    expect(BLUE_RAMP[0]).toEqual(BALL_RAMP[0]);
    expect(ORANGE_RAMP[0]).toEqual(BALL_RAMP[0]);
  });

  it("keeps all channels within 0..255", () => {
    for (const ramp of [BLUE_RAMP, ORANGE_RAMP]) {
      for (const stop of ramp) for (const v of stop) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  describe("blue", () => {
    it("brightens at every stop, from the dark blue of the field to a luminous colour", () => {
      for (let i = 1; i < BLUE_RAMP.length; i += 1) expect(luma(BLUE_RAMP[i])).toBeGreaterThan(luma(BLUE_RAMP[i - 1]));
      expect(luma(BLUE_RAMP[BLUE_RAMP.length - 1])).toBeGreaterThan(200);
    });

    it("keeps brightening along the whole ramp, not just at the stops", () => {
      const lumas = samples(BLUE_RAMP).map(luma);

      for (let i = 1; i < lumas.length; i += 1) expect(lumas[i]).toBeGreaterThanOrEqual(lumas[i - 1] - 1e-9);
    });

    it("warms up as it brightens: the hue goes down from blue to turquoise green", () => {
      const hues = BLUE_RAMP.map(hueOf);

      for (let i = 1; i < hues.length; i += 1) expect(hues[i]).toBeLessThan(hues[i - 1]);
      expect(hues[1]).toBeGreaterThan(210); // the first coloured stop is blue
      expect(hues[hues.length - 1]).toBeGreaterThan(130); // the last one is a turquoise green
      expect(hues[hues.length - 1]).toBeLessThan(170);
    });

    it("warms up continuously: the hue never goes back up along the ramp", () => {
      const hues = samples(BLUE_RAMP).map(hueOf);

      for (let i = 1; i < hues.length; i += 1) expect(hues[i]).toBeLessThanOrEqual(hues[i - 1] + 1);
    });

    it("ends on a green-leaning turquoise: more green than blue, no red", () => {
      const [r, g, b] = BLUE_RAMP[BLUE_RAMP.length - 1];

      expect(g).toBeGreaterThan(b);
      expect(g).toBeGreaterThan(r + 100);
      expect(b).toBeGreaterThan(r); // still turquoise, not a plain green
    });
  });

  describe("orange", () => {
    const last = ORANGE_RAMP.length - 1;
    // Hue unwrapped so that the reds either side of 0 degrees line up: 344 degrees reads as -16.
    const warmHue = (stop) => {
      const h = hueOf(stop);
      return h > 300 ? h - 360 : h;
    };
    const [, darkRed, red, , orange, , yellowOrange] = ORANGE_RAMP;

    it("starts from a dark brownish red leaning slightly to purple, right after the field background", () => {
      // brownish: not very saturated and dark; leaning to purple: a hue a little past red, towards magenta
      expect(luma(darkRed)).toBeLessThan(60);
      expect(luma(darkRed)).toBeGreaterThan(luma(ORANGE_RAMP[0]));
      expect(hueOf(darkRed)).toBeGreaterThan(335);
      expect(hueOf(darkRed)).toBeLessThan(358);
      expect(darkRed[0]).toBeGreaterThan(darkRed[2]); // still red before purple: more red than blue
      expect(darkRed[2]).toBeGreaterThan(darkRed[1]); // the blue that tints it towards purple
    });

    it("brightens at every stop, from the field background to a vivid colour", () => {
      for (let i = 1; i < ORANGE_RAMP.length; i += 1) expect(luma(ORANGE_RAMP[i])).toBeGreaterThan(luma(ORANGE_RAMP[i - 1]));
      expect(luma(ORANGE_RAMP[last])).toBeGreaterThan(190);
    });

    it("keeps brightening along the whole ramp, not just at the stops", () => {
      const lumas = samples(ORANGE_RAMP).map(luma);

      for (let i = 1; i < lumas.length; i += 1) expect(lumas[i]).toBeGreaterThanOrEqual(lumas[i - 1] - 1e-9);
    });

    it("brightens at every stop in HSL lightness too", () => {
      for (let i = 1; i < ORANGE_RAMP.length; i += 1) {
        expect(lightness(ORANGE_RAMP[i])).toBeGreaterThan(lightness(ORANGE_RAMP[i - 1]));
      }
    });

    it("warms up as it brightens: the hue goes from the dark red through red and orange up to a yellow-orange", () => {
      const hues = ORANGE_RAMP.slice(1).map(warmHue);

      for (let i = 1; i < hues.length; i += 1) expect(hues[i]).toBeGreaterThan(hues[i - 1]);
      expect(Math.abs(warmHue(red))).toBeLessThan(12); // a red
      expect(hueOf(orange)).toBeGreaterThan(12); // an orange
      expect(hueOf(orange)).toBeLessThan(28);
      expect(hueOf(yellowOrange)).toBeGreaterThan(38); // a yellow-orange
      expect(hueOf(yellowOrange)).toBeLessThan(52);
    });

    it("warms up continuously: the hue never goes back down along the ramp", () => {
      // from the dark red on (the first segment crosses from the blue-ish field background through purple)
      const hues = samples(ORANGE_RAMP, 400).slice(Math.ceil(400 / last)).map(warmHue);

      for (let i = 1; i < hues.length; i += 1) expect(hues[i]).toBeGreaterThanOrEqual(hues[i - 1] - 1);
    });

    it("has no green anywhere, so it cannot turn olive: no hue between yellow and blue along the ramp", () => {
      for (const colour of samples(ORANGE_RAMP, 400).slice(Math.ceil(400 / last))) {
        const hue = hueOf(colour);
        expect(hue < 60 || hue > 300).toBe(true);
      }
    });

    it("ends on a vivid yellow-orange: red at the top, green high, blue low, saturated", () => {
      const [r, g, b] = ORANGE_RAMP[last];

      expect(r).toBeGreaterThan(240);
      expect(g).toBeGreaterThan(180);
      expect(b).toBeLessThan(80);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(180);
    });

    it("has the same shape as the blue ramp: a brightening, warming ramp from the field background", () => {
      expect(ORANGE_RAMP[0]).toEqual(BLUE_RAMP[0]);
      expect(Math.abs(ORANGE_RAMP.length - BLUE_RAMP.length)).toBeLessThanOrEqual(1);
      expect(luma(ORANGE_RAMP[last])).toBeGreaterThan(190); // both end on a bright colour
      expect(luma(BLUE_RAMP[BLUE_RAMP.length - 1])).toBeGreaterThan(190);
    });
  });

  it("makes the legend gradient multicolour for each team", () => {
    for (const ramp of HEAT_RAMPS) expect(rampGradient(ramp).split("rgb(")).toHaveLength(ramp.length + 1);
  });
});

describe("dotFor", () => {
  it("returns the dot colour of each team", () => {
    expect(dotFor(0)).toBe(TEAM_DOTS[0]);
    expect(dotFor(1)).toBe(TEAM_DOTS[1]);
  });

  it("falls back to blue for an unknown team", () => {
    expect(dotFor(3)).toBe(TEAM_DOTS[0]);
    expect(dotFor(undefined)).toBe(TEAM_DOTS[0]);
  });
});

describe("rampGradient", () => {
  it("builds a 3-stop CSS gradient", () => {
    expect(rampGradient([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(
      "linear-gradient(90deg, rgb(1,2,3), rgb(4,5,6), rgb(7,8,9))"
    );
  });

  it("builds one CSS stop per ramp stop, whatever their number", () => {
    expect(rampGradient(BALL_RAMP)).toBe(`linear-gradient(90deg, ${BALL_RAMP.map(toRgb).join(", ")})`);
    expect(rampGradient(BALL_RAMP).split("rgb(")).toHaveLength(BALL_RAMP.length + 1);
  });
});

describe("smoothCounts", () => {
  const total = (g) => g.flat().reduce((a, b) => a + b, 0);

  it("spreads a single hot cell over its neighbours, symmetrically", () => {
    const counts = grid(9, 9);
    counts[4][4] = 100;
    const smooth = smoothCounts(counts, 1);

    expect(smooth[4][4]).toBeLessThan(100);
    expect(smooth[4][4]).toBeGreaterThan(smooth[4][5]);
    expect(smooth[4][5]).toBeGreaterThan(smooth[4][6]);
    expect(smooth[4][5]).toBeGreaterThan(0);
    expect(smooth[4][3]).toBeCloseTo(smooth[4][5]);
    expect(smooth[3][4]).toBeCloseTo(smooth[5][4]);
    expect(smooth[3][4]).toBeCloseTo(smooth[4][3]);
  });

  it("keeps a flat grid flat, edges included (the kernel is renormalised at the border)", () => {
    const smooth = smoothCounts(grid(6, 8, 5), 1.2);

    for (const value of smooth.flat()) expect(value).toBeCloseTo(5);
  });

  it("does not mutate its input and returns a grid of the same size", () => {
    const counts = grid(4, 5);
    counts[1][2] = 9;
    const copy = counts.map((row) => [...row]);
    const smooth = smoothCounts(counts);

    expect(counts).toEqual(copy);
    expect(smooth).toHaveLength(4);
    expect(smooth[0]).toHaveLength(5);
  });

  it("returns an unchanged copy when sigma is 0", () => {
    const counts = [[1, 2], [3, 4]];
    const smooth = smoothCounts(counts, 0);

    expect(smooth).toEqual(counts);
    expect(smooth).not.toBe(counts);
  });

  it("handles an empty grid", () => {
    expect(smoothCounts([])).toEqual([]);
  });

  it("makes neighbouring sparse cells close: no isolated spikes", () => {
    const counts = [[0, 9, 0, 9, 0, 9, 0, 9]];
    const smooth = smoothCounts(counts, 1.2)[0];
    const spread = (a) => Math.max(...a) - Math.min(...a);

    expect(spread(smooth)).toBeLessThan(spread(counts[0]) / 2);
  });

  it("has a lower peak and a wider footprint than the raw counts", () => {
    const counts = grid(9, 9);
    counts[4][4] = 10;
    const smooth = smoothCounts(counts, 1);

    expect(Math.max(...smooth.flat())).toBeLessThan(10);
    expect(smooth.flat().filter((v) => v > 0.01).length).toBeGreaterThan(1);
    expect(total(smooth)).toBeGreaterThan(0);
  });
});

describe("maxCount", () => {
  it("returns the highest count", () => {
    expect(maxCount([[1, 5], [3, 2]])).toBe(5);
  });

  it("returns 0 for a grid of zeros", () => {
    expect(maxCount(grid(3, 4))).toBe(0);
  });

  it("returns 0 for an empty grid", () => {
    expect(maxCount([])).toBe(0);
  });

  it("handles a single cell", () => {
    expect(maxCount([[7]])).toBe(7);
  });
});

describe("heatScale", () => {
  it("returns 0 for a grid of zeros or an empty grid", () => {
    expect(heatScale(grid(3, 4))).toBe(0);
    expect(heatScale([])).toBe(0);
  });

  it("returns the single non-empty count", () => {
    expect(heatScale([[0, 7], [0, 0]])).toBe(7);
  });

  it("ignores empty cells: they do not pull the percentile down", () => {
    const counts = grid(20, 26);
    counts[0][0] = 4;
    counts[0][1] = 8;

    expect(heatScale(counts)).toBe(8);
  });

  it("is the SCALE_PERCENTILE of the non-empty cells: an outlier does not set the scale", () => {
    // 100 non-empty cells: 1..99 and one outlier at 500.
    const counts = [Array.from({ length: 99 }, (_, i) => i + 1).concat(500)];
    const scale = heatScale(counts);

    expect(scale).toBeLessThan(500);
    expect(scale).toBeGreaterThanOrEqual(Math.floor(SCALE_PERCENTILE * 100) - 1); // 97 or so, not the median
    expect(scale).toBeLessThanOrEqual(99);
  });

  it("equals the max when there are too few non-empty cells for the percentile to drop below it", () => {
    // 40 cells: ceil(SCALE_PERCENTILE * 40) = 40, the last one.
    const counts = [Array.from({ length: 39 }, (_, i) => i + 1).concat(1000)];

    expect(heatScale(counts)).toBe(1000);
    expect(heatScale([[1, 2, 3, 100]])).toBe(100);
  });
});

describe("heatRatio", () => {
  it("is 0 for no heat, and has no floor: any positive value gives a positive ratio", () => {
    expect(heatRatio(0, 10)).toBe(0);
    expect(heatRatio(-1, 10)).toBe(0);
    expect(heatRatio(0.01, 10)).toBeGreaterThan(0);
    expect(heatRatio(1e-6, 10)).toBeGreaterThan(0);
  });

  it("is 1 from the scale on", () => {
    expect(heatRatio(10, 10)).toBe(1);
    expect(heatRatio(50, 10)).toBe(1);
  });

  it("rises as a power of HEAT_GAMMA, straight from 0 to the scale", () => {
    expect(heatRatio(6, 10)).toBeCloseTo(0.6 ** HEAT_GAMMA); // 60 % of the scale
    expect(heatRatio(2, 10)).toBeCloseTo(0.2 ** HEAT_GAMMA);
  });

  it("drops faster than linear: a half-scale value sits in the cold half of the ramp, not mid-way", () => {
    expect(heatRatio(5, 10)).toBeLessThan(0.5);
    expect(heatRatio(5, 10)).toBeGreaterThan(0);
  });

  it("keeps a faint but real trace visible: a quarter of the scale is not flattened to the background", () => {
    // A path the ball followed once holds a few samples per cell, around a quarter of the scale. Its ratio must be
    // enough to leave the background clearly (with a power of 2.5 it was 0.03, and such paths looked cut).
    expect(heatRatio(2.5, 10)).toBeGreaterThan(0.05);
    expect(heatRatio(2.5, 10)).toBeLessThan(0.25); // still colder than the mid-ramp: busy zones keep standing out
  });

  it("is increasing", () => {
    let previous = -1;
    for (let value = 0; value <= 12; value += 0.5) {
      const ratio = heatRatio(value, 10);
      expect(ratio).toBeGreaterThanOrEqual(previous);
      previous = ratio;
    }
  });

  it("is 0 when the scale is 0, negative or not a number", () => {
    expect(heatRatio(5, 0)).toBe(0);
    expect(heatRatio(5, -1)).toBe(0);
    expect(heatRatio(5, NaN)).toBe(0);
  });

  it("is 0 when the value is not a number", () => {
    expect(heatRatio(NaN, 10)).toBe(0);
    expect(heatRatio(undefined, 10)).toBe(0);
  });
});

describe("heatRgb", () => {
  const ramp = [[0, 0, 0], [100, 100, 100], [200, 200, 200]];

  it("returns the interpolated channels, unrounded", () => {
    expect(heatRgb(ramp, 0.25)).toEqual([50, 50, 50]);
    expect(heatRgb([[0, 0, 0], [1, 1, 1]], 0.5)).toEqual([0.5, 0.5, 0.5]);
  });

  it("matches heatColor", () => {
    for (const t of [0, 0.1, 0.5, 0.9, 1]) expect(heatColor(ramp, t)).toBe(toRgb(heatRgb(ramp, t)));
  });
});

describe("sampleCubic", () => {
  const g = [[1, 2, 3], [4, 5, 6]];

  it("returns the cell value at a cell centre", () => {
    expect(sampleCubic(g, 0, 0)).toBeCloseTo(1);
    expect(sampleCubic(g, 1, 2)).toBeCloseTo(6);
    expect(sampleCubic(g, 1, 1)).toBeCloseTo(5);
  });

  it("keeps a constant grid constant everywhere", () => {
    for (const [r, c] of [[0, 0], [0.3, 1.7], [2.5, 3.5], [-1, 9]]) expect(sampleCubic(grid(4, 5, 7), r, c)).toBeCloseTo(7);
  });

  it("reproduces a linear ramp exactly between cell centres", () => {
    const row = [[0, 1, 2, 3, 4]];

    expect(sampleCubic(row, 0, 1.5)).toBeCloseTo(1.5);
    expect(sampleCubic(row, 0, 2.25)).toBeCloseTo(2.25);
  });

  it("is monotonic along a ramp: no steps, no ripples", () => {
    const row = [[0, 1, 4, 9, 16, 25]];
    let previous = -Infinity;
    for (let c = 0; c <= 5; c += 0.05) {
      const value = sampleCubic(row, 0, c);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });

  it("interpolates along the rows too", () => {
    expect(sampleCubic([[0], [10]], 0.5, 0)).toBeCloseTo(5);
  });

  it("replicates the edges beyond the grid", () => {
    expect(sampleCubic(g, -5, -5)).toBeCloseTo(1);
    expect(sampleCubic(g, 9, 9)).toBeCloseTo(6);
  });

  it("never goes below 0, even right next to a sharp peak", () => {
    const peak = [[0, 0, 0, 10, 0, 0, 0]];
    for (let c = -1; c <= 7; c += 0.05) expect(sampleCubic(peak, 0, c)).toBeGreaterThanOrEqual(0);
  });

  it("handles a single cell", () => {
    expect(sampleCubic([[5]], 0, 0)).toBeCloseTo(5);
    expect(sampleCubic([[5]], 0.4, -0.4)).toBeCloseTo(5);
  });
});

describe("buildHeatImage", () => {
  const ramp = HEAT_RAMPS[0];
  const W = 52;
  const H = 40;
  const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
  const pixel = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
  // pixel at the centre of cell (row, col) of a 20 x 26 grid drawn on W x H
  const at = (row, col) => [Math.round(((col + 0.5) / 26) * W - 0.5), Math.round(((row + 0.5) / 20) * H - 0.5)];

  it("has the size of the field image by default, RGBA", () => {
    const image = buildHeatImage(grid(20, 26, 1), ramp);

    expect(image.width).toBe(HEAT_IMAGE_SIZE.width);
    expect(image.height).toBe(HEAT_IMAGE_SIZE.height);
    expect(image.data).toHaveLength(HEAT_IMAGE_SIZE.width * HEAT_IMAGE_SIZE.height * 4);
    expect(HEAT_IMAGE_SIZE).toEqual({ width: Math.round(FIELD.w * IMAGE_SCALE), height: Math.round(FIELD.h * IMAGE_SCALE) });
  });

  it("honours a given size", () => {
    const image = buildHeatImage(grid(20, 26, 1), ramp, W, H);

    expect(image.data).toHaveLength(W * H * 4);
  });

  it("is fully transparent, with max 0 and scale 0, when every count is zero", () => {
    const image = buildHeatImage(grid(20, 26), ramp, W, H);

    expect(image.max).toBe(0);
    expect(image.scale).toBe(0);
    expect(image.data.every((byte) => byte === 0)).toBe(true);
  });

  it("is transparent for an empty grid", () => {
    const image = buildHeatImage([], ramp, W, H);

    expect(image.max).toBe(0);
    expect(image.data.every((byte) => byte === 0)).toBe(true);
  });

  it("draws an opaque hot spot at the hot cell and nothing far away", () => {
    const counts = grid(20, 26);
    counts[3][4] = 10;
    const image = buildHeatImage(counts, ramp, W, H);
    const [x, y] = at(3, 4);

    expect(image.max).toBe(10);
    expect(alpha(image, x, y)).toBe(255);
    expect(alpha(image, W - 1, H - 1)).toBe(0); // opposite corner
  });

  it("puts columns along x and rows along y", () => {
    const counts = grid(20, 26);
    counts[0][25] = 10; // top right
    const image = buildHeatImage(counts, ramp, W, H);

    expect(alpha(image, W - 1, 0)).toBeGreaterThan(0);
    expect(alpha(image, 0, H - 1)).toBe(0);
    expect(alpha(image, 0, 0)).toBe(0);
    expect(alpha(image, W - 1, H - 1)).toBe(0);
  });

  it("uses the given ramp for the colours", () => {
    const counts = grid(20, 26);
    counts[10][13] = 10;
    const [x, y] = at(10, 13);
    const blue = pixel(buildHeatImage(counts, HEAT_RAMPS[0], W, H), x, y);
    const orange = pixel(buildHeatImage(counts, HEAT_RAMPS[1], W, H), x, y);

    expect(blue.slice(0, 3)).not.toEqual(orange.slice(0, 3));
    expect(blue[2]).toBeGreaterThan(blue[0]); // blue ramp: more blue than red
    expect(orange[0]).toBeGreaterThan(orange[2]); // orange ramp: more red than blue
  });

  it("gives the hottest pixel the top colour of the ramp", () => {
    const counts = grid(20, 26);
    counts[10][13] = 10;
    // One pixel per cell: pixel (13, 10) sits exactly on the centre of cell (10, 13), the smoothed peak, which
    // is the scale (fewer than 50 non-empty cells: the percentile is the max).
    const image = buildHeatImage(counts, BALL_RAMP, 26, 20);
    const [r, g, b] = pixel(image, 13, 10);
    const top = heatRgb(BALL_RAMP, 1);

    expect([r, g, b]).toEqual(top.map((v) => Math.round(v)));
  });

  it("does not let a hot spot colour the quiet zone around it with the middle of the ramp", () => {
    // Busy spot in the middle of a row, nothing within 6 cells: the image far from it must be transparent
    // (or at the cold end), never green or yellow.
    const counts = grid(20, 26);
    counts[10][3] = 50;
    counts[10][4] = 50;
    const image = buildHeatImage(counts, BALL_RAMP, 26 * 4, 20 * 4);
    const [x, y] = [Math.round(((12 + 0.5) / 26) * 26 * 4 - 0.5), Math.round(((10 + 0.5) / 20) * 20 * 4 - 0.5)];

    expect(alpha(image, x, y)).toBe(0);
  });

  it("fades out from the hot spot: opacity decreases moving away along a row", () => {
    const counts = grid(20, 26);
    counts[10][13] = 10;
    const image = buildHeatImage(counts, ramp, 26 * 8, 20 * 8);
    const y = Math.round(((10 + 0.5) / 20) * 20 * 8 - 0.5);
    const cx = Math.round(((13 + 0.5) / 26) * 26 * 8 - 0.5);
    const alphas = [0, 8, 16, 24].map((dx) => alpha(image, cx + dx, y));

    for (let i = 1; i < alphas.length; i += 1) expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1]);
    expect(alphas[0]).toBeGreaterThan(alphas[3]);
  });

  it("gives every pixel the opacity of its heat ratio: transparent at 0, opaque from FULL_OPACITY_AT on", () => {
    const counts = grid(20, 26);
    for (let i = 0; i < 20; i += 1) for (let j = 0; j < 26; j += 1) counts[i][j] = ((i * 7 + j * 3) % 11) + 1;
    const image = buildHeatImage(counts, ramp, W, H);
    const smooth = smoothCounts(counts);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const t = heatRatio(sampleCubic(smooth, ((y + 0.5) / H) * 20 - 0.5, ((x + 0.5) / W) * 26 - 0.5), image.scale);
        if (t <= 0) expect(alpha(image, x, y)).toBe(0);
        else if (t >= FULL_OPACITY_AT) expect(alpha(image, x, y)).toBe(255);
        else expect(Math.abs(alpha(image, x, y) - heatOpacity(t) * 255)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("has no minimum: the faintest heat is drawn, fading in from nothing", () => {
    // A smooth spot: moving away from it the ratio goes down to 0 through very small values, which must show up
    // as small but non-zero opacities, never cut to transparent early.
    const counts = grid(20, 26);
    counts[10][13] = 20;
    counts[10][12] = 10;
    counts[10][14] = 10;
    const image = buildHeatImage(counts, ramp, 26 * 16, 20 * 16);
    const y = Math.round(((10 + 0.5) / 20) * 20 * 16 - 0.5);
    const alphas = [];
    for (let x = 0; x < image.width; x += 1) alphas.push(alpha(image, x, y));

    const faint = alphas.filter((a) => a > 0 && a < 255 * 0.04);
    expect(faint.length).toBeGreaterThan(0); // pixels under 4 % opacity are drawn, nothing cuts them off
    // the heat reaches all the way down to nothing, then stops: the first drawn pixel is almost transparent
    const firstDrawn = alphas.find((a) => a > 0);
    expect(firstDrawn).toBeLessThan(10);
  });

  it("does not let a hot spot flatten the other cells: the scale is a percentile, not the smoothed max", () => {
    // 100 cells at 4 and a spot at 40, ten times busier. Scaling on the smoothed max would leave the 4s at a
    // fraction of the ramp (translucent); on the percentile they are well lit.
    const counts = grid(20, 26);
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 25; j += 1) counts[i][j] = 4;
    counts[10][10] = 40;
    const image = buildHeatImage(counts, ramp, W, H);
    const [x, y] = at(1, 12);

    expect(image.max).toBe(40);
    expect(image.scale).toBeLessThan(Math.max(...smoothCounts(counts).flat()));
    expect(alpha(image, x, y)).toBe(255);
  });

  it("does not mutate the counts", () => {
    const counts = grid(20, 26);
    counts[3][4] = 9;
    const copy = counts.map((row) => [...row]);
    buildHeatImage(counts, ramp, W, H);

    expect(counts).toEqual(copy);
  });
});
