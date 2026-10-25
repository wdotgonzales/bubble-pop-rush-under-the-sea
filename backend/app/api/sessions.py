from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.game_session import GameSession
from app.models.leaderboard import Leaderboard
from app.schemas.session import (
    SessionCreate,
    SessionStartResponse,
    SessionEndRequest,
    SessionResponse,
)

router = APIRouter(prefix="/sessions", tags=["Game Sessions"])

@router.post("/start", response_model=SessionStartResponse, status_code=status.HTTP_201_CREATED)
def start_game_session(payload: SessionCreate, db: Session = Depends(get_db)):
    # Verify user exists
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create new active game session
    new_session = GameSession(
        user_id=user.user_id,
        started_at=datetime.now(timezone.utc),
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return SessionStartResponse(
        session_id=new_session.session_id,
        started_at=new_session.started_at,
        status="active"
    )

@router.post("/end", response_model=SessionResponse)
def end_game_session(payload: SessionEndRequest, db: Session = Depends(get_db)):
    # Fetch active session
    session_obj = db.query(GameSession).filter(GameSession.session_id == payload.session_id).first()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Game session not found")

    if session_obj.ended_at is not None:
        raise HTTPException(status_code=400, detail="Game session has already been ended")

    # Update session metrics
    session_obj.score = payload.score
    session_obj.bubbles_popped = payload.bubbles_popped
    session_obj.duration_seconds = payload.duration_seconds
    session_obj.ended_at = datetime.now(timezone.utc)

    # Calculate rewards (e.g., 1 coin per 10 points)
    coins_earned = max(1, payload.score // 10)

    # Check and update Leaderboard high score
    leaderboard_entry = (
        db.query(Leaderboard)
        .filter(Leaderboard.user_id == session_obj.user_id, Leaderboard.rank_period == "all_time")
        .first()
    )
    is_new_high_score = False

    if not leaderboard_entry:
        leaderboard_entry = Leaderboard(
            user_id=session_obj.user_id,
            score=payload.score,
            rank_period="all_time"
        )
        db.add(leaderboard_entry)
        is_new_high_score = True
    elif payload.score > leaderboard_entry.score:
        leaderboard_entry.score = payload.score
        is_new_high_score = True

    db.commit()
    db.refresh(session_obj)

    return SessionResponse(
        session_id=session_obj.session_id,
        user_id=session_obj.user_id,
        score=session_obj.score,
        bubbles_popped=session_obj.bubbles_popped,
        duration_seconds=session_obj.duration_seconds,
        coins_earned=coins_earned,
        is_new_high_score=is_new_high_score,
    )