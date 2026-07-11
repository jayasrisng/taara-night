/**
 * The post preview. One logo, one night number, one way in.
 *
 * The night is painted from the client's own clock so the card is never blank
 * in a feed, then reconciled with the server — which knows the night this post
 * was actually born under, so an archive post names its own sky rather than
 * tonight's. Same pattern as MainMenu, for the same reason.
 */

import { requestExpandedMode } from '@devvit/web/client';
import { nightNumberAt } from '../shared/nightSeed';
import { fetchInit } from './api';

const nightElement = document.getElementById('night') as HTMLParagraphElement;
const dateElement = document.getElementById('date') as HTMLParagraphElement;
const startButton = document.getElementById('start-button') as HTMLButtonElement;

startButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

// Wordle's grammar: the number and the date carry the day; the logo carries
// the name. No word on this card says "TaaraNight" — the logo already did.
nightElement.textContent = `#${Math.max(1, nightNumberAt(Date.now()))}`;
dateElement.textContent = new Date().toLocaleDateString(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

async function syncNight(): Promise<void> {
  const init = await fetchInit();
  if (init) nightElement.textContent = `#${init.night}`;
}

void syncNight();
