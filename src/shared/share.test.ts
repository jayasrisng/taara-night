import { describe, expect, it } from 'vitest';
import type { NightResult } from './api';
import type { JwalaState } from './jwala';
import { CONSTELLATION_DATA } from './constellationData';
import { buildSharePost, buildShareText } from './share';

const result = (over: Partial<NightResult> = {}): NightResult => ({
  night: 12,
  timeMs: 134_000,
  whispers: 2,
  glitches: 1,
  starsConnected: 7,
  completedAt: 0,
  ...over,
});

const jwala = (current: number): JwalaState => ({ current, longest: current, lastNight: 12 });

describe('buildShareText', () => {
  it('renders the card in the format the plan pins', () => {
    expect(buildShareText(result(), jwala(5))).toBe(
      ['TaaraNight #12 🌙', 'Tonight’s sky revealed', '2 Whispers used', 'Jwala streak: 5 nights', 'Mood: Dreamy'].join(
        '  \n'
      )
    );
  });

  it('never spoils the constellation', () => {
    for (const constellation of CONSTELLATION_DATA.constellations) {
      const text = buildShareText(result(), jwala(3));
      expect(text).not.toContain(constellation.name);
      expect(text).not.toContain(constellation.story.slice(0, 24));
    }
  });

  it('praises a night that needed no help', () => {
    expect(buildShareText(result({ whispers: 0, glitches: 0 }), jwala(1))).toContain('No Whispers needed');
  });

  it('badges a flawless night — no Whispers and no Glitches', () => {
    expect(buildShareText(result({ whispers: 0, glitches: 0 }), jwala(1))).toContain('Flawless ✦');
    // A single Whisper or Glitch is enough to lose the badge.
    expect(buildShareText(result({ whispers: 1, glitches: 0 }), jwala(1))).not.toContain('Flawless');
    expect(buildShareText(result({ whispers: 0, glitches: 1 }), jwala(1))).not.toContain('Flawless');
  });

  it('speaks of one Whisper and one night in the singular', () => {
    const text = buildShareText(result({ whispers: 1 }), jwala(1));
    expect(text).toContain('1 Whisper used');
    expect(text).toContain('Jwala streak: 1 night');
  });

  it('never prints a streak of zero nights', () => {
    const text = buildShareText(result(), { current: 0, longest: 4, lastNight: 20 });
    expect(text).not.toContain('0 nights');
    expect(text).toContain('Jwala streak: rekindling');
  });

  it('uses markdown hard breaks so the card keeps its shape in a comment', () => {
    expect(buildShareText(result(), jwala(2)).split('  \n')).toHaveLength(5);
  });
});

describe('buildSharePost', () => {
  it('pluralises Glitch as "Glitches", not "Glitchs"', () => {
    expect(buildSharePost(result({ glitches: 2 }), jwala(1), null).text).toContain('2 Glitches touched');
    expect(buildSharePost(result({ glitches: 1 }), jwala(1), null).text).toContain('1 Glitch touched');
    expect(buildSharePost(result({ glitches: 0 }), jwala(1), null).text).toContain('No Glitches touched');
  });
});
