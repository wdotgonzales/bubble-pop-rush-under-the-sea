import pytest
from sqlalchemy.exc import IntegrityError

from app.models.player import Player


def test_player_defaults(db):
    player = Player(fb_player_id="fb-1")
    db.add(player)
    db.commit()
    db.refresh(player)

    assert player.id is not None
    assert player.display_name == "Diver"
    assert player.best_score == 0
    assert player.best_score_at is None
    assert player.best_round_id is None
    assert player.created_at is not None
    assert player.last_seen_at is not None


def test_fb_player_id_is_unique(db):
    db.add(Player(fb_player_id="fb-1"))
    db.commit()

    db.add(Player(fb_player_id="fb-1"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_best_score_cannot_be_negative(db):
    db.add(Player(fb_player_id="fb-2", best_score=-1))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()