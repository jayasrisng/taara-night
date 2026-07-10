import { describe, expect, it } from 'vitest';
import { ICON_NAMES, iconPaths, type Pt } from './iconPaths';

/** The largest gap between consecutive points — a sampled curve must stay smooth. */
function longestSegment(points: Pt[], closed: boolean): number {
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    longest = Math.max(longest, Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  }
  if (closed && points.length > 1) {
    const a = points[0]!;
    const b = points[points.length - 1]!;
    longest = Math.max(longest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return longest;
}

describe('iconPaths', () => {
  it('covers every name in the set', () => {
    expect(ICON_NAMES).toHaveLength(8);
    for (const name of ICON_NAMES) expect(iconPaths(name).length).toBeGreaterThan(0);
  });

  it('keeps every point inside the unit box', () => {
    for (const name of ICON_NAMES) {
      for (const { points } of iconPaths(name)) {
        for (const p of points) {
          expect(Math.abs(p.x), `${name} x`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(p.y), `${name} y`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('gives every path at least two points', () => {
    for (const name of ICON_NAMES) {
      for (const { points } of iconPaths(name)) expect(points.length, name).toBeGreaterThanOrEqual(2);
    }
  });

  it('samples curves finely enough that no segment reads as a straight edge', () => {
    // The outlines that are all curve. `thread`'s connecting line is meant to be
    // straight, so only its two stars are checked, in its own test below.
    // A 30px icon: 0.12 units is 3.6px, below the eye's threshold for a facet.
    for (const name of ['moon', 'flame'] as const) {
      for (const { points, closed } of iconPaths(name)) {
        expect(longestSegment(points, closed), name).toBeLessThan(0.12);
      }
    }
  });

  it('leaves no doubled vertex where two sampled curves meet', () => {
    for (const name of ICON_NAMES) {
      for (const { points } of iconPaths(name)) {
        for (let i = 1; i < points.length; i++) {
          const gap = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
          expect(gap, `${name} at ${i}`).toBeGreaterThan(1e-9);
        }
      }
    }
  });

  it('draws each icon fresh, so a caller cannot mutate the set', () => {
    const first = iconPaths('check')[0]!;
    first.points[0]!.x = 99;
    expect(iconPaths('check')[0]!.points[0]!.x).toBeCloseTo(-0.4);
  });
});

describe('moon', () => {
  // Path 0 is the companion star; path 1 is the crescent itself.
  it('meets at exactly two horns, so the crescent is an outline and not a wedge', () => {
    const points = iconPaths('moon')[1]!.points;

    // Both arcs are cut at the same two points. If the inner arc missed them the
    // outline would have corners, and more than two points would sit at max x.
    const rightmost = Math.max(...points.map((p) => p.x));
    const horns = points.filter((p) => p.x > rightmost - 1e-9);
    expect(horns).toHaveLength(2);
    expect(horns[0]!.y).toBeCloseTo(-horns[1]!.y, 10);
  });

  it('is symmetric about the x-axis', () => {
    const points = iconPaths('moon')[1]!.points;
    const above = points.filter((p) => p.y < -0.01).length;
    const below = points.filter((p) => p.y > 0.01).length;
    expect(above).toBe(below);
  });

  it('carries its companion star inside the unit box', () => {
    const spark = iconPaths('moon')[0]!;
    expect(spark.closed).toBe(true);
    for (const p of spark.points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('sparkle', () => {
  it('flares four tips on the axes, with curved sides pulled inward', () => {
    const points = iconPaths('sparkle')[0]!.points;
    // The top tip points straight up, at full radius.
    expect(points[0]!.x).toBeCloseTo(0, 5);
    expect(points[0]!.y).toBeCloseTo(-0.5, 5);
    // Every point sits inside the tip radius; the side midpoints dip well in.
    const radii = points.map((p) => Math.hypot(p.x, p.y));
    for (const r of radii) expect(r).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(Math.min(...radii)).toBeLessThan(0.2);
  });
});

describe('thread', () => {
  it('draws its two stars as smooth closed circles', () => {
    for (const star of iconPaths('thread').slice(0, 2)) {
      expect(star.closed).toBe(true);
      expect(longestSegment(star.points, true)).toBeLessThan(0.12);
    }
  });

  it('stops the line short of both stars', () => {
    const paths = iconPaths('thread');
    expect(paths).toHaveLength(3);

    const line = paths[2]!;
    expect(line.closed).toBe(false);
    const [a, b] = line.points as [Pt, Pt];

    // Each end clears its star's 0.1 radius.
    expect(Math.hypot(a.x + 0.32, a.y - 0.3)).toBeGreaterThan(0.1);
    expect(Math.hypot(b.x - 0.32, b.y + 0.3)).toBeGreaterThan(0.1);
  });
});

describe('sound and mute', () => {
  it('share the speaker body exactly', () => {
    expect(iconPaths('sound')[0]).toEqual(iconPaths('mute')[0]);
  });

  it('puts the waves and the cross on the same side of it', () => {
    const waves = iconPaths('sound').slice(1);
    const cross = iconPaths('mute').slice(1);
    for (const { points } of [...waves, ...cross]) {
      for (const p of points) expect(p.x).toBeGreaterThan(0);
    }
  });
});

describe('flame', () => {
  it('comes to a single leaning tip, not a rounded cap', () => {
    const points = iconPaths('flame')[0]!.points;

    const top = Math.min(...points.map((p) => p.y));
    expect(top).toBeCloseTo(-0.5, 5);

    // Exactly one point at the very top: two would mean a flat or rounded crown.
    const atTop = points.filter((p) => p.y < top + 1e-6);
    expect(atTop).toHaveLength(1);
    expect(atTop[0]!.x).toBeGreaterThan(0);
  });

  it('curls the right flank back over the tip — the S that makes it fire', () => {
    const points = iconPaths('flame')[0]!.points;
    const tipIndex = points.findIndex((p) => p.y < -0.5 + 1e-6);
    const tipX = points[tipIndex]!.x;
    const rightFlank = points.slice(0, tipIndex);

    // Out well past the tip on the way up…
    expect(Math.max(...rightFlank.map((p) => p.x))).toBeGreaterThan(0.3);
    // …then back inside it, so the last stretch leans out again to reach it.
    // A convex flank would close on the tip from the right and never do this.
    expect(Math.min(...rightFlank.map((p) => p.x))).toBeLessThan(tipX);
  });

  it('joins each flank to the base without a corner', () => {
    const points = iconPaths('flame')[0]!.points;
    // The shoulders are the only places two different curves meet head-on. A
    // tangent mismatch there shows up as one segment turning much harder than
    // its neighbours, so no interior turn may approach the tip's.
    const turn = (i: number): number => {
      const a = points[(i - 1 + points.length) % points.length]!;
      const b = points[i]!;
      const c = points[(i + 1) % points.length]!;
      const t1 = Math.atan2(b.y - a.y, b.x - a.x);
      const t2 = Math.atan2(c.y - b.y, c.x - b.x);
      return Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
    };

    const tipIndex = points.findIndex((p) => p.y < -0.5 + 1e-6);
    const turns = points.map((_, i) => (i === tipIndex ? 0 : turn(i)));
    expect(Math.max(...turns)).toBeLessThan(0.35);
    expect(turn(tipIndex)).toBeGreaterThan(1);
  });

  it('is wider at the base than at the shoulder', () => {
    const points = iconPaths('flame')[0]!.points;
    const widthNear = (y: number): number => {
      const near = points.filter((p) => Math.abs(p.y - y) < 0.05);
      return Math.max(...near.map((p) => Math.abs(p.x)));
    };
    expect(widthNear(0.25)).toBeGreaterThan(widthNear(-0.25));
  });
});
