import re

from app.core.nickname import ADJECTIVES, NOUNS, generate_nickname
from app.core.profile import MAX_DISPLAY_NAME_LENGTH, clean_display_name

SECRET = "test-secret"


def test_same_player_and_key_always_give_the_same_name():
    assert generate_nickname("fb-1", SECRET) == generate_nickname("fb-1", SECRET)


def test_name_has_the_expected_shape():
    for i in range(200):
        name = generate_nickname(f"fb-{i}", SECRET)
        assert re.fullmatch(r"[A-Z][a-z]+[A-Z][a-z]+[1-9]\d{2}", name), name


def test_name_survives_the_display_name_cleaner_unchanged():
    # It is stored as a display name, so it must already be a clean one.
    for i in range(200):
        name = generate_nickname(f"fb-{i}", SECRET)
        assert clean_display_name(name) == name


def test_longest_possible_name_fits_the_display_limit():
    longest = max(map(len, ADJECTIVES)) + max(map(len, NOUNS)) + 3
    assert longest <= MAX_DISPLAY_NAME_LENGTH


def test_word_lists_are_32_distinct_entries():
    assert len(set(ADJECTIVES)) == len(ADJECTIVES) == 32
    assert len(set(NOUNS)) == len(NOUNS) == 32


def test_different_players_and_different_keys_give_different_names():
    assert generate_nickname("fb-1", SECRET) != generate_nickname("fb-2", SECRET)
    assert generate_nickname("fb-1", SECRET) != generate_nickname("fb-1", "other-secret")


def test_names_spread_across_both_word_lists():
    names = [generate_nickname(f"fb-{i}", SECRET) for i in range(500)]
    assert len({n for n in names}) > 480  # very few collisions
    assert {a for a in ADJECTIVES if any(n.startswith(a) for n in names)} >= set(ADJECTIVES[:20])


def test_the_facebook_id_is_not_in_the_name():
    name = generate_nickname("1234567890", SECRET)
    assert "1234567890" not in name
