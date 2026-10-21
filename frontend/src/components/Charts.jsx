import { useState } from "react";

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

// Time spent per field cell: heatmap.counts[xCell][yCell]. Same orientation as MomentumChart:
// positive y (orange goal) at the top, negative y (blue goal) at the bottom.
export function HeatmapChart({ player, team, heatmap }) {
  const counts = heatmap.counts;
  const gx = counts.length;
  const gy = gx ? counts[0].length : 0;
  const max = Math.max(0, ...counts.flat());
  if (!max) return <p className="empty">Pas de données de position pour {player}.</p>;

  const W = 200;
  const H = 250;
  const cw = W / gx;
  const ch = H / gy;

  return (
    <figure className="heatmap">
      <figcaption className={team === 0 ? "team-blue" : "team-orange"}>{player}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Carte de chaleur des positions de ${player}`}>
        <rect width={W} height={H} fill="#0a1236" />
        {counts.map((column, ix) =>
          column.map((count, iy) =>
            count > 0 ? (
              <rect
                key={`${ix}-${iy}`}
                x={ix * cw}
                y={(gy - 1 - iy) * ch}
                width={cw}
                height={ch}
                fill="var(--orange)"
                fillOpacity={Math.sqrt(count / max) * 0.9}
              />
            ) : null
          )
        )}
        <g stroke="#fff" strokeOpacity="0.55" strokeWidth="1" fill="none">
          <rect x="0.5" y="0.5" width={W - 1} height={H - 1} />
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} />
          <circle cx={W / 2} cy={H / 2} r="22" />
        </g>
        <rect x={W / 2 - 22} y={H - 3} width="44" height="3" fill="var(--blue)" />
        <rect x={W / 2 - 22} y="0" width="44" height="3" fill="var(--orange)" />
      </svg>
    </figure>
  );
}

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
  return [...players]
    .sort((a, b) => a.stats.team - b.stats.team || a.stats.name.localeCompare(b.stats.name))
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
