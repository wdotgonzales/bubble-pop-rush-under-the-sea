import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ROUND_STATUSES = ("started", "accepted", "rejected", "expired")


class Round(Base):
    """One play-through: issued by the server, later submitted as a tap log.

    The server decides the seed, so it can regenerate the exact bubble
    schedule when the taps come back. The score is never taken from the client.
    """

    __tablename__ = "rounds"
    __table_args__ = (
        CheckConstraint(
            "status IN (" + ", ".join(f"'{s}'" for s in ROUND_STATUSES) + ")",
            name="rounds_status_check",
        ),
        CheckConstraint("score >= 0", name="rounds_score_check"),
        # The generator uses a 32-bit PRNG, so the seed must fit in 32 bits.
        CheckConstraint("seed >= 0 AND seed < 4294967296", name="rounds_seed_check"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("players.id", ondelete="CASCADE")
    )
    seed: Mapped[int] = mapped_column(BigInteger)
    # Which version of the shared game config built this round's schedule.
    config_version: Mapped[int] = mapped_column(Integer)
    # The shape of the play field this round uses, in game units. The game asks for one that
    # fits its window; the server checks it against the bounds in app.game.config. The
    # schedule and the tap check both need it, so it is kept with the round. The defaults
    # are the original portrait field, which is what rounds from before this existed used.
    field_width: Mapped[int] = mapped_column(Integer, server_default=text("10000"))
    field_height: Mapped[int] = mapped_column(Integer, server_default=text("21640"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'started'"))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Filled in by the submit route (PR 3).
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_duration_ms: Mapped[int | None] = mapped_column(Integer)
    tap_count: Mapped[int | None] = mapped_column(Integer)
    tap_log: Mapped[list | None] = mapped_column(JSONB)
    score: Mapped[int | None] = mapped_column(Integer)
    reject_reason: Mapped[str | None] = mapped_column(Text)


# Rate-limit and "recent rounds" lookups; cleanup job (PR 5) scans by status.
Index("rounds_player_started_idx", Round.player_id, Round.started_at.desc())
Index("rounds_status_expires_idx", Round.status, Round.expires_at)
