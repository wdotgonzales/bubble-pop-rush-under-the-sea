import json
from pathlib import Path

import pytest

from app.game import config
from app.game.replay import Tap, find_hit, replay
from app.game.spawn import Bubble, generate_schedule, max_score, radius_at

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "spawn-vectors.json").read_text(
        encoding="utf-8"
    )
)


def bubble(index, spawn_ms=0, x=5000, y=5000, kind=0, lifetime_ms=1000, radius=config.STANDARD.radius):
    return Bubble(
        index=index,
        spawn_ms=spawn_ms,
        x=x,
        y=y,
        kind=kind,
        points=3 if kind else 1,
        radius=radius,
        lifetime_ms=lifetime_ms,
    )


# --- Shared vectors: the contract with the game client -----------------------


@pytest.mark.parametrize("case", VECTORS["replays"], ids=lambda c: f"{c['name']}-{c['seed']}-{c['field'][0]}x{c['field'][1]}")
def test_replay_matches_the_shared_vectors(case):
    taps = [Tap(*t) for t in case["taps"]]
    score, popped = replay(generate_schedule(case["seed"], config.Field(*case["field"])), taps)
    assert score == case["score"]
    assert list(popped) == case["popped"]


def test_a_flawless_bot_scores_the_maximum():
    schedule = generate_schedule(42)
    taps = [Tap(b.spawn_ms + b.lifetime_ms // 3, b.x, b.y) for b in schedule]
    score, popped = replay(schedule, taps)
    assert score == max_score(schedule)
    assert len(popped) == len(schedule)


# --- Hit test ----------------------------------------------------------------


def test_tap_on_the_centre_hits():
    b = bubble(0)
    assert find_hit([b], Tap(100, 5000, 5000), set()) is b


def test_empty_water_misses():
    b = bubble(0)
    assert find_hit([b], Tap(100, 9000, 9000), set()) is None


def test_hit_radius_edge_is_inclusive():
    b = bubble(0, lifetime_ms=1000, radius=config.STANDARD.radius)
    r = radius_at(b, 100)
    assert find_hit([b], Tap(100, 5000 + r, 5000), set()) is b
    assert find_hit([b], Tap(100, 5000 + r + 1, 5000), set()) is None


def test_distance_is_euclidean_not_a_box():
    b = bubble(0, radius=config.STANDARD.radius)
    r = radius_at(b, 0)
    corner = r * 80 // 100  # inside the bounding box, outside the circle
    assert find_hit([b], Tap(0, 5000 + corner, 5000 + corner), set()) is None
    side = r * 70 // 100  # 70% on both axes is 99% of the radius: just inside
    assert find_hit([b], Tap(0, 5000 + side, 5000 + side), set()) is b


def test_cannot_hit_before_spawn():
    b = bubble(0, spawn_ms=500)
    assert find_hit([b], Tap(499, 5000, 5000), set()) is None
    assert find_hit([b], Tap(500, 5000, 5000), set()) is b


def test_grace_window_after_expiry():
    b = bubble(0, spawn_ms=0, lifetime_ms=1000)
    last_ok = 1000 + config.HIT_GRACE_MS - 1
    assert find_hit([b], Tap(last_ok, 5000, 5000), set()) is b
    assert find_hit([b], Tap(last_ok + 1, 5000, 5000), set()) is None


def test_shrunken_bubble_stays_hittable_within_the_minimum_radius():
    b = bubble(0, lifetime_ms=1000, radius=config.STANDARD.radius)
    late = 990  # radius has shrunk to almost nothing
    assert radius_at(b, late) < config.HIT_MIN_RADIUS
    inside = Tap(late, 5000, 5000 + config.HIT_MIN_RADIUS)
    outside = Tap(late, 5000, 5000 + config.HIT_MIN_RADIUS + 1)
    assert find_hit([b], inside, set()) is b
    assert find_hit([b], outside, set()) is None


def test_a_popped_bubble_cannot_be_hit_again():
    b = bubble(0)
    assert find_hit([b], Tap(100, 5000, 5000), {0}) is None


def test_overlapping_bubbles_the_newest_wins():
    older = bubble(0, spawn_ms=0)
    newer = bubble(1, spawn_ms=100)
    assert find_hit([older, newer], Tap(200, 5000, 5000), set()) is newer
    # With the newer one gone, the next tap reaches the older one.
    assert find_hit([older, newer], Tap(210, 5000, 5000), {1}) is older


def test_a_bubble_not_yet_spawned_does_not_shadow_a_live_one():
    live = bubble(0, spawn_ms=0)
    later = bubble(1, spawn_ms=900)
    assert find_hit([live, later], Tap(200, 5000, 5000), set()) is live


# --- Replay ------------------------------------------------------------------


def test_replay_of_nothing_scores_zero():
    assert replay(generate_schedule(1), []) == (0, ())


def test_one_tap_pops_at_most_one_bubble():
    a = bubble(0, spawn_ms=0)
    b = bubble(1, spawn_ms=50)
    score, popped = replay([a, b], [Tap(100, 5000, 5000)])
    assert (score, popped) == (1, (1,))


def test_double_tapping_does_not_double_score():
    schedule = [bubble(0)]
    score, popped = replay(schedule, [Tap(100, 5000, 5000), Tap(150, 5000, 5000)])
    assert (score, popped) == (1, (0,))


def test_pearls_are_worth_three():
    score, _ = replay([bubble(0, kind=1)], [Tap(10, 5000, 5000)])
    assert score == 3


def test_misses_cost_nothing():
    schedule = [bubble(0)]
    taps = [Tap(10, 100, 100), Tap(20, 9900, 9900), Tap(100, 5000, 5000)]
    assert replay(schedule, taps)[0] == 1


def test_score_never_exceeds_the_maximum():
    schedule = generate_schedule(7)
    taps = [Tap(b.spawn_ms + 5, b.x, b.y) for b in schedule] * 3
    taps.sort(key=lambda t: t.t)
    assert replay(schedule, taps)[0] <= max_score(schedule)
