/**
 * Constellation data types for TaaraNight
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Star {
  /** X position, normalized to 0-1 range */
  x: number;
  /** Y position, normalized to 0-1 range */
  y: number;
  /** Right ascension of the real star, in hours (J2000) */
  ra: number;
  /** Declination of the real star, in degrees (J2000) */
  dec: number;
  /** The star's designation, e.g. "Polaris" or "ζ UMi" */
  star: string;
}

export interface Connection {
  /** Index of the first star in the stars array */
  from: number;
  /** Index of the second star in the stars array */
  to: number;
}

export interface LocalizedStory {
  /** Translated display title from the approved manuscript. */
  title: string;
  /** Approved translated bedtime story. */
  story: string;
  /** Approved translated astronomy fact. */
  fact: string;
}

export interface Constellation {
  /** Unique identifier */
  id: string;
  /** Latin name of the constellation, e.g. "Ursa Minor" */
  name: string;
  /** English meaning, e.g. "The Little Bear" */
  meaning: string;
  /** Star positions, projected from `ra`/`dec` into the 0–1 box */
  stars: Star[];
  /** Connections between stars (by index) */
  connections: Connection[];
  /** Difficulty level */
  difficulty: Difficulty;
  /** Bedtime story/myth (3-5 sentences, calming tone) */
  story: string;
  /** Additive translations; the existing English fields above remain canonical and unchanged. */
  localized: {
    te: LocalizedStory;
  };
}

export interface ConstellationDataset {
  constellations: Constellation[];
}
