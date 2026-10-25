"""Play one full round against a running server as a fake player. Dev tool.

Handy for trying the whole flow end to end, and for putting scores on the
leaderboard without a game client. Run from backend/, with the server up and
FB_APP_SECRET set in the repo-root .env:

    python scripts/play_bot_round.py                      # player "bot-1", 80% accuracy
    python scripts/play_bot_round.py ana --name Ana --accuracy 60
    python scripts/play_bot_round.py --base-url http://localhost:8000

A round takes about 31 seconds because the server will not accept a round that
has not lasted its full duration. To seed several players, run it in parallel:

    for p in ana ben cy; do python scripts/play_bot_round.py $p --name $p & done; wait

Like make_test_signature.py, it signs player info the way Facebook does, so it
refuses to run when ENVIRONMENT is production.
"""

import argparse
import base64
import hashlib
import hmac
import json
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.game import config  # noqa: E402
from app.game.spawn import generate_schedule  # noqa: E402

WAIT_SECONDS = 31


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_player_info(player_id: str) -> str:
    payload = {"algorithm": "HMAC-SHA256", "issued_at": int(time.time()), "player_id": player_id}
    encoded = b64url(json.dumps(payload).encode("utf-8"))
    digest = hmac.new(
        settings.FB_APP_SECRET.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256
    ).digest()
    return f"{b64url(digest)}.{encoded}"


def call(base_url: str, method: str, path: str, body=None, token: str | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(base_url + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"null")


def bot_taps(seed: int, accuracy: int, rng: random.Random) -> list[dict]:
    """Tap the centre of `accuracy` percent of the bubbles, just after they appear."""
    return [
        {"t": b.spawn_ms + 100, "x": b.x, "y": b.y}
        for b in generate_schedule(seed)
        if b.spawn_ms + 100 <= config.ROUND_DURATION_MS and rng.randrange(100) < accuracy
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("player", nargs="?", default="bot-1", help="fake Facebook player id")
    parser.add_argument("--name", default=None, help="display name")
    parser.add_argument("--accuracy", type=int, default=80, help="percent of bubbles popped")
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()

    if settings.ENVIRONMENT == "production":
        print("Refusing to run: ENVIRONMENT is production.", file=sys.stderr)
        return 1
    if not settings.FB_APP_SECRET:
        print("FB_APP_SECRET is empty. Set it in the repo-root .env first.", file=sys.stderr)
        return 1

    base = args.base_url.rstrip("/")
    body = {"signed_player_info": sign_player_info(args.player)}
    if args.name:
        body["display_name"] = args.name
    status, session = call(base, "POST", "/session", body)
    if status != 200:
        print(f"/session failed: {status} {session}", file=sys.stderr)
        return 1
    token = session["token"]
    print(f"signed in as {session['player']['display_name']} ({session['player']['id']})")

    status, started = call(base, "POST", "/rounds/start", token=token)
    if status != 201:
        print(f"/rounds/start failed: {status} {started}", file=sys.stderr)
        return 1
    print(f"round {started['round_id']} seed {started['seed']}, playing {WAIT_SECONDS}s...")

    taps = bot_taps(started["seed"], args.accuracy, random.Random())
    time.sleep(WAIT_SECONDS)

    status, result = call(
        base,
        "POST",
        f"/rounds/{started['round_id']}/submit",
        {"taps": taps, "client_duration_ms": config.ROUND_DURATION_MS},
        token,
    )
    print(f"{len(taps)} taps -> {status} {json.dumps(result)}")
    return 0 if status == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
