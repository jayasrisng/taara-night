/**
 * Redis key design for TaaraNight.
 *
 * Devvit's Redis is already scoped to one app installation (one subreddit), so
 * these keys never need a subreddit segment. Everything is prefixed `tn:` so a
 * future feature can share the space without collisions.
 *
 *   tn:night:{n}:stars      int    stars connected by everyone on night n
 *   tn:night:{n}:players    int    players who finished night n
 *   tn:result:{n}:{user}    hash   that user's result for night n (write-once)
 *   tn:jwala:{user}         hash   { current, longest, lastNight }
 *   tn:sky:{user}           zset   member = constellationId, score = night
 *   tn:lb:{n}:night         zset   member = user, score = packed night score
 *   tn:lb:jwala             zset   member = user, score = current streak
 *   tn:share:{n}:{user}     str    permalink of that user's share comment
 *   tn:post:{postId}:night  str    the night that post plays, fixed at creation
 *   tn:night:{n}:post       str    the post created for night n, if any
 *
 * The result hash doubles as the repeat-play guard: if it exists, this user has
 * already finished this night and nothing may be counted again. The share key
 * plays the same role for comments — one card per player per night.
 *
 * The two post keys are the same edge read from both ends. `tn:post:…:night` is
 * what makes an old post keep playing its own sky forever; `tn:night:…:post`
 * lets the nightly cron notice that tonight already has a post and stay quiet.
 */

const PREFIX = 'tn';

export const keys = {
  nightStars: (night: number): string => `${PREFIX}:night:${night}:stars`,
  nightPlayers: (night: number): string => `${PREFIX}:night:${night}:players`,
  result: (night: number, username: string): string => `${PREFIX}:result:${night}:${username}`,
  jwala: (username: string): string => `${PREFIX}:jwala:${username}`,
  sky: (username: string): string => `${PREFIX}:sky:${username}`,
  lbNight: (night: number): string => `${PREFIX}:lb:${night}:night`,
  lbJwala: (): string => `${PREFIX}:lb:jwala`,
  share: (night: number, username: string): string => `${PREFIX}:share:${night}:${username}`,
  sharePost: (night: number, username: string): string =>
    `${PREFIX}:sharepost:${night}:${username}`,
  postNight: (postId: string): string => `${PREFIX}:post:${postId}:night`,
  nightPost: (night: number): string => `${PREFIX}:night:${night}:post`,
};

/**
 * The unified nightly board stores one number per player, so the whole ranking
 * is packed into it, most significant first: less time, then fewer Glitches,
 * then fewer Whispers. Ascending zset order *is* the leaderboard — the fastest
 * solve wins, and Glitches/Whispers only break ties. One game per night, so
 * there is no mode to rank by anymore.
 *
 * The Glitch and Whisper counts also live on the result hash (that is the
 * authoritative record); packing them here too lets a board row carry its
 * honesty tags without a second read per row.
 *
 * Budget (all integer-safe, well under 2^53):
 *   timeMs  × 1e5    capped 9,999,999 ms (~2.8 h)
 *   glitches× 1e2    capped 999
 *   whispers× 1      capped 99
 */
export interface NightScoreParts {
  timeMs: number;
  glitches: number;
  whispers: number;
}

export function nightScore(parts: NightScoreParts): number {
  const timeMs = Math.min(Math.max(parts.timeMs, 0), 9_999_999);
  const glitches = Math.min(Math.max(parts.glitches, 0), 999);
  const whispers = Math.min(Math.max(parts.whispers, 0), 99);
  return timeMs * 1e5 + glitches * 1e2 + whispers;
}

/** Unpack a board score back into the row it describes. */
export function nightScoreParts(score: number): NightScoreParts {
  const timeMs = Math.floor(score / 1e5);
  const glitches = Math.floor((score % 1e5) / 1e2);
  const whispers = Math.floor(score % 1e2);
  return { timeMs, glitches, whispers };
}
