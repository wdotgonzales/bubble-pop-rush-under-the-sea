"""Game rules shared by the server and the game client.

Every number here is an integer on purpose. The client (TypeScript) and the
server (Python) must produce the *same* bubble schedule from the same seed, and
integer math is the one thing both languages agree on exactly.

Any change that alters a generated schedule or how taps are scored (a phase
value, a radius, a chance, the hit rules, the PRNG, the order of random draws)
MUST bump CONFIG_VERSION and regenerate
shared/spawn-vectors.json with scripts/generate_spawn_vectors.py. The game
client must mirror the change in shared/spawn.js (or its TypeScript port).
"""

from dataclasses import dataclass

CONFIG_VERSION = 4

ROUND_DURATION_MS = 30_000

# The play field is a rectangle of integer units. Positions are integers in
# 0..width by 0..height; radii are in the same units. The client scales BOTH axes
# by one factor, so bubbles stay round and the hit test, which is plain distance in
# these units, matches what is drawn.
#
# The field's SHAPE is chosen per round: the game asks for one that fits its window
# (a tall one on a phone, a wide one on a desktop, so every screen is used in full),
# and the server keeps it with the round. Only the bounds below are fixed, so a client
# cannot ask for something absurd. A bubble's size in units never changes, so the game
# draws it at a similar size on every screen, and a bigger field just has more room
# between bubbles.
#
# FIELD_WIDTH x FIELD_HEIGHT is the default: the portrait phone layout in the design
# (390 x 844, where one unit is 0.039 px). It is used when a round is started without
# asking for a shape.
FIELD_WIDTH = 10_000
FIELD_HEIGHT = 21_640

# Each side of a field must be within these, and the long side at most this many
# times the short one (so no thin slivers).
FIELD_MIN = 8_000
FIELD_MAX = 64_000
FIELD_MAX_RATIO = 3


@dataclass(frozen=True)
class Field:
    width: int
    height: int


DEFAULT_FIELD = Field(FIELD_WIDTH, FIELD_HEIGHT)


def is_valid_field(width: object, height: object) -> bool:
    """Is this a field shape the server will play on?"""
    for side in (width, height):
        if isinstance(side, bool) or not isinstance(side, int):
            return False
        if not FIELD_MIN <= side <= FIELD_MAX:
            return False
    return max(width, height) <= FIELD_MAX_RATIO * min(width, height)

# First bubble appears this long after the round starts.
INITIAL_DELAY_MS = 400

# Tap rules. The client and the server score taps with the same hit test
# (app/game/replay.py and shared/spawn.js), so the score on screen is the score
# the server computes.
# A bubble can always be hit within this radius, even once it has shrunk below it,
# so late taps stay possible and tap targets stay finger-sized (900 units is about
# 35 px on a 390 px wide phone).
HIT_MIN_RADIUS = 900
# A bubble can still be hit this long after it expires, to absorb frame jitter.
HIT_GRACE_MS = 50

# Each gap between spawns is the phase interval, varied by up to this many
# thousandths either way, so the rhythm is not a metronome.
SPAWN_JITTER_PERMILLE = 200


@dataclass(frozen=True)
class Phase:
    start_ms: int
    end_ms: int
    spawn_interval_ms: int
    lifetime_ms: int


# Difficulty curve from the concept doc: warm-up, build, rush.
PHASES = (
    Phase(start_ms=0, end_ms=10_000, spawn_interval_ms=700, lifetime_ms=1_800),
    Phase(start_ms=10_000, end_ms=20_000, spawn_interval_ms=500, lifetime_ms=1_400),
    Phase(start_ms=20_000, end_ms=30_000, spawn_interval_ms=350, lifetime_ms=1_000),
)


@dataclass(frozen=True)
class BubbleKind:
    id: int
    name: str
    points: int
    radius: int  # starting radius, in field units; it shrinks linearly to 0
    lifetime_pct: int  # percent of the phase lifetime this kind lives
    chance_permille: int  # chance a spawn is this kind


# Radii are sized to the design: a fresh standard bubble is about 133 px across on a
# 390 px wide phone, like the largest bubbles in the mockups.
STANDARD = BubbleKind(
    id=0, name="standard", points=1, radius=1700, lifetime_pct=100, chance_permille=850
)
# The creative twist: rarer, worth 3, smaller, and gone sooner.
PEARL = BubbleKind(
    id=1, name="pearl", points=3, radius=1400, lifetime_pct=70, chance_permille=150
)
KINDS = (STANDARD, PEARL)


def config_as_dict() -> dict:
    """The whole config as plain data, for the shared test vectors."""
    return {
        "version": CONFIG_VERSION,
        "duration_ms": ROUND_DURATION_MS,
        "field_width": FIELD_WIDTH,
        "field_height": FIELD_HEIGHT,
        "field_min": FIELD_MIN,
        "field_max": FIELD_MAX,
        "field_max_ratio": FIELD_MAX_RATIO,
        "initial_delay_ms": INITIAL_DELAY_MS,
        "spawn_jitter_permille": SPAWN_JITTER_PERMILLE,
        "hit_min_radius": HIT_MIN_RADIUS,
        "hit_grace_ms": HIT_GRACE_MS,
        "phases": [
            {
                "start_ms": p.start_ms,
                "end_ms": p.end_ms,
                "spawn_interval_ms": p.spawn_interval_ms,
                "lifetime_ms": p.lifetime_ms,
            }
            for p in PHASES
        ],
        "kinds": [
            {
                "id": k.id,
                "name": k.name,
                "points": k.points,
                "radius": k.radius,
                "lifetime_pct": k.lifetime_pct,
                "chance_permille": k.chance_permille,
            }
            for k in KINDS
        ],
    }
