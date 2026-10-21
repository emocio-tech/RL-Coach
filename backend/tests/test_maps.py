import pytest

from app.services import maps


@pytest.mark.parametrize(
    "code, expected",
    [
        ("Stadium_P", "DFH Stadium"),
        ("UF_Day_P", "Futura Garden"),
        ("utopiastadium_dusk_p", "Utopia Coliseum"),
        ("EuroStadium_Night_P", "Mannfield"),
    ],
)
def test_display_name_known_code_returns_in_game_name(code, expected):
    assert maps.display_name(code) == expected


def test_display_name_unknown_code_is_returned_as_is():
    assert maps.display_name("Weird/Map") == "Weird/Map"


@pytest.mark.parametrize("code", [None, ""])
def test_display_name_missing_code_is_returned_as_is(code):
    assert maps.display_name(code) == code
