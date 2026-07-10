import { describe, expect, it } from 'vitest';
import { MAX_GLITCHES, MAX_TIME_MS, validateCompleteRequest } from './validate';

const valid = { timeMs: 42_000, whispers: 1, glitches: 2 };

function expectMessage(body: unknown): string {
  const result = validateCompleteRequest(body);
  if (result.ok) throw new Error('expected validation to fail');
  return result.message;
}

describe('validateCompleteRequest', () => {
  it('accepts a well-formed request', () => {
    const result = validateCompleteRequest(valid);
    expect(result).toEqual({ ok: true, value: { ...valid } });
  });

  it('rejects non-objects', () => {
    expect(expectMessage(null)).toMatch(/object/);
    expect(expectMessage('hard')).toMatch(/object/);
  });

  it('rejects negative or fractional counts', () => {
    expect(expectMessage({ ...valid, timeMs: -1 })).toMatch(/timeMs/);
    expect(expectMessage({ ...valid, timeMs: 1.5 })).toMatch(/timeMs/);
    expect(expectMessage({ ...valid, whispers: -1 })).toMatch(/whispers/);
    expect(expectMessage({ ...valid, glitches: -3 })).toMatch(/glitches/);
  });

  it('accepts unlimited Whispers — there is no cap anymore', () => {
    const result = validateCompleteRequest({ ...valid, whispers: 40 });
    expect(result.ok && result.value.whispers).toBe(40);
  });

  it('clamps an absurd solve time and Glitch count', () => {
    const result = validateCompleteRequest({
      ...valid,
      timeMs: MAX_TIME_MS * 10,
      glitches: 10_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeMs).toBe(MAX_TIME_MS);
    expect(result.value.glitches).toBe(MAX_GLITCHES);
  });

  it('omits the night override when absent', () => {
    const result = validateCompleteRequest(valid);
    expect(result.ok && 'night' in result.value).toBe(false);
  });

  it('passes a valid night override through', () => {
    const result = validateCompleteRequest({ ...valid, night: 7 });
    expect(result.ok && result.value.night).toBe(7);
  });

  it('rejects a nonsensical night override', () => {
    expect(expectMessage({ ...valid, night: 0 })).toMatch(/night/);
    expect(expectMessage({ ...valid, night: -2 })).toMatch(/night/);
    expect(expectMessage({ ...valid, night: 2.5 })).toMatch(/night/);
  });

  it('ignores unknown extra fields rather than trusting them', () => {
    const result = validateCompleteRequest({ ...valid, starsConnected: 999, username: 'spez' });
    expect(result).toEqual({ ok: true, value: { ...valid } });
  });
});
