"""Cross-match analysis: aggregates the stats of one player over several imported games."""

from app.schemas.replay import GameReport, PlayerReport
from app.services import storage

MAX_LAST_N = 20
MIN_GAMES_NOTE = 3
MIN_GAMES_TREND = 4
MAX_AVAILABLE_PLAYERS = 50

INSUFFICIENT_SAMPLE_NOTE = "Échantillon insuffisant : moins de 3 parties, les tendances ne sont pas fiables."
MIXED_MODES_NOTE = "Modes de jeu mélangés : les moyennes regroupent des formats différents (filtrer avec team_size)."

# Per-game counts: reported as totals and per-game averages.
COUNT_METRICS = {
    "score": lambda p: p.stats.score,
    "goals": lambda p: p.stats.goals,
    "assists": lambda p: p.stats.assists,
    "saves": lambda p: p.stats.saves,
    "shots": lambda p: p.stats.shots,
    "demolitions_inflicted": lambda p: p.stats.demolitions.inflicted,
    "demolitions_received": lambda p: p.stats.demolitions.received,
    "small_pads": lambda p: p.stats.boost.small_pads,
    "big_pads": lambda p: p.stats.boost.big_pads,
}
# Rates and percentages: average weighted by tracked_time_s, None values ignored.
WEIGHTED_METRICS = {
    "boost_consumed_per_minute": lambda p: p.stats.boost.consumed_per_minute,
    "boost_average_level": lambda p: p.stats.boost.average_level,
    "avg_speed": lambda p: p.detail.avg_speed,
    "avg_ball_distance": lambda p: p.detail.avg_ball_distance,
    "supersonic_pct": lambda p: p.detail.supersonic_pct,
    "slow_pct": lambda p: p.detail.slow_pct,
    "zero_boost_pct": lambda p: p.detail.zero_boost_pct,
    "defensive_zone_pct": lambda p: p.detail.defensive_zone_pct,
    "mid_zone_pct": lambda p: p.detail.mid_zone_pct,
    "offensive_zone_pct": lambda p: p.detail.offensive_zone_pct,
    "behind_ball_pct": lambda p: p.detail.behind_ball_pct,
    "first_man_pct": lambda p: p.detail.first_man_pct,
    "second_man_pct": lambda p: p.detail.second_man_pct,
    "third_man_pct": lambda p: p.detail.third_man_pct,
}
POSITION_METRICS = ("first_man_pct", "second_man_pct", "third_man_pct")
PER_GAME_METRICS = ("score", "goals", "assists", "saves", "shots", "demolitions_inflicted")
TREND_METRICS = ("score", "goals", "saves", "shots", "supersonic_pct", "behind_ball_pct", "offensive_zone_pct")


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


def _find_in_report(report: GameReport, player_name: str) -> PlayerReport | None:
    wanted = player_name.strip().casefold()
    return next((p for p in report.players if p.stats.name.casefold() == wanted), None)


def _weighted_mean(entries: list[PlayerReport], getter) -> float | None:
    total = 0.0
    weight_sum = 0.0
    for entry in entries:
        value = getter(entry)
        weight = entry.detail.tracked_time_s
        if value is None or weight <= 0:
            continue
        total += value * weight
        weight_sum += weight
    return total / weight_sum if weight_sum > 0 else None


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _summarize(entries: list[PlayerReport], metric_names, team_size_is_solo: bool = False) -> dict:
    """Per-game averages of counts and weighted averages of rates, for the given metric names."""
    result = {}
    for name in metric_names:
        if name in COUNT_METRICS:
            result[name] = _round(_mean([COUNT_METRICS[name](e) for e in entries]))
        elif team_size_is_solo and name in POSITION_METRICS:
            continue
        else:
            result[name] = _round(_weighted_mean(entries, WEIGHTED_METRICS[name]))
    return result


def _outcome(entry: PlayerReport, report: GameReport) -> str | None:
    own, other = (
        (report.match.team0_score, report.match.team1_score)
        if entry.stats.team == 0
        else (report.match.team1_score, report.match.team0_score)
    )
    if own is None or other is None:
        return None
    return "win" if own > other else "loss" if own < other else "draw"


def _score_text(entry: PlayerReport, report: GameReport) -> str | None:
    t0, t1 = report.match.team0_score, report.match.team1_score
    if t0 is None or t1 is None:
        return None
    return f"{t0}-{t1}" if entry.stats.team == 0 else f"{t1}-{t0}"


def analyze_player(player_name: str, team_size: int | None = None, last_n: int = MAX_LAST_N) -> dict:
    """Aggregate the stats of a player (matched by name, ignoring case) over his last `last_n` games.

    Returns a dict; failures are reported under an "error" key."""
    if not isinstance(player_name, str) or not player_name.strip():
        return {"error": "Nom de joueur manquant ou invalide."}
    last_n = max(1, min(MAX_LAST_N, last_n))

    games = list(storage.iter_game_reports(team_size))
    if not games:
        return {"error": "Aucune partie importée correspondante."}

    if not any(_find_in_report(report, player_name) for _, report in games):
        names = sorted({p.stats.name for _, report in games for p in report.players}, key=str.casefold)
        return {
            "error": "Joueur introuvable dans les parties importées.",
            "available_players": names[:MAX_AVAILABLE_PLAYERS],
        }

    # Oldest first; games without a date come first so that they are the first ones dropped.
    games.sort(key=lambda item: (item[1].match.date or "", item[0]))
    games = games[-last_n:]

    analyzed: list[tuple[str, GameReport, PlayerReport]] = []
    skipped = []
    for game_id, report in games:
        entry = _find_in_report(report, player_name)
        if entry is None:
            skipped.append({"game_id": game_id, "reason": "Joueur absent de cette partie."})
        else:
            analyzed.append((game_id, report, entry))
    if not analyzed:
        return {"error": "Joueur absent des parties les plus récentes."}

    entries = [entry for _, _, entry in analyzed]
    display_name = entries[-1].stats.name
    sizes: dict[str, int] = {}
    for _, report, _ in analyzed:
        key = str(report.match.team_size) if report.match.team_size is not None else "unknown"
        sizes[key] = sizes.get(key, 0) + 1
    modes: dict = {"games_by_team_size": sizes}
    if len(sizes) > 1:
        modes["note"] = MIXED_MODES_NOTE

    solo = team_size == 1 or set(sizes) == {"1"}
    averages = _summarize(entries, [*COUNT_METRICS, *WEIGHTED_METRICS], solo)
    totals = {name: sum(getter(e) for e in entries) for name, getter in COUNT_METRICS.items()}

    per_game = []
    for game_id, report, entry in analyzed:
        metrics = _summarize([entry], PER_GAME_METRICS)
        row = {
            "game_id": game_id,
            "date": report.match.date,
            "team_size": report.match.team_size,
            **{("player_score" if k == "score" else k): v for k, v in metrics.items()},
            "score": _score_text(entry, report),
            "result": _outcome(entry, report),
        }
        per_game.append(row)

    result = {
        "player": display_name,
        "games_analyzed": len(analyzed),
        "games_skipped": skipped,
        "modes": modes,
        "totals": totals,
        "averages": averages,
        "per_game": per_game,
    }
    if len(analyzed) >= MIN_GAMES_TREND:
        half = len(entries) // 2
        older = _summarize(entries[:half], TREND_METRICS)
        recent = _summarize(entries[-half:], TREND_METRICS)
        result["trend"] = {
            "older_games": half,
            "recent_games": half,
            "metrics": {
                name: {
                    "older": older[name],
                    "recent": recent[name],
                    "delta": None
                    if older[name] is None or recent[name] is None
                    else _round(recent[name] - older[name]),
                }
                for name in TREND_METRICS
            },
        }
    if len(analyzed) < MIN_GAMES_NOTE:
        result["note"] = INSUFFICIENT_SAMPLE_NOTE
    return result
