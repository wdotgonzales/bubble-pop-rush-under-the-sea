"""Generated nicknames for players the game cannot name.

Facebook Instant Games SDK 8.0 no longer hands the game a player's name or photo,
and games may not store them on their own servers. So the leaderboard needs a
name from somewhere else. Each player gets a friendly, stable nickname such as
"BrightTurtle482", derived from their Facebook player id.

The name is derived with HMAC under the server's secret key, so it carries no
personal data and cannot be traced back to the Facebook id. It is computed once,
when the player is created, and then stored; rotating the key later never
renames anyone.

Names are not unique (about a million combinations). The leaderboard identifies
rows by rank, not by name, so two players sharing a nickname is harmless.
"""

import hashlib
import hmac

# Shown for rows created before nicknames existed. Replaced on the next sign-in.
PLACEHOLDER_NAME = "Diver"

# 32 entries each so a digest byte maps onto a list without bias.
ADJECTIVES = (
    "Bright", "Brave", "Calm", "Clever", "Cosmic", "Coral", "Cozy", "Dapper",
    "Dreamy", "Gentle", "Glossy", "Golden", "Happy", "Jolly", "Lucky", "Merry",
    "Mighty", "Nimble", "Plucky", "Quick", "Rapid", "Shiny", "Silver", "Sleepy",
    "Snappy", "Speedy", "Sunny", "Swift", "Tiny", "Wavy", "Witty", "Zesty",
)
NOUNS = (
    "Turtle", "Dolphin", "Otter", "Octopus", "Seahorse", "Starfish", "Clam", "Crab",
    "Whale", "Narwhal", "Manatee", "Pearl", "Jelly", "Squid", "Shrimp", "Lobster",
    "Marlin", "Manta", "Orca", "Puffin", "Seal", "Penguin", "Walrus", "Urchin",
    "Angler", "Guppy", "Minnow", "Barnacle", "Kelp", "Reef", "Shell", "Tuna",
)
assert len(ADJECTIVES) == 32 and len(NOUNS) == 32


def generate_nickname(fb_player_id: str, secret: str) -> str:
    """Stable nickname for one player: the same inputs always give the same name."""
    digest = hmac.new(
        secret.encode("utf-8"),
        f"nickname:{fb_player_id}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    adjective = ADJECTIVES[digest[0] % len(ADJECTIVES)]
    noun = NOUNS[digest[1] % len(NOUNS)]
    number = 100 + int.from_bytes(digest[2:4], "big") % 900  # always three digits
    return f"{adjective}{noun}{number}"
