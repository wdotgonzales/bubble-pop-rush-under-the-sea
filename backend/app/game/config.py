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

CONFIG_VERSION = 2

ROUND_DURATION_MS = 30_000

# Positions are integers in a square 0..FIELD_SIZE space. The client scales this
# to the real play area; radii are in the same units.
FIELD_SIZE = 10_000

# First bubble appears this long after the round starts.
INITIAL_DELAY_MS = 400

# Tap rules. The client and the server score taps with the same hit test
# (app/game/replay.py and shared/spawn.js), so the score on screen is the score
# the server computes.
# A bubble can always be hit within this radius, even once it has shrunk below it,
# so late taps stay possible and tap targets stay finger-sized.
HIT_MIN_RADIUS = 600
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


STANDARD = BubbleKind(
    id=0, name="standard", points=1, radius=900, lifetime_pct=100, chance_permille=850
)
# The creative twist: rarer, worth 3, smaller, and gone sooner.
PEARL = BubbleKind(
    id=1, name="pearl", points=3, radius=800, lifetime_pct=70, chance_permille=150
)
KINDS = (STANDARD, PEARL)


def config_as_dict() -> dict:
    """The whole config as plain data, for the shared test vectors."""
    return {
        "version": CONFIG_VERSION,
        "duration_ms": ROUND_DURATION_MS,
        "field_size": FIELD_SIZE,
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
