"""Facebook signed-player-info verification and our own session tokens."""
import base64
import binascii
import hashlib
import hmac
import json
import time

SIGNED_INFO_MAX_AGE_SECONDS = 600  # 10 minutes: limits how long a stolen signature is useful
MAX_CLOCK_SKEW_SECONDS = 60
TOKEN_TTL_SECONDS = 3600  # 1 hour


class SignatureError(Exception):
    """The Facebook signature is missing, malformed, forged, or stale."""


class TokenError(Exception):
    """The session token is missing, malformed, forged, or expired."""


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError) as exc:  # includes non-ASCII input
        raise ValueError("invalid base64url") from exc


def _sign(secret: str, message: str) -> bytes:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()


def verify_signed_player_info(
    signed_info: str,
    app_secret: str,
    *,
    max_age_seconds: int = SIGNED_INFO_MAX_AGE_SECONDS,
    now: float | None = None,
) -> str:
    """Return the verified player ID, or raise SignatureError.

    The signature is checked before the payload is parsed, so nothing
    attacker-controlled is trusted until it has been authenticated.
    """
    if not app_secret:
        # An empty secret would let anyone forge signatures. Fail closed.
        raise SignatureError("app secret is not configured")

    current = time.time() if now is None else now

    parts = signed_info.split(".") if isinstance(signed_info, str) else []
    if len(parts) != 2 or not all(parts):
        raise SignatureError("malformed signature")
    encoded_signature, encoded_payload = parts

    try:
        signature = _b64url_decode(encoded_signature)
    except ValueError:
        raise SignatureError("malformed signature") from None

    if not hmac.compare_digest(signature, _sign(app_secret, encoded_payload)):
        raise SignatureError("bad signature")

    try:
        payload = json.loads(_b64url_decode(encoded_payload))
    except ValueError:  # bad base64, bad UTF-8, bad JSON
        raise SignatureError("malformed payload") from None
    if not isinstance(payload, dict):
        raise SignatureError("malformed payload")

    if str(payload.get("algorithm", "")).upper() != "HMAC-SHA256":
        raise SignatureError("unsupported algorithm")

    player_id = payload.get("player_id")
    if isinstance(player_id, int) and not isinstance(player_id, bool):
        player_id = str(player_id)
    if not isinstance(player_id, str) or not player_id or len(player_id) > 128:
        raise SignatureError("missing player id")

    issued_at = payload.get("issued_at")
    if isinstance(issued_at, bool) or not isinstance(issued_at, (int, float)):
        raise SignatureError("missing issued_at")
    age = current - issued_at
    if age > max_age_seconds:
        raise SignatureError("signature expired")
    if age < -MAX_CLOCK_SKEW_SECONDS:
        raise SignatureError("signature issued in the future")

    return player_id


def create_session_token(
    player_id: str,
    secret: str,
    *,
    ttl_seconds: int = TOKEN_TTL_SECONDS,
    now: float | None = None,
) -> str:
    if not secret:
        raise TokenError("secret key is not configured")
    current = time.time() if now is None else now
    payload = {"sub": player_id, "exp": int(current + ttl_seconds)}
    encoded = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{encoded}.{_b64url_encode(_sign(secret, encoded))}"


def verify_session_token(token: str, secret: str, *, now: float | None = None) -> str:
    """Return the player ID (the `sub` claim), or raise TokenError."""
    if not secret:
        raise TokenError("secret key is not configured")
    current = time.time() if now is None else now

    parts = token.split(".") if isinstance(token, str) else []
    if len(parts) != 2 or not all(parts):
        raise TokenError("malformed token")
    encoded_payload, encoded_signature = parts

    try:
        signature = _b64url_decode(encoded_signature)
    except ValueError:
        raise TokenError("malformed token") from None
    if not hmac.compare_digest(signature, _sign(secret, encoded_payload)):
        raise TokenError("bad signature")

    try:
        payload = json.loads(_b64url_decode(encoded_payload))
    except ValueError:
        raise TokenError("malformed token") from None
    if not isinstance(payload, dict):
        raise TokenError("malformed token")

    subject, expires = payload.get("sub"), payload.get("exp")
    if not isinstance(subject, str) or not subject:
        raise TokenError("malformed token")
    if isinstance(expires, bool) or not isinstance(expires, (int, float)) or current >= expires:
        raise TokenError("token expired")
    return subject