/**
 * Debug scene to visualize constellation data
 * This helps verify that star positions and connections look correct
 *
 * Reachable only by pressing D on the menu, and deliberately **not** on the
 * design tokens in `ui/theme.ts`. Its colours are diagnostic, not decorative:
 * a validation failure has to look like a validation failure, and a cozy
 * indigo-on-gold error message is one nobody sees. Leave the primaries alone.
 */

import { Scene, GameObjects } from 'phaser';
import {
  loadConstellations,
  getConstellationByIndex,
  getConstellationCount,
} from '../../shared/constellationLoader';
import type { Constellation } from '../../shared/constellations';
import { crispText } from '../ui/display';
import { clamp, type Viewport } from '../ui/frame';
import { onLayout } from '../ui/layout';

export class ConstellationDebug extends Scene {
  private currentIndex = 0;
  private constellation: Constellation | null = null;
  private view: Viewport = { w: 0, h: 0 };
  private drawn: GameObjects.GameObject[] = [];

  constructor() {
    super('ConstellationDebug');
  }

  init(): void {
    this.drawn = [];
  }

  create(): void {
    // Validate constellation data on load
    try {
      loadConstellations();
    } catch (error) {
      console.error('Constellation validation failed:', error);
      onLayout(this, ({ w, h }) => {
        crispText(this, w / 2, h / 2, 'ERROR: Invalid constellation data\nCheck console for details', {
          fontSize: '24px',
          color: '#ff0000',
          align: 'center',
        }).setOrigin(0.5);
      });
      return;
    }

    this.setupControls();
    onLayout(this, (view) => {
      this.view = view;
      this.render();
    });
  }

  private render(): void {
    this.constellation = getConstellationByIndex(this.currentIndex);
    this.drawn.forEach((o) => o.destroy());
    this.drawn = [];

    if (!this.constellation) return;
    const { w, h } = this.view;

    const titleSize = clamp(18, w * 0.05, 28);
    const title = crispText(this, w / 2, clamp(8, h * 0.02, 20), this.constellation.name, {
      fontSize: `${titleSize}px`,
      color: '#ffffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0);
    this.drawn.push(title);

    const meta = crispText(
      this,
      w / 2,
      title.y + title.height + 6,
      `${this.constellation.difficulty.toUpperCase()} | ${this.constellation.stars.length} stars | ${this.constellation.connections.length} connections`,
      {
        fontSize: '16px',
        color:
          this.constellation.difficulty === 'easy'
            ? '#00ff00'
            : this.constellation.difficulty === 'medium'
              ? '#ffaa00'
              : '#ff0000',
        fontFamily: 'Arial',
        align: 'center',
        wordWrap: { width: w - 32 },
      }
    ).setOrigin(0.5, 0);
    this.drawn.push(meta);

    // Bottom block first, so the drawing area knows what is left.
    const instructions = crispText(
      this,
      w / 2,
      h - clamp(6, h * 0.015, 14),
      `[${this.currentIndex + 1}/${getConstellationCount()}] Click/tap to cycle · ESC to return to menu`,
      { fontSize: '12px', color: '#888888', fontFamily: 'Arial', align: 'center', wordWrap: { width: w - 24 } }
    ).setOrigin(0.5, 1);
    this.drawn.push(instructions);

    const storyPreview =
      this.constellation.story.length > 200
        ? this.constellation.story.substring(0, 200) + '...'
        : this.constellation.story;
    const story = crispText(this, w / 2, instructions.y - instructions.height - 10, storyPreview, {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'Arial',
      align: 'center',
      wordWrap: { width: w - 40 },
    }).setOrigin(0.5, 1);
    this.drawn.push(story);

    const top = meta.y + meta.height + 12;
    const bottom = story.y - story.height - 12;
    const size = Math.max(80, Math.min(w - 32, bottom - top, 600));
    const ox = (w - size) / 2;
    const oy = top + Math.max(0, (bottom - top - size) / 2);

    this.drawn.push(this.add.rectangle(w / 2, oy + size / 2, size, size, 0x000011, 0.8));

    this.constellation.connections.forEach((conn) => {
      const a = this.constellation!.stars[conn.from];
      const b = this.constellation!.stars[conn.to];
      if (!a || !b) return;
      const line = this.add.line(
        0,
        0,
        ox + a.x * size,
        oy + a.y * size,
        ox + b.x * size,
        oy + b.y * size,
        0x4488ff,
        0.6
      );
      line.setLineWidth(2);
      this.drawn.push(line);
    });

    // Labelled with the real star, so the render can be held up against a sky
    // chart and checked star by star.
    this.constellation.stars.forEach((star) => {
      const x = ox + star.x * size;
      const y = oy + star.y * size;
      this.drawn.push(this.add.arc(x, y, 8, 0, 360, false, 0xffffff, 0.3));
      this.drawn.push(this.add.arc(x, y, 4, 0, 360, false, 0xffffff, 1.0));
      this.drawn.push(crispText(this, x + 8, y - 14, star.star, { fontSize: '11px', color: '#8890b8' }));
    });
  }

  private setupControls(): void {
    this.input.keyboard?.on('keydown-LEFT', () => this.step(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.step(1));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Boot'));
    this.input.on('pointerdown', () => this.step(1));
  }

  private step(delta: number): void {
    const total = getConstellationCount();
    this.currentIndex = (this.currentIndex + delta + total) % total;
    this.render();
  }
}
