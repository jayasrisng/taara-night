import { MainMenu } from './scenes/MainMenu';
import { MySky } from './scenes/MySky';
import { Play } from './scenes/Play';
import { Results } from './scenes/Results';
import { ConstellationDebug } from './scenes/ConstellationDebug';
import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';
import { ambience } from './audio/ambience';
import { DPR } from './ui/display';
import { color, hex } from './ui/theme';

/**
 * The canvas is a device-pixel backing store displayed at CSS size.
 *
 * Phaser 4's `RESIZE` scale mode sets `canvas.width` to the parent's *CSS*
 * width and never writes `canvas.style`, so on a Retina screen every pixel is
 * stretched by the browser. `NONE` + `scale.resize()` is the mode that writes
 * both: it sets `canvas.width = w` and `canvas.style.width = w * zoom`, so a
 * game size of `css * DPR` with `zoom = 1 / DPR` lands the canvas at the right
 * display size with a full-resolution backing store.
 *
 * Scenes never see device pixels: `onLayout` zooms the main camera by DPR so
 * they lay out in CSS pixels. See `ui/display.ts`.
 */
function gameSize(parent: HTMLElement): { width: number; height: number } {
  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width * DPR)),
    height: Math.max(1, Math.round(rect.height * DPR)),
  };
}

const StartGame = (parentId: string): Game => {
  const parent = document.getElementById(parentId)!;
  const { width, height } = gameSize(parent);

  const game = new Game({
    type: AUTO,
    parent,
    backgroundColor: hex(color.canvas),
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width,
      height,
      zoom: 1 / DPR,
    },
    scene: [MainMenu, Play, Results, MySky, ConstellationDebug],
  });

  if (new URLSearchParams(window.location.search).get('capture') === '1') {
    (window as Window & { __TAARA_GAME__?: Game }).__TAARA_GAME__ = game;
  }

  // `NONE` never tracks the parent on its own, so we drive it. This also covers
  // the mobile address-bar collapse and the desktop/mobile playtest toggle,
  // which resize the container without firing a window `resize`.
  const observer = new ResizeObserver(() => {
    const next = gameSize(parent);
    game.scale.resize(next.width, next.height);
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());

  return game;
};

/**
 * Browsers will not make a sound until the player has touched the page, so the
 * night starts breathing on the first tap rather than on load. `unlock` builds
 * nothing when sound is muted, and nothing at all where Web Audio is missing.
 */
function wakeSoundOnFirstGesture(): void {
  const wake = (): void => ambience.unlock();
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  StartGame('game-container');
  wakeSoundOnFirstGesture();
});
