/**
 * Night-seed math for TaaraNight.
 *
 * The whole game is deterministic off the "night number" — the count of
 * 01:00 UTC boundaries elapsed since launch. 01:00 UTC ≈ 6 PM PDT; we keep a
 * fixed boundary and deliberately do NOT chase daylight-saving during the
 * hackathon. This number is what players see as "TaaraNight #N".
 */

/**
 * Launch instant: 2026-07-15 01:00:00 UTC (July 14 at 6 PM PDT).
 * This is the start of TaaraNight #1.
 * (Date.UTC month is 0-indexed, so 6 = July.)
 */
export const LAUNCH_EPOCH_MS = Date.UTC(2026, 6, 15, 1, 0, 0, 0);

/** One night is exactly 24 hours. */
export const NIGHT_LENGTH_MS = 24 * 60 * 60 * 1000;

function toMs(now: number | Date): number {
  return typeof now === 'number' ? now : now.getTime();
}

/**
 * Night number at a given instant (defaults to now).
 *
 * - Exactly at LAUNCH_EPOCH → 1
 * - Anywhere in the first 24h after launch → 1
 * - At the next 01:00 UTC boundary → 2, and so on.
 *
 * Instants before launch yield 0 or negative numbers; callers that must always
 * present a playable "current night" should clamp with `max(1, ...)`.
 */
export function nightNumberAt(now: number | Date = Date.now()): number {
  const ms = toMs(now);
  return Math.floor((ms - LAUNCH_EPOCH_MS) / NIGHT_LENGTH_MS) + 1;
}

/** The 01:00 UTC instant (in ms) at which the given night begins. */
export function nightStartUtc(night: number): number {
  return LAUNCH_EPOCH_MS + (night - 1) * NIGHT_LENGTH_MS;
}

/** The 01:00 UTC instant (in ms) at which the given night ends / the next begins. */
export function nightEndUtc(night: number): number {
  return nightStartUtc(night + 1);
}

/** Milliseconds from `now` until the next sky unlocks (the next 01:00 UTC boundary). */
export function millisUntilNextNight(now: number | Date = Date.now()): number {
  const ms = toMs(now);
  const current = nightNumberAt(ms);
  return nightStartUtc(current + 1) - ms;
}

/**
 * The weekday a night belongs to, 0 = Sunday … 6 = Saturday (the `Date.getUTCDay`
 * convention).
 *
 * A night is labelled by the UTC calendar day one hour before its 01:00 UTC
 * start — i.e. midnight UTC of that day, which is roughly the Pacific evening the
 * sky lights up. The weekday drives the difficulty ramp (gentle Monday → monster
 * Sunday, resetting weekly). Pure and deterministic, and — like the rest of the
 * night math — it does not chase daylight-saving.
 */
export function weekdayOfNight(night: number): number {
  const HOUR_MS = 60 * 60 * 1000;
  return new Date(nightStartUtc(night) - HOUR_MS).getUTCDay();
}
