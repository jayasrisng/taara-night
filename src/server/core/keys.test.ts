import { describe, expect, it } from 'vitest';
import { keys, nightScore, nightScoreParts } from './keys';

describe('keys', () => {
  it('namespaces every key under tn:', () => {
    const all = [
      keys.nightStars(3),
      keys.nightPlayers(3),
      keys.result(3, 'stargazer'),
      keys.jwala('stargazer'),
      keys.sky('stargazer'),
      keys.lbNight(3),
      keys.sharePost(3, 'stargazer'),
      keys.lbJwala(),
      keys.share(3, 'stargazer'),
      keys.postNight('t3_abc'),
      keys.nightPost(3),
    ];
    for (const key of all) expect(key.startsWith('tn:')).toBe(true);
  });

  it('separates nights and users', () => {
    expect(keys.result(3, 'ana')).not.toBe(keys.result(4, 'ana'));
    expect(keys.result(3, 'ana')).not.toBe(keys.result(3, 'bo'));
    expect(keys.share(3, 'ana')).not.toBe(keys.share(4, 'ana'));
    expect(keys.share(3, 'ana')).not.toBe(keys.share(3, 'bo'));
  });

  it('separates posts from nights, and from the night counters', () => {
    expect(keys.postNight('t3_abc')).not.toBe(keys.postNight('t3_xyz'));
    expect(keys.nightPost(3)).not.toBe(keys.nightPost(4));
    expect(keys.nightPost(3)).not.toBe(keys.nightStars(3));
    expect(keys.nightPost(3)).not.toBe(keys.nightPlayers(3));
  });
});

describe('nightScore', () => {
  const row = (timeMs: number, glitches: number, whispers: number): number =>
    nightScore({ timeMs, glitches, whispers });

  it('ranks the fastest solve first, whatever the Glitches or Whispers', () => {
    expect(row(10_000, 999, 99)).toBeLessThan(row(10_001, 0, 0));
  });

  it('then ranks fewer Glitches, then fewer Whispers, at an equal time', () => {
    expect(row(10_000, 0, 99)).toBeLessThan(row(10_000, 1, 0));
    expect(row(10_000, 1, 1)).toBeLessThan(row(10_000, 1, 2));
  });

  it('round-trips every field for display', () => {
    for (const parts of [
      { timeMs: 0, glitches: 0, whispers: 0 },
      { timeMs: 45_000, glitches: 3, whispers: 2 },
      { timeMs: 9_999_999, glitches: 999, whispers: 99 },
    ]) {
      expect(nightScoreParts(nightScore(parts))).toEqual(parts);
    }
  });

  it('stays integer-safe at its ceiling', () => {
    expect(row(9_999_999, 999, 99)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
