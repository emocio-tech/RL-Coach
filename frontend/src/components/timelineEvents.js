const ASSIST_WINDOW = 0.5;
const TYPE_ORDER = ["goal", "assist", "shot", "save", "demo_done", "demo_taken"];

// Turns the raw match events (seconds, type, player, team, victim) into timeline events:
// goals and assists are linked, demolitions are split in two, and the score is attached.
export function buildTimelineEvents(rawEvents) {
  const events = [...rawEvents].sort((a, b) => a.seconds - b.seconds);
  const goals = events.filter((e) => e.type === "goal");
  const assists = events.filter((e) => e.type === "assist");

  const assistOfGoal = new Map();
  const goalOfAssist = new Map();
  for (const goal of goals) {
    let best = null;
    for (const assist of assists) {
      if (goalOfAssist.has(assist) || assist.player === goal.player || assist.team !== goal.team) continue;
      const delta = Math.abs(assist.seconds - goal.seconds);
      if (delta <= ASSIST_WINDOW && (best === null || delta < best.delta)) best = { assist, delta };
    }
    if (best) {
      assistOfGoal.set(goal, best.assist);
      goalOfAssist.set(best.assist, goal);
    }
  }

  const scoreAt = (team, t) => goals.filter((g) => g.team === team && g.seconds <= t).length;
  const make = (type, event, player, team, other) => ({
    type,
    t: event.seconds,
    player,
    team,
    other,
    score_team0: scoreAt(0, event.seconds),
    score_team1: scoreAt(1, event.seconds),
  });

  const result = [];
  for (const event of events) {
    if (event.type === "demolition") {
      const victimTeam = event.team === 0 ? 1 : 0;
      result.push(make("demo_done", event, event.player, event.team, event.victim ?? null));
      result.push(make("demo_taken", event, event.victim, victimTeam, event.player));
    } else if (event.type === "goal") {
      result.push(make("goal", event, event.player, event.team, assistOfGoal.get(event)?.player ?? null));
    } else if (event.type === "assist") {
      result.push(make("assist", event, event.player, event.team, goalOfAssist.get(event)?.player ?? null));
    } else {
      result.push(make(event.type, event, event.player, event.team, null));
    }
  }
  return result.sort((a, b) => a.t - b.t || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}
