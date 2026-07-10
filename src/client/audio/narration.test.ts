import { describe, expect, it, vi } from 'vitest';
import { Narrator, pickVoice, sentences, type SpeechAdapter, type VoiceLike } from './narration';

function voice(name: string, lang = 'en-US', localService = true): VoiceLike {
  return { name, lang, localService };
}

/** Speaks nothing; hands back each chunk and lets the test decide when it ends. */
function fakeAdapter(voices: VoiceLike[] = []): SpeechAdapter & {
  spoken: string[];
  used: (VoiceLike | null)[];
  cancelled: number;
  finishOne(): void;
} {
  const pending: (() => void)[] = [];
  return {
    spoken: [],
    used: [],
    cancelled: 0,
    voices: () => voices,
    speak(text, chosen, done) {
      this.spoken.push(text);
      this.used.push(chosen);
      pending.push(done);
    },
    cancel() {
      this.cancelled++;
      const waiting = pending.splice(0);
      // A cancelled utterance still reports that it ended.
      for (const done of waiting) done();
    },
    finishOne() {
      pending.shift()?.();
    },
  };
}

describe('pickVoice', () => {
  it('has no opinion when nothing is installed', () => {
    expect(pickVoice([])).toBeNull();
  });

  it('ignores voices that do not speak English', () => {
    expect(pickVoice([voice('Lekha', 'hi-IN')])).toBeNull();
  });

  it('prefers a known calm voice over the first one offered', () => {
    const calm = voice('Samantha');
    expect(pickVoice([voice('Alex'), calm, voice('Victoria')])).toBe(calm);
  });

  it('prefers a local voice to a network one', () => {
    const local = voice('Alex', 'en-US', true);
    expect(pickVoice([voice('Google US English', 'en-US', false), local])).toBe(local);
  });

  it('never reads a bedtime story in a novelty voice', () => {
    expect(pickVoice([voice('Zarvox'), voice('Bad News'), voice('Whisper')])).toBeNull();
  });

  it('falls back to any English voice when none is on the calm list', () => {
    const only = voice('Rishi', 'en-IN');
    expect(pickVoice([only])).toBe(only);
  });
});

describe('sentences', () => {
  it('keeps each sentence and its full stop', () => {
    expect(sentences('The bear sleeps. The sky turns! Does it? Yes…')).toEqual([
      'The bear sleeps.',
      'The sky turns!',
      'Does it?',
      'Yes…',
    ]);
  });

  it('drops empty fragments', () => {
    expect(sentences('  Rest.   \n\n  ')).toEqual(['Rest.']);
  });

  it('gives back a story with no punctuation whole', () => {
    expect(sentences('a quiet night')).toEqual(['a quiet night']);
  });
});

describe('Narrator', () => {
  it('is unavailable, and finishes at once, with no platform voice', () => {
    const narrator = new Narrator(null);
    const done = vi.fn();

    expect(narrator.available()).toBe(false);
    narrator.speak('The bear sleeps.', done);
    expect(done).toHaveBeenCalledOnce();
    expect(narrator.speaking).toBe(false);
  });

  it('speaks one sentence at a time and finishes after the last', () => {
    const adapter = fakeAdapter([voice('Samantha')]);
    const narrator = new Narrator(adapter);
    const done = vi.fn();

    narrator.speak('One. Two.', done);
    expect(adapter.spoken).toEqual(['One.']);
    expect(narrator.speaking).toBe(true);

    adapter.finishOne();
    expect(adapter.spoken).toEqual(['One.', 'Two.']);
    expect(done).not.toHaveBeenCalled();

    adapter.finishOne();
    expect(done).toHaveBeenCalledOnce();
    expect(narrator.speaking).toBe(false);
  });

  it('speaks in the voice it picked', () => {
    const calm = voice('Samantha');
    const adapter = fakeAdapter([voice('Alex'), calm]);
    new Narrator(adapter).speak('One.', vi.fn());
    expect(adapter.used).toEqual([calm]);
  });

  it('stops mid-story, finishing once and speaking no further', () => {
    const adapter = fakeAdapter();
    const narrator = new Narrator(adapter);
    const done = vi.fn();

    narrator.speak('One. Two. Three.', done);
    narrator.stop();

    expect(narrator.speaking).toBe(false);
    expect(adapter.cancelled).toBe(1);
    expect(done).toHaveBeenCalledOnce();
    expect(adapter.spoken).toEqual(['One.']);
  });

  it('does nothing when stopped while silent', () => {
    const adapter = fakeAdapter();
    new Narrator(adapter).stop();
    expect(adapter.cancelled).toBe(0);
  });

  it('finishes the story it abandons when a new one starts', () => {
    const adapter = fakeAdapter();
    const narrator = new Narrator(adapter);
    const first = vi.fn();
    const second = vi.fn();

    narrator.speak('One. Two.', first);
    narrator.speak('Three.', second);

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(adapter.spoken).toEqual(['One.', 'Three.']);

    adapter.finishOne();
    expect(second).toHaveBeenCalledOnce();
  });

  it('finishes at once on a story with nothing in it', () => {
    const adapter = fakeAdapter();
    const done = vi.fn();
    new Narrator(adapter).speak('   ', done);
    expect(done).toHaveBeenCalledOnce();
    expect(adapter.spoken).toEqual([]);
  });
});

describe('read (recorded narration)', () => {
  it('falls back to the adapter when no Audio exists (node, blocked media)', () => {
    const spoken: string[] = [];
    let finished = 0;
    const narrator = new Narrator({
      voices: () => [],
      speak: (text, _voice, done) => {
        spoken.push(text);
        done();
      },
      cancel: () => undefined,
    });
    narrator.read('orion', 'One. Two.', () => finished++);
    expect(spoken).toEqual(['One.', 'Two.']);
    expect(finished).toBe(1);
  });

  it('still finishes with neither a recording nor an adapter', () => {
    let finished = 0;
    const narrator = new Narrator(null);
    narrator.read(null, 'One.', () => finished++);
    expect(finished).toBe(1);
  });
});
