import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_player
from app.core.database import get_db
from app.game import config
from app.models.player import Player
from app.schemas.round import (
    RoundStartRequest,
    RoundStartResponse,
    SubmitRequest,
    SubmitResponse,
)
from app.services.rounds import (
    CONFIG_MISMATCH,
    START_WINDOW,
    RoundExpired,
    RoundNotFound,
    RoundRejected,
    TooManyRounds,
    start_round,
    submit_round,
)

router = APIRouter(tags=["rounds"])


@router.post("/rounds/start", response_model=RoundStartResponse, status_code=201)
def start(
    body: RoundStartRequest | None = None,
    player: Player = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Begin a round. The seed and the field returned here define every bubble in it.

    The game may ask for a field shape that fits its window. Without a body the round uses
    the default portrait field. A shape outside the allowed bounds is refused with 422.
    """
    field = config.DEFAULT_FIELD
    if body is not None:
        if not config.is_valid_field(body.field_width, body.field_height):
            raise HTTPException(status_code=422, detail={"code": "invalid_field"})
        field = config.Field(body.field_width, body.field_height)
    try:
        new_round = start_round(db, player, field)
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
        field_width=new_round.field_width,
        field_height=new_round.field_height,
        duration_ms=config.ROUND_DURATION_MS,
        started_at=new_round.started_at,
        expires_at=new_round.expires_at,
    )


@router.post("/rounds/{round_id}/submit", response_model=SubmitResponse)
def submit(
    round_id: uuid.UUID,
    body: SubmitRequest,
    player: Player = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Submit the tap log for a round. The score is computed here, never sent.

    Safe to retry: an accepted round returns the same result again.
    A 4xx means the round is finished for good (the client should drop it);
    only network errors, 429 and 5xx are worth retrying.
    """
    try:
        result = submit_round(db, player, round_id, body.taps, body.client_duration_ms)
    except RoundNotFound:
        raise HTTPException(status_code=404, detail="round not found") from None
    except RoundExpired:
        raise HTTPException(status_code=410, detail="round expired") from None
    except RoundRejected as exc:
        # 409: the game build is out of date. 422: the round itself was refused.
        status = 409 if exc.reason == CONFIG_MISMATCH else 422
        raise HTTPException(status_code=status, detail={"code": exc.reason}) from None
    return SubmitResponse(
        round_id=result.round.id,
        score=result.score,
        best_score=result.best_score,
        is_new_best=result.is_new_best,
        rank=result.rank,
    )
