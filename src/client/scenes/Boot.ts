/**
 * Boot — the one decision the game makes before anything is drawn.
 *
 * The splash CTA opens straight into the night, with no menu stop. So the very
 * first thing the game does is ask the server what this post's night is and
 * whether the player has already finished it: an unplayed night opens the
 * puzzle, a finished one opens its Results. If the server is asleep, the sky is
 * still playable — the client's own guess of tonight opens Play.
 *
 * The night hub (`MainMenu`) is no longer the entry point; it is reached from
 * Play's Back button.
 */

import { Scene, GameObjects } from 'phaser';
import { nightNumberAt } from '../../shared/nightSeed';
import { fetchInit } from '../api';
import { crispText } from '../ui/display';
import { onLayout } from '../ui/layout';
import { font, ink, typeScale } from '../ui/theme';
import { preloadConstellationAtlas } from '../ui/constellationArt';
import { resultsDataFromInit } from './Results';

export class Boot extends Scene {
  private label: GameObjects.Text | null = null;

  constructor() {
    super('Boot');
  }

  preload(): void {
    // One compact atlas powers all 88 figures in My Sky. The full-resolution
    // artwork for tonight is loaded separately by Play.
    preloadConstellationAtlas(this);
  }

  create(): void {
    // A quiet word over the canvas while the one request lands — usually a blink.
    onLayout(this, (view) => {
      this.label?.destroy();
      this.label = crispText(this, view.w / 2, view.h / 2, 'Opening tonight’s sky…', {
        fontFamily: font.sans,
        fontSize: `${typeScale.body}px`,
        color: ink.faint,
      }).setOrigin(0.5);
    });

    void this.decide();
  }

  private async decide(): Promise<void> {
    const init = await fetchInit();
    if (!this.scene.isActive()) return;

    // A finished night opens as the solved sky — the game is always the first
    // thing seen, with Results one tap away — never a wall of numbers.
    const results = init ? resultsDataFromInit(init) : null;
    const night = init?.night ?? Math.max(1, nightNumberAt(Date.now()));
    this.scene.start('Play', results ? { night, solvedResults: results } : { night });
  }
}
