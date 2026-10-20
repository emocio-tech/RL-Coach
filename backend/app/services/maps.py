"""In-game display names of Rocket League arenas, from the internal map codes stored in replays.

Variants of an arena (day, night, stormy...) all map to the arena name. Sources: the map code
table of https://github.com/Xylot/RLMapChanger and https://rlstats.net/gameinfo/mapsets.
"""

_ARENAS = {
    "Aquadome": ["underwater_p", "underwater_grs_p"],
    "Arctagon": ["arc_p"],
    "Badlands": ["wasteland_p", "wasteland_night_p"],
    "Barricade": ["labs_pillarheat_p"],
    "Basin": ["labs_basin_p"],
    "Beckwith Park": ["park_p", "park_night_p", "park_rainy_p"],
    "Boostfield Mall": ["mall_day_p"],
    "Calavera": ["ko_calavera_p"],
    "Carbon": ["ko_carbon_p"],
    "Champions Field": ["cs_p", "cs_day_p", "swoosh_p", "bb_p"],
    "Colossus": ["labs_pillarwings_p"],
    "Core 707": ["shattershot_p"],
    "Corridor": ["labs_corridor_p"],
    "Cosmic": ["labs_cosmic_p", "labs_cosmic_v4_p"],
    "Deadeye Canyon": ["outlaw_p", "outlaw_oasis_p"],
    "DFH Stadium": ["stadium_p", "stadium_10a_p", "stadium_day_p", "stadium_foggy_p", "stadium_winter_p"],
    "Double Goal": ["labs_doublegoal_p", "labs_doublegoal_v2_p"],
    "Drift Woods": ["woods_night_p"],
    "Dunk House": ["hoopsstadium_p"],
    "Estadio Vida": ["ff_dusk_p"],
    "Farmstead": ["farm_p", "farm_grs_p", "farm_night_p", "farm_hw_p", "farm_upsidedown_p"],
    "Forbidden Temple": ["chn_stadium_p", "chn_stadium_day_p"],
    "Futura Garden": ["uf_day_p", "uf_night_p"],
    "Galleon": ["labs_galleon_p"],
    "Galleon Retro": ["labs_galleon_mast_p"],
    "Hourglass": ["labs_pillarglass_p"],
    "Loophole": ["labs_holyfield_p"],
    "Mannfield": [
        "eurostadium_p", "eurostadium_dusk_p", "eurostadium_night_p", "eurostadium_rainy_p",
        "eurostadium_snownight_p", "labs_4v4_arena15_eurostadium_night_p",
    ],
    "Midnight Metro": ["labs_4v4_arena15_blackout_p"],
    "Neo Tokyo": ["neotokyo_p", "neotokyo_standard_p", "neotokyo_arcade_p"],
    "Octagon": ["labs_octagon_p", "labs_octagon_02_p"],
    "Parc de Paris": ["paname_dusk_p"],
    "Pillars": ["labs_circlepillars_p"],
    "Quadron": ["ko_quadron_p"],
    "Rivals Arena": ["cs_hw_p"],
    "Roadblock": ["labs_octagon_b2b_02_p"],
    "Salty Shores": ["beach_p", "beach_night_p", "beach_night_grs_p", "beachvolley"],
    "Sovereign Heights": ["street_p"],
    "Starbase ARC": ["arc_standard_p"],
    "Sunset Dunes": ["labs_4v4_arena15_retro_p"],
    "The Block": ["hoopsstreet_p"],
    "Throwback Stadium": ["throwbackstadium_p"],
    "Underpass": ["labs_underpass_p", "labs_underpass_v0_p"],
    "Urban Central": ["trainstation_p", "trainstation_dawn_p", "trainstation_night_p", "haunted_trainstation_p"],
    "Utopia Coliseum": ["utopiastadium_p", "utopiastadium_dusk_p", "utopiastadium_lux_p", "utopiastadium_snow_p"],
    "Utopia Retro": ["labs_utopia_p"],
    "Vent": ["labs_octagon_vent_p"],
    "Wasteland": ["wasteland_s_p", "wasteland_grs_p", "wasteland_night_s_p"],
}

_DISPLAY_NAMES = {code: name for name, codes in _ARENAS.items() for code in codes}


def display_name(map_code: str | None) -> str | None:
    """In-game arena name for an internal map code (case-insensitive); unknown codes are returned as is."""
    if not map_code:
        return map_code
    return _DISPLAY_NAMES.get(map_code.lower(), map_code)
