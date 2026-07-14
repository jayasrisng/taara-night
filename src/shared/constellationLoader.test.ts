/**
 * Tests for constellation data loader and validation
 */

import { describe, it, expect } from 'vitest';
import {
  loadConstellations,
  getConstellationById,
  getConstellationsByDifficulty,
  getConstellationByIndex,
  getConstellationCount,
  getDatasetStats,
} from './constellationLoader';
import { projectToBox } from './projection';

describe('Constellation Loader', () => {
  describe('loadConstellations', () => {
    it('should load the dataset without errors', () => {
      expect(() => loadConstellations()).not.toThrow();
    });

    it('should return a dataset with constellations', () => {
      const dataset = loadConstellations();
      expect(dataset).toBeDefined();
      expect(dataset.constellations).toBeDefined();
      expect(Array.isArray(dataset.constellations)).toBe(true);
      expect(dataset.constellations.length).toBeGreaterThan(0);
    });

    it('should have at least 15 constellations (requirement)', () => {
      const dataset = loadConstellations();
      expect(dataset.constellations.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Data Validation', () => {
    it('should have valid star positions (0-1 range) for all constellations', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        constellation.stars.forEach((star) => {
          expect(star.x).toBeGreaterThanOrEqual(0);
          expect(star.x).toBeLessThanOrEqual(1);
          expect(star.y).toBeGreaterThanOrEqual(0);
          expect(star.y).toBeLessThanOrEqual(1);
        });
      });
    });

    it('should have valid connection indices for all constellations', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        const starCount = constellation.stars.length;
        constellation.connections.forEach((conn) => {
          expect(conn.from).toBeGreaterThanOrEqual(0);
          expect(conn.from).toBeLessThan(starCount);
          expect(conn.to).toBeGreaterThanOrEqual(0);
          expect(conn.to).toBeLessThan(starCount);
        });
      });
    });

    it('should have unique IDs for all constellations', () => {
      const dataset = loadConstellations();
      const ids = dataset.constellations.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid difficulty levels', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        expect(['easy', 'medium', 'hard']).toContain(constellation.difficulty);
      });
    });

    it('should have non-empty stories for all constellations', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        expect(constellation.story).toBeDefined();
        expect(typeof constellation.story).toBe('string');
        expect(constellation.story.trim().length).toBeGreaterThan(0);
      });
    });

    it('should have complete Telugu copy for all 88 constellations', () => {
      const dataset = loadConstellations();
      expect(dataset.constellations).toHaveLength(88);
      dataset.constellations.forEach((constellation) => {
        expect(constellation.localized.te.title.trim()).not.toBe('');
        expect(constellation.localized.te.story.trim()).not.toBe('');
        expect(constellation.localized.te.fact.trim()).not.toBe('');
      });
    });

    it('should have at least one star for each constellation', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        expect(constellation.stars.length).toBeGreaterThan(0);
      });
    });

    it('should have at least one connection for each constellation', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        expect(constellation.connections.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getConstellationById', () => {
    it('should return a constellation when given a valid ID', () => {
      const dataset = loadConstellations();
      const firstConstellation = dataset.constellations[0];
      expect(firstConstellation).toBeDefined();
      if (!firstConstellation) return;

      const firstId = firstConstellation.id;
      const constellation = getConstellationById(firstId);
      expect(constellation).toBeDefined();
      if (constellation) {
        expect(constellation.id).toBe(firstId);
      }
    });

    it('should return undefined for an invalid ID', () => {
      const constellation = getConstellationById('nonexistent-constellation');
      expect(constellation).toBeUndefined();
    });
  });

  describe('getConstellationsByDifficulty', () => {
    it('should return only easy constellations', () => {
      const easy = getConstellationsByDifficulty('easy');
      expect(easy.length).toBeGreaterThan(0);
      easy.forEach((c) => {
        expect(c.difficulty).toBe('easy');
      });
    });

    it('should return only medium constellations', () => {
      const medium = getConstellationsByDifficulty('medium');
      expect(medium.length).toBeGreaterThan(0);
      medium.forEach((c) => {
        expect(c.difficulty).toBe('medium');
      });
    });

    it('should return only hard constellations', () => {
      const hard = getConstellationsByDifficulty('hard');
      expect(hard.length).toBeGreaterThan(0);
      hard.forEach((c) => {
        expect(c.difficulty).toBe('hard');
      });
    });
  });

  describe('getConstellationByIndex', () => {
    it('should return a constellation for index 0', () => {
      const constellation = getConstellationByIndex(0);
      expect(constellation).toBeDefined();
    });

    it('should wrap around for large indices', () => {
      const count = getConstellationCount();
      const constellation1 = getConstellationByIndex(0);
      const constellation2 = getConstellationByIndex(count);
      expect(constellation1.id).toBe(constellation2.id);
    });

    it('should handle negative indices', () => {
      const count = getConstellationCount();
      const constellation1 = getConstellationByIndex(-1);
      const constellationLast = getConstellationByIndex(count - 1);
      expect(constellation1.id).toBe(constellationLast.id);
    });

    it('should be deterministic (same index = same constellation)', () => {
      const constellation1 = getConstellationByIndex(5);
      const constellation2 = getConstellationByIndex(5);
      expect(constellation1.id).toBe(constellation2.id);
    });
  });

  describe('getConstellationCount', () => {
    it('should return the correct count', () => {
      const dataset = loadConstellations();
      expect(getConstellationCount()).toBe(dataset.constellations.length);
    });
  });

  describe('getDatasetStats', () => {
    it('should return correct stats', () => {
      const stats = getDatasetStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.easy).toBeGreaterThan(0);
      expect(stats.medium).toBeGreaterThan(0);
      expect(stats.hard).toBeGreaterThan(0);
      expect(stats.easy + stats.medium + stats.hard).toBe(stats.total);
    });

    it('should have a balanced difficulty distribution', () => {
      const stats = getDatasetStats();
      // Each difficulty should have at least 3 constellations for variety
      expect(stats.easy).toBeGreaterThanOrEqual(3);
      expect(stats.medium).toBeGreaterThanOrEqual(3);
      expect(stats.hard).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Difficulty Complexity', () => {
    it('should have easy constellations with fewer stars than hard', () => {
      const easy = getConstellationsByDifficulty('easy');
      const hard = getConstellationsByDifficulty('hard');

      const avgEasyStars = easy.reduce((sum, c) => sum + c.stars.length, 0) / easy.length;
      const avgHardStars = hard.reduce((sum, c) => sum + c.stars.length, 0) / hard.length;

      expect(avgEasyStars).toBeLessThan(avgHardStars);
    });

    it('should have reasonable star counts by difficulty', () => {
      const easy = getConstellationsByDifficulty('easy');
      const hard = getConstellationsByDifficulty('hard');

      easy.forEach((c) => {
        expect(c.stars.length).toBeLessThanOrEqual(6);
      });

      hard.forEach((c) => {
        expect(c.stars.length).toBeGreaterThanOrEqual(9);
      });
    });
  });

  /**
   * The whole point of Step 8.5: the shapes are not drawn by hand, they are the
   * sky. These tests are what stops a well-meaning tweak to an x or a y from
   * quietly turning a constellation back into an approximation.
   */
  describe('Real sky', () => {
    it('carries a real star designation and plausible coordinates for every star', () => {
      loadConstellations().constellations.forEach((c) => {
        c.stars.forEach((star) => {
          expect(star.star.trim().length).toBeGreaterThan(0);
          expect(star.ra).toBeGreaterThanOrEqual(0);
          expect(star.ra).toBeLessThan(24);
          expect(Math.abs(star.dec)).toBeLessThanOrEqual(90);
        });
      });
    });

    it('derives every 0–1 position from the star catalogue coordinates', () => {
      loadConstellations().constellations.forEach((c) => {
        const projected = projectToBox(c.stars.map((s) => ({ ra: s.ra, dec: s.dec })));
        c.stars.forEach((star, i) => {
          expect(star.x).toBeCloseTo(projected[i]!.x, 6);
          expect(star.y).toBeCloseTo(projected[i]!.y, 6);
        });
      });
    });

    /**
     * Spot-checked against the IAU Catalog of Star Names (WGSN, 2022-04-04).
     * If someone re-types a coordinate from memory, this is what catches it.
     */
    it('matches the IAU catalogue for a sample of stars, to within an arcminute', () => {
      const IAU: Record<string, [ra: number, dec: number]> = {
        Polaris: [2.5303, 89.2641],
        Betelgeuse: [5.9195, 7.4071],
        Rigel: [5.2423, -8.2016],
        Alnilam: [5.6036, -1.2019],
        Vega: [18.6156, 38.7837],
        Antares: [16.4901, -26.432],
        Dubhe: [11.0621, 61.7508],
        Alkaid: [13.7923, 49.3133],
        Thuban: [14.0731, 64.3758],
        Aljanah: [20.7702, 33.9703],
      };
      const found = new Map<string, { ra: number; dec: number }>();
      loadConstellations().constellations.forEach((c) => {
        c.stars.forEach((s) => found.set(s.star, s));
      });

      for (const [name, [ra, dec]] of Object.entries(IAU)) {
        const star = found.get(name);
        expect(star, `${name} is missing from the dataset`).toBeDefined();
        // One arcminute of declination, and of right ascension at the equator.
        expect(Math.abs(star!.dec - dec)).toBeLessThan(1 / 60);
        expect(Math.abs(star!.ra - ra) * 15).toBeLessThan(1 / 60);
      }
    });

    it('never uses a proper name that belongs to another star', () => {
      const found = new Set<string>();
      loadConstellations().constellations.forEach((c) => c.stars.forEach((s) => found.add(s.star)));
      // Gienah is γ Corvi (it lives in Corvus now), never ε Cygni, which is Aljanah.
      // Deneb Dulfim is an obsolete name for Aldulfin.
      const cygnus = loadConstellations().constellations.find((c) => c.id === 'cygnus');
      expect(cygnus?.stars.some((s) => s.star === 'Gienah')).toBe(false);
      const corvus = loadConstellations().constellations.find((c) => c.id === 'corvus');
      expect(corvus?.stars.some((s) => s.star === 'Gienah')).toBe(true);
      expect(found.has('Deneb Dulfim')).toBe(false);
      expect(found.has('Aljanah')).toBe(true);
      expect(found.has('Aldulfin')).toBe(true);
    });

    it('names the same star at most once within a constellation', () => {
      loadConstellations().constellations.forEach((c) => {
        const names = c.stars.map((s) => s.star);
        expect(new Set(names).size).toBe(names.length);
      });
    });

    it('keeps every pair of stars far enough apart to tap them apart', () => {
      loadConstellations().constellations.forEach((c) => {
        for (let i = 0; i < c.stars.length; i++) {
          for (let j = i + 1; j < c.stars.length; j++) {
            const a = c.stars[i]!;
            const b = c.stars[j]!;
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.035);
          }
        }
      });
    });

    it('connects every star to at least one other, so none is unreachable', () => {
      loadConstellations().constellations.forEach((c) => {
        const touched = new Set<number>();
        c.connections.forEach((conn) => {
          touched.add(conn.from);
          touched.add(conn.to);
        });
        expect(touched.size).toBe(c.stars.length);
      });
    });

    it('shows Orion the way Orion is seen: Betelgeuse above and left of Rigel', () => {
      const orion = getConstellationById('orion')!;
      const at = (name: string) => orion.stars.find((s) => s.star === name)!;
      expect(at('Betelgeuse').x).toBeLessThan(at('Rigel').x);
      expect(at('Betelgeuse').y).toBeLessThan(at('Rigel').y);
      // The belt is a line: Alnilam sits between Mintaka and Alnitak.
      expect(at('Alnilam').x).toBeLessThan(at('Mintaka').x);
      expect(at('Alnitak').x).toBeLessThan(at('Alnilam').x);
    });

    it("trails the Big Dipper's handle east of its bowl", () => {
      const uma = getConstellationById('ursa-major')!;
      const at = (name: string) => uma.stars.find((s) => s.star === name)!;
      expect(at('Alkaid').x).toBeLessThan(at('Mizar').x);
      expect(at('Mizar').x).toBeLessThan(at('Alioth').x);
      expect(at('Alioth').x).toBeLessThan(at('Dubhe').x);
    });
  });

  describe('Story Quality', () => {
    it('should have stories that are at least 100 characters (substantial)', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        expect(constellation.story.length).toBeGreaterThanOrEqual(100);
      });
    });

    it('should have stories with multiple sentences', () => {
      const dataset = loadConstellations();
      dataset.constellations.forEach((constellation) => {
        const sentenceCount = (constellation.story.match(/[.!?]+/g) || []).length;
        expect(sentenceCount).toBeGreaterThanOrEqual(3);
      });
    });
  });
});
