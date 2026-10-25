"""Scoring taps against a bubble schedule. Shared logic: the game client runs the
same rules (shared/spawn.js: findHit and replay), so the score a player sees is
the score the server computes.

Rules:
  * A tap pops at most one bubble.
  * A bubble can be popped once.
  * A bubble is poppable from its spawn time until HIT_GRACE_MS after it expires.
  * A tap hits a bubble if it lands within the bubble's current radius, but never
    less than HIT_MIN_RADIUS (so shrunken bubbles stay tappable).
  * If several bubbles qualify, the most recently spawned one wins (it is drawn
    on top).
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.game import config
from app.game.spawn import Bubble, radius_at


@dataclass(frozen=True)
class Tap:
    t: int  # ms since the round started, on the client's clock
    x: int  # 0..FIELD_SIZE
    y: int


def find_hit(
    schedule: Sequence[Bubble], tap: Tap, popped: set[int] | frozenset[int]
) -> Bubble | None:
    """The bubble this tap pops, or None if it lands on empty water."""
    hit = None
    for bubble in schedule:  # schedule is in spawn order
        if bubble.spawn_ms > tap.t:
            break
        if bubble.index in popped:
            continue
        if tap.t >= bubble.expires_ms + config.HIT_GRACE_MS:
            continue
        reach = max(radius_at(bubble, tap.t), config.HIT_MIN_RADIUS)
        dx = tap.x - bubble.x
        dy = tap.y - bubble.y
        if dx * dx + dy * dy <= reach * reach:
            hit = bubble  # later spawns override earlier ones
    return hit


def replay(schedule: Sequence[Bubble], taps: Iterable[Tap]) -> tuple[int, tuple[int, ...]]:
    """Score a tap log (already in time order). Returns (score, popped indexes in pop order)."""
    popped: set[int] = set()
    order: list[int] = []
    score = 0
    for tap in taps:
        bubble = find_hit(schedule, tap, popped)
        if bubble is not None:
            popped.add(bubble.index)
            order.append(bubble.index)
            score += bubble.points
    return score, tuple(order)
