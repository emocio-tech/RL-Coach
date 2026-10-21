import pytest

from app.services import cars


@pytest.mark.parametrize(
    "body_id, expected",
    [(23, "Octane"), (403, "Dominus"), (4284, "Fennec")],
)
def test_display_name_known_body_returns_in_game_name(body_id, expected):
    assert cars.display_name(body_id) == expected


def test_display_name_unknown_body_returns_generic_label():
    assert cars.display_name(1) == "Modèle #1"


def test_display_name_missing_body_returns_none():
    assert cars.display_name(None) is None
