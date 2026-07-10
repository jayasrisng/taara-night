/**
 * The storage layer: results, Jwala streaks, My Sky, community stats and the
 * soft leaderboards. Key layout lives in keys.ts.
 *
 * Redis, in Devvit terms, is the app's own persistent key-value store, scoped
 * to the subreddit the app is installed in. It is the only storage TaaraNight
 * has — there is no external backend.
 *
 * This module takes its Redis client as an argument rather than importing the
 * live one, so the whole store can be driven by an in-memory fake in tests.
 * `store.ts` binds it to the real client; nothing else should.
 */

import type { RedisClient } from '@devvit/redis';
import type {
  CommunityStats,
  CompleteRequest,
  LeaderboardEntry,
  NightBoardEntry,
  NightResult,
  SkyEntry,
} from '../../shared/api';
import { CONSTELLATION_DATA } from '../../shared/constellationData';
import { advanceJwala, EMPTY_JWALA, type JwalaState } from '../../shared/jwala';
import { selectConstellationForNight } from '../../shared/puzzleEngine';
import { keys, nightScore, nightScoreParts } from './keys';

/** Just the Redis surface TaaraNight actually uses. */
export type RedisLike = Pick<
  RedisClient,
  'get' | 'set' | 'mGet' | 'incrBy' | 'hGetAll' | 'hSet' | 'zAdd' | 'zRange'
>;

/** How many rows a soft leaderboard shows. Gentle, not exhaustive. */
const LEADERBOARD_SIZE = 10;

/** How many distinct constellations there are to collect. */
export const TOTAL_CONSTELLATIONS = CONSTELLATION_DATA.constellations.length;

function toInt(value: string | undefined | null, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rank(
  rows: { member: string; score: number }[],
  transform: (score: number) => number = (score) => score
): LeaderboardEntry[] {
  return rows.map((row, index) => ({
    username: row.member,
    value: transform(row.score),
    rank: index + 1,
  }));
}

export type RecordOutcome = {
  alreadyPlayed: boolean;
  result: NightResult;
  jwala: JwalaState;
  community: CommunityStats;
};

export type Leaderboards = {
  /** The one board: tonight's stargazers, best night first. */
  tonight: NightBoardEntry[];
  longestJwala: LeaderboardEntry[];
};

export function createStore(redis: RedisLike) {
  /* ---------------------------------------------------------------- *
   *  Jwala
   * ---------------------------------------------------------------- */

  async function loadJwala(username: string): Promise<JwalaState> {
    const hash = await redis.hGetAll(keys.jwala(username));
    if (!hash || Object.keys(hash).length === 0) return EMPTY_JWALA;
    return {
      current: toInt(hash.current),
      longest: toInt(hash.longest),
      lastNight: toInt(hash.lastNight),
    };
  }

  async function saveJwala(username: string, jwala: JwalaState): Promise<void> {
    await redis.hSet(keys.jwala(username), {
      current: String(jwala.current),
      longest: String(jwala.longest),
      lastNight: String(jwala.lastNight),
    });
    // The board tracks the flame currently burning, so a broken streak lowers
    // the score rather than leaving a stale high-water mark.
    await redis.zAdd(keys.lbJwala(), { member: username, score: jwala.current });
  }

  /* ---------------------------------------------------------------- *
   *  Results
   * ---------------------------------------------------------------- */

  /** A player's result for a night, or null if they have not finished it. */
  async function loadResult(night: number, username: string): Promise<NightResult | null> {
    const hash = await redis.hGetAll(keys.result(night, username));
    if (!hash || Object.keys(hash).length === 0) return null;

    return {
      night,
      timeMs: toInt(hash.timeMs),
      whispers: toInt(hash.whispers),
      glitches: toInt(hash.glitches),
      starsConnected: toInt(hash.starsConnected),
      completedAt: toInt(hash.completedAt),
    };
  }

  async function saveResult(username: string, result: NightResult): Promise<void> {
    await redis.hSet(keys.result(result.night, username), {
      timeMs: String(result.timeMs),
      whispers: String(result.whispers),
      glitches: String(result.glitches),
      starsConnected: String(result.starsConnected),
      completedAt: String(result.completedAt),
    });
  }

  /* ---------------------------------------------------------------- *
   *  Share cards
   * ---------------------------------------------------------------- */

  /** The permalink of this player's share comment for a night, if they posted one. */
  async function loadShare(night: number, username: string): Promise<string | null> {
    return (await redis.get(keys.share(night, username))) ?? null;
  }

  /** Remember that the card is posted, so a second tap cannot post a second comment. */
  async function saveShare(night: number, username: string, permalink: string): Promise<void> {
    await redis.set(keys.share(night, username), permalink);
  }

  /** The same pair, for the standalone share post. */
  async function loadSharePost(night: number, username: string): Promise<string | null> {
    return (await redis.get(keys.sharePost(night, username))) ?? null;
  }

  async function saveSharePost(night: number, username: string, permalink: string): Promise<void> {
    await redis.set(keys.sharePost(night, username), permalink);
  }

  /* ---------------------------------------------------------------- *
   *  Posts and their nights
   * ---------------------------------------------------------------- */

  /**
   * The night a post plays, pinned when the post was created.
   *
   * This is what keeps an archive post honest: last week's post opens last
   * week's sky, not tonight's. Posts that predate this mapping return null and
   * the caller falls back to tonight.
   */
  async function loadPostNight(postId: string): Promise<number | null> {
    const raw = await redis.get(keys.postNight(postId));
    if (!raw) return null;
    const night = Number.parseInt(raw, 10);
    return Number.isFinite(night) && night >= 1 ? night : null;
  }

  /** The post that already opened a night, if one did. */
  async function loadNightPost(night: number): Promise<string | null> {
    return (await redis.get(keys.nightPost(night))) ?? null;
  }

  /** Pin a post to its night, readable from either end. */
  async function savePostNight(postId: string, night: number): Promise<void> {
    await Promise.all([
      redis.set(keys.postNight(postId), String(night)),
      redis.set(keys.nightPost(night), postId),
    ]);
  }

  /* ---------------------------------------------------------------- *
   *  Community / My Sky / leaderboards
   * ---------------------------------------------------------------- */

  async function loadCommunity(night: number): Promise<CommunityStats> {
    const [stars, players] = await redis.mGet([keys.nightStars(night), keys.nightPlayers(night)]);
    return { starsTonight: toInt(stars), playersTonight: toInt(players) };
  }

  /**
   * Every constellation this player has revealed, newest night first. Keyed by
   * constellation, so revealing one again after the no-repeat window refreshes
   * its night rather than adding a duplicate.
   */
  async function loadMySky(username: string): Promise<SkyEntry[]> {
    const rows = await redis.zRange(keys.sky(username), 0, -1, { by: 'rank' });
    return rows
      .map((row) => ({ constellationId: row.member, night: row.score }))
      .sort((a, b) => b.night - a.night);
  }

  async function loadLeaderboards(night: number): Promise<Leaderboards> {
    const top = LEADERBOARD_SIZE - 1;
    const [tonight, jwala] = await Promise.all([
      redis.zRange(keys.lbNight(night), 0, top, { by: 'rank' }),
      redis.zRange(keys.lbJwala(), 0, top, { by: 'rank', reverse: true }),
    ]);

    return {
      tonight: tonight.map((row, index) => ({
        username: row.member,
        rank: index + 1,
        ...nightScoreParts(row.score),
      })),
      longestJwala: rank(jwala),
    };
  }

  /* ---------------------------------------------------------------- *
   *  Recording a completion
   * ---------------------------------------------------------------- */

  /**
   * Record a completed night for a player.
   *
   * There is one game per night now, so the first completion is the only one:
   * it writes the night record, feeds the Jwala, adds the constellation to My
   * Sky, bumps the community counters and places the player on the nightly
   * board. The result hash is the write-once guard — a replay finds it and
   * counts nothing, answering `alreadyPlayed`.
   *
   * The constellation and its star count come from the night number, never from
   * the client, so a tampered request cannot collect a constellation it did not
   * actually reveal.
   */
  async function recordCompletion(
    username: string,
    night: number,
    request: CompleteRequest,
    now: number = Date.now()
  ): Promise<RecordOutcome> {
    const existing = await loadResult(night, username);
    if (existing) {
      const [jwala, community] = await Promise.all([loadJwala(username), loadCommunity(night)]);
      return { alreadyPlayed: true, result: existing, jwala, community };
    }

    const constellation = selectConstellationForNight(night);
    const result: NightResult = {
      night,
      timeMs: request.timeMs,
      whispers: request.whispers,
      glitches: request.glitches,
      starsConnected: constellation.stars.length,
      completedAt: now,
    };

    await saveResult(username, result);

    // The nightly board: fastest first, Glitches then Whispers as tiebreaks.
    await redis.zAdd(keys.lbNight(night), { member: username, score: nightScore(result) });

    const jwala = advanceJwala(await loadJwala(username), night);
    await saveJwala(username, jwala);

    await redis.zAdd(keys.sky(username), { member: constellation.id, score: night });

    await Promise.all([
      redis.incrBy(keys.nightStars(night), result.starsConnected),
      redis.incrBy(keys.nightPlayers(night), 1),
    ]);

    const community = await loadCommunity(night);
    return { alreadyPlayed: false, result, jwala, community };
  }

  return {
    loadJwala,
    loadResult,
    loadShare,
    saveShare,
    loadSharePost,
    saveSharePost,
    loadPostNight,
    loadNightPost,
    savePostNight,
    loadCommunity,
    loadMySky,
    loadLeaderboards,
    recordCompletion,
  };
}

export type Store = ReturnType<typeof createStore>;
