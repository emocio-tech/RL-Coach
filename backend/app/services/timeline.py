from dataclasses import dataclass

from app.schemas.replay import MatchEvent

# Keep in sync with frontend/src/components/timelineEvents.js
ASSIST_WINDOW = 0.5
TYPE_ORDER = ["goal", "assist", "shot", "save", "demo_done", "demo_taken"]


@dataclass
class TimelineEvent:
    type: str  # one of TYPE_ORDER
    seconds: float
    player: str
    team: int
    other: str | None  # goal: assister, assist: scorer, demo_done: victim, demo_taken: attacker
    score_team0: int
    score_team1: int


def build_timeline_events(raw_events: list[MatchEvent]) -> list[TimelineEvent]:
    """Turn raw match events into timeline events.

    Goals and assists are linked, demolitions are split in two (done / taken) and the score is attached."""
    events = sorted(raw_events, key=lambda e: e.seconds)
    goals = [e for e in events if e.type == "goal"]
    assists = [e for e in events if e.type == "assist"]

    assist_of_goal: dict[int, MatchEvent] = {}
    goal_of_assist: dict[int, MatchEvent] = {}
    for goal in goals:
        best: tuple[MatchEvent, float] | None = None
        for assist in assists:
            if id(assist) in goal_of_assist or assist.player == goal.player or assist.team != goal.team:
                continue
            delta = abs(assist.seconds - goal.seconds)
            if delta <= ASSIST_WINDOW and (best is None or delta < best[1]):
                best = (assist, delta)
        if best:
            assist_of_goal[id(goal)] = best[0]
            goal_of_assist[id(best[0])] = goal

    def score_at(team: int, seconds: float) -> int:
        return sum(1 for g in goals if g.team == team and g.seconds <= seconds)

    def make(kind: str, event: MatchEvent, player: str, team: int, other: str | None) -> TimelineEvent:
        return TimelineEvent(
            type=kind,
            seconds=event.seconds,
            player=player,
            team=team,
            other=other,
            score_team0=score_at(0, event.seconds),
            score_team1=score_at(1, event.seconds),
        )

    result: list[TimelineEvent] = []
    for event in events:
        if event.type == "demolition":
            victim_team = 1 if event.team == 0 else 0
            result.append(make("demo_done", event, event.player, event.team, event.victim))
            if event.victim is not None:
                result.append(make("demo_taken", event, event.victim, victim_team, event.player))
        elif event.type == "goal":
            assist = assist_of_goal.get(id(event))
            result.append(make("goal", event, event.player, event.team, assist.player if assist else None))
        elif event.type == "assist":
            goal = goal_of_assist.get(id(event))
            result.append(make("assist", event, event.player, event.team, goal.player if goal else None))
        else:
            result.append(make(event.type, event, event.player, event.team, None))
    return sorted(result, key=lambda e: (e.seconds, TYPE_ORDER.index(e.type)))
