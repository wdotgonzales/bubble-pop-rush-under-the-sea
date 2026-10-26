// Bubble schedule generator for the game client.
//
// This is the JavaScript twin of backend/app/game/spawn.py. Given the same seed
// it MUST produce exactly the same bubbles, because the server replays the
// player's taps against its own copy of this schedule.
//
// Rules that keep the two identical:
//   - integers only; no floating point anywhere in this file;
//   - every bubble consumes random draws in the same order:
//     kind, x, y, then the gap to the next spawn;
//   - the field's width and height only decide the size of the x and y draws;
//   - Math.floor(a / b) is used only on non-negative integers.
//
// Check it against the server's output with:  node shared/check-vectors.mjs

export const CONFIG = {
  version: 4,
  duration_ms: 30000,
  field_width: 10000,
  field_height: 21640,
  field_min: 8000,
  field_max: 64000,
  field_max_ratio: 3,
  initial_delay_ms: 400,
  spawn_jitter_permille: 200,
  hit_min_radius: 900,
  hit_grace_ms: 50,
  phases: [
    { start_ms: 0, end_ms: 10000, spawn_interval_ms: 700, lifetime_ms: 1800 },
    { start_ms: 10000, end_ms: 20000, spawn_interval_ms: 500, lifetime_ms: 1400 },
    { start_ms: 20000, end_ms: 30000, spawn_interval_ms: 350, lifetime_ms: 1000 },
  ],
  kinds: [
    { id: 0, name: 'standard', points: 1, radius: 1700, lifetime_pct: 100, chance_permille: 850 },
    { id: 1, name: 'pearl', points: 3, radius: 1400, lifetime_pct: 70, chance_permille: 150 },
  ],
};

/** The default field: the portrait phone layout. A round can ask the server for another shape. */
export const DEFAULT_FIELD = { width: CONFIG.field_width, height: CONFIG.field_height };

/** Is this a field shape the server will play on? Same rule as app.game.config.is_valid_field. */
export function isValidField(width, height) {
  for (const side of [width, height]) {
    if (!Number.isInteger(side) || side < CONFIG.field_min || side > CONFIG.field_max) return false;
  }
  return Math.max(width, height) <= CONFIG.field_max_ratio * Math.min(width, height);
}

/** mulberry32: returns a function that yields unsigned 32-bit integers. */
export function mulberry32(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an integer in 0..2**32-1');
  }
  let a = seed | 0;
  return function nextU32() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function phaseAt(timeMs) {
  for (const phase of CONFIG.phases) {
    if (timeMs >= phase.start_ms && timeMs < phase.end_ms) return phase;
  }
  return CONFIG.phases[CONFIG.phases.length - 1];
}

/** Every bubble of a round, in spawn order, inside `field` ({ width, height }). */
export function generateSchedule(seed, field = DEFAULT_FIELD) {
  const next = mulberry32(seed);
  const below = (n) => next() % n;
  const [standard, pearl] = CONFIG.kinds;
  const jitter = CONFIG.spawn_jitter_permille;

  const bubbles = [];
  let t = CONFIG.initial_delay_ms;
  while (t < CONFIG.duration_ms) {
    const phase = phaseAt(t);
    const kind = below(1000) < pearl.chance_permille ? pearl : standard;
    const spanX = field.width - 2 * kind.radius + 1;
    const spanY = field.height - 2 * kind.radius + 1;
    const x = kind.radius + below(spanX);
    const y = kind.radius + below(spanY);
    bubbles.push({
      index: bubbles.length,
      spawn_ms: t,
      x,
      y,
      kind: kind.id,
      points: kind.points,
      radius: kind.radius,
      lifetime_ms: Math.floor((phase.lifetime_ms * kind.lifetime_pct) / 100),
    });
    const gapFactor = 1000 + below(2 * jitter + 1) - jitter;
    t += Math.floor((phase.spawn_interval_ms * gapFactor) / 1000);
  }
  return bubbles;
}

/** Current radius: full at spawn, shrinking linearly to 0 at expiry. */
export function radiusAt(bubble, timeMs) {
  const elapsed = timeMs - bubble.spawn_ms;
  if (elapsed < 0 || elapsed >= bubble.lifetime_ms) return 0;
  return Math.floor((bubble.radius * (bubble.lifetime_ms - elapsed)) / bubble.lifetime_ms);
}

/**
 * The bubble a tap pops, or null for empty water. `popped` is a Set of bubble
 * indexes already popped. Same rules as backend/app/game/replay.py:
 *   - a bubble is poppable from spawn until hit_grace_ms after it expires;
 *   - a tap hits within the bubble's current radius, but never less than
 *     hit_min_radius;
 *   - if several qualify, the most recently spawned wins (it is drawn on top).
 */
export function findHit(schedule, tap, popped) {
  let hit = null;
  for (const bubble of schedule) {
    if (bubble.spawn_ms > tap.t) break;
    if (popped.has(bubble.index)) continue;
    if (tap.t >= bubble.spawn_ms + bubble.lifetime_ms + CONFIG.hit_grace_ms) continue;
    const reach = Math.max(radiusAt(bubble, tap.t), CONFIG.hit_min_radius);
    const dx = tap.x - bubble.x;
    const dy = tap.y - bubble.y;
    if (dx * dx + dy * dy <= reach * reach) hit = bubble;
  }
  return hit;
}

/** Score a tap log (in time order): { score, popped } with popped indexes in pop order. */
export function replay(schedule, taps) {
  const popped = new Set();
  const order = [];
  let score = 0;
  for (const tap of taps) {
    const bubble = findHit(schedule, tap, popped);
    if (bubble !== null) {
      popped.add(bubble.index);
      order.push(bubble.index);
      score += bubble.points;
    }
  }
  return { score, popped: order };
}
