from datetime import datetime
from pydantic import BaseModel

class SessionCreate(BaseModel):
    user_id: str

class SessionStartResponse(BaseModel):
    session_id: str
    started_at: datetime
    status: str

    class Config:
        from_attributes = True

class SessionEndRequest(BaseModel):
    session_id: str
    score: int
    bubbles_popped: int
    duration_seconds: int = 30

class SessionResponse(BaseModel):
    session_id: str
    user_id: str
    score: int
    bubbles_popped: int
    duration_seconds: int
    coins_earned: int
    is_new_high_score: bool

    class Config:
        from_attributes = True