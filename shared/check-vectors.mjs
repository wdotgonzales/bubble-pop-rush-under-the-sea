// Verifies spawn.js against shared/spawn-vectors.json (written by the Python
// generator). Run from anywhere:  node shared/check-vectors.mjs
// Exit code 0 means the client and server schedules are identical.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, generateSchedule, mulberry32, radiusAt, replay } from './spawn.js';

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(join(here, 'spawn-vectors.json'), 'utf8'));

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`FAIL ${message}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!same(CONFIG, vectors.config)) fail('config differs from the one in spawn-vectors.json');

for (const { seed, first } of vectors.prng) {
  const next = mulberry32(seed);
  const got = first.map(() => next());
  if (!same(got, first)) fail(`prng seed ${seed}`);
}

for (const { seed, bubbles } of vectors.schedules) {
  const got = generateSchedule(seed).map((b) => [b.spawn_ms, b.x, b.y, b.kind, b.lifetime_ms]);
  if (!same(got, bubbles)) fail(`schedule seed ${seed}`);
}

for (const { seed, index, at } of vectors.radius) {
  const bubble = generateSchedule(seed)[index];
  for (const [time, expected] of at) {
    const got = radiusAt(bubble, time);
    if (got !== expected) fail(`radius seed ${seed} bubble ${index} t=${time}: ${got} != ${expected}`);
  }
}

for (const { name, seed, taps, score, popped } of vectors.replays) {
  const got = replay(
    generateSchedule(seed),
    taps.map(([t, x, y]) => ({ t, x, y })),
  );
  if (got.score !== score || !same(got.popped, popped)) fail(`replay "${name}" (seed ${seed})`);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed: client and server have drifted.`);
  process.exit(1);
}
console.log(
  `OK: ${vectors.prng.length} prng, ${vectors.schedules.length} schedules, ` +
    `${vectors.radius.length} radius probes, ${vectors.replays.length} replays match the server.`,
);
