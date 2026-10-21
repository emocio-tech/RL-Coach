import { useEffect, useRef, useState } from "react";
import { listReplays } from "../api/client.js";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function ReplayPicker({ onOpen }) {
  const [replays, setReplays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    listReplays()
      .then((items) => !cancelled && setReplays(items))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selected = replays.find((r) => r.id === selectedId);
  const empty = !loading && !error && replays.length === 0;
  let label = "Sélectionne une partie";
  if (loading) label = "Chargement…";
  else if (empty) label = "Aucune partie importée";
  else if (selected) label = selected.original_filename;

  return (
    <>
      <div className="picker" ref={rootRef} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
        <button
          type="button"
          className="picker-btn"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={loading || empty}
          onClick={() => setOpen(!open)}
        >
          <span className="picker-label">{label}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div role="listbox" aria-label="Parties déjà importées" className="picker-list">
            {replays.map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={r.id === selectedId}
                className="picker-option"
                onClick={() => {
                  setSelectedId(r.id);
                  setOpen(false);
                }}
              >
                <span className="picker-option-head">
                  <span className="picker-file">{r.original_filename}</span>
                  {r.team0_score != null && r.team1_score != null && (
                    <span className="picker-score">
                      <span className="team-blue">{r.team0_score}</span> – <span className="team-orange">{r.team1_score}</span>
                    </span>
                  )}
                </span>
                <span className="picker-meta">
                  importé le {dateFormat.format(new Date(r.imported_at))}
                  {r.map_name ? ` · ${r.map_name}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="button" className="cta cta-orange" disabled={!selected} onClick={() => onOpen(selected.id)}>
        Voir les stats
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </button>
    </>
  );
}
