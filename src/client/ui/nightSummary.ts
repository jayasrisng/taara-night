/**
 * How a finished night is written out in words.
 *
 * Pure and Phaser-free, so the results screen's one factual claim — what you
 * just played — is unit testable. It used to be formatted inline from whatever
 * `/api/init` had on file, which is not the same thing: tonight's record is
 * write-once, so a player who replayed a night was told about their first solve.
 */

import type { NightResult } from '../../shared/api';
import { moodFor } from '../../shared/mood';

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A solve time as `m:ss`. Also how the Fastest board writes its rows. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/** "2:14 · 1 Whisper · Mood: Dreamy" — one game per night, timer always on. */
export function describeNight(result: NightResult): string {
  const parts = [mmss(result.timeMs)];
  parts.push(result.whispers === 0 ? 'no Whispers' : plural(result.whispers, 'Whisper'));
  parts.push(`Mood: ${moodFor(result)}`);
  return parts.join('  ·  ');
}

/** True when two results describe the same solve. */
export function sameSolve(a: NightResult, b: NightResult): boolean {
  return a.timeMs === b.timeMs && a.whispers === b.whispers;
}

export type NightSummary = {
  /** The solve the player just finished. Always. */
  headline: string;
  /** Whose solve tonight's record — and so the share card — actually carries. */
  note: string | null;
};

/**
 * What the results screen says about the night.
 *
 * `played` is the solve the screen was opened by; `record` is what the server
 * has on file, which is write-once and therefore belongs to the *first* solve
 * of the night. They are the same thing on a first play and different on a
 * replay, and conflating them is what once printed "Hard · 0:16" under an Easy
 * solve. The headline is always the solve just played; the record, when it is a
 * different one, gets a quiet line of its own.
 */
export function summariseNight(played: NightResult, record: NightResult | null): NightSummary {
  return {
    headline: describeNight(played),
    note:
      record && !sameSolve(record, played)
        ? `Tonight’s card keeps your first solve: ${describeNight(record)}`
        : null,
  };
}
