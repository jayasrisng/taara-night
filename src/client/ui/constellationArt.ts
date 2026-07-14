import type { Scene } from 'phaser';
import {
  CONSTELLATION_ART_ALIGNMENT,
  type ConstellationArtFrame,
} from './constellationArtData';
import type { BoxPoint } from '../../shared/projection';

export const CONSTELLATION_ATLAS = 'taara-constellation-atlas';

/** Atlas art is intentionally small: it is used only as an atmospheric map layer. */
export function preloadConstellationAtlas(scene: Scene): void {
  if (scene.textures.exists(CONSTELLATION_ATLAS)) return;
  scene.load.atlas(
    CONSTELLATION_ATLAS,
    '/constellation-art/constellation-atlas.webp',
    '/constellation-art/constellation-atlas.json'
  );
}

/** Full-resolution reveal art: only tonight's figure is loaded. */
export function constellationArtFile(id: string): string {
  const aliases: Record<string, string> = {
    carina: 'argonavis.png',
    puppis: 'argonavis.png',
    vela: 'argonavis.png',
    horologium: 'horlogium.png',
    serpens: 'serpens-generated.png',
    taurus: 'taurus-cinematic-v2.png',
  };
  return `/constellation-art/${aliases[id] ?? `${id}.png`}`;
}

export function constellationArtKey(id: string): string {
  return `taara-constellation-art-${id}`;
}

export type ArtVariant = 'full' | 'atlas';

export interface ArtTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  error: number;
}

export function constellationArtFrame(id: string, variant: ArtVariant): ConstellationArtFrame | null {
  return CONSTELLATION_ART_ALIGNMENT[id]?.[variant] ?? null;
}

/**
 * Register an illustration to its real catalogue stars. A least-squares
 * similarity fit uses every available anchor, and also tries a horizontal
 * reflection because historical atlas plates were drawn both globe-out and
 * sky-in. The lower-error orientation wins.
 */
export function fitConstellationArt(frame: ConstellationArtFrame, targets: readonly BoxPoint[]): ArtTransform | null {
  const count = Math.min(frame.anchors.length, targets.length);
  if (count < 2) return null;

  const solve = (mirror: 1 | -1): ArtTransform => {
    const source = frame.anchors.slice(0, count).map((anchor) => ({ x: anchor.x * mirror, y: anchor.y }));
    const target = targets.slice(0, count);
    const sourceCentre = source.reduce((p, q) => ({ x: p.x + q.x / count, y: p.y + q.y / count }), { x: 0, y: 0 });
    const targetCentre = target.reduce((p, q) => ({ x: p.x + q.x / count, y: p.y + q.y / count }), { x: 0, y: 0 });
    let aa = 0;
    let bb = 0;
    let denom = 0;
    for (let i = 0; i < count; i++) {
      const sx = source[i]!.x - sourceCentre.x;
      const sy = source[i]!.y - sourceCentre.y;
      const tx = target[i]!.x - targetCentre.x;
      const ty = target[i]!.y - targetCentre.y;
      aa += sx * tx + sy * ty;
      bb += sx * ty - sy * tx;
      denom += sx * sx + sy * sy;
    }
    const a = denom > 1e-9 ? aa / denom : 1;
    const b = denom > 1e-9 ? bb / denom : 0;
    const scale = Math.hypot(a, b);
    const rotation = Math.atan2(b, a);
    const imageCentre = { x: (frame.width / 2) * mirror, y: frame.height / 2 };
    const cx = imageCentre.x - sourceCentre.x;
    const cy = imageCentre.y - sourceCentre.y;
    const x = targetCentre.x + a * cx - b * cy;
    const y = targetCentre.y + b * cx + a * cy;
    let error = 0;
    for (let i = 0; i < count; i++) {
      const sx = source[i]!.x - sourceCentre.x;
      const sy = source[i]!.y - sourceCentre.y;
      const px = targetCentre.x + a * sx - b * sy;
      const py = targetCentre.y + b * sx + a * sy;
      error += (px - target[i]!.x) ** 2 + (py - target[i]!.y) ** 2;
    }
    return { x, y, scaleX: scale * mirror, scaleY: scale, rotation, error };
  };

  const normal = solve(1);
  const mirrored = solve(-1);
  return normal.error <= mirrored.error ? normal : mirrored;
}
