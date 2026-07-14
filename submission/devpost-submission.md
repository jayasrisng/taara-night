# TaaraNight Devpost Submission Text

## One-line pitch

TaaraNight is a daily Reddit constellation ritual: connect tonight's real stars, reveal a bedtime myth, and share a spoiler-safe sky card with the community.

## Inspiration

The TaaraNight logo is a photograph I took of the night sky in Dover, Arkansas, one of the darkest corners of the state. Standing under thousands of stars, I realized I could name almost none of them. Taara means "star" in Telugu, my mother tongue. TaaraNight is my answer: learn the real sky, one night at a time, together.

## What it does

Every night at dusk, one shared puzzle opens on the subreddit. Everyone gets the same sky. You connect real stars, using actual catalog positions and IAU-verified names, to reveal one of the 88 constellations. Finish the figure and it breathes: its name arrives, and a short original bedtime story wakes for you to read.

Difficulty follows the calendar: Monday is gentle, Sunday is a monster. There is one leaderboard per night, fastest solve first, with quiet honesty marks showing who used Whispers or touched Glitches. A clean run shows only the time.

Every constellation you solve takes its true celestial position in My Sky, a pannable north-up star chart. Solve all 88 and you have collected the entire sky. Jwala streaks keep the nightly ritual alive; spoiler-safe share cards let players post results without revealing the constellation.

## How I built it

TaaraNight is a Reddit Devvit web app built with Phaser 4, TypeScript, Hono routes, and Devvit Redis, with no external backend. Every star is data-real: positions come from the HYG database, names are validated against the official IAU Catalog of Star Names, and figures are projected gnomonically so each shape matches the real sky.

The nightly puzzle is deterministic from the night number, so everyone shares the same sky and archive posts keep their original puzzle forever. Art comes from credited sky-atlas sources or original work, all 88 stories are original writing, and ambience is synthesized in the browser with Web Audio.

## Challenges

Getting 88 constellations right was the hardest part: full-fidelity reference figures, tap-safe star spacing on a phone, and a projection that keeps Orion looking like Orion. The second hardest part was restraint. The game went through several redesigns before becoming one button, one sky, one leaderboard.

## Accomplishments

TaaraNight became a daily ritual that teaches real astronomy without feeling like homework: a complete original dataset of 88 figures and 88 stories, wrapped in a quiet bedtime UI built for Reddit.

## What's next

Community milestones, streak flair, an AR companion that finds solved constellations in the actual sky above you, and a long-term path through Reddit Developer Funds.

## Built with

Devvit, Phaser 4, TypeScript, Hono, Redis, Web Audio, HYG Database, IAU-CSN.

## Submission links to add

- App listing: `https://developers.reddit.com/apps/taara-connect`
- Public community: `https://www.reddit.com/r/TaaraNight/`
- Demo/play post: add the final `r/TaaraNight` post URL after publishing
- Source repository: `https://github.com/jayasrisng/taara-night`
