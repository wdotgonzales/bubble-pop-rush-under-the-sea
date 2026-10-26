from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.player import Player
from app.models.round import Round


def _player(db, fb_id="fb-1"):
    player = Player(fb_player_id=fb_id)
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _round(player, **overrides):
    values = dict(
        player_id=player.id,
        seed=123456,
        config_version=1,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    values.update(overrides)
    return Round(**values)


def test_a_round_gets_the_default_field_unless_told_otherwise(db):
    player = _player(db)
    db.add(_round(player))
    db.commit()

    row = db.scalar(select(Round))
    assert (row.field_width, row.field_height) == (10_000, 21_640)


def test_a_round_keeps_the_field_it_was_given(db):
    player = _player(db)
    db.add(_round(player, field_width=29_000, field_height=14_000))
    db.commit()

    row = db.scalar(select(Round))
    assert (row.field_width, row.field_height) == (29_000, 14_000)


def test_round_defaults(db):
    player = _player(db)
    row = _round(player)
    db.add(row)
    db.commit()
    db.refresh(row)

    assert row.id is not None
    assert row.status == "started"
    assert row.started_at is not None
    assert row.submitted_at is None
    assert row.tap_log is None
    assert row.score is None
    assert row.reject_reason is None


def test_seed_accepts_the_full_32_bit_range(db):
    player = _player(db)
    db.add_all([_round(player, seed=0), _round(player, seed=2**32 - 1)])
    db.commit()


@pytest.mark.parametrize("seed", [-1, 2**32])
def test_seed_outside_32_bits_is_rejected(db, seed):
    player = _player(db)
    db.add(_round(player, seed=seed))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_unknown_status_is_rejected(db):
    player = _player(db)
    db.add(_round(player, status="cheating"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_negative_score_is_rejected(db):
    player = _player(db)
    db.add(_round(player, score=-5))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_round_needs_an_existing_player(db):
    from uuid import uuid4

    db.add(Round(player_id=uuid4(), seed=1, config_version=1,
                 expires_at=datetime.now(timezone.utc)))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_tap_log_round_trips_as_json(db):
    player = _player(db)
    taps = [{"t": 120, "x": 5000, "y": 4000}, {"t": 480, "x": 100, "y": 9000}]
    row = _round(player, tap_log=taps, tap_count=2)
    db.add(row)
    db.commit()
    db.expire_all()

    saved = db.scalar(select(Round))
    assert saved.tap_log == taps


def test_deleting_a_player_deletes_their_rounds(db):
    player = _player(db)
    db.add(_round(player))
    db.commit()

    db.delete(player)
    db.commit()

    assert db.scalar(select(Round)) is None


def test_best_round_must_exist(db):
    from uuid import uuid4

    player = _player(db)
    player.best_round_id = uuid4()
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_the_best_round_clears_the_pointer(db):
    player = _player(db)
    row = _round(player)
    db.add(row)
    db.commit()
    player.best_round_id = row.id
    db.commit()

    db.delete(row)
    db.commit()
    db.refresh(player)

    assert player.best_round_id is None
