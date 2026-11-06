#!/usr/bin/env python3
"""Rebuild the scroll-seekable climber sprites from the original local footage.

Requires Python 3, Pillow with WebP support, and ffmpeg/ffprobe on PATH.
Usage: python3 scripts/prepare-climber.py "/path/to/original-video.mp4"
The source video is never copied into the website.
"""

import argparse
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, features


FRAME_WIDTH = 232
FRAME_HEIGHT = 312
COLUMNS = 12
ROWS = 10
FRAMES = 120
FPS = 12
DURATION = 10
BLACK_THRESHOLD = 12
MIN_OUTSIDE_FRACTION = 0.005
SOURCE_SIZE = (464, 624)
ASSETS = Path(__file__).resolve().parents[1] / "assets"


def remove_outside_black(image):
    """Key only four-connected exterior black; enclosed shadows stay opaque."""
    red, green, blue = image.split()
    brightness = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    dark = brightness.point(lambda value: 255 if value <= BLACK_THRESHOLD else 0)
    outside = Image.new("L", image.size)
    border = (
        [(x, y) for y in (0, image.height - 1) for x in range(image.width)]
        + [(x, y) for x in (0, image.width - 1) for y in range(1, image.height - 1)]
    )
    for seed in border:
        if dark.getpixel(seed) != 255:
            continue
        ImageDraw.floodfill(dark, seed, 128)
        # A tiny disconnected dark crack touching the frame edge is rock shadow,
        # not outside backdrop. Never merge border components through padding.
        if dark.histogram()[128] >= image.width * image.height * MIN_OUTSIDE_FRACTION:
            component = dark.point(lambda value: 255 if value == 128 else 0)
            outside = ImageChops.lighter(outside, component)
        dark = dark.point(lambda value: 0 if value == 128 else value)
    alpha = ImageChops.invert(outside)

    # Undo the source's black antialiasing only at the exterior boundary.
    # Interior dark clothing, hair, and rock shadows are never color-keyed.
    boundary = ImageChops.subtract(alpha, alpha.filter(ImageFilter.MinFilter(3)))
    local_brightness = brightness.filter(ImageFilter.MaxFilter(5)).tobytes()
    edge = boundary.tobytes()
    opacity = bytearray(alpha.tobytes())
    pixels = bytearray(image.convert("RGBA").tobytes())
    for index, value in enumerate(opacity):
        offset = index * 4
        if not value:
            pixels[offset:offset + 4] = b"\0\0\0\0"
        elif edge[index]:
            level = max(pixels[offset:offset + 3])
            value = max(1, min(255, round(255 * level / max(1, local_brightness[index]))))
            for channel in range(3):
                pixels[offset + channel] = min(
                    255, round(pixels[offset + channel] * 255 / value)
                )
            pixels[offset + 3] = value
    keyed = Image.frombytes("RGBA", image.size, bytes(pixels))
    # Pillow resizes RGBA in premultiplied-alpha space, avoiding black fringes.
    return keyed.resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)


def validate_source(source):
    for executable in ("ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            raise RuntimeError(f"{executable} is required and must be on PATH")
    if not features.check("webp"):
        raise RuntimeError("Pillow must include WebP support")
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration",
            "-of", "json", str(source),
        ],
        check=True, capture_output=True, text=True,
    )
    info = json.loads(result.stdout)
    if not info.get("streams"):
        raise ValueError("The input contains no video stream")
    stream = info["streams"][0]
    if (stream["width"], stream["height"]) != SOURCE_SIZE:
        raise ValueError("Use the original 464 × 624 footage; framing must not change")
    if float(info["format"]["duration"]) < DURATION:
        raise ValueError("The source must contain at least 10 seconds")


def build(source):
    validate_source(source)
    atlas = Image.new("RGBA", (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * ROWS))
    frame_bytes = SOURCE_SIZE[0] * SOURCE_SIZE[1] * 3
    decoder = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-i", str(source), "-map", "0:v:0",
            "-vf", f"fps={FPS}:start_time=0:round=up", "-frames:v", str(FRAMES),
            "-an", "-sn", "-pix_fmt", "rgb24", "-threads", "1",
            "-f", "rawvideo", "pipe:1",
        ],
        stdout=subprocess.PIPE,
    )
    transparencies = []
    try:
        for index in range(FRAMES):
            raw = decoder.stdout.read(frame_bytes)
            if len(raw) != frame_bytes:
                raise RuntimeError(f"Decoder ended at frame {index}; expected {FRAMES}")
            frame = remove_outside_black(Image.frombytes("RGB", SOURCE_SIZE, raw))
            histogram = frame.getchannel("A").histogram()
            if not sum(histogram[1:]) or not histogram[0]:
                raise RuntimeError(f"Frame {index} must have visible content and transparency")
            transparencies.append(histogram[0] / (FRAME_WIDTH * FRAME_HEIGHT))
            atlas.paste(frame, ((index % COLUMNS) * FRAME_WIDTH, (index // COLUMNS) * FRAME_HEIGHT))
        if decoder.wait():
            raise RuntimeError("ffmpeg failed")
    finally:
        decoder.stdout.close()
        if decoder.poll() is None:
            decoder.terminate()
            decoder.wait()

    ASSETS.mkdir(parents=True, exist_ok=True)
    atlas_path = ASSETS / "climber-atlas.webp"
    poster_path = ASSETS / "climber-poster.webp"
    metadata_path = ASSETS / "climber.json"
    atlas.save(atlas_path, "WEBP", quality=88, method=6, alpha_quality=100, exact=True)
    # Derive the poster from the encoded atlas, so switching to frame zero is exact.
    with Image.open(atlas_path) as encoded:
        if encoded.size != atlas.size or encoded.mode != "RGBA" or getattr(encoded, "n_frames", 1) != 1:
            raise RuntimeError("The atlas must be a static RGBA WebP of the expected size")
        encoded.load()
        poster = encoded.crop((0, 0, FRAME_WIDTH, FRAME_HEIGHT))
    poster.save(poster_path, "WEBP", lossless=True, method=6, exact=True)
    metadata_path.write_text(
        json.dumps(
            {
                "frameWidth": FRAME_WIDTH,
                "frameHeight": FRAME_HEIGHT,
                "columns": COLUMNS,
                "rows": ROWS,
                "frames": FRAMES,
                "fps": FPS,
                "duration": DURATION,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Built {FRAMES} row-major frames at {FPS} fps; duration {DURATION}s.")
    print(f"Fully transparent area per frame: {min(transparencies):.2%}–{max(transparencies):.2%}")
    for path in (atlas_path, poster_path, metadata_path):
        print(f"{path.relative_to(ASSETS.parent)}: {path.stat().st_size:,} bytes")
    if atlas_path.stat().st_size > 6 * 1024 * 1024:
        print("Warning: atlas exceeds the preferred 6 MiB budget.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Path to the original local 10-second MP4")
    args = parser.parse_args()
    source = args.input.expanduser().resolve()
    if not source.is_file():
        parser.error(f"Input video does not exist: {source}")
    build(source)


if __name__ == "__main__":
    main()
