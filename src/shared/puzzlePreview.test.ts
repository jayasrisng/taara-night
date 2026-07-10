/**
 * Preview test — doubles as the printout of a two-week run so the weekday ramp
 * (gentle Monday → monster Sunday) can be eyeballed. Running `npm test` logs the
 * table below.
 */

import { describe, it, expect } from 'vitest';
import { describeNight, previewNights } from './puzzlePreview';
import { weekdayOfNight } from './nightSeed';

describe('puzzlePreview', () => {
  it('prints 14 consecutive nights so the weekday ramp is visible', () => {
    const startNight = 6; // the first Monday-night of the launch week (2026-07-06)
    const table = previewNights(startNight, 14);
    console.log('\n14 consecutive nights (weekday ramp):\n' + table + '\n');
    expect(table.split('\n')).toHaveLength(14);
  });

  it('describeNight is deterministic', () => {
    expect(describeNight(8)).toBe(describeNight(8));
  });

  it('names the weekday in each row', () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const night of [6, 7, 8, 9, 10, 11, 12]) {
      expect(describeNight(night)).toContain(days[weekdayOfNight(night)]!);
    }
  });
});
