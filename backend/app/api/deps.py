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


def get_current_player(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Player:
    if credentials is None:
        raise _unauthorized()
    try:
        subject = verify_session_token(credentials.credentials, settings.SECRET_KEY)
        player_id = uuid.UUID(subject)
    except (TokenError, ValueError):
        raise _unauthorized() from None
    player = db.get(Player, player_id)
    if player is None:
        raise _unauthorized()
    return player
