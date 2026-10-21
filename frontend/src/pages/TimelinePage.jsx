import Timeline from "../components/Timeline.jsx";

export default function TimelinePage({ report, selectedPlayer }) {
  return (
    <>
      <h1 className="title page-title">Timeline</h1>
      <section className="card" aria-labelledby="frise-title">
        <h2 id="frise-title" className="title card-title">Frise du match</h2>
        <Timeline report={report} selectedPlayer={selectedPlayer} />
      </section>
    </>
  );
}
