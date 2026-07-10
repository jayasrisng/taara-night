/**
 * The story, read aloud.
 *
 * The browser's own `speechSynthesis` does the speaking, so nothing is recorded
 * and nothing is downloaded. It is also the least dependable API in the game —
 * a device may have no voices at all, may load them a second after the page, and
 * desktop Chrome silently cuts an utterance off after about fifteen seconds. So
 * the story is spoken one sentence at a time, no sentence is ever long enough to
 * be cut, and every path through here ends quietly rather than badly.
 *
 * `pickVoice` and `sentences` are pure, which is where the judgement lives and
 * therefore where the tests are. `browserSpeech` is the only part that touches
 * the platform.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

/** What a Narrator needs of the platform, and no more. */
export interface SpeechAdapter {
  voices(): VoiceLike[];
  /** Speak one chunk. `done` fires on success, on error, and on cancel. */
  speak(text: string, voice: VoiceLike | null, done: () => void): void;
  cancel(): void;
}

/**
 * Voices whose calm is worth crossing a platform for. These are the warm,
 * unhurried default English voices on macOS/iOS, Windows and Android.
 */
const CALM = ['samantha', 'karen', 'moira', 'serena', 'tessa', 'fiona', 'zira', 'aria', 'libby'];

/**
 * Novelty and robot voices. macOS ships a dozen of them and one of them will
 * happily read a bedtime story in a cartoon whisper.
 */
const UNWELCOME = [
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'deranged',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
  'compact',
  'eloquence',
];

function has(name: string, list: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return list.some((entry) => lower.includes(entry));
}

/**
 * The calmest English voice on offer.
 *
 * A local voice is preferred over a network one: it starts instantly and it
 * still works on a train. Returns null when nothing English is installed, which
 * means "let the platform choose" — a Hindi phone reading an English story in a
 * Hindi voice is better than silence.
 */
export function pickVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en') && !has(v.name, UNWELCOME));
  if (english.length === 0) return null;

  const score = (v: VoiceLike): number =>
    (has(v.name, CALM) ? 8 : 0) + (v.localService ? 3 : 0) + (/^en[-_](us|gb)/i.test(v.lang) ? 1 : 0);

  return english.reduce((best, v) => (score(v) > score(best) ? v : best), english[0]!);
}

/**
 * Split a story into speakable chunks.
 *
 * Sentence-sized, because Chrome stops speaking after ~15 seconds of a single
 * utterance and a bedtime myth read slowly is longer than that. The sentence
 * ending stays attached, so the voice keeps its own falling intonation.
 */
export function sentences(story: string): string[] {
  return story
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export class Narrator {
  private adapter: SpeechAdapter | null;
  private queue: string[] = [];
  private onFinish: (() => void) | null = null;
  private active = false;
  private audio: HTMLAudioElement | null = null;
  /** Ids whose recording has already failed to load — no point asking twice. */
  private missing = new Set<string>();

  constructor(adapter: SpeechAdapter | null) {
    this.adapter = adapter;
  }

  /** False on a browser with no voice. The button is then never offered. */
  available(): boolean {
    return this.adapter !== null || typeof Audio !== 'undefined';
  }

  /**
   * Read the story — from its recording when one shipped with the app, and in
   * the browser's own voice when it did not (or when the file fails mid-load,
   * on a bad connection, on a platform that blocks media). The recording is
   * `narration/{id}.mp3` in the client bundle.
   */
  read(id: string | null, story: string, onFinish: () => void): void {
    this.stop();

    if (!id || this.missing.has(id) || typeof Audio === 'undefined') {
      this.speak(story, onFinish);
      return;
    }

    const audio = new Audio(`narration/${id}.mp3`);
    audio.preload = 'auto';
    this.audio = audio;
    this.active = true;
    this.onFinish = onFinish;

    const settle = (): void => {
      if (this.audio !== audio) return;
      this.audio = null;
      const finish = this.onFinish;
      this.active = false;
      this.onFinish = null;
      finish?.();
    };
    const fallBack = (): void => {
      if (this.audio !== audio) return;
      this.missing.add(id);
      this.audio = null;
      this.active = false;
      this.onFinish = null;
      this.speak(story, onFinish);
    };

    audio.onended = settle;
    audio.onerror = fallBack;
    void audio.play().catch(fallBack);
  }

  get speaking(): boolean {
    return this.active;
  }

  /**
   * Read the story. `onFinish` fires exactly once — at the last full stop, on a
   * failure, or when `stop()` interrupts — so a caller can put its button back.
   */
  speak(story: string, onFinish: () => void): void {
    if (!this.adapter) {
      onFinish();
      return;
    }

    this.stop();
    this.queue = sentences(story);
    if (this.queue.length === 0) {
      onFinish();
      return;
    }

    this.onFinish = onFinish;
    this.active = true;
    this.next();
  }

  /** Silence, immediately. Safe to call when nothing is speaking. */
  stop(): void {
    if (this.audio) {
      const audio = this.audio;
      this.audio = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    if (!this.active) return;
    this.active = false;
    this.queue = [];

    const finish = this.onFinish;
    this.onFinish = null;
    this.adapter?.cancel();
    finish?.();
  }

  private next(): void {
    const chunk = this.queue.shift();
    if (!this.adapter || !this.active) return;

    if (chunk === undefined) {
      const finish = this.onFinish;
      this.active = false;
      this.onFinish = null;
      finish?.();
      return;
    }

    const generation = this.onFinish;
    this.adapter.speak(chunk, pickVoice(this.adapter.voices()), () => {
      // A cancelled utterance still reports done; `stop()` has already run.
      if (this.active && this.onFinish === generation) this.next();
    });
  }
}

/** Slow, low and quiet — a voice at the edge of a bed, not on a stage. */
const RATE = 0.82;
const PITCH = 0.95;
const VOLUME = 0.9;

/** `window.speechSynthesis`, when this browser has one that can actually speak. */
export function browserSpeech(): SpeechAdapter | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (typeof SpeechSynthesisUtterance === 'undefined') return null;

  const synth = window.speechSynthesis;
  // Voices load asynchronously on Chrome; asking early is what starts the load.
  synth.getVoices();

  return {
    voices: () => synth.getVoices(),
    speak: (text, voice, done) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = RATE;
      utterance.pitch = PITCH;
      utterance.volume = VOLUME;
      if (voice) {
        const match = synth.getVoices().find((v) => v.name === voice.name && v.lang === voice.lang);
        if (match) utterance.voice = match;
      }

      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        done();
      };
      utterance.onend = settle;
      utterance.onerror = settle;

      synth.speak(utterance);
    },
    cancel: () => synth.cancel(),
  };
}

/** The one voice the game speaks with. */
export const narration = new Narrator(browserSpeech());
