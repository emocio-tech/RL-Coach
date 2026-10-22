import { useEffect, useState } from "react";
import { getReplayHeatmaps } from "../api/client.js";
import { HeatmapChart } from "../components/Charts.jsx";

export default function HeatmapsPage({ report, selectedPlayer }) {
  const [heatmaps, setHeatmaps] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHeatmaps(null);
    setError(null);
    getReplayHeatmaps(report.id)
      .then((data) => !cancelled && setHeatmaps(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  const player = report.players.find((p) => p.stats.name === selectedPlayer) ?? null;
  const playerHeatmap = player && heatmaps?.players.find((p) => p.name === player.stats.name);

  let content;
  if (error) {
    content = (
      <p className="empty" role="alert">
        Impossible de charger les heatmaps de cette partie ({error}). Réessaie en rouvrant la partie.
      </p>
    );
  } else if (!heatmaps) {
    content = <p className="empty">Chargement des heatmaps…</p>;
  } else {
    content = (
      <div className="heatmap-grid">
        <HeatmapChart
          bare
          variant="ball"
          title="Déplacements du ballon"
          subtitle="Sur toute la durée du match"
          heatmap={heatmaps.ball}
        />
        {player &&
          (playerHeatmap ? (
            <HeatmapChart
              bare
              player={player.stats.name}
              team={player.stats.team}
              heatmap={playerHeatmap.heatmap}
            />
          ) : (
            <p className="empty">Pas de données de position pour {player.stats.name}.</p>
          ))}
      </div>
    );
  }

  return (
    <>
      <h1 className="title page-title">Heatmaps</h1>
      {content}
    </>
  );
}
