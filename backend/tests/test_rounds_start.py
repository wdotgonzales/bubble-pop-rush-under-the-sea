from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from app.core.config import settings
from app.core.security import create_session_token
from app.game import config
from app.game.spawn import generate_schedule
from app.models.player import Player
from app.models.round import Round
from app.services.rounds import START_LIMIT


def _player(db, fb_id="fb-1"):
    player = Player(fb_player_id=fb_id)
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _auth(player):
    token = create_session_token(str(player.id), settings.SECRET_KEY)
    return {"Authorization": f"Bearer {token}"}


def _start(client, player, field=None):
    body = None if field is None else {"field_width": field[0], "field_height": field[1]}
    return client.post("/rounds/start", headers=_auth(player), json=body)


def _round_count(db, player=None):
    query = select(func.count()).select_from(Round)
    if player is not None:
        query = query.where(Round.player_id == player.id)
    return db.scalar(query)


def test_start_requires_a_session(client, db):
    response = client.post("/rounds/start")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert _round_count(db) == 0


def test_start_rejects_a_bad_token(client, db):
    response = client.post("/rounds/start", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert _round_count(db) == 0


def test_start_creates_a_round(client, db):
    player = _player(db)
    response = _start(client, player)

    assert response.status_code == 201
    body = response.json()
    assert body["config_version"] == config.CONFIG_VERSION
    assert body["duration_ms"] == config.ROUND_DURATION_MS
    assert 0 <= body["seed"] < 2**32

    row = db.scalar(select(Round))
    assert str(row.id) == body["round_id"]
    assert row.player_id == player.id
    assert row.seed == body["seed"]
    assert row.status == "started"
    assert row.submitted_at is None


# --- The field shape -----------------------------------------------------------


def test_a_round_without_a_field_uses_the_default_one(client, db):
    player = _player(db)
    body = _start(client, player).json()

    assert (body["field_width"], body["field_height"]) == (config.FIELD_WIDTH, config.FIELD_HEIGHT)
    row = db.scalar(select(Round))
    assert (row.field_width, row.field_height) == (config.FIELD_WIDTH, config.FIELD_HEIGHT)


def test_the_game_can_ask_for_a_field_that_fits_its_window(client, db):
    player = _player(db)
    response = _start(client, player, (29_000, 14_000))

    assert response.status_code == 201
    body = response.json()
    assert (body["field_width"], body["field_height"]) == (29_000, 14_000)
    row = db.scalar(select(Round))
    assert (row.field_width, row.field_height) == (29_000, 14_000)


def test_the_seed_and_field_give_the_schedule_the_game_draws(client, db):
    player = _player(db)
    body = _start(client, player, (29_000, 14_000)).json()

    schedule = generate_schedule(body["seed"], config.Field(body["field_width"], body["field_height"]))
    assert max(b.x for b in schedule) > config.FIELD_WIDTH  # it really is the wide field


@pytest.mark.parametrize(
    "field",
    [
        (config.FIELD_MIN - 1, 20_000),
        (20_000, config.FIELD_MAX + 1),
        (0, 0),
        (-1, -1),
        (8_000, 36_000),  # a sliver
    ],
)
def test_a_field_outside_the_bounds_is_refused_and_no_round_is_made(client, db, field):
    player = _player(db)
    response = _start(client, player, field)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_field"
    assert _round_count(db) == 0


@pytest.mark.parametrize(
    "body",
    [
        {"field_width": 10_000},
        {"field_height": 20_000},
        {"field_width": "10000", "field_height": "20000"},
        {"field_width": 10_000.5, "field_height": 20_000},
        {"field_width": None, "field_height": None},
        {"field_width": True, "field_height": 20_000},
    ],
)
def test_a_malformed_field_is_a_validation_error(client, db, body):
    player = _player(db)
    response = client.post("/rounds/start", headers=_auth(player), json=body)

    assert response.status_code == 422
    assert _round_count(db) == 0


def test_a_refused_field_does_not_use_up_the_rate_limit(client, db):
    player = _player(db)
    for _ in range(START_LIMIT + 3):
        assert _start(client, player, (1, 1)).status_code == 422
    assert _start(client, player).status_code == 201


def test_round_expires_in_about_a_day(client, db):
    player = _player(db)
    body = _start(client, player).json()

    started = datetime.fromisoformat(body["started_at"])
    expires = datetime.fromisoformat(body["expires_at"])
    assert started.tzinfo is not None
    assert timedelta(hours=23, minutes=59) < expires - started < timedelta(hours=24, minutes=1)
    assert abs(datetime.now(timezone.utc) - started) < timedelta(minutes=1)


def test_every_round_gets_its_own_seed(client, db):
    player = _player(db)
    seeds = {_start(client, player).json()["seed"] for _ in range(5)}
    assert len(seeds) > 1
    assert len({r.id for r in db.scalars(select(Round))}) == 5


def test_the_returned_seed_yields_the_bubble_schedule(client, db):
    player = _player(db)
    seed = _start(client, player).json()["seed"]

    schedule = generate_schedule(seed)
    assert 45 <= len(schedule) <= 85


def test_rate_limit_blocks_the_next_round_after_the_limit(client, db):
    player = _player(db)
    for _ in range(START_LIMIT):
        assert _start(client, player).status_code == 201

    blocked = _start(client, player)
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
    assert _round_count(db, player) == START_LIMIT


def test_rate_limit_is_per_player(client, db):
    busy = _player(db, "fb-busy")
    other = _player(db, "fb-other")
    for _ in range(START_LIMIT):
        _start(client, busy)
    assert _start(client, busy).status_code == 429

    assert _start(client, other).status_code == 201


def test_rate_limit_clears_after_the_window(client, db):
    player = _player(db)
    for _ in range(START_LIMIT):
        _start(client, player)
    assert _start(client, player).status_code == 429

    db.execute(update(Round).values(started_at=func.now() - timedelta(minutes=2)))
    db.commit()

    assert _start(client, player).status_code == 201
