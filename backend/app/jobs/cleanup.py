"""Housekeeping for the rounds table. Safe to run as often as you like.

    python -m app.jobs.cleanup

What it does, in order:
  1. Marks rounds that were never submitted and are past their expiry as `expired`.
     (The submit route does this lazily for a single round; this catches the rest.)
  2. Deletes rounds that expired more than EXPIRED_RETENTION ago. They never
     produced a score, so nothing refers to them.
  3. Drops the stored tap log of rounds submitted more than TAP_LOG_RETENTION ago,
     except each player's best round, which is kept as the evidence behind their
     leaderboard position. The score, status and timings stay.

Accepted and rejected rounds are never deleted: they are the audit trail.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import delete, func, null, select, update
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.player import Player
from app.models.round import Round

EXPIRED_RETENTION = timedelta(days=7)
TAP_LOG_RETENTION = timedelta(days=30)

logger = logging.getLogger("app.jobs.cleanup")


@dataclass(frozen=True)
class CleanupResult:
    expired: int
    deleted: int
    tap_logs_dropped: int


def run_cleanup(db: Session) -> CleanupResult:
    no_sync = {"synchronize_session": False}

    expired = db.execute(
        update(Round)
        .where(Round.status == "started", Round.expires_at < func.now())
        .values(status="expired")
        .execution_options(**no_sync)
    ).rowcount

    deleted = db.execute(
        delete(Round)
        .where(Round.status == "expired", Round.expires_at < func.now() - EXPIRED_RETENTION)
        .execution_options(**no_sync)
    ).rowcount

    best_rounds = select(Player.best_round_id).where(Player.best_round_id.is_not(None))
    dropped = db.execute(
        update(Round)
        .where(
            Round.tap_log.is_not(None),
            Round.submitted_at < func.now() - TAP_LOG_RETENTION,
            Round.id.not_in(best_rounds),
        )
        .values(tap_log=null())
        .execution_options(**no_sync)
    ).rowcount

    db.commit()
    return CleanupResult(expired=expired, deleted=deleted, tap_logs_dropped=dropped)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with SessionLocal() as db:
        result = run_cleanup(db)
    logger.info(
        "cleanup done: %d rounds expired, %d old rounds deleted, %d tap logs dropped",
        result.expired,
        result.deleted,
        result.tap_logs_dropped,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
