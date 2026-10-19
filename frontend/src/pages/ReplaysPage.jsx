import { useEffect, useState } from "react";
import { listReplays } from "../api/client.js";

export default function ReplaysPage({ refreshKey }) {
  const [replays, setReplays] = useState([]);

  useEffect(() => {
    listReplays().then(setReplays).catch(() => setReplays([]));
  }, [refreshKey]);

  return (
    <section>
      <h2>Replays ({replays.length})</h2>
      <ul>
        {replays.map((r) => (
          <li key={r.id}>
            {r.filename} — {(r.size_bytes / 1024).toFixed(0)} Ko
          </li>
        ))}
      </ul>
    </section>
  );
}
