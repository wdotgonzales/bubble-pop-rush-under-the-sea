// Types for shared/spawn.js (the JavaScript twin of backend/app/game/spawn.py).
// Keep in step with spawn.js: the golden-vector tests only cover behaviour, not these types.

export interface Phase {
  start_ms: number;
  end_ms: number;
  spawn_interval_ms: number;
  lifetime_ms: number;
}

export interface BubbleKind {
  id: number;
  name: string;
  points: number;
  radius: number;
  lifetime_pct: number;
  chance_permille: number;
}

export interface GameConfig {
  version: number;
  duration_ms: number;
  field_width: number;
  field_height: number;
  field_min: number;
  field_max: number;
  field_max_ratio: number;
  initial_delay_ms: number;
  spawn_jitter_permille: number;
  hit_min_radius: number;
  hit_grace_ms: number;
  phases: Phase[];
  kinds: BubbleKind[];
}

export interface Bubble {
  index: number;
  spawn_ms: number;
  x: number;
  y: number;
  kind: number;
  points: number;
  radius: number;
  lifetime_ms: number;
}

export interface Tap {
  t: number;
  x: number;
  y: number;
}

export interface ReplayResult {
  score: number;
  popped: number[];
}

/** The shape of the play field, in game units. */
export interface FieldSize {
  width: number;
  height: number;
}

export const CONFIG: GameConfig;
/** The portrait phone field, used when a round does not ask for another. */
export const DEFAULT_FIELD: FieldSize;
export function isValidField(width: number, height: number): boolean;
export function mulberry32(seed: number): () => number;
export function generateSchedule(seed: number, field?: FieldSize): Bubble[];
export function radiusAt(bubble: Bubble, timeMs: number): number;
export function findHit(schedule: readonly Bubble[], tap: Tap, popped: ReadonlySet<number>): Bubble | null;
export function replay(schedule: readonly Bubble[], taps: readonly Tap[]): ReplayResult;
