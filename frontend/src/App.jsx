import { lazy, Suspense, useMemo, useState } from "react";
import { getReplayStats } from "./api/client.js";
import ChatBubble from "./components/ChatBubble.jsx";
import Layout from "./components/Layout.jsx";
import ReplayPicker from "./components/ReplayPicker.jsx";
import ReplayUpload from "./components/ReplayUpload.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import TimelinePage from "./pages/TimelinePage.jsx";

const Match3DPage = lazy(() => import("./pages/Match3DPage.jsx"));

function Home({ onUploaded, onOpenGame, error, hasReport, onOpenReport }) {
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
          <p>Importe un nouveau replay ou rouvre une partie déjà analysée pour voir tes stats.</p>
        </section>
        <div className="home-blocks">
          <section className="card" aria-labelledby="import-title">
            <h2 id="import-title" className="title card-title card-heading">
              <span className="step-badge">1</span>
              Nouveau replay
            </h2>
            <ReplayUpload onUploaded={onUploaded} />
            {error && <p className="alert" role="alert">{error}</p>}
            <button type="button" className="cta cta-blue" disabled={!hasReport} onClick={onOpenReport}>
              Revoir la dernière partie importée
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </section>
          <section className="card card-orange" aria-labelledby="existing-title">
            <h2 id="existing-title" className="title card-title card-heading">
              <span className="step-badge">2</span>
              Partie existante
            </h2>
            <ReplayPicker onOpen={onOpenGame} />
          </section>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [report, setReport] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [error, setError] = useState(null);

  function handleUploaded(result) {
    return openGame(result.id);
  }

  async function openGame(id) {
    setError(null);
    try {
      setReport(await getReplayStats(id));
      setSelectedPlayer(null);
      setPage("overview");
    } catch (err) {
      setError(err.message);
    }
  }

  const playerNames = useMemo(() => report?.players.map((p) => p.stats.name), [report]);

  const content =
    page === "home" || !report ? (
      <Home
        onUploaded={handleUploaded}
        onOpenGame={openGame}
        error={error}
        hasReport={Boolean(report)}
        onOpenReport={() => setPage("overview")}
      />
    ) : (
      <Layout
        page={page}
        onNavigate={setPage}
        players={report.players.map((p) => p.stats)}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
      >
        {page === "match3d" ? (
          <Suspense fallback={<p className="empty">Chargement de la vue 3D…</p>}>
            <Match3DPage report={report} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} />
          </Suspense>
        ) : page === "timeline" ? (
          <TimelinePage report={report} selectedPlayer={selectedPlayer} />
        ) : (
          <OverviewPage report={report} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} />
        )}
      </Layout>
    );

  return (
    <>
      {content}
      <ChatBubble gameId={report?.id} players={playerNames} selectedPlayer={selectedPlayer} />
    </>
  );
}
