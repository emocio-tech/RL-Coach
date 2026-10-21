import math

from app import config
from app.schemas.replay import (
    BallTrack,
    Heatmap,
    MatchStats,
    BoostStats,
    Demolitions,
    MapFile,
    MatchEvent,
    PlayerFullStats,
    PlayerMap,
    PlayerStats,
    PlayerTrack,
    StatsFile,
)
from app.services import cars
from app.services.parser import ReplayParseError

CAR = "Archetypes.Car.Car_Default"
BALL = "Archetypes.Ball.Ball_Default"
BOOST = "Archetypes.CarComponents.CarComponent_Boost"

PICKUP_ATTRIBUTE = "TAGame.VehiclePickup_TA:NewReplicatedPickupData"
DEMOLISH_ATTRIBUTES = (
    "TAGame.Car_TA:ReplicatedDemolishExtended",
    "TAGame.Car_TA:ReplicatedDemolish",
)
DEMOLISH_KEYS = ("DemolishExtended", "Demolish")
MATCH_DEMOLISHES = "TAGame.PRI_TA:MatchDemolishes"
MATCH_COUNTER_EVENTS = {
    "TAGame.PRI_TA:MatchGoals": "goal",
    "TAGame.PRI_TA:MatchAssists": "assist",
    "TAGame.PRI_TA:MatchSaves": "save",
    "TAGame.PRI_TA:MatchShots": "shot",
}
MAX_EVENTS_PER_UPDATE = 5
CLIENT_LOADOUTS = "TAGame.PRI_TA:ClientLoadouts"
TEAM_LOADOUT_KEYS = ("blue", "orange")

PICKUP_UNAVAILABLE = 255
SHOT_GOAL_DEDUP_WINDOW = 1.0
BIG_PAD_MIN_RESPAWN = 7.0
DEMOLISH_DEDUP_WINDOW = 3.0

GRID_X = 20
GRID_Y = 26
X_MIN, X_MAX = -4096.0, 4096.0
Y_MIN, Y_MAX = -5120.0, 5120.0


class _State:
    def __init__(self):
        self.cars = set()
        self.ball = None
        self.boosts = set()
        self.car_pri = {}
        self.pri_name = {}
        self.boost_car = {}
        self.boost_amount = {}
        self.rigid = {}
        self.now = 0.0
        self.level_weighted = {}
        self.level_time = {}
        self.consumed = {}
        self.small_pads = {}
        self.big_pads = {}
        self.pad_identity = {}
        self.pad_last = {}
        self.pad_pending = {}
        self.pad_delays = {}
        self.pad_pickups = []
        self.demolitions = []
        self.demolish_last = {}
        self.pri_counter = {}
        self.named_counter = {}
        self.counter_last = {}
        self.events = []
        self.pri_loadout = {}
        self.named_loadout = {}

    def add_actor(self, actor_id, name):
        self._forget(actor_id)
        if name == CAR:
            self.cars.add(actor_id)
        elif name == BALL:
            self.ball = actor_id
        elif name == BOOST:
            self.boosts.add(actor_id)
        if isinstance(name, str) and "VehiclePickup_Boost" in name:
            self.pad_identity[actor_id] = name

    def _snapshot_counter(self, actor_id):
        name = self.pri_name.get(actor_id)
        if name is not None and actor_id in self.pri_counter:
            self.named_counter[name] = self.pri_counter[actor_id]

    def _snapshot_loadout(self, actor_id):
        name = self.pri_name.get(actor_id)
        if name is not None and actor_id in self.pri_loadout:
            self.named_loadout[name] = self.pri_loadout[actor_id]

    def _forget(self, actor_id):
        self._snapshot_counter(actor_id)
        self._snapshot_loadout(actor_id)
        self.pri_counter.pop(actor_id, None)
        self.pri_loadout.pop(actor_id, None)
        self.pad_identity.pop(actor_id, None)
        self.cars.discard(actor_id)
        if self.ball == actor_id:
            self.ball = None
        self.boosts.discard(actor_id)
        self.car_pri.pop(actor_id, None)
        self.pri_name.pop(actor_id, None)
        self.boost_car.pop(actor_id, None)
        self.boost_amount.pop(actor_id, None)
        self.rigid.pop(actor_id, None)

    def delete_actor(self, actor_id):
        self._forget(actor_id)

    def update_actor(self, actor_id, name, attribute):
        if not isinstance(attribute, dict):
            return
        if name == "Engine.Pawn:PlayerReplicationInfo":
            target = _active_actor(attribute)
            if actor_id in self.cars and target is not None:
                self.car_pri[actor_id] = target
        elif name == "Engine.PlayerReplicationInfo:PlayerName":
            value = attribute.get("String")
            if value is not None:
                self.pri_name[actor_id] = value
                self._snapshot_counter(actor_id)
                self._snapshot_loadout(actor_id)
        elif name == CLIENT_LOADOUTS:
            bodies = _loadout_bodies(attribute)
            if bodies:
                self.pri_loadout[actor_id] = bodies
                self._snapshot_loadout(actor_id)
        elif name == "TAGame.CarComponent_TA:Vehicle":
            target = _active_actor(attribute)
            if actor_id in self.boosts and target is not None:
                self.boost_car[actor_id] = target
        elif name == "TAGame.CarComponent_Boost_TA:ReplicatedBoost":
            value = (attribute.get("ReplicatedBoost") or {}).get("boost_amount")
            if actor_id in self.boosts and value is not None:
                self._on_boost_amount(actor_id, value)
                self.boost_amount[actor_id] = value
        elif name == PICKUP_ATTRIBUTE:
            self._on_pickup(actor_id, attribute)
        elif name in DEMOLISH_ATTRIBUTES:
            self._on_demolish(attribute)
        elif name == MATCH_DEMOLISHES:
            value = attribute.get("Int")
            if isinstance(value, int) and not isinstance(value, bool):
                self.pri_counter[actor_id] = value
                self._snapshot_counter(actor_id)
        elif name in MATCH_COUNTER_EVENTS:
            self._on_match_counter(actor_id, name, attribute)
        if "RigidBody" in attribute and (actor_id in self.cars or actor_id == self.ball):
            body = attribute["RigidBody"] or {}
            location = body.get("location")
            if location:
                self.rigid[actor_id] = (
                    location,
                    body.get("linear_velocity"),
                    body.get("rotation"),
                )

    def car_boost(self, car_id):
        for comp_id, owner in self.boost_car.items():
            if owner == car_id and comp_id in self.boost_amount:
                return round(self.boost_amount[comp_id] / 255 * 100)
        return None

    def car_player(self, car_id):
        pri = self.car_pri.get(car_id)
        if pri is None:
            return None
        return self.pri_name.get(pri)

    def accumulate_levels(self, delta):
        if not delta or delta <= 0:
            return
        for comp_id, owner in self.boost_car.items():
            amount = self.boost_amount.get(comp_id)
            if amount is None:
                continue
            player = self.car_player(owner)
            if player is None:
                continue
            self.level_weighted[player] = (
                self.level_weighted.get(player, 0.0) + amount / 255 * 100 * delta
            )
            self.level_time[player] = self.level_time.get(player, 0.0) + delta

    def finalize_pads(self):
        big_by_pad = {}
        for pad, delays in self.pad_delays.items():
            long_count = len([d for d in delays if d >= BIG_PAD_MIN_RESPAWN])
            short_count = len([d for d in delays if d < BIG_PAD_MIN_RESPAWN])
            big_by_pad[pad] = long_count > short_count
        for pad, player in self.pad_pickups:
            target = self.big_pads if big_by_pad.get(pad, False) else self.small_pads
            target[player] = target.get(player, 0) + 1

    def _on_boost_amount(self, comp_id, value):
        car_id = self.boost_car.get(comp_id)
        if car_id is None:
            return
        new_level = value / 255 * 100
        previous = self.boost_amount.get(comp_id)
        if previous is not None:
            previous_level = previous / 255 * 100
            if new_level < previous_level:
                player = self.car_player(car_id)
                if player is not None:
                    self.consumed[player] = (
                        self.consumed.get(player, 0.0) + previous_level - new_level
                    )

    def _on_pickup(self, actor_id, attribute):
        data = attribute.get("PickupNew")
        if not isinstance(data, dict):
            return
        pad = self.pad_identity.get(actor_id, actor_id)
        instigator = data.get("instigator")
        picked_up = data.get("picked_up")
        if picked_up == PICKUP_UNAVAILABLE:
            self.pad_last.pop(pad, None)
            if pad in self.pad_pending:
                started = self.pad_pending.pop(pad)
                self.pad_delays.setdefault(pad, []).append(self.now - started)
            return
        if (
            not isinstance(instigator, int)
            or isinstance(instigator, bool)
            or instigator < 0
        ):
            return
        key = (picked_up, instigator)
        if key == self.pad_last.get(pad):
            return
        self.pad_last[pad] = key
        player = self.car_player(instigator)
        if player is None:
            return
        self.pad_pickups.append((pad, player))
        if pad not in self.pad_pending:
            self.pad_pending[pad] = self.now

    def _on_match_counter(self, actor_id, name, attribute):
        value = attribute.get("Int")
        if not isinstance(value, int) or isinstance(value, bool):
            return
        key = (actor_id, name)
        previous = self.counter_last.get(key, 0)
        self.counter_last[key] = value
        if value <= previous:
            return
        player = self.pri_name.get(actor_id)
        if player is None:
            return
        for _ in range(min(value - previous, MAX_EVENTS_PER_UPDATE)):
            self.events.append((self.now, MATCH_COUNTER_EVENTS[name], player, None))

    def _on_demolish(self, attribute):
        data = None
        for key in DEMOLISH_KEYS:
            if isinstance(attribute.get(key), dict):
                data = attribute[key]
                break
        if data is None or data.get("self_demolish"):
            return
        attacker_pri = _actor_id(data.get("attacker_pri"))
        victim_car = _actor_id(data.get("victim"))
        if attacker_pri is None or victim_car is None:
            return
        attacker = self.pri_name.get(attacker_pri)
        victim = self.car_player(victim_car)
        if attacker is None or victim is None or attacker == victim:
            return
        key = (attacker_pri, victim_car)
        last = self.demolish_last.get(key)
        if last is not None and self.now - last < DEMOLISH_DEDUP_WINDOW:
            return
        self.demolish_last[key] = self.now
        self.demolitions.append((attacker, victim))
        self.events.append((self.now, "demolition", attacker, victim))

    def player_sample(self, name):
        for car_id in self.cars:
            pri = self.car_pri.get(car_id)
            if pri is None or self.pri_name.get(pri) != name:
                continue
            rigid = self.rigid.get(car_id)
            if rigid is None:
                continue
            location, velocity, rotation = rigid
            quaternion = None
            if isinstance(rotation, dict):
                parts = [rotation.get(k) for k in ("x", "y", "z", "w")]
                if all(
                    isinstance(v, (int, float)) and not isinstance(v, bool)
                    for v in parts
                ):
                    quaternion = tuple(round(v, 4) for v in parts)
            speed = None
            if velocity:
                speed = round(
                    math.sqrt(
                        velocity.get("x", 0) ** 2
                        + velocity.get("y", 0) ** 2
                        + velocity.get("z", 0) ** 2
                    ),
                    1,
                )
            return (
                round(location["x"], 1),
                round(location["y"], 1),
                round(location["z"], 1),
                speed,
                self.car_boost(car_id),
                quaternion,
            )
        return None

    def ball_sample(self):
        rigid = self.rigid.get(self.ball) if self.ball is not None else None
        if rigid is None:
            return None
        location = rigid[0]
        return (
            round(location["x"], 1),
            round(location["y"], 1),
            round(location["z"], 1),
        )


def _active_actor(attribute):
    active = attribute.get("ActiveActor")
    if not isinstance(active, dict):
        return None
    actor = active.get("actor")
    if actor is None or actor < 0:
        return None
    return actor


def _loadout_bodies(attribute):
    """Car body ids of a ClientLoadouts attribute, as {"blue": id, "orange": id} (valid ids only)."""
    team_loadout = attribute.get("TeamLoadout")
    if not isinstance(team_loadout, dict):
        return {}
    bodies = {}
    for key in TEAM_LOADOUT_KEYS:
        loadout = team_loadout.get(key)
        body = loadout.get("body") if isinstance(loadout, dict) else None
        if isinstance(body, int) and not isinstance(body, bool) and body > 0:
            bodies[key] = body
    return bodies


def _player_car(state, name, team):
    """Car model name of a player: the body of its own team's loadout, else the other team's."""
    bodies = state.named_loadout.get(name)
    if not bodies:
        return None
    own = TEAM_LOADOUT_KEYS[team] if team in (0, 1) else None
    body = bodies.get(own) or next(iter(bodies.values()))
    return cars.display_name(body)


def _actor_id(value):
    if isinstance(value, dict):
        value = value.get("actor")
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def build_match_files(
    replay_id: str, original_filename: str, raw: dict
) -> tuple[StatsFile, MapFile]:
    properties = raw.get("properties") or {}
    player_stats = properties.get("PlayerStats") or []
    frames = ((raw.get("network_frames") or {}).get("frames")) or []
    if not player_stats or not frames:
        raise ReplayParseError("Replay has no usable data")
    objects = raw.get("objects") or []

    def object_name(object_id):
        if isinstance(object_id, int) and 0 <= object_id < len(objects):
            return objects[object_id]
        return None

    match = MatchStats(
        match_type=properties.get("MatchType"),
        team_size=properties.get("TeamSize"),
        team0_score=properties.get("Team0Score", 0),
        team1_score=properties.get("Team1Score", 0),
        duration_seconds=properties.get("TotalSecondsPlayed"),
        map_name=properties.get("MapName"),
        date=properties.get("Date"),
    )

    stats_list = [
        PlayerStats(
            name=p["Name"],
            team=p.get("Team", 0),
            score=p.get("Score", 0),
            goals=p.get("Goals", 0),
            assists=p.get("Assists", 0),
            saves=p.get("Saves", 0),
            shots=p.get("Shots", 0),
        )
        for p in player_stats
    ]
    names = [p.name for p in stats_list]

    step = 1 / config.FRAME_SAMPLE_HZ
    t0 = frames[0]["time"]
    last_rel = frames[-1]["time"] - t0
    n_steps = int(math.floor(last_rel / step + 1e-9)) + 1

    state = _State()
    frame_index = 0
    times = []
    player_rows = {name: [] for name in names}
    ball_rows = []

    def process_frame(frame):
        state.now = frame["time"]
        state.accumulate_levels(frame.get("delta"))
        for actor in frame.get("new_actors") or []:
            state.add_actor(actor["actor_id"], object_name(actor.get("object_id")))
        for actor in frame.get("updated_actors") or []:
            name = object_name(actor.get("object_id"))
            if name is None and "RigidBody" not in (actor.get("attribute") or {}):
                continue
            state.update_actor(actor["actor_id"], name, actor.get("attribute"))
        for actor_id in frame.get("deleted_actors") or []:
            state.delete_actor(actor_id)

    for k in range(n_steps):
        t = k * step
        while frame_index < len(frames) and frames[frame_index]["time"] - t0 <= t + 1e-9:
            process_frame(frames[frame_index])
            frame_index += 1

        times.append(round(t, 2))
        for name in names:
            player_rows[name].append(state.player_sample(name))
        ball_rows.append(state.ball_sample())

    while frame_index < len(frames):
        process_frame(frames[frame_index])
        frame_index += 1
    state.finalize_pads()
    for pri_id in list(state.pri_counter):
        state._snapshot_counter(pri_id)
    for pri_id in list(state.pri_loadout):
        state._snapshot_loadout(pri_id)

    duration = properties.get("TotalSecondsPlayed")
    full_players = []
    for stats_item in stats_list:
        pname = stats_item.name
        known_time = state.level_time.get(pname, 0.0)
        average_level = (
            round(state.level_weighted.get(pname, 0.0) / known_time, 1)
            if known_time > 0
            else None
        )
        consumed_per_minute = None
        if isinstance(duration, (int, float)) and duration > 0:
            consumed_per_minute = round(
                state.consumed.get(pname, 0.0) / (duration / 60), 1
            )
        received = sum(1 for _a, victim in state.demolitions if victim == pname)
        if pname in state.named_counter:
            inflicted = state.named_counter[pname]
        else:
            inflicted = sum(1 for a, _v in state.demolitions if a == pname)
        full_players.append(
            PlayerFullStats(
                **{**stats_item.model_dump(), "car": _player_car(state, pname, stats_item.team)},
                demolitions=Demolitions(inflicted=inflicted, received=received),
                boost=BoostStats(
                    small_pads=state.small_pads.get(pname, 0),
                    big_pads=state.big_pads.get(pname, 0),
                    consumed_per_minute=consumed_per_minute,
                    average_level=average_level,
                ),
            )
        )

    players = []
    for stats_item in stats_list:
        rows = player_rows[stats_item.name]
        counts = [[0] * GRID_Y for _ in range(GRID_X)]
        for row in rows:
            if row is None:
                continue
            ix = min(GRID_X - 1, max(0, int((row[0] - X_MIN) / (X_MAX - X_MIN) * GRID_X)))
            iy = min(GRID_Y - 1, max(0, int((row[1] - Y_MIN) / (Y_MAX - Y_MIN) * GRID_Y)))
            counts[ix][iy] += 1
        players.append(
            PlayerMap(
                name=stats_item.name,
                team=stats_item.team,
                heatmap=Heatmap(counts=counts),
                track=PlayerTrack(
                    t=times,
                    x=[r[0] if r else None for r in rows],
                    y=[r[1] if r else None for r in rows],
                    z=[r[2] if r else None for r in rows],
                    speed=[r[3] if r else None for r in rows],
                    boost=[r[4] if r else None for r in rows],
                    qx=[r[5][0] if r and r[5] else None for r in rows],
                    qy=[r[5][1] if r and r[5] else None for r in rows],
                    qz=[r[5][2] if r and r[5] else None for r in rows],
                    qw=[r[5][3] if r and r[5] else None for r in rows],
                ),
            )
        )

    ball = BallTrack(
        t=times,
        x=[r[0] if r else None for r in ball_rows],
        y=[r[1] if r else None for r in ball_rows],
        z=[r[2] if r else None for r in ball_rows],
    )

    team_by_name = {p.name: p.team for p in stats_list}
    goal_times = {}
    for event_time, event_type, event_player, _victim in state.events:
        if event_type == "goal":
            goal_times.setdefault(event_player, []).append(event_time)
    events = []
    for event_time, event_type, event_player, event_victim in state.events:
        if event_player not in team_by_name:
            continue
        if event_type == "shot" and any(
            abs(event_time - goal_time) <= SHOT_GOAL_DEDUP_WINDOW
            for goal_time in goal_times.get(event_player, [])
        ):
            continue
        events.append(
            MatchEvent(
                seconds=round(event_time - t0, 1),
                type=event_type,
                player=event_player,
                team=team_by_name[event_player],
                victim=event_victim,
            )
        )
    events.sort(key=lambda e: e.seconds)
    timeline_seconds = round(max([last_rel, *(e.seconds for e in events)]), 2)

    stats_file = StatsFile(
        replay_id=replay_id,
        original_filename=original_filename,
        match=match,
        players=full_players,
        events=events,
    )
    map_file = MapFile(
        replay_id=replay_id,
        players=players,
        ball=ball,
        timeline_seconds=timeline_seconds,
    )
    return stats_file, map_file
