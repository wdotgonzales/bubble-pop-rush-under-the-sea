from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    display_name: str
    avatar_url: str | None
    score: int
    # True on the requesting player's own row, so the game can highlight it.
    is_me: bool


class LeaderboardMe(BaseModel):
    # None until the player has a verified score above zero.
    rank: int | None
    best_score: int


class LeaderboardResponse(BaseModel):
    # One page, best first: up to `page_size` rows (10 unless asked otherwise). Empty when nobody
    # has scored yet, or when the page is past the end.
    entries: list[LeaderboardEntry]
    # Which page this is (1-based) and how big pages are.
    page: int
    page_size: int
    # Players with a score, over all pages, and how many pages that makes (0 when nobody has scored).
    total: int
    total_pages: int
    # The requesting player's own standing, whatever page was asked for. Null when the request was
    # not signed in (the leaderboard itself is public).
    me: LeaderboardMe | None
