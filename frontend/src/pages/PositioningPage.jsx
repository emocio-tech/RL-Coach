import { useState } from "react";
import { BallPositionChart, DistanceChart } from "../components/Charts.jsx";
import { FULL_VIEW } from "../components/chartGeometry.js";
import { TEAM_NAMES } from "../components/Layout.jsx";

export default function PositioningPage({ report, selectedPlayer }) {
  // Zoom and scroll of the time axis, shared by both charts.
  const [view, setView] = useState(FULL_VIEW);
  const player = report.players.find((p) => p.stats.name === selectedPlayer) ?? null;
  const name = player?.stats.name;
  const label = player && `${name} · ${TEAM_NAMES[player.stats.team]}`;
  return (
    <>
      <h1 className="title page-title">Positionnement</h1>
      <section className="card" aria-labelledby="ball-position-title">
        <h2 id="ball-position-title" className="title card-title">Position de la balle</h2>
        <p className="card-note">
          {player
            ? `Où se trouvaient la balle et ${name} au fil du match : plus la zone ou la ligne pointillée est haute, plus ils sont proches de la cage bleue.`
            : "Où se trouvait la balle au fil du match : plus la zone est haute, plus la balle est proche de la cage bleue."}
        </p>
        <BallPositionChart
          ballY={report.ball_y}
          playerY={player ? player.detail.y ?? [] : undefined}
          playerLabel={label}
          sampleSeconds={report.sample_seconds}
          view={view}
          onViewChange={setView}
        />
      </section>
      {player ? (
        <section className="card" aria-labelledby="ball-distance-title">
          <h2 id="ball-distance-title" className="title card-title">Distance à la balle</h2>
          <p className="card-note chart-subtitle">
            <span
              className="dot"
              style={{ background: player.stats.team === 0 ? "var(--blue-light)" : "var(--orange)" }}
            />
            <strong>{name}</strong> · {TEAM_NAMES[player.stats.team]}
          </p>
          <DistanceChart
            distance={player.detail.ball_distance ?? []}
            sampleSeconds={report.sample_seconds}
            view={view}
            onViewChange={setView}
          />
        </section>
      ) : (
        <p className="card-note empty">
          Sélectionne un joueur dans le menu du header pour afficher sa position et sa distance à la balle.
        </p>
      )}
    </>
  );
}
