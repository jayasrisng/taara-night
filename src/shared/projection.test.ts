/**
 * Tests for the sky → box projection: orientation, aspect and the box fit.
 *
 * Orientation is the one that silently ruins constellations, so it is pinned
 * against stars whose place in the sky everyone can check: Betelgeuse is above
 * and left of Rigel; the Big Dipper's handle trails east of its bowl.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_PADDING, projectIntoBox, projectToBox, skyCentroid, type SkyCoord } from './projection';

const BETELGEUSE: SkyCoord = { ra: 5.9195, dec: 7.4071 };
const RIGEL: SkyCoord = { ra: 5.2423, dec: -8.2016 };
const DUBHE: SkyCoord = { ra: 11.0621, dec: 61.7508 };
const ALKAID: SkyCoord = { ra: 13.7923, dec: 49.3133 };

describe('projectToBox: orientation', () => {
  it('puts north up: the higher declination gets the smaller y', () => {
    const [north, south] = projectToBox([
      { ra: 6, dec: 20 },
      { ra: 6, dec: -20 },
    ]);
    expect(north!.y).toBeLessThan(south!.y);
  });

  it('puts east left: the greater right ascension gets the smaller x', () => {
    const [east, west] = projectToBox([
      { ra: 7, dec: 0 },
      { ra: 5, dec: 0 },
    ]);
    expect(east!.x).toBeLessThan(west!.x);
  });

  it('places Betelgeuse above and left of Rigel, as Orion is seen', () => {
    const [betelgeuse, rigel] = projectToBox([BETELGEUSE, RIGEL]);
    expect(betelgeuse!.x).toBeLessThan(rigel!.x);
    expect(betelgeuse!.y).toBeLessThan(rigel!.y);
  });

  it("trails the Big Dipper's handle east of its bowl", () => {
    const [dubhe, alkaid] = projectToBox([DUBHE, ALKAID]);
    expect(alkaid!.x).toBeLessThan(dubhe!.x);
  });

  it('projects across RA 0h the short way round', () => {
    const [west, east] = projectToBox([
      { ra: 23.5, dec: 20 },
      { ra: 0.5, dec: 20 },
    ]);
    // Going 23.5h → 0.5h crosses midnight *eastward*, so 0.5h lands on the left.
    expect(east!.x).toBeLessThan(west!.x);
    expect([west!, east!].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('projects about the constellation, so a near-polar shape stays intact', () => {
    // Polaris and Kochab are 15° apart but 130° apart in RA. About the pole a
    // naive RA/Dec plot smears them; about their own centre it must not.
    const points = projectToBox([
      { ra: 2.5303, dec: 89.2641 },
      { ra: 14.8451, dec: 74.1556 },
    ]);
    expect(points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
  });
});

describe('projectToBox: fit', () => {
  it('fills the padded box along the longer axis and centres both', () => {
    const points = projectToBox([
      { ra: 6, dec: 20 },
      { ra: 6, dec: -20 },
    ]);
    expect(points[0]!.y).toBeCloseTo(DEFAULT_PADDING, 3);
    expect(points[1]!.y).toBeCloseTo(1 - DEFAULT_PADDING, 3);
    expect(points[0]!.x).toBeCloseTo(0.5, 3);
  });

  it('keeps one scale for both axes, so shapes are not stretched', () => {
    // A right triangle twice as tall as it is wide must stay twice as tall.
    const [a, b, c] = projectToBox([
      { ra: 6, dec: 0 },
      { ra: 6, dec: 10 },
      { ra: 5.66, dec: 0 }, // ~5° east–west at dec 0
    ]);
    const height = Math.abs(b!.y - a!.y);
    const width = Math.abs(c!.x - a!.x);
    expect(height / width).toBeGreaterThan(1.9);
    expect(height / width).toBeLessThan(2.1);
  });

  it('keeps every point inside the 0–1 box', () => {
    const points = projectToBox([BETELGEUSE, RIGEL, DUBHE, { ra: 5.6, dec: -1.2 }]);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic and rounded, so the same sky bakes the same numbers', () => {
    const once = projectToBox([BETELGEUSE, RIGEL]);
    const twice = projectToBox([BETELGEUSE, RIGEL]);
    expect(once).toEqual(twice);
    for (const p of once) {
      expect(p.x).toBe(Math.round(p.x * 1e4) / 1e4);
      expect(p.y).toBe(Math.round(p.y * 1e4) / 1e4);
    }
  });

  it('returns nothing for no stars', () => {
    expect(projectToBox([])).toEqual([]);
  });
});

describe('projectIntoBox', () => {
  it('uses the playable stars as its frame when projecting artwork anchors', () => {
    const stars = [BETELGEUSE, RIGEL, { ra: 5.6, dec: -1.2 }];
    expect(projectIntoBox(stars, stars)).toEqual(projectToBox(stars));
    const [anchor] = projectIntoBox(stars, [{ ra: 5.5, dec: 0 }]);
    expect(anchor!.x).toBeGreaterThan(0);
    expect(anchor!.x).toBeLessThan(1);
  });
});

describe('skyCentroid', () => {
  it('averages on the sphere, not in RA, so 23h and 1h meet at midnight', () => {
    const centre = skyCentroid([
      { ra: 23, dec: 0 },
      { ra: 1, dec: 0 },
    ]);
    expect(centre.ra).toBeCloseTo(0, 3);
    expect(centre.dec).toBeCloseTo(0, 3);
  });

  it('reports a right ascension in 0–24 and a declination in ±90', () => {
    const centre = skyCentroid([BETELGEUSE, RIGEL, DUBHE, ALKAID]);
    expect(centre.ra).toBeGreaterThanOrEqual(0);
    expect(centre.ra).toBeLessThan(24);
    expect(Math.abs(centre.dec)).toBeLessThanOrEqual(90);
  });

  it('throws rather than inventing a centre for no stars', () => {
    expect(() => skyCentroid([])).toThrow();
  });
});
