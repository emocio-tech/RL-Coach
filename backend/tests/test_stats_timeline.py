from app.services import stats
from tests.conftest import add_frame


def _map(raw):
    return stats.build_match_files("abc", "game.replay", raw)[1]


def test_build_match_files_timeline_seconds_is_last_relative_frame_time(fake_raw):
    assert _map(fake_raw).timeline_seconds == 2.0


def test_build_match_files_timeline_seconds_ignores_total_seconds_played(fake_raw):
    fake_raw["properties"]["TotalSecondsPlayed"] = 300.5

    assert _map(fake_raw).timeline_seconds == 2.0


def test_build_match_files_timeline_seconds_covers_late_frame_and_rounds(fake_raw):
    add_frame(fake_raw, 302.12345)

    assert _map(fake_raw).timeline_seconds == 302.12
