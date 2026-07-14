/**
 * Tests for night-number math, with careful attention to the 01:00 UTC
 * boundary that flips the night over.
 */

import { describe, it, expect } from 'vitest';
import {
  LAUNCH_EPOCH_MS,
  NIGHT_LENGTH_MS,
  nightNumberAt,
  nightStartUtc,
  nightEndUtc,
  millisUntilNextNight,
  weekdayOfNight,
} from './nightSeed';

describe('LAUNCH_EPOCH_MS', () => {
  it('is 2026-07-15 01:00:00 UTC', () => {
    expect(new Date(LAUNCH_EPOCH_MS).toISOString()).toBe('2026-07-15T01:00:00.000Z');
  });
});

describe('nightNumberAt', () => {
  it('is 1 exactly at launch', () => {
    expect(nightNumberAt(LAUNCH_EPOCH_MS)).toBe(1);
  });

  it('stays 1 for the whole first night', () => {
    expect(nightNumberAt(LAUNCH_EPOCH_MS + 1)).toBe(1);
    expect(nightNumberAt(LAUNCH_EPOCH_MS + NIGHT_LENGTH_MS - 1)).toBe(1);
  });

  it('flips to 2 exactly at the next 01:00 UTC boundary', () => {
    // 00:59:59.999 UTC the next day is still night 1...
    expect(nightNumberAt(LAUNCH_EPOCH_MS + NIGHT_LENGTH_MS - 1)).toBe(1);
    // ...01:00:00.000 UTC is night 2.
    expect(nightNumberAt(LAUNCH_EPOCH_MS + NIGHT_LENGTH_MS)).toBe(2);
  });

  it('matches a hand-computed date (2026-07-22 after 01:00 UTC → night 8)', () => {
    // 7 full nights elapsed since 2026-07-15 01:00 UTC.
    expect(nightNumberAt(Date.UTC(2026, 6, 22, 12, 0, 0))).toBe(8);
    // Just before the boundary on the 22nd it is still night 7.
    expect(nightNumberAt(Date.UTC(2026, 6, 22, 0, 59, 59))).toBe(7);
    // At the boundary it becomes night 8.
    expect(nightNumberAt(Date.UTC(2026, 6, 22, 1, 0, 0))).toBe(8);
  });

  it('is 0 or negative before launch (caller must clamp)', () => {
    expect(nightNumberAt(LAUNCH_EPOCH_MS - 1)).toBe(0);
    expect(nightNumberAt(LAUNCH_EPOCH_MS - NIGHT_LENGTH_MS)).toBe(0);
    expect(nightNumberAt(LAUNCH_EPOCH_MS - NIGHT_LENGTH_MS - 1)).toBe(-1);
  });

  it('accepts a Date as well as a millisecond number', () => {
    const d = new Date(Date.UTC(2026, 6, 22, 12, 0, 0));
    expect(nightNumberAt(d)).toBe(nightNumberAt(d.getTime()));
  });
});

describe('nightStartUtc / nightEndUtc', () => {
  it('night 1 starts at launch', () => {
    expect(nightStartUtc(1)).toBe(LAUNCH_EPOCH_MS);
  });

  it('round-trips with nightNumberAt', () => {
    for (const night of [1, 2, 8, 15, 100]) {
      expect(nightNumberAt(nightStartUtc(night))).toBe(night);
      // The instant just before the end still belongs to this night.
      expect(nightNumberAt(nightEndUtc(night) - 1)).toBe(night);
      // The end instant belongs to the next night.
      expect(nightNumberAt(nightEndUtc(night))).toBe(night + 1);
    }
  });

  it('every night start lands on 01:00:00 UTC', () => {
    for (const night of [1, 5, 30, 365]) {
      const d = new Date(nightStartUtc(night));
      expect(d.getUTCHours()).toBe(1);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    }
  });
});

describe('weekdayOfNight', () => {
  // 0 = Sun … 6 = Sat. Launch night 1 begins 2026-07-15 01:00 UTC (a Wednesday).
  const SUN = 0;
  const MON = 1;
  const TUE = 2;
  const WED = 3;
  const SAT = 6;

  it('always returns a weekday index 0–6', () => {
    for (const night of [1, 5, 6, 7, 30, 100, 365]) {
      const d = weekdayOfNight(night);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(6);
    }
  });

  it('matches the launch-week calendar (night 1 = Wed, night 6 = Mon)', () => {
    expect(weekdayOfNight(1)).toBe(WED); // 2026-07-15
    expect(weekdayOfNight(4)).toBe(SAT); // 2026-07-18
    expect(weekdayOfNight(5)).toBe(SUN); // 2026-07-19
    expect(weekdayOfNight(6)).toBe(MON); // 2026-07-20
    expect(weekdayOfNight(7)).toBe(TUE); // 2026-07-21
    expect(weekdayOfNight(8)).toBe(WED); // 2026-07-22
  });

  it('repeats every 7 nights (week wraparound)', () => {
    for (const night of [1, 6, 7, 13, 50, 200]) {
      expect(weekdayOfNight(night + 7)).toBe(weekdayOfNight(night));
      expect(weekdayOfNight(night + 700)).toBe(weekdayOfNight(night));
    }
  });

  it('advances by one day each night across a week', () => {
    const week = [6, 7, 8, 9, 10, 11, 12].map(weekdayOfNight);
    expect(week).toEqual([MON, TUE, WED, 4 /* Thu */, 5 /* Fri */, SAT, SUN]);
  });
});

describe('millisUntilNextNight', () => {
  it('is the full night length exactly at a boundary', () => {
    expect(millisUntilNextNight(LAUNCH_EPOCH_MS)).toBe(NIGHT_LENGTH_MS);
  });

  it('counts down toward the next boundary', () => {
    const midNight = LAUNCH_EPOCH_MS + NIGHT_LENGTH_MS / 2;
    expect(millisUntilNextNight(midNight)).toBe(NIGHT_LENGTH_MS / 2);
  });

  it('is always within (0, NIGHT_LENGTH_MS]', () => {
    for (const offset of [1, 1000, NIGHT_LENGTH_MS / 3, NIGHT_LENGTH_MS - 1]) {
      const v = millisUntilNextNight(LAUNCH_EPOCH_MS + offset);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(NIGHT_LENGTH_MS);
    }
  });
});
