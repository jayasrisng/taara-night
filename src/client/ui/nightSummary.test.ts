import { describe, expect, it } from 'vitest';
import type { NightResult } from '../../shared/api';
import { describeNight, sameSolve, summariseNight } from './nightSummary';

function result(over: Partial<NightResult> = {}): NightResult {
  return {
    night: 9,
    timeMs: 16_000,
    whispers: 0,
    glitches: 0,
    starsConnected: 10,
    completedAt: 0,
    ...over,
  };
}

describe('describeNight', () => {
  it('always shows the time — one game per night, timer always on', () => {
    expect(describeNight(result())).toContain('0:16');
    expect(describeNight(result({ timeMs: 90_000 }))).toContain('1:30');
  });

  it('counts Whispers, and says so when there were none', () => {
    expect(describeNight(result({ whispers: 0 }))).toContain('no Whispers');
    expect(describeNight(result({ whispers: 1 }))).toContain('1 Whisper');
    expect(describeNight(result({ whispers: 2 }))).toContain('2 Whispers');
  });

  it('carries the mood', () => {
    expect(describeNight(result())).toContain('Mood: Luminous');
    expect(describeNight(result({ whispers: 3, glitches: 4 }))).toContain('Mood: Drowsy');
  });
});

describe('sameSolve', () => {
  it('is true for the same solve', () => {
    expect(sameSolve(result(), result())).toBe(true);
  });

  it('is false across times and Whispers', () => {
    expect(sameSolve(result(), result({ timeMs: 90_000 }))).toBe(false);
    expect(sameSolve(result(), result({ whispers: 1 }))).toBe(false);
  });
});

describe('summariseNight', () => {
  it('describes the solve just played when there is no record yet', () => {
    const summary = summariseNight(result(), null);
    expect(summary.headline).toContain('0:16');
    expect(summary.note).toBeNull();
  });

  it('stays quiet when the record is the solve just played', () => {
    const summary = summariseNight(result(), result());
    expect(summary.note).toBeNull();
  });

  /**
   * The night's record is write-once — the first solve of the night. A replay
   * shows its own time in the headline, and the record, when it differs, gets a
   * quiet attributed line because the share card is built from it.
   */
  it('describes the replay, and attributes the write-once record when they differ', () => {
    const record = result({ timeMs: 16_000 });
    const replay = result({ timeMs: 90_000 });

    const summary = summariseNight(replay, record);

    expect(summary.headline).toContain('1:30');
    expect(summary.headline).not.toContain('0:16');
    expect(summary.note).toContain('0:16');
  });
});
