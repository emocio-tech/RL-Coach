import re

import pytest

from app.services.training import (
    CATALOG,
    FOCUS_AREAS,
    MAX_DRILLS,
    MAX_FOCUS_AREAS,
    PACKS_NOTE,
    TRAINING_PACKS,
    build_training_plan,
)

ALL_AREAS = list(CATALOG)


def _drills_minutes(area, count=None):
    """Minutes of the first `count` drills of an area (all of them by default)."""
    return sum(minutes for _name, _how, minutes in CATALOG[area][1][:count])


def _drill_count(result):
    return sum(len(t["drills"]) for t in result["trainings"])


# ---------- catalog ----------


def test_catalog_has_eight_areas():
    assert ALL_AREAS == [
        "boost", "positioning", "rotation", "defense", "shooting", "speed", "aerials", "ball_control",
    ]


def test_max_focus_areas_is_three():
    assert MAX_FOCUS_AREAS == 3


@pytest.mark.parametrize("area", ALL_AREAS)
def test_catalog_area_has_label(area):
    label = CATALOG[area][0]

    assert isinstance(label, str) and label.strip()


@pytest.mark.parametrize("area", ALL_AREAS)
def test_catalog_area_has_at_least_two_valid_drills(area):
    drills = CATALOG[area][1]

    assert len(drills) >= 2
    for name, how, minutes in drills:
        assert isinstance(name, str) and name.strip()
        assert isinstance(how, str) and how.strip()
        assert isinstance(minutes, int) and minutes > 0


def test_focus_areas_matches_catalog_labels():
    assert FOCUS_AREAS == {key: CATALOG[key][0] for key in CATALOG}
    assert list(FOCUS_AREAS) == ALL_AREAS


# ---------- build_training_plan: nominal ----------


def test_plan_single_area():
    result = build_training_plan(["boost"])

    assert [t["focus"] for t in result["trainings"]] == [FOCUS_AREAS["boost"]]
    # no verified training pack for the boost drills
    assert result["trainings"][0]["drills"] == [
        {"name": n, "how": h, "minutes": m, "training_pack": None} for n, h, m in CATALOG["boost"][1]
    ]
    assert "packs_note" not in result
    assert result["total_minutes"] == _drills_minutes("boost")
    assert result["note"]
    assert "ignored_focus_areas" not in result
    assert "error" not in result


def test_plan_multiple_areas_total_minutes():
    result = build_training_plan(["boost", "positioning", "aerials"])

    # three areas, three drills overall: one drill per area
    assert len(result["trainings"]) == 3
    assert _drill_count(result) == 3
    assert result["total_minutes"] == sum(_drills_minutes(a, 1) for a in ("boost", "positioning", "aerials"))


def test_plan_keeps_requested_order():
    result = build_training_plan(["aerials", "boost", "defense"])

    assert [t["focus"] for t in result["trainings"]] == [FOCUS_AREAS[a] for a in ("aerials", "boost", "defense")]


def test_plan_ignores_duplicates():
    result = build_training_plan(["boost", "speed", "boost", "speed"])

    assert [t["focus"] for t in result["trainings"]] == [FOCUS_AREAS["boost"], FOCUS_AREAS["speed"]]
    # two areas, three drills overall: two for the first area, one for the second
    assert [len(t["drills"]) for t in result["trainings"]] == [2, 1]
    assert result["total_minutes"] == _drills_minutes("boost", 2) + _drills_minutes("speed", 1)
    assert "ignored_focus_areas" not in result


def test_plan_only_duplicates_gives_single_training():
    result = build_training_plan(["boost", "boost", "boost"])

    assert len(result["trainings"]) == 1


# ---------- build_training_plan: limits ----------


def test_plan_exactly_three_areas_ignores_nothing():
    result = build_training_plan(["boost", "speed", "aerials"])

    assert "ignored_focus_areas" not in result


def test_plan_more_than_three_areas_lists_ignored_ones():
    result = build_training_plan(["boost", "speed", "aerials", "defense", "shooting"])

    assert [t["focus"] for t in result["trainings"]] == [FOCUS_AREAS[a] for a in ("boost", "speed", "aerials")]
    assert result["ignored_focus_areas"] == ["defense", "shooting"]
    assert result["total_minutes"] == sum(_drills_minutes(a, 1) for a in ("boost", "speed", "aerials"))


# ---------- build_training_plan: at most MAX_DRILLS drills overall ----------


def test_max_drills_is_three():
    assert MAX_DRILLS == 3


@pytest.mark.parametrize(
    "areas",
    [["boost"], ["boost", "speed"], ["boost", "speed", "aerials"], ALL_AREAS],
)
def test_plan_never_exceeds_max_drills(areas):
    assert _drill_count(build_training_plan(areas)) == MAX_DRILLS


def test_plan_single_area_gives_three_drills_of_that_area():
    result = build_training_plan(["defense"])

    assert len(result["trainings"]) == 1
    assert [d["name"] for d in result["trainings"][0]["drills"]] == [n for n, _h, _m in CATALOG["defense"][1][:3]]


def test_plan_spreads_drills_in_catalog_order_across_areas():
    result = build_training_plan(["speed", "boost"])

    assert [t["focus"] for t in result["trainings"]] == [FOCUS_AREAS["speed"], FOCUS_AREAS["boost"]]
    assert [d["name"] for d in result["trainings"][0]["drills"]] == [n for n, _h, _m in CATALOG["speed"][1][:2]]
    assert [d["name"] for d in result["trainings"][1]["drills"]] == [CATALOG["boost"][1][0][0]]


def test_plan_cap_applies_after_deduplication():
    result = build_training_plan(["boost", "boost", "speed", "speed", "aerials", "defense"])

    assert len(result["trainings"]) == 3
    assert result["ignored_focus_areas"] == ["defense"]


def test_plan_all_areas_keeps_three_and_ignores_rest():
    result = build_training_plan(ALL_AREAS)

    assert len(result["trainings"]) == MAX_FOCUS_AREAS
    assert result["ignored_focus_areas"] == ALL_AREAS[MAX_FOCUS_AREAS:]


def test_plan_does_not_mutate_input():
    areas = ["boost", "boost", "speed", "aerials", "defense"]

    build_training_plan(areas)

    assert areas == ["boost", "boost", "speed", "aerials", "defense"]


# ---------- build_training_plan: errors ----------


@pytest.mark.parametrize("value", [None, [], "boost", {"boost": 1}, 42, ("boost",)])
def test_plan_missing_or_invalid_container(value):
    assert build_training_plan(value) == {
        "error": "Argument focus_areas manquant ou invalide.",
        "allowed": ALL_AREAS,
    }


@pytest.mark.parametrize(
    "value",
    [["cooking"], ["boost", "cooking"], [""], ["BOOST"], [" boost"], [42], ["boost", None], [["boost"]], [{"a": 1}]],
)
def test_plan_unknown_or_non_string_area(value):
    assert build_training_plan(value) == {"error": "Axe d'entraînement inconnu.", "allowed": ALL_AREAS}


def test_plan_unknown_area_after_cap_is_still_an_error():
    result = build_training_plan(["boost", "speed", "aerials", "cooking"])

    assert result["error"] == "Axe d'entraînement inconnu."


# ---------- training packs ----------

PACK_CODE = re.compile(r"[0-9A-F]{4}(-[0-9A-F]{4}){3}")
ALL_DRILL_NAMES = {name for _label, drills in CATALOG.values() for name, _how, _minutes in drills}


def test_training_packs_only_reference_catalog_drills():
    assert set(TRAINING_PACKS) <= ALL_DRILL_NAMES


@pytest.mark.parametrize("drill", sorted(TRAINING_PACKS))
def test_training_pack_has_name_valid_code_and_https_source(drill):
    name, code, source = TRAINING_PACKS[drill]

    assert name.strip()
    assert PACK_CODE.fullmatch(code)
    assert source.startswith("https://")


def test_training_pack_codes_are_unique_per_pack_name():
    packs = {(name, code) for name, code, _source in TRAINING_PACKS.values()}

    assert len({code for _name, code in packs}) == len(packs)


def test_plan_attaches_pack_to_drill_that_has_one():
    result = build_training_plan(["defense"])

    first = result["trainings"][0]["drills"][0]
    assert first["name"] == "Entraînement de gardien"
    assert first["training_pack"] == {
        "name": "[Why You Suck] Shadow Defense",
        "code": "5CCE-FB29-7B05-A0B1",
        "source": "https://www.ggrecon.com/guides/rocket-league-training-codes/",
    }
    assert result["packs_note"] == PACKS_NOTE


def test_plan_gives_none_when_no_verified_pack():
    result = build_training_plan(["rotation"])

    assert all(d["training_pack"] is None for d in result["trainings"][0]["drills"])
    assert "packs_note" not in result


def test_plan_without_any_verified_pack_has_no_packs_note():
    # boost[0], speed[0] ("Rester supersonique") and boost[1]: none of them has a pack
    result = build_training_plan(["boost", "speed"])

    assert all(d["training_pack"] is None for t in result["trainings"] for d in t["drills"])
    assert "packs_note" not in result


def test_plan_mixes_drills_with_and_without_pack():
    # speed[0] "Rester supersonique" (no pack), shooting[0] (pack), speed[1] "Demi-flip et speed flip" (pack)
    result = build_training_plan(["speed", "shooting"])

    by_name = {d["name"]: d["training_pack"] for t in result["trainings"] for d in t["drills"]}
    assert by_name["Rester supersonique"] is None
    assert by_name["Tirs sous plusieurs angles"]["code"] == "6EB1-79B2-33B8-681C"
    assert by_name["Demi-flip et speed flip"]["code"] == "A503-264C-A7EB-D282"
    assert result["packs_note"] == PACKS_NOTE
