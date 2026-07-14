import { describe, it, expect } from 'vitest';
import { loadConstellations, getConstellationById } from './constellationLoader';
import {
  SKY_BOUNDS,
  SKY_EDGE_DEC,
  SKY_FIGURES,
  fieldStars,
  nearestStar,
  projectSky,
  projectSkyNear,
  xForRa,
  yForDec,
  type MapPoint,
} from './skyMap';

function starOf(constellationId: string, name: string): MapPoint {
  const constellation = getConstellationById(constellationId);
  const star = constellation?.stars.find((s) => s.star === name);
  if (!star) throw new Error(`No star ${name} in ${constellationId}`);
  return projectSky(star);
}

describe('yForDec / xForRa', () => {
  it('puts the north pole a unit above the equator and the south a unit below', () => {
    expect(yForDec(90)).toBe(-1);
    expect(yForDec(0)).toBeCloseTo(0, 10);
    expect(yForDec(SKY_EDGE_DEC)).toBe(1);
  });

  it('runs east to the left: growing right ascension lowers x', () => {
    expect(xForRa(6)).toBeLessThan(xForRa(0));
    expect(xForRa(24)).toBeCloseTo(-4, 10);
  });

  it('falls monotonically as declination climbs', () => {
    for (let dec = -89; dec < 90; dec += 1) {
      expect(yForDec(dec + 1)).toBeLessThan(yForDec(dec));
    }
  });
});

describe('projectSky', () => {
  it('leaves Polaris all but on the pole parallel', () => {
    expect(Math.abs(starOf('ursa-minor', 'Polaris').y - -1)).toBeLessThan(0.01);
  });

  it('rounds to four decimals, so every engine agrees', () => {
    const point = projectSky({ ra: 5.9195, dec: 7.407 });
    expect(point.x).toBe(Math.round(point.x * 1e4) / 1e4);
    expect(point.y).toBe(Math.round(point.y * 1e4) / 1e4);
  });

  it('is deterministic', () => {
    expect(projectSky({ ra: 13.7923, dec: 49.3133 })).toEqual(projectSky({ ra: 13.7923, dec: 49.3133 }));
  });

  it('unwraps Pisces artwork anchors beside Pisces instead of across the 0h seam', () => {
    const pisces = SKY_FIGURES.find((figure) => figure.id === 'pisces')!;
    const westOfMidnight = projectSkyNear({ ra: 23.7, dec: 3 }, pisces.centre.x);
    const eastOfMidnight = projectSkyNear({ ra: 0.3, dec: 3 }, pisces.centre.x);
    expect(Math.abs(westOfMidnight.x - eastOfMidnight.x)).toBeLessThan(0.2);
    expect(Math.abs(westOfMidnight.x - pisces.centre.x)).toBeLessThan(2);
  });

  // North up, east left — everywhere, which is the whole point of the chart.
  it('puts north up and east left', () => {
    const here = projectSky({ ra: 6, dec: 0 });
    const north = projectSky({ ra: 6, dec: 1 });
    const east = projectSky({ ra: 6.1, dec: 0 });

    expect(north.y).toBeLessThan(here.y);
    expect(Math.abs(north.x - here.x)).toBeLessThan(1e-3);
    expect(east.x).toBeLessThan(here.x);
  });

  it('stands Orion up the way the sky does — Betelgeuse above and left of Rigel', () => {
    const betelgeuse = starOf('orion', 'Betelgeuse');
    const rigel = starOf('orion', 'Rigel');

    expect(betelgeuse.x).toBeLessThan(rigel.x);
    expect(betelgeuse.y).toBeLessThan(rigel.y);
  });

  it('keeps every star in the dataset on the chart', () => {
    for (const constellation of loadConstellations().constellations) {
      for (const star of constellation.stars) {
        const p = projectSky(star);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
        expect(p.x).toBeLessThanOrEqual(0.0001);
        expect(p.x).toBeGreaterThanOrEqual(-4);
      }
    }
  });
});

describe('SKY_FIGURES', () => {
  it('lays down every constellation, star for star', () => {
    const dataset = loadConstellations().constellations;
    expect(SKY_FIGURES).toHaveLength(dataset.length);

    SKY_FIGURES.forEach((figure, index) => {
      const constellation = dataset[index]!;
      expect(figure.id).toBe(constellation.id);
      expect(figure.points).toHaveLength(constellation.stars.length);
      expect(figure.connections).toBe(constellation.connections);
    });
  });

  it('gives each figure a centre on the chart and a radius that covers its stars', () => {
    for (const figure of SKY_FIGURES) {
      expect(Math.abs(figure.centre.y)).toBeLessThan(1);
      expect(figure.radius).toBeGreaterThan(0);

      for (const point of figure.points) {
        const spread = Math.hypot(point.x - figure.centre.x, point.y - figure.centre.y);
        expect(spread).toBeLessThanOrEqual(figure.radius + 1e-4);
      }
    }
  });

  // Orion is 82° of right ascension around the pole from Cassiopeia. If the dome
  // ever collapsed to a single tangent plane, these would land on top of each other.
  it('separates constellations that are far apart in the sky', () => {
    const orion = SKY_FIGURES.find((f) => f.id === 'orion')!;
    const cassiopeia = SKY_FIGURES.find((f) => f.id === 'cassiopeia')!;
    const apart = Math.hypot(orion.centre.x - cassiopeia.centre.x, orion.centre.y - cassiopeia.centre.y);

    expect(apart).toBeGreaterThan(orion.radius + cassiopeia.radius);
  });
});

describe('SKY_BOUNDS', () => {
  it('encloses every star and nothing more', () => {
    const points = SKY_FIGURES.flatMap((figure) => figure.points);

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(SKY_BOUNDS.minX);
      expect(point.x).toBeLessThanOrEqual(SKY_BOUNDS.maxX);
      expect(point.y).toBeGreaterThanOrEqual(SKY_BOUNDS.minY);
      expect(point.y).toBeLessThanOrEqual(SKY_BOUNDS.maxY);
    }

    expect(Math.min(...points.map((p) => p.x))).toBe(SKY_BOUNDS.minX);
    expect(Math.max(...points.map((p) => p.y))).toBe(SKY_BOUNDS.maxY);
  });

  it('spans the full chart: 24 hours across, pole to pole', () => {
    expect(SKY_BOUNDS.width).toBeGreaterThan(3.5);
    // A hair over 24h: figures that straddle 0h are unwrapped past the seam.
    expect(SKY_BOUNDS.width).toBeLessThanOrEqual(4.6);
    expect(SKY_BOUNDS.height).toBeLessThanOrEqual(2);
  });

  it('contains the celestial equator', () => {
    expect(SKY_BOUNDS.minY).toBeLessThan(0);
    expect(SKY_BOUNDS.maxY).toBeGreaterThan(0);
    expect(SKY_BOUNDS.minY).toBeLessThan(0);
    expect(SKY_BOUNDS.maxY).toBeGreaterThan(0);
  });
});

describe('nearestStar', () => {
  it('finds the star under a point, and names the constellation it belongs to', () => {
    const rigel = starOf('orion', 'Rigel');
    const hit = nearestStar(SKY_FIGURES, { x: rigel.x + 0.002, y: rigel.y - 0.001 }, 0.02);

    expect(hit?.figure.id).toBe('orion');
    expect(hit?.figure.points[hit.starIndex]).toEqual(rigel);
  });

  it('returns nothing when the nearest star is out of reach', () => {
    const rigel = starOf('orion', 'Rigel');
    expect(nearestStar(SKY_FIGURES, { x: rigel.x + 0.05, y: rigel.y }, 0.02)).toBeNull();
  });

  it('prefers the closer of two neighbouring stars', () => {
    const orion = SKY_FIGURES.find((f) => f.id === 'orion')!;
    const [first, second] = [orion.points[0]!, orion.points[1]!];
    const nudged = { x: first.x + (second.x - first.x) * 0.2, y: first.y + (second.y - first.y) * 0.2 };

    expect(nearestStar(SKY_FIGURES, nudged, 1)?.starIndex).toBe(0);
  });
});

describe('fieldStars', () => {
  it('is the same sky for everyone', () => {
    expect(fieldStars(60, 7)).toEqual(fieldStars(60, 7));
    expect(fieldStars(60, 8)).not.toEqual(fieldStars(60, 7));
  });

  it('draws the count it was asked for, on the chart', () => {
    const stars = fieldStars(240, 7);
    expect(stars).toHaveLength(240);

    for (const star of stars) {
      expect(Math.abs(star.y)).toBeLessThanOrEqual(1);
      expect(star.magnitude).toBeGreaterThanOrEqual(0);
      expect(star.magnitude).toBeLessThanOrEqual(1);
    }
  });

  it('never crowds a real star', () => {
    const real = SKY_FIGURES.flatMap((figure) => figure.points);
    for (const star of fieldStars(240, 7)) {
      const nearest = Math.min(...real.map((r) => Math.hypot(star.x - r.x, star.y - r.y)));
      expect(nearest).toBeGreaterThanOrEqual(0.014);
    }
  });
});
