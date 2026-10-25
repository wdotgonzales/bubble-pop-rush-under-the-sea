import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Player(Base):
    """One row per Facebook player: identity, cosmetic profile, best verified score."""

    __tablename__ = "players"
    __table_args__ = (
        CheckConstraint("best_score >= 0", name="players_best_score_check"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    # From the verified Facebook signature. Never returned by the API.
    fb_player_id: Mapped[str] = mapped_column(Text, unique=True)
    # Cosmetic and client-supplied, so treated as untrusted.
    display_name: Mapped[str] = mapped_column(Text, server_default=text("'Diver'"))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    # Only ever raised by the submit route (PR 3).
    best_score: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    best_score_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The accepted round that produced best_score. players and rounds point at
    # each other, so this FK is created after both tables exist (use_alter).
    best_round_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey(
            "rounds.id",
            ondelete="SET NULL",
            use_alter=True,
            name="players_best_round_fk",
        ),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# Serves the rank query and, from PR 4, the top-10 view.
Index("players_leaderboard_idx", Player.best_score.desc(), Player.best_score_at)