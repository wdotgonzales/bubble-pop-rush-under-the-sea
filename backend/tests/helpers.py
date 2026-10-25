import base64
import hashlib
import hmac
import json
import time


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_payload(payload, secret: str) -> str:
    """Sign any JSON value the way Facebook signs player info."""
    encoded = b64url(json.dumps(payload).encode("utf-8"))
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{b64url(signature)}.{encoded}"


def make_signed_player_info(player_id, secret: str, *, issued_at=None, **overrides) -> str:
    payload = {
        "algorithm": "HMAC-SHA256",
        "issued_at": int(time.time()) if issued_at is None else issued_at,
        "player_id": player_id,
    }
    payload.update(overrides)
    return sign_payload(payload, secret)