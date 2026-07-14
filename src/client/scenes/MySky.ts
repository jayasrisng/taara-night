/**
 * My Sky — every constellation at once, where it really is.
 *
 * Not a gallery of thumbnails: one continuous dome, projected from the same
 * catalogue coordinates the puzzle is drawn from (see `shared/skyMap.ts`). The
 * constellations you have revealed burn gold and carry their names. The ones you
 * have not are only faint, unlabelled stars among the dust — the shape and the
 * name stay secret until the night you draw them.
 *
 * Drag to wander, pinch or scroll to zoom, tap a lit constellation to read its
 * story again. Nothing is drawn in a scaled container: the dome's transform is a
 * `zoom` (pixels per map unit) and a `centre`, and every star, thread and label
 * is repositioned in screen pixels when either changes. So the line-work is one
 * pixel wide at every zoom and the labels never blur.
 */

import * as Phaser from 'phaser';
import { Scene, GameObjects } from 'phaser';
import { getConstellationById } from '../../shared/constellationLoader';
import {
  SKY_BOUNDS,
  SKY_FIGURES,
  nearestStar,
  projectSkyNear,
  yForDec,
  type MapPoint,
  type SkyFigure,
} from '../../shared/skyMap';
import { fetchMySky } from '../api';
import { NightSky } from '../ui/NightSky';
import { crispText, texScale } from '../ui/display';
import { clamp, contentWidth, gutter, margin, type Viewport } from '../ui/frame';
import { onLayout } from '../ui/layout';
import { duration, ease, enter, leaveTo, motion, tween } from '../ui/motion';
import { Pill } from '../ui/Pill';
import { prefs } from '../ui/prefs';
import { StoryCard } from '../ui/StoryCard';
import { color, control, font, hairline, ink, space, typeScale } from '../ui/theme';
import { TEX } from '../ui/textures';
import {
  CONSTELLATION_ATLAS,
  constellationArtFrame,
  fitConstellationArt,
} from '../ui/constellationArt';
import type { ResultsData } from './Results';

/** Parallels drawn faintly for orientation, plus the rim of the dome itself. */
const RINGS = [60, 30, 0];

/** How far a tap may miss a star and still find it, in CSS pixels. */
const TAP_RADIUS = 26;
/** Past this much movement, a press was a drag and not a tap. */
const TAP_THRESHOLD = 12;

/** Zoom limits, as multiples of the scale that frames the whole sky. */
const MAX_ZOOM = 8;
/** Names crowd each other when the sky is small; they appear as you lean in. */
const LABEL_ZOOM = 1.6;
/** Star designations need more room than constellation names: a deeper zoom. */
const STAR_LABEL_ZOOM = 2.6;

/** Anything this far outside the viewport is not drawn at all. */
const CULL = 48;

/** How fast a flick decays, in milliseconds to 1/e of its speed. */
// Tuned down from 130: on the flat chart a flick was sailing whole
// constellations off the screen before it settled.
const GLIDE_DECAY = 70;
/** Below this speed (map units per ms) the sky has come to rest. */
const GLIDE_STOP = 0.00002;

export type MySkyData = {
  /**
   * The constellation just revealed. It is lit and centred on arrival even when
   * nothing was recorded — a signed-out player still gets to see what they drew
   * take its place in the sky.
   */
  tonight?: { constellationId: string; night: number };
  /** Where "Back" goes. Carries the Results screen's state so it returns unchanged. */
  results?: ResultsData;
};

/** A constellation's glow sprites, kept so a pan only moves them. */
interface FigureView {
  figure: SkyFigure;
  /** A quiet atlas figure, visible only after this constellation is gathered. */
  art: GameObjects.Image;
  glows: GameObjects.Image[];
  label: GameObjects.Text | null;
  /** Per-star designations, built only when the setting asks for them. */
  starLabels: GameObjects.Text[];
}

export class MySky extends Scene {
  private params: MySkyData = {};

  private sky!: NightSky;
  private view: Viewport = { w: 0, h: 0 };

  private layer!: GameObjects.Container;
  private ringGfx!: GameObjects.Graphics;
  private threadGfx!: GameObjects.Graphics;
  private labelLeaderGfx!: GameObjects.Graphics;
  private artLayer!: GameObjects.Container;
  /** Glow sprites live under the star cores, so a core is never washed out by its own halo. */
  private glowLayer!: GameObjects.Container;
  private starGfx!: GameObjects.Graphics;

  private views: FigureView[] = [];

  /** Constellation id → the night it was revealed. Empty until the server answers. */
  private gathered = new Map<string, number>();
  private answered = false;
  private reachable = true;
  // The dome’s transform: `zoom` pixels per map unit, `centre` at mid-screen.
  private zoom = 1;
  private fitZoom = 1;
  private centre: MapPoint = { ...SKY_BOUNDS.centre };
  /** False until the first layout has framed the sky. */
  private framed = false;

  // Input.
  private dragging = false;
  private pinching = false;
  private pinchDistance = 0;
  private pinchMidX = 0;
  private pinchMidY = 0;
  private downX = 0;
  private downY = 0;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private lastMoveAt = 0;
  private velocity = { x: 0, y: 0 };

  private card: StoryCard | null = null;
  /** The gentle breathing of the constellation revealed tonight. */
  private pulse = 0;

  private ui: GameObjects.GameObject[] = [];
  private pills: Pill[] = [];
  private subtitle: GameObjects.Text | null = null;
  private hint: GameObjects.Text | null = null;
  /** The band of screen the HUD owns. Constellation names keep out of it. */
  private hudTop = 0;
  private hudBottom = 0;

  constructor() {
    super('MySky');
  }

  init(data: MySkyData): void {
    this.params = data ?? {};
    this.views = [];
    this.ui = [];
    this.pills = [];
    this.gathered = new Map();
    this.answered = false;
    this.reachable = true;
    this.framed = false;
    this.card = null;
    this.subtitle = null;
    this.hint = null;
    this.dragging = false;
    this.pinching = false;
    this.velocity = { x: 0, y: 0 };
    this.pulse = 0;

    // Lit before the server confirms it: the player watched themselves draw it.
    if (data?.tonight) this.gathered.set(data.tonight.constellationId, data.tonight.night);
  }

  create(): void {
    // This scene already draws the real catalogue. Decorative stars would look
    // like extra puzzle nodes and make the chart impossible to read.
    this.sky = new NightSky(this, this.params.tonight?.night ?? 1, {
      stars: false,
      shootingStars: false,
      moon: { nx: 0.88, ny: 0.24, scale: 0.62, alpha: 0.56 },
    });

    this.ringGfx = this.add.graphics();
    this.threadGfx = this.add.graphics();
    this.labelLeaderGfx = this.add.graphics();
    this.artLayer = this.add.container(0, 0);
    this.glowLayer = this.add.container(0, 0);
    this.starGfx = this.add.graphics();
    this.layer = this.add
      .container(0, 0, [
        this.ringGfx,
        this.artLayer,
        this.threadGfx,
        this.glowLayer,
        this.starGfx,
        this.labelLeaderGfx,
      ])
      .setDepth(1);

    this.buildFigures();
    onLayout(this, (view) => this.layout(view));
    this.registerInput();

    // Tonight's constellation breathes. Held still it simply rests at its
    // brightest — a pulse frozen at its trough would leave the newest sky the
    // dimmest thing on the dome.
    const breathing = motion(this, {
      targets: this,
      pulse: 1,
      duration: duration.breath,
      yoyo: true,
      repeat: -1,
      ease: ease.inOut,
      onUpdate: () => this.drawThreads(),
    });
    if (!breathing) {
      this.pulse = 1;
      this.drawThreads();
    }

    void this.loadSky();
    enter(this);
  }

  override update(_time: number, delta: number): void {
    if (this.dragging || this.pinching || this.busy()) return;

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed < GLIDE_STOP) return;

    this.setCentre(this.centre.x + this.velocity.x * delta, this.centre.y + this.velocity.y * delta);

    const decay = Math.exp(-delta / GLIDE_DECAY);
    this.velocity.x *= decay;
    this.velocity.y *= decay;
    this.redraw();
  }

  /* ---------------------------------------------------------------- *
   *  Data
   * ---------------------------------------------------------------- */

  private async loadSky(): Promise<void> {
    const mine = await fetchMySky();
    if (!this.scene.isActive()) return;

    this.answered = true;
    this.reachable = mine !== null;
    for (const entry of mine?.entries ?? []) {
      this.gathered.set(entry.constellationId, entry.night);
    }

    this.buildFigures();
    this.redraw();
    this.updateCaptions();
  }

  private isLit(figure: SkyFigure): boolean {
    return this.gathered.has(figure.id);
  }

  private isTonight(figure: SkyFigure): boolean {
    return this.params.tonight?.constellationId === figure.id;
  }

  private subtitleText(): string {
    const lit = this.gathered.size;
    if (!this.answered && lit === 0) return 'Opening your sky…';
    if (!this.reachable && lit === 0) return 'Your sky is out of reach right now';
    if (lit === 0) return 'Every constellation you reveal is lit here, night after night';
    return `${lit} of ${SKY_FIGURES.length} skies gathered`;
  }

  /**
   * Both captions describe what the server has just said, so both are rewritten
   * when it answers — the hint only invites a tap once there is something lit to
   * tap. Rewritten in place rather than by a re-layout, which would jump the sky.
   */
  private updateCaptions(): void {
    this.subtitle?.setText(this.subtitleText());
    this.hint?.setText(this.hintText());
  }

  /* ---------------------------------------------------------------- *
   *  The dome
   * ---------------------------------------------------------------- */

  /**
   * A glow sprite and a name for every gathered constellation. The sleeping ones
   * need neither: they are drawn as plain dots straight into `starGfx`.
   */
  private buildFigures(): void {
    for (const view of this.views) {
      view.art.destroy();
      view.glows.forEach((glow) => glow.destroy());
      view.label?.destroy();
      view.starLabels.forEach((label) => label.destroy());
    }
    this.views = [];

    for (const figure of SKY_FIGURES) {
      if (!this.isLit(figure)) continue;

      const art = this.add
        .image(0, 0, CONSTELLATION_ATLAS, figure.id)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setTint(0xabc9e8)
        .setAlpha(this.isTonight(figure) ? 0.62 : this.isLit(figure) ? 0.46 : 0.36);
      this.artLayer.add(art);

      const starPalette = [0xffffff, 0xd9e9ff, 0xffedcb, 0xc7dcff];
      const glows = figure.points.map((_, index) =>
        this.add
          .image(0, 0, TEX.starSoft)
          .setScale(texScale(0.24 + ((index * 37 + figure.id.length * 11) % 7) * 0.018))
          .setTint(starPalette[(index + figure.id.length) % starPalette.length]!)
          .setAlpha(0.9)
      );

      const label = crispText(this, 0, 0, figure.name, {
        fontFamily: font.serif,
        fontSize: `${typeScale.caption}px`,
        color: ink.accent,
      }).setOrigin(0.5);
      label.setAlpha(0.85);

      // The stars of a gathered sky may carry their own names — a quiet
      // education, shown only when the setting asks and the zoom gives room.
      const starLabels = prefs.starNames
        ? figure.starNames.map((name) =>
            crispText(this, 0, 0, name, {
              fontFamily: font.sans,
              fontSize: `${typeScale.micro}px`,
              color: ink.muted,
            })
              .setOrigin(0.5)
              .setAlpha(0.8)
          )
        : [];

      this.glowLayer.add(glows);
      this.layer.add(label);
      starLabels.forEach((starLabel) => this.layer.add(starLabel));
      this.views.push({ figure, art, glows, label, starLabels });
    }
  }

  private toScreen(point: MapPoint): MapPoint {
    return {
      x: this.view.w / 2 + (point.x - this.centre.x) * this.zoom,
      y: this.view.h / 2 + (point.y - this.centre.y) * this.zoom,
    };
  }

  private toMap(x: number, y: number): MapPoint {
    return {
      x: this.centre.x + (x - this.view.w / 2) / this.zoom,
      y: this.centre.y + (y - this.view.h / 2) / this.zoom,
    };
  }

  private onScreen(point: MapPoint): boolean {
    return (
      point.x > -CULL && point.x < this.view.w + CULL && point.y > -CULL && point.y < this.view.h + CULL
    );
  }

  /**
   * Keep the sky in the frame. Per axis: if the whole sky already fits, the dome
   * is pinned — it cannot be flicked away into the empty rim. Otherwise the
   * middle of the screen may go anywhere inside the rectangle the constellations
   * occupy, so every one of them can be brought to the centre. (Clamping the
   * *viewport* to that rectangle instead would put Orion and Scorpius, which sit
   * on its edge, permanently out of reach.)
   */
  private setCentre(x: number, y: number): void {
    const halfW = this.view.w / 2 / this.zoom;
    const halfH = this.view.h / 2 / this.zoom;
    const slackX = halfW >= SKY_BOUNDS.width / 2 ? 0 : SKY_BOUNDS.width / 2;
    const slackY = halfH >= SKY_BOUNDS.height / 2 ? 0 : SKY_BOUNDS.height / 2;

    this.centre = {
      x: clamp(SKY_BOUNDS.centre.x - slackX, x, SKY_BOUNDS.centre.x + slackX),
      y: clamp(SKY_BOUNDS.centre.y - slackY, y, SKY_BOUNDS.centre.y + slackY),
    };

    if (this.centre.x !== x) this.velocity.x = 0;
    if (this.centre.y !== y) this.velocity.y = 0;
  }

  private setZoom(next: number): void {
    this.zoom = clamp(this.fitZoom, next, this.fitZoom * MAX_ZOOM);
  }

  /* ---------------------------------------------------------------- *
   *  Drawing
   * ---------------------------------------------------------------- */

  private redraw(): void {
    this.drawRings();
    this.drawArt();
    this.drawThreads();
    this.drawStars();
    this.drawLabels();
  }

  /** Unlocked myths turn the mathematically real chart into a living atlas. */
  private drawArt(): void {
    const zoomRatio = this.zoom / this.fitZoom;
    // A whole-sky chart needs linework, not 88 overlapping paintings. The myth
    // illustration fades in once its individual figure has enough room.
    const artDetail = clamp(0, (zoomRatio - 1.12) / 0.88, 1);

    for (const view of this.views) {
      const centre = this.toScreen(view.figure.centre);
      const visible = this.onScreen(centre);
      const frame = constellationArtFrame(view.figure.id, 'atlas');
      const targets = frame?.anchors.map((anchor) => this.toScreen(projectSkyNear(anchor, view.figure.centre.x))) ?? [];
      const transform = frame ? fitConstellationArt(frame, targets) : null;
      view.art.setVisible(visible && artDetail > 0.01);
      if (transform) {
        view.art
          .setPosition(transform.x, transform.y)
          .setRotation(transform.rotation)
          .setScale(transform.scaleX, transform.scaleY);
      }
      view.art.setAlpha(artDetail * (
        this.isTonight(view.figure)
          ? 0.5 + 0.13 * this.pulse
          : this.isLit(view.figure)
            ? 0.46
            : 0.36
      ));
    }
  }

  /**
   * Parallels of declination — on a north-up chart they are quiet horizontal
   * lines, the graticule of every atlas page. Off-screen parallels are skipped.
   */
  private drawRings(): void {
    this.ringGfx.clear();

    const line = (dec: number, alpha: number): void => {
      const y = this.toScreen({ x: 0, y: yForDec(dec) }).y;
      if (y < -CULL || y > this.view.h + CULL) return;
      this.ringGfx.lineStyle(hairline, color.line, alpha);
      this.ringGfx.lineBetween(0, y, this.view.w, y);
    };

    for (const dec of RINGS) line(dec, 0.5);
    line(0, 0.7);
  }

  /** Only gathered constellations have threads. A sleeping shape is the spoiler. */
  private drawThreads(): void {
    this.threadGfx.clear();

    // At atlas scale, use cartographic hairlines. Detail and glow return only
    // as the player leans into a constellation.
    const zoomRatio = this.zoom / this.fitZoom;
    const detail = clamp(0, (zoomRatio - 1) / 1.8, 1);
    const glowDetail = clamp(0, (zoomRatio - 1.35) / 1.4, 1);
    const coreWidth = 0.7 + 1.2 * detail;

    for (const { figure } of this.views) {
      const breath = this.isTonight(figure) ? 0.55 + 0.45 * this.pulse : 0.7;

      for (const edge of figure.connections) {
        const a = this.toScreen(figure.points[edge.from]!);
        const b = this.toScreen(figure.points[edge.to]!);
        if (!this.onScreen(a) && !this.onScreen(b)) continue;

        if (glowDetail > 0) {
          this.threadGfx.lineStyle(2 + 6 * glowDetail, color.accentGlow, 0.12 * glowDetail * breath);
          this.threadGfx.lineBetween(a.x, a.y, b.x, b.y);
        }
        this.threadGfx.lineStyle(coreWidth, color.accentBright, (0.66 + 0.32 * detail) * breath);
        this.threadGfx.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  }

  /**
   * Sleeping stars are dots. Gathered ones are dots with a glow sprite behind
   * them, which is why they are the only stars that own a game object.
   */
  private drawStars(): void {
    this.starGfx.clear();

    const zoomRatio = this.zoom / this.fitZoom;
    const detail = clamp(0, (zoomRatio - 1) / 1.8, 1);
    const showGlows = zoomRatio >= 1.65;

    for (const figure of SKY_FIGURES) {
      if (this.isLit(figure)) continue;
      for (const star of figure.points) {
        const point = this.toScreen(star);
        if (!this.onScreen(point)) continue;
        this.starGfx.fillStyle(color.sleeping, 0.68);
        this.starGfx.fillCircle(point.x, point.y, 0.65 + 0.75 * detail);
      }
    }

    for (const view of this.views) {
      view.figure.points.forEach((star, index) => {
        const point = this.toScreen(star);
        const visible = this.onScreen(point);
        const glow = view.glows[index]!;
        const baseGlow = 0.24 + ((index * 37 + view.figure.id.length * 11) % 7) * 0.018;
        glow
          .setVisible(visible && showGlows)
          .setPosition(point.x, point.y)
          .setScale(texScale(baseGlow * (0.45 + 0.55 * detail)));
        if (!visible) return;
        const palette = [0xffffff, 0xd9e9ff, 0xffedcb, 0xc7dcff];
        const tint = palette[(index + view.figure.id.length) % palette.length]!;
        const variation = ((index * 17 + view.figure.id.length) % 5) / 4;
        const radius = 0.62 + variation * 0.32 + detail * (1.55 + variation * 0.6);
        this.starGfx.fillStyle(tint, 0.82 + 0.18 * detail);
        this.starGfx.fillCircle(point.x, point.y, radius);
      });
    }
  }

  /**
   * A name hangs below its constellation, and only once you have leaned in —
   * at the whole-sky zoom nineteen of them would sit on top of each other.
   *
   * It also stays out of the bands the HUD occupies. A gold name drifting under
   * the "My Sky" title reads as a mistake, and the sky is right there to pan.
   */
  private drawLabels(): void {
    const showing = this.zoom >= this.fitZoom * LABEL_ZOOM;
    const placedLabels: { x1: number; y1: number; x2: number; y2: number }[] = [];
    this.labelLeaderGfx.clear();

    for (const view of this.views) {
      const label = view.label;
      if (!label) continue;

      const points = view.figure.points.map((point) => this.toScreen(point));
      const top = points.reduce((best, point) => (point.y < best.y ? point : best));
      const bottom = points.reduce((best, point) => (point.y > best.y ? point : best));
      const left = points.reduce((best, point) => (point.x < best.x ? point : best));
      const right = points.reduce((best, point) => (point.x > best.x ? point : best));
      const gap = 7;
      const candidates = [
        { anchor: bottom, x: bottom.x, y: bottom.y + gap + label.height / 2, side: 'bottom' },
        { anchor: top, x: top.x, y: top.y - gap - label.height / 2, side: 'top' },
        { anchor: right, x: right.x + gap + label.width / 2, y: right.y, side: 'right' },
        { anchor: left, x: left.x - gap - label.width / 2, y: left.y, side: 'left' },
      ] as const;

      const placement = showing
        ? candidates.find((candidate) => {
            const rect = {
              x1: candidate.x - label.width / 2 - 3,
              y1: candidate.y - label.height / 2 - 2,
              x2: candidate.x + label.width / 2 + 3,
              y2: candidate.y + label.height / 2 + 2,
            };
            const inFrame =
              rect.x1 >= 0 &&
              rect.x2 <= this.view.w &&
              rect.y1 > this.hudTop &&
              rect.y2 < this.hudBottom;
            const open = !placedLabels.some(
              (other) => rect.x1 < other.x2 && rect.x2 > other.x1 && rect.y1 < other.y2 && rect.y2 > other.y1
            );
            if (inFrame && open) {
              placedLabels.push(rect);
              return true;
            }
            return false;
          })
        : undefined;

      label.setVisible(placement !== undefined);
      if (placement) {
        label.setPosition(placement.x, placement.y);
        const end = { x: placement.x, y: placement.y };
        if (placement.side === 'bottom') end.y -= label.height / 2;
        if (placement.side === 'top') end.y += label.height / 2;
        if (placement.side === 'right') end.x -= label.width / 2;
        if (placement.side === 'left') end.x += label.width / 2;
        this.labelLeaderGfx.lineStyle(hairline, color.accentBright, 0.46);
        this.labelLeaderGfx.lineBetween(placement.anchor.x, placement.anchor.y, end.x, end.y);
      }

      const naming = this.zoom >= this.fitZoom * STAR_LABEL_ZOOM;
      const fc = this.toScreen(view.figure.centre);
      const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
      view.starLabels.forEach((starLabel, i) => {
        const p = this.toScreen(view.figure.points[i]!);
        const dx = p.x - fc.x;
        const dy = p.y - fc.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const lx = p.x + (dx / len) * (12 + starLabel.width / 2);
        const ly = p.y + (dy / len) * (12 + starLabel.height);
        starLabel.setPosition(lx, ly);
        const rect = {
          x1: lx - starLabel.width / 2,
          y1: ly - starLabel.height / 2,
          x2: lx + starLabel.width / 2,
          y2: ly + starLabel.height / 2,
        };
        const clear = !placed.some((q) => rect.x1 < q.x2 && rect.x2 > q.x1 && rect.y1 < q.y2 && rect.y2 > q.y1);
        if (clear) placed.push(rect);
        const inBand = ly > this.hudTop && ly + starLabel.height < this.hudBottom;
        starLabel.setVisible(naming && clear && inBand && this.onScreen({ x: lx, y: ly }));
      });
    }
  }

  /* ---------------------------------------------------------------- *
   *  Layout
   * ---------------------------------------------------------------- */

  private layout(view: Viewport): void {
    this.view = view;
    const { w, h } = view;
    this.sky.layout(view);

    this.ui.forEach((object) => object.destroy());
    this.pills.forEach((pill) => pill.destroy());
    this.ui = [];
    this.pills = [];

    const sidePad = gutter(view);
    const edge = margin(view);

    /* ---- the sky is framed before anything is drawn on top of it ---- */

    // The whole sky, inside the same frame everything else respects, is the most
    // zoomed-out the dome ever gets.
    this.fitZoom = Math.min((w - sidePad * 2) / SKY_BOUNDS.width, (h - edge * 2) / SKY_BOUNDS.height);

    if (!this.framed) {
      this.framed = true;
      this.frameOn(this.openingFigure());
    } else {
      this.setZoom(this.zoom);
      this.setCentre(this.centre.x, this.centre.y);
    }

    /* ---- the HUD floats over it ---- */

    const rowY = edge + control.md / 2;
    const back = new Pill(this, '‹ Back', { minWidth: 72 }, () => this.leave());
    back.setPosition(sidePad + back.width / 2, rowY);
    this.pills.push(back);

    const whole = new Pill(this, '⤢', { minWidth: control.md, paddingX: space.sm }, () => this.frameWholeSky());
    whole.setPosition(w - sidePad - whole.width / 2, rowY);
    this.pills.push(whole);

    // Star names, right where the stars are: relabelling is a rebuild, since
    // the labels only exist while the setting asks for them.
    const names = new Pill(this, '', { minWidth: control.md, paddingX: space.sm, icon: 'star' }, () => {
      prefs.set({ starNames: !prefs.starNames });
      names.setActive(prefs.starNames);
      this.buildFigures();
      this.redraw();
    });
    names.setActive(prefs.starNames);
    names.setPosition(w - sidePad - whole.width - space.sm - names.width / 2, rowY);
    this.pills.push(names);

    const flank = Math.max(back.width, whole.width + space.sm + names.width);
    const title = crispText(this, w / 2, rowY, 'My Sky', {
      fontFamily: font.serif,
      fontSize: `${typeScale.title}px`,
      color: ink.bright,
    }).setOrigin(0.5);
    // Drops to its own row rather than running through the pills on a narrow phone.
    if (title.width > w - 2 * (sidePad + flank) - space.xl) {
      title.setY(edge + control.md + space.sm + title.height / 2);
    }
    this.ui.push(title);

    const subtitle = crispText(this, w / 2, title.y + title.height / 2 + space.xs, this.subtitleText(), {
      fontFamily: font.sans,
      fontSize: `${typeScale.caption}px`,
      color: ink.muted,
      align: 'center',
      wordWrap: { width: contentWidth(view) },
    }).setOrigin(0.5, 0);
    this.subtitle = subtitle;
    this.ui.push(subtitle);
    this.hudTop = Math.max(subtitle.y + subtitle.height, rowY + control.md / 2) + space.xs;

    const hint = crispText(this, w / 2, h - edge, this.hintText(), {
      fontFamily: font.sans,
      fontSize: `${typeScale.micro}px`,
      color: ink.faint,
      align: 'center',
      wordWrap: { width: contentWidth(view) },
    }).setOrigin(0.5, 1);
    this.hint = hint;
    this.ui.push(hint);
    this.hudBottom = hint.y - hint.height - space.xs;

    this.redraw();
    this.card?.show(view, false);
  }

  private hintText(): string {
    return this.gathered.size > 0
      ? 'Drag to wander · pinch or scroll to zoom · tap a lit constellation'
      : 'Drag to wander · pinch or scroll to zoom';
  }

  /** Where the dome opens: on tonight's constellation, else on the whole sky. */
  private openingFigure(): SkyFigure | null {
    const id = this.params.tonight?.constellationId;
    return SKY_FIGURES.find((figure) => figure.id === id) ?? null;
  }

  /** Frame one constellation comfortably, or the whole sky when there is none. */
  private frameOn(figure: SkyFigure | null): void {
    if (!figure) {
      this.zoom = this.fitZoom;
      this.setCentre(SKY_BOUNDS.centre.x, SKY_BOUNDS.centre.y);
      return;
    }
    const shortSide = Math.min(this.view.w, this.view.h);
    this.setZoom((shortSide * 0.34) / Math.max(figure.radius, 0.02));
    this.setCentre(figure.centre.x, figure.centre.y);
  }

  private frameWholeSky(): void {
    this.velocity = { x: 0, y: 0 };

    const target = { zoom: this.fitZoom, x: SKY_BOUNDS.centre.x, y: SKY_BOUNDS.centre.y };
    const from = { zoom: this.zoom, x: this.centre.x, y: this.centre.y };

    // The whole dome travelling back to its frame is movement by definition.
    const glide = motion(this, {
      targets: from,
      ...target,
      duration: duration.slow,
      ease: ease.inOut,
      onUpdate: () => {
        this.zoom = from.zoom;
        this.setCentre(from.x, from.y);
        this.redraw();
      },
    });

    if (!glide) {
      this.zoom = target.zoom;
      this.setCentre(target.x, target.y);
      this.redraw();
    }
  }

  /** Zoom about a point on screen, so whatever is under the fingers stays there. */
  private zoomAt(x: number, y: number, factor: number): void {
    const anchor = this.toMap(x, y);
    this.setZoom(this.zoom * factor);
    this.setCentre(anchor.x - (x - this.view.w / 2) / this.zoom, anchor.y - (y - this.view.h / 2) / this.zoom);
    this.redraw();
  }

  /* ---------------------------------------------------------------- *
   *  Input
   * ---------------------------------------------------------------- */

  private registerInput(): void {
    this.input.addPointer(1); // a second finger, for pinch

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.input.keyboard?.on('keydown-ESC', () => this.leave());
  }

  /** The story card is pure paint, so the dome underneath has to be told to hold still. */
  private busy(): boolean {
    return this.card !== null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    // Scene-level handlers fire wherever the press landed, so a press that began
    // on a HUD pill must not also grab the sky — or drag it, or tap a star behind it.
    if (this.busy() || this.input.hitTestPointer(pointer).length > 0) return;

    // The second finger arriving is the pinch starting, right now — waiting for
    // the first move event made the gesture feel like it was being ignored.
    const [first, second] = [this.input.pointer1, this.input.pointer2];
    if (first.isDown && second.isDown) {
      this.dragging = false;
      this.pinch(first, second);
      return;
    }
    this.dragging = true;
    this.moved = 0;
    this.downX = this.lastX = pointer.worldX;
    this.downY = this.lastY = pointer.worldY;
    this.lastMoveAt = performance.now();
    this.velocity = { x: 0, y: 0 };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.busy()) return;

    const [first, second] = [this.input.pointer1, this.input.pointer2];
    if (first.isDown && second.isDown) {
      this.pinch(first, second);
      return;
    }
    if (!this.dragging || !pointer.isDown) return;

    const dx = pointer.worldX - this.lastX;
    const dy = pointer.worldY - this.lastY;
    const now = performance.now();
    const elapsed = Math.max(1, now - this.lastMoveAt);

    this.moved += Math.hypot(dx, dy);
    this.setCentre(this.centre.x - dx / this.zoom, this.centre.y - dy / this.zoom);

    // Map units per millisecond, halved: the glide should finish the gesture,
    // not launch the sky past what the finger meant.
    this.velocity = { x: (-dx / this.zoom / elapsed) * 0.5, y: (-dy / this.zoom / elapsed) * 0.5 };

    this.lastX = pointer.worldX;
    this.lastY = pointer.worldY;
    this.lastMoveAt = now;
    this.redraw();
  }

  /**
   * Two fingers do both jobs at once: their spread scales the sky about their
   * midpoint, and the midpoint's own travel pans it — so a pinch that drifts
   * (every real pinch) follows the hand instead of fighting it.
   */
  private pinch(first: Phaser.Input.Pointer, second: Phaser.Input.Pointer): void {
    const distance = Phaser.Math.Distance.Between(
      first.worldX,
      first.worldY,
      second.worldX,
      second.worldY
    );
    const midX = (first.worldX + second.worldX) / 2;
    const midY = (first.worldY + second.worldY) / 2;

    if (this.pinching && this.pinchDistance > 0 && distance > 0) {
      // One event's ratio is clamped: a mis-read frame (a finger re-landing,
      // a webview hiccup) must nudge the sky, never yank it.
      const factor = Math.max(0.9, Math.min(1.1, distance / this.pinchDistance));
      this.zoomAt(midX, midY, factor);
      this.setCentre(
        this.centre.x - (midX - this.pinchMidX) / this.zoom,
        this.centre.y - (midY - this.pinchMidY) / this.zoom
      );
      this.redraw();
    }

    this.pinching = true;
    this.pinchDistance = distance;
    this.pinchMidX = midX;
    this.pinchMidY = midY;
    this.dragging = false;
    this.velocity = { x: 0, y: 0 };
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    const wasPinching = this.pinching;
    const wasDragging = this.dragging;

    if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) {
      this.pinching = false;
      this.pinchDistance = 0;
    }
    this.dragging = false;
    if (this.busy() || wasPinching || !wasDragging) return;

    // A flick that ended in a long pause is a hold, not a throw.
    if (performance.now() - this.lastMoveAt > 80) this.velocity = { x: 0, y: 0 };

    const travelled = Phaser.Math.Distance.Between(this.downX, this.downY, pointer.worldX, pointer.worldY);
    if (this.moved < TAP_THRESHOLD && travelled < TAP_THRESHOLD) {
      this.velocity = { x: 0, y: 0 };
      this.tap(pointer.worldX, pointer.worldY);
    }
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.busy()) return;
    this.zoomAt(pointer.worldX, pointer.worldY, Math.exp(-dy * 0.001));
  }

  /**
   * A tap on a gathered constellation reopens its story. A tap on a sleeping one
   * is answered with a flicker and nothing else — its name is still the reward
   * for the night it comes round again.
   */
  private tap(x: number, y: number): void {
    const hit = nearestStar(SKY_FIGURES, this.toMap(x, y), TAP_RADIUS / this.zoom);
    if (!hit) return;

    if (this.isLit(hit.figure)) this.visit(hit.figure);
    else this.flicker(this.toScreen(hit.figure.points[hit.starIndex]!));
  }

  /** A spark that will not swell is born at the size it would have swelled to. */
  private flicker(point: MapPoint): void {
    const spark = this.add
      .image(point.x, point.y, TEX.starSoft)
      .setScale(texScale(prefs.animate ? 0.16 : 0.4))
      .setTint(color.dust)
      .setAlpha(0.7)
      .setDepth(2);

    tween(this, {
      targets: spark,
      scale: texScale(0.55),
      alpha: 0,
      duration: duration.slow,
      onComplete: () => spark.destroy(),
    });
  }

  /**
   * Glide onto the constellation first — the clear view of its stars *is* the
   * payoff of tapping it — and let the story rise once the sky has settled.
   */
  private visit(figure: SkyFigure): void {
    if (this.card) return;
    this.velocity = { x: 0, y: 0 };

    const shortSide = Math.min(this.view.w, this.view.h);
    const target = {
      zoom: Math.max(this.zoom, (shortSide * 0.34) / Math.max(figure.radius, 0.02)),
      x: figure.centre.x,
      y: figure.centre.y,
    };
    const from = { zoom: this.zoom, x: this.centre.x, y: this.centre.y };
    const settle = motion(this, {
      targets: from,
      ...target,
      duration: duration.slow,
      ease: ease.inOut,
      onUpdate: () => {
        this.zoom = from.zoom;
        this.setCentre(from.x, from.y);
        this.redraw();
      },
      onComplete: () => this.openStory(figure),
    });
    if (!settle) {
      this.zoom = target.zoom;
      this.setCentre(target.x, target.y);
      this.redraw();
      this.openStory(figure);
    }
  }

  private openStory(figure: SkyFigure): void {
    const constellation = getConstellationById(figure.id);
    if (!constellation || this.card) return;

    const night = this.gathered.get(figure.id);
    this.card = new StoryCard(this, {
      name: constellation.name,
      story: constellation.story,
      telugu: constellation.localized.te,
      buttonLabel: 'Close',
      onButton: () => this.closeStory(),
      ...(night ? { note: `Revealed on night #${night}` } : {}),
    });
    this.card.show(this.view, true);
  }

  /** The dome stays deaf until the card has finished leaving — see `busy`. */
  private closeStory(): void {
    this.card?.hide(() => {
      this.card = null;
    });
  }

  private leave(): void {
    if (this.params.results) leaveTo(this, 'Results', this.params.results);
    else leaveTo(this, 'Boot');
  }
}
