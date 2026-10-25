import json

import pytest

from app.core.security import (
    SignatureError,
    TokenError,
    create_session_token,
    verify_session_token,
    verify_signed_player_info,
)
from tests.helpers import b64url, make_signed_player_info, sign_payload

SECRET = "test-app-secret"
NOW = 1_700_000_000


# ---------- Facebook signed player info ----------

def test_valid_signature_returns_player_id():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW)
    assert verify_signed_player_info(signed, SECRET, now=NOW) == "12345"


def test_integer_player_id_is_accepted_as_string():
    signed = make_signed_player_info(12345, SECRET, issued_at=NOW)
    assert verify_signed_player_info(signed, SECRET, now=NOW) == "12345"


def test_wrong_secret_is_rejected():
    signed = make_signed_player_info("12345", "another-secret", issued_at=NOW)
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, SECRET, now=NOW)


def test_tampered_payload_is_rejected():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW)
    signature, _ = signed.split(".")
    forged = {"algorithm": "HMAC-SHA256", "issued_at": NOW, "player_id": "99999"}
    tampered = f"{signature}.{b64url(json.dumps(forged).encode())}"
    with pytest.raises(SignatureError):
        verify_signed_player_info(tampered, SECRET, now=NOW)


def test_tampered_signature_is_rejected():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW)
    encoded_signature, payload = signed.split(".")
    flipped = bytearray(
        __import__("base64").urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
    )
    flipped[0] ^= 0xFF
    tampered = f"{b64url(bytes(flipped))}.{payload}"
    with pytest.raises(SignatureError):
        verify_signed_player_info(tampered, SECRET, now=NOW)


@pytest.mark.parametrize("bad", ["", "abc", "a.b.c", ".", "a.", ".b", "!!!.???"])
def test_malformed_signature_is_rejected(bad):
    with pytest.raises(SignatureError):
        verify_signed_player_info(bad, SECRET, now=NOW)


def test_wrong_algorithm_is_rejected():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW, algorithm="HMAC-SHA1")
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, SECRET, now=NOW)


def test_expired_signature_is_rejected():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW - 601)
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, SECRET, now=NOW)


def test_signature_at_the_age_limit_is_accepted():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW - 600)
    assert verify_signed_player_info(signed, SECRET, now=NOW) == "12345"


def test_signature_issued_far_in_the_future_is_rejected():
    signed = make_signed_player_info("12345", SECRET, issued_at=NOW + 3600)
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, SECRET, now=NOW)


@pytest.mark.parametrize("player_id", [None, "", True])
def test_missing_player_id_is_rejected(player_id):
    signed = make_signed_player_info(player_id, SECRET, issued_at=NOW)
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, SECRET, now=NOW)


def test_payload_that_is_not_a_json_object_is_rejected():
    signed = sign_payload(["not", "an", "object"], SECRET)
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, SECRET, now=NOW)


def test_empty_app_secret_fails_closed():
    # With an empty secret, anyone could forge this. It must never verify.
    signed = make_signed_player_info("12345", "", issued_at=NOW)
    with pytest.raises(SignatureError):
        verify_signed_player_info(signed, "", now=NOW)


# ---------- Session tokens ----------

KEY = "test-secret-key"


def test_token_round_trip():
    token = create_session_token("player-1", KEY, now=NOW)
    assert verify_session_token(token, KEY, now=NOW + 10) == "player-1"


def test_tampered_token_payload_is_rejected():
    token = create_session_token("player-1", KEY, now=NOW)
    _, signature = token.split(".")
    forged = b64url(json.dumps({"sub": "player-2", "exp": NOW + 3600}).encode())
    with pytest.raises(TokenError):
        verify_session_token(f"{forged}.{signature}", KEY, now=NOW)


def test_token_signed_with_another_key_is_rejected():
    token = create_session_token("player-1", "another-key", now=NOW)
    with pytest.raises(TokenError):
        verify_session_token(token, KEY, now=NOW)


def test_expired_token_is_rejected():
    token = create_session_token("player-1", KEY, ttl_seconds=3600, now=NOW)
    assert verify_session_token(token, KEY, now=NOW + 3599) == "player-1"
    with pytest.raises(TokenError):
        verify_session_token(token, KEY, now=NOW + 3600)


@pytest.mark.parametrize("bad", ["", "abc", "a.b.c", ".", "!!.!!"])
def test_malformed_token_is_rejected(bad):
    with pytest.raises(TokenError):
        verify_session_token(bad, KEY, now=NOW)


def test_token_with_a_non_object_payload_is_rejected():
    encoded = b64url(json.dumps(["x"]).encode())
    import hashlib
    import hmac

    signature = b64url(hmac.new(KEY.encode(), encoded.encode(), hashlib.sha256).digest())
    with pytest.raises(TokenError):
        verify_session_token(f"{encoded}.{signature}", KEY, now=NOW)


def test_empty_key_fails_closed():
    with pytest.raises(TokenError):
        create_session_token("player-1", "", now=NOW)
    with pytest.raises(TokenError):
        verify_session_token("a.b", "", now=NOW)