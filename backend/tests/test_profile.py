from app.core.profile import (
    MAX_DISPLAY_NAME_LENGTH,
    clean_avatar_url,
    clean_display_name,
)


def test_name_is_kept_when_clean():
    assert clean_display_name("Ana Reyes") == "Ana Reyes"


def test_name_is_trimmed_and_whitespace_collapsed():
    assert clean_display_name("  Ana \t\n  Reyes  ") == "Ana Reyes"


def test_name_is_truncated():
    name = clean_display_name("x" * 100)
    assert name == "x" * MAX_DISPLAY_NAME_LENGTH


def test_name_drops_control_and_invisible_characters():
    # NUL, zero-width space, right-to-left override
    assert clean_display_name("A\x00n​a‮B") == "AnaB"


def test_name_keeps_emoji_and_non_latin():
    assert clean_display_name("Diver 🐠") == "Diver 🐠"
    assert clean_display_name("ダイバー") == "ダイバー"


def test_name_empty_or_wrong_type_is_none():
    assert clean_display_name(None) is None
    assert clean_display_name("") is None
    assert clean_display_name("   \n ") is None
    assert clean_display_name("​​") is None
    assert clean_display_name(123) is None


def test_avatar_https_is_kept():
    url = "https://platform-lookaside.fbsbx.com/platform/profilepic/?asid=1"
    assert clean_avatar_url(url) == url


def test_avatar_non_https_is_rejected():
    assert clean_avatar_url("http://example.com/a.png") is None
    assert clean_avatar_url("javascript:alert(1)") is None
    assert clean_avatar_url("data:image/png;base64,AAAA") is None
    assert clean_avatar_url("//example.com/a.png") is None
    assert clean_avatar_url("ftp://example.com/a.png") is None


def test_avatar_without_host_is_rejected():
    assert clean_avatar_url("https://") is None
    assert clean_avatar_url("https:///path") is None


def test_avatar_with_whitespace_or_control_chars_is_rejected():
    assert clean_avatar_url("https://example.com/a b.png") is None
    assert clean_avatar_url("https://example.com/a\n.png") is None
    assert clean_avatar_url("https://example.com/a​.png") is None


def test_avatar_too_long_is_rejected():
    assert clean_avatar_url("https://example.com/" + "a" * 2100) is None


def test_avatar_empty_or_wrong_type_is_none():
    assert clean_avatar_url(None) is None
    assert clean_avatar_url("") is None
    assert clean_avatar_url(42) is None
