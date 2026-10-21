import { memo, useId, useMemo, useState } from "react";
import {
  FULL_VIEW, H, MID, TICK_Y, W, X0, X1,
  areaPath, distancePaths, distanceScale, fillGaps, lineSegments, timeTicks,
} from "./chartGeometry.js";
import { sortPlayers } from "./playerOrder.js";
import { useChartZoom } from "./useChartZoom.js";

const NO_POSITION = "Pas de données de position pour cette partie.";

function TimeTicks({ count, sampleSeconds, view }) {
  return timeTicks(count, sampleSeconds ?? 0.2, view).map((tick) => (
    <text key={tick.label} x={tick.x} y={TICK_Y} fill="var(--muted)" fontSize="13" textAnchor={tick.anchor}>
      {tick.label}
    </text>
  ));
}

// Keeps what is drawn between the value axis and the right edge while zoomed in.
function PlotClip({ id }) {
  return (
    <clipPath id={id}>
      <rect x={X0} y="0" width={X1 - X0} height={H} />
    </clipPath>
  );
}

// Ball (area) and optional player (dashed line) position along the long axis over time.
// Team 0 (blue) defends the negative y side: negative y = blue half = top, positive y = orange half = bottom.
// `view` / `onViewChange` hold the zoom, shared with the other chart of the page.
export function BallPositionChart({ ballY, playerY, playerLabel, sampleSeconds, view = FULL_VIEW, onViewChange }) {
  const zoom = useChartZoom(view, onViewChange);
  const [hidden, setHidden] = useState(() => new Set());
  if (ballY.length < 2) return <p className="empty">{NO_POSITION}</p>;

  const toggle = (key) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // The legend only exists with a player: without it the ball cannot be hidden.
  const showBall = !playerY || !hidden.has("ball");
  const showPlayer = !hidden.has("player");
  const values = fillGaps(ballY);
  const playerSegments = playerY && showPlayer ? lineSegments(playerY, view) : [];

  return (
    <>
      <svg {...zoom} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Position de la balle au fil du match">
        <defs><PlotClip id="clip-ball-position" /></defs>
        <rect width={W} height={H} fill="var(--bg)" />
        <g clipPath="url(#clip-ball-position)">
          {showBall && (
            <>
              <path d={areaPath(values, (v) => Math.min(0, v), view)} fill="var(--blue)" />
              <path d={areaPath(values, (v) => Math.max(0, v), view)} fill="var(--orange)" />
            </>
          )}
          <line x1={X0} x2={X1} y1={MID} y2={MID} stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
          {playerSegments.map((points) => (
            <g key={points} fill="none" strokeLinejoin="round" strokeLinecap="round">
              <polyline points={points} stroke="var(--bg)" strokeOpacity="0.5" strokeWidth="3.5" />
              <polyline points={points} stroke="#fff" strokeWidth="1.5" strokeDasharray="6 4" />
            </g>
          ))}
        </g>
        <text x="88" y="30" fill="var(--muted)" fontSize="12" textAnchor="end">Côté bleu</text>
        <text x="88" y="178" fill="var(--muted)" fontSize="12" textAnchor="end">Côté orange</text>
        <TimeTicks count={values.length} sampleSeconds={sampleSeconds} view={view} />
      </svg>
      {playerY && (
        <div className="chart-legend">
          <button type="button" className="chart-legend-toggle" aria-pressed={showBall} onClick={() => toggle("ball")}>
            <i className="legend-ball" /> Balle
          </button>
          <button type="button" className="chart-legend-toggle" aria-pressed={showPlayer} onClick={() => toggle("player")}>
            <i className="legend-dash" /> Joueur : {playerLabel}
          </button>
        </div>
      )}
    </>
  );
}

// Distance between the selected player and the ball over time (3D, game units).
export function DistanceChart({ distance, sampleSeconds, view = FULL_VIEW, onViewChange }) {
  const zoom = useChartZoom(view, onViewChange);
  if (distance.length < 2 || distance.every((d) => d == null)) return <p className="empty">{NO_POSITION}</p>;

  const { max, ticks } = distanceScale(distance);
  const { lines, area } = distancePaths(distance, max, view);

  return (
    <>
      <svg {...zoom} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distance entre le joueur et la balle au fil du match">
        <defs><PlotClip id="clip-ball-distance" /></defs>
        <rect width={W} height={H} fill="var(--bg)" />
        {ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={X0} x2={X1} y1={tick.y} y2={tick.y} stroke="#fff" strokeOpacity="0.18" />
            <text x="88" y={tick.y + 4} fill="var(--muted)" fontSize="12" textAnchor="end">
              {tick.value.toLocaleString("fr-FR")}
            </text>
          </g>
        ))}
        <g clipPath="url(#clip-ball-distance)">
          {area.map((d) => (
            <path key={d} d={d} fill="#5EEAD4" fillOpacity="0.18" />
          ))}
          {lines.map((points) => (
            <polyline key={points} points={points} fill="none" stroke="#5EEAD4" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </g>
        <TimeTicks count={distance.length} sampleSeconds={sampleSeconds} view={view} />
      </svg>
      <div className="chart-legend">
        <span><i className="dot" style={{ background: "#5EEAD4" }} /> Distance entre le joueur et la balle (unités du jeu)</span>
      </div>
    </>
  );
}

// "Déplacements du joueur" block of the Heatmaps screen (SPECS.md mockup), reused in the chat.
// heatmap.counts[xCell][yCell]: the long axis of the field (y, blue goal at its negative end) runs left to right,
// blue goal on the left and orange goal on the right. The heat takes the colour of the player's team.
const HEAT_RAMPS = [
  [[21, 87, 224], [77, 141, 255], [220, 232, 255]], // blue team
  [[184, 90, 0], [255, 138, 31], [255, 232, 204]], // orange team
];
const TEAM_DOTS = ["#4d8dff", "#ff8a1f"];
const TEAM_NAMES = ["Équipe bleue", "Équipe orange"];
// Field drawn at 0.045 px per unit (10240 x 8192) in a 580 x 410 view.
const FIELD = { x0: 59.6, y0: 20.7, w: 460.8, h: 368.6 };
const FIELD_OUTLINE = "111.4,20.7 468.6,20.7 520.4,72.5 520.4,337.5 468.6,389.3 111.4,389.3 59.6,337.5 59.6,72.5";

const toRgb = (color) => `rgb(${color.map(Math.round).join(",")})`;
const blend = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const heatColor = (ramp, t) =>
  t < 0.5 ? toRgb(blend(ramp[0], ramp[1], t / 0.5)) : toRgb(blend(ramp[1], ramp[2], (t - 0.5) / 0.5));

// Heat cells (only the ones that are visible), computed once per heatmap and not at every re-render of the chat.
function buildHeatCells(counts, ramp) {
  let max = 0;
  for (const row of counts) for (const count of row) if (count > max) max = count;
  const cells = [];
  if (!max) return { max, cells };

  const cw = FIELD.w / counts[0].length; // columns run along the long axis of the field
  const ch = FIELD.h / counts.length;
  counts.forEach((row, ix) =>
    row.forEach((count, iy) => {
      const t = count / max;
      if (t <= 0.04) return;
      cells.push(
        <rect
          key={`${ix}-${iy}`}
          x={(FIELD.x0 + iy * cw).toFixed(2)}
          y={(FIELD.y0 + ix * ch).toFixed(2)}
          width={(cw + 0.5).toFixed(2)}
          height={(ch + 0.5).toFixed(2)}
          fill={heatColor(ramp, t)}
          fillOpacity={Math.min(0.95, 0.15 + 0.85 * t ** 0.7).toFixed(2)}
        />
      );
    })
  );
  return { max, cells };
}

function HeatmapChartView({ player, team, heatmap }) {
  const uid = useId().replace(/:/g, "");
  const ramp = HEAT_RAMPS[team] ?? HEAT_RAMPS[0];
  const dot = TEAM_DOTS[team] ?? TEAM_DOTS[0];
  const { max, cells } = useMemo(() => buildHeatCells(heatmap.counts, ramp), [heatmap, ramp]);
  if (!max) return <p className="empty">Pas de données de position pour {player}.</p>;

  return (
    <section className="heatmap-card" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="title heatmap-title">Déplacements du joueur</h3>
      <span className="heatmap-sub">
        <i className="dot" style={{ background: dot }} />
        {player} · {TEAM_NAMES[team] ?? TEAM_NAMES[0]}
      </span>
      <svg viewBox="0 0 580 410" role="img" aria-label={`Heatmap des déplacements de ${player} sur le terrain`}>
        <defs>
          <filter id={`${uid}-blur`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <clipPath id={`${uid}-clip`}>
            <polygon points={FIELD_OUTLINE} />
          </clipPath>
        </defs>
        <rect width="580" height="410" rx="18" fill="#0a1030" />
        <polygon points={FIELD_OUTLINE} fill="#0e1640" />
        <g clipPath={`url(#${uid}-clip)`}>
          <g filter={`url(#${uid}-blur)`}>{cells}</g>
        </g>
        <g fill="none" stroke="#9db8ff" strokeOpacity="0.6" strokeWidth="2" aria-hidden="true">
          <polygon points={FIELD_OUTLINE} />
          <path d="M290 20.7V389.3" />
          <circle cx="290" cy="205" r="46" />
        </g>
        <path d="M59.6 164.8H20V245.2H59.6" fill="#0a1030" stroke="#4d8dff" strokeWidth="3" strokeLinejoin="round" aria-hidden="true" />
        <path d="M520.4 164.8H560V245.2H520.4" fill="#0a1030" stroke="#ff8a1f" strokeWidth="3" strokeLinejoin="round" aria-hidden="true" />
      </svg>
      <div className="heatmap-legend">
        Peu de passage
        <span
          className="heatmap-scale"
          aria-hidden="true"
          style={{ background: `linear-gradient(90deg, ${toRgb(ramp[0])}, ${toRgb(ramp[1])}, ${toRgb(ramp[2])})` }}
        />
        Beaucoup de passage
      </div>
    </section>
  );
}

// Memoized: typing in the chat input re-renders the bubble but must not redraw the heatmap.
export const HeatmapChart = memo(HeatmapChartView);

const RADAR_AXES = [
  ["Vitesse moy.", (p) => p.detail.avg_speed],
  ["Boost moy.", (p) => p.stats.boost.average_level],
  ["% supersonique", (p) => p.detail.supersonic_pct],
  ["% 1er homme", (p) => p.detail.first_man_pct],
  ["% derrière la balle", (p) => p.detail.behind_ball_pct],
];
// Cool colours for team 0 (blue), warm colours for team 1 (orange).
const TEAM_PALETTES = [
  ["#4d8dff", "#35d0f0", "#a58bff", "#2fd6a8"],
  ["#ff8a1f", "#ffd23f", "#ff4d4d", "#ff8fb1"],
];

// Colour by rank within the team; beyond the palette size, colours are reused with dashed strokes.
function playerColor(team, rank) {
  const palette = TEAM_PALETTES[team] ?? TEAM_PALETTES[0];
  return { color: palette[rank % palette.length], dashed: rank >= palette.length };
}

// Players sorted by team then name, each with its colour and dash flag.
function styledPlayers(players) {
  const ranks = new Map();
  return sortPlayers(players, (p) => p.stats)
    .map((player) => {
      const team = player.stats.team;
      const rank = ranks.get(team) ?? 0;
      ranks.set(team, rank + 1);
      return { player, team, ...playerColor(team, rank) };
    });
}

// Radar grid, axes and one polygon per entry. Maxima are provided by the caller.
// compact: bigger font and wider viewBox so axis labels stay readable and untruncated when small.
function RadarSvg({ entries, maxima, label, compact = false }) {
  const width = compact ? 760 : 560;
  const height = compact ? 360 : 380;
  const fontSize = compact ? 20 : 13;
  const c = width / 2;
  const cy = height / 2;
  const r = compact ? 120 : 140;
  const n = RADAR_AXES.length;
  const angle = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const point = (i, ratio) => `${(c + Math.cos(angle(i)) * r * ratio).toFixed(1)},${(cy + Math.sin(angle(i)) * r * ratio).toFixed(1)}`;

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <polygon key={ratio} points={RADAR_AXES.map((_, i) => point(i, ratio)).join(" ")} fill="none" stroke="var(--panel-edge)" />
      ))}
      {RADAR_AXES.map(([axisLabel], i) => {
        const [lx, ly] = point(i, 1.18).split(",").map(Number);
        const anchor = lx < c - 10 ? "end" : lx > c + 10 ? "start" : "middle";
        return (
          <g key={axisLabel}>
            <line x1={c} y1={cy} x2={point(i, 1).split(",")[0]} y2={point(i, 1).split(",")[1]} stroke="var(--panel-edge)" />
            <text x={lx} y={ly} fill="var(--muted-2)" fontSize={fontSize} textAnchor={anchor} dominantBaseline="middle">{axisLabel}</text>
          </g>
        );
      })}
      {entries.map(({ player, color, dashed }) => {
        const pts = RADAR_AXES.map(([, get], i) => point(i, (get(player) ?? 0) / maxima[i])).join(" ");
        return (
          <polygon
            key={player.stats.name}
            points={pts}
            fill={color}
            fillOpacity="0.22"
            stroke={color}
            strokeWidth={compact ? 3.5 : 2.5}
            strokeDasharray={dashed ? "6 4" : undefined}
          />
        );
      })}
    </svg>
  );
}

// Each axis is scaled to the best of ALL the players (100 = best), whatever is hidden.
// view: "compare" (one radar, toggleable legend) or "players" (one radar per player).
export function StyleRadar({ players, view = "compare" }) {
  const [hidden, setHidden] = useState(() => new Set());
  const maxima = RADAR_AXES.map(([, get]) => Math.max(1, ...players.map((p) => get(p) ?? 0)));
  const entries = styledPlayers(players);

  if (view === "players") {
    return (
      <div className="radar-grid">
        {entries.map((entry) => (
          <figure key={entry.player.stats.name} className="radar-item">
            <figcaption style={{ color: entry.color }}>{entry.player.stats.name}</figcaption>
            <RadarSvg entries={[entry]} maxima={maxima} compact label={`Radar du style de jeu de ${entry.player.stats.name}`} />
          </figure>
        ))}
      </div>
    );
  }

  const visible = entries.filter((e) => !hidden.has(e.player.stats.name));
  const toggle = (name) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const label = `Radar du style de jeu${visible.length ? ` : ${visible.map((e) => e.player.stats.name).join(", ")}` : ""}`;

  return (
    <div className="radar">
      <RadarSvg entries={visible} maxima={maxima} label={label} />
      {visible.length === 0 && <p className="card-note">Aucun joueur sélectionné</p>}
      <div aria-label="Légende" role="group" className="radar-legend-teams">
        {[...new Set(entries.map((e) => e.team))].map((team) => (
          <ul key={team} className="radar-legend">
            {entries.filter((e) => e.team === team).map(({ player, color }) => (
              <li key={player.stats.name}>
                <button
                  type="button"
                  className="radar-legend-toggle"
                  aria-pressed={!hidden.has(player.stats.name)}
                  onClick={() => toggle(player.stats.name)}
                >
                  <i className="dot" style={{ background: color }} />
                  {player.stats.name}
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
