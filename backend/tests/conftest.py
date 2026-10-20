import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

# Indices into the fake "objects" list
OBJ_CAR, OBJ_BALL, OBJ_BOOST, OBJ_PAWN_PRI, OBJ_PRI_NAME, OBJ_VEHICLE, OBJ_REP_BOOST, OBJ_RBSTATE = range(8)

BALL_ID = 1
CAR_A, CAR_B = 10, 11
PRI_A, PRI_B = 20, 21
BOOST_A, BOOST_B = 30, 31

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


def _rigid(x, y, z, vx, vy, vz):
    return {
        "RigidBody": {
            "location": {"x": x, "y": y, "z": z},
            "linear_velocity": {"x": vx, "y": vy, "z": vz},
        }
    }


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
            _upd(CAR_A, OBJ_RBSTATE, _rigid(-1000.0 + 10 * i, -2000.0, 17.0, 300.0, 400.0, 0.0)),
            _upd(CAR_B, OBJ_RBSTATE, _rigid(1000.0, 3000.0, 17.0, 0.0, 0.0, 0.0)),
        ]
        frames.append(frame)

    return {
        "properties": {
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
