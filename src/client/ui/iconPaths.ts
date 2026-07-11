/**
 * The icon set, as pure geometry.
 *
 * TaaraNight used to label its buttons with emoji. An emoji is drawn by the
 * platform, not by us: it arrives in someone else's colours, at someone else's
 * weight, and on a device whose font lacks it, as a white box. So every icon in
 * the game is a polyline we generate ourselves, stroked in a palette token.
 *
 * Each icon is a list of paths in a **unit box** — every coordinate inside
 * ±0.5, origin at the centre — so `ui/icons.ts` can scale one to any size. Only
 * outlines: no fills, no gradients. Curves are sampled here rather than handed
 * to Phaser's `arc`, because Phaser's canvas and WebGL renderers disagree about
 * how a multi-arc path joins up, and a polyline cannot disagree with anyone.
 *
 * Phaser-free on purpose, so the shapes can be tested.
 */

export interface Pt {
  x: number;
  y: number;
}

/** One stroke. `closed` joins the last point back to the first. */
export interface IconPath {
  points: Pt[];
  closed: boolean;
}

export type IconName = 'moon' | 'sparkle' | 'sound' | 'mute' | 'thread' | 'flame' | 'check' | 'star' | 'comment' | 'share';

/** Points along a circular arc, `steps` segments from `from` to `to` (radians, y down). */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return points;
}

/**
 * Points along a cubic Bézier from `a` to `b`.
 *
 * Two controls, not one: a quadratic's single control sets the tangent at both
 * ends at once, and the flame needs to bulge outwards low down *and* come to a
 * near-vertical point at the top.
 */
function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt, steps: number): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    points.push({
      x: w[0]! * a.x + w[1]! * c1.x + w[2]! * c2.x + w[3]! * b.x,
      y: w[0]! * a.y + w[1]! * c1.y + w[2]! * c2.y + w[3]! * b.y,
    });
  }
  return points;
}

const TAU = Math.PI * 2;

/** A closed circle: `steps` points, and no duplicate where it comes back round. */
function circle(cx: number, cy: number, r: number, steps: number): Pt[] {
  return arc(cx, cy, r, 0, TAU, steps).slice(0, -1);
}

/**
 * Chain sampled curves into one outline, dropping the seams.
 *
 * Two curves that meet share an endpoint, so each piece after the first starts
 * on a point the previous piece already ended on. A doubled vertex is a
 * zero-length segment, which is nothing to stroke and something to trip over.
 */
function chain(...pieces: Pt[][]): Pt[] {
  return pieces.flatMap((piece, i) => (i === 0 ? piece : piece.slice(1)));
}

/**
 * A crescent: two circular arcs meeting at the horns.
 *
 * The outer arc is a circle of radius `R` about the origin, cut at ±`TIP`. The
 * inner arc has to pass through those same two horns — otherwise the shape has
 * corners — while bulging only as far as `WAIST`, which is what sets the
 * crescent's thickness. One unknown, one equation: put the inner centre at `c`
 * on the x-axis, and `(c - WAIST)² = (cos TIP - c)² + sin² TIP` solves for it.
 */
function moon(): IconPath[] {
  const R = 0.42;
  const TIP = (55 * Math.PI) / 180;
  /** How far left the inner arc reaches, in units of `R`. Less ⇒ fatter moon. */
  const WAIST = -0.15;

  const tx = Math.cos(TIP);
  const c = (1 - WAIST * WAIST) / (2 * (tx - WAIST));
  const innerR = c - WAIST;
  // Where the horns sit on the inner circle, seen from its own centre.
  const horn = Math.atan2(Math.sin(TIP), tx - c);

  // A tiny companion star in the crescent's embrace — the night's own logo mark.
  const spark: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 0.13 : 0.045;
    const angle = (i * TAU) / 8 - Math.PI / 2;
    spark.push({ x: 0.28 + Math.cos(angle) * r, y: -0.22 + Math.sin(angle) * r });
  }

  return [
    { points: spark, closed: true },
    {
      points: chain(
        // Top horn, around the far side, to the bottom horn…
        arc(0, 0, R, TIP, TAU - TIP, 24),
        // …then back up the inner edge. Both ends land on a horn, so the two
        // arcs share their endpoints and the outline closes without a seam.
        arc(c * R, 0, innerR * R, TAU - horn, horn, 20)
      ).slice(0, -1),
      closed: true,
    },
  ];
}

/** A four-pointed star: sharp tips on the axes, deep valleys on the diagonals. */
function sparkle(): IconPath[] {
  // Each side is a curve pulled *inward*, so the four points flare like a real
  // glint of light instead of a flat paper star.
  const TIP = 0.5;
  const PULL = 0.075;
  const tips: Pt[] = [0, 1, 2, 3].map((i) => {
    const angle = (i * TAU) / 4 - Math.PI / 2;
    return { x: Math.cos(angle) * TIP, y: Math.sin(angle) * TIP };
  });
  const pieces: Pt[][] = [];
  for (let i = 0; i < 4; i++) {
    const a = tips[i]!;
    const b = tips[(i + 1) % 4]!;
    const inward = { x: ((a.x + b.x) / 2) * (PULL / TIP) * 2, y: ((a.y + b.y) / 2) * (PULL / TIP) * 2 };
    pieces.push(cubic(a, inward, inward, b, 7));
  }
  return [{ points: chain(...pieces).slice(0, -1), closed: true }];
}

/** A five-pointed star, point up — the star-names toggle. */
function star(): IconPath[] {
  // Five points whose sides bow gently inward — closer to a drawn star than a
  // cookie cutter. Valleys sit on the same circle a classic pentagram uses.
  const TIP = 0.5;
  const VALLEY = 0.2;
  const nodes: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? TIP : VALLEY;
    const angle = (i * TAU) / 10 - Math.PI / 2;
    nodes.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  const pieces: Pt[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % 10]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const pull = 0.92; // a whisper of concavity, not a caltrop
    const control = { x: mid.x * pull, y: mid.y * pull };
    pieces.push(cubic(a, control, control, b, 4));
  }
  return [{ points: chain(...pieces).slice(0, -1), closed: true }];
}

/** A speech bubble: the auto-comment share. */
function comment(): IconPath[] {
  const r = 0.14;
  const body = chain(
    arc(-0.36 + r, -0.34 + r, r, Math.PI, Math.PI * 1.5, 5),
    arc(0.44 - r, -0.34 + r, r, Math.PI * 1.5, TAU, 5),
    arc(0.44 - r, 0.18 - r, r, 0, Math.PI * 0.5, 5),
    [
      { x: 0.44 - r, y: 0.18 },
      { x: -0.06, y: 0.18 },
      { x: -0.2, y: 0.4 },
      { x: -0.18, y: 0.18 },
    ],
    arc(-0.36 + r, 0.18 - r, r, Math.PI * 0.5, Math.PI, 5)
  ).slice(0, -1);
  return [{ points: body, closed: true }];
}

/** An arrow lifting out of a tray: copy it anywhere. */
function share(): IconPath[] {
  return [
    {
      points: [
        { x: -0.34, y: 0.06 },
        { x: -0.34, y: 0.4 },
        { x: 0.34, y: 0.4 },
        { x: 0.34, y: 0.06 },
      ],
      closed: false,
    },
    {
      points: [
        { x: 0, y: 0.16 },
        { x: 0, y: -0.42 },
      ],
      closed: false,
    },
    {
      points: [
        { x: -0.16, y: -0.24 },
        { x: 0, y: -0.42 },
        { x: 0.16, y: -0.24 },
      ],
      closed: false,
    },
  ];
}

/** The speaker body both sound icons are built on. */
function speaker(): IconPath {
  return {
    points: [
      { x: -0.44, y: -0.14 },
      { x: -0.22, y: -0.14 },
      { x: 0.0, y: -0.42 },
      { x: 0.0, y: 0.42 },
      { x: -0.22, y: 0.14 },
      { x: -0.44, y: 0.14 },
    ],
    closed: true,
  };
}

/** Speaker, with two arcs of sound coming off it. */
function sound(): IconPath[] {
  const spread = (50 * Math.PI) / 180;
  return [
    speaker(),
    { points: arc(0.02, 0, 0.22, -spread, spread, 10), closed: false },
    { points: arc(0.02, 0, 0.4, -spread, spread, 12), closed: false },
  ];
}

/** Speaker, crossed out. The X sits where the sound arcs would have been. */
function mute(): IconPath[] {
  return [
    speaker(),
    {
      points: [
        { x: 0.14, y: -0.17 },
        { x: 0.42, y: 0.17 },
      ],
      closed: false,
    },
    {
      points: [
        { x: 0.14, y: 0.17 },
        { x: 0.42, y: -0.17 },
      ],
      closed: false,
    },
  ];
}

/**
 * Two stars and the thread between them — the game's verb, drawn.
 *
 * The thread stops short of both stars rather than running under them, the same
 * way a drawn thread in `Play` reads as *joining* two lights, not skewering them.
 */
function thread(): IconPath[] {
  const a = { x: -0.32, y: 0.3 };
  const b = { x: 0.32, y: -0.3 };
  const dot = 0.1;
  const clear = dot + 0.05;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;

  return [
    { points: circle(a.x, a.y, dot, 16), closed: true },
    { points: circle(b.x, b.y, dot, 16), closed: true },
    {
      points: [
        { x: a.x + ux * clear, y: a.y + uy * clear },
        { x: b.x - ux * clear, y: b.y - uy * clear },
      ],
      closed: false,
    },
  ];
}

/**
 * The Jwala flame: a round base, two flanks, and a tip that leans.
 *
 * Three things separate a flame from a teardrop, and it needs all three.
 *
 * *The shoulders sit below the base circle's equator.* A side leaving above the
 * widest point can only curve inwards, and a smooth join there forces a pear.
 * Below it, the circle's own tangent already points up and out, so the flank
 * can bulge — and `c1` is placed *along that tangent* so the two curves meet
 * without a corner.
 *
 * *The flanks are not mirror images.* The right one bulges out and then cuts
 * back across its own chord (`c2` past the axis) into an S; the left one is a
 * single wide sweep. Two convex flanks are a raindrop, whichever way they lean.
 *
 * *The tip is a corner, not a cap.* Both flanks arrive at it steeply and from
 * opposite sides, so the outline comes to a point instead of rounding over.
 */
function flame(): IconPath[] {
  const base = { x: 0, y: 0.17, r: 0.3 };
  const tip = { x: 0.1, y: -0.5 };
  /** Below the equator, measured downwards. */
  const shoulder = (30 * Math.PI) / 180;
  /** How far each flank runs along the base's tangent before it turns. */
  const bulgeRight = 0.42;
  const bulgeLeft = 0.5;

  const right = { x: Math.cos(shoulder) * base.r, y: base.y + Math.sin(shoulder) * base.r };
  const left = { x: -right.x, y: right.y };
  const tangent = { x: Math.sin(shoulder), y: -Math.cos(shoulder) };

  return [
    {
      points: chain(
        cubic(
          right,
          { x: right.x + tangent.x * bulgeRight, y: right.y + tangent.y * bulgeRight },
          { x: -0.02, y: -0.28 }, // left of the chord: the lick curls over
          tip,
          18
        ),
        cubic(
          tip,
          { x: tip.x - 0.07, y: -0.28 },
          { x: left.x - tangent.x * bulgeLeft, y: left.y + tangent.y * bulgeLeft },
          left,
          18
        ),
        // Round the bottom: from the left shoulder, under the base, to the right.
        arc(base.x, base.y, base.r, Math.PI - shoulder, shoulder, 20)
      ).slice(0, -1),
      closed: true,
    },
  ];
}

/** A tick. Short arm down, long arm up. */
function check(): IconPath[] {
  return [
    {
      points: [
        { x: -0.4, y: 0.02 },
        { x: -0.11, y: 0.32 },
        { x: 0.42, y: -0.32 },
      ],
      closed: false,
    },
  ];
}

const BUILDERS: Readonly<Record<IconName, () => IconPath[]>> = {
  moon,
  sparkle,
  sound,
  mute,
  thread,
  flame,
  check,
  star,
  comment,
  share,
};

/** The paths for one icon, in the unit box. Rebuilt per call; callers scale them. */
export function iconPaths(name: IconName): IconPath[] {
  return BUILDERS[name]();
}

export const ICON_NAMES = Object.keys(BUILDERS) as IconName[];
