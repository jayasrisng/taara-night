/**
 * NightSky — a reusable, cozy animated backdrop.
 *
 * A vertical gradient, a moon, a field of softly twinkling stars, and the
 * occasional slow shooting star. Shared by the menu and the play scene so the
 * whole game feels like one crafted night.
 *
 * Everything here is positioned from the CSS-pixel viewport handed to
 * `layout()`, so the sky fills any screen without a fixed design size.
 */

import { Scene, GameObjects } from 'phaser';
import { mulberry32 } from '../../shared/rng';
import { texScale } from './display';
import type { Viewport } from './frame';
import { duration, ease, motion } from './motion';
import { prefs } from './prefs';
import { color } from './theme';
import { TEX, ensureTextures } from './textures';

const VIGNETTE_ALPHA = 0.24;

interface SkyPalette {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
  horizon: number;
}

/** A coherent blue-black night, with small per-night changes in atmospheric blue. */
const SKY_PALETTES: readonly SkyPalette[] = [
  { topLeft: 0x010711, topRight: 0x06152a, bottomLeft: 0x06243e, bottomRight: 0x0a3150, horizon: 0x184a68 },
  { topLeft: 0x020814, topRight: 0x07182d, bottomLeft: 0x082b46, bottomRight: 0x0b3655, horizon: 0x1b506e },
  { topLeft: 0x030a18, topRight: 0x051326, bottomLeft: 0x0a2942, bottomRight: 0x103b58, horizon: 0x205675 },
];

/**
 * The moon: a disc with an edge, a cool limb shadow, and quiet surface marks.
 *
 * It used to be the soft radial texture drawn twice — once at 0.85 for the body
 * and once at 2.6 and 22% for the halo — which on a phone is a 400px lilac
 * cloud in the corner with no edge anywhere in it. That is the one shape in the
 * game that looked generated rather than drawn.
 *
 * Now the body is vector-drawn (crisp at any DPR), with just enough craters and
 * rim light to feel handmade without turning into a busy planet.
 */
const MOON_RADIUS = 22;
const CORONA_SCALE = 1.1;
const CORONA_ALPHA = 0.08;

interface BgStar {
  nx: number; // normalized 0–1 across the screen
  ny: number;
  img: GameObjects.Image;
}

export interface NightSkyOptions {
  /** Decorative screen-space stars. Disable when the scene draws a real catalogue. */
  stars?: boolean;
  /** Decorative shooting stars. Defaults to the same value as `stars`. */
  shootingStars?: boolean;
  /** Scene-specific placement for the quiet crescent. */
  moon?: Partial<{ nx: number; ny: number; scale: number; alpha: number }>;
}

export class NightSky {
  private scene: Scene;
  private gfx: GameObjects.Graphics;
  private vignette: GameObjects.Graphics;
  private stars: BgStar[] = [];
  private moonHalo: GameObjects.Image;
  private moonDetail: GameObjects.Graphics;
  private moonOptions: { nx: number; ny: number; scale: number; alpha: number };
  private rng: () => number;
  private palette: SkyPalette;
  private view: Viewport = { w: 0, h: 0 };

  constructor(scene: Scene, seed = 1, options: NightSkyOptions = {}) {
    this.scene = scene;
    ensureTextures(scene);
    this.rng = mulberry32(Math.floor(seed) * 2654435761 + 99);
    this.palette = SKY_PALETTES[Math.abs(Math.floor(seed)) % SKY_PALETTES.length]!;
    this.moonOptions = { nx: 0.84, ny: 0.16, scale: 0.78, alpha: 0.5, ...options.moon };

    this.gfx = scene.add.graphics();

    this.moonHalo = scene.add
      .image(0, 0, TEX.moon)
      .setAlpha(CORONA_ALPHA)
      .setScale(texScale(CORONA_SCALE))
      .setTint(color.starlight);
    // A slim vector crescent: scenery, never a lamp over the game.
    this.moonDetail = scene.add.graphics();

    const showStars = options.stars ?? true;
    const count = showStars ? 150 : 0;
    const starPalette = [0xffffff, 0xd9e9ff, 0xffedcb, 0xc7dcff];
    for (let i = 0; i < count; i++) {
      const img = scene.add.image(0, 0, TEX.starSoft);
      const scale = 0.07 + this.rng() * 0.2;
      const baseAlpha = 0.5 + this.rng() * 0.46;
      img
        .setScale(texScale(scale))
        .setAlpha(baseAlpha)
        .setTint(starPalette[Math.floor(this.rng() * starPalette.length)]!);
      this.stars.push({ nx: this.rng(), ny: this.rng(), img });

      // Keep drawing from the rng even when still, so a reduced-motion sky has
      // its stars in the same places as everybody else's. `motion` declines to
      // build the tween rather than the loop declining to reach the rng.
      const dim = baseAlpha * (0.55 + this.rng() * 0.25);
      const period = duration.breath * (0.9 + this.rng());

      motion(scene, {
        targets: img,
        alpha: dim,
        duration: period,
        yoyo: true,
        repeat: -1,
        ease: ease.inOut,
      });
    }

    this.vignette = scene.add.graphics();

    if (prefs.animate && (options.shootingStars ?? showStars)) this.scheduleShootingStar();
  }

  layout(view: Viewport): void {
    this.view = view;
    const { w, h } = view;

    this.gfx.clear();
    this.gfx.fillGradientStyle(
      this.palette.topLeft,
      this.palette.topRight,
      this.palette.bottomLeft,
      this.palette.bottomRight,
      1
    );
    this.gfx.fillRect(0, 0, w, h);
    // A dim atmospheric-blue horizon gives the sky depth without competing with
    // the warm constellation lines.
    this.gfx.fillGradientStyle(
      this.palette.horizon,
      this.palette.bottomRight,
      this.palette.horizon,
      this.palette.bottomRight,
      0,
      0,
      0.16,
      0.1
    );
    this.gfx.fillRect(0, h * 0.72, w, h * 0.28);

    const mx = w * this.moonOptions.nx;
    const my = h * this.moonOptions.ny;
    const moonScale = this.moonOptions.scale;
    this.moonHalo
      .setPosition(mx, my)
      .setScale(texScale(CORONA_SCALE * moonScale))
      .setAlpha(CORONA_ALPHA * moonScale);
    this.drawMoon(mx, my, MOON_RADIUS * moonScale);

    for (const st of this.stars) st.img.setPosition(st.nx * w, st.ny * h);

    // Soft edge darkening for depth/focus. Each band fades to nothing where it
    // meets the sky — a constant alpha leaves a hard seam, which a high-DPI
    // canvas shows off beautifully.
    this.vignette.clear();
    const band = Math.max(w, h) * 0.18;
    const dark = color.void;

    this.vignette.fillGradientStyle(dark, dark, dark, dark, VIGNETTE_ALPHA, VIGNETTE_ALPHA, 0, 0);
    this.vignette.fillRect(0, 0, w, band);
    this.vignette.fillGradientStyle(dark, dark, dark, dark, 0, 0, VIGNETTE_ALPHA, VIGNETTE_ALPHA);
    this.vignette.fillRect(0, h - band, w, band);
  }

  private drawMoon(x: number, y: number, r: number): void {
    this.moonDetail.clear();

    // One closed silhouette: a true outer limb and a smooth inner terminator.
    // Keeping both arcs vertical avoids the hooked, lopsided crescent produced
    // by the previous mismatched angles.
    this.moonDetail.fillStyle(color.moon, this.moonOptions.alpha);
    this.moonDetail.beginPath();
    this.moonDetail.arc(x, y, r, -Math.PI / 2, Math.PI / 2, true);
    this.moonDetail.arc(x + r * 0.42, y, r * 0.82, Math.PI / 2, -Math.PI / 2, false);
    this.moonDetail.closePath();
    this.moonDetail.fillPath();
  }


  private scheduleShootingStar(): void {
    const wait = 4200 + this.rng() * 7000;
    this.scene.time.delayedCall(wait, () => {
      this.shoot();
      this.scheduleShootingStar();
    });
  }

  private shoot(): void {
    const { w, h } = this.view;
    if (w === 0) return;

    const startX = w * (0.1 + this.rng() * 0.55);
    const startY = h * (0.05 + this.rng() * 0.25);
    const streak = this.scene.add
      .image(startX, startY, TEX.spark)
      .setScale(texScale(0.9), texScale(0.14))
      .setAngle(28)
      .setAlpha(0);
    // Pure travel, so `motion` skips it outright — though nothing schedules a
    // shooting star under stillness in the first place.
    const trail = motion(this.scene, {
      targets: streak,
      x: startX + w * 0.28,
      y: startY + h * 0.22,
      alpha: { from: 0.85, to: 0 },
      duration: duration.reveal,
      ease: ease.in,
      onComplete: () => streak.destroy(),
    });
    if (!trail) streak.destroy();
  }
}
