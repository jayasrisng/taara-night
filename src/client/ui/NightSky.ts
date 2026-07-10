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

import * as Phaser from 'phaser';
import { Scene, GameObjects } from 'phaser';
import { mulberry32 } from '../../shared/rng';
import { texScale } from './display';
import type { Viewport } from './frame';
import { duration, ease, motion } from './motion';
import { prefs } from './prefs';
import { color } from './theme';
import { TEX, ensureTextures } from './textures';

const VIGNETTE_ALPHA = 0.38;

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
const CORONA_ALPHA = 0.16;
const LIMB_SHADOW = 0xb7b4ce;
const CRATER = 0xd7d4ea;
const CRATER_SHINE = 0xfffbff;

interface BgStar {
  nx: number; // normalized 0–1 across the screen
  ny: number;
  img: GameObjects.Image;
}

export class NightSky {
  private scene: Scene;
  private gfx: GameObjects.Graphics;
  private vignette: GameObjects.Graphics;
  private stars: BgStar[] = [];
  private moon: GameObjects.Arc;
  private moonHalo: GameObjects.Image;
  private moonDetail: GameObjects.Graphics;
  private rng: () => number;
  private view: Viewport = { w: 0, h: 0 };

  constructor(scene: Scene, seed = 1) {
    this.scene = scene;
    ensureTextures(scene);
    this.rng = mulberry32(Math.floor(seed) * 2654435761 + 99);

    this.gfx = scene.add.graphics();

    this.moonHalo = scene.add
      .image(0, 0, TEX.moon)
      .setAlpha(CORONA_ALPHA)
      .setScale(texScale(CORONA_SCALE))
      .setTint(color.starlight);
    this.moon = scene.add.circle(0, 0, MOON_RADIUS, color.moon);
    this.moonDetail = scene.add.graphics();

    const count = 90;
    for (let i = 0; i < count; i++) {
      const img = scene.add.image(0, 0, TEX.starSoft);
      const scale = 0.05 + this.rng() * 0.14;
      const baseAlpha = 0.35 + this.rng() * 0.5;
      img.setScale(texScale(scale)).setAlpha(baseAlpha);
      this.stars.push({ nx: this.rng(), ny: this.rng(), img });

      // Keep drawing from the rng even when still, so a reduced-motion sky has
      // its stars in the same places as everybody else's. `motion` declines to
      // build the tween rather than the loop declining to reach the rng.
      const dim = baseAlpha * (0.3 + this.rng() * 0.3);
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

    if (prefs.animate) this.scheduleShootingStar();
  }

  layout(view: Viewport): void {
    this.view = view;
    const { w, h } = view;

    this.gfx.clear();
    this.gfx.fillGradientStyle(color.skyTop, color.skyTop, color.skyBottom, color.skyBottom, 1);
    this.gfx.fillRect(0, 0, w, h);

    const mx = w * 0.8;
    const my = h * 0.15;
    this.moon.setPosition(mx, my);
    this.moonHalo.setPosition(mx, my);
    this.drawMoon(mx, my);

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

  private drawMoon(x: number, y: number): void {
    this.moonDetail.clear();

    this.moonDetail.fillStyle(color.starlight, 0.28);
    this.moonDetail.fillCircle(x - 7, y - 7, 8);

    this.moonDetail.fillStyle(LIMB_SHADOW, 0.28);
    this.moonDetail.slice(x + 1, y + 1, MOON_RADIUS - 1, Phaser.Math.DegToRad(286), Phaser.Math.DegToRad(112), false);
    this.moonDetail.fillPath();

    this.moonDetail.lineStyle(1.25, color.starlight, 0.62);
    this.moonDetail.strokeCircle(x, y, MOON_RADIUS - 0.5);
    this.moonDetail.lineStyle(2, color.accent, 0.18);
    this.moonDetail.beginPath();
    this.moonDetail.arc(x - 3, y - 3, MOON_RADIUS - 3, Phaser.Math.DegToRad(224), Phaser.Math.DegToRad(322), false);
    this.moonDetail.strokePath();

    this.crater(x - 7, y + 3, 4.3);
    this.crater(x + 6, y - 5, 3.4);
    this.crater(x + 7, y + 8, 2.7);
    this.crater(x - 1, y - 10, 2.2);
  }

  private crater(x: number, y: number, r: number): void {
    this.moonDetail.fillStyle(CRATER, 0.18);
    this.moonDetail.fillCircle(x, y, r);
    this.moonDetail.lineStyle(0.8, CRATER_SHINE, 0.22);
    this.moonDetail.strokeCircle(x - r * 0.08, y - r * 0.08, r);
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
