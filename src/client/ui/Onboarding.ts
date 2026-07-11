/**
 * Three sentences: once unasked, and any time after that on request.
 *
 * A first-time player opens the sky and sees a field of stars with no obvious
 * verb. This card supplies the verb, promises that mistakes are free, and names
 * the reward — then gets out of the way. `Play` raises it once, unasked; the
 * menu's `?` raises the same card whenever anyone wants it back.
 *
 * Every hint is true on every difficulty. Whispers and Glitches are deliberately
 * not mentioned: Easy has neither, and a hint that describes something the
 * player cannot see is worse than no hint at all.
 */

import { Scene, GameObjects } from 'phaser';
import { crispText } from './display';
import { gutter, type Viewport } from './frame';
import { drawIcon, iconSize, type IconName } from './icons';
import { duration, ease, tween } from './motion';
import { Pill } from './Pill';
import { prefs } from './prefs';
import { alpha, color, control, font, hairline, ink, radius, space, typeScale } from './theme';

/** The verb, the forgiveness, the reward — each with the icon that means it. */
const HINTS: { icon: IconName; text: string }[] = [
  { icon: 'thread', text: 'Connect the stars.' },
  { icon: 'star', text: 'Glitches deceive — wrong pairs shake.' },
  { icon: 'moon', text: 'Finish the figure, wake its story.' },
];

const TITLE = 'How to play';

/** What the card's button says when it is about to hand over a puzzle. */
export const OPEN_THE_SKY = 'Play';

const DEPTH = 60;

/** Below this width the type tightens, as everywhere else in the game. */
const NARROW_W = 380;

/** The gutter each hint's icon sits in, so all three sentences share a left edge. */
const BULLET_COLUMN = space.xxl;

/** True the first time anyone plays on this device. */
export function needsOnboarding(): boolean {
  return !prefs.onboarded;
}

/**
 * A modal card over whatever raised it. `onClose` runs once, after the card has
 * gone; the scene underneath is untouched and waiting.
 *
 * `buttonLabel` is the only thing that changes between the two callers: from
 * `Play` the button opens the puzzle behind the card, from the menu it just
 * puts the card away.
 */
export class Onboarding {
  private scene: Scene;
  private layer: GameObjects.Container | null = null;
  private onClose: () => void;
  private buttonLabel: string;
  private closing = false;

  constructor(scene: Scene, onClose: () => void, buttonLabel: string = OPEN_THE_SKY) {
    this.scene = scene;
    this.onClose = onClose;
    this.buttonLabel = buttonLabel;
  }

  /** Build (or rebuild, on resize) the card at this size. */
  layout(view: Viewport): void {
    if (this.closing) return;

    const first = !this.layer;
    this.layer?.destroy();

    const { w, h } = view;
    const narrow = w < NARROW_W;
    const cardW = Math.min(w - gutter(view) * 2, 460);
    const padX = space.xl;
    const wrap = cardW - padX * 2 - BULLET_COLUMN;

    // Purely a veil. Nothing here is interactive: a full-screen hit area — on the
    // scrim or on the container around it — wins the pointer against the button
    // sitting on top of it, and the card can then never be dismissed. The stars
    // underneath are held off by `Play`'s own guard while this card exists.
    const scrim = this.scene.add.graphics();
    scrim.fillStyle(color.void, alpha.scrim);
    scrim.fillRect(-w / 2, -h / 2, w, h);

    const title = crispText(this.scene, 0, 0, TITLE, {
      fontFamily: font.serif,
      fontSize: `${narrow ? typeScale.title : typeScale.heading}px`,
      color: ink.accent,
      fontStyle: 'italic',
    }).setOrigin(0.5, 0);

    const bodySize = narrow ? typeScale.caption : typeScale.body;

    const rows = HINTS.map(({ icon, text }) => {
      const bullet = drawIcon(this.scene, icon, iconSize.hint);
      const body = crispText(this.scene, 0, 0, text, {
        fontFamily: font.sans,
        fontSize: `${bodySize}px`,
        color: ink.body,
        lineSpacing: space.xs,
        wordWrap: { width: wrap },
      }).setOrigin(0, 0);
      return { bullet, body };
    });

    const button = new Pill(this.scene, this.buttonLabel, { height: control.lg, minWidth: 200 }, () =>
      this.close()
    );

    /* Measure the flow, then place it around the card's centre. */

    const padTop = space.xl;
    const titleGap = space.xl;
    const rowGap = space.lg;
    const buttonGap = space.xl;
    const padBottom = space.xl;

    const rowHeights = rows.map(({ body }) => Math.max(iconSize.hint, body.height));
    const cardH =
      padTop +
      title.height +
      titleGap +
      rowHeights.reduce((sum, height) => sum + height + rowGap, 0) -
      rowGap +
      buttonGap +
      control.lg +
      padBottom;

    const top = -cardH / 2;
    let y = top + padTop;

    title.setY(y);
    y += title.height + titleGap;

    const textLeft = -cardW / 2 + padX + BULLET_COLUMN;
    rows.forEach(({ bullet, body }, i) => {
      // The icon draws from its centre, so it is hung on the middle of the
      // sentence's *first* line — not on the middle of a three-line paragraph.
      bullet.setPosition(-cardW / 2 + padX + iconSize.hint / 2, y + bodySize * 0.62);
      body.setPosition(textLeft, y);
      y += rowHeights[i]! + rowGap;
    });
    y += buttonGap - rowGap;

    button.setPosition(0, y + control.lg / 2);

    const bg = this.scene.add.graphics();
    bg.fillStyle(color.card, alpha.card);
    bg.fillRoundedRect(-cardW / 2, top, cardW, cardH, radius.modal);
    bg.lineStyle(hairline, color.accentGlow, alpha.border);
    bg.strokeRoundedRect(-cardW / 2, top, cardW, cardH, radius.modal);

    const contents: GameObjects.GameObject[] = [scrim, bg, title, button.container];
    for (const { bullet, body } of rows) contents.push(bullet, body);

    const layer = this.scene.add.container(w / 2, h / 2, contents).setDepth(DEPTH);
    this.layer = layer;

    // A veil is light, not movement: it arrives softly under stillness too.
    if (first) {
      layer.setAlpha(0);
      tween(this.scene, { targets: layer, alpha: 1, duration: duration.slow });
    }
  }

  destroy(): void {
    this.layer?.destroy();
    this.layer = null;
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    prefs.set({ onboarded: true });

    const layer = this.layer;
    if (!layer) {
      this.onClose();
      return;
    }

    tween(this.scene, {
      targets: layer,
      alpha: 0,
      duration: duration.base,
      ease: ease.in,
      onComplete: () => {
        this.destroy();
        this.onClose();
      },
    });
  }
}
