import { memo, useId, useMemo,useState } from "react";
import { sortPlayers } from "./playerOrder.js";
const FIELD_HALF_LENGTH = 5120;

// Ball position along the long axis over time. Team 0 (blue) defends the negative y side:
// ball on the positive side = blue pressure (top), negative side = orange pressure (bottom).
export function MomentumChart({ ballY, sampleSeconds }) {
  const values = [];
  let last = 0;
  for (const v of ballY) {
    last = v ?? last;
    values.push(last);
  }
  if (values.length < 2) return <p className="empty">Pas de données de position pour cette partie.</p>;

  const W = 1000;
  const H = 260;
  const mid = H / 2;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => (v / FIELD_HALF_LENGTH) * (mid - 6);
  const area = (clamp, color) => {
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${(mid - y(clamp(v))).toFixed(1)}`);
    return <path d={`M0,${mid} L${pts.join(" L")} L${W},${mid} Z`} fill={color} />;
  };

  const total = (values.length - 1) * (sampleSeconds ?? 0.2);
  const ticks = Array.from({ length: Math.floor(total / 60) + 1 }, (_, m) => m);

  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label="Pression bleue et orange au fil du match">
        {area((v) => Math.max(0, v), "var(--blue)")}
        {area((v) => Math.min(0, v), "var(--orange)")}
        <line x1="0" x2={W} y1={mid} y2={mid} stroke="#fff" strokeOpacity="0.6" />
        {ticks.map((m) => (
          <text key={m} x={Math.min(W - 14, (m * 60 / total) * W)} y={H + 18} fill="var(--muted)" fontSize="13" textAnchor={m === 0 ? "start" : "middle"}>
            {m}:00
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        <span><i className="dot" style={{ background: "var(--blue)" }} /> Pression bleue (balle côté orange)</span>
        <span><i className="dot" style={{ background: "var(--orange)" }} /> Pression orange (balle côté bleu)</span>
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
