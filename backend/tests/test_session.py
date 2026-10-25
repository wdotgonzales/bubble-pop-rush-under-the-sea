import time

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import TOKEN_TTL_SECONDS, verify_session_token
from app.models.player import Player
from tests.helpers import make_signed_player_info, sign_payload


def _login(client, fb_secret, player_id="fb-1001", **body):
    signed = make_signed_player_info(player_id, fb_secret)
    return client.post("/session", json={"signed_player_info": signed, **body})


def _count(db):
    return db.scalar(select(func.count()).select_from(Player))


def test_first_login_creates_player_and_returns_token(client, db, fb_secret):
    response = _login(client, fb_secret, display_name="Ana", avatar_url="https://cdn.example/a.png")

    assert response.status_code == 200
    data = response.json()
    assert data["expires_in"] == TOKEN_TTL_SECONDS
    assert data["player"]["display_name"] == "Ana"
    assert data["player"]["avatar_url"] == "https://cdn.example/a.png"
    assert data["player"]["best_score"] == 0

    row = db.scalar(select(Player).where(Player.fb_player_id == "fb-1001"))
    assert row is not None
    assert str(row.id) == data["player"]["id"]
    # The token's subject is our own player id, not the Facebook one.
    assert verify_session_token(data["token"], settings.SECRET_KEY) == str(row.id)


def test_response_never_leaks_the_facebook_id(client, fb_secret):
    response = _login(client, fb_secret, player_id="fb-secret-id-777")
    assert response.status_code == 200
    assert "fb_player_id" not in response.text
    assert "fb-secret-id-777" not in response.text


def test_login_without_name_uses_default(client, fb_secret):
    response = _login(client, fb_secret)
    assert response.json()["player"]["display_name"] == "Diver"
    assert response.json()["player"]["avatar_url"] is None


def test_second_login_reuses_the_same_player(client, db, fb_secret):
    first = _login(client, fb_secret).json()
    second = _login(client, fb_secret).json()

    assert first["player"]["id"] == second["player"]["id"]
    assert _count(db) == 1


def test_different_facebook_players_get_different_rows(client, db, fb_secret):
    a = _login(client, fb_secret, player_id="fb-a").json()
    b = _login(client, fb_secret, player_id="fb-b").json()

    assert a["player"]["id"] != b["player"]["id"]
    assert _count(db) == 2


def test_relogin_updates_name_but_omitted_name_keeps_old_one(client, fb_secret):
    _login(client, fb_secret, display_name="Ana")
    kept = _login(client, fb_secret).json()
    assert kept["player"]["display_name"] == "Ana"

    renamed = _login(client, fb_secret, display_name="Ana R.").json()
    assert renamed["player"]["display_name"] == "Ana R."


def test_relogin_never_resets_the_score(client, db, fb_secret):
    first = _login(client, fb_secret).json()
    row = db.scalar(select(Player).where(Player.fb_player_id == "fb-1001"))
    row.best_score = 500
    db.commit()

    again = _login(client, fb_secret, display_name="Renamed").json()

    assert again["player"]["id"] == first["player"]["id"]
    assert again["player"]["best_score"] == 500


def test_name_and_avatar_are_cleaned(client, fb_secret):
    response = _login(
        client,
        fb_secret,
        display_name="  A​na   " + "x" * 50,
        avatar_url="http://insecure.example/a.png",
    )
    player = response.json()["player"]
    assert player["display_name"].startswith("Ana x")
    assert len(player["display_name"]) <= 24
    assert player["avatar_url"] is None


def test_oversized_name_is_rejected_by_validation(client, fb_secret):
    response = _login(client, fb_secret, display_name="x" * 500)
    assert response.status_code == 422


def test_tampered_signature_is_rejected(client, db, fb_secret):
    signed = make_signed_player_info("fb-1001", fb_secret)
    sig, payload = signed.split(".")
    forged = sign_payload(
        {"algorithm": "HMAC-SHA256", "issued_at": int(time.time()), "player_id": "someone-else"},
        fb_secret,
    ).split(".")[1]
    response = client.post("/session", json={"signed_player_info": f"{sig}.{forged}"})

    assert response.status_code == 401
    assert _count(db) == 0


def test_signature_from_another_secret_is_rejected(client, db, fb_secret):
    signed = make_signed_player_info("fb-1001", "not-the-real-secret")
    response = client.post("/session", json={"signed_player_info": signed})

    assert response.status_code == 401
    assert _count(db) == 0


def test_expired_signature_is_rejected(client, db, fb_secret):
    signed = make_signed_player_info("fb-1001", fb_secret, issued_at=int(time.time()) - 3600)
    response = client.post("/session", json={"signed_player_info": signed})

    assert response.status_code == 401
    assert _count(db) == 0


def test_garbage_signature_is_rejected(client, fb_secret):
    for junk in ["nope", "a.b.c", ".", "....", "!!!.???"]:
        response = client.post("/session", json={"signed_player_info": junk})
        assert response.status_code == 401, junk


def test_missing_signature_field_is_a_validation_error(client, fb_secret):
    assert client.post("/session", json={}).status_code == 422
    assert client.post("/session", json={"signed_player_info": ""}).status_code == 422


def test_fails_closed_when_app_secret_is_not_configured(client, db, monkeypatch):
    monkeypatch.setattr(settings, "FB_APP_SECRET", "")
    # Signed with an empty secret: would verify if the server did not fail closed.
    signed = make_signed_player_info("fb-1001", "")
    response = client.post("/session", json={"signed_player_info": signed})

    assert response.status_code == 503
    assert _count(db) == 0
