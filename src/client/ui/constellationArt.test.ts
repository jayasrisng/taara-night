import { describe, expect, it } from 'vitest';
import { SKY_FIGURES, projectSkyNear } from '../../shared/skyMap';
import { CONSTELLATION_ART_ALIGNMENT } from './constellationArtData';
import { constellationArtFrame, fitConstellationArt } from './constellationArt';

describe('fitConstellationArt', () => {
  it('recovers the position, scale, and rotation of known star anchors', () => {
    const frame = {
      width: 100,
      height: 80,
      anchors: [
        { x: 10, y: 20, ra: 0, dec: 0 },
        { x: 80, y: 15, ra: 0, dec: 0 },
        { x: 40, y: 70, ra: 0, dec: 0 },
      ],
    };
    const scale = 2;
    const rotation = Math.PI / 6;
    const a = scale * Math.cos(rotation);
    const b = scale * Math.sin(rotation);
    const targets = frame.anchors.map((point) => ({
      x: 300 + a * point.x - b * point.y,
      y: 120 + b * point.x + a * point.y,
    }));
    const transform = fitConstellationArt(frame, targets)!;
    expect(Math.abs(transform.scaleX)).toBeCloseTo(scale, 6);
    expect(transform.scaleY).toBeCloseTo(scale, 6);
    expect(transform.rotation).toBeCloseTo(rotation, 6);
    expect(transform.x).toBeCloseTo(300 + a * 50 - b * 40, 6);
    expect(transform.y).toBeCloseTo(120 + b * 50 + a * 40, 6);
    expect(transform.error).toBeCloseTo(0, 8);
  });

  it('keeps all 88 source anchors inside their images and beside their sky figures', () => {
    expect(Object.keys(CONSTELLATION_ART_ALIGNMENT)).toHaveLength(88);
    for (const figure of SKY_FIGURES) {
      const frame = constellationArtFrame(figure.id, 'full');
      expect(frame, figure.id).not.toBeNull();
      for (const anchor of frame!.anchors) {
        expect(anchor.x, `${figure.id} anchor x`).toBeGreaterThanOrEqual(0);
        expect(anchor.x, `${figure.id} anchor x`).toBeLessThanOrEqual(frame!.width);
        expect(anchor.y, `${figure.id} anchor y`).toBeGreaterThanOrEqual(0);
        expect(anchor.y, `${figure.id} anchor y`).toBeLessThanOrEqual(frame!.height);
        const target = projectSkyNear(anchor, figure.centre.x);
        expect(Math.abs(target.x - figure.centre.x), `${figure.id} sky wrap`).toBeLessThan(2);
      }
    }
  });
});
