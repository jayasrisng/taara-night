#!/usr/bin/env python3
"""Generate the shipped story narrations: public/narration/{id}.mp3 for all 88.

One-time setup (macOS):
    pip3 install piper-tts
    brew install ffmpeg          # if not already installed

Run from taara-connect/:
    python3 tools/generate-narration.py

Voice: Piper `en_US-lessac-medium` (MIT licence; downloaded on first run).
Output: mono MP3 at 48 kbps — ~250 KB per story, ~22 MB total, well under
Devvit's 100 MB upload limit. The client falls back to the browser's own
speechSynthesis wherever a file is missing, so partial runs are safe.
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "shared" / "constellationData.ts"
OUT = ROOT / "public" / "narration"
VOICE = "en_US-lessac-medium"

# Piper reads a touch fast for a bedtime story; stretch it gently.
LENGTH_SCALE = "1.15"


def stories() -> list[tuple[str, str]]:
    src = DATA.read_text()
    found = []
    for block in src.split("\n  {\n"):
        mid = re.search(r"id: '([a-z-]+)'", block)
        if not mid:
            continue
        mstory = re.search(r"story:\s*\n?\s*'((?:[^'\\]|\\.)*)'", block, re.S)
        if not mstory:
            mstory = re.search(r'story:\s*\n?\s*"((?:[^"\\]|\\.)*)"', block, re.S)
        if not mstory:
            continue
        text = mstory.group(1).replace("\\'", "'").replace('\\"', '"')
        found.append((mid.group(1), text))
    return found


def main() -> None:
    entries = stories()
    if len(entries) < 80:
        sys.exit(f"only found {len(entries)} stories in {DATA} — aborting")
    OUT.mkdir(parents=True, exist_ok=True)

    done = 0
    for slug, text in entries:
        mp3 = OUT / f"{slug}.mp3"
        if mp3.exists():
            done += 1
            continue
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav = Path(tmp.name)
        subprocess.run(
            ["piper", "-m", VOICE, "--length-scale", LENGTH_SCALE, "-f", str(wav)],
            input=text.encode(),
            check=True,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
             "-ac", "1", "-b:a", "48k", str(mp3)],
            check=True,
        )
        wav.unlink()
        done += 1
        print(f"[{done}/{len(entries)}] {slug} ({mp3.stat().st_size // 1024} KB)")

    total = sum(f.stat().st_size for f in OUT.glob("*.mp3"))
    print(f"\n{done} narrations, {total / 1e6:.1f} MB total in {OUT}")
    print(json.dumps({"voice": VOICE, "licence": "MIT (Piper / rhasspy)"}))


if __name__ == "__main__":
    main()
