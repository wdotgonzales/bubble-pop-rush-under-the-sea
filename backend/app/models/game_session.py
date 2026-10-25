import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey, text
from sqlalchemy.orm import relationship
from app.core.database import Base

class GameSession(Base):
    __tablename__ = "game_sessions"

    session_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, default=0, nullable=False)
    bubbles_popped = Column(Integer, default=0, nullable=False)
    accuracy_rate = Column(Numeric(5, 2), nullable=True)
    duration_seconds = Column(Integer, default=30, nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    ended_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sessions")
