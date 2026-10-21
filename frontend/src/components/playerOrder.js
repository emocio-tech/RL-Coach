// Returns a sorted copy of the players: by team, then by name (accent/case-insensitive).
// getStats extracts the { team, name } object from an item (identity by default).
export function sortPlayers(players, getStats = (p) => p) {
  return [...players].sort((a, b) => {
    const sa = getStats(a);
    const sb = getStats(b);
    return (
      (sa.team ?? 2) - (sb.team ?? 2) ||
      sa.name.localeCompare(sb.name, "fr", { sensitivity: "base" })
    );
  });
}
