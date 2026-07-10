/**
 * Play — the heart of TaaraNight.
 *
 * Connect the real stars to reveal the night's constellation, then a bedtime
 * story rises in as the reward. Drag between stars (or tap one then another) to
 * draw a line; correct edges bloom into being, wrong ones shake gently, and
 * Glitch decoys shimmer cold-cyan but never connect.
 *
 * The puzzle is computed on the client from the shared engine, from the night
 * the menu hands over — the post's own night, so an archive post reveals the
 * constellation it was born under. Without one, tonight is the sensible guess.
 */

import { Scene, GameObjects } from 'phaser';
import * as Phaser from 'phaser';
import type { Difficulty } from '../../shared/constellations';
import { getConstellationById } from '../../shared/constellationLoader';
import { generatePuzzle, type NightlyPuzzle, type PuzzleStar } from '../../shared/puzzleEngine';
import { nightNumberAt } from '../../shared/nightSeed';
import { mulberry32 } from '../../shared/rng';
import { ambience, setSound } from '../audio/ambience';
import { NightSky } from '../ui/NightSky';
import { Onboarding, needsOnboarding } from '../ui/Onboarding';
import { crispText, texScale } from '../ui/display';
import { clamp, contentWidth, gutter, margin, rhythm, type Viewport } from '../ui/frame';
import type { IconName } from '../ui/icons';
import { onLayout } from '../ui/layout';
import { duration, ease, enter, leaveTo, motion, tween } from '../ui/motion';
import { Pill } from '../ui/Pill';
import { MIN_TAP } from '../ui/pressable';
import { prefs } from '../ui/prefs';
import { StoryCard } from '../ui/StoryCard';
import { alpha, color, control, font, glow, hex, ink, space, typeScale } from '../ui/theme';
import { TEX } from '../ui/textures';
import { showToast } from '@devvit/web/client';
import { postComplete } from '../api';
import type { CompleteResponse } from '../../shared/api';
import type { ResultsData } from './Results';

const TAP_THRESHOLD = 12;
/** Wide enough that a two-digit-minute timer never grows the pill mid-solve. */
const TIMER_W = 78;
/** Below this width the HUD stacks its title under the pill row. */
const NARROW_W = 420;

interface StarView {
  data: PuzzleStar;
  container: GameObjects.Container;
  glow: GameObjects.Image;
  core: GameObjects.Image;
}

interface Edge {
  a: StarView;
  b: StarView;
  progress: number;
}

type SceneData = { difficulty?: Difficulty; night?: number };

function connKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * How close the two nearest stars come, in 0–1 units. Real constellations are
 * not evenly spaced — Orion's belt sits far tighter than Cassiopeia's zigzag —
 * so a fixed tap tolerance would either swallow the belt or miss the zigzag.
 */
function closestPair(stars: readonly PuzzleStar[]): number {
  let min = 1;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      min = Math.min(min, Math.hypot(stars[i]!.x - stars[j]!.x, stars[i]!.y - stars[j]!.y));
    }
  }
  return min;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class Play extends Scene {
  private difficulty: Difficulty = 'easy';
  private night = 1;
  private puzzle!: NightlyPuzzle;

  private sky!: NightSky;
  private starViews: StarView[] = [];
  private byId = new Map<number, StarView>();
  private solutionSet = new Set<string>();
  private connected = new Set<string>();
  private edges: Edge[] = [];

  private outlineGfx!: GameObjects.Graphics;
  private holoGfx: GameObjects.Graphics | null = null;
  private connectionGfx!: GameObjects.Graphics;
  private hintGfx!: GameObjects.Graphics;
  private rubberGfx!: GameObjects.Graphics;
  private overlay: GameObjects.Graphics | null = null;

  // HUD.
  private titleText!: GameObjects.Text;
  private hintText!: GameObjects.Text;
  private timerPill!: Pill;
  private backPill!: Pill;
  private soundPill!: Pill;
  private hudNamesPill!: Pill;
  private whisperPill!: Pill;
  private storyCard: StoryCard | null = null;
  private readPill: Pill | null = null;
  private namesPill: Pill | null = null;
  private namesNudge: GameObjects.Text | null = null;
  private revealName: GameObjects.Text | null = null;
  private revealMeaning: GameObjects.Text | null = null;
  private starLabels: GameObjects.Text[] = [];

  /** The three opening hints, on a first-ever play. Blocks the sky until read. */
  private tutorial: Onboarding | null = null;

  private view: Viewport = { w: 0, h: 0 };
  /** Tap tolerance, in CSS pixels. Recomputed per layout — see `hitRadius`. */
  private hitR = 28;
  /** The closest two stars come in this puzzle, in 0–1 units. */
  private starGap = 1;

  // Interaction.
  private downStar: StarView | null = null;
  private downX = 0;
  private downY = 0;
  private dragging = false;
  private selectedStar: StarView | null = null;
  /** This press landed on a HUD pill, so the sky underneath must ignore it. */
  private hudPress = false;

  // Status.
  private complete = false;
  private whispersLeft = 0;
  private startTime = 0;
  private lastShownSecond = -1;
  private glowPulse = 0;
  private glitchHits = 0;
  /** How long the solve took, frozen at completion. */
  private solveMs = 0;

  /** The write of tonight's result, handed to Results so it need not race it. */
  private submission: Promise<CompleteResponse | null> | null = null;

  constructor() {
    super('Play');
  }

  init(data: SceneData): void {
    this.difficulty = data.difficulty ?? 'easy';
    this.night = data.night ?? Math.max(1, nightNumberAt(Date.now()));
    this.starViews = [];
    this.byId = new Map();
    this.solutionSet = new Set();
    this.connected = new Set();
    this.edges = [];
    this.overlay = null;
    this.holoGfx = null;
    this.storyCard = null;
    this.readPill = null;
    this.namesPill = null;
    this.namesNudge = null;
    this.revealName = null;
    this.revealMeaning = null;
    this.starLabels = [];
    this.downStar = null;
    this.selectedStar = null;
    this.dragging = false;
    this.hudPress = false;
    this.complete = false;
    this.lastShownSecond = -1;
    this.glowPulse = 0;
    this.glitchHits = 0;
    this.solveMs = 0;
    this.submission = null;
    this.tutorial = null;
  }

  create(): void {
    this.puzzle = generatePuzzle(this.night, this.difficulty);
    this.whispersLeft = this.puzzle.params.maxWhispers;
    // Not `this.time.now`: the scene Clock has not ticked when `create` runs, so
    // it still reads 0 and the timer would count from page load, not from now.
    this.startTime = performance.now();

    for (const edge of this.puzzle.solution) {
      this.solutionSet.add(connKey(edge.from, edge.to));
    }
    this.starGap = closestPair(this.puzzle.stars);

    this.sky = new NightSky(this, this.night);

    this.outlineGfx = this.add.graphics();
    this.connectionGfx = this.add.graphics();
    this.hintGfx = this.add.graphics();
    this.rubberGfx = this.add.graphics();

    this.createStars();
    this.createHud();

    // A first-ever player is told what to do before the clock starts on them,
    // then *shown*: a ghost comet traces the first real thread, twice.
    if (needsOnboarding()) {
      this.tutorial = new Onboarding(this, () => {
        this.tutorial = null;
        this.startTime = performance.now();
        this.ghostTrace(2);
      });
    }

    onLayout(this, (view) => this.layout(view));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tutorial?.destroy());
    this.registerInput();

    // Gentle entrance.
    enter(this);
  }

  override update(): void {
    if (this.tutorial || this.complete || !this.puzzle.params.timed) return;
    const seconds = Math.floor((performance.now() - this.startTime) / 1000);
    if (seconds !== this.lastShownSecond) {
      this.lastShownSecond = seconds;
      this.timerPill.setLabel(mmss(seconds));
    }
  }

  /* ---------------------------------------------------------------- *
   *  Construction
   * ---------------------------------------------------------------- */

  private createStars(): void {
    this.puzzle.stars.forEach((data) => {
      const glow = this.add
        .image(0, 0, TEX.starSoft)
        .setScale(texScale(0.42))
        .setTint(color.starGlow)
        .setAlpha(0.55);
      const core = this.add.image(0, 0, TEX.starSoft).setScale(texScale(0.18)).setTint(color.starCore);
      const container = this.add.container(0, 0, [glow, core]);
      const view: StarView = { data, container, glow, core };
      this.starViews.push(view);
      this.byId.set(data.id, view);

      // Each star breathes at its own tempo, so the field never pulses in unison.
      motion(this, {
        targets: glow,
        scale: texScale(0.5),
        alpha: 0.35,
        duration: duration.breath * (1 + (data.id % 6) * 0.14),
        yoyo: true,
        repeat: -1,
        ease: ease.inOut,
      });
    });
  }

  private createHud(): void {
    this.titleText = crispText(this, 0, 0, this.puzzle.label, {
      fontFamily: font.serif,
      fontSize: `${typeScale.title}px`,
      color: ink.bright,
    }).setOrigin(0.5);

    this.hintText = crispText(this, 0, 0, this.buildHintLabel(), {
      fontFamily: font.sans,
      fontSize: `${typeScale.body}px`,
      color: ink.muted,
    }).setOrigin(0.5);

    this.backPill = new Pill(this, '‹ Back', { minWidth: 72 }, () => leaveTo(this, 'MainMenu'));

    // Icon only: the HUD names the mode and the Whispers left, and a fourth word
    // up there would be one more thing between the player and the stars.
    this.soundPill = new Pill(this, '', { minWidth: control.md, paddingX: space.sm, icon: soundIcon() }, () =>
      this.toggleSound()
    );
    this.soundPill.setActive(prefs.sound);

    this.hudNamesPill = new Pill(this, '', { minWidth: control.md, paddingX: space.sm, icon: 'star' }, () =>
      this.toggleStarNames()
    );
    this.hudNamesPill.setActive(prefs.starNames);

    this.timerPill = new Pill(this, '0:00', { minWidth: TIMER_W });
    this.timerPill.setVisible(this.puzzle.params.timed);

    this.whisperPill = new Pill(this, '', { minWidth: 150, icon: 'sparkle' }, () => this.useWhisper());
    this.updateWhisperButton();
    this.whisperPill.setVisible(this.puzzle.params.maxWhispers > 0);
  }

  private toggleSound(): void {
    setSound(!prefs.sound);
    this.soundPill.setIcon(soundIcon()).setActive(prefs.sound);
  }

  /**
   * The one line that has to make the mode obvious before the player draws
   * anything: it names the mode, then names what this mode gives and takes.
   */
  private buildHintLabel(): string {
    const { showOutline, showStarCountHint, maxWhispers } = this.puzzle.params;
    if (showOutline) return 'Easy · trace the glowing outline';
    if (showStarCountHint) {
      return `Medium · ${this.puzzle.realStarCount} true stars · avoid the Glitches`;
    }
    return `Hard · no outline, no count · ${maxWhispers} Whispers`;
  }

  /* ---------------------------------------------------------------- *
   *  Layout
   * ---------------------------------------------------------------- */

  /**
   * The HUD reserves what it actually needs at the top and bottom; the star
   * field is the largest square that fits in between. The title sits inline
   * between the Back and timer pills only when it genuinely fits there —
   * otherwise it drops onto its own row rather than running under them.
   */
  private layout(view: Viewport): void {
    this.view = view;
    const { w, h } = view;
    this.sky.layout(view);

    const sidePad = gutter(view);
    const edge = margin(view);
    const rowY = edge + control.md / 2;

    const controlGap = space.sm;
    this.backPill.setPosition(sidePad + this.backPill.width / 2, rowY);
    this.soundPill.setPosition(sidePad + this.backPill.width + controlGap + this.soundPill.width / 2, rowY);
    this.hudNamesPill.setPosition(
      sidePad + this.backPill.width + controlGap + this.soundPill.width + controlGap + this.hudNamesPill.width / 2,
      rowY
    );
    this.timerPill.setPosition(w - sidePad - this.timerPill.width / 2, rowY);

    this.titleText.setFontSize(w < NARROW_W ? typeScale.lead : typeScale.title);
    this.hintText.setFontSize(w < NARROW_W ? typeScale.caption : typeScale.body);
    this.hintText.setWordWrapWidth(contentWidth(view));

    const leftGroup =
      this.backPill.width + controlGap + this.soundPill.width + controlGap + this.hudNamesPill.width;
    const flank = Math.max(leftGroup, this.puzzle.params.timed ? this.timerPill.width : 0);
    // The breathing room is real: a title that only *just* clears the pills reads
    // as a collision even when it technically isn't.
    const inline = this.titleText.width <= w - 2 * (sidePad + flank) - space.xxl;

    const titleY = inline ? rowY : edge + control.md + space.sm + this.titleText.height / 2;
    this.titleText.setPosition(w / 2, titleY);
    this.hintText.setPosition(w / 2, titleY + this.titleText.height / 2 + space.xs + this.hintText.height / 2);

    const topBar = this.hintText.y + this.hintText.height / 2 + rhythm(view);

    const whisperVisible = this.whisperPill.visible;
    if (whisperVisible) this.whisperPill.setPosition(w / 2, h - edge - control.md / 2);
    const bottomBar = whisperVisible ? edge + control.md + rhythm(view) : edge;

    const avail = Math.max(120, h - topBar - bottomBar);
    const size = Math.min(contentWidth(view), avail);
    const ox = (w - size) / 2;
    const oy = topBar + (avail - size) / 2;
    // Never below a fingertip's radius, however tightly this constellation packs.
    this.hitR = clamp(MIN_TAP / 2, this.starGap * size * 0.6, 34);

    for (const sv of this.starViews) {
      sv.container.setPosition(ox + sv.data.x * size, oy + sv.data.y * size);
    }
    if (this.starLabels.length > 0) this.refreshStarLabels();
    this.redrawHologram();

    this.redrawOutline();
    this.redrawConnections();

    if (this.overlay) {
      this.overlay.clear();
      this.overlay.fillStyle(color.void, alpha.veil);
      this.overlay.fillRect(0, 0, w, h);
    }
    // The card wraps its story to the viewport, so a resize has to rebuild it.
    this.storyCard?.show(view, false);
    if (this.revealName) {
      const y = this.nameRevealY();
      this.revealName.setPosition(view.w / 2, y);
      this.revealMeaning?.setPosition(view.w / 2, y + this.revealName.height / 2 + space.md);
    }
    this.tutorial?.layout(view);
  }

  /** Tap tolerance: generous where the sky is empty, precise where stars crowd. */
  private hitRadius(): number {
    return this.hitR;
  }

  /* ---------------------------------------------------------------- *
   *  Drawing
   * ---------------------------------------------------------------- */

  /**
   * Easy's guide. Two passes — a wide soft halo under a thin bright thread — so
   * the shape is unmistakable at a glance without ever being mistaken for a
   * thread the player has already drawn.
   */
  private redrawOutline(): void {
    this.outlineGfx.clear();
    if (!this.puzzle.params.showOutline) return;
    for (const edge of this.puzzle.solution) {
      const a = this.byId.get(edge.from);
      const b = this.byId.get(edge.to);
      if (!a || !b) continue;
      this.outlineGfx.lineStyle(9, color.outline, 0.16);
      this.outlineGfx.lineBetween(a.container.x, a.container.y, b.container.x, b.container.y);
      this.outlineGfx.lineStyle(2, color.outline, 0.8);
      this.outlineGfx.lineBetween(a.container.x, a.container.y, b.container.x, b.container.y);
    }
  }

  /**
   * The hologram: once the sky is revealed, a translucent sheet of cold light
   * fills the figure's own silhouette (the convex hull of its true stars) and
   * breathes with the line-work — the constellation as a projection hanging in
   * the night, not just a join-the-dots.
   */
  private redrawHologram(): void {
    if (!this.holoGfx) return;
    const pts = this.starViews
      .filter((sv) => !sv.data.isDecoy)
      .map((sv) => ({ x: sv.container.x, y: sv.container.y }));
    const hull = convexHull(pts);
    if (hull.length < 3) return;
    const breath = 0.05 + 0.05 * this.glowPulse;
    this.holoGfx.clear();
    this.holoGfx.fillStyle(color.glitch, breath);
    this.holoGfx.beginPath();
    this.holoGfx.moveTo(hull[0]!.x, hull[0]!.y);
    for (const p of hull.slice(1)) this.holoGfx.lineTo(p.x, p.y);
    this.holoGfx.closePath();
    this.holoGfx.fillPath();
    this.holoGfx.lineStyle(1, color.glitch, breath * 2.4);
    this.holoGfx.strokePath();
  }

  private redrawConnections(): void {
    this.connectionGfx.clear();
    const pulse = this.complete ? 0.55 + 0.45 * this.glowPulse : 0.4;
    for (const e of this.edges) {
      const ax = e.a.container.x;
      const ay = e.a.container.y;
      const ex = ax + (e.b.container.x - ax) * e.progress;
      const ey = ay + (e.b.container.y - ay) * e.progress;
      this.connectionGfx.lineStyle(this.complete ? 15 : 11, color.accentGlow, 0.1 + 0.22 * pulse);
      this.connectionGfx.lineBetween(ax, ay, ex, ey);
      this.connectionGfx.lineStyle(3, color.accentBright, 0.95);
      this.connectionGfx.lineBetween(ax, ay, ex, ey);
    }
  }

  private drawRubber(from: StarView, x: number, y: number): void {
    const target = this.starAt(x, y);
    const end = target && target !== from ? { x: target.container.x, y: target.container.y } : { x, y };
    this.rubberGfx.clear();
    this.rubberGfx.lineStyle(3, color.accentBright, 0.55);
    this.rubberGfx.lineBetween(from.container.x, from.container.y, end.x, end.y);
  }

  /* ---------------------------------------------------------------- *
   *  Input
   * ---------------------------------------------------------------- */

  private registerInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    // A finger lifted off the edge of the canvas never reports a `pointerup`,
    // and would otherwise leave a rubber band hanging from a star forever.
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancelDrag, this);
    this.input.keyboard?.on('keydown-ESC', () => leaveTo(this, 'MainMenu'));
  }

  private cancelDrag(): void {
    this.rubberGfx.clear();
    this.downStar = null;
    this.dragging = false;
    this.hudPress = false;
  }

  private starAt(x: number, y: number): StarView | null {
    let best: StarView | null = null;
    let bestDist = this.hitRadius();
    for (const sv of this.starViews) {
      const d = Phaser.Math.Distance.Between(x, y, sv.container.x, sv.container.y);
      if (d <= bestDist) {
        bestDist = d;
        best = sv;
      }
    }
    return best;
  }

  /** Scene-level pointer handlers fire under the tutorial card too. They mustn't. */
  private busy(): boolean {
    return this.complete || this.tutorial !== null;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.busy()) return;

    // These handlers are scene-level, so they also fire for a press that landed
    // on a HUD pill. Such a press belongs to the pill alone: it must not grab a
    // star sitting behind it, nor quietly drop the star already selected.
    this.hudPress = this.input.hitTestPointer(pointer).length > 0;
    if (this.hudPress) return;

    const s = this.starAt(pointer.worldX, pointer.worldY);
    this.downStar = s;
    this.downX = pointer.worldX;
    this.downY = pointer.worldY;
    this.dragging = !!s;
    if (s) this.drawRubber(s, pointer.worldX, pointer.worldY);
    else this.clearSelection();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.busy() || this.hudPress) return;
    if (!this.dragging || !this.downStar) return;

    // One stroke may trace several threads: the moment the finger passes over
    // another star, a *correct* segment commits and the stroke continues from
    // there. A wrong pair mid-sweep is simply not taken — the gentle no is
    // saved for the star the finger actually releases on.
    const over = this.starAt(pointer.worldX, pointer.worldY);
    if (over && over !== this.downStar) {
      const key = connKey(this.downStar.data.id, over.data.id);
      if (this.solutionSet.has(key) && !this.connected.has(key)) {
        this.attemptConnect(this.downStar, over);
        this.downStar = over;
        if (this.complete) {
          this.cancelDrag();
          return;
        }
      }
    }
    this.drawRubber(this.downStar, pointer.worldX, pointer.worldY);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.rubberGfx.clear();
    const down = this.downStar;
    this.downStar = null;
    this.dragging = false;
    if (this.hudPress) {
      this.hudPress = false;
      return;
    }
    if (this.busy()) return;

    const moved = Phaser.Math.Distance.Between(this.downX, this.downY, pointer.worldX, pointer.worldY);

    if (moved < TAP_THRESHOLD) {
      if (!down) {
        this.clearSelection();
        return;
      }
      if (this.selectedStar && this.selectedStar !== down) {
        const from = this.selectedStar;
        this.clearSelection();
        this.attemptConnect(from, down);
      } else if (this.selectedStar === down) {
        this.clearSelection();
      } else {
        this.selectStar(down);
      }
      return;
    }

    const up = this.starAt(pointer.worldX, pointer.worldY);
    if (down && up && up !== down) {
      this.clearSelection();
      this.attemptConnect(down, up);
    }
  }

  private selectStar(sv: StarView): void {
    this.clearSelection();
    this.selectedStar = sv;
    this.glowTo(sv, 0.9);
    motion(this, { targets: sv.container, scale: 1.25, duration: duration.fast });
  }

  private clearSelection(): void {
    const sv = this.selectedStar;
    this.selectedStar = null;
    if (!sv) return;
    this.glowTo(sv, 0.55);
    motion(this, { targets: sv.container, scale: 1, duration: duration.fast });
  }

  /**
   * The halo of a star picked up or put down.
   *
   * Under motion the star's own twinkle loop owns `glow.alpha` and reclaims it
   * the very next frame, so the swell is the cue and this stays out of the way.
   * Under stillness there is no loop and no swell — the halo is the only cue
   * left, which is exactly why it may not snap on.
   */
  private glowTo(sv: StarView, halo: number): void {
    if (prefs.animate) return;
    tween(this, { targets: sv.glow, alpha: halo, duration: duration.fast });
  }

  /* ---------------------------------------------------------------- *
   *  Connection logic
   * ---------------------------------------------------------------- */

  private attemptConnect(a: StarView, b: StarView): void {
    const key = connKey(a.data.id, b.data.id);

    if (this.connected.has(key)) {
      this.pulseStar(a);
      this.pulseStar(b);
      return;
    }

    if (this.solutionSet.has(key)) {
      this.connected.add(key);
      const edge: Edge = { a, b, progress: 0 };
      this.edges.push(edge);

      // A thread reaching from one star to the other is travel, so under
      // stillness it is simply already there.
      const draw = motion(this, {
        targets: edge,
        progress: 1,
        duration: duration.base,
        onUpdate: () => this.redrawConnections(),
      });
      if (!draw) {
        edge.progress = 1;
        this.redrawConnections();
      }
      // A star falls across the sky, a step brighter for each thread drawn.
      ambience.connect(this.connected.size - 1);
      if (prefs.starNames) this.refreshStarLabels();
      this.pulseStar(a);
      this.pulseStar(b);
      if (this.connected.size === this.puzzle.solution.length) this.onComplete();
    } else {
      this.wrongFeedback(a, b);
    }
  }

  private pulseStar(sv: StarView): void {
    motion(this, { targets: sv.container, scale: 1.4, duration: duration.micro, yoyo: true });
    this.flashRing(sv, color.accent);
  }

  /**
   * A ring blooming outward, or — when the player has asked for stillness — the
   * same light arriving and leaving without going anywhere. A ring that will not
   * swell is born at the size it would have swelled to, since `tween` drops the
   * `scale` and leaves it wherever it was put.
   */
  private flashRing(sv: StarView, tint: number): void {
    const ring = this.add
      .image(sv.container.x, sv.container.y, TEX.starSoft)
      .setScale(texScale(prefs.animate ? 0.2 : 0.6))
      .setTint(tint)
      .setAlpha(0.7);
    tween(this, {
      targets: ring,
      scale: texScale(0.9),
      alpha: 0,
      duration: duration.slow,
      onComplete: () => ring.destroy(),
    });
  }

  private wrongFeedback(a: StarView, b: StarView): void {
    if (a.data.isDecoy || b.data.isDecoy) this.glitchHits++;
    this.shakeStar(a);
    this.shakeStar(b);
    if (prefs.animate) this.cameras.main.shake(duration.micro, 0.003);

    if (a.data.isDecoy) this.glitchShimmer(a);
    else this.flashRing(a, color.wrong);
    if (b.data.isDecoy) this.glitchShimmer(b);
    else this.flashRing(b, color.wrong);
  }

  private shakeStar(sv: StarView): void {
    const baseX = sv.container.x;
    motion(this, {
      targets: sv.container,
      x: baseX + 7,
      duration: duration.tremor,
      yoyo: true,
      repeat: 2,
      ease: ease.inOut,
      onComplete: () => sv.container.setX(baseX),
    });
  }

  private glitchShimmer(sv: StarView): void {
    sv.core.setTint(color.glitch);
    sv.glow.setTint(color.glitch);
    this.flashRing(sv, color.glitch);

    const restore = (): void => {
      sv.container.setAngle(0);
      sv.core.setTint(color.starCore);
      sv.glow.setTint(color.starGlow);
    };

    // The cold shows for as long as the ring does, whether or not it wobbles.
    const wobble = motion(this, {
      targets: sv.container,
      angle: 9,
      duration: duration.tremor,
      yoyo: true,
      repeat: 3,
      onComplete: restore,
    });
    if (!wobble) this.time.delayedCall(duration.slow, restore);
  }

  /**
   * A comet of light drifts from one true star to its neighbour — the game
   * demonstrating its own gesture, like a hand pulling a thread. Under
   * stillness the same edge glows in place instead (light, not movement).
   */
  private ghostTrace(times: number): void {
    if (this.complete || times <= 0) return;
    const first = this.puzzle.solution.find(
      (e) => !this.connected.has(connKey(e.from, e.to))
    );
    if (!first) return;
    const a = this.byId.get(first.from);
    const b = this.byId.get(first.to);
    if (!a || !b) return;

    if (!prefs.animate) {
      // No movement: the edge itself breathes once, exactly like a Whisper.
      const state = { alpha: 0 };
      tween(this, {
        targets: state,
        alpha: 0.9,
        duration: duration.slow,
        yoyo: true,
        hold: duration.base,
        ease: ease.inOut,
        onUpdate: () => {
          this.hintGfx.clear();
          this.hintGfx.lineStyle(3, color.accent, state.alpha);
          this.hintGfx.lineBetween(a.container.x, a.container.y, b.container.x, b.container.y);
        },
        onComplete: () => this.hintGfx.clear(),
      });
      return;
    }

    // Two sprites — a wide halo under a hot core — so the comet reads as a
    // point of light, not a smudge. Nothing else moves while it teaches.
    const halo = this.add
      .image(a.container.x, a.container.y, TEX.starSoft)
      .setScale(texScale(0.55))
      .setTint(color.accentBright)
      .setAlpha(0)
      .setDepth(18);
    const comet = this.add
      .image(a.container.x, a.container.y, TEX.spark)
      .setScale(texScale(0.34))
      .setTint(0xffffff)
      .setAlpha(0)
      .setDepth(19);
    const trail = { p: 0 };
    motion(this, { targets: halo, alpha: { from: 0, to: 0.85 }, duration: duration.base });
    motion(this, { targets: comet, alpha: { from: 0, to: 1 }, duration: duration.base });
    motion(this, {
      targets: trail,
      p: 1,
      duration: duration.reveal,
      ease: ease.inOut,
      onUpdate: () => {
        const x = a.container.x + (b.container.x - a.container.x) * trail.p;
        const y = a.container.y + (b.container.y - a.container.y) * trail.p;
        halo.setPosition(x, y);
        comet.setPosition(x, y);
        this.hintGfx.clear();
        this.hintGfx.lineStyle(7, color.accentGlow, 0.4);
        this.hintGfx.lineBetween(a.container.x, a.container.y, x, y);
        this.hintGfx.lineStyle(3, color.accentBright, 0.95);
        this.hintGfx.lineBetween(a.container.x, a.container.y, x, y);
      },
      onComplete: () => {
        this.hintGfx.clear();
        tween(this, {
          targets: [halo, comet],
          alpha: 0,
          duration: duration.base,
          onComplete: () => {
            halo.destroy();
            comet.destroy();
            this.time.delayedCall(duration.base, () => this.ghostTrace(times - 1));
          },
        });
      },
    });
  }

  /* ---------------------------------------------------------------- *
   *  Whispers
   * ---------------------------------------------------------------- */

  private updateWhisperButton(): void {
    this.whisperPill.setLabel(`Whisper · ${this.whispersLeft}`);
    this.whisperPill.setEnabled(this.whispersLeft > 0);
  }

  private useWhisper(): void {
    if (this.complete || this.whispersLeft <= 0) return;

    let hintKey: string | null = null;
    for (const key of this.solutionSet) {
      if (!this.connected.has(key)) {
        hintKey = key;
        break;
      }
    }
    if (!hintKey) return;

    const [i, j] = hintKey.split('-').map(Number) as [number, number];
    const a = this.byId.get(i);
    const b = this.byId.get(j);
    if (!a || !b) return;

    this.whispersLeft--;
    this.updateWhisperButton();

    this.tweens.killTweensOf(this.hintGfx);
    const state = { alpha: 0 };
    // Light, not movement: a Whisper answers a player who asked for stillness too.
    tween(this, {
      targets: state,
      alpha: 0.9,
      duration: duration.slow,
      yoyo: true,
      hold: duration.reveal,
      ease: ease.inOut,
      onUpdate: () => {
        this.hintGfx.clear();
        this.hintGfx.lineStyle(3, color.accent, state.alpha);
        this.hintGfx.lineBetween(a.container.x, a.container.y, b.container.x, b.container.y);
      },
      onComplete: () => this.hintGfx.clear(),
    });
  }

  /* ---------------------------------------------------------------- *
   *  Completion — the reward
   * ---------------------------------------------------------------- */

  private onComplete(): void {
    this.complete = true;
    this.solveMs = Math.round(performance.now() - this.startTime);
    this.clearSelection();
    this.rubberGfx.clear();
    this.hintGfx.clear();

    // The Whisper button has nothing left to offer, so it withdraws rather than
    // blinking out from under the thumb that may still be near it.
    tween(this, {
      targets: this.whisperPill.container,
      alpha: 0,
      duration: duration.base,
      ease: ease.in,
      onComplete: () => this.whisperPill.setVisible(false),
    });

    // Dim the sky to focus the reveal, but lift the constellation above it.
    this.overlay = this.add.graphics().setDepth(20);
    this.overlay.fillStyle(color.void, 0);
    const overlayState = { a: 0 };
    tween(this, {
      targets: overlayState,
      a: alpha.veil,
      duration: duration.reveal,
      onUpdate: () => {
        this.overlay!.clear();
        this.overlay!.fillStyle(color.void, overlayState.a);
        this.overlay!.fillRect(0, 0, this.view.w, this.view.h);
      },
    });

    this.connectionGfx.setDepth(30);
    this.holoGfx = this.add.graphics().setDepth(29);
    this.redrawHologram();
    for (const sv of this.starViews) {
      // Each halo has been twinkling on an endless tween since `createStars`.
      // Left running it would take `alpha` straight back off the reveal below.
      this.tweens.killTweensOf(sv.glow);

      if (sv.data.isDecoy) {
        tween(this, { targets: sv.container, alpha: 0.1, duration: duration.reveal });
      } else {
        sv.container.setDepth(30);
        // The swelled halo is where a real star comes to rest, so stillness
        // takes it directly rather than being denied it with the swell.
        if (!prefs.animate) sv.glow.setScale(texScale(0.72));
        tween(this, {
          targets: sv.glow,
          scale: texScale(0.72),
          alpha: 0.75,
          duration: duration.reveal,
        });
      }
    }

    // Breathing glow on the finished line-work — or, held still, its full brightness.
    const breathe = motion(this, {
      targets: this,
      glowPulse: 1,
      duration: duration.breath,
      yoyo: true,
      repeat: -1,
      ease: ease.inOut,
      onUpdate: () => {
        this.redrawConnections();
        this.redrawHologram();
      },
    });
    if (!breathe) {
      this.glowPulse = 1;
      this.redrawConnections();
      this.redrawHologram();
    }

    ambience.reveal();
    this.celebrate();
    this.refreshStarLabels();
    this.submitResult();
    this.time.delayedCall(duration.reveal, () => {
      this.showNameReveal();
      this.showRevealActions();
    });
  }

  /**
   * Send the night to the server, once. The story reveal never waits on the
   * network — a failure costs the player nothing but the record — so the
   * promise is kept rather than awaited, and handed to Results, which does need
   * the write to have landed before it asks what tonight looks like.
   */
  private submitResult(): void {
    if (this.submission) return;

    this.submission = postComplete({
      difficulty: this.difficulty,
      timeMs: this.solveMs,
      whispers: this.whispersUsed(),
      glitches: this.glitchHits,
    });
  }

  private whispersUsed(): number {
    return this.puzzle.params.maxWhispers - this.whispersLeft;
  }

  /** Leave the story behind and go count the night. */
  private openResults(): void {
    const data: ResultsData = {
      night: this.puzzle.night,
      difficulty: this.difficulty,
      constellationId: this.puzzle.constellationId,
      submission: this.submission ?? undefined,
      timeMs: this.solveMs,
      whispers: this.whispersUsed(),
      glitches: this.glitchHits,
    };
    leaveTo(this, 'Results', data);
  }

  /** Sparks rising off the finished shape. Pure movement, so stillness skips it. */
  private celebrate(): void {
    if (!prefs.animate) return;
    const reals = this.starViews.filter((s) => !s.data.isDecoy);
    if (reals.length === 0) return;
    const rng = mulberry32(this.puzzle.night * 911 + 7);
    for (let i = 0; i < 16; i++) {
      const src = reals[Math.floor(rng() * reals.length)]!;
      const sp = this.add
        .image(src.container.x + (rng() - 0.5) * 22, src.container.y + (rng() - 0.5) * 22, TEX.spark)
        .setScale(texScale(0.1 + rng() * 0.16))
        .setAlpha(0)
        .setTint(color.accentBright)
        .setDepth(34);
      motion(this, {
        targets: sp,
        y: sp.y - (30 + rng() * 70),
        alpha: { from: 0, to: 0.9 },
        duration: duration.reveal * (0.8 + rng() * 0.5),
        onComplete: () =>
          motion(this, {
            targets: sp,
            alpha: 0,
            y: sp.y - 30,
            duration: duration.reveal,
            ease: ease.in,
            onComplete: () => sp.destroy(),
          }),
      });
    }
  }

  /**
   * The naming — the "oh, THAT's Orion" beat. The constellation's Latin name
   * arrives in large serif over the dimmed sky, its meaning underneath, while
   * the finished line-work breathes below. The story card follows and carries
   * the name onward, so these fade as it rises.
   */
  private showNameReveal(): void {
    if (this.storyCard) return;
    const { w } = this.view;
    const y = this.nameRevealY();
    this.revealName = crispText(this, w / 2, y, this.puzzle.name, {
      fontFamily: font.serif,
      fontSize: `${typeScale.display}px`,
      color: ink.bright,
    })
      .setOrigin(0.5)
      .setDepth(36)
      .setShadow(0, 0, hex(color.accentGlow), glow.strong, true, true)
      .setAlpha(0);
    this.revealMeaning = crispText(this, w / 2, y + this.revealName.height / 2 + space.md, this.puzzle.meaning, {
      fontFamily: font.sans,
      fontSize: `${typeScale.lead}px`,
      color: ink.accent,
    })
      .setOrigin(0.5)
      .setDepth(36)
      .setAlpha(0);
    tween(this, { targets: this.revealName, alpha: 1, duration: duration.reveal, ease: ease.out });
    tween(this, {
      targets: this.revealMeaning,
      alpha: 0.9,
      duration: duration.reveal,
      delay: duration.base,
      ease: ease.out,
    });
  }

  /**
   * During play only stars already woven into a thread carry their names —
   * a connected star is a *confirmed* real star, so no Glitch is ever given
   * away. After completion every true star is named. Toggleable live.
   */
  private refreshStarLabels(): void {
    for (const label of this.starLabels) label.destroy();
    this.starLabels = [];
    if (!prefs.starNames) return;
    const constellation = getConstellationById(this.puzzle.constellationId);
    if (!constellation) return;

    const confirmed = new Set<number>();
    if (!this.complete) {
      for (const key of this.connected) {
        const [a, b] = key.split('-').map(Number) as [number, number];
        confirmed.add(a);
        confirmed.add(b);
      }
    }

    // Labels sit *outside* the figure — pushed radially away from its middle —
    // and never on top of each other: a name that cannot find clear sky on
    // either side stays unsaid rather than unreadable.
    const reals = this.starViews.filter((sv) => !sv.data.isDecoy);
    const cx = reals.reduce((sum, sv) => sum + sv.container.x, 0) / Math.max(1, reals.length);
    const cy = reals.reduce((sum, sv) => sum + sv.container.y, 0) / Math.max(1, reals.length);
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const collides = (r: { x1: number; y1: number; x2: number; y2: number }): boolean =>
      placed.some((q) => r.x1 < q.x2 && r.x2 > q.x1 && r.y1 < q.y2 && r.y2 > q.y1);

    for (const sv of this.starViews) {
      if (sv.data.isDecoy || sv.data.sourceIndex === undefined) continue;
      if (!this.complete && !confirmed.has(sv.data.id)) continue;
      const name = constellation.stars[sv.data.sourceIndex]?.star;
      if (!name) continue;

      const dx = sv.container.x - cx;
      const dy = sv.container.y - cy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const label = crispText(this, 0, 0, name, {
        fontFamily: font.sans,
        fontSize: `${typeScale.micro}px`,
        color: ink.muted,
      })
        .setOrigin(0.5)
        .setDepth(31)
        .setAlpha(0);

      const OFFSET = 16;
      let ok = false;
      for (const sign of [1, -1]) {
        const lx = sv.container.x + (dx / len) * (OFFSET + label.width / 2) * sign;
        const ly = sv.container.y + (dy / len) * (OFFSET + label.height) * sign;
        const rect = {
          x1: lx - label.width / 2 - 2,
          y1: ly - label.height / 2 - 2,
          x2: lx + label.width / 2 + 2,
          y2: ly + label.height / 2 + 2,
        };
        if (!collides(rect)) {
          label.setPosition(lx, ly);
          placed.push(rect);
          ok = true;
          break;
        }
      }
      if (!ok) {
        label.destroy();
        continue;
      }
      tween(this, { targets: label, alpha: 0.85, duration: duration.base });
      this.starLabels.push(label);
    }
  }

  private nameRevealY(): number {
    // Under the HUD, above the figure: the top quarter of the star field.
    return this.hintText.y + this.hintText.height / 2 + rhythm(this.view) + typeScale.display;
  }

  /**
   * The viewer holds the sky for a moment before the story: a button to read
   * on, and the star-names toggle right here where it matters — with a quiet
   * nudge the first time, because nobody goes looking in a menu for it.
   */
  private showRevealActions(): void {
    if (this.storyCard) return;
    const y = this.view.h - margin(this.view) - control.lg / 2;
    const read = new Pill(
      this,
      'Read the story  ›',
      { height: control.lg, minWidth: 190, fontSize: typeScale.body },
      () => this.showStoryCard()
    );
    read.setPosition(this.view.w / 2 + (control.md + space.sm) / 2, y);
    read.container.setDepth(36);
    this.readPill = read;

    const names = new Pill(
      this,
      '',
      { height: control.lg, minWidth: control.lg, paddingX: space.sm, icon: 'star' },
      () => this.toggleStarNames()
    );
    names.setPosition(read.container.x - read.width / 2 - space.sm - names.width / 2, y);
    names.container.setDepth(36);
    names.setActive(prefs.starNames);
    this.namesPill = names;

    if (!prefs.starNames) {
      const nudge = crispText(this, names.container.x, y - control.lg / 2 - space.sm, 'name the stars', {
        fontFamily: font.sans,
        fontSize: `${typeScale.micro}px`,
        color: ink.accent,
      })
        .setOrigin(0.5, 1)
        .setDepth(36)
        .setAlpha(0);
      const pulsing = motion(this, {
        targets: nudge,
        alpha: { from: 0, to: 0.9 },
        duration: duration.breath,
        yoyo: true,
        repeat: -1,
        ease: ease.inOut,
      });
      if (!pulsing) nudge.setAlpha(0.9);
      this.namesNudge = nudge;
    }
  }

  private toggleStarNames(): void {
    prefs.set({ starNames: !prefs.starNames });
    showToast(prefs.starNames ? 'Star names on' : 'Star names off');
    this.namesPill?.setActive(prefs.starNames);
    this.hudNamesPill.setActive(prefs.starNames);
    this.namesNudge?.destroy();
    this.namesNudge = null;
    this.refreshStarLabels();
  }

  private dropRevealActions(): void {
    this.readPill?.destroy();
    this.namesPill?.destroy();
    this.namesNudge?.destroy();
    this.readPill = null;
    this.namesPill = null;
    this.namesNudge = null;
  }

  private dropNameReveal(): void {
    for (const t of [this.revealName, this.revealMeaning]) {
      if (!t) continue;
      tween(this, { targets: t, alpha: 0, duration: duration.base, onComplete: () => t.destroy() });
    }
    this.revealName = null;
    this.revealMeaning = null;
  }

  /**
   * The reward. Nothing but the myth is on this card — the numbers wait for the
   * Results screen. My Sky shows the same card when a gathered constellation is
   * tapped, so it lives in `ui/StoryCard`.
   */
  private showStoryCard(): void {
    this.dropNameReveal();
    this.dropRevealActions();
    this.storyCard = new StoryCard(this, {
      name: this.puzzle.name,
      story: this.puzzle.story,
      narrationId: this.puzzle.constellationId,
      buttonLabel: 'Continue  ›',
      onButton: () => this.openResults(),
    });
    this.storyCard.show(this.view, true);
  }
}

function soundIcon(): IconName {
  return prefs.sound ? 'sound' : 'mute';
}

/** Andrew's monotone chain — 26 points at most, every completion. */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (pts: { x: number; y: number }[]): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
