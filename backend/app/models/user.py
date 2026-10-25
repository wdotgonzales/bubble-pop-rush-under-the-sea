import uuid
from sqlalchemy import Column, String, Integer, DateTime, text
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), nullable=True)
    high_score = Column(Integer, default=0, nullable=False)
    total_bubbles_popped = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    # Relationships
    sessions = relationship("GameSession", back_populates="user", cascade="all, delete")
    leaderboards = relationship("Leaderboard", back_populates="user", cascade="all, delete")
    inventories = relationship("UserInventory", back_populates="user", cascade="all, delete")
