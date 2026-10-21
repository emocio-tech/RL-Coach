import { useState } from "react";
import { uploadReplay } from "../api/client.js";

export default function ReplayUpload({ onUploaded }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await uploadReplay(file);
      onUploaded?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <label className={`drop${loading ? " busy" : ""}`}>
        {loading && <div className="spinner" role="status" aria-label="Analyse en cours" />}
        <strong>{loading ? "Analyse en cours…" : "Importe ton fichier .replay"}</strong>
        <span>{loading ? "Cela peut prendre quelques secondes" : "Clique pour le chercher sur ton ordinateur"}</span>
        <input type="file" accept=".replay" onChange={handleChange} disabled={loading} />
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
    </>
  );
}
