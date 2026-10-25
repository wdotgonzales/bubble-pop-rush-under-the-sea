"""Regenerate shared/spawn-vectors.json from the Python generator.

Run from backend/ whenever the game config or generator changes (and bump
CONFIG_VERSION first):

    python scripts/generate_spawn_vectors.py

Then run `node shared/check-vectors.mjs` from the repo root. If the JavaScript
generator disagrees, the two implementations have drifted.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.game import config  # noqa: E402
from app.game.replay import Tap, replay  # noqa: E402
from app.game.spawn import Mulberry32, generate_schedule, radius_at  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "shared" / "spawn-vectors.json"

SEEDS = [0, 1, 42, 123456789, 2147483648, 4294967295]
PRNG_SEEDS = [0, 1, 42, 4294967295]
PRNG_DRAWS = 8
RADIUS_PROBE_SEED = 42
RADIUS_PROBE_BUBBLES = 5


def _replay_case(name: str, seed: int, taps: list[Tap]) -> dict:
    score, popped = replay(generate_schedule(seed), taps)
    return {
        "name": name,
        "seed": seed,
        "taps": [[t.t, t.x, t.y] for t in taps],
        "score": score,
        "popped": list(popped),
    }


def _replay_cases() -> list[dict]:
    cases = []

    # A flawless bot: taps the exact centre of every bubble a third into its life.
    for seed in (42, 123456789):
        schedule = generate_schedule(seed)
        taps = [Tap(b.spawn_ms + b.lifetime_ms // 3, b.x, b.y) for b in schedule]
        cases.append(_replay_case("centre taps", seed, taps))

    # Messy humans: random timing, aim off by up to ~1.3 radii, plus taps on empty water.
    for seed, human_seed in ((42, 7), (2147483648, 8), (4294967295, 9)):
        rng = Mulberry32(human_seed)
        taps = []
        for b in generate_schedule(seed):
            if rng.below(100) < 75:
                t = b.spawn_ms + rng.below(b.lifetime_ms + 60)
                reach = b.radius * 13 // 10
                x = min(config.FIELD_SIZE, max(0, b.x + rng.below(2 * reach + 1) - reach))
                y = min(config.FIELD_SIZE, max(0, b.y + rng.below(2 * reach + 1) - reach))
                taps.append(Tap(t, x, y))
        for _ in range(25):
            taps.append(
                Tap(
                    rng.below(config.ROUND_DURATION_MS + 1),
                    rng.below(config.FIELD_SIZE + 1),
                    rng.below(config.FIELD_SIZE + 1),
                )
            )
        taps.sort(key=lambda tap: (tap.t, tap.x, tap.y))
        cases.append(_replay_case("messy human", seed, taps))

    # Edges of one bubble: exact radius, one past it, spawn instant, grace limits.
    schedule = generate_schedule(5)
    b = schedule[2]
    mid = b.spawn_ms + 10
    r_mid = radius_at(b, mid)
    edge = [
        ("on the radius", Tap(mid, b.x + r_mid, b.y)),
        ("one past the radius", Tap(mid, b.x + r_mid + 1, b.y)),
        ("before spawn", Tap(b.spawn_ms - 1, b.x, b.y)),
        ("at spawn", Tap(b.spawn_ms, b.x, b.y)),
        ("last grace ms", Tap(b.expires_ms + config.HIT_GRACE_MS - 1, b.x, b.y)),
        ("after grace", Tap(b.expires_ms + config.HIT_GRACE_MS, b.x, b.y)),
        (
            "on the minimum radius, late",
            Tap(b.expires_ms - 1, b.x, b.y + config.HIT_MIN_RADIUS),
        ),
        (
            "past the minimum radius, late",
            Tap(b.expires_ms - 1, b.x, b.y + config.HIT_MIN_RADIUS + 1),
        ),
    ]
    for name, tap in edge:
        cases.append(_replay_case(f"edge: {name}", 5, [tap]))

    # The same spot tapped twice: second tap must not pop the same bubble again.
    cases.append(
        _replay_case(
            "double tap",
            5,
            [Tap(b.spawn_ms + 20, b.x, b.y), Tap(b.spawn_ms + 80, b.x, b.y)],
        )
    )
    return cases


def build() -> dict:
    prng = []
    for seed in PRNG_SEEDS:
        rng = Mulberry32(seed)
        prng.append({"seed": seed, "first": [rng.next_u32() for _ in range(PRNG_DRAWS)]})

    schedules = [
        {"seed": s, "bubbles": [b.as_vector() for b in generate_schedule(s)]} for s in SEEDS
    ]

    schedule = generate_schedule(RADIUS_PROBE_SEED)
    probes = []
    for bubble in schedule[:RADIUS_PROBE_BUBBLES]:
        times = [
            bubble.spawn_ms - 1,
            bubble.spawn_ms,
            bubble.spawn_ms + bubble.lifetime_ms // 3,
            bubble.spawn_ms + bubble.lifetime_ms // 2,
            bubble.spawn_ms + bubble.lifetime_ms - 1,
            bubble.spawn_ms + bubble.lifetime_ms,
        ]
        probes.append(
            {
                "seed": RADIUS_PROBE_SEED,
                "index": bubble.index,
                "at": [[t, radius_at(bubble, t)] for t in times],
            }
        )

    return {
        "config": config.config_as_dict(),
        "prng": prng,
        "schedules": schedules,
        "radius": probes,
        "replays": _replay_cases(),
    }


def dumps(doc: dict) -> str:
    """JSON with one bubble per line, so a changed schedule diffs readably."""
    lines = ["{", f'  "config": {json.dumps(doc["config"], separators=(", ", ": "))},']
    lines.append('  "prng": [')
    lines.append(",\n".join("    " + json.dumps(p, separators=(", ", ": ")) for p in doc["prng"]))
    lines.append("  ],")
    lines.append('  "schedules": [')
    blocks = []
    for s in doc["schedules"]:
        rows = ",\n".join("      " + json.dumps(b, separators=(",", ":")) for b in s["bubbles"])
        blocks.append(f'    {{"seed": {s["seed"]}, "bubbles": [\n{rows}\n    ]}}')
    lines.append(",\n".join(blocks))
    lines.append("  ],")
    lines.append('  "radius": [')
    lines.append(",\n".join("    " + json.dumps(r, separators=(", ", ": ")) for r in doc["radius"]))
    lines.append("  ],")
    lines.append('  "replays": [')
    rows = []
    for r in doc["replays"]:
        taps = ",\n".join("        " + json.dumps(t, separators=(",", ":")) for t in r["taps"])
        head = json.dumps(
            {k: r[k] for k in ("name", "seed", "score", "popped")}, separators=(", ", ": ")
        )[:-1]
        rows.append(f'    {head}, "taps": [\n{taps}\n    ]}}')
    lines.append(",\n".join(rows))
    lines.append("  ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(dumps(build()), encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
