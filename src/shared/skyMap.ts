/**
 * The whole sky on one page.
 *
 * `projection.ts` projects one constellation into its own 0–1 puzzle box. This
 * module does the opposite job: it lays *every* constellation down together, at
 * its true place on the celestial sphere, so My Sky can be one continuous dome
 * rather than a grid of thumbnails.
 *
 * **Equirectangular (plate carrée), north up.** The chart every atlas page
 * uses: right ascension runs along x, declination along y, so every
 * constellation on the map looks exactly like it does in its own puzzle box and
 * on every reference chart — no rotation, no mirror. The price is the one all
 * cylindrical charts pay: figures near the celestial poles stretch sideways.
 * With all 88 constellations aboard (σ Octantis sits 1° from the south pole)
 * this is the projection that keeps each shape *recognisable*, which is the
 * dome's whole job.
 *
 * **North is up. East is left**, as in the puzzle: increasing declination moves
 * a star up the screen, increasing right ascension moves it left. A
 * constellation that straddles 0h (Pisces, Pegasus) is unwrapped around its own
 * mean, so it never tears across the chart's seam.
 *
 * Map space: 1 unit = 90° of declination. y runs −1 (north pole) to +1 (south
 * pole); x runs 0 (0h) to −4 (24h), east to the left.
 */

import type { Connection, Constellation } from './constellations';
import { loadConstellations } from './constellationLoader';
import type { SkyCoord } from './projection';
import { hashSeed, mulberry32 } from './rng';

const DEG = Math.PI / 180;
const HOURS_TO_DEG = 15;

/** The southernmost declination the chart reaches: the south celestial pole itself. */
export const SKY_EDGE_DEC = -90;

/** Map units per degree: 90° of declination spans one unit. */
const UNITS_PER_DEG = 1 / 90;

/** A point on the dome. The pole is (0, 0); the rim is at radius 1. y grows south on screen. */
export interface MapPoint {
  x: number;
  y: number;
}

/** As in `projection.ts`: four decimals is far finer than a star's glow and immune to engine drift. */
function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** Where a parallel of declination sits on the chart, in map units of y. */
export function yForDec(dec: number): number {
  return -dec * UNITS_PER_DEG;
}

/** Where an hour circle of right ascension sits on the chart, in map units of x. */
export function xForRa(ra: number): number {
  return -ra * HOURS_TO_DEG * UNITS_PER_DEG;
}

/** Place one catalogue coordinate on the chart. North up, east left. */
export function projectSky({ ra, dec }: SkyCoord): MapPoint {
  return { x: round4(xForRa(ra)), y: round4(yForDec(dec)) };
}

/**
 * Project beside a particular figure rather than blindly onto the 0h seam.
 * Pisces and other seam-crossing constellations unwrap their playable stars;
 * their illustration anchors must make the identical wrap or the art tears
 * four whole map units away from its stars.
 */
export function projectSkyNear(coord: SkyCoord, nearX: number): MapPoint {
  const point = projectSky(coord);
  return { ...point, x: round4(point.x + Math.round((nearX - point.x) / 4) * 4) };
}

/** One constellation, laid down on the dome among all the others. */
export interface SkyFigure {
  id: string;
  name: string;
  /** Its stars, in the order `connections` indexes them. */
  points: MapPoint[];
  /** Each star's designation, aligned with `points`. */
  starNames: string[];
  connections: readonly Connection[];
  /** The mean of its stars — where a label hangs and where the view centres. */
  centre: MapPoint;
  /** Distance from `centre` to its furthest star, in map units. */
  radius: number;
}

function toFigure(constellation: Constellation): SkyFigure {
  // Circular mean of the figure's right ascensions, so a figure that straddles
  // 0h (Pisces, Pegasus) is drawn whole rather than torn across the seam.
  let sx = 0;
  let sy = 0;
  for (const star of constellation.stars) {
    const angle = star.ra * HOURS_TO_DEG * DEG;
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
  let meanRa = Math.atan2(sy, sx) / DEG / HOURS_TO_DEG;
  if (meanRa < 0) meanRa += 24;
  const points = constellation.stars.map((star) => {
    let ra = star.ra;
    if (ra - meanRa > 12) ra -= 24;
    if (meanRa - ra > 12) ra += 24;
    return projectSky({ ra, dec: star.dec });
  });

  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  const centre = { x: round4(sumX / points.length), y: round4(sumY / points.length) };
  const radius = Math.max(...points.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));

  return {
    id: constellation.id,
    name: constellation.name,
    points,
    starNames: constellation.stars.map((star) => star.star),
    connections: constellation.connections,
    centre,
    radius: round4(radius),
  };
}

/** Every constellation in the dataset, in dataset order, placed on the dome. */
export const SKY_FIGURES: readonly SkyFigure[] = loadConstellations().constellations.map(toFigure);

/** A rectangle of map space. */
export interface MapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centre: MapPoint;
  width: number;
  height: number;
}

function boundsOf(points: readonly MapPoint[]): MapBounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * The rectangle the constellations actually occupy — not the whole disc.
 *
 * Our nineteen skies are a northern set: Polaris sits at the pole and Scorpius'
 * tail is the only thing that reaches far south, so the outer half of the disc
 * holds nothing but dust. A "whole sky" view frames *this*, and the empty rim
 * stays where it belongs, out past the edge of the screen.
 */
export const SKY_BOUNDS: MapBounds = boundsOf(SKY_FIGURES.flatMap((figure) => figure.points));

/** The star nearest a point, across every figure — the dome's hit test. */
export interface FigureHit {
  figure: SkyFigure;
  starIndex: number;
  distance: number;
}

/**
 * Nearest star wins, so two constellations that brush against each other still
 * resolve cleanly. `maxDistance` is in map units; the caller converts from the
 * tap tolerance it wants on screen.
 */
export function nearestStar(
  figures: readonly SkyFigure[],
  point: MapPoint,
  maxDistance: number
): FigureHit | null {
  let hit: FigureHit | null = null;

  for (const figure of figures) {
    figure.points.forEach((star, starIndex) => {
      const distance = Math.hypot(star.x - point.x, star.y - point.y);
      if (distance > maxDistance) return;
      if (!hit || distance < hit.distance) hit = { figure, starIndex, distance };
    });
  }

  return hit;
}

/** A star that belongs to no constellation — the dust that makes the dome a sky. */
export interface FieldStar extends MapPoint {
  /** 0 (barely there) to 1 (bright). */
  magnitude: number;
}

/** Kept this far from every real star, so a field star is never mistaken for one. */
const FIELD_MIN_GAP = 0.014;
/** Rejection sampling can never hang: past this many tries the last draw stands. */
const FIELD_ATTEMPTS = 16;

/**
 * Scatter anonymous stars across the chart, evenly over the *chart* rather than
 * the sphere — a paper chart's dust fills its page. Seeded, so everyone's sky
 * has the same dust in the same places.
 */
export function fieldStars(count: number, seed: number): FieldStar[] {
  const rng = mulberry32(hashSeed(count, seed));
  const real = SKY_FIGURES.flatMap((figure) => figure.points);

  const stars: FieldStar[] = [];

  for (let i = 0; i < count; i++) {
    let point: MapPoint = { x: 0, y: 0 };

    for (let attempt = 0; attempt < FIELD_ATTEMPTS; attempt++) {
      const dec = -90 + rng() * 180;
      point = projectSky({ ra: rng() * 24, dec });
      if (real.every((star) => Math.hypot(point.x - star.x, point.y - star.y) >= FIELD_MIN_GAP)) break;
    }

    // Squared, so most of the dust is faint and a few grains carry the eye.
    stars.push({ ...point, magnitude: round4(rng() ** 2) });
  }

  return stars;
}
