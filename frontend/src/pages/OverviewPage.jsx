import { useState } from "react";
import { StyleRadar } from "../components/Charts.jsx";
import { TEAM_NAMES } from "../components/Layout.jsx";
import { sortPlayers } from "../components/playerOrder.js";

const fmt = (value, suffix = "") =>
  value === null || value === undefined ? "—" : `${value}${suffix}`;

const duration = (seconds) =>
  seconds == null ? "—" : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

function winner(match) {
  const { team0_score: blue, team1_score: orange } = match;
  if (blue == null || orange == null) return null;
  if (blue === orange) return { className: "draw", label: "Match nul" };
  return blue > orange
    ? { className: "", label: "Victoire de l'équipe bleue" }
    : { className: "orange", label: "Victoire de l'équipe orange" };
}

function Recap({ match, player }) {
  const mode = match.team_size ? `${match.team_size}v${match.team_size}` : "Mode inconnu";
  const result = winner(match);
  const stats = player && [
    ["Score", player.stats.score],
    ["Buts", player.stats.goals],
    ["Passes déc.", player.stats.assists],
    ["Arrêts", player.stats.saves],
    ["Tirs", player.stats.shots],
  ];
  return (
    <section className="card" aria-labelledby="recap-title">
      <div className="recap">
        <div className="recap-info">
          <h2 id="recap-title" className="title card-title">Récap de la partie</h2>
          <div className="pills">
            <span className="pill">{match.match_type ?? "Match"} ({mode})</span>
            <span className="pill">Durée {duration(match.duration_seconds)}</span>
            <span className="pill">{match.map_name ?? "Map inconnue"}</span>
          </div>
        </div>
        <div className="scoreboard">
          <div className="score-box score-blue"><small>BLEUE</small><strong>{fmt(match.team0_score)}</strong></div>
          <span className="score-sep" aria-hidden="true">–</span>
          <div className="score-box score-orange"><small>ORANGE</small><strong>{fmt(match.team1_score)}</strong></div>
        </div>
        {result && <div className={`winner ${result.className}`}>{result.label}</div>}
      </div>
      {player && (
        <>
          <div className="separator" />
          <div className="mine">
            <div className="mine-head">
              <h3 className="title card-subtitle">Tes stats</h3>
              <span>
                <strong>{player.stats.name}</strong> · {TEAM_NAMES[player.stats.team]}
              </span>
            </div>
            <div>
              <span className="car-pill">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 17h14" />
                  <path d="M3 17v-4l2-5h14l2 5v4" />
                  <circle cx="7.5" cy="17" r="1.5" />
                  <circle cx="16.5" cy="17" r="1.5" />
                </svg>
                <span className="car-pill-label">Voiture</span>
                {fmt(player.stats.car)}
              </span>
            </div>
            <div className="stat-grid">
              {stats.map(([label, value]) => (
                <div key={label} className="stat-card">
                  <span className="stat-label">{label}</span>
                  <span className="stat-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TeamTable({ team, players, selected, onSelectPlayer }) {
  const goals = players.reduce((sum, p) => sum + p.stats.goals, 0);
  return (
    <div className={`table-wrap ${team === 0 ? "blue" : "orange"}`}>
      <table>
        <caption>{TEAM_NAMES[team]} · {goals} buts</caption>
        <thead>
          <tr>
            <th scope="col">Joueur</th>
            <th scope="col">Voiture</th>
            <th scope="col">Score</th>
            <th scope="col">Buts</th>
            <th scope="col">Passes déc.</th>
            <th scope="col">Arrêts</th>
            <th scope="col">Tirs</th>
          </tr>
        </thead>
        <tbody>
          {players.map(({ stats }) => (
            <tr
              key={stats.name}
              className={stats.name === selected ? "selected" : undefined}
              tabIndex={0}
              onClick={() => onSelectPlayer(stats.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPlayer(stats.name);
                }
              }}
            >
              <th scope="row">{stats.name}</th>
              <td>{fmt(stats.car)}</td>
              <td className="strong">{stats.score}</td>
              <td>{stats.goals}</td>
              <td>{stats.assists}</td>
              <td>{stats.saves}</td>
              <td>{stats.shots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Each row: [label, getter(player), suffix]
const DETAIL_GROUPS = [
  {
    title: "Déplacement",
    rows: [
      ["Temps suivi", (p) => p.detail.tracked_time_s, " s"],
      ["Vitesse moyenne", (p) => p.detail.avg_speed],
      ["Supersonique", (p) => p.detail.supersonic_pct, " %"],
      ["Lent", (p) => p.detail.slow_pct, " %"],
    ],
  },
  {
    title: "Positionnement",
    rows: [
      ["Zone défensive", (p) => p.detail.defensive_zone_pct, " %"],
      ["Zone milieu", (p) => p.detail.mid_zone_pct, " %"],
      ["Zone offensive", (p) => p.detail.offensive_zone_pct, " %"],
      ["Derrière la balle", (p) => p.detail.behind_ball_pct, " %"],
      ["1er homme", (p) => p.detail.first_man_pct, " %"],
      ["2e homme", (p) => p.detail.second_man_pct, " %"],
      ["3e homme", (p) => p.detail.third_man_pct, " %"],
      ["Distance moyenne à la balle", (p) => p.detail.avg_ball_distance],
    ],
  },
  {
    title: "Boost",
    rows: [
      ["Niveau moyen", (p) => p.stats.boost.average_level],
      ["À sec", (p) => p.detail.zero_boost_pct, " %"],
      ["Consommé / min", (p) => p.stats.boost.consumed_per_minute],
      ["Petits pads", (p) => p.stats.boost.small_pads],
      ["Gros pads", (p) => p.stats.boost.big_pads],
    ],
  },
  {
    title: "Démolitions",
    rows: [
      ["Infligées", (p) => p.stats.demolitions.inflicted],
      ["Subies", (p) => p.stats.demolitions.received],
    ],
  },
];

function PlayerDetails({ player }) {
  return (
    <div className="detail-grid">
      {DETAIL_GROUPS.map((group) => (
        <section key={group.title} className="detail-box">
          <h4>{group.title}</h4>
          <dl>
            {group.rows.map(([label, getter, suffix]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{fmt(getter(player), suffix)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

const RADAR_VIEWS = [
  ["compare", "Comparaison"],
  ["players", "Un graphique par joueur"],
];

function StyleSection({ players }) {
  const [view, setView] = useState("compare");
  const canSwitch = players.length > 1;
  return (
    <section className="card" aria-labelledby="radar-title">
      <div className="radar-head">
        <h2 id="radar-title" className="title card-title">Style de jeu</h2>
        {canSwitch && (
          <div className="radar-view-switch" role="group" aria-label="Affichage du radar">
            {RADAR_VIEWS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="card-note">Chaque axe est comparé au meilleur des joueurs de la partie (100 %).</p>
      <StyleRadar players={players} view={canSwitch ? view : "compare"} />
    </section>
  );
}

export default function OverviewPage({ report, selectedPlayer, onSelectPlayer }) {
  const { match, players } = report;
  const player = players.find((p) => p.stats.name === selectedPlayer) ?? null;
  return (
    <>
      <h1 className="title page-title">Vue d'ensemble</h1>
      <Recap match={match} player={player} />
      <section className="card" aria-labelledby="players-title">
        <h2 id="players-title" className="title card-title">Tous les joueurs</h2>
        {[0, 1].map((team) => (
          <TeamTable
            key={team}
            team={team}
            players={sortPlayers(players.filter((p) => p.stats.team === team), (p) => p.stats)}
            selected={selectedPlayer}
            onSelectPlayer={onSelectPlayer}
          />
        ))}
      </section>
      <section className="card" aria-labelledby="detail-title">
        <h2 id="detail-title" className="title card-title">
          {player ? `Stats détaillées · ${player.stats.name}` : "Stats détaillées"}
        </h2>
        {player ? (
          <PlayerDetails player={player} />
        ) : (
          <p className="card-note">Sélectionne un joueur dans le header pour voir ses stats détaillées.</p>
        )}
      </section>
      <StyleSection key={report.id} players={players} />
    </>
  );
}
