/**
 * The client ↔ server contract for TaaraNight.
 *
 * Spoiler rule: nothing here carries a constellation name, shape, or story.
 * The client already derives those from the shared dataset once the player has
 * solved the puzzle; the server only ever speaks in ids, counts and nights.
 */

import type { JwalaState } from './jwala';

/** What a player did on one night. Written once, on their first completion. */
export type NightResult = {
  night: number;
  /** How long the solve took, in milliseconds. */
  timeMs: number;
  /** Whispers (hints) spent. */
  whispers: number;
  /** Glitch decoys the player touched by mistake. */
  glitches: number;
  /** Real stars in this night's constellation — what they lit up. */
  starsConnected: number;
  /** Unix ms when the completion was recorded. */
  completedAt: number;
};

/** Tonight's shared, community-wide numbers. */
export type CommunityStats = {
  /** Stars connected by everyone tonight. */
  starsTonight: number;
  /** Distinct players who finished tonight. */
  playersTonight: number;
};

export type InitResponse = {
  type: 'init';
  postId: string | null;
  /** Reddit username, or null when logged out (results are not recorded). */
  username: string | null;
  night: number;
  /** "TaaraNight #12" */
  label: string;
  /** Milliseconds until the next sky unlocks (the next 01:00 UTC boundary). */
  msUntilNextNight: number;
  /** This player's result for tonight, if they have already finished it. */
  tonight: NightResult | null;
  jwala: JwalaState;
  community: CommunityStats;
};

export type CompleteRequest = {
  timeMs: number;
  whispers: number;
  glitches: number;
  /**
   * Dev-only night override, used to test streaks without waiting a day.
   * Ignored everywhere except the dev subreddit.
   */
  night?: number;
};

export type CompleteResponse = {
  type: 'complete';
  /** False when logged out — nothing was written. */
  recorded: boolean;
  /** True when this night was already completed; nothing was counted twice. */
  alreadyPlayed: boolean;
  /** The stored result — on a repeat play, the *original* one. */
  result: NightResult;
  jwala: JwalaState;
  community: CommunityStats;
  /** Milliseconds until the next sky unlocks, from the server's clock. */
  msUntilNextNight: number;
};

/** One collected constellation in a player's My Sky. */
export type SkyEntry = {
  constellationId: string;
  /** The most recent night on which they completed it. */
  night: number;
};

export type MySkyResponse = {
  type: 'mySky';
  /** Newest night first. */
  entries: SkyEntry[];
  /** How many distinct constellations exist to collect. */
  total: number;
};

export type LeaderboardEntry = {
  username: string;
  /** Time in ms, Whispers spent, or Jwala length — depends on the board. */
  value: number;
  /** 1-based. */
  rank: number;
};

/** One row of the unified nightly board — the night's stargazers, fastest first. */
export type NightBoardEntry = {
  username: string;
  /** 1-based. */
  rank: number;
  /** The solve time, in milliseconds — the board's sort key. */
  timeMs: number;
  /** Glitches touched and Whispers spent, for the row's honesty tags. */
  glitches: number;
  whispers: number;
};

export type LeaderboardsResponse = {
  type: 'leaderboards';
  night: number;
  /**
   * The one board for the night: fastest solve first, Glitches then Whispers as
   * tiebreaks. Valid for the night.
   */
  tonight: NightBoardEntry[];
  /** Longest burning Jwala, all-time. */
  longestJwala: LeaderboardEntry[];
};

/**
 * The result of posting tonight's share card as a comment.
 *
 * The comment body is composed on the server from the *stored* result, so the
 * client cannot post arbitrary text under the player's name — it only asks.
 */
export type ShareResponse = {
  type: 'share';
  /** True when this night's card was already posted; no second comment was made. */
  alreadyShared: boolean;
  /** The exact comment body, so the client can show what was posted. */
  text: string;
  /** Where the comment lives, when we know. */
  permalink: string | null;
};

/** The result of sharing the night as its own post. */
export type SharePostResponse = {
  type: 'sharePost';
  alreadyShared: boolean;
  title: string;
  text: string;
  permalink: string;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
