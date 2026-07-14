/**
 * Runtime-generated soft "glow" textures.
 *
 * Flat vector circles read as cheap; a radial soft-edged dot reads as a
 * luminous star. We bake a few reusable textures once per game so both the
 * menu and the play scene share the same premium look (and so we ship no image
 * assets — Devvit-Rules safe).
 *
 * Sizes are design-space, baked `DPR` times larger so the camera zoom magnifies
 * real pixels. Draw them with `texScale()` and their on-screen size is the same
 * on every device.
 */

import type { Scene } from 'phaser';
import { DPR } from './display';
import { color } from './theme';

export const TEX = {
  /** Cool white star glow, used for real/decoy stars and background stars. */
  starSoft: 'taara-star-soft',
  /** Warm sparkle, used for shooting stars and completion sparkles. */
  spark: 'taara-spark',
  /** Big soft orb, used for the moon (and its halo). */
  moon: 'taara-moon',
} as const;

/**
 * Draw a soft radial dot by stacking translucent circles from the rim inward,
 * so the centre builds to near-opaque and the edge fades to nothing.
 *
 * `size` is the design size; the texture is baked at `size * DPR`. The ring
 * step stays one *device* pixel so the gradient never bands.
 */
function ensureRadial(scene: Scene, key: string, size: number, color: number, falloff: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const pixels = Math.round(size * DPR);
  const c = pixels / 2;
  for (let radius = c; radius >= 1; radius -= 1) {
    const edgeDistance = radius / c; // 1 at the rim, →0 at the centre
    const alpha = Math.pow(1 - edgeDistance, falloff);
    // The rings overlap, so per-ring alpha has to fall as their count rises or
    // a 2× texture would build to a harder centre than a 1× one.
    g.fillStyle(color, (alpha * 0.16) / DPR);
    g.fillCircle(c, c, radius);
  }
  if (key === TEX.starSoft) {
    // Real bright stars read as a hot core with restrained diffraction, not as
    // identical blurred dots. These rays are deliberately faint: scaling and
    // tinting this shared texture keeps them elegant on small mobile screens.
    g.lineStyle(Math.max(1, DPR * 0.62), 0xffffff, 0.28);
    g.lineBetween(c, c * 0.12, c, c * 1.88);
    g.lineBetween(c * 0.12, c, c * 1.88, c);
    g.lineStyle(Math.max(1, DPR * 0.44), 0xffffff, 0.13);
    g.lineBetween(c * 0.35, c * 0.35, c * 1.65, c * 1.65);
    g.lineBetween(c * 1.65, c * 0.35, c * 0.35, c * 1.65);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(c, c, Math.max(1.4, DPR));
  }
  g.generateTexture(key, pixels, pixels);
  g.destroy();
}

/** Create the shared glow textures if they don't already exist. */
export function ensureTextures(scene: Scene): void {
  // White, not a palette colour: every caller tints this one, and a tint can
  // only ever darken. Its colour is whatever `setTint` says it is.
  ensureRadial(scene, TEX.starSoft, 64, 0xffffff, 2.2);
  ensureRadial(scene, TEX.spark, 40, color.accentBright, 1.6);
  ensureRadial(scene, TEX.moon, 160, color.moon, 2.6);
}
