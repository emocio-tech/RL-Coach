async function request(path, options) {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export function uploadReplay(file) {
  const form = new FormData();
  form.append("file", file);
  return request("/replays", { method: "POST", body: form });
}

export function getReplayStats(id) {
  return request(`/replays/${id}/stats`);
}
