#!/usr/bin/env python3
"""Import the supplied cliff without stretching or repainting its visible pixels.

Requires Pillow and numpy. Reuses the existing human-only atlas.
Usage: python3 scripts/prepare_cliff.py /path/to/cliff.png
"""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "assets"
LOOP = {"start": 54, "end": 65, "pixelsPerCycle": 220}


def prepare_cliff(source):
    source = Path(source).expanduser().resolve()
    with Image.open(source) as image:
        original = image.convert("RGBA")
    crop = original.getbbox()
    if crop is None:
        raise ValueError("The supplied cliff is fully transparent")
    wall = original.crop(crop)
    opacity = np.asarray(wall.getchannel("A"))
    left, right = [], []
    for y, row in enumerate(opacity):
        opaque = np.flatnonzero(row > 200)
        if not len(opaque):
            raise ValueError(f"The supplied cliff has no solid rock at row {y}")
        left.append(round(int(opaque[0]) / wall.width, 8))
        right.append(round(int(opaque[-1]) / wall.width, 8))

    metadata = json.loads((ASSETS / "climber.json").read_text(encoding="utf-8"))
    width, height = metadata["frameWidth"], metadata["frameHeight"]
    anchors = []
    with Image.open(ASSETS / "climber-atlas.webp") as image:
        atlas = image.convert("RGBA")
        if atlas.size != (width * metadata["columns"], height * metadata["rows"]):
            raise ValueError("Climbing atlas dimensions do not match its metadata")
        for index in range(metadata["frames"]):
            x, y = index % metadata["columns"] * width, index // metadata["columns"] * height
            pose = np.asarray(atlas.crop((x, y, x + width, y + height)))
            if LOOP["start"] <= index < LOOP["end"]:
                solid = pose[:, :, 3] >= 128
                ys, xs = np.nonzero(solid)
                if not len(xs) or min(xs) < 4 or max(xs) >= width - 4 or min(ys) < 4 or max(ys) >= height - 4:
                    raise ValueError(f"Climbing pose {index} touches a frame boundary")
                connected = np.zeros_like(solid)
                pending = [(int(ys[0]), int(xs[0]))]
                connected[pending[0]] = True
                while pending:
                    py, px = pending.pop()
                    for ny in range(max(0, py - 1), min(height, py + 2)):
                        for nx in range(max(0, px - 1), min(width, px + 2)):
                            if solid[ny, nx] and not connected[ny, nx]:
                                connected[ny, nx] = True
                                pending.append((ny, nx))
                if connected.sum() / solid.sum() < 0.995:
                    raise ValueError(f"Climbing pose {index} has a disconnected body part")
            yy, xx = np.mgrid[:height, :width]
            red, green, blue = pose[:, :, :3].astype(np.int16).transpose(2, 0, 1)
            distance = (xx - metadata["anchorX"]) ** 2 + (yy - metadata["anchorY"]) ** 2
            hand = (pose[:, :, 3] >= 240) & (distance <= 24 ** 2) & (red - green > 15) & (red - blue > 20)
            candidates = np.argwhere(hand)
            if not len(candidates):
                raise ValueError(f"No opaque hand contact found in pose {index}")
            chosen = candidates[np.argmin(distance[hand])]
            anchors.append({"x": int(chosen[1]), "y": int(chosen[0])})
        first = LOOP["start"]
        x, y = first % metadata["columns"] * width, first // metadata["columns"] * height
        poster = atlas.crop((x, y, x + width, y + height))

    geometry = {
        "rightEdge": right,
        "leftEdge": left,
        "anchorX": metadata["anchorX"],
        "anchorY": metadata["anchorY"],
        "anchors": anchors,
        "contactInset": 18,
        "loop": LOOP,
    }
    metadata.update({
        "wallWidth": wall.width,
        "wallHeight": wall.height,
        "wallSource": {
            "file": "cliff-source.png",
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "crop": list(crop),
            "originalWidth": original.width,
            "originalHeight": original.height,
        },
        "geometry": geometry,
    })
    destination = ASSETS / "cliff-source.png"
    if source != destination.resolve():
        shutil.copyfile(source, destination)
    wall.save(ASSETS / "cliff-wall.webp", "WEBP", lossless=True, method=6, exact=True)
    poster.save(ASSETS / "climber-poster.webp", "WEBP", lossless=True, method=6, exact=True)
    (ASSETS / "climber.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (ASSETS / "cliff-geometry.js").write_text(
        "window.ayaClimbGeometry = Object.freeze(" +
        json.dumps(geometry, separators=(",", ":")) + ");\n", encoding="utf-8"
    )
    with Image.open(ASSETS / "cliff-wall.webp") as encoded:
        if not np.array_equal(np.asarray(encoded.convert("RGBA")), np.asarray(wall)):
            raise RuntimeError("The encoded cliff differs from the supplied image")
    print(f"Imported supplied cliff: {original.width}x{original.height}, empty-margin crop {crop}")
    print(f"Lossless wall: {wall.width}x{wall.height}; {len(right)} contour rows; {len(anchors)} opaque hand contacts")
    print(f"Loop poses {LOOP['start']}..{LOOP['end'] - 1}, repeated every {LOOP['pixelsPerCycle']} scroll pixels")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    prepare_cliff(args.input)
