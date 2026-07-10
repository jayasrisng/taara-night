/**
 * The bedtime story, on a card.
 *
 * It arrives twice in the game: once as the reward at the end of a puzzle, and
 * again whenever a player taps a constellation they have already lit in My Sky.
 * Same card, same slow fade, different button underneath.
 *
 * The story font steps down until the whole card clears the top and bottom
 * margins, so the reward is never cropped on a short screen. `show` rebuilds the
 * card, which is also how a resize is handled — the text has to re-wrap.
 *
 * Where the browser has a voice, the card offers to read the story aloud, and
 * the night stands back while it does.
 */

import * as Phaser from 'phaser';
import { Scene, GameObjects } from 'phaser';
import { ambience } from '../audio/ambience';
import { narration } from '../audio/narration';
import { crispText } from './display';
import { clamp, gutter, margin, type Viewport } from './frame';
import type { IconName } from './icons';
import { duration, ease, tween } from './motion';
import { Pill } from './Pill';
import { prefs } from './prefs';
import { alpha, color, control, font, glow, hairline, hex, ink, radius, space, typeScale } from './theme';

/** Below this width the type tightens. */
const NARROW_W = 420;

export interface StoryCardOptions {
  /** The constellation's name — safe to show, since the story is the reward for revealing it. */
  name: string;
  story: string;
  buttonLabel: string;
  onButton: () => void;
  /** A quiet line under the story, e.g. the night it was revealed. */
  note?: string;
  depth?: number;
  /** Constellation id, for the shipped narration recording. */
  narrationId?: string;
}

export class StoryCard {
  private scene: Scene;
  private options: StoryCardOptions;
  private card: GameObjects.Container | null = null;
  private readPill: Pill | null = null;
  /** True from the moment the card starts leaving, so its buttons go quiet. */
  private hiding = false;

  constructor(scene: Scene, options: StoryCardOptions) {
    this.scene = scene;
    this.options = options;
    // Leaving the scene must not leave a voice reading to an empty room.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /**
   * Build the card for this viewport. `animate` plays the entrance; a rebuild
   * after a resize should not replay the reveal, so it passes false.
   */
  show(view: Viewport, animate: boolean): void {
    if (this.hiding) return;

    const { w, h } = view;
    const { name, story, note, buttonLabel, onButton, depth = 40 } = this.options;

    this.card?.destroy();
    this.readPill = null;

    const maxH = h - margin(view) * 2;
    const cardW = Math.min(w - gutter(view) * 2, 560);
    // The card's own inner padding, left and right. The story never runs to its edge.
    const padX = space.xl;
    const wrap = cardW - padX * 2;

    const padTop = space.xl;
    const gap = space.lg;
    const noteGap = space.md;
    const readGap = space.md;
    const btnGap = space.xl;
    const padBottom = space.xl;

    const title = crispText(this.scene, 0, 0, name, {
      fontFamily: font.serif,
      fontSize: `${clamp(typeScale.title, w * 0.075, typeScale.display)}px`,
      color: ink.accent,
      align: 'center',
      fontStyle: 'italic',
      wordWrap: { width: wrap },
    }).setOrigin(0.5);
    title.setShadow(0, 0, hex(color.accentGlow), glow.soft, true, true);

    const body = crispText(this.scene, 0, 0, story, {
      fontFamily: font.serif,
      fontSize: `${typeScale.lead}px`,
      color: ink.bright,
      align: 'center',
      lineSpacing: 7,
      wordWrap: { width: wrap },
    }).setOrigin(0.5);

    const footnote = note
      ? crispText(this.scene, 0, 0, note, {
          fontFamily: font.sans,
          fontSize: `${typeScale.caption}px`,
          color: ink.muted,
          align: 'center',
        }).setOrigin(0.5)
      : null;

    const button = new Pill(this.scene, buttonLabel, { minWidth: 200 }, onButton);

    // Offered only where the browser has a voice to offer it with.
    const read = narration.available()
      ? new Pill(this.scene, this.readLabel(), { minWidth: 200, icon: this.readIcon() }, () => this.toggleRead())
      : null;
    this.readPill = read;

    const noteBlock = footnote ? noteGap + footnote.height : 0;
    const readBlock = read ? readGap + control.md : 0;
    const cardHeight = (): number =>
      padTop + title.height + gap + body.height + noteBlock + readBlock + btnGap + control.md + padBottom;

    let size = w < NARROW_W ? typeScale.body : typeScale.lead;
    body.setFontSize(size);
    while (cardHeight() > maxH && size > typeScale.micro) {
      body.setFontSize(--size);
    }

    const cardH = cardHeight();
    const top = -cardH / 2;

    title.setY(top + padTop + title.height / 2);
    body.setY(title.y + title.height / 2 + gap + body.height / 2);
    footnote?.setY(body.y + body.height / 2 + noteGap + footnote.height / 2);

    const above = footnote ?? body;
    const readY = above.y + above.height / 2 + readGap + control.md / 2;
    read?.setPosition(0, readY);
    const buttonTop = read ? readY + control.md / 2 : above.y + above.height / 2;
    button.container.setY(buttonTop + btnGap + control.md / 2);

    const bg = this.scene.add.graphics();
    bg.fillStyle(color.card, alpha.card);
    bg.fillRoundedRect(-cardW / 2, top, cardW, cardH, radius.modal);
    bg.lineStyle(hairline, color.accentGlow, alpha.border);
    bg.strokeRoundedRect(-cardW / 2, top, cardW, cardH, radius.modal);

    const parts: GameObjects.GameObject[] = [bg, title, body];
    if (footnote) parts.push(footnote);
    if (read) parts.push(read.container);
    parts.push(button.container);

    const card = this.scene.add.container(w / 2, h / 2, parts).setDepth(depth);
    this.card = card;

    if (!animate) return;

    // The story always arrives softly; under stillness it arrives without rising.
    card.setAlpha(0);
    if (prefs.animate) card.setY(h / 2 + space.xl);
    tween(this.scene, {
      targets: card,
      alpha: 1,
      y: h / 2,
      duration: duration.story,
    });
  }

  /**
   * Let the card sink back into the sky, then take it away. Nothing else in the
   * game may act on it in the meantime — the second tap of an impatient double
   * tap finds a card that has already agreed to leave.
   */
  hide(onGone?: () => void): void {
    const card = this.card;
    if (this.hiding || !card) return;
    this.hiding = true;
    narration.stop();

    tween(this.scene, {
      targets: card,
      alpha: 0,
      y: card.y + space.md,
      duration: duration.base,
      ease: ease.in,
      onComplete: () => {
        this.destroy();
        onGone?.();
      },
    });
  }

  /** Idempotent: the scene's own shutdown calls it too. */
  destroy(): void {
    // Dropped before the voice stops, because stopping runs the callback that
    // would otherwise put a label on a pill this line is about to destroy.
    this.readPill = null;
    narration.stop();
    this.card?.destroy();
    this.card = null;
  }

  /**
   * A deliberate tap, so it speaks even when the ambient sky is muted — the
   * player asked for a voice, not for sound in general. The night ducks under it
   * and comes back when the last sentence lands or the player interrupts.
   */
  private toggleRead(): void {
    if (this.hiding) return;
    if (narration.speaking) {
      narration.stop();
      return;
    }

    ambience.duck(true);
    narration.read(this.options.narrationId ?? null, this.options.story, () => {
      ambience.duck(false);
      this.refreshReadPill();
    });
    this.refreshReadPill();
  }

  private refreshReadPill(): void {
    this.readPill?.setIcon(this.readIcon()).setLabel(this.readLabel());
  }

  /** Reads the narrator, not a flag, so a rebuilt card knows it is mid-story. */
  private readLabel(): string {
    return narration.speaking ? 'Stop reading' : 'Read aloud';
  }

  /** A crossed-out speaker while it speaks: tapping it is what silences the voice. */
  private readIcon(): IconName {
    return narration.speaking ? 'mute' : 'sound';
  }
}
