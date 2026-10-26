import pytest

from app.game import config


@pytest.mark.parametrize(
    "width,height",
    [
        (config.FIELD_WIDTH, config.FIELD_HEIGHT),  # the default
        (config.FIELD_MIN, config.FIELD_MIN),
        (config.FIELD_MAX, config.FIELD_MAX),
        (29_000, 14_000),  # desktop
        (16_732, 20_261),  # tablet
        (config.FIELD_MIN, config.FIELD_MIN * config.FIELD_MAX_RATIO),  # the thinnest allowed
        (config.FIELD_MIN * config.FIELD_MAX_RATIO, config.FIELD_MIN),
    ],
)
def test_sensible_fields_are_valid(width, height):
    assert config.is_valid_field(width, height)


@pytest.mark.parametrize(
    "width,height",
    [
        (config.FIELD_MIN - 1, 10_000),
        (10_000, config.FIELD_MIN - 1),
        (config.FIELD_MAX + 1, 20_000),
        (20_000, config.FIELD_MAX + 1),
        (0, 0),
        (-10_000, 10_000),
        # Too thin: more than three times as long as it is wide.
        (config.FIELD_MIN, config.FIELD_MIN * config.FIELD_MAX_RATIO + 1),
        (config.FIELD_MIN * config.FIELD_MAX_RATIO + 1, config.FIELD_MIN),
        (config.FIELD_MIN, config.FIELD_MAX),
    ],
)
def test_absurd_fields_are_refused(width, height):
    assert not config.is_valid_field(width, height)


@pytest.mark.parametrize("bad", [10_000.0, "10000", None, True, [10_000]])
def test_only_plain_integers_count(bad):
    assert not config.is_valid_field(bad, 20_000)
    assert not config.is_valid_field(20_000, bad)


def test_the_default_field_is_valid_and_matches_the_old_constants():
    assert config.is_valid_field(config.DEFAULT_FIELD.width, config.DEFAULT_FIELD.height)
    assert (config.DEFAULT_FIELD.width, config.DEFAULT_FIELD.height) == (10_000, 21_640)


def test_a_bubble_always_fits_in_the_smallest_field():
    biggest = max(kind.radius for kind in config.KINDS)
    assert config.FIELD_MIN > 2 * biggest
