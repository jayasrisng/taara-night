import { describe, expect, it } from 'vitest';
import { color, hex, mixColor } from './theme';

describe('hex', () => {
  it('pads a dark token to six digits', () => {
    expect(hex(color.skyTop)).toBe('#020a17');
    expect(hex(0x000000)).toBe('#000000');
  });
});

describe('mixColor', () => {
  it('returns the endpoints untouched', () => {
    expect(mixColor(color.surface, color.accent, 0)).toBe(color.surface);
    expect(mixColor(color.surface, color.accent, 1)).toBe(color.accent);
  });

  it('blends each channel independently', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    // Red steady, green arriving, blue leaving — all in one step.
    expect(mixColor(0xff0000, 0xff00ff, 0.5)).toBe(0xff0080);
  });

  it('never lets a falling channel bleed into its neighbour', () => {
    expect(mixColor(0x00ff00, 0x000000, 0.5)).toBe(0x008000);
    expect(mixColor(0x0000ff, 0x000000, 0.5)).toBe(0x000080);
  });

  it('clamps progress outside 0–1, as an overshooting curve would report', () => {
    expect(mixColor(0x102030, 0x405060, -0.5)).toBe(0x102030);
    expect(mixColor(0x102030, 0x405060, 1.5)).toBe(0x405060);
  });

  it('stays a valid 24-bit colour across the whole curve', () => {
    for (let step = 0; step <= 20; step++) {
      const blended = mixColor(color.void, color.accentBright, step / 20);
      expect(Number.isInteger(blended)).toBe(true);
      expect(blended).toBeGreaterThanOrEqual(0);
      expect(blended).toBeLessThanOrEqual(0xffffff);
    }
  });
});
