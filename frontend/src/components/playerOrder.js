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

// Groups the players by team: [{ team, players }] in the order blue (0), orange (1), no team (null).
// Only the teams that have players are returned; each group is sorted with sortPlayers.
export function groupByTeam(players, getStats = (p) => p) {
  const teamOf = (p) => {
    const team = getStats(p).team;
    return team === 0 || team === 1 ? team : null;
  };
  return [0, 1, null]
    .map((team) => ({ team, players: sortPlayers(
      players.filter((p) => teamOf(p) === team),
      (p) => ({ ...getStats(p), team: teamOf(p) })
    ) }))
    .filter((group) => group.players.length > 0);
}
