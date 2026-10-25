import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.game import config
from app.models.player import Player
from app.models.round import Round

# A round can be submitted for 24 hours. That is deliberately long: the game
# queues finished rounds while offline and sends them when the player is back.
ROUND_LIFETIME = timedelta(hours=24)

# Starting rounds is cheap, but a flood is never real play.
START_LIMIT = 10
START_WINDOW = timedelta(seconds=60)


class TooManyRounds(Exception):
    """The player started too many rounds in the last minute."""


def start_round(db: Session, player: Player) -> Round:
    """Issue a new round: a fresh random seed and an expiry.

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
        expires_at=func.now() + ROUND_LIFETIME,
    )
    db.add(new_round)
    db.commit()
    db.refresh(new_round)
    return new_round
