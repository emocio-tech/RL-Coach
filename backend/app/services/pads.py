"""Boost pad animation data: where each pad is and when it was picked up / is available again.

The replay gives no position for the pad actors, so a pad is located from the cars that picked it up
(median of their positions), then matched to the standard Soccar layout.
"""

import math
from statistics import median

# (x, y, big), same values as BIG_PADS then SMALL_PADS of frontend/src/viewer3d/constants.js.
STANDARD_PADS = [
    (-3584.0, 0.0, True), (3584.0, 0.0, True),
    (-3072.0, 4096.0, True), (3072.0, 4096.0, True), (-3072.0, -4096.0, True), (3072.0, -4096.0, True),
    (0.0, -4240.0, False), (-1792.0, -4184.0, False), (1792.0, -4184.0, False),
    (-940.0, -3308.0, False), (940.0, -3308.0, False), (0.0, -2816.0, False),
    (-3584.0, -2484.0, False), (3584.0, -2484.0, False), (-1788.0, -2300.0, False), (1788.0, -2300.0, False),
    (-2048.0, -1036.0, False), (0.0, -1024.0, False),
    (2048.0, -1036.0, False), (-1024.0, 0.0, False), (1024.0, 0.0, False),
    (-2048.0, 1036.0, False), (0.0, 1024.0, False), (2048.0, 1036.0, False),
    (-1788.0, 2300.0, False), (1788.0, 2300.0, False), (-3584.0, 2484.0, False), (3584.0, 2484.0, False),
    (0.0, 2816.0, False),
    (-940.0, 3308.0, False), (940.0, 3308.0, False), (-1792.0, 4184.0, False), (1792.0, 4184.0, False),
    (0.0, 4240.0, False),
]

MAX_ASSIGN_DISTANCE = 900.0


def _hungarian(cost):
    """Minimum-cost assignment of every row to a distinct column (rows <= columns).

    Returns, for each row, the index of its column.
    """
    n = len(cost)
    m = len(cost[0]) if n else 0
    inf = float("inf")
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    owner = [0] * (m + 1)  # owner[j]: row (1-based) assigned to column j, 0 if free
    way = [0] * (m + 1)
    for i in range(1, n + 1):
        owner[0] = i
        j0 = 0
        minv = [inf] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0 = owner[j0]
            delta = inf
            j1 = 0
            for j in range(1, m + 1):
                if used[j]:
                    continue
                current = cost[i0 - 1][j - 1] - u[i0] - v[j]
                if current < minv[j]:
                    minv[j] = current
                    way[j] = j0
                if minv[j] < delta:
                    delta = minv[j]
                    j1 = j
            for j in range(m + 1):
                if used[j]:
                    u[owner[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if owner[j0] == 0:
                break
        while j0:
            j1 = way[j0]
            owner[j0] = owner[j1]
            j0 = j1
    result = [-1] * n
    for j in range(1, m + 1):
        if owner[j]:
            result[owner[j] - 1] = j - 1
    return result


def _assign(distances):
    """Optimal one-to-one matching of rows to columns: {row: column} (the smaller side is fully matched)."""
    if not distances or not distances[0]:
        return {}
    rows, cols = len(distances), len(distances[0])
    if rows <= cols:
        return {row: col for row, col in enumerate(_hungarian(distances))}
    transposed = [[distances[r][c] for r in range(rows)] for c in range(cols)]
    return {row: col for col, row in enumerate(_hungarian(transposed))}


def _key_pickups(pickups, releases):
    """[{t, back}] of one pad key: back is the first release after a pickup and before the next one."""
    ordered = sorted(pickups)
    ends = sorted(releases)
    result = []
    for index, t in enumerate(ordered):
        limit = ordered[index + 1] if index + 1 < len(ordered) else math.inf
        back = next((r for r in ends if r > t), None)
        result.append({"t": t, "back": back if back is not None and back < limit else None})
    return result


def locate_pads(pickup_events, release_events):
    """Locate the pads seen in a replay on the standard layout.

    pickup_events: [(t, pad_key, (x, y) or None)] and release_events: [(t, pad_key)], times in seconds.
    Returns [{x, y, big, pickups: [{t, back}]}] sorted by x then y. A pad key without any position, or
    farther than MAX_ASSIGN_DISTANCE from the standard pad it is matched to, is ignored.
    """
    samples = {}
    key_pickups = {}
    key_releases = {}
    for t, key, position in pickup_events:
        key_pickups.setdefault(key, []).append(t)
        if position is not None:
            samples.setdefault(key, []).append(position)
    for t, key in release_events:
        key_releases.setdefault(key, []).append(t)

    keys = sorted((k for k in samples), key=repr)
    centers = [
        (median(p[0] for p in samples[k]), median(p[1] for p in samples[k])) for k in keys
    ]
    distances = [
        [math.hypot(cx - px, cy - py) for px, py, _big in STANDARD_PADS] for cx, cy in centers
    ]

    pad_of_key = {}
    for row, col in _assign(distances).items():
        if distances[row][col] <= MAX_ASSIGN_DISTANCE:
            pad_of_key[row] = col
    # A key left over (several keys for the same pad, e.g. a recreated actor) joins the nearest pad in range.
    for row in range(len(keys)):
        if row in pad_of_key:
            continue
        nearest = min(range(len(STANDARD_PADS)), key=lambda col: distances[row][col])
        if distances[row][nearest] <= MAX_ASSIGN_DISTANCE:
            pad_of_key[row] = nearest

    merged = {}
    for row, col in pad_of_key.items():
        key = keys[row]
        merged.setdefault(col, []).extend(
            _key_pickups(key_pickups.get(key, []), key_releases.get(key, []))
        )

    pads = []
    for col, pickups in merged.items():
        x, y, big = STANDARD_PADS[col]
        pads.append({"x": x, "y": y, "big": big, "pickups": sorted(pickups, key=lambda p: p["t"])})
    return sorted(pads, key=lambda pad: (pad["x"], pad["y"]))
