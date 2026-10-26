import json
from pathlib import Path

import pytest

from app.game import config
from app.game.spawn import (
    Mulberry32,
    generate_schedule,
    max_score,
    phase_at,
    radius_at,
)

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "spawn-vectors.json").read_text(
        encoding="utf-8"
    )
)


# --- Shared vectors: the contract with the game client -----------------------


def test_config_matches_the_shared_vectors():
    # If this fails you changed the config: bump CONFIG_VERSION, run
    # scripts/generate_spawn_vectors.py, and update shared/spawn.js to match.
    assert config.config_as_dict() == VECTORS["config"]


@pytest.mark.parametrize("case", VECTORS["prng"], ids=lambda c: f"seed={c['seed']}")
def test_prng_matches_the_shared_vectors(case):
    rng = Mulberry32(case["seed"])
    assert [rng.next_u32() for _ in case["first"]] == case["first"]


@pytest.mark.parametrize(
    "case", VECTORS["schedules"], ids=lambda c: f"seed={c['seed']}-field={c['field'][0]}x{c['field'][1]}"
)
def test_schedule_matches_the_shared_vectors(case):
    got = [b.as_vector() for b in generate_schedule(case["seed"], config.Field(*case["field"]))]
    assert got == case["bubbles"]


@pytest.mark.parametrize(
    "case", VECTORS["radius"], ids=lambda c: f"seed={c['seed']}-bubble={c['index']}"
)
def test_radius_matches_the_shared_vectors(case):
    bubble = generate_schedule(case["seed"])[case["index"]]
    for time_ms, expected in case["at"]:
        assert radius_at(bubble, time_ms) == expected


# --- PRNG --------------------------------------------------------------------


def test_prng_is_deterministic_and_seed_dependent():
    a, b, c = Mulberry32(7), Mulberry32(7), Mulberry32(8)
    first = [a.next_u32() for _ in range(5)]
    assert first == [b.next_u32() for _ in range(5)]
    assert first != [c.next_u32() for _ in range(5)]


@pytest.mark.parametrize("seed", [-1, 2**32, 1.5, "7", None, True])
def test_prng_rejects_bad_seeds(seed):
    with pytest.raises(ValueError):
        Mulberry32(seed)


def test_below_stays_in_range_and_rejects_nonpositive():
    rng = Mulberry32(99)
    assert all(0 <= rng.below(7) < 7 for _ in range(500))
    with pytest.raises(ValueError):
        rng.below(0)


# --- Schedule properties (hold for any seed) ---------------------------------

SEEDS = range(300)


def test_same_seed_gives_the_same_schedule():
    assert generate_schedule(31337) == generate_schedule(31337)


def test_different_seeds_give_different_schedules():
    assert generate_schedule(1) != generate_schedule(2)


def test_schedule_is_ordered_and_inside_the_round():
    for seed in SEEDS:
        schedule = generate_schedule(seed)
        assert schedule[0].spawn_ms == config.INITIAL_DELAY_MS
        times = [b.spawn_ms for b in schedule]
        assert times == sorted(set(times)), seed  # strictly increasing
        assert times[-1] < config.ROUND_DURATION_MS
        assert [b.index for b in schedule] == list(range(len(schedule)))


def test_every_bubble_is_fully_inside_the_field():
    for seed in SEEDS:
        for b in generate_schedule(seed):
            assert b.radius <= b.x <= config.FIELD_WIDTH - b.radius, (seed, b)
            assert b.radius <= b.y <= config.FIELD_HEIGHT - b.radius, (seed, b)


FIELDS = [
    config.DEFAULT_FIELD,
    config.Field(29_000, 14_000),  # a desktop window
    config.Field(16_732, 20_261),  # a tablet held upright
    config.Field(64_000, 30_000),  # the largest
    config.Field(config.FIELD_MIN, config.FIELD_MIN),  # the smallest
]


@pytest.mark.parametrize("field", FIELDS, ids=lambda f: f"{f.width}x{f.height}")
def test_every_bubble_is_fully_inside_any_field(field):
    for seed in SEEDS:
        for b in generate_schedule(seed, field):
            assert b.radius <= b.x <= field.width - b.radius, (seed, b)
            assert b.radius <= b.y <= field.height - b.radius, (seed, b)


@pytest.mark.parametrize("field", FIELDS, ids=lambda f: f"{f.width}x{f.height}")
def test_bubbles_use_the_whole_of_any_field(field):
    bubbles = [b for seed in SEEDS for b in generate_schedule(seed, field)]
    xs = [b.x for b in bubbles]
    ys = [b.y for b in bubbles]
    assert min(xs) < field.width // 4 and max(xs) > field.width - field.width // 4
    assert min(ys) < field.height // 4 and max(ys) > field.height - field.height // 4


def test_the_field_changes_where_bubbles_are_but_never_when_or_what():
    # Timing, kinds and lifetimes come from the same draws whatever the field is, so every
    # field offers the same bubbles at the same moments and the same top score.
    base = generate_schedule(123, config.DEFAULT_FIELD)
    for field in FIELDS[1:]:
        other = generate_schedule(123, field)
        assert [(b.spawn_ms, b.kind, b.points, b.radius, b.lifetime_ms) for b in other] == [
            (b.spawn_ms, b.kind, b.points, b.radius, b.lifetime_ms) for b in base
        ]
        assert max_score(other) == max_score(base)
        assert [(b.x, b.y) for b in other] != [(b.x, b.y) for b in base]


def test_without_a_field_the_default_one_is_used():
    assert generate_schedule(9) == generate_schedule(9, config.DEFAULT_FIELD)


def test_the_field_is_portrait_and_bubbles_use_all_of_it():
    assert config.FIELD_HEIGHT > config.FIELD_WIDTH
    ys = [b.y for seed in SEEDS for b in generate_schedule(seed)]
    # Roughly uniform over the height: both the top and the bottom get bubbles.
    assert min(ys) < config.FIELD_HEIGHT // 10
    assert max(ys) > config.FIELD_HEIGHT - config.FIELD_HEIGHT // 10
    third = config.FIELD_HEIGHT // 3
    shares = [sum(1 for y in ys if lo <= y < lo + third) / len(ys) for lo in (0, third, 2 * third)]
    assert all(0.25 < share < 0.42 for share in shares), shares


def test_lifetimes_follow_the_phase_and_kind():
    by_id = {k.id: k for k in config.KINDS}
    for seed in range(50):
        for b in generate_schedule(seed):
            kind = by_id[b.kind]
            expected = phase_at(b.spawn_ms).lifetime_ms * kind.lifetime_pct // 100
            assert b.lifetime_ms == expected
            assert b.points == kind.points
            assert b.radius == kind.radius


def test_pearls_live_shorter_than_standard_bubbles_in_the_same_phase():
    assert config.PEARL.lifetime_pct < config.STANDARD.lifetime_pct
    assert config.PEARL.points > config.STANDARD.points


def test_difficulty_ramps_up():
    counts = [0, 0, 0]
    for seed in range(100):
        for b in generate_schedule(seed):
            for i, phase in enumerate(config.PHASES):
                if phase.start_ms <= b.spawn_ms < phase.end_ms:
                    counts[i] += 1
    warm_up, build, rush = counts
    assert warm_up < build < rush


def test_round_size_and_pearl_rate_are_reasonable():
    total = pearls = 0
    for seed in SEEDS:
        schedule = generate_schedule(seed)
        assert 45 <= len(schedule) <= 85, seed
        total += len(schedule)
        pearls += sum(1 for b in schedule if b.kind == config.PEARL.id)
    assert 0.10 <= pearls / total <= 0.20


def test_max_score_counts_every_bubble():
    schedule = generate_schedule(42)
    assert max_score(schedule) == sum(3 if b.kind == 1 else 1 for b in schedule)
    assert len(schedule) < max_score(schedule) < 3 * len(schedule)


def test_everything_is_a_plain_integer():
    # Floats are how two languages drift apart. None may appear.
    for b in generate_schedule(2024):
        for value in (b.index, b.spawn_ms, b.x, b.y, b.kind, b.points, b.radius, b.lifetime_ms):
            assert type(value) is int


# --- Shrinking ---------------------------------------------------------------


def test_radius_shrinks_linearly_to_zero():
    b = generate_schedule(5)[0]
    assert radius_at(b, b.spawn_ms - 1) == 0
    assert radius_at(b, b.spawn_ms) == b.radius
    assert radius_at(b, b.spawn_ms + b.lifetime_ms // 2) == b.radius // 2
    assert radius_at(b, b.spawn_ms + b.lifetime_ms - 1) >= 0
    assert radius_at(b, b.spawn_ms + b.lifetime_ms) == 0
    assert radius_at(b, b.spawn_ms + b.lifetime_ms + 5000) == 0


def test_radius_never_grows():
    b = generate_schedule(5)[3]
    radii = [radius_at(b, b.spawn_ms + t) for t in range(0, b.lifetime_ms + 1, 7)]
    assert radii == sorted(radii, reverse=True)
