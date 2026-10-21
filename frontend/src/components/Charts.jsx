import { memo, useId, useMemo } from "react";

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
const PLAYER_COLORS = ["#4d8dff", "#9fc2ff", "#ff8a1f", "#ffc56b"];

// Each axis is scaled to the best of the players (100 = best).
export function StyleRadar({ players }) {
  const width = 560;
  const height = 380;
  const c = width / 2;
  const cy = height / 2;
  const r = 140;
  const n = RADAR_AXES.length;
  const maxima = RADAR_AXES.map(([, get]) => Math.max(1, ...players.map((p) => get(p) ?? 0)));
  const angle = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const point = (i, ratio) => `${(c + Math.cos(angle(i)) * r * ratio).toFixed(1)},${(cy + Math.sin(angle(i)) * r * ratio).toFixed(1)}`;
  // Same colour order for both teams so each player keeps one colour.
  const ordered = [...players].sort((a, b) => a.stats.team - b.stats.team);

  return (
    <div className="radar">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Radar du style de jeu">
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon key={ratio} points={RADAR_AXES.map((_, i) => point(i, ratio)).join(" ")} fill="none" stroke="var(--panel-edge)" />
        ))}
        {RADAR_AXES.map(([label], i) => {
          const [lx, ly] = point(i, 1.18).split(",").map(Number);
          const anchor = lx < c - 10 ? "end" : lx > c + 10 ? "start" : "middle";
          return (
            <g key={label}>
              <line x1={c} y1={cy} x2={point(i, 1).split(",")[0]} y2={point(i, 1).split(",")[1]} stroke="var(--panel-edge)" />
              <text x={lx} y={ly} fill="var(--muted-2)" fontSize="13" textAnchor={anchor} dominantBaseline="middle">{label}</text>
            </g>
          );
        })}
        {ordered.map((p, k) => {
          const color = PLAYER_COLORS[k % PLAYER_COLORS.length];
          const pts = RADAR_AXES.map(([, get], i) => point(i, (get(p) ?? 0) / maxima[i])).join(" ");
          return <polygon key={p.stats.name} points={pts} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2.5" />;
        })}
      </svg>
      <div className="chart-legend">
        {ordered.map((p, k) => (
          <span key={p.stats.name}>
            <i className="dot" style={{ background: PLAYER_COLORS[k % PLAYER_COLORS.length] }} /> {p.stats.name}
          </span>
        ))}
      </div>
    </div>
  );
}
