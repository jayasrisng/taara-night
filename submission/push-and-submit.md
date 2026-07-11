# Push And Submit Instructions

## 1. Review local changes

From the repository root:

```bash
cd /Users/jayasrisainikithaguthula/Documents/GitHub/taara-reddit/taara-connect
git status --short
```

Expected: only intentional app changes, public fonts/narration assets, and deleted `src/client/scenes/MainMenu.ts`.

## 2. Run gates

This project requires Node 22+. If `node -v` prints Node 20, use a Node 22 install before running the gates.

```bash
node -v
npm run type-check
npm run lint
npm run test
npm run build
```

Do not push if any command fails.

## 3. Commit

```bash
git add .
git commit -m "Prepare TaaraNight submission build"
```

## 4. Push

Check the current branch:

```bash
git branch --show-current
```

Push it:

```bash
git push origin HEAD
```

## 5. Upload or publish the Devvit app

For upload only:

```bash
npm run deploy
```

For final publish, only after the playtest is clean:

```bash
npm run launch
```

## 6. Create the public Reddit demo post

Use `r/TaaraNight`, not `r/taara_connect_dev`.

Suggested post title:

```text
TaaraNight: One night. One constellation. One story.
```

After the post is live, open it as a normal Reddit user and run the public subreddit check in `submission/test-plan.md`.

## 7. Submit on Devpost

Paste from `submission/devpost-submission.md`.

Attach:

- App link: `https://developers.reddit.com/apps/taara-connect`
- Public community/play post: the final `r/TaaraNight` post URL
- Source code: the pushed GitHub repository URL
- Demo video if the form asks for it: `submission/taaranight-demo.mp4`

Before clicking Submit, confirm the demo link is a public post in `r/TaaraNight` running the game. Devpost says judges primarily evaluate community play from that demo link.
