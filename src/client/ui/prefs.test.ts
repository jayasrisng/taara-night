import { describe, expect, it } from 'vitest';
import { Prefs, defaultPrefs, memoryStorage, type PrefStorage } from './prefs';

/** A store that refuses to keep anything, like a browser with storage blocked. */
function hostileStorage(): PrefStorage {
  return {
    read: () => {
      throw new Error('blocked');
    },
    write: () => {
      throw new Error('blocked');
    },
  };
}

describe('defaultPrefs', () => {
  it('starts with sound on and the hints unseen', () => {
    expect(defaultPrefs(false)).toEqual({
      sound: true,
      reducedMotion: false,
      onboarded: false,
      starNames: false,
      storyLanguage: 'en',
    });
  });

  it('takes stillness from the operating system', () => {
    expect(defaultPrefs(true).reducedMotion).toBe(true);
  });
});

describe('Prefs', () => {
  it('remembers what it was told', () => {
    const storage = memoryStorage();
    new Prefs(storage, false).set({ sound: false, onboarded: true, storyLanguage: 'te' });

    const next = new Prefs(storage, false);
    expect(next.sound).toBe(false);
    expect(next.onboarded).toBe(true);
    expect(next.reducedMotion).toBe(false);
    expect(next.storyLanguage).toBe('te');
  });

  it('lets a stored choice override the system preference', () => {
    const storage = memoryStorage();
    new Prefs(storage, true).set({ reducedMotion: false });

    expect(new Prefs(storage, true).reducedMotion).toBe(false);
  });

  it('animates exactly when motion is not reduced', () => {
    expect(new Prefs(memoryStorage(), false).animate).toBe(true);
    expect(new Prefs(memoryStorage(), true).animate).toBe(false);
  });

  it('falls back to the defaults when the stored blob is nonsense', () => {
    for (const raw of ['', 'not json', 'null', '[]', '{"sound":"yes"}']) {
      const prefs = new Prefs({ read: () => raw, write: () => {} }, false);
      expect(prefs.sound).toBe(true);
      expect(prefs.onboarded).toBe(false);
    }
  });

  it('keeps the flags it recognises and ignores the rest', () => {
    const prefs = new Prefs({ read: () => '{"onboarded":true,"volume":3}', write: () => {} }, false);
    expect(prefs.onboarded).toBe(true);
    expect(prefs.sound).toBe(true);
  });

  it('survives a storage that throws on both reads and writes', () => {
    const hostile = new Prefs(hostileStorage(), false);
    expect(hostile.sound).toBe(true);
    expect(() => hostile.set({ onboarded: true })).not.toThrow();
    // The choice still holds for this session, it just does not outlive it.
    expect(hostile.onboarded).toBe(true);
  });
});
