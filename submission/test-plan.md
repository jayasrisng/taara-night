# TaaraNight Final Test Plan

Run these from `taara-connect/`.

## Local gates

```bash
node -v  # must be 22+
npm run type-check
npm run lint
npm run test
npm run build
```

Expected result: all commands exit successfully. The current automated suite should report 301 passing tests. Node 20 fails before Vitest starts because the test runner expects newer `node:util` exports.

## Dev Reddit playtest

```bash
npm run login
npm run dev
```

Use `r/taara_connect_dev` for this pass.

Verify:

- Open the playtest post and tap Play.
- First-time flow shows the short how-to and ghost trace.
- The game opens directly into tonight's sky, not a difficulty picker.
- Timer is visible.
- Tap/drag real star connections; wrong pairs shake.
- Whispers are unlimited but show a 20-second cooldown.
- Finish the puzzle and confirm the constellation reveal appears before the story.
- Open/read the story and test read-aloud.
- Results show time, Jwala, next-sky countdown, and Stargazers.
- Comment share posts a spoiler-safe comment.
- Copy share puts the spoiler-safe card plus post URL on the clipboard.
- My Sky opens, pans/zooms, and the solved constellation is visible.

## Public subreddit check

Use `r/TaaraNight` for the final public/demo post after the dev pass is clean.

Verify the public post URL is the one you paste into Devpost. Do not submit the auto-generated `r/taara_connect_dev` URL as the public play link unless the official rules explicitly ask for a dev/test subreddit.
