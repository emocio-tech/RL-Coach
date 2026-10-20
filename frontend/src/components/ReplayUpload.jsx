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
    <section>
      <input type="file" accept=".replay" onChange={handleChange} disabled={loading} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
