// Pure logic of the heatmap chart (smoothing, colours, normalisation, pixels), kept out of the component so it can
// be unit-tested. counts[xCell][yCell]: the long axis of the field (y, blue goal at its negative end) runs left to right.

export const TEAM_DOTS = ["#4d8dff", "#ff8a1f"];

// Every ramp starts from the field background (#0e1640): where there is little heat the picture fades into the field.
const FIELD_BACKGROUND = [14, 22, 64];

// Thermal camera look for the ball: field background, cyan, green, yellow, red. The cyan is darkened to a luma
// (Rec. 709 weights on the sRGB channels) midway between the background's (23) and the green's (172), so the
// ramp brightens steadily from the background to the green instead of peaking at the cyan.
export const BALL_RAMP = [FIELD_BACKGROUND, [0, 124, 136], [57, 217, 64], [255, 230, 0], [255, 40, 30]];

// Blue team: from the dark blue of the field to a luminous turquoise green. Every stop is brighter than the one
// before (luma 23, 67, 106, 147, 186, 218) while the hue warms up, from blue (230 degrees) through azure and cyan
// to turquoise green (143 degrees).
export const BLUE_RAMP = [FIELD_BACKGROUND, [20, 70, 170], [10, 125, 205], [0, 185, 200], [40, 230, 175], [110, 255, 165]];

// Orange team, built like the blue one: from the field background to a dark brownish red leaning slightly to
// purple, then a red, a medium orange and a vivid yellow-orange. Every stop is brighter than the one before (luma
// 23, 42, 60, 79, 121, 164, 205, and the HSL lightness rises too) while the hue warms up, from 344 degrees (the
// dark red) through red and orange to 45 degrees. No green anywhere, so no olive.
export const ORANGE_RAMP = [
  FIELD_BACKGROUND,
  [84, 30, 44],
  [150, 35, 48],
  [205, 45, 45],
  [238, 95, 32],
  [255, 150, 35],
  [255, 205, 55],
];

// Ramps of the teams, by team number.
export const HEAT_RAMPS = [BLUE_RAMP, ORANGE_RAMP];

// Field drawn at 0.045 px per unit (10240 x 8192) in a 580 x 410 view.
export const FIELD = { x0: 59.6, y0: 20.7, w: 460.8, h: 368.6 };
export const FIELD_OUTLINE = "111.4,20.7 468.6,20.7 520.4,72.5 520.4,337.5 468.6,389.3 111.4,389.3 59.6,337.5 59.6,72.5";

// The heat is drawn as one image covering the field, this many pixels per unit of the view (sharp on a 2x screen).
export const IMAGE_SCALE = 1.5;
export const HEAT_IMAGE_SIZE = { width: Math.round(FIELD.w * IMAGE_SCALE), height: Math.round(FIELD.h * IMAGE_SCALE) };

// The top of the colour scale is the count below which this share of the cells falls; busier cells saturate.
// Scaling on the max would let one hot spot flatten every other cell.
export const SCALE_PERCENTILE = 0.98;

// Colour mapping of a value: its share of the scale, raised to the power HEAT_GAMMA. The power makes a busy zone
// fall back to the cold end of the ramp within a cell or two, instead of dragging yellow and green over the quiet
// zones around it, so trajectories stand out as lines and the picture stays crisp. Higher cuts a trajectory
// short where the ball passed only once (2.5 left gaps); lower fills the background and softens the picture (1.4).
export const HEAT_GAMMA = 1.8;

// The counts are sparse (a few samples per cell): coloured as they are, neighbouring cells get unrelated colours.
// So the density is smoothed first (Gaussian, in cells), then interpolated smoothly at every pixel, and only then
// coloured. Colouring after smoothing, pixel by pixel, keeps the colour transitions sharp where blurring the
// coloured picture would mix cyan and red into mud.
export const SMOOTH_SIGMA = 0.5; // lower looks sharper but the bicubic interpolation then rings around hot spots

export const toRgb = (color) => `rgb(${color.map(Math.round).join(",")})`;
const blend = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

// Colour channels of a heat ratio t (0..1) along a ramp of evenly spaced stops (2 or more).
export const heatRgb = (ramp, t) => {
  const position = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const from = Math.min(ramp.length - 2, Math.floor(position));
  return blend(ramp[from], ramp[from + 1], position - from);
};
export const heatColor = (ramp, t) => toRgb(heatRgb(ramp, t));

// Opacity of a heat ratio t (0..1): fades in from 0 over the coolest tenth, then fully opaque so the colours stay
// vivid. Starting at 0 keeps the edge of the heat free of any step; the short fade keeps that edge crisp.
export const FULL_OPACITY_AT = 0.1;
export const heatOpacity = (t) => Math.min(1, Math.max(0, t) / FULL_OPACITY_AT);

// Ramp of a team (unknown team falls back to blue), or the ball ramp for the "ball" variant.
export const rampFor = (team, variant) => (variant === "ball" ? BALL_RAMP : HEAT_RAMPS[team] ?? HEAT_RAMPS[0]);
export const dotFor = (team) => TEAM_DOTS[team] ?? TEAM_DOTS[0];

// CSS gradient of the legend scale.
export const rampGradient = (ramp) => `linear-gradient(90deg, ${ramp.map(toRgb).join(", ")})`;

// Gaussian smoothing of a grid, separable. Near the edges the kernel is renormalised over the cells inside the
// grid, so the border does not fade out.
export function smoothCounts(counts, sigma = SMOOTH_SIGMA) {
  const rows = counts.length;
  if (!rows || !counts[0].length || !(sigma > 0)) return counts.map((row) => [...row]);
  const cols = counts[0].length;
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));

  const blur = (length, read) => {
    const out = new Array(length);
    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const j = i + k;
        if (j < 0 || j >= length) continue;
        sum += kernel[k + radius] * read(j);
        weight += kernel[k + radius];
      }
      out[i] = sum / weight;
    }
    return out;
  };

  const alongRows = counts.map((row) => blur(cols, (j) => row[j]));
  const result = counts.map(() => new Array(cols));
  for (let j = 0; j < cols; j += 1) {
    const column = blur(rows, (i) => alongRows[i][j]);
    column.forEach((value, i) => {
      result[i][j] = value;
    });
  }
  return result;
}

// Catmull-Rom interpolation between p1 and p2 (t in 0..1), p0 and p3 being the neighbours on each side.
const cubic = (p0, p1, p2, p3, t) =>
  p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

// Value of a grid at (row, col), in cell-centre units (cell i is centred on i): bicubic, edges replicated, never
// below 0 (the interpolation can undershoot next to a sharp peak).
export function sampleCubic(grid, row, col) {
  const rows = grid.length;
  const cols = grid[0].length;
  const clamp = (i, size) => Math.min(size - 1, Math.max(0, i));
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const fr = row - r0;
  const fc = col - c0;
  const column = [];
  for (let dr = -1; dr <= 2; dr += 1) {
    const line = grid[clamp(r0 + dr, rows)];
    column.push(cubic(line[clamp(c0 - 1, cols)], line[clamp(c0, cols)], line[clamp(c0 + 1, cols)], line[clamp(c0 + 2, cols)], fc));
  }
  return Math.max(0, cubic(column[0], column[1], column[2], column[3], fr));
}

// Highest count of the grid (0 when empty).
export function maxCount(counts) {
  let max = 0;
  for (const row of counts) for (const count of row) if (count > max) max = count;
  return max;
}

// Heat ratio (0..1) of a value on a scale: 0 for 0, 1 from the scale on, a power curve in between.
export function heatRatio(value, scale) {
  if (!(scale > 0) || !(value > 0)) return 0;
  return Math.min(1, value / scale) ** HEAT_GAMMA;
}

// Value that gets the top colour (0 when empty): the SCALE_PERCENTILE of the non-empty cells.
export function heatScale(counts) {
  const filled = counts.flat().filter((count) => count > 0).sort((a, b) => a - b);
  if (!filled.length) return 0;
  return filled[Math.ceil(SCALE_PERCENTILE * filled.length) - 1];
}

// RGBA pixels (row by row, 4 bytes each) of the heat covering the field, width x height. Pixels without heat are
// transparent. Also returns the max count and the scale used to normalise.
export function buildHeatImage(counts, ramp, width = HEAT_IMAGE_SIZE.width, height = HEAT_IMAGE_SIZE.height) {
  const max = maxCount(counts);
  const data = new Uint8ClampedArray(width * height * 4);
  if (!max) return { max, scale: 0, width, height, data };

  const smooth = smoothCounts(counts);
  const scale = heatScale(smooth);
  const rows = smooth.length; // rows follow the short axis of the field (top to bottom)
  const cols = smooth[0].length; // columns follow the long axis (left to right)
  for (let y = 0; y < height; y += 1) {
    const row = ((y + 0.5) / height) * rows - 0.5;
    for (let x = 0; x < width; x += 1) {
      const t = heatRatio(sampleCubic(smooth, row, ((x + 0.5) / width) * cols - 0.5), scale);
      if (t <= 0) continue;
      const [r, g, b] = heatRgb(ramp, t);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = heatOpacity(t) * 255;
    }
  }
  return { max, scale, width, height, data };
}
