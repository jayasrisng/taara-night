<p align="center">
  <img src="public/logo.png" alt="TaaraNight" width="220" />
</p>

<h1 align="center">TaaraNight</h1>
<p align="center"><em>One night. One constellation. One story.</em></p>

---

The logo above isn't stock art — it's a photograph I took of the night sky in Dover, Arkansas, one of the darkest corners of the state. Standing under that sky, I realized I could point at maybe two constellations with any confidence. Thousands of stars up there, and I knew almost none of their names.

**Taara** (తార) means *star* in Telugu, my mother tongue. TaaraNight is my attempt to fix that — one night at a time, for anyone on Reddit.

## What it is

Every night at dusk (6 PM Pacific), a new sky opens on the subreddit. Everyone gets the same one. You connect real stars — actual catalog positions, the same shapes you'd find over Dover — to reveal one of the 88 IAU constellations. When the last thread lands, the figure breathes, its name arrives — *Orion, The Hunter* — and a short original bedtime myth unlocks as your reward.

Then you go to sleep. Tomorrow there's a new sky.

It's a bedtime ritual, not a grind: the ambience is wind and crickets synthesized in your browser, the stories can be read aloud to you, and nothing ever rushes you — unless you *choose* Hard mode, where a soft timer and a dozen decoy "Glitch" stars wait for the competitive.

## How to play

1. Open tonight's TaaraNight post and pick **Easy**, **Medium**, or **Hard**.
2. Drag star to star (one long stroke works too) to weave the constellation's threads. Wrong pairs shake gently; Glitches shimmer cold.
3. Stuck? Spend a **Whisper** — a hint that lights one missing thread.
4. Reveal the figure, learn its name (turn on **star names** to learn each star's, too), and read its story.
5. Keep your **Jwala** — streak, from the Telugu for *flame* — burning by coming back each night.

## The sky you keep

Every constellation you reveal takes its true place in **My Sky** — a pannable, zoomable chart of the whole celestial sphere, drawn north-up like a real star atlas. Fill in all 88 and you've collected the entire sky — and along the way you've quietly learned to read the real one.

Solved a good night? Share it — as a comment on the nightly post or as your own post — with a spoiler-safe card that shows your mode, Glitches, Whispers, and streak, but never the constellation's name or shape. Nobody's night gets ruined.

There's one leaderboard per night, and it reads like the game feels: Hard above Medium above Easy, then fewest Glitches, fastest time, fewest Whispers. It resets at dusk. Streaks are the long game.

## Under the hood

- **Reddit Devvit** web app, **Phaser 4**, TypeScript, Hono routes, Devvit Redis. No external backend.
- Every star is a real star: J2000 positions and IAU-approved names, projected so each figure looks exactly the way it does overhead.
- The nightly puzzle is fully deterministic from the night number — everyone on Earth sees the same sky, and archive posts keep theirs forever.
- All art is procedural or my own, all 88 bedtime stories are original writing, and all audio is synthesized at runtime — nothing sampled, nothing scraped.

## Local development

Node `22.12+`.

```bash
npm install
npm run type-check && npm run lint && npm run test && npm run build
npm run login
npm run dev        # playtest on r/taara_connect_dev
```

The public community is [r/TaaraNight](https://www.reddit.com/r/TaaraNight).

## Data & attribution

- Star positions/designations: [IAU Catalog of Star Names](https://www.iau.org/public/themes/naming_stars/) and the [HYG Database v4.1](https://github.com/astronexus/HYG-Database) (CC-BY-SA).
- Story narration voice: [Piper TTS](https://github.com/rhasspy/piper), `en_US-lessac-medium` (MIT).
- Logo photograph: my own, Dover, Arkansas.
- Constellation stories, UI, icons, sounds, and effects: original work for this project.
