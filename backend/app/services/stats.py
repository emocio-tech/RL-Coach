import math

from app import config
from app.schemas.replay import (
    BallTrack,
    Heatmap,
    MatchStats,
    PlayerData,
    PlayerStats,
    PlayerTrack,
    ReplayData,
)
from app.services.parser import ReplayParseError

CAR = "Archetypes.Car.Car_Default"
BALL = "Archetypes.Ball.Ball_Default"
BOOST = "Archetypes.CarComponents.CarComponent_Boost"

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

    def add_actor(self, actor_id, name):
        self._forget(actor_id)
        if name == CAR:
            self.cars.add(actor_id)
        elif name == BALL:
            self.ball = actor_id
        elif name == BOOST:
            self.boosts.add(actor_id)

    def _forget(self, actor_id):
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
        elif name == "TAGame.CarComponent_TA:Vehicle":
            target = _active_actor(attribute)
            if actor_id in self.boosts and target is not None:
                self.boost_car[actor_id] = target
        elif name == "TAGame.CarComponent_Boost_TA:ReplicatedBoost":
            value = (attribute.get("ReplicatedBoost") or {}).get("boost_amount")
            if actor_id in self.boosts and value is not None:
                self.boost_amount[actor_id] = value
        if "RigidBody" in attribute and (actor_id in self.cars or actor_id == self.ball):
            body = attribute["RigidBody"] or {}
            location = body.get("location")
            if location:
                self.rigid[actor_id] = (location, body.get("linear_velocity"))

    def car_boost(self, car_id):
        for comp_id, owner in self.boost_car.items():
            if owner == car_id and comp_id in self.boost_amount:
                return round(self.boost_amount[comp_id] / 255 * 100)
        return None

    def player_sample(self, name):
        for car_id in self.cars:
            pri = self.car_pri.get(car_id)
            if pri is None or self.pri_name.get(pri) != name:
                continue
            rigid = self.rigid.get(car_id)
            if rigid is None:
                continue
            location, velocity = rigid
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


def build_replay_data(replay_id: str, original_filename: str, raw: dict) -> ReplayData:
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
        team0_score=properties.get("Team0Score"),
        team1_score=properties.get("Team1Score"),
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

    for k in range(n_steps):
        t = k * step
        while frame_index < len(frames) and frames[frame_index]["time"] - t0 <= t + 1e-9:
            frame = frames[frame_index]
            frame_index += 1
            for actor in frame.get("new_actors") or []:
                state.add_actor(actor["actor_id"], object_name(actor.get("object_id")))
            for actor in frame.get("updated_actors") or []:
                name = object_name(actor.get("object_id"))
                if name is None and "RigidBody" not in (actor.get("attribute") or {}):
                    continue
                state.update_actor(actor["actor_id"], name, actor.get("attribute"))
            for actor_id in frame.get("deleted_actors") or []:
                state.delete_actor(actor_id)

        times.append(round(t, 2))
        for name in names:
            player_rows[name].append(state.player_sample(name))
        ball_rows.append(state.ball_sample())

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
            PlayerData(
                stats=stats_item,
                heatmap=Heatmap(counts=counts),
                track=PlayerTrack(
                    t=times,
                    x=[r[0] if r else None for r in rows],
                    y=[r[1] if r else None for r in rows],
                    z=[r[2] if r else None for r in rows],
                    speed=[r[3] if r else None for r in rows],
                    boost=[r[4] if r else None for r in rows],
                ),
            )
        )

    ball = BallTrack(
        t=times,
        x=[r[0] if r else None for r in ball_rows],
        y=[r[1] if r else None for r in ball_rows],
        z=[r[2] if r else None for r in ball_rows],
    )

    return ReplayData(
        id=replay_id,
        original_filename=original_filename,
        match=match,
        players=players,
        ball=ball,
    )
