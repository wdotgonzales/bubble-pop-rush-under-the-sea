from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.models.user import User

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Local backend is running!"}

def test_session_lifecycle(db_session: Session):
    # 1. Create a test user matching the actual User model schema
    test_user = User(
        username="SessionTestPlayer"
    )
    db_session.add(test_user)
    db_session.commit()
    db_session.refresh(test_user)

    # 2. Start a game session
    start_response = client.post("/sessions/start", json={"user_id": test_user.user_id})
    assert start_response.status_code == 201
    start_data = start_response.json()
    assert "session_id" in start_data
    assert start_data["status"] == "active"
    
    session_id = start_data["session_id"]

    # 3. End the game session with a score
    end_payload = {
        "session_id": session_id,
        "score": 150,
        "bubbles_popped": 25,
        "duration_seconds": 30
    }
    end_response = client.post("/sessions/end", json=end_payload)
    assert end_response.status_code == 200
    end_data = end_response.json()
    
    assert end_data["session_id"] == session_id
    assert end_data["score"] == 150
    assert end_data["bubbles_popped"] == 25
    assert end_data["coins_earned"] == 15  # 150 // 10
    assert end_data["is_new_high_score"] is True