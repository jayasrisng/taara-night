/**
 * End-to-end route tests.
 *
 * `@devvit/web/server` is stubbed — an in-memory Redis, a switchable current
 * user, a switchable subreddit — so the real Hono handlers run start to finish
 * without a Devvit runtime. This covers the things unit tests cannot: routing,
 * status codes, the JSON shapes the client depends on, the spoiler rule, and
 * the dev-only gate on the night override.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSTELLATION_DATA } from '../../shared/constellationData';
import { createFakeRedis } from '../core/fakeRedis';
import { keys } from '../core/keys';

type SubmittedComment = { id: string; text: string; runAs?: string };

const live = {
  redis: createFakeRedis(),
  username: 'ana' as string | undefined,
  subredditName: 'taara_connect_dev',
  postId: 't3_abc' as string | undefined,
  comments: [] as SubmittedComment[],
  posts: [] as { subredditName: string; title: string; text: string; runAs?: string }[],
};

vi.mock('@devvit/web/server', () => ({
  // Delegate so each test can swap in a fresh fake.
  redis: {
    get: (...a: Parameters<typeof live.redis.get>) => live.redis.get(...a),
    set: (...a: Parameters<typeof live.redis.set>) => live.redis.set(...a),
    mGet: (...a: Parameters<typeof live.redis.mGet>) => live.redis.mGet(...a),
    incrBy: (...a: Parameters<typeof live.redis.incrBy>) => live.redis.incrBy(...a),
    hGetAll: (...a: Parameters<typeof live.redis.hGetAll>) => live.redis.hGetAll(...a),
    hSet: (...a: Parameters<typeof live.redis.hSet>) => live.redis.hSet(...a),
    zAdd: (...a: Parameters<typeof live.redis.zAdd>) => live.redis.zAdd(...a),
    zRange: (...a: Parameters<typeof live.redis.zRange>) => live.redis.zRange(...a),
  },
  reddit: {
    getCurrentUsername: async () => live.username,
    submitComment: async (comment: SubmittedComment) => {
      live.comments.push(comment);
      return { id: `t1_${live.comments.length}`, permalink: `/r/x/comments/abc/_/c${live.comments.length}/` };
    },
    submitPost: async (post: { subredditName: string; title: string; text: string; runAs?: string }) => {
      live.posts.push(post);
      return { id: `t3_share${live.posts.length}`, permalink: `/r/x/comments/share${live.posts.length}/` };
    },
  },
  context: {
    get postId() {
      return live.postId;
    },
    get subredditName() {
      return live.subredditName;
    },
  },
}));

const { api } = await import('./api');

const post = (body: unknown) =>
  api.request('/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const share = () => api.request('/share', { method: 'POST' });

const solve = { timeMs: 42_000, whispers: 1, glitches: 2 };

// Keep route tests after the public launch epoch. Tests that rely on "yesterday"
// or an archive being older than tonight should not depend on the wall clock of
// the machine running the release suite.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('routes', () => {
  beforeEach(() => {
    live.redis = createFakeRedis();
    live.username = 'ana';
    live.subredditName = 'taara_connect_dev';
    live.postId = 't3_abc';
    live.comments = [];
    live.posts = [];
  });

  it('GET /init returns tonight', async () => {
    const res = await api.request('/init');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('init');
    expect(body.username).toBe('ana');
    expect(body.night).toBeGreaterThan(0);
    expect(body.label).toBe(`TaaraNight #${body.night}`);
    expect(body.msUntilNextNight).toBeGreaterThan(0);
    expect(body.postId).toBe('t3_abc');
    expect(body.tonight).toBeNull();
  });

  it('never leaks a constellation name or story', async () => {
    const payload = JSON.stringify(await (await api.request('/init')).json());
    for (const c of CONSTELLATION_DATA.constellations) {
      expect(payload).not.toContain(c.name);
      expect(payload).not.toContain(c.story.slice(0, 24));
    }
  });

  it('POST /complete records once, then reports alreadyPlayed', async () => {
    const first = await (await post(solve)).json();
    expect(first.recorded).toBe(true);
    expect(first.alreadyPlayed).toBe(false);
    expect(first.jwala.current).toBe(1);
    expect(first.community.playersTonight).toBe(1);

    const second = await (await post({ ...solve, timeMs: 1 })).json();
    expect(second.alreadyPlayed).toBe(true);
    expect(second.result.timeMs).toBe(42_000);
    expect(second.community.playersTonight).toBe(1);
  });

  it('GET /init then reflects the stored result', async () => {
    await post(solve);
    const body = await (await api.request('/init')).json();
    expect(body.tonight.timeMs).toBe(42_000);
    expect(body.jwala.current).toBe(1);
  });

  it('POST /complete rejects bad payloads with 400', async () => {
    expect((await post({ ...solve, timeMs: -5 })).status).toBe(400);
    expect((await post({ ...solve, whispers: 1.5 })).status).toBe(400);
    expect((await post({ ...solve, glitches: -1 })).status).toBe(400);
    const res = await api.request('/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('honours the night override in the dev subreddit', async () => {
    const init = await (await api.request('/init')).json();
    const yesterday = await (await post({ ...solve, night: init.night - 1 })).json();
    expect(yesterday.recorded).toBe(true);
    expect(yesterday.jwala.current).toBe(1);

    const tonight = await (await post(solve)).json();
    expect(tonight.jwala.current).toBe(2);
    expect(tonight.jwala.lastNight).toBe(init.night);
  });

  it('refuses the night override outside the dev subreddit', async () => {
    live.subredditName = 'TaaraNight';
    const res = await post({ ...solve, night: 3 });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/dev-only/);
  });

  it('plays but does not record for logged-out visitors', async () => {
    live.username = undefined;
    const body = await (await post(solve)).json();
    expect(body.recorded).toBe(false);
    expect(body.jwala.current).toBe(0);

    const mysky = await (await api.request('/mysky')).json();
    expect(mysky.entries).toEqual([]);
    expect(mysky.total).toBeGreaterThan(15);
  });

  it('GET /leaderboards ranks the one nightly board fastest first', async () => {
    live.username = 'slow';
    await post({ timeMs: 90_000, whispers: 0, glitches: 0 });
    live.username = 'fast';
    await post({ timeMs: 20_000, whispers: 0, glitches: 0 });

    const boards = await (await api.request('/leaderboards')).json();
    expect(boards.tonight.map((row: { username: string }) => row.username)).toEqual(['fast', 'slow']);
    expect(boards.tonight[0]).toMatchObject({ rank: 1, timeMs: 20_000, glitches: 0, whispers: 0 });
  });

  /**
   * The stored record is write-once, so a replay never rewrites it — the results
   * screen and the share card read this first solve back.
   * See client/ui/nightSummary.test.ts for the other half.
   */
  it('POST /complete keeps the night record on the first solve, whatever follows', async () => {
    await post({ timeMs: 16_000, whispers: 0, glitches: 0 });
    const replay = await (await post({ timeMs: 1, whispers: 0, glitches: 0 })).json();

    expect(replay.alreadyPlayed).toBe(true);
    expect(replay.result.timeMs).toBe(16_000);
    expect((await (await api.request('/init')).json()).tonight.timeMs).toBe(16_000);
  });

  it('GET /mysky and /leaderboards reflect a play', async () => {
    await post(solve);

    const mysky = await (await api.request('/mysky')).json();
    expect(mysky.entries).toHaveLength(1);
    expect(mysky.entries[0].constellationId).toBeTruthy();

    const boards = await (await api.request('/leaderboards')).json();
    expect(boards.tonight).toHaveLength(1);
    expect(boards.tonight[0]).toMatchObject({ username: 'ana', rank: 1, timeMs: 42_000, whispers: 1 });
    expect(boards.longestJwala).toEqual([{ username: 'ana', value: 1, rank: 1 }]);
  });
});

/**
 * An old post keeps its own sky. Everything the routes say — the night, the
 * community count, the boards, the recorded result — must be about the night
 * the post was pinned to, not about tonight.
 */
describe('POST /sharePost', () => {
  // Pin the post to a fixed night so the card's night number and its game link
  // are the same on every calendar day — otherwise the test rots the moment the
  // wall clock rolls past the night it was written under.
  const NIGHT = 10;

  beforeEach(async () => {
    live.redis = createFakeRedis();
    live.username = 'ana';
    live.postId = 't3_abc';
    live.comments = [];
    live.posts = [];
    await live.redis.set(keys.postNight('t3_abc'), String(NIGHT));
  });

  const solve = { timeMs: 42_000, whispers: 1, glitches: 2 };
  const post = () =>
    api.request('/complete', {
      method: 'POST',
      body: JSON.stringify(solve),
      headers: { 'content-type': 'application/json' },
    });
  const sharePost = () => api.request('/sharePost', { method: 'POST' });

  it('submits the night as the player’s own post, spoiler-free, with a link', async () => {
    await post();
    await live.redis.set(keys.nightPost(NIGHT), 't3_night10');
    const body = await (await sharePost()).json();

    expect(body.alreadyShared).toBe(false);
    expect(live.posts).toHaveLength(1);
    expect(live.posts[0]?.runAs).toBe('USER');
    expect(live.posts[0]?.title).toContain('TaaraNight #');
    expect(live.posts[0]?.text).not.toContain('Mode');
    expect(live.posts[0]?.text).toContain('1 Whisper used');
    expect(live.posts[0]?.text).toContain('reddit.com/r/taara_connect_dev/comments/night10');
    const name = (await import('../../shared/puzzleEngine')).selectConstellationForNight(NIGHT).name;
    expect(live.posts[0]?.text).not.toContain(name);
  });

  it('posts once per night, however many times it is asked', async () => {
    await post();
    await sharePost();
    const again = await (await sharePost()).json();
    expect(again.alreadyShared).toBe(true);
    expect(live.posts).toHaveLength(1);
  });

  it('refuses before the night is revealed', async () => {
    const res = await sharePost();
    expect(res.status).toBe(400);
    expect(live.posts).toHaveLength(0);
  });
});

describe('an archive post', () => {
  const ARCHIVE_NIGHT = 4;

  beforeEach(async () => {
    live.redis = createFakeRedis();
    live.username = 'ana';
    live.subredditName = 'taara_connect_dev';
    live.postId = 't3_old';
    live.comments = [];
    live.posts = [];
    await live.redis.set(keys.postNight('t3_old'), String(ARCHIVE_NIGHT));
  });

  it('GET /init opens the night the post was pinned to', async () => {
    const body = await (await api.request('/init')).json();
    expect(body.night).toBe(ARCHIVE_NIGHT);
    expect(body.label).toBe(`TaaraNight #${ARCHIVE_NIGHT}`);
  });

  it('records the completion against the post’s night', async () => {
    const body = await (await post(solve)).json();
    expect(body.recorded).toBe(true);
    expect(body.result.night).toBe(ARCHIVE_NIGHT);
  });

  it('shows that night’s stargazers, not tonight’s', async () => {
    await post(solve);

    const boards = await (await api.request('/leaderboards')).json();
    expect(boards.night).toBe(ARCHIVE_NIGHT);
    expect(boards.tonight[0]).toMatchObject({ username: 'ana', timeMs: 42_000 });

    live.postId = 't3_tonight';
    const tonight = await (await api.request('/leaderboards')).json();
    expect(tonight.night).not.toBe(ARCHIVE_NIGHT);
    expect(tonight.tonight).toEqual([]);
  });

  it('shares that night’s card', async () => {
    await post(solve);
    const body = await (await share()).json();
    expect(body.text).toContain(`TaaraNight #${ARCHIVE_NIGHT}`);
  });

  it('falls back to tonight for a post that was never pinned', async () => {
    live.postId = 't3_before_step_7';
    const body = await (await api.request('/init')).json();
    expect(body.night).toBeGreaterThan(ARCHIVE_NIGHT);
  });
});

describe('POST /share', () => {
  beforeEach(() => {
    live.redis = createFakeRedis();
    live.username = 'ana';
    live.subredditName = 'taara_connect_dev';
    live.postId = 't3_abc';
    live.comments = [];
    live.posts = [];
  });

  it('comments the card on the post, as the player', async () => {
    await post(solve);

    const res = await share();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyShared).toBe(false);
    expect(body.permalink).toBeTruthy();

    expect(live.comments).toHaveLength(1);
    expect(live.comments[0]).toMatchObject({ id: 't3_abc', runAs: 'USER' });
    expect(live.comments[0]!.text).toBe(body.text);
    expect(body.text).toContain('Jwala streak: 1 night');
    expect(body.text).toContain('1 Whisper used');
  });

  it('never spoils the constellation in the comment', async () => {
    await post(solve);
    const body = await (await share()).json();
    for (const c of CONSTELLATION_DATA.constellations) {
      expect(body.text).not.toContain(c.name);
      expect(body.text).not.toContain(c.story.slice(0, 24));
    }
  });

  it('posts one card per night, however many times it is asked', async () => {
    await post(solve);
    const first = await (await share()).json();
    const second = await (await share()).json();

    expect(second.alreadyShared).toBe(true);
    expect(second.permalink).toBe(first.permalink);
    expect(live.comments).toHaveLength(1);
  });

  it('refuses to share a night the player has not revealed', async () => {
    const res = await share();
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Reveal tonight/);
    expect(live.comments).toEqual([]);
  });

  it('refuses when logged out', async () => {
    live.username = undefined;
    expect((await share()).status).toBe(400);
    expect(live.comments).toEqual([]);
  });

  it('refuses when there is no post to comment on', async () => {
    await post(solve);
    live.postId = undefined;
    expect((await share()).status).toBe(400);
    expect(live.comments).toEqual([]);
  });
});
