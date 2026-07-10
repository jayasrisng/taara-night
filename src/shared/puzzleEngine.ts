/**
 * Nightly puzzle engine for TaaraNight — pure, deterministic logic (no UI).
 *
 * There is one game per night, shared by everyone. Given a night number (see
 * nightSeed.ts) this module produces the exact puzzle every player sees: which
 * constellation, where the real stars sit, where the Glitch decoys sit, the
 * solution (which stars connect), and the night's parameters. Same night →
 * identical output, always.
 *
 * Difficulty comes from the calendar, not a picker: the night's weekday sets a
 * star-count band (which constellations are eligible) and a Glitch count, gentle
 * Monday → monster Sunday, resetting weekly. See WEEKDAY_RAMP.
 */

import type { Constellation } from './constellations';
import { CONSTELLATION_DATA } from './constellationData';
import { weekdayOfNight } from './nightSeed';
import { hashSeed, mulberry32, shuffleInPlace } from './rng';

/**
 * A constellation may not repeat within this many consecutive nights.
 * The dataset has more constellations than this, so the window is always
 * satisfiable.
 */
export const NO_REPEAT_WINDOW = 15;

/** Salt so the selection RNG is decorrelated from the star-field RNG. */
const SELECTION_SALT = 0x5741; // 'WA'

/** Salt for the (night-only) star-field RNG, decorrelated from selection. */
const FIELD_SALT = 0x5354; // 'ST'

/**
 * Whispers are unlimited now — a 20-second cooldown (applied client-side) is the
 * only limit, so the engine no longer caps them. This large finite allowance
 * keeps the old whisper-count bookkeeping working until that cooldown lands.
 */
const WHISPER_ALLOWANCE = 99;

/** The night's parameters. One game per night: no picker, timer always on. */
export interface NightParams {
  /** No outline mode, ever — always false. Kept for the client's field shape. */
  showOutline: boolean;
  /** The guess is the game now — always false. */
  showStarCountHint: boolean;
  /** Number of Glitch decoy stars mixed into the field (weekday ramp). */
  decoyCount: number;
  /** The soft timer is always on now — always true. */
  timed: boolean;
  /** Whisper allowance; effectively unlimited (see WHISPER_ALLOWANCE). */
  maxWhispers: number;
}

/**
 * The weekday ramp: gentle Monday → monster Sunday, resetting weekly. Each
 * weekday targets a real-star-count band (which constellations are eligible that
 * night) and a Glitch count. Indexed by ramp position 0 = Monday … 6 = Sunday.
 *
 * The band Mon→Sun is stars ≤6 / 7 / 8 / 9 / 10 / 11 / ≥12; Glitches
 * 2 / 3 / 4 / 6 / 8 / 10 / 12.
 */
interface WeekdayBand {
  /** Inclusive min/max real-star count for the night's constellation. */
  minStars: number;
  maxStars: number;
  /** Glitch decoys mixed into the field. */
  decoyCount: number;
}

const WEEKDAY_RAMP: readonly WeekdayBand[] = [
  { minStars: 0, maxStars: 6, decoyCount: 2 }, // Mon — gentle
  { minStars: 7, maxStars: 7, decoyCount: 3 }, // Tue
  { minStars: 8, maxStars: 8, decoyCount: 4 }, // Wed
  { minStars: 9, maxStars: 9, decoyCount: 6 }, // Thu
  { minStars: 10, maxStars: 10, decoyCount: 8 }, // Fri
  { minStars: 11, maxStars: 11, decoyCount: 10 }, // Sat
  { minStars: 12, maxStars: Infinity, decoyCount: 12 }, // Sun — monster
];

/** Map a JS weekday (0 = Sun … 6 = Sat) to ramp position (0 = Mon … 6 = Sun). */
function rampPosition(weekday: number): number {
  return (weekday + 6) % 7;
}

/** The weekday band that governs a night. */
function bandForNight(night: number): WeekdayBand {
  return WEEKDAY_RAMP[rampPosition(weekdayOfNight(night))]!;
}

/** The deterministic parameters for a night. */
export function nightParams(night: number): NightParams {
  return {
    showOutline: false,
    showStarCountHint: false,
    decoyCount: bandForNight(night).decoyCount,
    timed: true,
    maxWhispers: WHISPER_ALLOWANCE,
  };
}

/** A single star in the generated field. */
export interface PuzzleStar {
  /** Stable id = index into the puzzle's `stars` array. */
  id: number;
  /** X position, 0–1. */
  x: number;
  /** Y position, 0–1. */
  y: number;
  /** True for a Glitch decoy, false for a real constellation star. */
  isDecoy: boolean;
  /**
   * For real stars only: the index of this star within the source
   * constellation's `stars` array. Omitted entirely for decoys.
   */
  sourceIndex?: number;
}

/** An edge of the solution, referencing PuzzleStar ids. */
export interface PuzzleConnection {
  from: number;
  to: number;
}

/** The complete, deterministic puzzle for one night at one difficulty. */
export interface NightlyPuzzle {
  /** Night number (the "#N"). */
  night: number;
  /** Player-facing label, e.g. "TaaraNight #12". */
  label: string;
  /** Source constellation id (spoiler — server/UI decides when to reveal). */
  constellationId: string;
  /** Source constellation name (spoiler — reveal only after completion). */
  name: string;
  /** English meaning of the name, e.g. "The Hunter" (spoiler, as `name`). */
  meaning: string;
  /** Bedtime story reward (spoiler — reveal only after completion). */
  story: string;
  params: NightParams;
  /** Real stars + decoys, in a shuffled order. */
  stars: PuzzleStar[];
  /** The correct connections, as PuzzleStar id pairs. */
  solution: PuzzleConnection[];
  /** How many of `stars` are real (i.e. part of the constellation). */
  realStarCount: number;
}

const CONSTELLATIONS = CONSTELLATION_DATA.constellations;

/** Real-star count per constellation, by array index (for band filtering). */
const STAR_COUNTS = CONSTELLATIONS.map((c) => c.stars.length);
const MAX_STAR_COUNT = STAR_COUNTS.reduce((a, b) => Math.max(a, b), 0);

/**
 * The eligible constellation indices for a night: those not recently used AND
 * whose star count falls in the weekday band. If the band admits no one, widen
 * it symmetrically by ±1 star until it does; the no-repeat exclusion is never
 * relaxed (the "recently used" pool is far smaller than the dataset, so it is
 * always non-empty). Never returns an empty array.
 */
function eligiblePool(forbidden: Set<number>, band: WeekdayBand): number[] {
  const available: number[] = [];
  for (let i = 0; i < CONSTELLATIONS.length; i++) {
    if (!forbidden.has(i)) available.push(i);
  }
  for (let slack = 0; ; slack++) {
    const min = band.minStars - slack;
    const max = band.maxStars + slack;
    const inBand = available.filter((i) => STAR_COUNTS[i]! >= min && STAR_COUNTS[i]! <= max);
    if (inBand.length > 0) return inBand;
    // The widened band already spans every star count: fall back to the band-less
    // pool (still excluding recent). Reached only if `available` itself is empty.
    if (min <= 0 && max >= MAX_STAR_COUNT) return available;
  }
}

/**
 * Deterministically choose the constellation index for a night such that no
 * constellation repeats within NO_REPEAT_WINDOW consecutive nights and the
 * constellation's star count sits in the night's weekday band.
 *
 * We forward-simulate from night 1, keeping a small "recently used" window and
 * excluding those from each night's pick. Because the simulation is a pure
 * function of the night number, the result is fully reproducible. Cost is
 * O(night) per call, which is trivial at a nightly cadence.
 */
export function selectConstellationIndexForNight(night: number): number {
  const count = CONSTELLATIONS.length;
  // How many previous nights must differ. Clamp so the pool is never empty.
  const windowSize = Math.min(NO_REPEAT_WINDOW, count) - 1;

  const recent: number[] = [];
  let picked = 0;

  for (let n = 1; n <= night; n++) {
    const rng = mulberry32(hashSeed(n, SELECTION_SALT));
    const forbidden = new Set(recent);
    const pool = eligiblePool(forbidden, bandForNight(n));
    picked = pool[Math.floor(rng() * pool.length)] ?? 0;
    recent.push(picked);
    if (recent.length > windowSize) recent.shift();
  }

  return picked;
}

/** The constellation chosen for a given night. */
export function selectConstellationForNight(night: number): Constellation {
  const index = selectConstellationIndexForNight(night);
  const constellation = CONSTELLATIONS[index];
  if (!constellation) {
    throw new Error(`No constellation at index ${index}`);
  }
  return constellation;
}

/** A bare position in the 0–1 box. A Glitch is no star, so it has no catalogue. */
interface Point {
  x: number;
  y: number;
}

/**
 * Scatter `count` Glitch decoy stars across the 0–1 box, keeping them a minimum
 * distance from the real stars and from each other so they read as distinct
 * points. Deterministic given `rng`.
 */
function generateDecoys(realStars: readonly Point[], count: number, rng: () => number): Point[] {
  const decoys: Point[] = [];
  if (count <= 0) return decoys;

  const MIN_DISTANCE = 0.09;
  const MIN_DISTANCE_SQ = MIN_DISTANCE * MIN_DISTANCE;
  const MARGIN = 0.06; // keep decoys off the very edge
  const span = 1 - 2 * MARGIN;
  const maxAttempts = count * 300; // generous cap; prevents any infinite loop

  let attempts = 0;
  while (decoys.length < count && attempts < maxAttempts) {
    attempts++;
    const x = MARGIN + rng() * span;
    const y = MARGIN + rng() * span;

    let tooClose = false;
    for (const s of realStars) {
      const dx = s.x - x;
      const dy = s.y - y;
      if (dx * dx + dy * dy < MIN_DISTANCE_SQ) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      for (const d of decoys) {
        const dx = d.x - x;
        const dy = d.y - y;
        if (dx * dx + dy * dy < MIN_DISTANCE_SQ) {
          tooClose = true;
          break;
        }
      }
    }
    if (!tooClose) decoys.push({ x, y });
  }

  return decoys;
}

/**
 * Build the full puzzle for a night — one shared game for everyone.
 *
 * The constellation, its star layout (decoys and shuffle order) and the Glitch
 * count all derive from the night alone, so every player of a night sees an
 * identical, reproducible board.
 */
export function generatePuzzle(night: number): NightlyPuzzle {
  const constellation = selectConstellationForNight(night);
  const params = nightParams(night);
  const rng = mulberry32(hashSeed(night, FIELD_SALT));

  const decoys = generateDecoys(constellation.stars, params.decoyCount, rng);

  // Assemble real + decoy records, then shuffle so decoys aren't always last.
  type StarRecord = { x: number; y: number; isDecoy: boolean; sourceIndex?: number };
  const records: StarRecord[] = [];
  constellation.stars.forEach((star, index) => {
    records.push({ x: star.x, y: star.y, isDecoy: false, sourceIndex: index });
  });
  for (const decoy of decoys) {
    records.push({ x: decoy.x, y: decoy.y, isDecoy: true });
  }
  shuffleInPlace(records, rng);

  // Ids are the post-shuffle positions.
  const stars: PuzzleStar[] = records.map((r, id) =>
    r.isDecoy
      ? { id, x: r.x, y: r.y, isDecoy: true }
      : { id, x: r.x, y: r.y, isDecoy: false, sourceIndex: r.sourceIndex! }
  );

  // Map source-constellation star index → shuffled PuzzleStar id.
  const idBySource = new Map<number, number>();
  for (const star of stars) {
    if (!star.isDecoy && star.sourceIndex !== undefined) {
      idBySource.set(star.sourceIndex, star.id);
    }
  }

  const solution: PuzzleConnection[] = constellation.connections.map((conn) => {
    const from = idBySource.get(conn.from);
    const to = idBySource.get(conn.to);
    if (from === undefined || to === undefined) {
      throw new Error(`Connection references a missing star in ${constellation.id}`);
    }
    return { from, to };
  });

  return {
    night,
    label: `TaaraNight #${night}`,
    constellationId: constellation.id,
    name: constellation.name,
    meaning: constellation.meaning,
    story: constellation.story,
    params,
    stars,
    solution,
    realStarCount: constellation.stars.length,
  };
}
