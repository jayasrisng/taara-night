import { Scene, GameObjects } from 'phaser';
import * as Phaser from 'phaser';
import { showToast } from '@devvit/web/client';
import type { InitResponse } from '../../shared/api';
import type { Difficulty } from '../../shared/constellations';
import { nightNumberAt } from '../../shared/nightSeed';
import { communityMilestone } from '../../shared/community';
import { setSound } from '../audio/ambience';
import { NightSky } from '../ui/NightSky';
import { Onboarding } from '../ui/Onboarding';
import { crispText } from '../ui/display';
import { clamp, contentWidth, gutter, margin, rhythm, type Viewport } from '../ui/frame';
import type { IconName } from '../ui/icons';
import { onLayout } from '../ui/layout';
import { duration, enter, leave, leaveTo, motion, tween } from '../ui/motion';
import { Pill, makePill } from '../ui/Pill';
import { pressable, tapArea } from '../ui/pressable';
import { prefs } from '../ui/prefs';
import {
  color,
  control,
  difficulty as difficultyColor,
  font,
  glow,
  hairline,
  hex,
  ink,
  space,
  typeScale,
} from '../ui/theme';
import { fetchInit, postComplete } from '../api';

interface DiffDef {
  label: string;
  value: Difficulty;
  blurb: string;
  color: number;
  dots: number;
}

const DIFFICULTIES: DiffDef[] = [
  { label: 'Easy', value: 'easy', blurb: 'Start here · a guided first sky', color: difficultyColor.easy, dots: 1 },
  {
    label: 'Medium',
    value: 'medium',
    blurb: 'No outline · a few Glitches · 3 Whispers',
    color: difficultyColor.medium,
    dots: 2,
  },
  {
    label: 'Hard',
    value: 'hard',
    blurb: 'No star count · many Glitches · a soft timer',
    color: difficultyColor.hard,
    dots: 3,
  },
];




/**
 * How long a tapped card will wait for the server to say which night this post
 * plays. Past this the client's own guess opens the sky — a slow night is worse
 * than a slightly wrong one.
 */
const NIGHT_WAIT_MS = 1500;

/** Holds the community line's place while the server is still answering. */
const LISTENING = 'Listening for tonight’s sky…';

export class MainMenu extends Scene {
  private sky!: NightSky;
  private ui: GameObjects.GameObject[] = [];
  private entered = false;
  private view: Viewport = { w: 0, h: 0 };

  /** Tonight, computed locally so the menu paints without waiting on the API. */
  private night = 1;
  /** The server's answer, kept so a tapped card can wait on it if it must. */
  private opening: Promise<InitResponse | null> | null = null;
  /** True once `night` is the post's night rather than the client's guess. */
  private synced = false;
  /** Tonight's shared numbers — a loading line until the server answers, then null if it never does. */
  private communityLine: string | null = LISTENING;
  private soundPill: Pill | null = null;
  /** True while the settings toggles are drawn as bare icons, on a narrow screen. */
  private compactSettings = false;
  /** The help card, while it is up. Everything under it goes deaf.  */
  private help: Onboarding | null = null;

  constructor() {
    super('MainMenu');
  }

  init(): void {
    this.ui = [];
    this.entered = false;
    this.synced = false;
    this.communityLine = LISTENING;
    this.soundPill = null;
    this.help = null;
  }

  create(): void {
    this.night = Math.max(1, nightNumberAt(Date.now()));
    this.sky = new NightSky(this, this.night);

    onLayout(this, (view) => this.build(view));

    this.opening = fetchInit();
    void this.syncWithServer();

    this.input.keyboard?.on('keydown-D', () => this.scene.start('ConstellationDebug'));
    this.input.keyboard?.on('keydown-J', () => void this.rehearseLastNight());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.help?.destroy());

    // The menu rises out of the same night the splash screen left behind.
    enter(this);
  }

  /**
   * The how-to, on request. It is the same card a first-time player gets in
   * `Play`, so reading it here also spends that one unasked showing.
   */
  private openHelp(): void {
    if (this.help) return;
    this.help = new Onboarding(this, () => (this.help = null), 'Close');
    this.help.layout(this.view);
  }

  /** True while the help card is up: nothing behind it may be tapped. */
  private busy(): boolean {
    return this.help !== null;
  }

  /** Rebuild at the current size, after content (not the viewport) changed. */
  private relayout(): void {
    if (this.view.w > 0) this.build(this.view);
  }

  /**
   * The server owns the night number and the community's numbers. The menu
   * shows its own guess first, then quietly reconciles — if the API is asleep,
   * the sky is still open.
   *
   * The guess is only ever "tonight". On an archive post the server answers with
   * the night that post was born under, which is why `openPlay` waits for it.
   */
  private async syncWithServer(): Promise<void> {
    const init = await this.opening;
    if (!this.scene.isActive()) return;

    // A sky that never answered says nothing rather than listening forever.
    if (!init) {
      this.communityLine = null;
      this.relayout();
      return;
    }

    this.night = init.night;
    this.synced = true;

    this.communityLine = describeTonight(init.community, init.jwala.current, this.isArchive());
    this.relayout();
  }

  /**
   * True when this post opens a night that has already passed. Only knowable
   * once the server has answered — before that, every post looks like tonight.
   */
  private isArchive(): boolean {
    return this.synced && this.night < Math.max(1, nightNumberAt(Date.now()));
  }

  /**
   * Open the puzzle on the night this post actually plays.
   *
   * By the time anyone has read three cards the server has long since answered,
   * so this is normally instant; the race is only insurance against a stalled
   * request holding the sky shut.
   */
  private async openPlay(difficulty: Difficulty): Promise<void> {
    if (!this.synced) {
      await Promise.race([this.opening, delay(NIGHT_WAIT_MS)]);
    }
    if (!this.scene.isActive()) return;

    leaveTo(this, 'Play', { difficulty, night: this.night });
  }

  /**
   * Dev-only: mark last night as completed so a Jwala of 2 can be verified
   * without waiting a day. The server refuses this outside the playtest
   * subreddit, so pressing J on a real post does nothing but show a message.
   */
  private async rehearseLastNight(): Promise<void> {
    const night = this.night;
    if (night <= 1) {
      showToast('No night before TaaraNight #1');
      return;
    }

    const response = await postComplete({
      timeMs: 1000,
      whispers: 0,
      glitches: 0,
      night: night - 1,
    });

    showToast(
      response?.recorded
        ? `Night #${night - 1} rehearsed · Jwala ${response.jwala.current}`
        : 'Night override refused (dev subreddit only)'
    );
  }

  /**
   * A vertical flow: the title block grows down from the top, the community line
   * and the bottom row grow up from the bottom, and the difficulty cards take
   * the space that is actually left over. Nothing is placed at a fixed offset,
   * so nothing can collide on a short screen.
   *
   * Above the fold there is a wordmark, the night it opens, one tagline and the
   * three cards. Everything else on this screen is either behind the `?` or a
   * single quiet row along the bottom.
   */
  preload(): void {
    if (!this.textures.exists('logo')) this.load.image('logo', 'logo.png');
  }

  private build(view: Viewport): void {
    this.view = view;
    const { w, h } = view;
    this.sky.layout(view);

    // Clear any previously built UI (on resize) and rebuild for the new size.
    this.ui.forEach((o) => o.destroy());
    this.ui = [];

    const step = rhythm(view);
    const textWidth = contentWidth(view);

    /* ---- top block, flowing down ---- */

    let top = margin(view);

    // Out of the flow, in the corner the eye checks last. The wordmark is
    // centred and never grows wide enough to reach it: its type is clamped by
    // `h * 0.08`, and a screen tall enough to make it wide is wide already.
    const help = new Pill(
      this,
      '?',
      { height: control.md, minWidth: control.md, paddingX: space.sm, fontSize: typeScale.lead },
      () => this.openHelp()
    );
    help.setPosition(w - gutter(view) - control.md / 2, top + control.md / 2);
    this.ui.push(help.container);

    // The logo *is* the wordmark now; type only if the image never arrived.
    let titleH: number;
    if (this.textures.exists('logo')) {
      const logoH = clamp(88, h * 0.2, 150);
      const logo = this.add.image(w / 2, top, 'logo').setOrigin(0.5, 0);
      logo.setScale(logoH / logo.height);
      this.ui.push(logo);
      titleH = logoH;
    } else {
      const title = crispText(this, w / 2, top, 'TaaraNight', {
        fontFamily: font.serif,
        fontSize: `${clamp(typeScale.display, Math.min(w * 0.12, h * 0.08), typeScale.giant)}px`,
        color: ink.bright,
      }).setOrigin(0.5, 0);
      title.setShadow(0, 0, hex(color.starlight), glow.strong, true, true);
      this.ui.push(title);
      titleH = title.height;
    }
    // The badge belongs to the wordmark, so it sits closer than the rhythm.
    top += titleH + space.sm;

    // The wordmark has already said "TaaraNight". This says which one.
    const when = this.isArchive() ? 'An older sky' : 'Tonight';
    const pill = makePill(this, w / 2, top + control.sm / 2, `${when} · #${this.night}`, {
      height: control.sm,
      paddingX: space.lg,
      icon: 'moon',
    });
    this.ui.push(pill.container);
    top += control.sm;


    /* ---- bottom block, flowing up ---- */

    let bottom = h - margin(view);

    bottom = this.buildBottomRow(view, bottom);

    if (this.communityLine) {
      const community = crispText(this, w / 2, bottom - space.md, this.communityLine, {
        fontFamily: font.sans,
        fontSize: `${typeScale.caption}px`,
        color: ink.faint,
        align: 'center',
        wordWrap: { width: textWidth },
      }).setOrigin(0.5, 1);
      this.ui.push(community);
      bottom = community.y - community.height - space.xs;
    }

    /* ---- three glass circles take what is left ---- */

    const midTop = top + step;
    const midH = Math.max(80, bottom - step - midTop);
    const gap = Math.max(space.md, Math.min(space.xl, w * 0.05));
    const diameter = clamp(72, Math.min((w - gutter(view) * 2 - gap * 2) / 3, midH * 0.8), 132);

    const rowY = midTop + midH / 2;
    const startX = w / 2 - diameter - gap;
    DIFFICULTIES.forEach((d, i) => {
      const circle = this.makeCircle(diameter, d);
      const cx = startX + i * (diameter + gap);
      circle.setPosition(cx, rowY);
      this.ui.push(circle);

      if (!this.entered) {
        circle.setAlpha(0);
        if (prefs.animate) circle.setScale(0.85);
        tween(this, {
          targets: circle,
          alpha: 1,
          scale: 1,
          duration: duration.slow,
          delay: duration.micro * (1 + i),
        });
      }
    });

    this.entered = true;

    // The card outlives a resize, and must be re-hung on the new viewport.
    this.help?.layout(view);
  }

  /**
   * The one row of chrome: My Sky, then sound and stillness. Returns the new
   * bottom edge, so the cards above know how much room they still have.
   *
   * My Sky sits here rather than beside the difficulty cards — a player who has
   * not solved anything has nothing to look at — but it is a labelled button on
   * the home screen, not a secret: the dome is worth seeing while it is dark.
   *
   * Where the three will not fit across the screen, the two toggles give up
   * their labels and keep their icons. Nothing here is worth a second row.
   */
  private buildBottomRow(view: Viewport, bottom: number): number {
    const y = bottom - control.sm / 2;

    const row = this.settingsRow(false);
    if (rowWidth(row) > contentWidth(view)) {
      row.forEach((pill) => pill.destroy());
      row.length = 0;
      row.push(...this.settingsRow(true));
    }

    let x = view.w / 2 - rowWidth(row) / 2;
    for (const pill of row) {
      pill.setPosition(x + pill.width / 2, y);
      x += pill.width + space.sm;
      this.ui.push(pill.container);
    }

    return bottom - control.sm;
  }

  /**
   * The row's three pills, left to right. `compact` strips the two toggles down
   * to their icons — never My Sky, which is the one thing on this row a first
   * visitor has any reason to press.
   */
  private settingsRow(compact: boolean): Pill[] {
    this.compactSettings = compact;
    const labelled = { height: control.sm, paddingX: space.md, fontSize: typeScale.caption };
    const style = compact ? { height: control.sm, paddingX: space.sm, minWidth: control.md } : labelled;

    const mySky = new Pill(this, 'My Sky', { ...labelled, icon: 'sparkle' }, () => {
      if (!this.busy()) leaveTo(this, 'MySky', {});
    });

    const sound = new Pill(this, this.soundText(), { ...style, icon: soundIcon() }, () => {
      if (!this.busy()) this.toggleSound();
    });
    sound.setActive(prefs.sound);
    this.soundPill = sound;

    const motion = new Pill(this, compact ? '' : motionLabel(), { ...style, icon: motionIcon() }, () => {
      if (!this.busy()) this.toggleMotion();
    });
    motion.setActive(prefs.animate);

    // Tutorial toggle: lit means the next play opens with the hints card and
    // the ghost comet tracing the first thread. It arms itself off for a
    // veteran and back on with one tap — no burying it in a menu.
    const tutorial = new Pill(this, compact ? '' : tutorialLabel(), { ...style, icon: 'sparkle' }, () => {
      if (this.busy()) return;
      prefs.set({ onboarded: !prefs.onboarded });
      showToast(prefs.onboarded ? 'Tutorial off' : 'Tutorial on — it will greet your next play');
      this.tutorialPill?.setLabel(this.compactSettings ? '' : tutorialLabel()).setActive(!prefs.onboarded);
    });
    tutorial.setActive(!prefs.onboarded);
    this.tutorialPill = tutorial;

    // The toggles take the widest one's width, so a changing label cannot
    // re-centre the row under the thumb that is still on it.
    const widest = Math.max(sound.width, motion.width, tutorial.width);
    sound.setMinWidth(widest);
    motion.setMinWidth(widest);
    tutorial.setMinWidth(widest);

    return [mySky, sound, motion, tutorial];
  }

  private tutorialPill: Pill | null = null;

  /** Empty while the toggles are bare icons — `toggleSound` must not put a word back. */
  private soundText(): string {
    return this.compactSettings ? '' : soundLabel();
  }

  /** The label changes in place: a whole re-layout for one word would flicker. */
  private toggleSound(): void {
    setSound(!prefs.sound);
    showToast(prefs.sound ? 'Sound on' : 'Sound off');
    this.soundPill?.setIcon(soundIcon()).setLabel(this.soundText()).setActive(prefs.sound);
  }

  /**
   * Stillness has to be chosen before the sky is built — the twinkles and the
   * shooting stars are looping tweens started in `NightSky`'s constructor — so
   * the menu rebuilds itself around the new answer. It fades on the way, because
   * a screen that blinks is a poor advertisement for a calmer setting.
   */
  private toggleMotion(): void {
    prefs.set({ reducedMotion: !prefs.reducedMotion });
    showToast(prefs.reducedMotion ? 'Stillness on' : 'Motion on');
    leave(this, () => this.scene.restart());
  }


  /**
   * A difficulty as a glass disc: translucent night-surface fill under a soft
   * inner sheen, ringed in the mode's own colour, one word in the middle.
   * The whole disc is the button.
   */
  private makeCircle(diameter: number, d: DiffDef): GameObjects.Container {
    const r = diameter / 2;

    const bg = this.add.graphics();
    const paint = (fillAlpha: number, lineAlpha: number): void => {
      bg.clear();
      // The glass: a dark body, a pale breath across the top half, a lit rim.
      bg.fillStyle(color.surface, fillAlpha);
      bg.fillCircle(0, 0, r);
      bg.fillStyle(0xffffff, 0.05);
      bg.fillEllipse(0, -r * 0.42, r * 1.5, r * 0.85);
      bg.lineStyle(hairline * 1.5, d.color, lineAlpha);
      bg.strokeCircle(0, 0, r);
    };
    paint(0.42, 0.6);

    const label = crispText(this, 0, 0, d.label, {
      fontFamily: font.serif,
      fontSize: `${diameter > 100 ? typeScale.title : typeScale.lead}px`,
      color: hex(d.color),
    }).setOrigin(0.5);

    const container = this.add.container(0, 0, [bg, label]);
    container.setSize(diameter, diameter);

    pressable(this, container, tapArea(diameter, diameter), {
      enabled: () => !this.busy(),
      onClick: () => void this.openPlay(d.value),
      onHover: () => paint(0.55, 0.9),
      onPress: () => {
        paint(0.65, 1);
        motion(this, { targets: container, scale: 0.94, duration: duration.micro });
      },
      onRest: () => {
        paint(0.42, 0.6);
        motion(this, { targets: container, scale: 1, duration: duration.fast });
      },
    });

    return container;
  }
}

/** Resolves to null after `ms`, so a promise can be raced against the clock. */
function delay(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}


function rowWidth(pills: Pill[]): number {
  return pills.reduce((sum, p) => sum + p.width, 0) + space.sm * (pills.length - 1);
}

function soundLabel(): string {
  return prefs.sound ? 'Sound' : 'Muted';
}

function tutorialLabel(): string {
  return 'Tutorial';
}

function soundIcon(): IconName {
  return prefs.sound ? 'sound' : 'mute';
}

function motionLabel(): string {
  return prefs.animate ? 'Motion' : 'Stillness';
}

/** Stillness wears the moon: the sky is still there, it has simply stopped moving. */
function motionIcon(): IconName {
  return prefs.animate ? 'sparkle' : 'moon';
}

/** The soft community line under the difficulty cards. Never shames an empty sky. */
function describeTonight(community: InitResponse['community'], jwala: number, archive: boolean): string {
  const stars = communityMilestone(community, archive);
  // No icon here: this is one wrapped, centred line of prose, and a Graphics
  // cannot flow inside a `Text`. "Jwala" is the streak's name — it needs no glyph.
  return jwala > 0 ? `${stars}  ·  Jwala ${jwala}` : stars;
}
