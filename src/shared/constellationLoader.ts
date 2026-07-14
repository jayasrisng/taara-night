/**
 * Constellation data loader with validation
 */

import type { Constellation, Difficulty, ConstellationDataset, Star } from './constellations';
import { CONSTELLATION_DATA } from './constellationData';

export class ConstellationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConstellationValidationError';
  }
}

/**
 * Validates a single star: the box position it is drawn at, and the celestial
 * coordinates that position was derived from.
 */
function validateStar(star: Star, constellationId: string, starIndex: number): void {
  if (typeof star.x !== 'number' || typeof star.y !== 'number') {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, star ${starIndex}: x and y must be numbers`
    );
  }
  if (star.x < 0 || star.x > 1 || star.y < 0 || star.y > 1) {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, star ${starIndex}: coordinates must be in range [0, 1]. Got x=${star.x}, y=${star.y}`
    );
  }
  if (!star.star || typeof star.star !== 'string') {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, star ${starIndex}: must name the real star`
    );
  }
  if (typeof star.ra !== 'number' || star.ra < 0 || star.ra >= 24) {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, star ${starIndex}: right ascension must be in [0, 24) hours. Got ${star.ra}`
    );
  }
  if (typeof star.dec !== 'number' || star.dec < -90 || star.dec > 90) {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, star ${starIndex}: declination must be in [-90, 90] degrees. Got ${star.dec}`
    );
  }
}

/**
 * Validates a single connection
 */
function validateConnection(
  connection: { from: number; to: number },
  starCount: number,
  constellationId: string,
  connIndex: number
): void {
  if (typeof connection.from !== 'number' || typeof connection.to !== 'number') {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, connection ${connIndex}: from and to must be numbers`
    );
  }
  if (connection.from < 0 || connection.from >= starCount) {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, connection ${connIndex}: 'from' index ${connection.from} out of range [0, ${starCount - 1}]`
    );
  }
  if (connection.to < 0 || connection.to >= starCount) {
    throw new ConstellationValidationError(
      `Constellation ${constellationId}, connection ${connIndex}: 'to' index ${connection.to} out of range [0, ${starCount - 1}]`
    );
  }
}

/**
 * Validates a single constellation
 */
function validateConstellation(constellation: Constellation): void {
  // Check required fields
  if (!constellation.id || typeof constellation.id !== 'string') {
    throw new ConstellationValidationError(`Constellation missing or invalid id`);
  }
  if (!constellation.name || typeof constellation.name !== 'string') {
    throw new ConstellationValidationError(`Constellation ${constellation.id}: missing or invalid name`);
  }
  if (!['easy', 'medium', 'hard'].includes(constellation.difficulty)) {
    throw new ConstellationValidationError(
      `Constellation ${constellation.id}: difficulty must be 'easy', 'medium', or 'hard'`
    );
  }
  if (!constellation.story || typeof constellation.story !== 'string' || constellation.story.trim().length === 0) {
    throw new ConstellationValidationError(`Constellation ${constellation.id}: story must be a non-empty string`);
  }
  const telugu = constellation.localized?.te;
  if (
    !telugu ||
    !telugu.title.trim() ||
    !telugu.story.trim() ||
    !telugu.fact.trim()
  ) {
    throw new ConstellationValidationError(
      `Constellation ${constellation.id}: Telugu title, story, and fact must all be non-empty`
    );
  }

  // Check stars
  if (!Array.isArray(constellation.stars) || constellation.stars.length === 0) {
    throw new ConstellationValidationError(`Constellation ${constellation.id}: must have at least one star`);
  }
  constellation.stars.forEach((star, idx) => validateStar(star, constellation.id, idx));

  // Check connections
  if (!Array.isArray(constellation.connections) || constellation.connections.length === 0) {
    throw new ConstellationValidationError(`Constellation ${constellation.id}: must have at least one connection`);
  }
  constellation.connections.forEach((conn, idx) =>
    validateConnection(conn, constellation.stars.length, constellation.id, idx)
  );
}

/**
 * Validates the entire constellation dataset
 */
function validateDataset(dataset: ConstellationDataset): void {
  if (!dataset.constellations || !Array.isArray(dataset.constellations)) {
    throw new ConstellationValidationError('Dataset must have a constellations array');
  }

  if (dataset.constellations.length === 0) {
    throw new ConstellationValidationError('Dataset must have at least one constellation');
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  dataset.constellations.forEach((constellation) => {
    if (ids.has(constellation.id)) {
      throw new ConstellationValidationError(`Duplicate constellation id: ${constellation.id}`);
    }
    ids.add(constellation.id);
  });

  // Validate each constellation
  dataset.constellations.forEach(validateConstellation);
}

/**
 * Loads and validates the constellation dataset
 */
export function loadConstellations(): ConstellationDataset {
  validateDataset(CONSTELLATION_DATA);
  return CONSTELLATION_DATA;
}

/**
 * Gets a constellation by ID
 */
export function getConstellationById(id: string): Constellation | undefined {
  return CONSTELLATION_DATA.constellations.find((c) => c.id === id);
}

/**
 * Gets all constellations of a given difficulty
 */
export function getConstellationsByDifficulty(difficulty: Difficulty): Constellation[] {
  return CONSTELLATION_DATA.constellations.filter((c) => c.difficulty === difficulty);
}

/**
 * Gets a random constellation (using a seed for determinism)
 */
export function getConstellationByIndex(index: number): Constellation {
  const count = CONSTELLATION_DATA.constellations.length;
  const normalizedIndex = ((index % count) + count) % count; // Handle negative indices
  const constellation = CONSTELLATION_DATA.constellations[normalizedIndex];
  if (!constellation) {
    throw new Error(`Constellation not found at index ${normalizedIndex}`);
  }
  return constellation;
}

/**
 * Returns the total number of constellations
 */
export function getConstellationCount(): number {
  return CONSTELLATION_DATA.constellations.length;
}

/**
 * Returns stats about the constellation dataset
 */
export function getDatasetStats() {
  const easy = getConstellationsByDifficulty('easy');
  const medium = getConstellationsByDifficulty('medium');
  const hard = getConstellationsByDifficulty('hard');

  return {
    total: getConstellationCount(),
    easy: easy.length,
    medium: medium.length,
    hard: hard.length,
  };
}
