from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.player import Player
from app.services.players import get_rank


@dataclass(frozen=True)
class Entry:
    rank: int
    display_name: str
    avatar_url: str | None
    score: int
    is_me: bool


@dataclass(frozen=True)
class Leaderboard:
    entries: list[Entry]
    my_rank: int | None
    my_best_score: int


def get_leaderboard(db: Session, player: Player) -> Leaderboard:
    """The top 10 from the `leaderboard_top` view, plus where `player` stands."""
    rows = db.execute(
        text(
            "SELECT rank, id, display_name, avatar_url, score "
            "FROM leaderboard_top ORDER BY rank"
        )
    ).all()
    entries = [
        Entry(
            rank=row.rank,
            display_name=row.display_name,
            avatar_url=row.avatar_url,
            score=row.score,
            is_me=str(row.id) == str(player.id),
        )
        for row in rows
    ]
    return Leaderboard(
        entries=entries,
        my_rank=get_rank(db, player),
        my_best_score=player.best_score,
    )
