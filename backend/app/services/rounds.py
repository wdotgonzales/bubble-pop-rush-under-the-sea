import secrets
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.game import config
from app.game.validator import validate_round
from app.models.player import Player
from app.models.round import Round
from app.services.players import get_rank

# A round can be submitted for 24 hours. That is deliberately long: the game
# queues finished rounds while offline and sends them when the player is back.
ROUND_LIFETIME = timedelta(hours=24)

# Starting rounds is cheap, but a flood is never real play.
START_LIMIT = 10
START_WINDOW = timedelta(seconds=60)

# A round cannot honestly be submitted before it has lasted its full duration.
# Only the server's clock counts. The slack covers rounding, not cheating: the
# client's own timer starts after it receives the start response, so honest
# submissions always arrive after the full 30 seconds.
MIN_ELAPSED_TOLERANCE = timedelta(seconds=1)

# Rejection reasons that come from the submit flow itself. Reasons for a bad tap
# log come from app.game.validator.
TOO_EARLY = "submitted_too_early"
CONFIG_MISMATCH = "config_version_mismatch"


class TooManyRounds(Exception):
    """The player started too many rounds in the last minute."""


class RoundNotFound(Exception):
    """No such round, or it belongs to someone else (deliberately indistinguishable)."""


class RoundExpired(Exception):
    """The round's submission window has closed."""


class RoundRejected(Exception):
    """The round was refused. It is final: a round is submitted once."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class SubmitResult:
    round: Round
    score: int
    best_score: int
    is_new_best: bool
    rank: int | None


def start_round(
    db: Session, player: Player, field: config.Field = config.DEFAULT_FIELD
) -> Round:
    """Issue a new round: a fresh random seed, the play field it uses, and an expiry.

    `field` must already have been checked with config.is_valid_field.

    The player's row is locked first, so two simultaneous requests cannot both
    slip under the rate limit.
    """
    db.execute(select(Player.id).where(Player.id == player.id).with_for_update())

    recent = db.scalar(
        select(func.count())
        .select_from(Round)
        .where(
            Round.player_id == player.id,
            Round.started_at > func.now() - START_WINDOW,
        )
    )
    if (recent or 0) >= START_LIMIT:
        db.rollback()  # release the row lock
        raise TooManyRounds

    new_round = Round(
        player_id=player.id,
        seed=secrets.randbits(32),
        config_version=config.CONFIG_VERSION,
        field_width=field.width,
        field_height=field.height,
        expires_at=func.now() + ROUND_LIFETIME,
    )
    db.add(new_round)
    db.commit()
    db.refresh(new_round)
    return new_round


def submit_round(
    db: Session,
    player: Player,
    round_id: UUID,
    raw_taps: list,
    client_duration_ms: int,
) -> SubmitResult:
    """Score a finished round from its tap log and update the player's best.

    The round row is locked for the whole call, so two simultaneous submits of
    the same round run one after the other: the second sees the finished round
    and gets the stored result instead of scoring it again.
    """
    row = db.scalar(select(Round).where(Round.id == round_id).with_for_update())
    if row is None or row.player_id != player.id:
        raise RoundNotFound

    # Already decided. Retrying (say, the response was lost on a bad connection)
    # is safe: an accepted round returns its stored result, a rejected one stays rejected.
    if row.status == "accepted":
        return _result(db, player, row)
    if row.status == "rejected":
        raise RoundRejected(row.reject_reason or "rejected")
    if row.status == "expired":
        raise RoundExpired

    now = db.scalar(select(func.now()))
    if row.expires_at <= now:
        row.status = "expired"
        db.commit()
        raise RoundExpired

    def reject(reason: str):
        row.status = "rejected"
        row.reject_reason = reason
        row.submitted_at = now
        row.client_duration_ms = client_duration_ms
        row.tap_count = len(raw_taps)
        db.commit()
        raise RoundRejected(reason)

    if row.config_version != config.CONFIG_VERSION:
        # The schedule was built from rules this server no longer has.
        reject(CONFIG_MISMATCH)

    minimum = timedelta(milliseconds=config.ROUND_DURATION_MS) - MIN_ELAPSED_TOLERANCE
    if now - row.started_at < minimum:
        reject(TOO_EARLY)

    verdict = validate_round(row.seed, raw_taps, config.Field(row.field_width, row.field_height))
    if not verdict.valid:
        reject(verdict.reason or "rejected")

    row.status = "accepted"
    row.submitted_at = now
    row.client_duration_ms = client_duration_ms
    row.tap_count = verdict.tap_count
    row.tap_log = raw_taps
    row.score = verdict.score

    # Raise the best only if strictly higher: on a tie the earlier score keeps
    # its place, matching the leaderboard's tie-break. The condition is checked
    # inside the UPDATE, so concurrent rounds from one player cannot lose a better score.
    db.execute(
        update(Player)
        .where(Player.id == player.id, Player.best_score < verdict.score)
        .values(best_score=verdict.score, best_score_at=now, best_round_id=row.id)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return _result(db, player, row)


def _result(db: Session, player: Player, row: Round) -> SubmitResult:
    db.refresh(player)
    return SubmitResult(
        round=row,
        score=row.score or 0,
        best_score=player.best_score,
        is_new_best=player.best_round_id == row.id,
        rank=get_rank(db, player),
    )
