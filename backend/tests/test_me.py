import time
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.security import create_session_token
from app.models.player import Player

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def _make_player(db, fb_id, score=0, reached_at=None, name="Diver"):
    player = Player(
        fb_player_id=fb_id,
        display_name=name,
        best_score=score,
        best_score_at=reached_at if score > 0 else None,
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _auth(player, **token_kwargs):
    token = create_session_token(str(player.id), settings.SECRET_KEY, **token_kwargs)
    return {"Authorization": f"Bearer {token}"}


def test_me_requires_a_token(client):
    response = client.get("/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_rejects_garbage_and_wrong_scheme(client, db):
    player = _make_player(db, "fb-1")
    token = _auth(player)["Authorization"].split(" ", 1)[1]

    assert client.get("/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/me", headers={"Authorization": f"Basic {token}"}).status_code == 401
    assert client.get("/me", headers={"Authorization": token}).status_code == 401


def test_me_rejects_a_token_signed_with_another_key(client, db):
    player = _make_player(db, "fb-1")
    token = create_session_token(str(player.id), "some-other-key")
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_me_rejects_an_expired_token(client, db):
    player = _make_player(db, "fb-1")
    headers = _auth(player, now=time.time() - 7200)
    assert client.get("/me", headers=headers).status_code == 401


def test_me_rejects_a_token_for_a_player_that_no_longer_exists(client, db):
    player = _make_player(db, "fb-1")
    headers = _auth(player)
    db.delete(player)
    db.commit()
    assert client.get("/me", headers=headers).status_code == 401


def test_me_rejects_a_token_whose_subject_is_not_a_uuid(client):
    token = create_session_token("not-a-uuid", settings.SECRET_KEY)
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_me_returns_profile_without_the_facebook_id(client, db):
    player = _make_player(db, "fb-private-42", name="Ana")
    response = client.get("/me", headers=_auth(player))

    assert response.status_code == 200
    body = response.json()
    assert body["player"]["id"] == str(player.id)
    assert body["player"]["display_name"] == "Ana"
    assert "fb-private-42" not in response.text
    assert "fb_player_id" not in response.text


def test_rank_is_null_without_a_score(client, db):
    player = _make_player(db, "fb-1")
    assert client.get("/me", headers=_auth(player)).json()["rank"] is None


def test_rank_orders_by_score_then_earliest(client, db):
    low = _make_player(db, "low", 100, T0)
    mid = _make_player(db, "mid", 300, T0)
    high = _make_player(db, "high", 900, T0)

    def rank(p):
        return client.get("/me", headers=_auth(p)).json()["rank"]

    assert rank(high) == 1
    assert rank(mid) == 2
    assert rank(low) == 3


def test_tied_scores_rank_the_earlier_one_first(client, db):
    early = _make_player(db, "early", 300, T0)
    late = _make_player(db, "late", 300, T0 + timedelta(minutes=5))
    _make_player(db, "zero")  # no score: not on the board

    assert client.get("/me", headers=_auth(early)).json()["rank"] == 1
    assert client.get("/me", headers=_auth(late)).json()["rank"] == 2
