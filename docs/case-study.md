# TaaraNight Case Study

## Summary

TaaraNight is a daily constellation game for Reddit. Every evening, players connect real stars, reveal one of the 88 IAU constellations, unlock an original bedtime story, and share spoiler-safe results with the community.

The project combines astronomy data, cozy ritual design, deterministic puzzle generation, procedural art/audio, and Reddit-native community loops.

## Problem

Most people live under the night sky without knowing how to read it. Constellation learning is often presented as reference material instead of a habit or ritual.

TaaraNight explores a different question:

> Can a daily game help people slowly learn the sky through play, story, and community?

## Approach

The game uses a shared-night structure:

1. A new puzzle opens at dusk.
2. Everyone receives the same deterministic sky.
3. Players connect real stars to reveal a constellation.
4. The reveal unlocks a short original myth.
5. Players can share spoiler-safe results without revealing the answer.
6. Long-term progress fills a personal sky chart.

## Technical stack

- Reddit Devvit web app
- Phaser 4
- TypeScript
- Hono routes
- Devvit Redis
- Vite build pipeline
- Real star positions and IAU/HYG source data
- Procedural UI art, icons, reveal effects, and synthesized audio

## Design decisions

### Make learning a nightly ritual

The game is intentionally paced around one shared sky per night. It is closer to Wordle as a ritual than a grind-heavy progression system.

### Protect the reveal

Spoiler-safe sharing lets the community compare effort and streaks without ruining the constellation for others.

### Use real star data

The constellation traces are based on real star positions, so the game slowly builds real sky literacy rather than using arbitrary puzzle shapes.

### Keep the mood quiet

The experience is designed as a bedtime ritual: calm audio, original myths, soft challenge, and optional read-aloud support.

## Challenges

### Mapping real astronomy to play

Real constellations vary in density, shape, and recognizability. The game has to turn accurate star data into fair nightly puzzles.

### Community design without spoilers

A Reddit-native game needs sharing, comments, and leaderboards, but the reveal must remain protected for players who have not finished.

### Rendering and interaction polish

The game needs to feel responsive on mobile while drawing starfields, gestures, overlays, and high-DPI UI.

## What this demonstrates

- Community-native game design.
- Procedural and data-driven visual systems.
- TypeScript + Phaser implementation.
- Careful product decisions around ritual, spoilers, pacing, and replay.
- Combining cultural language, astronomy, and original storytelling into a coherent interaction.

## Future work

- Add more accessibility testing for read-aloud and reduced-motion modes.
- Expand archive browsing and My Sky progression.
- Add more visual explanations of star data and projection choices.
- Add short README GIFs for solve, reveal, and share-card flows.
