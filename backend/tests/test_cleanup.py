import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update

from app.jobs import cleanup
from app.jobs.cleanup import EXPIRED_RETENTION, TAP_LOG_RETENTION, run_cleanup
from app.models.player import Player
from app.models.round import Round

TAPS = [{"t": 100, "x": 5000, "y": 5000}]
DAY = timedelta(days=1)


def _player(db, fb_id="fb-1"):
    player = Player(fb_player_id=fb_id)
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _round(db, player, *, status="started", expires_in=timedelta(hours=1), submitted_ago=None, taps=None):
    values = dict(
        player_id=player.id,
        seed=1,
        config_version=1,
        status=status,
        expires_at=func.now() + expires_in,
        submitted_at=None if submitted_ago is None else func.now() - submitted_ago,
        score=5 if status == "accepted" else None,
    )
    if taps is not None:  # leave unset otherwise, as the app does (SQL NULL, not JSON null)
        values["tap_log"] = taps
    row = Round(**values)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


def _exists(db, round_id):
    db.expire_all()
    return db.get(Round, round_id) is not None


def _status(db, round_id):
    db.expire_all()
    return db.get(Round, round_id).status


def _tap_log(db, round_id):
    db.expire_all()
    return db.get(Round, round_id).tap_log


def test_unsubmitted_rounds_past_expiry_are_marked_expired(db):
    player = _player(db)
    stale = _round(db, player, expires_in=-timedelta(minutes=5))
    live = _round(db, player, expires_in=timedelta(hours=3))

    result = run_cleanup(db)

    assert result.expired == 1
    assert _status(db, stale) == "expired"
    assert _status(db, live) == "started"


def test_decided_rounds_keep_their_status_even_if_old(db):
    player = _player(db)
    accepted = _round(db, player, status="accepted", expires_in=-10 * DAY, submitted_ago=11 * DAY)
    rejected = _round(db, player, status="rejected", expires_in=-10 * DAY, submitted_ago=11 * DAY)

    run_cleanup(db)

    assert _status(db, accepted) == "accepted"
    assert _status(db, rejected) == "rejected"


def test_long_expired_rounds_are_deleted_recent_ones_are_not(db):
    player = _player(db)
    old = _round(db, player, status="expired", expires_in=-(EXPIRED_RETENTION + DAY))
    recent = _round(db, player, status="expired", expires_in=-(EXPIRED_RETENTION - DAY))

    result = run_cleanup(db)

    assert result.deleted == 1
    assert not _exists(db, old)
    assert _exists(db, recent)


def test_a_stale_unsubmitted_round_is_expired_then_deleted_in_one_pass(db):
    player = _player(db)
    ancient = _round(db, player, expires_in=-(EXPIRED_RETENTION + DAY))

    result = run_cleanup(db)

    assert result.expired == 1 and result.deleted == 1
    assert not _exists(db, ancient)


def test_accepted_and_rejected_rounds_are_never_deleted(db):
    player = _player(db)
    ids = [
        _round(db, player, status="accepted", expires_in=-365 * DAY, submitted_ago=365 * DAY),
        _round(db, player, status="rejected", expires_in=-365 * DAY, submitted_ago=365 * DAY),
    ]

    run_cleanup(db)

    assert all(_exists(db, i) for i in ids)


def test_old_tap_logs_are_dropped_but_the_best_round_keeps_its_log(db):
    player = _player(db)
    old_ago = TAP_LOG_RETENTION + DAY
    other = _round(db, player, status="accepted", expires_in=-old_ago, submitted_ago=old_ago, taps=TAPS)
    best = _round(db, player, status="accepted", expires_in=-old_ago, submitted_ago=old_ago, taps=TAPS)
    player.best_round_id = best
    db.commit()

    result = run_cleanup(db)

    assert result.tap_logs_dropped == 1
    assert _tap_log(db, other) is None
    assert _tap_log(db, best) == TAPS
    assert _status(db, other) == "accepted"  # the round itself stays


def test_recent_tap_logs_are_kept(db):
    player = _player(db)
    recent = _round(
        db, player, status="accepted", expires_in=timedelta(hours=1), submitted_ago=timedelta(days=2), taps=TAPS
    )

    result = run_cleanup(db)

    assert result.tap_logs_dropped == 0
    assert _tap_log(db, recent) == TAPS


def test_a_players_best_round_pointer_survives_cleanup(db):
    player = _player(db)
    best = _round(db, player, status="accepted", expires_in=-90 * DAY, submitted_ago=90 * DAY, taps=TAPS)
    player.best_round_id = best
    db.commit()

    run_cleanup(db)

    db.expire_all()
    assert db.get(Player, player.id).best_round_id == best


def test_running_twice_changes_nothing_the_second_time(db):
    player = _player(db)
    _round(db, player, expires_in=-(EXPIRED_RETENTION + DAY))
    _round(db, player, expires_in=-timedelta(minutes=5))

    first = run_cleanup(db)
    second = run_cleanup(db)

    assert first.expired == 2 and first.deleted == 1
    assert (second.expired, second.deleted, second.tap_logs_dropped) == (0, 0, 0)


def test_cleanup_with_nothing_to_do(db):
    result = run_cleanup(db)
    assert (result.expired, result.deleted, result.tap_logs_dropped) == (0, 0, 0)


def test_the_command_line_entry_point_runs(db):
    player = _player(db)
    stale = _round(db, player, expires_in=-timedelta(minutes=5))

    assert cleanup.main() == 0

    assert _status(db, stale) == "expired"
