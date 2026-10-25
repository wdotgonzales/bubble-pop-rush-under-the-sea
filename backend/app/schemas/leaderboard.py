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
    # Up to 10, best first. Empty when nobody has scored yet.
    entries: list[LeaderboardEntry]
    # The requesting player's own standing, even when they are outside the top 10.
    me: LeaderboardMe
