/**
 * The night, in tokens.
 *
 * Every colour, size, space and radius in TaaraNight comes from here. A scene
 * that reaches for a hex literal or a stray `13px` is a scene that will drift
 * away from the rest of the game the next time someone edits it.
 *
 * **One hue for the night.** The whole dark palette sits at ~233° — the same
 * indigo, lightened step by step. Surfaces that touch each other therefore never
 * disagree about what colour "dark blue" is, and the sky can carry a card
 * without either looking pasted on.
 *
 * **One hue for the warmth.** All four warm steps sit at 42°, from the near-white
 * of a drawn thread down to the amber of a burning Jwala. There is no second
 * accent: gold is what the game praises you with, and a palette that praises with
 * two colours praises with none.
 *
 * The two exceptions are deliberate and both mean something the player must read
 * instantly: `glitch` is cold cyan because a decoy is *wrong in the other
 * direction*, and `wrong` is rose because a bad thread has to feel like a bad
 * thread. They are the only colours in the game that oppose the palette, which is
 * exactly why they work.
 */

/** A token as the `'#rrggbb'` string Phaser's `Text` styles insist on. */
export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/**
 * A token part-way to another token. `t` runs 0 (all `from`) to 1 (all `to`).
 *
 * Channels are blended separately — interpolating packed integers directly would
 * let a falling blue bleed into a rising green. `ui/motion` walks `t` along a
 * curve to turn this into the cross-fade every surface in the game repaints with.
 */
export function mixColor(from: number, to: number, t: number): number {
  const amount = Math.max(0, Math.min(1, t));
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * amount) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

export const color = {
  /* ---- the night, dark to light (hue ≈ 233°) ---- */

  /** Vignettes, scrims, the dimming behind a reveal. Almost black. */
  void: 0x03040c,
  /** The top of the sky gradient. */
  skyTop: 0x05060f,
  /** Behind the canvas itself, on the rare frame the sky has not painted yet. */
  canvas: 0x070b1f,
  /** A modal card — the story, the tutorial. */
  card: 0x0e1430,
  /** The bottom of the sky gradient. */
  skyBottom: 0x161a3e,
  /** Any resting surface over the sky: pills, difficulty cards. */
  surface: 0x1a2048,
  surfaceHover: 0x232a58,
  surfacePress: 0x272e60,
  /** A tab that is showing, a toggle that is on. */
  surfaceActive: 0x2d3570,
  /** Hairlines: dividers, the dome's parallels. */
  line: 0x2b3268,

  /* ---- the one warm accent, bright to deep (hue 42°) ---- */

  /** A thread the player has drawn, and the light along it. */
  accentBright: 0xf6ecd8,
  /** The accent proper: borders, captions worth reading, Whispers. Champagne. */
  accent: 0xe8cf9e,
  /** Its halo — glows, strokes, the shadow under warm type. */
  accentGlow: 0xd4b276,
  /** The deepest step. The Jwala flame, and nothing else. */
  accentDeep: 0xbf9a55,

  /* ---- starlight ---- */

  /** The body of a star. Warm white, so it is never mistaken for a UI surface. */
  starCore: 0xfff6e0,
  /** The halo around one. */
  starGlow: 0xc2c9ff,
  /** The glow under cool type, and the moon's own corona. */
  starlight: 0x8a97ff,
  /** The moon. */
  moon: 0xf4f1ff,
  /** Dust across the dome — the stars that belong to no constellation. */
  dust: 0xccd1ff,
  /** A star in a constellation not yet revealed. Present, anonymous. */
  sleeping: 0x949bd1,
  /** Easy's guide line. */
  outline: 0x727ab6,

  /* ---- the two colours that mean something ---- */

  /** A Glitch, shimmering cold. The one cool note in a warm game. */
  glitch: 0x7ff0ff,
  /** A thread that does not belong. */
  wrong: 0xff8f9a,

  /* ---- type ---- */

  textBright: 0xf5f3ff,
  textBody: 0xe2e6ff,
  textMuted: 0xa7b0da,
  textFaint: 0x7883b0,
} as const;

/** The same colours, pre-stringified for `Text` styles. */
export const ink = {
  bright: hex(color.textBright),
  body: hex(color.textBody),
  muted: hex(color.textMuted),
  faint: hex(color.textFaint),
  accent: hex(color.accent),
  accentDeep: hex(color.accentDeep),
} as const;

export const font = {
  /** Titles, stories, anything the player is meant to slow down for. */
  serif: 'Fraunces, Georgia, "Times New Roman", serif',
  /** Labels, numbers, anything the player is meant to read at a glance. */
  sans: 'Inter, Arial, Helvetica, sans-serif',
} as const;

/**
 * The numeric scales widen to `number` rather than freezing as literal types.
 * `as const` would give `space.xs` the type `4`, and `let y = space.xs` would
 * then refuse the `y += …` that every layout flow in this game is built from.
 */
type Scale<K extends string> = Readonly<Record<K, number>>;

/**
 * A ~1.18 scale anchored on 15px body. Fluid headings clamp *between* two steps
 * rather than inventing a third.
 */
export const typeScale: Scale<
  'micro' | 'caption' | 'body' | 'lead' | 'title' | 'heading' | 'display' | 'hero' | 'giant'
> = {
  micro: 11,
  caption: 13,
  body: 15,
  lead: 17,
  title: 20,
  heading: 24,
  display: 28,
  /** The Jwala numeral. */
  hero: 40,
  /** The wordmark, on a screen with room for it. */
  giant: 54,
};

/** A 4/8 scale. Nothing in the game is spaced by a number that is not here. */
export const space: Scale<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/**
 * The one border weight in the game, in CSS px.
 *
 * A pill, a difficulty card and a story card are all the same idea at three
 * sizes, and a card that outlines itself twice as heavily as a pill does not
 * read as more important — only as more drawn. Line-work (threads, outlines,
 * the dome's parallels) is not chrome and sets its own weight.
 */
export const hairline = 1;

export const radius: Scale<'card' | 'modal'> = {
  /** A card sitting in the sky. */
  card: 18,
  /** A card sitting over everything. */
  modal: 22,
};

/**
 * The three heights a control is allowed to be. All three are tapped at 44 CSS
 * px regardless — `pressable` grows the hit area behind the paint — so `sm` is a
 * paint size, not a touch size.
 */
export const control: Scale<'sm' | 'md' | 'lg'> = {
  /** Settings toggles, the night badge. Quiet, out of the way. */
  sm: 32,
  /** The default: Back, Whisper, tabs, story buttons. */
  md: 40,
  /** The one action a screen is really offering. */
  lg: 44,
};

export const alpha: Scale<
  'fill' | 'card' | 'stroke' | 'strokeStrong' | 'border' | 'disabled' | 'veil' | 'scrim'
> = {
  /** A surface over the sky. Never opaque — the stars show through. */
  fill: 0.9,
  /** A modal card. Nearly opaque, because the story must be read. */
  card: 0.96,
  /** A resting edge. */
  stroke: 0.4,
  /** An edge under a finger, or around something that is on. */
  strokeStrong: 0.85,
  /** A card's warm rim. */
  border: 0.55,
  /** A control with nothing left to do. */
  disabled: 0.45,
  /** The sky, dimmed behind a reveal. */
  veil: 0.5,
  /** The sky, hidden behind a modal. */
  scrim: 0.72,
};

/**
 * Blur radii for `Text.setShadow` — the only glow the type is allowed.
 *
 * A `Text` shadow has no alpha of its own: the blur radius is the *whole*
 * control, and past about a third of the cap height the halo stops reading as
 * light on the letter and starts reading as fog behind it. Both steps were
 * pulled in for that reason. Glow is a rim, never an atmosphere.
 */
export const glow: Scale<'soft' | 'strong'> = {
  soft: 10,
  strong: 14,
};
