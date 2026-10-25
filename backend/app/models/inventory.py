from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, text
from sqlalchemy.orm import relationship
from app.core.database import Base

class UserInventory(Base):
    __tablename__ = "user_inventories"

    inventory_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    item_id = Column(String(50), nullable=False)
    item_type = Column(String(30), nullable=False)
    is_equipped = Column(Boolean, default=False)
    acquired_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    user = relationship("User", back_populates="inventories")
