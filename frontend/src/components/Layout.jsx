import { useState } from "react";

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
          {players.map((p) => (
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
      )}
    </div>
  );
}

function NavLink({ id, page, onNavigate, disabled, children }) {
  return (
    <button
      type="button"
      className="nav-link"
      aria-current={page === id ? "page" : undefined}
      disabled={disabled}
      onClick={() => onNavigate(id)}
    >
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
            <NavLink id="timeline" page={page} onNavigate={onNavigate} disabled>Timeline</NavLink>
          </div>
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
