import { useState } from "react";
import { groupByTeam } from "./playerOrder.js";

export const TEAM_NAMES = { 0: "Équipe bleue", 1: "Équipe orange" };
const TEAM_DOT = { 0: "var(--blue-light)", 1: "var(--orange)" };

function Logo() {
  return (
    <div className="logo">
      <div className="logo-ball" />
      <span className="logo-text">
        RL-<span>COACH</span>
      </span>
    </div>
  );
}

function PlayerSelect({ players, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const current = players.find((p) => p.name === selected);

  function pick(name) {
    onSelect(name);
    setOpen(false);
  }

  return (
    <div className="player-select">
      <span id="player-label" className="player-select-label">Joueur</span>
      <button
        type="button"
        className="select-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby="player-label"
        onClick={() => setOpen(!open)}
      >
        <span className="select-btn-main">
          {current && <span className="dot" style={{ background: TEAM_DOT[current.team] }} />}
          <span style={{ color: current ? "#fff" : "var(--muted)" }}>
            {current ? current.name : "Sélectionne un joueur"}
          </span>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="listbox" aria-label="Joueurs de la partie" className="listbox">
          {groupByTeam(players).map((group) => (
            <div key={group.team ?? "none"} role="group" aria-labelledby={`team-${group.team ?? "none"}`} className="option-group">
              <span
                id={`team-${group.team ?? "none"}`}
                className="option-group-title"
                style={{ color: TEAM_DOT[group.team] ?? "var(--muted)" }}
              >
                {TEAM_NAMES[group.team] ?? "Sans équipe"}
              </span>
              {group.players.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  role="option"
                  className="option"
                  aria-selected={p.name === selected}
                  onClick={() => pick(p.name)}
                >
                  <span className="dot" style={{ background: TEAM_DOT[p.team] }} />
                  <span className="option-name">{p.name}</span>
                  <span className="option-team">{TEAM_NAMES[p.team]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// SVG shapes (24x24 stroke icons) shown before each sidebar label
const NAV_ICONS = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  overview: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  match3d: <><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
  positioning: <><path d="M3 17l5-6 4 3 5-8 4 5" /><path d="M3 21h18" /></>,
  heatmaps: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
};

function NavLink({ id, page, onNavigate, disabled, children }) {
  return (
    <button
      type="button"
      className="nav-link"
      aria-current={page === id ? "page" : undefined}
      disabled={disabled}
      onClick={() => onNavigate(id)}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {NAV_ICONS[id]}
      </svg>
      {children}
    </button>
  );
}

export default function Layout({ page, onNavigate, players, selectedPlayer, onSelectPlayer, children }) {
  return (
    <div className="app">
      <header className="header">
        <Logo />
        <PlayerSelect players={players} selected={selectedPlayer} onSelect={onSelectPlayer} />
      </header>
      <div className="body">
        <nav className="sidebar" aria-label="Navigation principale">
          <NavLink id="home" page={page} onNavigate={onNavigate}>Accueil</NavLink>
          <div className="nav-group" role="group" aria-labelledby="nav-stats">
            <span id="nav-stats" className="nav-title">Statistiques</span>
            <NavLink id="overview" page={page} onNavigate={onNavigate}>Vue d'ensemble</NavLink>
          </div>
          <div className="nav-group" role="group" aria-labelledby="nav-flow">
            <span id="nav-flow" className="nav-title">Déroulé</span>
            <NavLink id="match3d" page={page} onNavigate={onNavigate}>Replay</NavLink>
            <NavLink id="positioning" page={page} onNavigate={onNavigate}>Positionnement</NavLink>
            <NavLink id="heatmaps" page={page} onNavigate={onNavigate}>Heatmaps</NavLink>
          </div>
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
