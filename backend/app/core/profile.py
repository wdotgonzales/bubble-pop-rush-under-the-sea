"""Cleaning for client-supplied cosmetic fields.

Display name and avatar URL come from the game client, so they are untrusted.
They never affect identity or score; they only get shown on the leaderboard.
"""

import unicodedata
from urllib.parse import urlsplit

MAX_DISPLAY_NAME_LENGTH = 24
MAX_AVATAR_URL_LENGTH = 2048


def clean_display_name(raw: object) -> str | None:
    """Return a safe, short name, or None if nothing usable is left.

    Control and formatting characters (including zero-width and bidi overrides)
    are dropped, any run of whitespace becomes one space, and the result is cut
    to MAX_DISPLAY_NAME_LENGTH characters.
    """
    if not isinstance(raw, str):
        return None
    kept = []
    for ch in raw:
        if ch.isspace():
            kept.append(" ")
        elif _is_invisible(ch):
            continue
        else:
            kept.append(ch)
    name = " ".join("".join(kept).split())[:MAX_DISPLAY_NAME_LENGTH].strip()
    return name or None


def clean_avatar_url(raw: object) -> str | None:
    """Return the URL if it is a plain https URL, else None."""
    if not isinstance(raw, str):
        return None
    url = raw.strip()
    if not url or len(url) > MAX_AVATAR_URL_LENGTH:
        return None
    if any(ch.isspace() or _is_invisible(ch) for ch in url):
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme != "https" or not parts.netloc or not parts.hostname:
        return None
    return url


def _is_invisible(ch: str) -> bool:
    # C* = control, format (zero-width, bidi), surrogate, private use, unassigned.
    return unicodedata.category(ch).startswith("C")
