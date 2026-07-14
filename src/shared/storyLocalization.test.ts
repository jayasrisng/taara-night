import { describe, expect, it } from 'vitest';
import { CONSTELLATION_DATA } from './constellationData';
import TELUGU_STORIES from './teluguStories.json';

describe('English–Telugu story mapping', () => {
  it('maps exactly 88 ordered IDs and IAU names', () => {
    const constellations = CONSTELLATION_DATA.constellations;
    const entries = Object.entries(TELUGU_STORIES);

    expect(constellations).toHaveLength(88);
    expect(entries).toHaveLength(88);
    expect(new Set(constellations.map((record) => record.id)).size).toBe(88);

    constellations.forEach((record, index) => {
      const source = TELUGU_STORIES[record.id as keyof typeof TELUGU_STORIES];
      expect(source, record.id).toBeDefined();
      expect(source.number).toBe(index + 1);
      expect(source.iauName).toBe(record.name);
      expect(record.localized.te).toEqual({
        title: source.title,
        story: source.story,
        fact: source.fact,
      });
    });
  });

  it('keeps every English story as a non-empty independent string', () => {
    for (const record of CONSTELLATION_DATA.constellations) {
      expect(typeof record.story).toBe('string');
      expect(record.story.trim()).not.toBe('');
      expect(record.story).not.toBe(record.localized.te.story);
    }
  });
});
