from dataclasses import dataclass
from math import ceil

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.player import Player
from app.services.players import get_rank

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
# Far beyond any real board, and it keeps the offset a number the database accepts.
MAX_PAGE = 10_000


@dataclass(frozen=True)
class Entry:
    rank: int
    display_name: str
    avatar_url: str | None
    score: int
    is_me: bool


@dataclass(frozen=True)
class Standing:
    rank: int | None
    best_score: int


@dataclass(frozen=True)
class Leaderboard:
    entries: list[Entry]
    page: int
    page_size: int
    total: int
    total_pages: int
    # None for a request that was not signed in: there is nobody to report on.
    me: Standing | None


def get_leaderboard(
    db: Session,
    player: Player | None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Leaderboard:
    """One page of the leaderboard (best first), plus where `player` stands, if there is one.

    The order is the one `get_rank` uses: higher score first, then whoever reached
    it earlier, then the lower id. That order never ties, so a player's rank is
    simply their position in it: the page's offset plus their place on the page.
    """
    offset = (page - 1) * page_size
    rows = db.execute(
        select(Player.id, Player.display_name, Player.avatar_url, Player.best_score)
        .where(Player.best_score > 0)
        .order_by(Player.best_score.desc(), Player.best_score_at.asc(), Player.id.asc())
        .limit(page_size)
        .offset(offset)
    ).all()
    total = db.scalar(select(func.count()).select_from(Player).where(Player.best_score > 0)) or 0
    entries = [
        Entry(
            rank=rank,
            display_name=row.display_name,
            avatar_url=row.avatar_url,
            score=row.best_score,
            is_me=player is not None and str(row.id) == str(player.id),
        )
        for rank, row in enumerate(rows, start=offset + 1)
    ]
    return Leaderboard(
        entries=entries,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=ceil(total / page_size),
        me=None if player is None else Standing(rank=get_rank(db, player), best_score=player.best_score),
    )
