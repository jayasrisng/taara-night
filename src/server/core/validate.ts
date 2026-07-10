/**
 * Request validation for the completion endpoint.
 *
 * Kept free of any Devvit import so it can be unit tested directly. This is a
 * cozy game, not a competitive one, so this is sanity-checking rather than
 * anti-cheat: reject nonsense, clamp the merely implausible.
 */

import type { CompleteRequest } from '../../shared/api';

export type Validated<T> = { ok: true; value: T } | { ok: false; message: string };

/** A solve longer than 24h is a tab left open overnight, not a play. */
export const MAX_TIME_MS = 24 * 60 * 60 * 1000;
/** Nobody meaningfully mis-taps a Glitch more than this. */
export const MAX_GLITCHES = 999;

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function clamp(value: number, max: number): number {
  return Math.min(value, max);
}

/**
 * Parse an untrusted request body into a CompleteRequest.
 *
 * Rejects: negative/non-integer counts, a night override below 1.
 * Clamps: absurd solve times and Glitch counts.
 *
 * Whispers are unlimited now (a 20-second cooldown is the only limit, enforced
 * client-side), so there is no cap to validate — the count is recorded as sent.
 */
export function validateCompleteRequest(body: unknown): Validated<CompleteRequest> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Request body must be an object' };
  }

  const raw: Record<string, unknown> = { ...body };

  if (!isCount(raw.timeMs)) {
    return { ok: false, message: 'timeMs must be a non-negative integer' };
  }
  if (!isCount(raw.whispers)) {
    return { ok: false, message: 'whispers must be a non-negative integer' };
  }
  if (!isCount(raw.glitches)) {
    return { ok: false, message: 'glitches must be a non-negative integer' };
  }

  const value: CompleteRequest = {
    timeMs: clamp(raw.timeMs, MAX_TIME_MS),
    whispers: raw.whispers,
    glitches: clamp(raw.glitches, MAX_GLITCHES),
  };

  if (raw.night !== undefined) {
    if (!isCount(raw.night) || raw.night < 1) {
      return { ok: false, message: 'night must be an integer >= 1' };
    }
    value.night = raw.night;
  }

  return { ok: true, value };
}
