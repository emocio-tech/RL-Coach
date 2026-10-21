import { useEffect, useMemo, useRef, useState } from "react";
import { getReplayTracks } from "../api/client.js";
import Timeline from "../components/Timeline.jsx";
import { sortPlayers } from "../components/playerOrder.js";
import { createEngine } from "../viewer3d/engine.js";

const LEAD_IN = 3; // seconds shown before a timeline event

const MODES = [
  ["orbit", "Libre"],
  ["broadcast", "Diffusion"],
  ["ballcam", "Cam balle"],
  ["chase", "Poursuite"],
  ["top", "Dessus"],
];
const RATES = [0.25, 0.5, 1, 2, 4];
const TEAM_CSS = { 0: "var(--blue-light)", 1: "var(--orange)" };

const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function scoreAt(goals, time) {
  const score = [0, 0];
  for (const g of goals) if (g.seconds <= time) score[g.team] += 1;
  return score;
}

export default function Match3DPage({ report, selectedPlayer, onSelectPlayer }) {
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState({ time: 0, playing: false, players: [] });
  const [mode, setMode] = useState("broadcast");
  const [rate, setRate] = useState(1);
  const [labels, setLabels] = useState(true);

  const players = sortPlayers(report.players.map((p) => p.stats));
  const teamByName = Object.fromEntries(players.map((p) => [p.name, p.team]));
  const target = selectedPlayer ?? players[0]?.name;
  const events = report.events ?? [];
  const goals = useMemo(() => events.filter((e) => e.type === "goal"), [events]);
  const demolitions = useMemo(() => events.filter((e) => e.type === "demolition"), [events]);

  useEffect(() => {
    let cancelled = false;
    setTracks(null);
    setError(null);
    getReplayTracks(report.id)
      .then((data) => !cancelled && setTracks(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  useEffect(() => {
    if (!tracks || !containerRef.current) return undefined;
    let engine;
    try {
      engine = createEngine({ container: containerRef.current, tracks, onTick: setLive });
    } catch (err) {
      setError(`Le replay n'a pas pu démarrer (WebGL indisponible ?) : ${err.message}`);
      return undefined;
    }
    engineRef.current = engine;
    engine.setCamera(mode, target);
    engine.setRate(rate);
    engine.setLabels(labels);
    engine.setPlaying(true);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // The engine is rebuilt only when the tracks change; the other settings are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // The goals (ball hidden + explosion) are pushed after the engine is created, without rebuilding it.
  useEffect(() => {
    engineRef.current?.setGoals(goals.map((g) => ({ t: g.seconds })));
  }, [goals, tracks]);
  // The demolitions (car hidden until its respawn + red explosion) are pushed the same way.
  useEffect(() => {
    engineRef.current?.setDemolitions(demolitions.map((d) => ({ t: d.seconds, victim: d.victim })));
  }, [demolitions, tracks]);
  useEffect(() => {
    engineRef.current?.setCamera(mode, target);
  }, [mode, target]);
  useEffect(() => {
    engineRef.current?.setRate(rate);
  }, [rate]);
  useEffect(() => {
    engineRef.current?.setLabels(labels);
  }, [labels]);

  const engine = engineRef.current;
  const duration = engine?.duration ?? tracks?.ball.t.at(-1) ?? 0;
  const score = scoreAt(goals, live.time);
  const lastGoal = [...goals].reverse().find((g) => g.seconds <= live.time && live.time - g.seconds < 4);
  const assist = lastGoal && events.find((e) => e.type === "assist" && Math.abs(e.seconds - lastGoal.seconds) < 1.5 && e.team === lastGoal.team);

  const playLabel = live.playing ? "Pause" : live.time >= duration ? "Rejouer" : "Lecture";

  function togglePlay() {
    engineRef.current?.setPlaying(!live.playing);
  }
  function seek(delta) {
    const e = engineRef.current;
    if (e) e.setTime(e.getTime() + delta);
  }
  function onKeyDown(event) {
    if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") return;
    if (event.code === "Space") {
      if (event.target.tagName === "BUTTON") return;
      event.preventDefault();
      togglePlay();
    } else if (event.code === "ArrowRight") seek(event.shiftKey ? 1 : 5);
    else if (event.code === "ArrowLeft") seek(event.shiftKey ? -1 : -5);
    else if (/^Digit[1-5]$/.test(event.code)) setMode(MODES[Number(event.code.slice(-1)) - 1][0]);
  }
  // Jumps the replay to a few seconds before a timeline event and plays it.
  function goToEvent(event) {
    const e = engineRef.current;
    if (!e) return;
    const time = Math.max(e.start, event.t - LEAD_IN);
    e.setTime(time);
    e.setPlaying(true);
    setLive((l) => ({ ...l, time, playing: true }));
    if ((mode === "ballcam" || mode === "chase") && event.player) onSelectPlayer(event.player);
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function fullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  }

  return (
    <>
      <h1 className="title page-title">Replay</h1>
      <section className="card viewer-card" aria-label="Rediffusion 3D du match">
        <div className="viewer-stage" ref={stageRef} tabIndex={0} onKeyDown={onKeyDown}>
          <div className="viewer-canvas" ref={containerRef} />

          {!tracks && !error && <p className="viewer-message">Chargement des trajectoires…</p>}
          {error && <p className="viewer-message viewer-error" role="alert">{error}</p>}

          {tracks && !error && (
            <>
              <div className="viewer-hud viewer-score" aria-label="Score">
                <span className="vs-team vs-blue">{score[0]}</span>
                <span className="vs-clock">{clock(live.time)}</span>
                <span className="vs-team vs-orange">{score[1]}</span>
              </div>

              <div className="viewer-hud viewer-modes">
                {MODES.map(([id, label], k) => (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    aria-pressed={mode === id}
                    title={`Raccourci : ${k + 1}`}
                    onClick={() => setMode(id)}
                  >
                    {label}
                  </button>
                ))}
                <button type="button" className="chip" aria-pressed={labels} onClick={() => setLabels(!labels)}>Noms</button>
                <button type="button" className="chip" onClick={fullscreen}>Plein écran</button>
              </div>

              <div className="viewer-hud viewer-cards">
                {sortPlayers(
                  live.players.length ? live.players.map((p) => ({ ...p, team: p.team ?? teamByName[p.name] })) : players.map((p) => ({ ...p, boost: 0, speed: 0, visible: true }))
                ).map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="pcard"
                    aria-pressed={p.name === target}
                    style={{ "--team": TEAM_CSS[p.team] }}
                    onClick={() => {
                      onSelectPlayer(p.name);
                      setMode("ballcam");
                    }}
                    title="Suivre ce joueur en cam balle"
                  >
                    <span className="pcard-name">{p.name}{!p.visible && " · démoli"}</span>
                    <span className="pcard-bar"><i style={{ width: `${Math.round(p.boost)}%` }} /></span>
                    <span className="pcard-speed">{Math.round(p.boost)} boost · {Math.round(p.speed * 0.036)} km/h</span>
                  </button>
                ))}
              </div>

              {lastGoal && (
                <div className="viewer-goal" style={{ "--team": TEAM_CSS[lastGoal.team] }}>
                  <strong>BUT !</strong>
                  <span>{lastGoal.player}{assist ? ` · passe de ${assist.player}` : ""}</span>
                </div>
              )}
            </>
          )}
        </div>

        {tracks && !error && (
          <div className="viewer-controls">
            <button type="button" className="chip chip-main" onClick={togglePlay} aria-label={playLabel} title={playLabel}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {live.playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4l13 8-13 8z" />}
              </svg>
            </button>
            <span className="viewer-time">{clock(live.time)} / {clock(duration)}</span>
            <div className="viewer-scrub">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={live.time}
                aria-label="Position dans le match"
                onChange={(e) => {
                  engineRef.current?.setTime(Number(e.target.value));
                  setLive((l) => ({ ...l, time: Number(e.target.value) }));
                }}
              />
              <div className="viewer-marks" aria-hidden="true">
                {demolitions.map((d, k) => (
                  <i key={`d${k}`} className="mark mark-demo" style={{ left: `${(d.seconds / duration) * 100}%` }} />
                ))}
                {goals.map((g, k) => (
                  <i key={`g${k}`} className="mark mark-goal" style={{ left: `${(g.seconds / duration) * 100}%`, "--team": TEAM_CSS[g.team] }} title={`${clock(g.seconds)} · ${g.player}`} />
                ))}
              </div>
            </div>
            <label className="viewer-rate">
              Vitesse
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                {RATES.map((r) => <option key={r} value={r}>×{r}</option>)}
              </select>
            </label>
          </div>
        )}
        <p className="card-note">
          Clique-glisse pour tourner, molette pour zoomer (mode Libre). Raccourcis : Espace = lecture/pause, ← → = ±5 s, 1 à 5 = caméras.
          Les caméras « Cam balle » et « Poursuite » suivent le joueur choisi ; clique sur sa carte pour le suivre en cam balle.
        </p>
      </section>

      <section className="card" aria-labelledby="frise3d-title">
        <h2 id="frise3d-title" className="title card-title">Frise du match</h2>
        <p className="card-note">Clique sur un événement pour revoir ce moment dans le replay ({LEAD_IN} s avant).</p>
        <Timeline
          report={report}
          selectedPlayer={selectedPlayer}
          onSelectEvent={goToEvent}
          currentTime={tracks ? live.time : undefined}
        />
      </section>
    </>
  );
}
