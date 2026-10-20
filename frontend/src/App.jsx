import { useState } from "react";
import { getReplayStats } from "./api/client.js";
import Layout from "./components/Layout.jsx";
import ReplayUpload from "./components/ReplayUpload.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";

function Home({ onUploaded, error, hasReport, onOpenReport }) {
  return (
    <div className="app">
      <div className="home">
        <div className="logo">
          <div className="logo-ball" />
          <span className="logo-text">
            RL-<span>COACH</span>
          </span>
        </div>
        <section className="home-hero">
          <h1 className="title">
            Prêt pour <span className="team-blue">le kick-off</span> <span className="team-orange">?</span>
          </h1>
          <p>Importe un nouveau replay pour voir tes stats.</p>
        </section>
        <section className="card" aria-labelledby="import-title">
          <h2 id="import-title" className="title card-title">Nouveau replay</h2>
          <ReplayUpload onUploaded={onUploaded} />
          {error && <p className="alert" role="alert">{error}</p>}
          {hasReport && (
            <button type="button" className="nav-link" onClick={onOpenReport}>
              Revoir la dernière partie importée
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [report, setReport] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [error, setError] = useState(null);

  async function handleUploaded(result) {
    setError(null);
    try {
      setReport(await getReplayStats(result.id));
      setSelectedPlayer(null);
      setPage("overview");
    } catch (err) {
      setError(err.message);
    }
  }

  if (page === "home" || !report) {
    return (
      <Home
        onUploaded={handleUploaded}
        error={error}
        hasReport={Boolean(report)}
        onOpenReport={() => setPage("overview")}
      />
    );
  }

  return (
    <Layout
      page={page}
      onNavigate={setPage}
      players={report.players.map((p) => p.stats)}
      selectedPlayer={selectedPlayer}
      onSelectPlayer={setSelectedPlayer}
    >
      <OverviewPage report={report} selectedPlayer={selectedPlayer} />
    </Layout>
  );
}
