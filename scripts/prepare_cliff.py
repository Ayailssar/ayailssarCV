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
    if metadata.get("sourceFrameIndices") != list(range(300)) or metadata.get("fps") != 30:
        raise ValueError("Build the complete original video with prepare_full_climber.py first")
    geometry = dict(metadata["geometry"])
    geometry.update({"rightEdge": right, "leftEdge": left})
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
    (ASSETS / "climber.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (ASSETS / "cliff-geometry.js").write_text(
        "window.ayaClimbGeometry = Object.freeze(" +
        json.dumps(geometry, separators=(",", ":")) + ");\n", encoding="utf-8"
    )
    with Image.open(ASSETS / "cliff-wall.webp") as encoded:
        if not np.array_equal(np.asarray(encoded.convert("RGBA")), np.asarray(wall)):
            raise RuntimeError("The encoded cliff differs from the supplied image")
    print(f"Imported supplied cliff: {original.width}x{original.height}, empty-margin crop {crop}")
    print(f"Lossless wall: {wall.width}x{wall.height}; complete {metadata['frames']}-frame video retained")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    prepare_cliff(args.input)
