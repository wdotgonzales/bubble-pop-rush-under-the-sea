import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select, update

from app.core.config import settings
from app.core.security import create_session_token
from app.game import config
from app.game.spawn import generate_schedule
from app.game.validator import Verdict, validate_round
from app.models.player import Player
from app.models.round import Round
from app.services import rounds as rounds_service


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
    response = client.post("/rounds/start", headers=_auth(player), json=body)
    assert response.status_code == 201
    return response.json()


def _age(db, round_id, seconds=31):
    """Pretend the round started `seconds` ago, so it can be submitted."""
    db.execute(
        update(Round)
        .where(Round.id == uuid.UUID(round_id))
        .values(started_at=func.now() - timedelta(seconds=seconds))
    )
    db.commit()


def _row(db, round_id):
    db.expire_all()
    return db.get(Round, uuid.UUID(round_id))


def _fresh(db, player):
    db.expire_all()
    return db.get(Player, player.id)


def honest_taps(seed, field=config.DEFAULT_FIELD):
    """Tap the centre of every bubble shortly after it appears."""
    return [
        {"t": b.spawn_ms + 100, "x": b.x, "y": b.y}
        for b in generate_schedule(seed, field)
        if b.spawn_ms + 100 <= config.ROUND_DURATION_MS
    ]


def _submit(client, player, round_id, taps, duration=30_000):
    return client.post(
        f"/rounds/{round_id}/submit",
        headers=_auth(player),
        json={"taps": taps, "client_duration_ms": duration},
    )


def _play(client, db, player, taps=None, field=None):
    """Start a round, wait it out, and submit. Returns (round, response)."""
    started = _start(client, player, field)
    _age(db, started["round_id"])
    if taps is None:
        taps = honest_taps(started["seed"], config.Field(started["field_width"], started["field_height"]))
    return started, _submit(client, player, started["round_id"], taps)


# --- Access ------------------------------------------------------------------


def test_submit_requires_a_session(client):
    response = client.post(
        f"/rounds/{uuid.uuid4()}/submit", json={"taps": [], "client_duration_ms": 30000}
    )
    assert response.status_code == 401


def test_unknown_round_is_404(client, db):
    player = _player(db)
    assert _submit(client, player, uuid.uuid4(), []).status_code == 404


def test_another_players_round_is_404_and_stays_untouched(client, db):
    owner, thief = _player(db, "fb-owner"), _player(db, "fb-thief")
    started = _start(client, owner)
    _age(db, started["round_id"])

    response = _submit(client, thief, started["round_id"], honest_taps(started["seed"]))

    assert response.status_code == 404
    row = _row(db, started["round_id"])
    assert row.status == "started" and row.score is None
    assert _fresh(db, thief).best_score == 0


def test_bad_path_or_body_is_a_validation_error(client, db):
    player = _player(db)
    started = _start(client, player)
    headers = _auth(player)

    assert client.post("/rounds/not-a-uuid/submit", headers=headers, json={}).status_code == 422
    url = f"/rounds/{started['round_id']}/submit"
    assert client.post(url, headers=headers, json={"taps": []}).status_code == 422
    assert client.post(url, headers=headers, json={"taps": "x", "client_duration_ms": 1}).status_code == 422
    assert client.post(url, headers=headers, json={"taps": [], "client_duration_ms": -1}).status_code == 422
    assert _row(db, started["round_id"]).status == "started"  # nothing was consumed


# --- Accepting a round -------------------------------------------------------


def test_honest_round_is_scored_by_the_server(client, db):
    player = _player(db)
    started, response = _play(client, db, player)

    expected = validate_round(started["seed"], honest_taps(started["seed"])).score
    assert expected > 0
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "accepted"
    assert body["score"] == expected
    assert body["best_score"] == expected
    assert body["is_new_best"] is True
    assert body["rank"] == 1

    row = _row(db, started["round_id"])
    assert row.status == "accepted"
    assert row.score == expected
    assert row.tap_count == len(honest_taps(started["seed"]))
    assert row.tap_log == honest_taps(started["seed"])
    assert row.client_duration_ms == 30_000
    assert row.submitted_at is not None

    me = _fresh(db, player)
    assert me.best_score == expected
    assert me.best_round_id == row.id
    assert me.best_score_at is not None


def test_the_client_cannot_send_a_score(client, db):
    player = _player(db)
    started = _start(client, player)
    _age(db, started["round_id"])
    response = client.post(
        f"/rounds/{started['round_id']}/submit",
        headers=_auth(player),
        json={"taps": [], "client_duration_ms": 30000, "score": 9999},
    )
    assert response.status_code == 200
    assert response.json()["score"] == 0
    assert _fresh(db, player).best_score == 0


def test_a_player_with_no_hits_has_no_rank(client, db):
    player = _player(db)
    _, response = _play(client, db, player, taps=[])
    assert response.status_code == 200
    body = response.json()
    assert body["score"] == 0 and body["best_score"] == 0
    assert body["is_new_best"] is False
    assert body["rank"] is None


def test_rank_reflects_other_players(client, db):
    from datetime import datetime, timezone

    db.add(
        Player(
            fb_player_id="fb-leader",
            best_score=10_000,
            best_score_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
    )
    db.commit()
    player = _player(db)
    _, response = _play(client, db, player)
    assert response.json()["rank"] == 2


# --- Best score rules --------------------------------------------------------


def test_a_lower_score_never_replaces_the_best(client, db):
    player = _player(db)
    first, good = _play(client, db, player)
    second, weak = _play(client, db, player, taps=[])

    assert weak.status_code == 200
    assert weak.json()["is_new_best"] is False
    assert weak.json()["best_score"] == good.json()["score"]
    me = _fresh(db, player)
    assert me.best_score == good.json()["score"]
    assert str(me.best_round_id) == first["round_id"]


def test_a_higher_score_replaces_the_best(client, db):
    player = _player(db)
    _, weak = _play(client, db, player, taps=[])
    second, good = _play(client, db, player)

    assert good.json()["is_new_best"] is True
    me = _fresh(db, player)
    assert me.best_score == good.json()["score"] > weak.json()["score"]
    assert str(me.best_round_id) == second["round_id"]


def test_a_tied_score_keeps_the_earlier_one(client, db, monkeypatch):
    monkeypatch.setattr(
        rounds_service,
        "validate_round",
        lambda seed, taps, field: Verdict(valid=True, score=10, tap_count=len(taps)),
    )
    player = _player(db)
    first, _ = _play(client, db, player, taps=[])
    best_at = _fresh(db, player).best_score_at

    second, tie = _play(client, db, player, taps=[])

    assert tie.status_code == 200
    assert tie.json()["is_new_best"] is False
    me = _fresh(db, player)
    assert str(me.best_round_id) == first["round_id"]
    assert me.best_score_at == best_at


# --- Single use and retries --------------------------------------------------


def test_resubmitting_returns_the_stored_result(client, db):
    player = _player(db)
    started, first = _play(client, db, player)

    again = _submit(client, player, started["round_id"], honest_taps(started["seed"]))

    assert again.status_code == 200
    assert again.json() == first.json()


def test_a_finished_round_cannot_be_rescored_with_different_taps(client, db):
    player = _player(db)
    started, first = _play(client, db, player, taps=[])
    assert first.json()["score"] == 0

    retry = _submit(client, player, started["round_id"], honest_taps(started["seed"]))

    assert retry.status_code == 200
    assert retry.json()["score"] == 0  # the stored result, not the new taps
    assert _row(db, started["round_id"]).score == 0
    assert _fresh(db, player).best_score == 0


# --- Refusing a round --------------------------------------------------------


def test_submitting_before_the_round_could_have_finished_is_refused(client, db):
    player = _player(db)
    started = _start(client, player)
    # No waiting: the round is only seconds old.
    response = _submit(client, player, started["round_id"], honest_taps(started["seed"]))

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == rounds_service.TOO_EARLY
    row = _row(db, started["round_id"])
    assert row.status == "rejected" and row.reject_reason == rounds_service.TOO_EARLY
    assert _fresh(db, player).best_score == 0


def test_a_round_just_under_its_duration_is_refused_and_just_over_is_allowed(client, db):
    player = _player(db)
    early = _start(client, player)
    _age(db, early["round_id"], seconds=28.5)
    assert _submit(client, player, early["round_id"], []).status_code == 422

    ok = _start(client, player)
    _age(db, ok["round_id"], seconds=29.5)  # inside the 1 s tolerance
    assert _submit(client, player, ok["round_id"], []).status_code == 200


@pytest.mark.parametrize(
    ("taps", "code"),
    [
        ("junk", None),  # not a list: stopped by the request schema
        ([{"t": 100, "x": 5000}], "malformed_taps"),
        ([{"t": 100, "x": 5000, "y": 99999}], "tap_out_of_range"),
        ([{"t": 500, "x": 5000, "y": 5000}, {"t": 100, "x": 5000, "y": 5000}], "taps_out_of_order"),
        ([{"t": 500, "x": 5000, "y": 5000}, {"t": 510, "x": 5000, "y": 5000}], "taps_too_close"),
        ([{"t": 100 + i * 60, "x": 5000, "y": 5000} for i in range(17)], "tap_rate_exceeded"),
    ],
)
def test_implausible_tap_logs_are_refused(client, db, taps, code):
    player = _player(db)
    started = _start(client, player)
    _age(db, started["round_id"])
    response = _submit(client, player, started["round_id"], taps)

    if code is None:
        assert response.status_code == 422
        assert _row(db, started["round_id"]).status == "started"
        return
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    row = _row(db, started["round_id"])
    assert row.status == "rejected" and row.reject_reason == code
    assert row.score is None and row.tap_log is None
    assert _fresh(db, player).best_score == 0


def test_a_refused_round_stays_refused(client, db):
    player = _player(db)
    started = _start(client, player)
    _age(db, started["round_id"])
    bad = [{"t": 500, "x": 5000, "y": 5000}, {"t": 500, "x": 5000, "y": 5000}]
    assert _submit(client, player, started["round_id"], bad).status_code == 422

    retry = _submit(client, player, started["round_id"], honest_taps(started["seed"]))

    assert retry.status_code == 422
    assert retry.json()["detail"]["code"] == "taps_too_close"
    assert _fresh(db, player).best_score == 0


def test_an_expired_round_is_gone(client, db):
    player = _player(db)
    started = _start(client, player)
    _age(db, started["round_id"])
    db.execute(
        update(Round)
        .where(Round.id == uuid.UUID(started["round_id"]))
        .values(expires_at=func.now() - timedelta(minutes=1))
    )
    db.commit()

    response = _submit(client, player, started["round_id"], honest_taps(started["seed"]))

    assert response.status_code == 410
    assert _row(db, started["round_id"]).status == "expired"
    assert _fresh(db, player).best_score == 0
    # And it stays gone.
    assert _submit(client, player, started["round_id"], []).status_code == 410


# --- Rounds on other field shapes ----------------------------------------------


def test_a_round_on_a_wide_field_is_scored_against_that_field(client, db):
    player = _player(db)
    started, response = _play(client, db, player, field=(29_000, 14_000))

    assert response.status_code == 200
    wide = config.Field(29_000, 14_000)
    expected = validate_round(started["seed"], honest_taps(started["seed"], wide), wide).score
    assert response.json()["score"] == expected > 0
    assert _row(db, started["round_id"]).score == expected


def test_taps_outside_the_rounds_own_field_are_refused(client, db):
    player = _player(db)
    started = _start(client, player)  # the default portrait field
    _age(db, started["round_id"])

    response = _submit(client, player, started["round_id"], [{"t": 500, "x": 25_000, "y": 100}])

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "tap_out_of_range"


def test_the_same_taps_are_fine_on_a_round_with_a_wide_field(client, db):
    player = _player(db)
    started = _start(client, player, (29_000, 14_000))
    _age(db, started["round_id"])

    response = _submit(client, player, started["round_id"], [{"t": 500, "x": 25_000, "y": 100}])

    assert response.status_code == 200


def test_a_player_cannot_play_one_field_and_be_checked_on_another(client, db):
    # Taps from a wide-field round, sent for a portrait round, are judged on the portrait
    # schedule: they are valid taps but they mostly miss.
    player = _player(db)
    wide = config.Field(29_000, 14_000)
    started = _start(client, player)
    _age(db, started["round_id"])
    taps = [t for t in honest_taps(started["seed"], wide) if t["x"] <= config.FIELD_WIDTH]

    response = _submit(client, player, started["round_id"], taps)

    assert response.status_code == 200
    assert response.json()["score"] < validate_round(started["seed"], honest_taps(started["seed"])).score // 2


def test_a_round_from_an_older_config_is_refused_with_409(client, db):
    player = _player(db)
    started = _start(client, player)
    _age(db, started["round_id"])
    db.execute(
        update(Round)
        .where(Round.id == uuid.UUID(started["round_id"]))
        .values(config_version=config.CONFIG_VERSION - 1)
    )
    db.commit()

    response = _submit(client, player, started["round_id"], honest_taps(started["seed"]))

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == rounds_service.CONFIG_MISMATCH
    assert _fresh(db, player).best_score == 0
