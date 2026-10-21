import { describe, expect, it } from "vitest";
import {
  FULL_VIEW,
  MIN_VIEW_SPAN,
  X0,
  X1,
  areaPath,
  clampView,
  lineSegments,
  panDelta,
  panView,
  timeFractionAt,
  timeTicks,
  xAt,
  zoomView,
} from "./chartGeometry.js";

const blue = (v) => Math.min(0, v);
const rect = { left: 0, width: 1000 }; // 1 px = 1 viewBox unit

describe("clampView", () => {
  it("keeps a valid view unchanged", () => {
    expect(clampView({ start: 0.2, end: 0.6 })).toEqual({ start: 0.2, end: 0.6 });
  });

  it("shifts a view that starts before 0 without changing its span", () => {
    const view = clampView({ start: -0.2, end: 0.3 });
    expect(view.start).toBe(0);
    expect(view.end).toBeCloseTo(0.5);
  });

  it("shifts a view that ends after 1 without changing its span", () => {
    const view = clampView({ start: 0.8, end: 1.3 });
    expect(view.start).toBeCloseTo(0.5);
    expect(view.end).toBeCloseTo(1);
  });

  it("enforces the minimum span", () => {
    const view = clampView({ start: 0.5, end: 0.5 });
    expect(view.end - view.start).toBeCloseTo(MIN_VIEW_SPAN);
  });

  it("limits the span to the whole match", () => {
    expect(clampView({ start: -1, end: 2 })).toEqual(FULL_VIEW);
  });
});

describe("zoomView", () => {
  it("zooms in around the middle", () => {
    const view = zoomView(FULL_VIEW, 0.5, 0.5);
    expect(view.start).toBeCloseTo(0.25);
    expect(view.end).toBeCloseTo(0.75);
  });

  it("zooms in around the start", () => {
    const view = zoomView(FULL_VIEW, 0.5, 0);
    expect(view.start).toBeCloseTo(0);
    expect(view.end).toBeCloseTo(0.5);
  });

  it("keeps the anchor at the same relative position in the window", () => {
    const view = zoomView({ start: 0.2, end: 0.6 }, 0.5, 0.4);
    expect(view.start).toBeCloseTo(0.3);
    expect(view.end).toBeCloseTo(0.5);
  });

  it("never zooms out past the whole match", () => {
    const view = zoomView({ start: 0.2, end: 0.6 }, 10, 0.4);
    expect(view.start).toBeCloseTo(0);
    expect(view.end).toBeCloseTo(1);
  });

  it("never zooms in past the minimum span", () => {
    const view = zoomView(FULL_VIEW, 0.0001, 0.5);
    expect(view.end - view.start).toBeCloseTo(MIN_VIEW_SPAN);
  });

  it("stays inside the match when zooming out near an edge", () => {
    const view = zoomView({ start: 0.7, end: 0.9 }, 2, 0.9);
    expect(view.start).toBeGreaterThanOrEqual(0);
    expect(view.end).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("panView", () => {
  it("shifts the view by the given fraction", () => {
    const view = panView({ start: 0.2, end: 0.4 }, 0.1);
    expect(view.start).toBeCloseTo(0.3);
    expect(view.end).toBeCloseTo(0.5);
  });

  it("stops at the start of the match", () => {
    const view = panView({ start: 0.1, end: 0.3 }, -0.5);
    expect(view.start).toBe(0);
    expect(view.end).toBeCloseTo(0.2);
  });

  it("stops at the end of the match", () => {
    const view = panView({ start: 0.7, end: 0.9 }, 0.5);
    expect(view.start).toBeCloseTo(0.8);
    expect(view.end).toBeCloseTo(1);
  });

  it("does nothing on the whole match", () => {
    expect(panView(FULL_VIEW, 0.3)).toEqual(FULL_VIEW);
  });
});

describe("timeFractionAt", () => {
  const view = { start: 0.2, end: 0.6 };

  it("maps the left edge of the plot to the start of the view", () => {
    expect(timeFractionAt(X0, rect, view)).toBeCloseTo(0.2);
  });

  it("maps the right edge of the plot to the end of the view", () => {
    expect(timeFractionAt(X1, rect, view)).toBeCloseTo(0.6);
  });

  it("maps the middle of the plot to the middle of the view", () => {
    expect(timeFractionAt((X0 + X1) / 2, rect, view)).toBeCloseTo(0.4);
  });

  it("clamps a pointer on the value axis to the start of the view", () => {
    expect(timeFractionAt(10, rect, view)).toBeCloseTo(0.2);
  });

  it("clamps a pointer past the right edge to the end of the view", () => {
    expect(timeFractionAt(999, rect, view)).toBeCloseTo(0.6);
  });

  it("accounts for the position and size of the chart on the page", () => {
    const scaled = { left: 100, width: 500 }; // chart drawn at half size
    expect(timeFractionAt(100 + X0 / 2, scaled, FULL_VIEW)).toBeCloseTo(0);
    expect(timeFractionAt(100 + X1 / 2, scaled, FULL_VIEW)).toBeCloseTo(1);
  });
});

describe("panDelta", () => {
  it("moves the view back by a whole match when dragging the plot width to the right", () => {
    expect(panDelta(X1 - X0, rect, FULL_VIEW)).toBeCloseTo(-1);
  });

  it("moves the view forward when dragging to the left", () => {
    expect(panDelta(-(X1 - X0) / 2, rect, FULL_VIEW)).toBeCloseTo(0.5);
  });

  it("moves proportionally less when zoomed in", () => {
    expect(panDelta(-(X1 - X0) / 2, rect, { start: 0, end: 0.5 })).toBeCloseTo(0.25);
  });

  it("is 0 when the pointer does not move", () => {
    expect(panDelta(0, rect, FULL_VIEW)).toBeCloseTo(0);
  });

  it("scales with the displayed size of the chart", () => {
    expect(panDelta(-(X1 - X0) / 4, { left: 0, width: 500 }, FULL_VIEW)).toBeCloseTo(0.5);
  });
});

describe("xAt with a view", () => {
  it("puts the start of the view on the left edge of the plot", () => {
    expect(xAt(2, 5, { start: 0.5, end: 1 })).toBeCloseTo(X0);
  });

  it("puts the end of the view on the right edge of the plot", () => {
    expect(xAt(4, 5, { start: 0.5, end: 1 })).toBeCloseTo(X1);
  });

  it("puts samples before the view left of the plot", () => {
    expect(xAt(0, 5, { start: 0.5, end: 1 })).toBeCloseTo(X0 - (X1 - X0));
  });

  it("matches the full view by default", () => {
    expect(xAt(1, 5)).toBe(xAt(1, 5, FULL_VIEW));
  });
});

describe("timeTicks with a view", () => {
  // 300 s match
  it("uses a smaller step when zoomed in", () => {
    const ticks = timeTicks(301, 1, { start: 0.2, end: 0.4 }); // 1:00 to 2:00
    expect(ticks.map((t) => t.label)).toEqual(["1:00", "1:15", "1:30", "1:45", "2:00"]);
  });

  it("places the first and last tick on the edges of the plot with matching anchors", () => {
    const ticks = timeTicks(301, 1, { start: 0.2, end: 0.4 });
    expect(ticks[0].x).toBeCloseTo(X0);
    expect(ticks[0].anchor).toBe("start");
    expect(ticks.at(-1).x).toBeCloseTo(X1);
    expect(ticks.at(-1).anchor).toBe("end");
    expect(ticks[2].anchor).toBe("middle");
  });

  it("only labels the visible part", () => {
    const labels = timeTicks(301, 1, { start: 0.5, end: 0.9 }).map((t) => t.label); // 2:30 to 4:30
    expect(labels).toEqual(["2:30", "3:00", "3:30", "4:00", "4:30"]);
  });

  it("shows seconds when the step is below a minute", () => {
    const ticks = timeTicks(301, 1, { start: 0.2, end: 0.2 + MIN_VIEW_SPAN });
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.every((t) => /^\d+:\d{2}$/.test(t.label))).toBe(true);
    expect(ticks.some((t) => !t.label.endsWith(":00"))).toBe(true);
  });

  it("keeps one tick per minute on the whole match", () => {
    expect(timeTicks(301, 1, FULL_VIEW).map((t) => t.label)).toEqual(["0:00", "1:00", "2:00", "3:00", "4:00", "5:00"]);
  });
});

describe("paths with a view", () => {
  const view = { start: 0.5, end: 1 };

  it("starts the area at the first sample, even when it is out of the plot", () => {
    const path = areaPath([0, 0, 0], blue, view);
    expect(path.startsWith(`M${X0 - (X1 - X0)},100`)).toBe(true);
    expect(path.endsWith(`L${X1},100 Z`)).toBe(true);
  });

  it("maps the line points with the view", () => {
    expect(lineSegments([0, 0, 0], view)).toEqual(["-792.0,100.0 96.0,100.0 984.0,100.0"]);
  });
});
