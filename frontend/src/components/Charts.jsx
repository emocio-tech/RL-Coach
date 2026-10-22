import { memo, useId, useMemo, useState } from "react";
import {
  FULL_VIEW, H, MID, TICK_Y, W, X0, X1,
  areaPath, distancePaths, distanceScale, fillGaps, lineSegments, timeTicks,
} from "./chartGeometry.js";
import { TEAM_NAMES } from "./Layout.jsx";
import { FIELD, FIELD_OUTLINE, buildHeatImage, dotFor, rampFor, rampGradient } from "./heatmapGeometry.js";
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

// PNG data URL of the heat covering the field (null when there is no data), drawn per pixel on a canvas.
function heatImageUrl(counts, ramp) {
  const { max, width, height, data } = buildHeatImage(counts, ramp);
  if (!max) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

// "Déplacements du joueur" / "Déplacements du ballon" blocks of the Heatmaps screen (SPECS.md mockup), the player one reused in the chat.
// heatmap.counts[xCell][yCell]: the long axis of the field (y, blue goal at its negative end) runs left to right,
// blue goal on the left and orange goal on the right. The heat takes the colour of the player's team.
// Props: title / subtitle override the heading and the line below it (default: player and team);
// variant "ball" uses the thermal ramp and no team dot; bare renders the full-size card of the Heatmaps page
// instead of the compact chat block.
function HeatmapChartView({ player, team, heatmap, title = "Déplacements du joueur", subtitle, variant, bare = false }) {
  const uid = useId().replace(/:/g, "");
  const isBall = variant === "ball";
  const ramp = rampFor(team, variant);
  const heatUrl = useMemo(() => heatImageUrl(heatmap.counts, ramp), [heatmap, ramp]);
  const subject = isBall ? "du ballon" : `de ${player}`;
  if (!heatUrl) return <p className="empty">Pas de données de position {isBall ? "pour le ballon" : `pour ${player}`}.</p>;

  const sub = subtitle ?? `${player} · ${TEAM_NAMES[team] ?? TEAM_NAMES[0]}`;

  return (
    <section className={bare ? "card heatmap-panel" : "heatmap-card"} aria-labelledby={`${uid}-title`}>
      {bare ? (
        <h2 id={`${uid}-title`} className="title card-title">{title}</h2>
      ) : (
        <h3 id={`${uid}-title`} className="title heatmap-title">{title}</h3>
      )}
      <span className="heatmap-sub">
        {!isBall && <i className="dot" style={{ background: dotFor(team) }} />}
        {sub}
      </span>
      <svg viewBox="0 0 580 410" role="img" aria-label={`Heatmap des déplacements ${subject} sur le terrain`}>
        <defs>
          <clipPath id={`${uid}-clip`}>
            <polygon points={FIELD_OUTLINE} />
          </clipPath>
        </defs>
        <rect width="580" height="410" rx="18" fill="#0a1030" />
        <polygon points={FIELD_OUTLINE} fill="#0e1640" />
        <g clipPath={`url(#${uid}-clip)`}>
          <image href={heatUrl} x={FIELD.x0} y={FIELD.y0} width={FIELD.w} height={FIELD.h} preserveAspectRatio="none" />
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
        <span className="heatmap-scale" aria-hidden="true" style={{ background: rampGradient(ramp) }} />
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
