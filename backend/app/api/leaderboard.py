from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_optional_player
from app.core.database import get_db
from app.models.player import Player
from app.schemas.leaderboard import LeaderboardEntry, LeaderboardMe, LeaderboardResponse
from app.services.leaderboard import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE,
    MAX_PAGE_SIZE,
    get_leaderboard,
)

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    page: int = Query(1, ge=1, le=MAX_PAGE, description="1-based page number."),
    page_size: int = Query(
        DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Players per page."
    ),
    player: Player | None = Depends(get_optional_player),
    db: Session = Depends(get_db),
):
    """One page of the leaderboard, best first. Public: no sign-in is needed to read it.

    With no parameters this is the top 10, as before. A page past the end is empty, not an
    error. A signed-in caller also gets their own rank (`me`) and their row flagged (`is_me`),
    whatever page was asked for; an anonymous caller gets `me: null`.
    """
    board = get_leaderboard(db, player, page, page_size)
    return LeaderboardResponse(
        entries=[
            LeaderboardEntry(
                rank=e.rank,
                display_name=e.display_name,
                avatar_url=e.avatar_url,
                score=e.score,
                is_me=e.is_me,
            )
            for e in board.entries
        ],
        page=board.page,
        page_size=board.page_size,
        total=board.total,
        total_pages=board.total_pages,
        me=None if board.me is None else LeaderboardMe(rank=board.me.rank, best_score=board.me.best_score),
    )
