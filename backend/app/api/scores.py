from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.scores import ScoreEntry, ScoresResponse
from app.services.scores import DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE, get_scores

router = APIRouter(tags=["scores"])


@router.get("/scores", response_model=ScoresResponse)
def scores(
    page: int = Query(1, ge=1, le=MAX_PAGE, description="1-based page number."),
    page_size: int = Query(
        DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Attempts per page."
    ),
    sort: Literal["best", "recent"] = Query(
        "best", description="`best`: highest score first. `recent`: newest attempt first."
    ),
    db: Session = Depends(get_db),
):
    """Every scored attempt from every player, one page at a time. Public: no sign-in is needed.

    Unlike `/leaderboard`, which lists each player once with their best, this lists every attempt,
    so one player can appear many times. Only rounds the server accepted and scored are included.
    A page past the end is empty, not an error. Any `Authorization` header is ignored.
    """
    result = get_scores(db, page, page_size, sort)
    return ScoresResponse(
        entries=[
            ScoreEntry(
                display_name=e.display_name,
                avatar_url=e.avatar_url,
                score=e.score,
                played_at=e.played_at,
            )
            for e in result.entries
        ],
        page=result.page,
        page_size=result.page_size,
        sort=result.sort,
        total=result.total,
        total_pages=result.total_pages,
    )
