import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_player
from app.core.config import settings
from app.core.database import get_db
from app.core.profile import clean_avatar_url, clean_display_name
from app.core.security import (
    TOKEN_TTL_SECONDS,
    SignatureError,
    create_session_token,
    verify_signed_player_info,
)
from app.models.player import Player
from app.schemas.player import MeResponse, PlayerOut, SessionRequest, SessionResponse
from app.services.players import get_rank, upsert_player

logger = logging.getLogger(__name__)

router = APIRouter(tags=["identity"])


@router.post("/session", response_model=SessionResponse)
def create_session(body: SessionRequest, db: Session = Depends(get_db)):
    """Exchange Facebook's signed player info for a one-hour session token."""
    if not settings.FB_APP_SECRET:
        # Fail closed: without the secret nobody can be verified.
        raise HTTPException(status_code=503, detail="sign-in is not configured")
    try:
        fb_player_id = verify_signed_player_info(
            body.signed_player_info, settings.FB_APP_SECRET
        )
    except SignatureError as exc:
        # The reason goes to the log only; the client always gets the same answer.
        logger.warning("rejected signed player info: %s", exc)
        raise HTTPException(status_code=401, detail="invalid signed player info") from None

    player = upsert_player(
        db,
        fb_player_id,
        clean_display_name(body.display_name),
        clean_avatar_url(body.avatar_url),
    )
    token = create_session_token(str(player.id), settings.SECRET_KEY)
    return SessionResponse(
        token=token,
        expires_in=TOKEN_TTL_SECONDS,
        player=PlayerOut.model_validate(player),
    )


@router.get("/me", response_model=MeResponse)
def me(player: Player = Depends(get_current_player), db: Session = Depends(get_db)):
    return MeResponse(player=PlayerOut.model_validate(player), rank=get_rank(db, player))
