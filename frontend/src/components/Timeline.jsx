import { useEffect, useMemo, useState } from "react";
import { sortPlayers } from "./playerOrder";
import { buildTimelineEvents } from "./timelineEvents";

const TYPES = {
  goal: {
    label: "But",
    color: "#FFD23F",
    d: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z",
  },
  assist: {
    label: "Passe décisive",
    color: "#B26BFF",
    d: "M3.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M15.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M15.5 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6",
  },
  shot: { label: "Tir", color: "#FFFFFF", d: "M4 12h14M13 6l6 6-6 6" },
  save: { label: "Arrêt", color: "#5EEAD4", d: "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" },
  demo_done: {
    label: "Démolition",
    color: "#A3E635",
    d: "M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19",
  },
  demo_taken: {
    label: "Détruit",
    color: "#FF4D4D",
    d: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9 9l6 6M15 9l-6 6",
  },
};

const TEAMS = {
  0: {
    name: "Équipe bleue",
    dot: "#4D8DFF",
    border: "#1557E0",
    tint: "rgba(21,87,224,0.16)",
    labelBg: "rgba(21,87,224,0.35)",
    goalBar: "#4D8DFF",
  },
  1: {
    name: "Équipe orange",
    dot: "#FF8A1F",
    border: "#B85A00",
    tint: "rgba(255,138,31,0.12)",
    labelBg: "rgba(255,138,31,0.28)",
    goalBar: "#FF8A1F",
  },
};

const TRACK_PX = 716;
const MIN_GAP_PX = 36;

export function formatClock(seconds) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const pct = (t, duration) => `${((t / duration) * 100).toFixed(2)}%`;

function Icon({ type, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TYPES[type].d} />
    </svg>
  );
}

function Score({ blue, orange }) {
  return (
    <strong>
      <span className="timeline-blue">{blue}</span> – <span className="timeline-orange">{orange}</span>
    </strong>
  );
}

function PlayerDot({ team, size = 12 }) {
  return (
    <span
      className="timeline-dot"
      style={{ width: size, height: size, background: team === undefined ? "transparent" : TEAMS[team].dot }}
    />
  );
}

function EventTooltip({ event, teamOf }) {
  const type = TYPES[event.type];
  const other = event.other;
  const otherTeam = other ? teamOf(other) : undefined;
  const score = <Score blue={event.score_team0} orange={event.score_team1} />;
  const isGoalLike = event.type === "goal" || event.type === "assist";
  const scoreLabel = isGoalLike ? "Score après le but" : "Score à ce moment";

  let verb = "";
  let box = null;
  let result = null;
  if (event.type === "goal") {
    verb = "a marqué";
    box = ["Passe décisive", other ?? "Aucune", other ? otherTeam : undefined];
  } else if (event.type === "assist") {
    verb = "a fait la passe";
    box = ["Sur le but de", other ?? "", otherTeam];
  } else if (event.type === "shot") {
    verb = "a tiré";
    result = "Sans but";
  } else if (event.type === "save") {
    verb = "a fait un arrêt";
    result = "Tir repoussé";
  } else if (event.type === "demo_done") {
    verb = "a démoli";
    box = ["Victime", other ?? "", otherTeam];
  } else {
    verb = "a été démoli";
    box = ["Démoli par", other ?? "", otherTeam];
  }

  return (
    <div role="tooltip" className="timeline-tip">
      <div className="timeline-tip-box" style={{ borderColor: type.color }}>
        <div
          className="timeline-tip-head"
          style={{ color: type.color, borderColor: type.color, background: `${type.color}26` }}
        >
          <Icon type={event.type} />
          <span className="timeline-tip-label">{type.label}</span>
          <span className="timeline-tip-time">{formatClock(event.t)}</span>
        </div>
        <div className="timeline-tip-body">
          <div className="timeline-tip-who">
            <PlayerDot team={event.team} />
            {event.player}
            <span className="timeline-tip-verb">{verb}</span>
          </div>
          {box && (
            <div className="timeline-tip-other">
              <span>{box[0]}</span>
              <strong>
                {box[2] !== undefined && <PlayerDot team={box[2]} size={10} />}
                {box[1]}
              </strong>
            </div>
          )}
          {result && (
            <div className="timeline-tip-row">
              <span>Résultat</span>
              <strong>{result}</strong>
            </div>
          )}
          {event.type !== "demo_done" && event.type !== "demo_taken" && (
            <div className="timeline-tip-row">
              <span>{scoreLabel}</span>
              {score}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildTicks(duration) {
  const ticks = [];
  for (let s = 0; s <= duration; s += 60) ticks.push(s);
  const lastMinute = Math.floor(duration / 60) * 60;
  if (duration !== lastMinute && ((duration - lastMinute) * TRACK_PX) / duration >= MIN_GAP_PX) {
    ticks.push(duration);
  }
  return ticks;
}

// `onSelectEvent(event)` makes the events clickable; `currentTime` draws a playhead (both optional).
export default function Timeline({ report, selectedPlayer, onSelectEvent, currentTime }) {
  const [hover, setHover] = useState(null);
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set());
  const duration = report.timeline_seconds;

  function toggleType(type) {
    setHover(null);
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (!next.delete(type)) next.add(type);
      return next;
    });
  }
  const events = useMemo(() => buildTimelineEvents(report.events ?? []), [report.events]);

  useEffect(() => {
    if (!hover) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setHover(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hover]);

  if (events.length === 0 || !duration) {
    return (
      <p className="card-note">
        Aucun événement disponible pour cette partie. Réimporte le replay pour afficher la frise.
      </p>
    );
  }

  const players = report.players.map((p) => p.stats);
  const lanes = sortPlayers(players);
  const teamByName = new Map(players.map((p) => [p.name, p.team]));
  const teamOf = (name) => teamByName.get(name);
  const ticks = buildTicks(duration);
  const goals = hiddenTypes.has("goal") ? [] : events.filter((e) => e.type === "goal");

  const hovered = hover === null ? null : events[hover.eventIndex];
  const hoveredLane = hover === null ? -1 : lanes.findIndex((p) => p.name === hovered.player);

  return (
    <>
      <ul aria-label="Légende" className="timeline-legend">
        {Object.entries(TYPES).map(([type, { label, color }]) => (
          <li key={type}>
            <button
              type="button"
              className="timeline-legend-toggle"
              aria-pressed={!hiddenTypes.has(type)}
              onClick={() => toggleType(type)}
            >
              <span className="timeline-legend-icon" style={{ color }}>
                <Icon type={type} />
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="timeline-scroll">
        <div className="timeline-inner">
          <div className="timeline-axis-row">
            <div className="timeline-axis-spacer" />
            <div className="timeline-axis">
              {ticks.map((s) => (
                <span key={s} className="timeline-tick" style={{ left: pct(s, duration) }}>
                  {formatClock(s)}
                </span>
              ))}
            </div>
          </div>

          <div className="timeline-lanes">
            <div aria-hidden="true" className="timeline-overlay timeline-goal-bars">
              {goals.map((g, i) => (
                <span
                  key={i}
                  className="timeline-goal-bar"
                  style={{ left: pct(g.t, duration), borderColor: TEAMS[g.team].goalBar }}
                />
              ))}
            </div>
            {currentTime != null && (
              <div aria-hidden="true" className="timeline-overlay timeline-playhead-layer">
                <span
                  className="timeline-playhead"
                  style={{ left: pct(Math.min(Math.max(currentTime, 0), duration), duration) }}
                />
              </div>
            )}
            <div className="timeline-overlay timeline-tip-layer">
              {hovered && hoveredLane >= 0 && (
                <div
                  className="timeline-tip-pos"
                  style={{
                    left: pct(hovered.t, duration),
                    top: `${hoveredLane * 50 + 11}px`,
                    transform: `translate(${hovered.t / duration > 0.8 ? "-88%" : "-50%"}, -100%)`,
                  }}
                >
                  <EventTooltip event={hovered} teamOf={teamOf} />
                </div>
              )}
            </div>
            {lanes.map((p) => {
              const team = TEAMS[p.team];
              return (
                <div
                  key={p.name}
                  className="timeline-lane"
                  style={{
                    borderColor: p.name === selectedPlayer ? "#FFFFFF" : team.border,
                    background: team.tint,
                  }}
                >
                  <div
                    className="timeline-lane-label"
                    title={team.name}
                    style={{ background: team.labelBg, borderRightColor: p.name === selectedPlayer ? "#FFFFFF" : team.border }}
                  >
                    <span className="timeline-lane-name">
                      <span className="timeline-dot" style={{ width: 12, height: 12, background: team.dot }} />
                      {p.name}
                    </span>
                  </div>
                  <div role="group" aria-label={`Événements de ${p.name}`} className="timeline-track">
                    {ticks.map((s) => (
                      <span
                        key={s}
                        aria-hidden="true"
                        className="timeline-grid"
                        style={{ left: pct(s, duration) }}
                      />
                    ))}
                    {events.map((event, eventIndex) =>
                      event.player === p.name && !hiddenTypes.has(event.type) ? (
                        <button
                          key={eventIndex}
                          type="button"
                          className={onSelectEvent ? "timeline-event timeline-event-click" : "timeline-event"}
                          style={{ left: pct(event.t, duration), color: TYPES[event.type].color }}
                          aria-label={`${TYPES[event.type].label} à ${formatClock(event.t)}${onSelectEvent ? " : voir le replay" : ""}`}
                          onClick={onSelectEvent ? () => onSelectEvent(event) : undefined}
                          onMouseEnter={() => setHover({ eventIndex })}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover({ eventIndex })}
                          onBlur={() => setHover(null)}
                        >
                          <Icon type={event.type} />
                        </button>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="timeline-score-row">
            <div className="timeline-score-label">Score</div>
            <div className="timeline-axis">
              {goals.map((g, i) => (
                <span
                  key={i}
                  role="img"
                  aria-label={`Score ${g.score_team0} à ${g.score_team1} à ${formatClock(g.t)}`}
                  className="timeline-score-pill"
                  style={{ left: pct(g.t, duration), borderColor: TEAMS[g.team].goalBar }}
                >
                  <span className="timeline-blue">{g.score_team0}</span>
                  <span className="timeline-sep">&nbsp;–&nbsp;</span>
                  <span className="timeline-orange">{g.score_team1}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
