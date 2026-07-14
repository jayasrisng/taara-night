/**
 * Sky → screen projection.
 *
 * The constellations are stored as the real catalogue coordinates of their
 * real stars (right ascension in hours, declination in degrees, J2000). This
 * module turns a constellation's stars into the 0–1 box the puzzle draws in.
 *
 * Three things have to be right for a shape to be recognisable:
 *
 *  - **Projection.** A gnomonic (tangent-plane) projection about the
 *    constellation's own centre. Great circles stay straight, which is exactly
 *    what a star chart's stick figure is, and projecting about the constellation
 *    rather than about the celestial equator keeps Draco and Ursa Minor from
 *    smearing across the pole.
 *  - **Orientation.** North up, east *left* — the sky as you see it lying on
 *    your back, not as a globe seen from outside. Betelgeuse must land upper
 *    left of Rigel, or Orion is inside out.
 *  - **Aspect.** One scale for both axes. Stretching Orion to fill a square
 *    would make him a stranger.
 */

/** A star's place on the celestial sphere (J2000). */
export interface SkyCoord {
  /** Right ascension, in hours (0–24). */
  ra: number;
  /** Declination, in degrees (−90–+90). */
  dec: number;
}

/** A point in the puzzle's 0–1 box. */
export interface BoxPoint {
  x: number;
  y: number;
}

type Vec3 = [number, number, number];

const DEG = Math.PI / 180;
const HOURS_TO_DEG = 15;

/** Fraction of the box left empty on every side. */
export const DEFAULT_PADDING = 0.08;

function unitVector({ ra, dec }: SkyCoord): Vec3 {
  const a = ra * HOURS_TO_DEG * DEG;
  const d = dec * DEG;
  const cd = Math.cos(d);
  return [cd * Math.cos(a), cd * Math.sin(a), Math.sin(d)];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) throw new Error('Cannot normalize a zero vector');
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Rounded so the baked positions are identical on every JavaScript engine.
 * `Math.sin`/`Math.cos` are allowed to disagree in the last bit between
 * engines; four decimals is ~0.03% of the box, far finer than a star's glow and
 * far coarser than any such disagreement.
 */
function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** The mean direction of a group of stars — the point we project about. */
export function skyCentroid(coords: readonly SkyCoord[]): SkyCoord {
  if (coords.length === 0) throw new Error('Cannot take the centroid of no stars');
  const sum: Vec3 = [0, 0, 0];
  for (const coord of coords) {
    const u = unitVector(coord);
    sum[0] += u[0];
    sum[1] += u[1];
    sum[2] += u[2];
  }
  const c = normalize(sum);
  const dec = Math.asin(c[2]) / DEG;
  let ra = Math.atan2(c[1], c[0]) / DEG / HOURS_TO_DEG;
  if (ra < 0) ra += 24;
  return { ra: round4(ra), dec: round4(dec) };
}

/**
 * Project a constellation's stars into the 0–1 box: north up, east left, one
 * scale for both axes, centred, with `padding` of the box left clear on every
 * side. Pure and deterministic.
 */
export function projectToBox(coords: readonly SkyCoord[], padding = DEFAULT_PADDING): BoxPoint[] {
  return projectIntoBox(coords, coords, padding);
}

/**
 * Project extra sky coordinates through the exact frame established by a
 * constellation's catalogue stars. This is how historical artwork anchors are
 * registered to the same box as the playable figure without changing its
 * centre, scale, or orientation.
 */
export function projectIntoBox(
  reference: readonly SkyCoord[],
  coords: readonly SkyCoord[],
  padding = DEFAULT_PADDING
): BoxPoint[] {
  if (reference.length === 0 || coords.length === 0) return [];

  const stars = reference.map(unitVector);
  const targets = coords.map(unitVector);
  const centre = normalize(
    stars.reduce<Vec3>((acc, u) => [acc[0] + u[0], acc[1] + u[1], acc[2] + u[2]], [0, 0, 0])
  );

  // East is the direction of increasing RA at the tangent point. Straight over
  // a pole that direction is undefined, so fall back to any perpendicular axis.
  const towardsPole: Vec3 = [0, 0, 1];
  let east = cross(towardsPole, centre);
  if (Math.hypot(east[0], east[1], east[2]) < 1e-9) east = [1, 0, 0];
  east = normalize(east);
  const north = cross(centre, east);

  // Gnomonic: divide by the along-axis component, so great circles stay lines.
  const plane = stars.map((u) => {
    const along = dot(u, centre);
    return { east: dot(u, east) / along, north: dot(u, north) / along };
  });

  // Screen axes: x grows west (east is left), y grows south (north is up).
  const raw = plane.map((p) => ({ x: -p.east, y: -p.north }));
  const targetRaw = targets.map((u) => {
    const along = dot(u, centre);
    return { x: -dot(u, east) / along, y: -dot(u, north) / along };
  });

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // One scale for both axes: the longer side fills the padded box, the shorter
  // one keeps its true proportion and sits centred.
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const scale = (1 - 2 * padding) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return targetRaw.map((p) => ({
    x: round4(0.5 + (p.x - cx) * scale),
    y: round4(0.5 + (p.y - cy) * scale),
  }));
}
