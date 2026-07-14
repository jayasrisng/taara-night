/**
 * Results — the quiet room after the story.
 *
 * Two tabs, in the order they matter at bedtime: **Tonight** (your Jwala, the
 * countdown to the next sky, what the community lit together) and **Stargazers**
 * (the soft leaderboards, deliberately last and deliberately small). My Sky is
 * no longer a tab but a place: the `MySky` scene, one tap below.
 *
 * The screen paints from what the Play scene already knew, then quietly
 * reconciles with the server. Nothing here ever waits on the network to appear.
 *
 * The share button asks the server to comment tonight's card on the post. The
 * card is spoiler-safe: it never names the constellation, only the night, the
 * player's own effort, and a mood.
 */

import * as Phaser from 'phaser';
import { Scene, GameObjects, Tweens } from 'phaser';
import { context, showLoginPrompt, showToast } from '@devvit/web/client';
import type {
  CompleteResponse,
  InitResponse,
  NightBoardEntry,
  LeaderboardsResponse,
  MySkyResponse,
  NightResult,
} from '../../shared/api';
import { EMPTY_JWALA, type JwalaState } from '../../shared/jwala';
import { millisUntilNextNight } from '../../shared/nightSeed';
import { selectConstellationForNight } from '../../shared/puzzleEngine';
import { fetchInit, fetchLeaderboards, fetchMySky, postShare } from '../api';
import { NightSky } from '../ui/NightSky';
import { untilNextSky } from '../ui/countdown';
import { crispText } from '../ui/display';
import { contentWidth, gutter, margin, rhythm, type Viewport } from '../ui/frame';
import { onLayout } from '../ui/layout';
import { crossFade, duration, enter, leaveTo } from '../ui/motion';
import { mmss, plural } from '../ui/nightSummary';
import { Pill } from '../ui/Pill';
import { pressable, tapArea } from '../ui/pressable';
import { ScrollPanel } from '../ui/ScrollPanel';
import { color, control, font, hairline, hex, ink, space, typeScale } from '../ui/theme';
import type { MySkyData } from './MySky';

const SHARE_LABEL = 'Comment';
const SHARED_LABEL = 'Commented';
const SHARE_POST_LABEL = 'Copy';
const SHARED_POST_LABEL = 'Copied';
const SIGN_IN_LABEL = 'Sign in to share';
const MY_SKY_LABEL = 'Open My Sky';

const TABS = [
  { id: 'tonight', label: 'Tonight' },
  { id: 'stargazers', label: 'Stargazers' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Below this width the tab labels tighten. */
const NARROW_W = 380;

/** Below this height the subtitle under the night number is the first thing to go. */
const DENSE_H = 560;

export type ResultsData = {
  night: number;
  /** Tonight's constellation, so My Sky can mark the one just revealed. */
  constellationId: string;
  /**
   * Play's in-flight write. Results waits for it before asking the server
   * anything, so `/api/init` and `/api/share` see a stored result rather than
   * racing the submission that produced this very screen.
   */
  submission?: Promise<CompleteResponse | null> | undefined;
  /** What Play measured, shown until (or instead of) the server's own copy. */
  timeMs: number;
  whispers: number;
  glitches: number;
  /** Carried back from My Sky, so a card already posted still reads as posted. */
  alreadyShared?: boolean;
};

/**
 * The Results screen a player lands on when they open a night they have already
 * finished — the boot decision and the night hub both use this. `null` when the
 * night is unplayed, so the caller falls through to Play instead.
 *
 * The constellation comes from the night (the same deterministic engine the
 * puzzle uses), never from the server, so My Sky can still mark the one revealed.
 */
export function resultsDataFromInit(init: InitResponse): ResultsData | null {
  if (!init.tonight) return null;
  return {
    night: init.night,
    constellationId: selectConstellationForNight(init.night).id,
    timeMs: init.tonight.timeMs,
    whispers: init.tonight.whispers,
    glitches: init.tonight.glitches,
  };
}


export class Results extends Scene {
  private params!: ResultsData;

  private sky!: NightSky;
  private panel!: ScrollPanel;
  private ui: GameObjects.GameObject[] = [];
  private pills: Pill[] = [];
  private view: Viewport = { w: 0, h: 0 };

  private tab: TabId = 'tonight';
  /** The two tab pills, kept so a swap can light one and dim the other in place. */
  private tabPills: Pill[] = [];
  /** The width the panel is filled to, so it can be refilled without a re-layout. */
  private contentW = 0;

  /** Server truth, once it answers. Until then the fallbacks below stand in. */
  private server: InitResponse | null = null;
  private mySky: MySkyResponse | null = null;
  private boards: LeaderboardsResponse | null = null;
  private boardsRequested = false;

  /** The next boundary as an absolute instant, so a rebuild never restarts the clock. */
  private nextNightAt = 0;
  private countdown: GameObjects.Text | null = null;

  private sharePill: Pill | null = null;
  private sharing = false;
  private shared = false;
  private sharePostPill: Pill | null = null;

  /** Set for the duration of a panel fill, so `panelText` knows where the middle is. */
  private panelWidth = 0;

  constructor() {
    super('Results');
  }

  preload(): void {
    if (!this.textures.exists('logo')) this.load.image('logo', 'logo.png');
  }

  init(data: ResultsData): void {
    this.params = data;
    this.ui = [];
    this.pills = [];
    this.tabPills = [];
    this.contentW = 0;
    this.tab = 'tonight';
    this.server = null;
    this.mySky = null;
    this.boards = null;
    this.boardsRequested = false;
    this.countdown = null;
    this.sharePill = null;
    this.sharing = false;
    this.shared = data.alreadyShared ?? false;
    this.nextNightAt = Date.now() + millisUntilNextNight();
  }

  create(): void {
    this.sky = new NightSky(this, this.params.night, { stars: false, shootingStars: false });
    this.panel = new ScrollPanel(this);

    onLayout(this, (view) => this.build(view));

    this.time.addEvent({ delay: 250, loop: true, callback: () => this.tickCountdown() });
    this.input.keyboard?.on('keydown-ESC', () => leaveTo(this, 'Boot'));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.panel.destroy());

    void this.sync();
    // Sweeps the panel's own camera along with the main one.
    enter(this);
  }

  /* ---------------------------------------------------------------- *
   *  Data
   * ---------------------------------------------------------------- */

  /**
   * Wait for Play's submission to land, then take the server's word for
   * everything. If the network is asleep, the screen simply keeps the numbers
   * Play handed it.
   */
  private async sync(): Promise<void> {
    await this.params.submission?.catch(() => null);
    if (!this.scene.isActive()) return;

    const [server, mySky] = await Promise.all([fetchInit(), fetchMySky()]);
    if (!this.scene.isActive()) return;

    if (server) {
      this.server = server;
      this.nextNightAt = Date.now() + server.msUntilNextNight;
    }
    this.mySky = mySky;
    this.relayout();
  }

  private async loadBoards(): Promise<void> {
    if (this.boardsRequested) return;
    this.boardsRequested = true;

    const boards = await fetchLeaderboards();
    if (!this.scene.isActive()) return;
    this.boards = boards;
    // Only the panel's contents changed, so only the panel need reappear.
    if (this.tab === 'stargazers') this.refreshPanel();
  }

  /**
   * The solve this screen was opened by — always what Play measured.
   *
   * Never the server's stored result. That is write-once (the first solve of a
   * night is the one that counts), so on a replay it describes an earlier solve.
   */
  private played(): NightResult {
    return {
      night: this.params.night,
      timeMs: this.params.timeMs,
      whispers: this.params.whispers,
      glitches: this.params.glitches,
      starsConnected: this.server?.tonight?.starsConnected ?? 0,
      completedAt: this.server?.tonight?.completedAt ?? Date.now(),
    };
  }

  private jwala(): JwalaState {
    return this.server?.jwala ?? EMPTY_JWALA;
  }

  /**
   * Who is looking at this screen — which decides whether it shows a flame, an
   * invitation to sign in, or simply the fact that it is still asking.
   */
  private viewer(): 'loading' | 'anonymous' | 'known' {
    if (!this.server) return 'loading';
    return this.server.username ? 'known' : 'anonymous';
  }

  private tickCountdown(): void {
    this.countdown?.setText(untilNextSky(this.nextNightAt - Date.now()).replace('Next sky in ', ''));
  }

  /* ---------------------------------------------------------------- *
   *  Sharing
   * ---------------------------------------------------------------- */

  private async share(): Promise<void> {
    if (this.sharing || this.shared) return;
    this.sharing = true;
    this.sharePill?.setLabel('Sharing…').setEnabled(false);

    const outcome = await postShare();
    this.sharing = false;
    if (!this.scene.isActive()) return;

    if (!outcome.ok) {
      showToast(outcome.message);
      this.sharePill?.setIcon('comment').setLabel(SHARE_LABEL).setEnabled(true);
      return;
    }

    this.shared = true;
    this.sharePill?.setIcon('check').setLabel(SHARED_LABEL).setEnabled(false);
    showToast(
      outcome.value.alreadyShared ? 'Your card is already on tonight’s post' : 'Your card is on tonight’s post'
    );
  }

  /**
   * The card in the clipboard, with a way in — paste it anywhere: a comment,
   * a chat, another app. Built from the same spoiler-safe lines the comment
   * uses, plus the link to this night's post.
   */
  private async copyShare(): Promise<void> {
    const played = this.played();
    const jwala = this.jwala();
    const tag =
      played.whispers === 0 && played.glitches === 0
        ? 'Flawless — no Whispers, no Glitches'
        : played.whispers === 0
          ? 'No Whispers'
          : played.glitches === 0
            ? 'No Glitches'
            : `${plural(played.whispers, 'Whisper')} · ${plural(played.glitches, 'Glitch')}`;
    const lines = [
      `TaaraNight #${this.params.night} 🌙`,
      `${mmss(played.timeMs)} tonight`,
      tag,
      ...(jwala.current > 0 ? [`Jwala streak: ${plural(jwala.current, 'night')}`] : []),
      `Play tonight's sky: ${postUrl()}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.sharePostPill?.setIcon('check').setLabel(SHARED_POST_LABEL);
      showToast('Copied — paste it anywhere');
      this.time.delayedCall(2000, () => this.sharePostPill?.setIcon('share').setLabel(SHARE_POST_LABEL));
    } catch {
      showToast('Could not reach the clipboard');
    }
  }

  /* ---------------------------------------------------------------- *
   *  Layout
   * ---------------------------------------------------------------- */

  private relayout(): void {
    if (this.view.w > 0) this.build(this.view);
  }

  /**
   * A vertical flow, like the menu: the header grows down from the top, the
   * share row grows up from the bottom, and the scroll panel takes what is
   * genuinely left. The panel is the only thing allowed to overflow, and it
   * clips rather than collides.
   */
  private build(view: Viewport): void {
    this.view = view;
    const { w, h } = view;
    this.sky.layout(view);

    this.ui.forEach((o) => o.destroy());
    this.pills.forEach((p) => p.destroy());
    this.ui = [];
    this.pills = [];
    this.tabPills = [];
    this.countdown = null;
    this.sharePill = null;

    const sidePad = gutter(view);
    const step = rhythm(view);
    const narrow = w < NARROW_W;
    const dense = h < DENSE_H;
    const contentW = contentWidth(view);

    /* ---- header, flowing down ---- */

    let top = margin(view);

    // The logo is the brand; the number is the day. No word repeats either.
    if (this.textures.exists('logo')) {
      const logoH = dense ? 34 : 44;
      const logo = this.add.image(w / 2 - space.xs, top + logoH / 2, 'logo');
      logo.setScale(logoH / logo.height);
      const title = crispText(this, w / 2 + logoH / 2 + space.sm, top + logoH / 2, `#${this.params.night}`, {
        fontFamily: font.serif,
        fontSize: `${typeScale.title}px`,
        color: ink.bright,
      }).setOrigin(0, 0.5);
      logo.setX(w / 2 - (logoH + space.sm + title.width) / 2 + logoH / 2);
      title.setX(logo.x + logoH / 2 + space.sm);
      this.ui.push(logo, title);
      top += logoH;
    } else {
      const title = crispText(this, w / 2, top, `#${this.params.night}`, {
        fontFamily: font.serif,
        fontSize: `${typeScale.heading}px`,
        color: ink.bright,
      }).setOrigin(0.5, 0);
      this.ui.push(title);
      top += title.height;
    }

    /* ---- tabs ---- */

    top += step;
    const tabGap = space.sm;
    const tabW = (contentW - tabGap * (TABS.length - 1)) / TABS.length;

    TABS.forEach((tab, i) => {
      const pill = new Pill(
        this,
        tab.label,
        {
          height: control.md,
          minWidth: tabW,
          fontSize: narrow ? typeScale.caption : typeScale.body,
          paddingX: space.sm,
        },
        () => this.selectTab(tab.id)
      );
      pill.setActive(tab.id === this.tab);
      pill.setPosition(sidePad + tabW / 2 + i * (tabW + tabGap), top + control.md / 2);
      this.pills.push(pill);
      this.tabPills.push(pill);
    });
    top += control.md;

    /* ---- share row, flowing up ---- */

    let bottom = h - margin(view);

    const back = crispText(this, w / 2, bottom, 'Return to the sky', {
      fontFamily: font.sans,
      fontSize: `${typeScale.caption}px`,
      color: ink.faint,
    }).setOrigin(0.5, 1);
    // A quiet line of text, but a full-sized target: the hit area grows around
    // the glyphs rather than the type growing to meet the thumb. Its colour
    // warms and cools on the same curve every pill uses.
    let shade: number = color.textFaint;
    let warming: Tweens.Tween | null = null;
    const shadeTo = (to: number): void => {
      if (shade === to) return;
      warming?.remove();
      warming = crossFade(this, shade, to, (blended) => {
        shade = blended;
        back.setColor(hex(blended));
      });
    };
    back.once(GameObjects.Events.DESTROY, () => warming?.remove());

    pressable(this, back, tapArea(back.width, back.height), {
      onClick: () => leaveTo(this, 'Boot'),
      onHover: () => shadeTo(color.textMuted),
      onPress: () => shadeTo(color.accent),
      onRest: () => shadeTo(color.textFaint),
    });
    this.ui.push(back);
    // Room for the grown hit area above the text, so it never eats the share pill's edge.
    bottom -= back.height + space.lg;

    // A signed-out player cannot comment, so the button asks for the one thing
    // that would let them — rather than offering a share that will be refused.
    const anonymous = this.viewer() === 'anonymous';
    const rowW = Math.min(contentW, 280);
    const share = new Pill(
      this,
      anonymous ? SIGN_IN_LABEL : this.shared ? SHARED_LABEL : SHARE_LABEL,
      {
        height: control.lg,
        minWidth: anonymous ? rowW : (rowW - space.sm) / 2,
        fontSize: anonymous ? typeScale.body : typeScale.caption,
        // Signing in is not sharing, so it carries no icon.
        ...(anonymous ? {} : { icon: this.shared ? ('check' as const) : ('comment' as const) }),
      },
      () => (anonymous ? showLoginPrompt() : void this.share())
    );
    share.setEnabled(anonymous || (this.viewer() === 'known' && !this.shared && !this.sharing));
    this.sharePill = share;
    this.pills.push(share);

    if (anonymous) {
      share.setPosition(w / 2, bottom - control.lg / 2);
    } else {
      // Two ways out into the community, side by side: the comment on tonight's
      // post, and the standalone post other stargazers can wander in from.
      share.setPosition(w / 2 - rowW / 2 + share.width / 2, bottom - control.lg / 2);
      const copyPill = new Pill(
        this,
        SHARE_POST_LABEL,
        {
          height: control.lg,
          minWidth: (rowW - space.sm) / 2,
          fontSize: typeScale.caption,
          icon: 'share' as const,
        },
        () => void this.copyShare()
      );
      copyPill.setPosition(w / 2 + rowW / 2 - copyPill.width / 2, bottom - control.lg / 2);
      this.sharePostPill = copyPill;
      this.pills.push(copyPill);
    }
    bottom -= control.lg + space.sm;

    const mySky = new Pill(
      this,
      MY_SKY_LABEL,
      { height: control.md, minWidth: Math.min(contentW, 280), fontSize: typeScale.body, icon: 'sparkle' },
      () => this.openMySky()
    );
    mySky.setPosition(w / 2, bottom - control.md / 2);
    this.pills.push(mySky);
    bottom -= control.md + space.sm;

    /* ---- the panel takes what is left ---- */

    const panelTop = top + step;
    const panelH = Math.max(80, bottom - panelTop);
    this.contentW = contentW;
    this.panel.setBounds(sidePad, panelTop, contentW, panelH);
    this.fillPanel(contentW);
  }

  /**
   * A tab swap is not a new screen. The pills warm and cool where they stand,
   * and only the panel's contents are exchanged — behind its own fade, so a
   * screenful of numbers is never seen being replaced.
   */
  private selectTab(tab: TabId): void {
    if (this.tab === tab) return;
    this.tab = tab;
    if (tab === 'stargazers') void this.loadBoards();

    TABS.forEach((candidate, i) => this.tabPills[i]?.setActive(candidate.id === tab));
    this.refreshPanel();
  }

  /** Re-fill the panel in place and let its contents arrive rather than appear. */
  private refreshPanel(): void {
    if (this.contentW === 0) return;
    this.fillPanel(this.contentW);
    this.panel.fadeIn(duration.base);
  }

  /**
   * My Sky is a whole night sky, so it gets a whole screen. It carries this
   * screen's state with it and hands it back on the way out, so returning here
   * does not undo a card the player already shared.
   */
  private openMySky(): void {
    const data: MySkyData = {
      tonight: { constellationId: this.params.constellationId, night: this.params.night },
      results: { ...this.params, alreadyShared: this.shared },
    };
    leaveTo(this, 'MySky', data);
  }

  /* ---------------------------------------------------------------- *
   *  Panels
   * ---------------------------------------------------------------- */

  private fillPanel(w: number): void {
    this.panel.clear();

    const height = this.tab === 'tonight' ? this.fillTonight(w) : this.fillStargazers(w);

    this.panel.setContentHeight(height);
  }

  /** A centred line inside the panel, top-anchored at `y`. */
  private panelText(
    y: number,
    content: string,
    size: number,
    fill: string,
    options: { family?: string; italic?: boolean; wrap?: number } = {}
  ): GameObjects.Text {
    const text = crispText(this, this.panelWidth / 2, y, content, {
      fontFamily: options.family ?? font.sans,
      fontSize: `${size}px`,
      color: fill,
      align: 'center',
      ...(options.italic ? { fontStyle: 'italic' } : {}),
      ...(options.wrap ? { wordWrap: { width: options.wrap } } : {}),
    }).setOrigin(0.5, 0);
    this.panel.add(text);
    return text;
  }

  private divider(y: number, w: number): void {
    const line = this.add.graphics();
    line.lineStyle(hairline, color.line, 0.9);
    line.lineBetween(w * 0.15, y, w * 0.85, y);
    this.panel.add(line);
  }

  /* ---- Tonight ---- */

  /**
   * Wordle's grammar: the numbers ARE the screen. Four stats — tonight's time,
   * Glitches touched, the streak, skies collected — then the community line.
   */
  private fillTonight(w: number): number {
    this.panelWidth = w;
    const jwala = this.jwala();
    const community = this.server?.community;
    const played = this.played();

    const wrap = w - space.xxl;
    let y = space.md;

    const quarter = w / 4;
    const stat = (slot: number, value: string, caption: string, tint: string = ink.bright): number => {
      const cx = quarter / 2 + quarter * slot;
      const big = crispText(this, cx, y, value, {
        fontFamily: font.serif,
        fontSize: `${typeScale.title}px`,
        color: tint,
      }).setOrigin(0.5, 0);
      const small = crispText(this, cx, y + big.height + space.xs, caption, {
        fontFamily: font.sans,
        fontSize: `${typeScale.micro}px`,
        color: ink.faint,
      }).setOrigin(0.5, 0);
      this.panel.add(big);
      this.panel.add(small);
      return big.height + space.xs + small.height;
    };

    const viewer = this.viewer();
    const rows: number[] = [];
    rows.push(stat(0, mmss(played.timeMs), 'time'));
    rows.push(stat(1, String(played.glitches), played.glitches === 1 ? 'glitch' : 'glitches'));
    rows.push(stat(2, viewer === 'known' ? String(jwala.current) : '—', 'streak', ink.accentDeep));
    rows.push(stat(3, this.mySky ? String(this.mySky.entries.length) : '—', 'collected'));
    y += Math.max(...rows) + space.md;

    if (viewer === 'anonymous') {
      y += this.panelText(y, 'Sign in to keep your Jwala burning', typeScale.caption, ink.muted, { wrap })
        .height;
      y += space.sm;
    } else if (viewer === 'known' && !this.server?.tonight) {
      y += this.panelText(y, 'Tonight is not written down yet', typeScale.caption, ink.faint, { wrap })
        .height;
      y += space.sm;
    }

    y += space.md;
    this.divider(y, w);
    y += space.lg;

    if (community) {
      const line = `${community.starsTonight} stars lit so far, by ${plural(community.playersTonight, 'stargazer')}`;
      y += this.panelText(y, line, typeScale.body, ink.muted, { wrap }).height;
    }

    return y + space.sm;
  }

  /* ---- Stargazers ---- */

  private fillStargazers(w: number): number {
    this.panelWidth = w;
    let y = space.xs;

    if (!this.boards) {
      this.panelText(y, 'Looking for tonight’s stargazers…', typeScale.body, ink.faint);
      return y + space.xxl;
    }

    y = this.nightBoard(y, w, this.boards.tonight);

    return y + 4;
  }

  /**
   * The one nightly board: fastest solve first. Each row shows its time and the
   * honesty tag it earned — flawless, or the single clean thing it managed.
   */
  private nightBoard(y: number, w: number, rows: NightBoardEntry[]): number {
    let cursor = y + space.sm;

    if (rows.length === 0) {
      cursor += this.panelText(cursor, 'No one has finished tonight', typeScale.caption, ink.faint, {
        italic: true,
      }).height;
      return cursor + space.lg;
    }

    const me = this.server?.username;
    for (const row of rows) {
      const mine = row.username === me;
      const fill = mine ? ink.accent : ink.muted;

      const rank = crispText(this, space.xs, cursor, String(row.rank), {
        fontFamily: font.sans,
        fontSize: `${typeScale.micro}px`,
        color: ink.faint,
      }).setOrigin(0, 0);

      const name = crispText(this, space.xxl, cursor, mine ? `${row.username} (you)` : row.username, {
        fontFamily: font.sans,
        fontSize: `${typeScale.caption}px`,
        color: fill,
      }).setOrigin(0, 0);

      // Time is the score. Help taken is noted quietly; a clean run says nothing.
      const marks: string[] = [];
      if (row.whispers > 0) marks.push(`${row.whispers}w`);
      if (row.glitches > 0) marks.push(`${row.glitches}g`);
      const detail = marks.length > 0 ? `${mmss(row.timeMs)} · ${marks.join(' ')}` : mmss(row.timeMs);
      const value = crispText(this, w - space.md, cursor, detail, {
        fontFamily: font.sans,
        fontSize: `${typeScale.micro}px`,
        color: fill,
      }).setOrigin(1, 0);

      this.panel.add(rank, name, value);
      cursor += name.height + space.sm;
    }

    return cursor + space.lg;
  }

}


function postUrl(): string {
  const sub = context.subredditName;
  const post = context.postId?.replace(/^t3_/, '');
  if (sub && post) return `https://www.reddit.com/r/${sub}/comments/${post}/`;
  return 'https://www.reddit.com/r/TaaraNight/';
}
