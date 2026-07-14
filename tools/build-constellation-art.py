"""Pack the 88 reveal figures into one mobile-sized Phaser texture atlas."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "constellation-art"
OUT_IMAGE = SOURCE / "constellation-atlas.webp"
OUT_JSON = SOURCE / "constellation-atlas.json"
DATA = ROOT / "src" / "shared" / "constellationData.ts"
ALIGNMENT_TS = ROOT / "src" / "client" / "ui" / "constellationArtData.ts"
STELLARIUM = SOURCE / "stellarium-index.json"
HYG = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/hygdata_v41.csv")

TILE = 192
COLS = 9


def ids() -> list[str]:
    found: list[str] = []
    for line in DATA.read_text().splitlines():
        line = line.strip()
        if line.startswith("id: '"):
            found.append(line.split("'", 2)[1])
    if len(found) != 88:
        raise SystemExit(f"expected 88 constellation ids, found {len(found)}")
    return found


ALIASES = {
        "carina": "argonavis.png",
        "puppis": "argonavis.png",
        "vela": "argonavis.png",
        "horologium": "horlogium.png",
        "serpens": "serpens-generated.png",
        "taurus": "taurus-cinematic-v2.png",
    }


def source_for(cid: str) -> Path:
    return SOURCE / ALIASES.get(cid, f"{cid}.png")


def stellarium_file(cid: str) -> str:
    # Custom Taurus uses the real Taurus sky anchors; the picture positions are
    # replaced below. The three Argo pieces deliberately share its historical art.
    if cid in {"carina", "puppis", "vela"}:
        return "argonavis.png"
    if cid == "horologium":
        return "horlogium.png"
    return f"{cid}.png"


def crop_black(im: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    rgb = im.convert("RGB")
    # Treat nearly black pixels as backdrop when finding the useful subject.
    lifted = rgb.point(lambda v: 0 if v < 7 else v)
    bbox = ImageChops.difference(lifted, Image.new("RGB", lifted.size)).getbbox()
    box = bbox or (0, 0, rgb.width, rgb.height)
    return rgb.crop(box), box


if not HYG.exists():
    raise SystemExit(f"HYG catalogue not found: {HYG} (pass hygdata_v41.csv as the first argument)")

hip: dict[int, dict[str, float]] = {}
with HYG.open() as handle:
    for row in csv.DictReader(handle):
        if not row.get("hip"):
            continue
        hip[int(row["hip"])] = {"ra": float(row["ra"]), "dec": float(row["dec"])}

records = {
    Path(item["image"]["file"]).name: item["image"]
    for item in json.loads(STELLARIUM.read_text())["constellations"]
    if item.get("image")
}


def full_anchors(cid: str, width: int, height: int) -> list[dict[str, float]]:
    if cid == "serpens":
        return [
            {"x": 160, "y": 175, "ra": 15.8123, "dec": 18.1416},
            {"x": 585, "y": 610, "ra": 16.2391, "dec": -3.6943},
            {"x": 1350, "y": 850, "ra": 18.937, "dec": 4.2036},
        ]

    image = records.get(stellarium_file(cid))
    if not image:
        raise SystemExit(f"no Stellarium alignment record for {cid}")
    anchors = image["anchors"]
    if cid == "taurus":
        # The cinematic bull is a new composition. These three anatomical
        # points correspond to the same catalogue stars as Stellarium's anchors:
        # Tianguan at the horn, ο Tau at the body, and HIP 17999 at the other horn.
        # V2 deliberately preserves Stellarium Taurus' exact composition at a
        # higher resolution, so the licensed plate's anchors scale directly.
        custom = [
            (13 / 512 * width, 92 / 512 * height),
            (399 / 512 * width, 438 / 512 * height),
            (382 / 512 * width, 192 / 512 * height),
        ]
        anchors = [{**anchor, "pos": list(custom[i])} for i, anchor in enumerate(anchors)]

    out: list[dict[str, float]] = []
    for anchor in anchors:
        star = hip.get(int(anchor["hip"]))
        if not star:
            raise SystemExit(f"HIP {anchor['hip']} for {cid} is missing from HYG")
        out.append({"x": anchor["pos"][0], "y": anchor["pos"][1], **star})
    return out


constellations = ids()
rows = (len(constellations) + COLS - 1) // COLS
atlas = Image.new("RGB", (COLS * TILE, rows * TILE), "black")
frames: dict[str, object] = {}
alignment: dict[str, object] = {}

for index, cid in enumerate(constellations):
    path = source_for(cid)
    if not path.exists():
        raise SystemExit(f"missing artwork for {cid}: {path}")
    original = Image.open(path)
    full_width, full_height = original.size
    anchors = full_anchors(cid, full_width, full_height)
    art, crop = crop_black(original)
    crop_width, crop_height = art.size
    art.thumbnail((TILE - 14, TILE - 14), Image.Resampling.LANCZOS)
    x = (index % COLS) * TILE
    y = (index // COLS) * TILE
    px = x + (TILE - art.width) // 2
    py = y + (TILE - art.height) // 2
    atlas.paste(art, (px, py))
    sx = art.width / crop_width
    sy = art.height / crop_height
    atlas_anchors = [
        {
            **anchor,
            "x": (px - x) + (anchor["x"] - crop[0]) * sx,
            "y": (py - y) + (anchor["y"] - crop[1]) * sy,
        }
        for anchor in anchors
    ]
    alignment[cid] = {
        "full": {"width": full_width, "height": full_height, "anchors": anchors},
        "atlas": {"width": TILE, "height": TILE, "anchors": atlas_anchors},
    }
    frames[cid] = {
        "frame": {"x": x, "y": y, "w": TILE, "h": TILE},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": TILE, "h": TILE},
        "sourceSize": {"w": TILE, "h": TILE},
    }

atlas.save(OUT_IMAGE, "WEBP", quality=88, method=6)
OUT_JSON.write_text(
    json.dumps(
        {
            "frames": frames,
            "meta": {
                "app": "taara constellation atlas builder",
                "version": "1.0",
                "image": OUT_IMAGE.name,
                "format": "RGB888",
                "size": {"w": atlas.width, "h": atlas.height},
                "scale": "1",
            },
        },
        separators=(",", ":"),
    )
)
ALIGNMENT_TS.write_text(
    "/** Generated by tools/build-constellation-art.py. Do not hand-edit. */\n"
    "export interface ConstellationArtAnchor { x: number; y: number; ra: number; dec: number }\n"
    "export interface ConstellationArtFrame { width: number; height: number; anchors: ConstellationArtAnchor[] }\n"
    "export interface ConstellationArtAlignment { full: ConstellationArtFrame; atlas: ConstellationArtFrame }\n"
    "export const CONSTELLATION_ART_ALIGNMENT: Record<string, ConstellationArtAlignment> = "
    + json.dumps(alignment, separators=(",", ":"))
    + ";\n"
)
print(f"packed {len(frames)} figures into {OUT_IMAGE} ({atlas.width}x{atlas.height})")
