/**
 * Dev-only preview helpers for sanity-checking the nightly puzzle engine.
 *
 * Not shipped to players (it would spoil the constellation names). Used to
 * eyeball the weekday ramp — gentle Monday → monster Sunday — across
 * consecutive nights during development/verification.
 */

import { generatePuzzle } from './puzzleEngine';
import { nightNumberAt, weekdayOfNight } from './nightSeed';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** A one-line summary of a single night's puzzle. */
export function describeNight(night: number): string {
  const puzzle = generatePuzzle(night);
  const decoys = puzzle.stars.filter((s) => s.isDecoy).length;
  return (
    `${puzzle.label.padEnd(16)} ` +
    `${WEEKDAYS[weekdayOfNight(night)]} ` +
    `${puzzle.constellationId.padEnd(16)} ` +
    `real:${String(puzzle.realStarCount).padStart(2)} ` +
    `glitch:${String(decoys).padStart(2)} ` +
    `solution-edges:${puzzle.solution.length}`
  );
}

/** A multi-line table describing `count` consecutive nights from `startNight`. */
export function previewNights(startNight: number, count: number): string {
  const lines: string[] = [];
  for (let n = startNight; n < startNight + count; n++) {
    lines.push(describeNight(n));
  }
  return lines.join('\n');
}

/** Convenience: preview the two-week ramp starting at whatever tonight's night is. */
export function previewUpcomingWeek(now: number | Date = Date.now()): string {
  const tonight = Math.max(1, nightNumberAt(now));
  return previewNights(tonight, 14);
}
