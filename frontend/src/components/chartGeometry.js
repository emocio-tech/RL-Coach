// Pure geometry helpers shared by the positioning charts (no JSX, unit-testable).
export const W = 1000;
export const H = 224;
export const X0 = 96;
export const X1 = 984;
export const TOP = 16;
export const BASE = 184;
export const MID = 100;
export const AMP = MID - TOP;
export const TICK_Y = 206;
export const FIELD_HALF_LENGTH = 5120;

const fmt = (n) => n.toFixed(1);
// Same rounding as fmt, but without trailing ".0" (keeps "96" for the plot edges).
const plain = (n) => `${Number(n.toFixed(1))}`;

// Visible part of the timeline, as fractions of the whole match: { start, end } with 0 <= start < end <= 1.
export const FULL_VIEW = { start: 0, end: 1 };
export const MIN_VIEW_SPAN = 0.02;

// Keeps the span of the view (within [MIN_VIEW_SPAN, 1]) and shifts it back inside [0, 1].
export function clampView(view) {
  const span = Math.min(1, Math.max(MIN_VIEW_SPAN, view.end - view.start));
  const start = Math.min(1 - span, Math.max(0, view.start));
  return { start, end: start + span };
}

// Scales the visible span by `factor` (< 1 zooms in) keeping the point at `anchor` (fraction of the match) fixed.
export function zoomView(view, factor, anchor) {
  const span = view.end - view.start;
  const newSpan = Math.min(1, Math.max(MIN_VIEW_SPAN, span * factor));
  const start = anchor - ((anchor - view.start) / span) * newSpan;
  return clampView({ start, end: start + newSpan });
}

// Shifts the view by `delta` (fraction of the whole match).
export function panView(view, delta) {
  return clampView({ start: view.start + delta, end: view.end + delta });
}

// Fraction of the match under the pointer, given the chart's bounding rect and the current view.
export function timeFractionAt(clientX, rect, view) {
  const xView = ((clientX - rect.left) / rect.width) * W;
  const f = Math.min(1, Math.max(0, (xView - X0) / (X1 - X0)));
  return view.start + f * (view.end - view.start);
}

// Change of view start (fraction of the match) when the pointer moves by `dxPixels` to the right:
// the content follows the pointer, so the view moves the other way.
export function panDelta(dxPixels, rect, view) {
  return -(((dxPixels / rect.width) * W) / (X1 - X0)) * (view.end - view.start);
}

// Replaces missing values by the last known one (0 at the start).
export function fillGaps(values) {
  const filled = [];
  let last = 0;
  for (const v of values) {
    last = v ?? last;
    filled.push(last);
  }
  return filled;
}

// Abscissa of sample i out of n; outside [X0, X1] when the sample is out of the view.
export function xAt(i, n, view = FULL_VIEW) {
  return n < 2 ? X0 : X0 + ((i / (n - 1) - view.start) / (view.end - view.start)) * (X1 - X0);
}

// Team 0 (blue) defends the negative y side: negative y = top, positive y = bottom.
export function positionY(v) {
  const clamped = Math.max(-FIELD_HALF_LENGTH, Math.min(FIELD_HALF_LENGTH, v));
  return MID + (clamped / FIELD_HALF_LENGTH) * AMP;
}

// Closed area between the median line and the curve; clampFn keeps one side of the field.
export function areaPath(values, clampFn, view = FULL_VIEW) {
  const n = values.length;
  const pts = values.map((v, i) => `${fmt(xAt(i, n, view))},${fmt(positionY(clampFn(v)))}`);
  const first = n < 2 ? X0 : xAt(0, n, view);
  const last = n < 2 ? X1 : xAt(n - 1, n, view);
  return `M${plain(first)},${MID} L${pts.join(" L")} L${plain(last)},${MID} Z`;
}

// Splits values into runs of consecutive non-null points and maps each point to "x,y".
function segments(values, toY, view) {
  const n = values.length;
  const runs = [];
  let current = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push({ x: xAt(i, n, view), y: toY(v) });
    }
  });
  if (current.length) runs.push(current);
  return runs;
}

const asPoints = (run) => run.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");

// One "points" string per continuous run of non-null values; single-point runs are ignored.
export function lineSegments(values, view = FULL_VIEW) {
  return segments(values, positionY, view).filter((run) => run.length >= 2).map(asPoints);
}

const TICK_STEPS = [60, 30, 15, 10, 5, 2, 1];
const clock = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

// One tick per whole minute on the full match; when zoomed in, the step shrinks (down to 1 s)
// so that the visible window keeps at least 3 ticks.
export function timeTicks(sampleCount, sampleSeconds, view = FULL_VIEW) {
  const total = (sampleCount - 1) * sampleSeconds;
  if (!(total > 0)) return [];
  const t0 = view.start * total;
  const t1 = view.end * total;
  const zoomed = view.end - view.start < 1 - 1e-9;
  const step = zoomed ? TICK_STEPS.find((s) => (t1 - t0) / s >= 3) ?? 1 : 60;
  const ticks = [];
  for (let t = Math.ceil(t0 / step - 1e-9) * step; t <= t1 + 1e-9; t += step) {
    const x = X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
    const anchor = x <= X0 + 1e-9 ? "start" : x >= X1 - 1e-9 ? "end" : "middle";
    ticks.push({ x, label: clock(t), anchor });
  }
  return ticks;
}

export function distanceY(d, max) {
  return BASE - (d / max) * (BASE - TOP);
}

export function distanceScale(values) {
  const known = values.filter((v) => v != null);
  const peak = known.length ? Math.max(...known) : 0;
  const max = Math.max(1000, Math.ceil(peak / 1000) * 1000);
  return {
    max,
    ticks: [
      { value: 0, y: BASE },
      { value: max / 2, y: distanceY(max / 2, max) },
      { value: max, y: TOP },
    ],
  };
}

// Lines and closed areas (down to BASE), one per continuous run of non-null values.
export function distancePaths(values, max, view = FULL_VIEW) {
  const runs = segments(values, (v) => distanceY(v, max), view);
  return {
    lines: runs.filter((run) => run.length >= 2).map(asPoints),
    area: runs
      .filter((run) => run.length >= 2)
      .map((run) => {
        const first = run[0];
        const last = run[run.length - 1];
        return `M${fmt(first.x)},${BASE} L${run.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" L")} L${fmt(last.x)},${BASE} Z`;
      }),
  };
}
