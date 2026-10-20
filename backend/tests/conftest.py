import copy

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

# Indices into the fake "objects" list
OBJ_CAR, OBJ_BALL, OBJ_BOOST, OBJ_PAWN_PRI, OBJ_PRI_NAME, OBJ_VEHICLE, OBJ_REP_BOOST, OBJ_RBSTATE = range(8)

# Extra objects (indices 8-11 of the fake objects list) used by the event helpers
OBJ_PAD, OBJ_PICKUP, OBJ_DEMOLISH, OBJ_MATCH_DEMOLISHES = range(8, 12)

# One distinct pad object name per pad actor id (indices 12+ of the fake objects list)
OBJ_PAD_FIRST = 12

BALL_ID = 1
CAR_A, CAR_B = 10, 11
PRI_A, PRI_B = 20, 21
BOOST_A, BOOST_B = 30, 31
PAD_SMALL, PAD_BIG, PAD_BIG2 = 40, 41, 42
PAD_FIRST_ID, PAD_COUNT = 40, 8  # actor ids 40..47 each get a pad object name
PAD_SPARE = 43  # actor id free for tests that recreate a pad under another actor_id
REPLAY_ID = "ABC123DEF"
FOLDER_NAME = f"Stadium_P_Online-1v1_{REPLAY_ID}"

FPS = 30
N_FRAMES = 61  # 0.0 .. 2.0 s
T_OFFSET = 5.0


@pytest.fixture
def games_dir(tmp_path, monkeypatch):
    target = tmp_path / "games"
    monkeypatch.setattr(config, "GAMES_DIR", target)
    return target


@pytest.fixture
def client(games_dir):
    return TestClient(app, raise_server_exceptions=False)


ROT_A = {"x": 0.1, "y": 0.2, "z": 0.3, "w": 0.86 ** 0.5}  # unit quaternion, w rounds to 0.9274
ROT_B = {"x": 0.5, "y": 0.5, "z": 0.5, "w": 0.5}


def pad_object_id(pad_id):
    """Index in the fake objects list of the object name of a pad actor."""
    return OBJ_PAD_FIRST + (pad_id - PAD_FIRST_ID)


def _rigid(x, y, z, vx, vy, vz, rotation=None):
    """RigidBody update; vx is None -> no linear_velocity (sleeping); rotation None -> no rotation."""
    body = {"location": {"x": x, "y": y, "z": z}}
    body["linear_velocity"] = None if vx is None else {"x": vx, "y": vy, "z": vz}
    if rotation is not None:
        body["rotation"] = rotation
    return {"RigidBody": body}


def _upd(actor_id, object_id, attribute):
    return {"actor_id": actor_id, "object_id": object_id, "attribute": attribute}


def _link(actor):
    return {"ActiveActor": {"active": True, "actor": actor}}


@pytest.fixture
def fake_raw():
    """Small dict imitating rrrocket output: 2 players, a ball, ~2 s at 30 fps."""
    objects = [
        "Archetypes.Car.Car_Default",
        "Archetypes.Ball.Ball_Default",
        "Archetypes.CarComponents.CarComponent_Boost",
        "Engine.Pawn:PlayerReplicationInfo",
        "Engine.PlayerReplicationInfo:PlayerName",
        "TAGame.CarComponent_TA:Vehicle",
        "TAGame.CarComponent_Boost_TA:ReplicatedBoost",
        "TAGame.RBActor_TA:ReplicatedRBState",
        # unused by the base scenario, referenced by the event helpers below
        "Archetypes.CarComponents.VehiclePickup_Boost_TA",
        "TAGame.VehiclePickup_TA:NewReplicatedPickupData",
        "TAGame.Car_TA:ReplicatedDemolishExtended",
        "TAGame.PRI_TA:MatchDemolishes",
    ] + [
        f"TAGame.Default__PersistentLevel.VehiclePickup_Boost_TA_{n}"
        for n in range(PAD_COUNT)
    ]
    frames = []
    for i in range(N_FRAMES):
        frame = {
            "time": T_OFFSET + i / FPS,
            "delta": 1 / FPS,
            "new_actors": [],
            "updated_actors": [],
            "deleted_actors": [],
        }
        if i == 0:
            frame["new_actors"] = [
                {"actor_id": BALL_ID, "object_id": OBJ_BALL},
                {"actor_id": CAR_A, "object_id": OBJ_CAR},
                {"actor_id": CAR_B, "object_id": OBJ_CAR},
                {"actor_id": BOOST_A, "object_id": OBJ_BOOST},
                {"actor_id": BOOST_B, "object_id": OBJ_BOOST},
            ] + [
                {"actor_id": pad, "object_id": pad_object_id(pad)}
                for pad in range(PAD_FIRST_ID, PAD_FIRST_ID + PAD_COUNT)
            ]
            frame["updated_actors"] = [
                _upd(PRI_A, OBJ_PRI_NAME, {"String": "Alice"}),
                _upd(PRI_B, OBJ_PRI_NAME, {"String": "Bob"}),
                _upd(CAR_A, OBJ_PAWN_PRI, _link(PRI_A)),
                _upd(CAR_B, OBJ_PAWN_PRI, _link(PRI_B)),
                _upd(BOOST_A, OBJ_VEHICLE, _link(CAR_A)),
                _upd(BOOST_B, OBJ_VEHICLE, _link(CAR_B)),
                _upd(BOOST_A, OBJ_REP_BOOST, {"ReplicatedBoost": {"boost_amount": 255}}),
                _upd(BOOST_B, OBJ_REP_BOOST, {"ReplicatedBoost": {"boost_amount": 128}}),
            ]
        frame["updated_actors"] += [
            _upd(BALL_ID, OBJ_RBSTATE, _rigid(0.0 + i, 100.0, 93.0, 0, 0, 0)),
            _upd(CAR_A, OBJ_RBSTATE, _rigid(-1000.0 + 10 * i, -2000.0, 17.0, 300.0, 400.0, 0.0, ROT_A)),
            _upd(CAR_B, OBJ_RBSTATE, _rigid(1000.0, 3000.0, 17.0, 0.0, 0.0, 0.0, ROT_B)),
        ]
        frames.append(frame)

    return {
        "properties": {
            "Id": REPLAY_ID,
            "TeamSize": 1,
            "Team0Score": 3,
            "Team1Score": 2,
            "TotalSecondsPlayed": 300.5,
            "MapName": "Stadium_P",
            "MatchType": "Online",
            "Date": "2024-01-02 03-04-05",
            "PlayerStats": [
                {"Name": "Alice", "Team": 0, "Score": 500, "Goals": 3, "Assists": 1, "Saves": 2, "Shots": 5},
                {"Name": "Bob", "Team": 1, "Score": 300, "Goals": 2, "Assists": 0, "Saves": 4, "Shots": 3},
            ],
        },
        "objects": objects,
        "network_frames": {"frames": frames},
    }


def add_update(raw, frame, actor_id, object_id, attribute):
    raw["network_frames"]["frames"][frame]["updated_actors"].append(
        _upd(actor_id, object_id, attribute)
    )


def set_boost(raw, frame, boost_actor, amount):
    add_update(raw, frame, boost_actor, OBJ_REP_BOOST, {"ReplicatedBoost": {"boost_amount": amount}})


def pickup(raw, frame, pad_id, instigator, picked_up=1):
    add_update(
        raw, frame, pad_id, OBJ_PICKUP,
        {"PickupNew": {"instigator": instigator, "picked_up": picked_up}},
    )


def release(raw, frame, pad_id):
    """Pad becomes available again (picked_up == 255): resolves a pending pickup."""
    pickup(raw, frame, pad_id, None, picked_up=255)


def add_frame(raw, rel_time):
    """Append an empty frame (delta 0) rel_time seconds after the first frame; return its index."""
    frames = raw["network_frames"]["frames"]
    frames.append(
        {"time": T_OFFSET + rel_time, "delta": 0, "new_actors": [], "updated_actors": [], "deleted_actors": []}
    )
    return len(frames) - 1


def announce_pad(raw, frame, actor_id, name_pad_id):
    """(Re)announce actor_id through new_actors with the object name of pad name_pad_id."""
    raw["network_frames"]["frames"][frame]["new_actors"].append(
        {"actor_id": actor_id, "object_id": pad_object_id(name_pad_id)}
    )


def demolish(raw, frame, attacker_pri, victim_car, self_demolish=False, key="DemolishExtended"):
    add_update(
        raw, frame, victim_car, OBJ_DEMOLISH,
        {
            key: {
                "attacker_pri": {"active": True, "actor": attacker_pri},
                "self_demolish": self_demolish,
                "attacker": {"active": True, "actor": CAR_A},
                "victim": {"active": True, "actor": victim_car},
            }
        },
    )


@pytest.fixture
def fake_raw_with_events(fake_raw):
    """fake_raw plus pads, boost level changes and demolitions (hand-computable).

    Levels in % (amount / 255 * 100), frame i is at i / 30 s:
      Alice: 100 until frame 20, then 60 (consumed 40).
      Bob: 50.2 -> 60 (f12) -> 100 (f32) -> 80 (f40, consumed 20) -> 100 (f47).
    Pads (Bob, each pad has its own object name VehiclePickup_Boost_TA_<n>): small picked f10,
    released f20 (one delay of 0.33 s -> small pad); big picked f30 and big2 picked f45, both
    released at t=8.5 s (one delay each, 7.5 s and 7.0 s -> big pads).
    Demolitions: Alice demolishes Bob at f20 (duplicate at f30, < 3 s, must be ignored).
    MatchDemolishes counters at f40: Alice 1, Bob 0.
    """
    raw = copy.deepcopy(fake_raw)
    set_boost(raw, 20, BOOST_A, 153)
    for frame, amount in ((12, 153), (32, 255), (40, 204), (47, 255)):
        set_boost(raw, frame, BOOST_B, amount)
    pickup(raw, 10, PAD_SMALL, CAR_B)
    pickup(raw, 30, PAD_BIG, CAR_B)
    pickup(raw, 45, PAD_BIG2, CAR_B)
    release(raw, 20, PAD_SMALL)
    late = add_frame(raw, 8.5)
    release(raw, late, PAD_BIG)
    release(raw, late, PAD_BIG2)
    demolish(raw, 20, PRI_A, CAR_B)
    demolish(raw, 30, PRI_A, CAR_B)
    add_update(raw, 40, PRI_A, OBJ_MATCH_DEMOLISHES, {"Int": 1})
    add_update(raw, 40, PRI_B, OBJ_MATCH_DEMOLISHES, {"Int": 0})
    return raw
