import uuid

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import TokenError, verify_session_token
from app.models.player import Player

# auto_error=False so a missing header is a 401 (not FastAPI's default 403)
# and every auth failure looks the same to the client.
_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="invalid or expired session",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _player_for(credentials: HTTPAuthorizationCredentials, db: Session) -> Player:
    try:
        subject = verify_session_token(credentials.credentials, settings.SECRET_KEY)
        player_id = uuid.UUID(subject)
    except (TokenError, ValueError):
        raise _unauthorized() from None
    player = db.get(Player, player_id)
    if player is None:
        raise _unauthorized()
    return player


def get_current_player(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Player:
    if credentials is None:
        raise _unauthorized()
    return _player_for(credentials, db)


def get_optional_player(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Player | None:
    """The signed-in player, or None for a request that sent no credentials at all.

    Only a missing header is allowed through. A header that is present but wrong or expired
    is still a 401, exactly as on every other route: the game relies on that 401 to know it
    must sign in again, so it must not turn into a silent anonymous request.
    """
    if credentials is None:
        return None
    return _player_for(credentials, db)
