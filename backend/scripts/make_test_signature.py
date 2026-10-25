"""Print a signed fake player info, for trying POST /session by hand.

Usage (from backend/, with FB_APP_SECRET set in the repo-root .env):

    python scripts/make_test_signature.py            # player id "local-player-1"
    python scripts/make_test_signature.py some-id

It signs the same way Facebook does (HMAC-SHA256 over the encoded payload), so
the server cannot tell it from the real thing. That is why it refuses to run
in production.
"""

import base64
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> int:
    if settings.ENVIRONMENT == "production":
        print("Refusing to run: ENVIRONMENT is production.", file=sys.stderr)
        return 1
    if not settings.FB_APP_SECRET:
        print("FB_APP_SECRET is empty. Set it in the repo-root .env first.", file=sys.stderr)
        return 1

    player_id = sys.argv[1] if len(sys.argv) > 1 else "local-player-1"
    payload = {
        "algorithm": "HMAC-SHA256",
        "issued_at": int(time.time()),
        "player_id": player_id,
    }
    encoded = b64url(json.dumps(payload).encode("utf-8"))
    signature = hmac.new(
        settings.FB_APP_SECRET.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256
    ).digest()
    signed = f"{b64url(signature)}.{encoded}"

    print(signed)
    print()
    print("Try it (valid for 10 minutes):")
    print(
        "curl -s -X POST http://localhost:8000/session "
        "-H 'Content-Type: application/json' "
        f"-d '{{\"signed_player_info\": \"{signed}\", \"display_name\": \"Local Diver\"}}'"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
