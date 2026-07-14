/**
 * The sound of a dark-sky site, synthesised.
 *
 * Nothing here is a file. Wind is a band of seeded brown noise breathing under
 * two slow gusts; the crickets are struck sine tones, sparse enough that the
 * silence between them is the point; a thread drawn between two stars is a
 * falling-star swish. TaaraNight therefore ships no licensed audio (Devvit
 * Rules: original or licensed assets only) and costs a player on mobile data
 * nothing at all to hear.
 *
 * Browsers refuse to make a sound before the player has touched the page, so the
 * `AudioContext` is not created until `unlock()` is called from a real gesture.
 * Every method is safe to call before that, and on a browser with no Web Audio
 * at all: the game simply stays quiet.
 *
 * The graph is `sources → master (the mute toggle) → destination`.
 *
 * Volumes are deliberately low. This is meant to sit under a bedtime, not to be
 * noticed.
 */

import { mulberry32 } from '../../shared/rng';
import { prefs } from '../ui/prefs';

/** A soft, unresolved scale — nothing in it ever sounds like an answer. */
const PENTATONIC = [0, 3, 5, 7, 10, 12];
const ROOT_HZ = 261.63; // middle C

const WIND_GAIN = 0.042;
const GUST_GAIN = 0.095;
const CRICKET_GAIN = 0.022;
const SWISH_GAIN = 0.16;
const CHIME_GAIN = 0.045;
const REVEAL_GAIN = 0.08;

const FADE_S = 0.6;
const WIND_SEED = 0x7aa2;
const HISS_SEED = 0x51e9;
const CRICKET_SEED = 0x2c17;

/** Two crickets, a little apart in pitch and in the field. */
const CRICKETS = [
  { hz: 4380, pan: -0.45 },
  { hz: 4820, pan: 0.5 },
] as const;

function semitone(root: number, steps: number): number {
  return root * Math.pow(2, steps / 12);
}

/**
 * Seconds of silence before the next cricket calls. A dark-sky site is mostly
 * quiet; the gap is what makes the chirp feel far away rather than caged.
 */
export function cricketGap(rng: () => number): number {
  return 5 + rng() * 11;
}

/** Chirps in one call. Real crickets repeat themselves two or three times. */
export function chirpsPerCall(rng: () => number): number {
  return 2 + Math.floor(rng() * 3);
}

/**
 * A looping noise buffer with no seam.
 *
 * `brown` integrates the white noise into the low rumble a wind actually has.
 * Either way the tail is cross-faded back into the head, because a buffer that
 * loops from an arbitrary sample to a different arbitrary sample clicks once
 * every pass — and a click every eight seconds is exactly the kind of thing a
 * person half asleep will hear.
 */
function noiseLoop(ctx: BaseAudioContext, seconds: number, seed: number, brown: boolean): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const overlap = Math.floor(ctx.sampleRate * 0.25);

  const raw = new Float32Array(length + overlap);
  const rng = mulberry32(seed);
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = rng() * 2 - 1;
    if (!brown) {
      raw[i] = white;
      continue;
    }
    last = (last + 0.02 * white) / 1.02;
    raw[i] = last * 3.2;
  }

  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  samples.set(raw.subarray(0, length));
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap;
    samples[i] = raw[i]! * t + raw[length + i]! * (1 - t);
  }

  // Integrated noise wanders off zero; a DC offset costs headroom and nothing else.
  let mean = 0;
  for (let i = 0; i < length; i++) mean += samples[i]!;
  mean /= length;
  for (let i = 0; i < length; i++) samples[i] = samples[i]! - mean;

  return buffer;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Called from the player's first touch. Before a gesture an `AudioContext` is
   * born suspended and any sound scheduled on it is lost, so this is where the
   * night starts breathing.
   */
  unlock(): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  /** The mute toggle. Turning sound on for the first time also starts the wind. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.unlock();
      this.fade(this.master, 1, FADE_S);
    } else {
      this.fade(this.master, 0, FADE_S);
    }
  }

  /**
   * A thread lands: a star falls across the sky. Filtered noise sweeping down
   * from a starting brightness that climbs with each thread drawn, so the sound
   * of progress is still progress — under it, one quiet bell up a pentatonic
   * scale, the last of the old chimes.
   */
  connect(step: number): void {
    const ctx = this.live();
    const master = this.master;
    if (!ctx || !master || !this.white) return;

    const start = ctx.currentTime + 0.01;
    const seconds = 0.55;
    const top = 2200 * Math.pow(1.06, Math.min(step, 8));

    const source = ctx.createBufferSource();
    source.buffer = this.white;
    // A different stretch of noise each time, but the same stretch every night.
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(top, start);
    band.frequency.exponentialRampToValueAtTime(520, start + seconds);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(SWISH_GAIN, start + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

    source.connect(band).connect(gain).connect(master);
    source.start(start, (step * 0.37) % 1.5);
    source.stop(start + seconds + 0.02);
    source.onended = (): void => {
      source.disconnect();
      gain.disconnect();
    };

    const note = PENTATONIC[step % PENTATONIC.length]!;
    const octave = Math.floor(step / PENTATONIC.length);
    this.bell(semitone(ROOT_HZ, note + octave * 12), CHIME_GAIN, 1.4);
  }

  /** The constellation completes: a slow arpeggio, warmer than the swish. */
  reveal(): void {
    const ctx = this.live();
    if (!ctx) return;

    const now = ctx.currentTime;
    [0, 7, 12, 19].forEach((note, i) => {
      this.bell(semitone(ROOT_HZ, note), REVEAL_GAIN, 2.6, now + i * 0.16);
    });
  }

  /* ---------------------------------------------------------------- *
   *  Plumbing
   * ---------------------------------------------------------------- */

  /** The context, once the player has allowed one. Null when sound is off. */
  private live(): AudioContext | null {
    if (!this.enabled) return null;
    return this.ctx;
  }

  /** Build the context and the night, once. */
  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;

    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);

    this.white = noiseLoop(ctx, 2, HISS_SEED, false);

    this.buildWind(ctx, this.master);
    this.scheduleCrickets(mulberry32(CRICKET_SEED));

    return ctx;
  }

  /**
   * Wind over open ground: a low bed, and above it a band of air that swells and
   * falls away.
   *
   * The two layers are two different noises on purpose. Brown noise falls 6 dB
   * an octave, so a gust taken from it lands more than 20 dB under its own bed —
   * inaudible on a phone speaker, which has no bass to play the bed with either.
   * The gust is therefore white noise, filtered, and it is the layer a player on
   * a phone actually hears as wind.
   *
   * The two gusts run at rates that share no common period, so the night never
   * repeats a breath — a single LFO would tick like a metronome.
   */
  private buildWind(ctx: AudioContext, out: GainNode): void {
    const bedSource = ctx.createBufferSource();
    bedSource.buffer = noiseLoop(ctx, 8, WIND_SEED, true);
    bedSource.loop = true;

    const bed = ctx.createBiquadFilter();
    bed.type = 'lowpass';
    bed.frequency.value = 320;
    bed.Q.value = 0.2;

    const bedGain = ctx.createGain();
    bedGain.gain.value = WIND_GAIN;
    bedSource.connect(bed).connect(bedGain).connect(out);

    const airSource = ctx.createBufferSource();
    airSource.buffer = noiseLoop(ctx, 6, HISS_SEED, false);
    airSource.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 650;
    band.Q.value = 0.55;

    // A bandpass skirt only falls 6 dB an octave, which leaves white noise
    // plainly audible up where the crickets sing. Wind, not static.
    const tame = ctx.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 1600;
    tame.Q.value = 0.5;

    const gustGain = ctx.createGain();
    gustGain.gain.value = GUST_GAIN * 0.5;
    airSource.connect(band).connect(tame).connect(gustGain).connect(out);

    for (const [rate, depth] of [
      [0.037, GUST_GAIN * 0.26],
      [0.061, GUST_GAIN * 0.2],
    ] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      lfo.connect(amount).connect(gustGain.gain);
      lfo.start();
    }

    // The band drifts too, or every gust is the same colour.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.021;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 260;
    sweep.connect(sweepDepth).connect(band.frequency);
    sweep.start();

    bedSource.start();
    airSource.start();
  }

  /**
   * One cricket calls, two or three times, then the field is quiet for five to
   * sixteen seconds. The chain keeps its own clock so the density stays what it
   * was even while the game is muted — unmuting lands you in the same night
   * everyone else is in, rather than in a sudden burst of insects.
   */
  private scheduleCrickets(rng: () => number): void {
    const next = (): void => {
      const chirps = chirpsPerCall(rng);
      const cricket = CRICKETS[Math.floor(rng() * CRICKETS.length)]!;

      const ctx = this.live();
      if (ctx) {
        const start = ctx.currentTime + 0.05;
        for (let i = 0; i < chirps; i++) this.chirp(start + i * 0.36, cricket.hz, cricket.pan);
      }

      window.setTimeout(next, cricketGap(rng) * 1000);
    };

    window.setTimeout(next, 2000 + cricketGap(rng) * 500);
  }

  /** A chirp is not a tone but a fast train of them: four pulses, then nothing. */
  private chirp(at: number, hz: number, pan: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const pulses = 4;
    const pulse = 0.011;
    const rest = 0.009;
    const seconds = pulses * (pulse + rest);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    for (let i = 0; i < pulses; i++) {
      const t = at + i * (pulse + rest);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(CRICKET_GAIN, t + 0.004);
      gain.gain.linearRampToValueAtTime(0, t + pulse);
    }

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = hz;
    band.Q.value = 6;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;

    const tail = gain.connect(band);
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      tail.connect(panner).connect(master);
    } else {
      tail.connect(master);
    }

    osc.connect(gain);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
    osc.onended = (): void => {
      osc.disconnect();
      gain.disconnect();
      band.disconnect();
    };
  }

  /** A struck sine with a long tail, plus a whisper of its own octave. */
  private bell(hz: number, peak: number, seconds: number, at?: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const start = at ?? ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    gain.connect(master);

    for (const [multiple, level] of [
      [1, 1],
      [2, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz * multiple;

      const partial = ctx.createGain();
      partial.gain.value = level;

      osc.connect(partial).connect(gain);
      osc.start(start);
      osc.stop(start + seconds + 0.05);
      osc.onended = (): void => osc.disconnect();
    }

    window.setTimeout(() => gain.disconnect(), (start - ctx.currentTime + seconds + 0.2) * 1000);
  }

  private fade(node: GainNode | null, to: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !node) return;

    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(to, now + seconds);
  }
}

/** The one night the whole game listens to. */
export const ambience = new Ambience(prefs.sound);

/** Flip the sound preference and the sound itself together. */
export function setSound(on: boolean): void {
  prefs.set({ sound: on });
  ambience.setEnabled(on);
}
