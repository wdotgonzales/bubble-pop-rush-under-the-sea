from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.nickname import PLACEHOLDER_NAME
from app.models.player import Player


def upsert_player(
    db: Session,
    fb_player_id: str,
    display_name: str | None,
    avatar_url: str | None,
    default_name: str | None = None,
) -> Player:
    """Create the player on first sign-in, or refresh them on later ones.

    One atomic INSERT ... ON CONFLICT, so two simultaneous first logins for the
    same Facebook player cannot create two rows or raise a unique violation.
    Name and avatar are only overwritten when the client sent a usable value.
    When no name was sent, default_name (the generated nickname) is used for a new
    player, and replaces the old "Diver" placeholder on an existing one. A name the
    player actually has is never replaced.
    best_score and friends are never touched here; only submit raises them.
    """
    values: dict = {"fb_player_id": fb_player_id}
    update: dict = {"last_seen_at": func.now()}
    if display_name:
        values["display_name"] = display_name
        update["display_name"] = display_name
    elif default_name:
        values["display_name"] = default_name
        update["display_name"] = case(
            (Player.display_name == PLACEHOLDER_NAME, default_name),
            else_=Player.display_name,
        )
    if avatar_url:
        values["avatar_url"] = avatar_url
        update["avatar_url"] = avatar_url

    stmt = (
        insert(Player)
        .values(**values)
        .on_conflict_do_update(index_elements=["fb_player_id"], set_=update)
        .returning(Player)
    )
    player = db.execute(stmt, execution_options={"populate_existing": True}).scalar_one()
    db.commit()
    return player


def get_rank(db: Session, player: Player) -> int | None:
    """1-based leaderboard rank, or None if the player has no score yet.

    Same ordering as the leaderboard: higher score first, and on a tie the
    player who reached that score earlier ranks higher (then lower id, for a
    dead heat).
    """
    if player.best_score <= 0 or player.best_score_at is None:
        return None
    ahead = db.scalar(
        select(func.count())
        .select_from(Player)
        .where(
            or_(
                Player.best_score > player.best_score,
                and_(
                    Player.best_score == player.best_score,
                    Player.best_score_at < player.best_score_at,
                ),
                # Same score at the very same instant: fall back to id, exactly
                # as the leaderboard view does, so the two always agree.
                and_(
                    Player.best_score == player.best_score,
                    Player.best_score_at == player.best_score_at,
                    Player.id < player.id,
                ),
            )
        )
    )
    return (ahead or 0) + 1
