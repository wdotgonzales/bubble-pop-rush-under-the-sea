from sqlalchemy.orm import Session
from app.models.user import User
from app.models.game_session import GameSession

def test_create_user_and_session(db_session: Session):
    # Create test user
    user = User(username="BubbleTester", high_score=100, total_bubbles_popped=50)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.user_id is not None
    assert user.username == "BubbleTester"

    # Create associated game session
    session = GameSession(user_id=user.user_id, score=100, bubbles_popped=50, duration_seconds=30)
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    assert session.session_id is not None
    assert session.user_id == user.user_id
    assert len(user.sessions) == 1
