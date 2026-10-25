from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_player
from app.core.database import get_db
from app.models.player import Player
from app.schemas.leaderboard import LeaderboardEntry, LeaderboardMe, LeaderboardResponse
from app.services.leaderboard import get_leaderboard

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(player: Player = Depends(get_current_player), db: Session = Depends(get_db)):
    """Top 10 players, plus the caller's own rank (even outside the top 10)."""
    board = get_leaderboard(db, player)
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
        me=LeaderboardMe(rank=board.my_rank, best_score=board.my_best_score),
    )
