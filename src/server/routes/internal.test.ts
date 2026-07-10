/**
 * The internal routes: the nightly cron, the moderator menu action, and the
 * install trigger. All three exist to put a post in the subreddit and pin it to
 * a night, so that is what these tests watch.
 *
 * `@devvit/web/server` is stubbed the same way `api.test.ts` stubs it, with an
 * in-memory Redis and a `submitCustomPost` that just remembers what it was asked
 * to submit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSTELLATION_DATA } from '../../shared/constellationData';
import { createFakeRedis } from '../core/fakeRedis';
import { keys } from '../core/keys';

type SubmittedPost = { title: string };

const live = {
  redis: createFakeRedis(),
  subredditName: 'taara_connect_dev',
  posts: [] as SubmittedPost[],
};

vi.mock('@devvit/web/server', () => ({
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
    submitCustomPost: async (post: SubmittedPost) => {
      live.posts.push(post);
      const id = `t3_${live.posts.length}`;
      return { id, permalink: `/r/x/comments/${id}/` };
    },
  },
  context: {
    get subredditName() {
      return live.subredditName;
    },
  },
}));

const { scheduler } = await import('./scheduler');
const { menu } = await import('./menu');
const { triggers } = await import('./triggers');
const { currentNight, scheduledNight } = await import('../core/night');

const runCron = () => scheduler.request('/nightly-post', { method: 'POST' });
const runMenu = () => menu.request('/post-create', { method: 'POST' });
const runInstall = () =>
  triggers.request('/on-app-install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'AppInstall' }),
  });

describe('internal routes', () => {
  beforeEach(() => {
    live.redis = createFakeRedis();
    live.subredditName = 'taara_connect_dev';
    live.posts = [];

    // Pin the clock away from the 01:00 UTC boundary, so `currentNight` and
    // `scheduledNight` agree and the cron-vs-menu tests cannot flake once a day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('the nightly cron', () => {
    it('creates tonight’s post and pins it to tonight', async () => {
      const res = await runCron();
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe('success');

      const night = scheduledNight();
      expect(live.posts).toEqual([{ title: `TaaraNight #${night} — tonight’s sky awaits 🌙` }]);
      expect(await live.redis.get(keys.postNight('t3_1'))).toBe(String(night));
      expect(await live.redis.get(keys.nightPost(night))).toBe('t3_1');
    });

    it('stays quiet when the night already has a post', async () => {
      await runCron();
      const res = await runCron();

      expect(res.status).toBe(200);
      expect((await res.json()).message).toMatch(/already has a post/);
      expect(live.posts).toHaveLength(1);
    });

    it('reports failure rather than pinning a post that was never made', async () => {
      const { reddit } = await import('@devvit/web/server');
      vi.spyOn(reddit, 'submitCustomPost').mockRejectedValueOnce(new Error('reddit is asleep'));
      vi.spyOn(console, 'error').mockImplementationOnce(() => {});

      const res = await runCron();
      expect(res.status).toBe(500);
      expect((await res.json()).status).toBe('error');
      expect(await live.redis.get(keys.nightPost(scheduledNight()))).toBeUndefined();
    });

    it('never names the constellation in the title', async () => {
      await runCron();
      const title = live.posts[0]!.title;
      for (const c of CONSTELLATION_DATA.constellations) {
        expect(title).not.toContain(c.name);
      }
    });
  });

  describe('the moderator menu action', () => {
    it('creates a post and sends the mod to it', async () => {
      const res = await runMenu();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.navigateTo).toBe('https://www.reddit.com/r/x/comments/t3_1/');
      expect(body.showToast.text).toBe(`TaaraNight #${currentNight()} is open`);
    });

    it('posts even when the night already has one — a mod asking means a mod wants', async () => {
      await runCron();
      await runMenu();

      expect(live.posts).toHaveLength(2);
      // Both posts play the same night, and the night now points at the newer.
      const night = currentNight();
      expect(await live.redis.get(keys.postNight('t3_1'))).toBe(String(night));
      expect(await live.redis.get(keys.postNight('t3_2'))).toBe(String(night));
      expect(await live.redis.get(keys.nightPost(night))).toBe('t3_2');
    });

    it('answers with a toast when the post cannot be made', async () => {
      const { reddit } = await import('@devvit/web/server');
      vi.spyOn(reddit, 'submitCustomPost').mockRejectedValueOnce(new Error('nope'));
      vi.spyOn(console, 'error').mockImplementationOnce(() => {});

      const res = await runMenu();
      expect(res.status).toBe(400);
      expect((await res.json()).showToast).toMatch(/Could not open night/);
    });
  });

  describe('the install trigger', () => {
    it('opens tonight so a fresh subreddit has a sky to play', async () => {
      const res = await runInstall();
      expect(res.status).toBe(200);
      expect(live.posts).toHaveLength(1);
      expect(await live.redis.get(keys.nightPost(currentNight()))).toBe('t3_1');
    });

    it('does not duplicate a post the cron already made', async () => {
      await runCron();
      await runInstall();
      expect(live.posts).toHaveLength(1);
    });
  });
});
