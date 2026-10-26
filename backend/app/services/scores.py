from dataclasses import dataclass
from datetime import datetime
from math import ceil
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.player import Player
from app.models.round import Round
from app.services.leaderboard import DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE

__all__ = ["DEFAULT_PAGE_SIZE", "MAX_PAGE", "MAX_PAGE_SIZE", "Sort", "get_scores"]

Sort = Literal["best", "recent"]


@dataclass(frozen=True)
class ScoreRow:
    display_name: str
    avatar_url: str | None
    score: int
    played_at: datetime


@dataclass(frozen=True)
class Scores:
    entries: list[ScoreRow]
    page: int
    page_size: int
    sort: Sort
    total: int
    total_pages: int


def get_scores(
    db: Session,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    sort: Sort = "best",
) -> Scores:
    """One page of every scored attempt, from every player.

    Only accepted rounds are listed: those are the ones the server replayed and scored itself.
    Rejected, expired and unfinished rounds never produced a score, so they are not here. Each
    attempt is its own row, so a player who played five times appears five times.

    Both orders never tie, so a page boundary can not repeat or drop a row: "best" is the higher
    score first, then whoever got it earlier, then the lower id; "recent" is the newest first,
    then the higher id.
    """
    if sort == "best":
        order = (Round.score.desc(), Round.submitted_at.asc(), Round.id.asc())
    else:
        order = (Round.submitted_at.desc(), Round.id.desc())
    accepted = Round.status == "accepted"
    rows = db.execute(
        select(Player.display_name, Player.avatar_url, Round.score, Round.submitted_at)
        .join(Player, Player.id == Round.player_id)
        .where(accepted)
        .order_by(*order)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    total = db.scalar(select(func.count()).select_from(Round).where(accepted)) or 0
    return Scores(
        entries=[
            ScoreRow(
                display_name=row.display_name,
                avatar_url=row.avatar_url,
                score=row.score,
                played_at=row.submitted_at,
            )
            for row in rows
        ],
        page=page,
        page_size=page_size,
        sort=sort,
        total=total,
        total_pages=ceil(total / page_size),
    )
