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
 * Stories are intentionally read by the player. Taara does not auto-play or
 * synthesize narration, so the quiet ending remains quiet on every device.
 */

import { Scene, GameObjects } from 'phaser';
import type { LocalizedStory } from '../../shared/constellations';
import { crispText } from './display';
import { clamp, gutter, margin, type Viewport } from './frame';
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
  /** Approved Telugu copy for this same constellation. */
  telugu?: LocalizedStory;
  buttonLabel: string;
  onButton: () => void;
  /** A quiet line under the story, e.g. the night it was revealed. */
  note?: string;
  depth?: number;
}

export class StoryCard {
  private scene: Scene;
  private options: StoryCardOptions;
  private card: GameObjects.Container | null = null;
  private language: 'en' | 'te';
  /** True from the moment the card starts leaving, so its buttons go quiet. */
  private hiding = false;

  constructor(scene: Scene, options: StoryCardOptions) {
    this.scene = scene;
    this.options = options;
    this.language = options.telugu ? prefs.storyLanguage : 'en';
  }

  /**
   * Build the card for this viewport. `animate` plays the entrance; a rebuild
   * after a resize should not replay the reveal, so it passes false.
   */
  show(view: Viewport, animate: boolean): void {
    if (this.hiding) return;

    const { w, h } = view;
    const { name, story, telugu, note, buttonLabel, onButton, depth = 40 } = this.options;
    const showingTelugu = this.language === 'te' && telugu !== undefined;
    const displayName = showingTelugu ? telugu.title : name;
    const displayStory = showingTelugu ? `${telugu.story}\n\n✦\n${telugu.fact}` : story;

    this.card?.destroy();

    const maxH = h - margin(view) * 2;
    const cardW = Math.min(w - gutter(view) * 2, 560);
    // The card's own inner padding, left and right. The story never runs to its edge.
    const padX = space.xl;
    const wrap = cardW - padX * 2;

    const padTop = space.xl;
    const gap = space.lg;
    const noteGap = space.md;
    const btnGap = space.xl;
    const padBottom = space.xl;

    const title = crispText(this.scene, 0, 0, displayName, {
      fontFamily: showingTelugu ? font.telugu : font.serif,
      fontSize: `${clamp(typeScale.title, w * 0.075, typeScale.display)}px`,
      color: ink.accent,
      align: 'center',
      fontStyle: 'italic',
      wordWrap: { width: wrap },
    }).setOrigin(0.5);
    title.setShadow(0, 0, hex(color.accentGlow), glow.soft, true, true);

    const body = crispText(this.scene, 0, 0, displayStory, {
      fontFamily: showingTelugu ? font.telugu : font.serif,
      fontSize: `${typeScale.lead}px`,
      color: ink.bright,
      align: 'center',
      lineSpacing: showingTelugu ? 3 : 7,
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
    const language = telugu
      ? new Pill(
          this.scene,
          showingTelugu ? 'English' : 'తెలుగు',
          { height: control.sm, minWidth: 88, fontSize: typeScale.caption, paddingX: space.md },
          () => {
            this.language = showingTelugu ? 'en' : 'te';
            prefs.set({ storyLanguage: this.language });
            this.show(view, false);
          }
        )
      : null;
    language?.setActive(showingTelugu);

    const noteBlock = footnote ? noteGap + footnote.height : 0;
    const cardHeight = (): number =>
      padTop + title.height + gap + body.height + noteBlock + btnGap + control.md + padBottom;

    let size = showingTelugu || w < NARROW_W ? typeScale.body : typeScale.lead;
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
    const buttonTop = above.y + above.height / 2;
    const footerY = buttonTop + btnGap + control.md / 2;
    if (language) {
      const footerGap = space.sm;
      const languageW = 88;
      const closeW = 200;
      const footerW = languageW + footerGap + closeW;
      language.setPosition(-footerW / 2 + languageW / 2, footerY);
      button.container.setPosition(footerW / 2 - closeW / 2, footerY);
    } else {
      button.container.setY(footerY);
    }

    const bg = this.scene.add.graphics();
    bg.fillStyle(color.card, alpha.card);
    bg.fillRoundedRect(-cardW / 2, top, cardW, cardH, radius.modal);
    bg.lineStyle(hairline, color.accentGlow, alpha.border);
    bg.strokeRoundedRect(-cardW / 2, top, cardW, cardH, radius.modal);

    const parts: GameObjects.GameObject[] = [bg];
    if (language) parts.push(language.container);
    parts.push(title, body);
    if (footnote) parts.push(footnote);
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
    this.card?.destroy();
    this.card = null;
  }
}
