from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_player
from app.core.database import get_db
from app.game import config
from app.models.player import Player
from app.schemas.round import RoundStartResponse
from app.services.rounds import START_WINDOW, TooManyRounds, start_round

router = APIRouter(tags=["rounds"])


@router.post("/rounds/start", response_model=RoundStartResponse, status_code=201)
def start(player: Player = Depends(get_current_player), db: Session = Depends(get_db)):
    """Begin a round. The seed returned here defines every bubble in it."""
    try:
        new_round = start_round(db, player)
    except TooManyRounds:
        raise HTTPException(
            status_code=429,
            detail="too many rounds started, slow down",
            headers={"Retry-After": str(int(START_WINDOW.total_seconds()))},
        ) from None
    return RoundStartResponse(
        round_id=new_round.id,
        seed=new_round.seed,
        config_version=new_round.config_version,
        duration_ms=config.ROUND_DURATION_MS,
        started_at=new_round.started_at,
        expires_at=new_round.expires_at,
    )
