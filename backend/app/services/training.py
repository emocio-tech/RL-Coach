"""Catalog of training drills by improvement area, used by the coach tool `suggest_training`.

The drills are generic (no workshop codes or training pack ids, which would have to be invented):
the coach picks the areas matching the advice it gave, this module returns the drills.
"""

MAX_FOCUS_AREAS = 3
MAX_DRILLS = 3  # total number of drills returned, whatever the number of areas

# area -> (label, [(drill name, how to practise it, minutes)])
CATALOG: dict[str, tuple[str, list[tuple[str, str, int]]]] = {
    "boost": (
        "Gestion du boost",
        [
            (
                "Tour de terrain aux petits pads",
                "En entraînement libre, fais le tour du terrain en ne ramassant que les petits pads, "
                "sans jamais tomber à 0 de boost.",
                5,
            ),
            (
                "Rotation aux grosses boosts",
                "Enchaîne des rotations en visant uniquement les grosses boosts de ton côté du terrain, "
                "puis reviens en défense.",
                5,
            ),
            (
                "Boost par à-coups",
                "Traverse le terrain en boostant par courtes impulsions au lieu de maintenir la touche, "
                "et note le niveau de boost à l'arrivée.",
                5,
            ),
        ],
    ),
    "positioning": (
        "Placement",
        [
            (
                "Rester derrière la balle",
                "En match privé ou en entraînement libre, joue en gardant toujours la voiture entre la balle "
                "et ton propre but, sauf pour aller chercher un boost.",
                10,
            ),
            (
                "Position de soutien",
                "Place-toi à mi-distance entre la balle et ton but pendant que l'attaquant joue, "
                "puis avance de quelques mètres à chaque passe.",
                10,
            ),
            (
                "Revue de replay",
                "Rejoue une de tes parties et regarde où tu te trouves au moment où l'adversaire frappe : "
                "es-tu trop haut ou trop près de la balle ?",
                15,
            ),
        ],
    ),
    "rotation": (
        "Rotations",
        [
            (
                "Rotation en sens horaire",
                "En match privé à deux ou trois, adopte une rotation fixe : le joueur le plus proche attaque, "
                "les autres repassent par un boost avant de revenir derrière.",
                15,
            ),
            (
                "Appels et communication",
                "Utilise les messages rapides (« Je l'ai », « Défends ») à chaque duel pour éviter "
                "que deux joueurs aillent sur la même balle.",
                10,
            ),
            (
                "Compter les troisièmes hommes",
                "Pendant un match, repère à voix haute qui est premier, deuxième et troisième homme "
                "et corrige ta position dès que tu es en trop près de la balle.",
                10,
            ),
        ],
    ),
    "defense": (
        "Défense et arrêts",
        [
            (
                "Entraînement de gardien",
                "Fais tirer un partenaire (ou utilise un pack d'entraînement de gardien) depuis plusieurs angles "
                "et travaille l'arrêt en gardant la voiture face à la balle.",
                10,
            ),
            (
                "Dégagements",
                "En entraînement libre, renvoie la balle en hauteur ou sur les côtés depuis ton but "
                "pour éviter les rebonds au centre.",
                10,
            ),
            (
                "Lecture des rebonds",
                "Lance la balle contre un mur et place-toi à l'endroit où elle va retomber avant de la jouer.",
                5,
            ),
        ],
    ),
    "shooting": (
        "Tirs et finition",
        [
            (
                "Tirs sous plusieurs angles",
                "En entraînement libre, tire depuis la gauche, le centre et la droite, "
                "et vise les coins du but plutôt que la puissance.",
                10,
            ),
            (
                "Frappes en première touche",
                "Fais rebondir la balle puis frappe-la sans la contrôler pour apprendre à cadrer rapidement.",
                10,
            ),
            (
                "Puissance et précision",
                "Alterne des frappes puissantes depuis le milieu du terrain et des frappes placées "
                "depuis la surface, et compte tes tirs cadrés sur dix essais.",
                10,
            ),
        ],
    ),
    "speed": (
        "Vitesse et déplacement",
        [
            (
                "Rester supersonique",
                "Traverse le terrain en gardant la vitesse maximale avec des flips ou des demi-flips "
                "bien placés, sans perdre le contrôle.",
                10,
            ),
            (
                "Demi-flip et speed flip",
                "Répète le demi-flip pour te replacer vite en défense et le speed flip pour les engagements.",
                10,
            ),
            (
                "Trajectoire courte vers les boosts",
                "Choisis le chemin le plus court entre trois boosts et réalise-le sans ralentir ni dérailler.",
                5,
            ),
        ],
    ),
    "aerials": (
        "Aériens",
        [
            (
                "Aériens à boost limité",
                "En entraînement libre, enchaîne des aériens en gardant la balle devant toi "
                "et en limitant ta consommation de boost.",
                10,
            ),
            (
                "Premier saut maîtrisé",
                "Travaille le double saut et l'alignement avant de décoller pour intercepter la balle au bon endroit.",
                10,
            ),
            (
                "Reprises aériennes",
                "Fais rebondir la balle haut et frappe-la en l'air vers le but depuis plusieurs positions.",
                10,
            ),
        ],
    ),
    "ball_control": (
        "Contrôle de balle",
        [
            (
                "Conduite de balle",
                "Garde la balle sur le toit en avançant doucement, puis en changeant de direction.",
                10,
            ),
            (
                "Premier contact",
                "Amortis la balle venue de haut ou de loin pour l'arrêter à ton niveau avant de jouer.",
                10,
            ),
            (
                "Dribble contre un adversaire",
                "En match privé en un contre un, garde la balle le plus longtemps possible sous pression.",
                10,
            ),
        ],
    ),
}

FOCUS_AREAS = {key: label for key, (label, _drills) in CATALOG.items()}

_GGRECON = "https://www.ggrecon.com/guides/rocket-league-training-codes/"
_GAMING_NET = "https://www.gaming.net/best-rocket-league-training-packs-for-beginners/"
_DIGNITAS = "https://dignitas.gg/articles/blogs/rocket-league/13400/the-best-ways-to-train-in-rocket-league"
_TROPHI = "https://www.trophi.ai/post/how-to-speed-flip-in-rocket-league"

# drill name -> Rocket League custom training pack (name, code, source).
# Only codes read on the source page are listed: a missing drill means "no verified pack", never a guess.
# These are community packs: their creators can change or remove them, so the codes must be re-checked in game.
TRAINING_PACKS: dict[str, tuple[str, str, str]] = {
    "Entraînement de gardien": ("[Why You Suck] Shadow Defense", "5CCE-FB29-7B05-A0B1", _GGRECON),
    "Dégagements": ("Clears", "5DA1-EA21-5EF9-EA21", _GAMING_NET),
    "Lecture des rebonds": ("Backboard reads", "07E1-81BC-DD2E-BF8C", _DIGNITAS),
    "Tirs sous plusieurs angles": ("Ground Shots", "6EB1-79B2-33B8-681C", _GAMING_NET),
    "Frappes en première touche": ("Powershot Practice", "C9E4-0F05-B71A-C322", _GAMING_NET),
    "Puissance et précision": ("Ground Shooting Pack #1", "6B31-5C76-BDEB-16FC", _GAMING_NET),
    "Demi-flip et speed flip": ("Musty's Speed Flip Training Pack", "A503-264C-A7EB-D282", _TROPHI),
    "Aériens à boost limité": ("Novice Aerials", "0A40-E21D-61C1-49C6", _GAMING_NET),
    "Premier saut maîtrisé": ("Basic Mechanics Training", "20DF-6522-E79F-D098", _GGRECON),
}

PACKS_NOTE = (
    "Codes de packs communautaires relevés dans des guides : ils n'ont pas été testés en jeu et leur créateur peut "
    "les avoir modifiés ou retirés. Pour les utiliser : Jouer > Entraînement > Personnalisé > saisir le code."
)


def _training_pack(drill_name: str) -> dict | None:
    pack = TRAINING_PACKS.get(drill_name)
    if pack is None:
        return None
    name, code, source = pack
    return {"name": name, "code": code, "source": source}


def build_training_plan(focus_areas) -> dict:
    """Drills for the given areas (at most MAX_FOCUS_AREAS, duplicates ignored), or an error result."""
    if not isinstance(focus_areas, list) or not focus_areas:
        return {"error": "Argument focus_areas manquant ou invalide.", "allowed": list(FOCUS_AREAS)}
    unknown = [area for area in focus_areas if not isinstance(area, str) or area not in CATALOG]
    if unknown:
        return {"error": "Axe d'entraînement inconnu.", "allowed": list(FOCUS_AREAS)}

    areas = list(dict.fromkeys(focus_areas))
    kept = areas[:MAX_FOCUS_AREAS]

    # At most MAX_DRILLS drills overall, spread over the areas (first drill of each area, then the second...).
    picked: dict[str, list[tuple[str, str, int]]] = {area: [] for area in kept}
    count = 0
    for rank in range(max(len(CATALOG[area][1]) for area in kept)):
        for area in kept:
            drills = CATALOG[area][1]
            if rank < len(drills) and count < MAX_DRILLS:
                picked[area].append(drills[rank])
                count += 1

    plan = [
        {
            "focus": CATALOG[area][0],
            "drills": [
                {"name": name, "how": how, "minutes": minutes, "training_pack": _training_pack(name)}
                for name, how, minutes in drills
            ],
        }
        for area, drills in picked.items()
        if drills
    ]
    result = {
        "trainings": plan,
        "total_minutes": sum(d["minutes"] for item in plan for d in item["drills"]),
        "note": "Exercices génériques, à faire en entraînement libre ou en match privé.",
    }
    if any(d["training_pack"] for item in plan for d in item["drills"]):
        result["packs_note"] = PACKS_NOTE
    if len(areas) > MAX_FOCUS_AREAS:
        result["ignored_focus_areas"] = areas[MAX_FOCUS_AREAS:]
    return result
