/**
 * The share card — the cozy result a player posts as a comment on the nightly
 * post.
 *
 * **Spoiler rule.** The card is read by people who have not played yet, so it
 * may never carry the constellation's name, its shape, or a word of its story.
 * It speaks only in the night number, the player's own effort, and a mood.
 *
 * The text is built here, in shared code, and the *server* is the only caller
 * that submits it. The client never chooses the body of a comment posted under
 * the player's name.
 */

import type { NightResult } from './api';
import type { JwalaState } from './jwala';
import { moodFor } from './mood';

/** Markdown's unambiguous hard line break: two spaces, then a newline. */
const HARD_BREAK = '  \n';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function whisperLine(whispers: number): string {
  return whispers === 0 ? 'No Whispers needed' : `${plural(whispers, 'Whisper')} used`;
}

/**
 * A Jwala of 0 means the flame is not burning: the night was played logged out,
 * or it was an old archive night, which never touches the streak. Say so rather
 * than printing "0 nights".
 */
function jwalaLine(jwala: JwalaState): string {
  return jwala.current > 0 ? `Jwala streak: ${plural(jwala.current, 'night')}` : 'Jwala streak: rekindling';
}

function glitchLine(glitches: number): string {
  return glitches === 0 ? 'No Glitches touched' : `${plural(glitches, 'Glitch')} touched`;
}

/**
 * The badge line, present only on a flawless night: no Whispers *and* no
 * Glitches. It is the same honesty the nightly board's "flawless" tag carries.
 */
function flawlessLine(result: NightResult): string | null {
  return result.whispers === 0 && result.glitches === 0 ? 'Flawless ✦' : null;
}

/**
 * The share *post* — the Wordle move: a standalone post other stargazers can
 * find, with the numbers of the night and a way in. Same spoiler rule as the
 * comment: night number, effort, mood — never the constellation.
 */
export function buildSharePost(
  result: NightResult,
  jwala: JwalaState,
  gameLink: string | null
): { title: string; text: string } {
  const flawless = flawlessLine(result);
  const lines = [
    `TaaraNight #${result.night} 🌙`,
    ...(flawless ? [flawless] : []),
    glitchLine(result.glitches),
    whisperLine(result.whispers),
    jwalaLine(jwala),
    `Mood: ${moodFor(result)}`,
  ];
  if (gameLink) lines.push('', `Reveal tonight’s sky yourself: ${gameLink}`);
  return {
    title: `TaaraNight #${result.night} — I revealed tonight’s sky 🌙`,
    text: lines.join(HARD_BREAK),
  };
}

export function buildShareText(result: NightResult, jwala: JwalaState): string {
  const flawless = flawlessLine(result);
  return [
    `TaaraNight #${result.night} 🌙`,
    'Tonight’s sky revealed',
    ...(flawless ? [flawless] : []),
    whisperLine(result.whispers),
    jwalaLine(jwala),
    `Mood: ${moodFor(result)}`,
  ].join(HARD_BREAK);
}
