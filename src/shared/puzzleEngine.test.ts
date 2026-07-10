/**
 * Tests for the nightly puzzle engine: determinism, the weekday ramp (gentle
 * Monday → monster Sunday), the no-repeat window, and star-field integrity.
 * There is one game per night — no difficulty modes.
 */

import { describe, it, expect } from 'vitest';
import { getConstellationById } from './constellationLoader';
import { weekdayOfNight } from './nightSeed';
import {
  NO_REPEAT_WINDOW,
  nightParams,
  selectConstellationForNight,
  selectConstellationIndexForNight,
  generatePuzzle,
} from './puzzleEngine';

const SAMPLE_NIGHTS = [1, 2, 3, 7, 8, 15, 16, 42, 100];

// Ten launch weeks, starting on the first Monday-night (2026-07-06), so every
// weekday is exercised many times.
const RAMP_NIGHTS = Array.from({ length: 70 }, (_, i) => 6 + i);

// Weekday index (0 = Sun … 6 = Sat) → expected Glitch count from WEEKDAY_RAMP.
const EXPECTED_GLITCHES: Record<number, number> = {
  1: 2, // Mon
  2: 3, // Tue
  3: 4, // Wed
  4: 6, // Thu
  5: 8, // Fri
  6: 10, // Sat
  0: 12, // Sun
};

describe('selection: determinism', () => {
  it('returns the same constellation for the same night every time', () => {
    for (const night of SAMPLE_NIGHTS) {
      const a = selectConstellationForNight(night);
      const b = selectConstellationForNight(night);
      expect(a.id).toBe(b.id);
    }
  });

  it('picks a real constellation from the dataset', () => {
    for (const night of SAMPLE_NIGHTS) {
      const c = selectConstellationForNight(night);
      expect(getConstellationById(c.id)).toBeDefined();
    }
  });
});

describe('selection: no repeats within the window', () => {
  it(`never repeats a constellation within ${NO_REPEAT_WINDOW} consecutive nights`, () => {
    const total = 500;
    const ids: string[] = [];
    for (let night = 1; night <= total; night++) {
      ids.push(selectConstellationForNight(night).id);
    }
    for (let start = 0; start + NO_REPEAT_WINDOW <= ids.length; start++) {
      const windowIds = ids.slice(start, start + NO_REPEAT_WINDOW);
      const unique = new Set(windowIds);
      expect(unique.size).toBe(NO_REPEAT_WINDOW);
    }
  });

  it('still shows variety and reaches most constellations over time', () => {
    const seen = new Set<number>();
    for (let night = 1; night <= 200; night++) {
      seen.add(selectConstellationIndexForNight(night));
    }
    // Over 200 nights we should have used a healthy spread of the dataset.
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });
});

describe('night params', () => {
  it('runs one game: no outline, no count, timer always on', () => {
    for (const night of SAMPLE_NIGHTS) {
      const params = nightParams(night);
      expect(params.showOutline).toBe(false);
      expect(params.showStarCountHint).toBe(false);
      expect(params.timed).toBe(true);
    }
  });

  it('gives an effectively unlimited Whisper allowance', () => {
    // The old cap was 3; Whispers are now limited only by a client-side cooldown.
    expect(nightParams(8).maxWhispers).toBeGreaterThan(3);
  });

  it('sets the Glitch count from the night’s weekday ramp', () => {
    for (const night of RAMP_NIGHTS) {
      const expected = EXPECTED_GLITCHES[weekdayOfNight(night)]!;
      expect(nightParams(night).decoyCount).toBe(expected);
    }
  });

  it('ramps Glitches gentle Monday → monster Sunday (2/3/4/6/8/10/12)', () => {
    // Nights 6..12 are Mon..Sun of the launch week.
    const week = [6, 7, 8, 9, 10, 11, 12].map((n) => nightParams(n).decoyCount);
    expect(week).toEqual([2, 3, 4, 6, 8, 10, 12]);
  });
});

describe('selection: weekday star-count band', () => {
  it('keeps the constellation inside the weekday band across ten weeks', () => {
    for (const night of RAMP_NIGHTS) {
      const stars = selectConstellationForNight(night).stars.length;
      switch (weekdayOfNight(night)) {
        case 1: // Mon — ≤6
          expect(stars).toBeLessThanOrEqual(6);
          break;
        case 2: // Tue — 7
          expect(stars).toBe(7);
          break;
        case 3: // Wed — 8
          expect(stars).toBe(8);
          break;
        case 4: // Thu — 9
          expect(stars).toBe(9);
          break;
        case 5: // Fri — 10
          expect(stars).toBe(10);
          break;
        case 6: // Sat — 11
          expect(stars).toBe(11);
          break;
        case 0: // Sun — ≥12
          expect(stars).toBeGreaterThanOrEqual(12);
          break;
      }
    }
  });

  it('runs Sunday skies larger than Monday skies on average', () => {
    const avg = (weekday: number) => {
      const counts = RAMP_NIGHTS.filter((n) => weekdayOfNight(n) === weekday).map(
        (n) => selectConstellationForNight(n).stars.length
      );
      return counts.reduce((a, b) => a + b, 0) / counts.length;
    };
    expect(avg(0 /* Sun */)).toBeGreaterThan(avg(1 /* Mon */));
  });
});

describe('generatePuzzle: determinism', () => {
  it('produces byte-for-byte identical puzzles for the same night', () => {
    for (const night of SAMPLE_NIGHTS) {
      const a = generatePuzzle(night);
      const b = generatePuzzle(night);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe('generatePuzzle: star field integrity', () => {
  it('has the ramp’s Glitch count and a matching total star count', () => {
    for (const night of RAMP_NIGHTS) {
      const puzzle = generatePuzzle(night);
      const decoys = puzzle.stars.filter((s) => s.isDecoy);
      const real = puzzle.stars.filter((s) => !s.isDecoy);
      expect(decoys.length).toBe(nightParams(night).decoyCount);
      expect(real.length).toBe(puzzle.realStarCount);
      expect(puzzle.stars.length).toBe(real.length + decoys.length);
    }
  });

  it('never starves the decoy scatter, however crowded the constellation', () => {
    // Monster Sundays scatter twelve Glitches around a dozen-plus real stars, all
    // held apart by a minimum distance. Ten weeks covers every weekday band.
    for (const night of RAMP_NIGHTS) {
      const puzzle = generatePuzzle(night);
      const decoys = puzzle.stars.filter((s) => s.isDecoy);
      expect(decoys.length).toBe(nightParams(night).decoyCount);
    }
  });

  it('keeps every star inside the 0–1 box', () => {
    for (const night of SAMPLE_NIGHTS) {
      for (const star of generatePuzzle(night).stars) {
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThanOrEqual(1);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('assigns contiguous ids equal to array position', () => {
    const puzzle = generatePuzzle(8);
    puzzle.stars.forEach((star, index) => expect(star.id).toBe(index));
  });

  it('keeps decoys clear of real stars (minimum spacing)', () => {
    const MIN = 0.09;
    const puzzle = generatePuzzle(12); // a Sunday — the most crowded field
    const real = puzzle.stars.filter((s) => !s.isDecoy);
    const decoys = puzzle.stars.filter((s) => s.isDecoy);
    for (const d of decoys) {
      for (const r of real) {
        const dist = Math.hypot(d.x - r.x, d.y - r.y);
        expect(dist).toBeGreaterThanOrEqual(MIN - 1e-9);
      }
    }
  });

  it('only real stars carry a sourceIndex; decoys carry none', () => {
    const puzzle = generatePuzzle(12);
    for (const star of puzzle.stars) {
      if (star.isDecoy) {
        expect(star.sourceIndex).toBeUndefined();
      } else {
        expect(typeof star.sourceIndex).toBe('number');
      }
    }
  });
});

describe('generatePuzzle: solution correctness', () => {
  it('has one solution edge per source connection and references only real stars', () => {
    for (const night of SAMPLE_NIGHTS) {
      const puzzle = generatePuzzle(night);
      const source = getConstellationById(puzzle.constellationId)!;
      expect(puzzle.solution.length).toBe(source.connections.length);

      const byId = new Map(puzzle.stars.map((s) => [s.id, s]));
      for (const edge of puzzle.solution) {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        expect(from).toBeDefined();
        expect(to).toBeDefined();
        expect(from!.isDecoy).toBe(false);
        expect(to!.isDecoy).toBe(false);
      }
    }
  });

  it('preserves the constellation shape (solution edges match source edges by position)', () => {
    const puzzle = generatePuzzle(8);
    const source = getConstellationById(puzzle.constellationId)!;

    // Rebuild source-index → star position via sourceIndex, then confirm each
    // solution edge connects the same two physical points as the source.
    const posBySource = new Map<number, { x: number; y: number }>();
    for (const star of puzzle.stars) {
      if (!star.isDecoy && star.sourceIndex !== undefined) {
        posBySource.set(star.sourceIndex, { x: star.x, y: star.y });
      }
    }
    const byId = new Map(puzzle.stars.map((s) => [s.id, s]));

    source.connections.forEach((conn, i) => {
      const edge = puzzle.solution[i]!;
      const expectedFrom = posBySource.get(conn.from)!;
      const expectedTo = posBySource.get(conn.to)!;
      const actualFrom = byId.get(edge.from)!;
      const actualTo = byId.get(edge.to)!;
      expect(actualFrom.x).toBe(expectedFrom.x);
      expect(actualFrom.y).toBe(expectedFrom.y);
      expect(actualTo.x).toBe(expectedTo.x);
      expect(actualTo.y).toBe(expectedTo.y);
    });
  });
});

describe('generatePuzzle: labelling', () => {
  it('labels the puzzle "TaaraNight #N"', () => {
    expect(generatePuzzle(12).label).toBe('TaaraNight #12');
    expect(generatePuzzle(12).night).toBe(12);
  });
});
