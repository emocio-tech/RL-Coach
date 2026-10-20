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
