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
from app.game.spawn import Mulberry32, generate_schedule, radius_at  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "shared" / "spawn-vectors.json"

SEEDS = [0, 1, 42, 123456789, 2147483648, 4294967295]
PRNG_SEEDS = [0, 1, 42, 4294967295]
PRNG_DRAWS = 8
RADIUS_PROBE_SEED = 42
RADIUS_PROBE_BUBBLES = 5


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

    return {"config": config.config_as_dict(), "prng": prng, "schedules": schedules, "radius": probes}


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
