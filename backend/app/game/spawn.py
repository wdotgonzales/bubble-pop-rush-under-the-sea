"""Deterministic bubble schedule: the same seed always gives the same bubbles.

The game client runs the same algorithm (shared/spawn.js) to know what to
draw. The server runs this one to know what was really on screen when it
replays a tap log, so it never has to trust the client about the score.

Rules that keep the two implementations identical:
  * integers only, no floats anywhere;
  * every bubble consumes the same random draws in the same order:
    kind, x, y, then the gap to the next spawn;
  * "a // b" here means floor division of non-negative integers, which is
    Math.floor(a / b) in JavaScript.
"""

from dataclasses import dataclass

from app.game import config

_MASK = 0xFFFFFFFF


class Mulberry32:
    """Small 32-bit PRNG (mulberry32). Identical in every language, unlike
    Python's random module, whose algorithm is an implementation detail."""

    def __init__(self, seed: int):
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= _MASK:
            raise ValueError("seed must be an integer in 0..2**32-1")
        self._state = seed

    def next_u32(self) -> int:
        self._state = (self._state + 0x6D2B79F5) & _MASK
        s = self._state
        t = ((s ^ (s >> 15)) * (1 | s)) & _MASK
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & _MASK)) & _MASK) ^ t
        return (t ^ (t >> 14)) & _MASK

    def below(self, n: int) -> int:
        """Integer in 0..n-1."""
        if n <= 0:
            raise ValueError("n must be positive")
        return self.next_u32() % n


@dataclass(frozen=True)
class Bubble:
    index: int
    spawn_ms: int
    x: int
    y: int
    kind: int
    points: int
    radius: int  # starting radius
    lifetime_ms: int

    @property
    def expires_ms(self) -> int:
        return self.spawn_ms + self.lifetime_ms

    def as_vector(self) -> list[int]:
        """Compact form used in shared/spawn-vectors.json."""
        return [self.spawn_ms, self.x, self.y, self.kind, self.lifetime_ms]


def phase_at(time_ms: int) -> config.Phase:
    for phase in config.PHASES:
        if phase.start_ms <= time_ms < phase.end_ms:
            return phase
    return config.PHASES[-1]


def generate_schedule(seed: int) -> tuple[Bubble, ...]:
    """Every bubble of a round, in spawn order."""
    rng = Mulberry32(seed)
    pearl = config.PEARL
    standard = config.STANDARD
    jitter = config.SPAWN_JITTER_PERMILLE

    bubbles: list[Bubble] = []
    t = config.INITIAL_DELAY_MS
    while t < config.ROUND_DURATION_MS:
        phase = phase_at(t)
        kind = pearl if rng.below(1000) < pearl.chance_permille else standard
        span = config.FIELD_SIZE - 2 * kind.radius + 1
        x = kind.radius + rng.below(span)
        y = kind.radius + rng.below(span)
        bubbles.append(
            Bubble(
                index=len(bubbles),
                spawn_ms=t,
                x=x,
                y=y,
                kind=kind.id,
                points=kind.points,
                radius=kind.radius,
                lifetime_ms=phase.lifetime_ms * kind.lifetime_pct // 100,
            )
        )
        gap_factor = 1000 + rng.below(2 * jitter + 1) - jitter
        t += phase.spawn_interval_ms * gap_factor // 1000
    return tuple(bubbles)


def radius_at(bubble: Bubble, time_ms: int) -> int:
    """Current radius: full at spawn, shrinking linearly to 0 at expiry."""
    elapsed = time_ms - bubble.spawn_ms
    if elapsed < 0 or elapsed >= bubble.lifetime_ms:
        return 0
    return bubble.radius * (bubble.lifetime_ms - elapsed) // bubble.lifetime_ms


def max_score(schedule: tuple[Bubble, ...]) -> int:
    """Score if every single bubble were popped. Upper bound for validation."""
    return sum(b.points for b in schedule)
