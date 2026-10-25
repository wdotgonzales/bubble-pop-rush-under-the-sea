import pytest

from app.game import config
from app.game.spawn import generate_schedule, max_score
from app.game.validator import (
    MALFORMED,
    MAX_TAPS,
    MAX_TAPS_PER_SECOND,
    MIN_TAP_GAP_MS,
    OUT_OF_ORDER,
    OUT_OF_RANGE,
    RATE_EXCEEDED,
    TOO_FAST,
    TOO_MANY,
    validate_round,
)

SEED = 42


def tap(t, x=5000, y=5000):
    return {"t": t, "x": x, "y": y}


def spaced(n, gap, start=0):
    return [tap(start + i * gap) for i in range(n)]


def centre_taps(seed=SEED):
    return [
        tap(b.spawn_ms + 100, b.x, b.y) for b in generate_schedule(seed)
    ]


# --- Accepting ---------------------------------------------------------------


def test_empty_tap_log_is_valid_and_scores_zero():
    verdict = validate_round(SEED, [])
    assert verdict.valid and verdict.score == 0 and verdict.tap_count == 0
    assert verdict.reason is None


def test_honest_taps_are_scored_by_the_server():
    taps = centre_taps()
    verdict = validate_round(SEED, taps)
    assert verdict.valid
    assert verdict.score == max_score(generate_schedule(SEED))
    assert verdict.tap_count == len(taps)
    assert len(verdict.popped) == len(taps)


def test_score_depends_on_the_seed_not_the_client():
    # Taps aimed at seed 42's bubbles earn (almost) nothing on a different round.
    other = validate_round(43, centre_taps(42))
    assert other.valid
    assert other.score < max_score(generate_schedule(43)) // 3


def test_taps_on_empty_water_are_fine():
    verdict = validate_round(SEED, [tap(1000, 50, 50), tap(2000, 9950, 9950)])
    assert verdict.valid and verdict.score == 0


def test_taps_at_the_range_limits_are_accepted():
    taps = [
        tap(0, 0, 0),
        tap(config.ROUND_DURATION_MS, config.FIELD_WIDTH, config.FIELD_HEIGHT),
    ]
    assert validate_round(SEED, taps).valid


def test_taps_in_the_lower_part_of_the_tall_field_are_accepted():
    # y beyond FIELD_WIDTH is valid now that the field is portrait.
    taps = [tap(1000, 5000, config.FIELD_WIDTH + 1), tap(2000, 5000, config.FIELD_HEIGHT - 50)]
    assert validate_round(SEED, taps).valid


# --- Malformed input ---------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "taps",
        42,
        {"t": 1, "x": 1, "y": 1},
        [None],
        ["tap"],
        [[100, 5000, 5000]],
        [{"t": 100, "x": 5000}],
        [{"t": 100, "x": 5000, "y": 5000, "extra": 1}],
        [{"t": 100.5, "x": 5000, "y": 5000}],
        [{"t": 100, "x": 5000.0, "y": 5000}],
        [{"t": "100", "x": 5000, "y": 5000}],
        [{"t": True, "x": 5000, "y": 5000}],
        [{"t": 100, "x": None, "y": 5000}],
        [{"t": float("nan"), "x": 5000, "y": 5000}],
    ],
)
def test_malformed_logs_are_rejected(raw):
    verdict = validate_round(SEED, raw)
    assert not verdict.valid
    assert verdict.reason == MALFORMED
    assert verdict.score == 0


@pytest.mark.parametrize(
    "bad",
    [
        tap(-1),
        tap(config.ROUND_DURATION_MS + 1),
        tap(100, -1, 5000),
        tap(100, config.FIELD_WIDTH + 1, 5000),
        tap(100, 5000, -1),
        tap(100, 5000, config.FIELD_HEIGHT + 1),
    ],
)
def test_out_of_range_taps_are_rejected(bad):
    assert validate_round(SEED, [bad]).reason == OUT_OF_RANGE


def test_too_many_taps_are_rejected():
    verdict = validate_round(SEED, [tap(0)] * (MAX_TAPS + 1))
    assert verdict.reason == TOO_MANY


# --- Impossible rhythm -------------------------------------------------------


def test_taps_out_of_order_are_rejected():
    assert validate_round(SEED, [tap(500), tap(100)]).reason == OUT_OF_ORDER


def test_simultaneous_taps_are_rejected():
    assert validate_round(SEED, [tap(500), tap(500, 6000)]).reason == TOO_FAST


def test_gap_just_under_the_minimum_is_rejected_and_the_minimum_is_allowed():
    assert validate_round(SEED, [tap(500), tap(500 + MIN_TAP_GAP_MS - 1)]).reason == TOO_FAST
    assert validate_round(SEED, [tap(500), tap(500 + MIN_TAP_GAP_MS)]).valid


def test_sixteen_taps_in_a_second_are_allowed_seventeen_are_not():
    ok = spaced(MAX_TAPS_PER_SECOND, 60)  # 16 taps over 900 ms
    assert validate_round(SEED, ok).valid

    flood = spaced(MAX_TAPS_PER_SECOND + 1, 60)  # 17 taps over 960 ms
    assert validate_round(SEED, flood).reason == RATE_EXCEEDED


def test_a_fast_burst_is_fine_if_it_does_not_last():
    burst = spaced(MAX_TAPS_PER_SECOND, 40) + spaced(MAX_TAPS_PER_SECOND, 40, start=3000)
    assert validate_round(SEED, burst).valid


def test_sustained_superhuman_speed_is_rejected():
    taps = spaced(200, 30)  # 33 taps per second for six seconds
    assert validate_round(SEED, taps).reason == RATE_EXCEEDED


def test_rejected_rounds_never_carry_a_score():
    verdict = validate_round(SEED, [tap(500), tap(500)])
    assert not verdict.valid
    assert verdict.score == 0 and verdict.popped == ()


def test_validation_is_deterministic():
    taps = centre_taps()
    assert validate_round(SEED, taps) == validate_round(SEED, taps)
