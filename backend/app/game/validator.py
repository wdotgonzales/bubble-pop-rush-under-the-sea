"""Decide whether a submitted tap log is believable, and what it scores.

This is the server's whole anti-cheat gate. It never reads a score from the
client: it takes the round's seed (which the server issued), regenerates the
bubble schedule, checks the tap log is humanly possible, and replays it.

Honest limit: a bot that taps the true positions at plausible human speed
passes. That is documented in DECISIONS.md and cannot be fixed without running
the game on the server.
"""

from dataclasses import dataclass

from app.game import config
from app.game.replay import Tap, replay
from app.game.spawn import generate_schedule

# --- Tunable limits ----------------------------------------------------------
# A real round has maybe 60-150 taps. Anything near this cap is a flood.
MAX_TAPS = 400
# The client must ignore a second touch this close to the previous tap.
MIN_TAP_GAP_MS = 25
# Fast human tapping tops out around 10-14 taps per second.
MAX_TAPS_PER_SECOND = 16

# --- Rejection reasons (stored on the round; safe to show in logs) -----------
MALFORMED = "malformed_taps"
TOO_MANY = "too_many_taps"
OUT_OF_RANGE = "tap_out_of_range"
OUT_OF_ORDER = "taps_out_of_order"
TOO_FAST = "taps_too_close"
RATE_EXCEEDED = "tap_rate_exceeded"


@dataclass(frozen=True)
class Verdict:
    valid: bool
    score: int = 0
    popped: tuple[int, ...] = ()
    tap_count: int = 0
    reason: str | None = None


def _reject(reason: str) -> Verdict:
    return Verdict(valid=False, reason=reason)


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def parse_taps(raw: object, field: config.Field = config.DEFAULT_FIELD) -> list[Tap] | str:
    """Raw submitted data -> list of Tap, or a rejection reason string.

    `field` is the shape this round was played on; taps outside it are refused.
    """
    if not isinstance(raw, (list, tuple)):
        return MALFORMED
    if len(raw) > MAX_TAPS:
        return TOO_MANY
    taps: list[Tap] = []
    for item in raw:
        if not isinstance(item, dict) or set(item) != {"t", "x", "y"}:
            return MALFORMED
        t, x, y = item["t"], item["x"], item["y"]
        if not (_is_int(t) and _is_int(x) and _is_int(y)):
            return MALFORMED
        if not 0 <= t <= config.ROUND_DURATION_MS:
            return OUT_OF_RANGE
        if not (0 <= x <= field.width and 0 <= y <= field.height):
            return OUT_OF_RANGE
        taps.append(Tap(t=t, x=x, y=y))
    return taps


def check_rhythm(taps: list[Tap]) -> str | None:
    """Reason the tap timing is impossible for a human, or None if it is fine."""
    for earlier, later in zip(taps, taps[1:]):
        if later.t < earlier.t:
            return OUT_OF_ORDER
        if later.t - earlier.t < MIN_TAP_GAP_MS:
            return TOO_FAST
    # No more than MAX_TAPS_PER_SECOND taps inside any 1000 ms window.
    for i in range(len(taps) - MAX_TAPS_PER_SECOND):
        if taps[i + MAX_TAPS_PER_SECOND].t - taps[i].t < 1000:
            return RATE_EXCEEDED
    return None


def validate_round(
    seed: int, raw_taps: object, field: config.Field = config.DEFAULT_FIELD
) -> Verdict:
    """Validate a tap log for the round that was issued with `seed` on `field`."""
    taps = parse_taps(raw_taps, field)
    if isinstance(taps, str):
        return _reject(taps)
    problem = check_rhythm(taps)
    if problem is not None:
        return _reject(problem)

    schedule = generate_schedule(seed, field)
    score, popped = replay(schedule, taps)
    return Verdict(valid=True, score=score, popped=popped, tap_count=len(taps))
