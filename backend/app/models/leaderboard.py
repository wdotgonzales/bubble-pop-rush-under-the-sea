from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Leaderboard(Base):
    __tablename__ = "leaderboards"

    leaderboard_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=False)
    rank_period = Column(String(20), default="all_time")
    updated_at = Column(DateTime(timezone=True), server_default=text("NOW()"), onupdate=text("NOW()"))

    user = relationship("User", back_populates="leaderboards")

    __table_args__ = (
        Index("idx_leaderboard_score", "rank_period", score.desc()),
    )
