/**
 * The three things TaaraNight remembers about a player between nights: whether
 * the sky should sing, whether it should move, and whether it has already
 * explained itself once.
 *
 * These are *comfort* settings, not game state — the night, the streak and the
 * collection all live in Redis under a Reddit name. A player with no name still
 * deserves a muted sky, so they are kept in `localStorage` and never travel to
 * the server.
 *
 * A Devvit web view is a sandboxed iframe, and a browser that has blocked
 * storage there throws on the first `setItem` rather than returning null. So the
 * store is probed once and quietly falls back to memory: the settings then last
 * for the session instead of forever, which is a far smaller loss than a crash
 * on the way into the game.
 */

const KEY = 'taara.prefs.v1';

export interface PrefsState {
  /** Ambient night sound and its gentle chimes. */
  sound: boolean;
  /** Stillness: no drifting, shaking, or shooting stars. Fades remain. */
  reducedMotion: boolean;
  /** True once the opening three hints have been read. */
  onboarded: boolean;
  /** Label the real stars with their designations, where it cannot spoil. */
  starNames: boolean;
  /** The reader's last selected story language. */
  storyLanguage: 'en' | 'te';
}

export interface PrefStorage {
  read(): string | null;
  write(value: string): void;
}

const FLAGS = ['sound', 'reducedMotion', 'onboarded', 'starNames'] as const;

/** Sound on, motion as the operating system asks, hints not yet seen. */
export function defaultPrefs(systemReducedMotion: boolean): PrefsState {
  return {
    sound: true,
    reducedMotion: systemReducedMotion,
    onboarded: false,
    starNames: false,
    storyLanguage: 'en',
  };
}

/** Read whatever of a stored blob still looks like a preference. */
function parse(raw: string | null): Partial<PrefsState> {
  if (!raw) return {};

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null) return {};

  const record = value as Record<string, unknown>;
  const out: Partial<PrefsState> = {};
  for (const flag of FLAGS) {
    if (typeof record[flag] === 'boolean') out[flag] = record[flag];
  }
  if (record.storyLanguage === 'en' || record.storyLanguage === 'te') {
    out.storyLanguage = record.storyLanguage;
  }
  return out;
}

export class Prefs {
  private state: PrefsState;

  constructor(
    private readonly storage: PrefStorage,
    systemReducedMotion: boolean
  ) {
    let stored: string | null = null;
    try {
      stored = storage.read();
    } catch {
      // Reading can throw for the same reasons writing can.
    }
    this.state = { ...defaultPrefs(systemReducedMotion), ...parse(stored) };
  }

  get sound(): boolean {
    return this.state.sound;
  }

  get reducedMotion(): boolean {
    return this.state.reducedMotion;
  }

  get onboarded(): boolean {
    return this.state.onboarded;
  }

  get starNames(): boolean {
    return this.state.starNames;
  }

  get storyLanguage(): 'en' | 'te' {
    return this.state.storyLanguage;
  }

  /** True when the scene may move things around. Fades are always allowed. */
  get animate(): boolean {
    return !this.state.reducedMotion;
  }

  set(patch: Partial<PrefsState>): void {
    this.state = { ...this.state, ...patch };
    try {
      this.storage.write(JSON.stringify(this.state));
    } catch {
      // A full or hostile store is not worth a broken bedtime.
    }
  }
}

export function memoryStorage(): PrefStorage {
  let value: string | null = null;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
  };
}

/** `localStorage`, if this frame is actually allowed to write to it. */
function browserStorage(): PrefStorage {
  if (typeof window === 'undefined') return memoryStorage();
  try {
    const probe = `${KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    return memoryStorage();
  }

  return {
    read: () => window.localStorage.getItem(KEY),
    write: (value) => window.localStorage.setItem(KEY, value),
  };
}

function systemReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The one set of preferences the game reads. */
export const prefs = new Prefs(browserStorage(), systemReducedMotion());
