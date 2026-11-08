#!/usr/bin/env python3
"""Stabilize native-frame cutouts and contact points without omitting video frames.

The original video is read locally for motion/colour consistency. Existing
opaque body pixels are retained; only mutually supported missing foreground is
restored. No model or network service is used.
"""

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FRAME_WIDTH, FRAME_HEIGHT, FRAMES = 256, 352, 300
PADDING = 32
PLAYBACK = {
    "frames": FRAMES, "fps": 30, "duration": 10, "loop": True,
    "mode": "scroll-scrub", "scrollCycles": 2, "loopBlendFrames": 12, "renderPadding": PADDING,
}


def stabilize(source, assets, output, review, confidence_path):
    cv2.setNumThreads(4)
    metadata = json.loads((assets / "climber.json").read_text())
    if metadata.get("sourceFrameIndices") != list(range(FRAMES)):
        raise ValueError("The complete original frame sequence is required")
    if metadata.get("stabilization") == "temporal-flow-v1":
        raise ValueError("These frames are already stabilized; start from a fresh full-video export")
    if hashlib.sha256(source.read_bytes()).hexdigest() != metadata["sourceVideoSha256"]:
        raise ValueError("The video does not match the original frame source")
    with np.load(confidence_path, allow_pickle=False) as data:
        confidence = data["confidence"]
        if str(data["sourceSha256"]) != metadata["sourceVideoSha256"] or confidence.shape != (FRAMES, FRAME_HEIGHT, FRAME_WIDTH):
            raise ValueError("The person-confidence masks do not match the original video")
    old_frames = []
    for filename in metadata["pages"]:
        with Image.open(assets / filename) as atlas:
            for cell in range(100):
                old_frames.append(np.asarray(atlas.crop((
                    cell % 10 * FRAME_WIDTH, cell // 10 * FRAME_HEIGHT,
                    (cell % 10 + 1) * FRAME_WIDTH, (cell // 10 + 1) * FRAME_HEIGHT
                )).convert("RGBA")))
    capture = cv2.VideoCapture(str(source))
    originals = []
    for index in range(FRAMES):
        ok, bgr = capture.read()
        if not ok:
            raise RuntimeError(f"Original video ended at frame {index}")
        frame = np.zeros((FRAME_HEIGHT, FRAME_WIDTH, 3), np.uint8)
        frame[20:332, 12:244] = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), (232, 312), interpolation=cv2.INTER_AREA)
        originals.append(frame)
    if capture.read()[0]:
        raise RuntimeError("The original video has unexpected extra frames")
    capture.release()
    grays = [cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY) for frame in originals]
    masks = [(frame[:, :, 3] >= 128).astype(np.float32) for frame in old_frames]
    yy, xx = np.mgrid[:FRAME_HEIGHT, :FRAME_WIDTH].astype(np.float32)
    flow_model = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    refined, changes = [], []
    for index in range(FRAMES):
        votes = np.zeros((FRAME_HEIGHT, FRAME_WIDTH), np.uint8)
        for offset in range(-15, 16):
            if offset == 0:
                continue
            other = index + offset
            if not 0 <= other < FRAMES:
                continue
            flow = flow_model.calc(grays[index], grays[other], None)
            reverse = flow_model.calc(grays[other], grays[index], None)
            mx, my = xx + flow[:, :, 0], yy + flow[:, :, 1]
            backward = cv2.remap(reverse, mx, my, cv2.INTER_LINEAR)
            consistent = np.linalg.norm(flow + backward, axis=2) < 1.5
            warped = cv2.remap(masks[other], mx, my, cv2.INTER_LINEAR) > 0.65
            color = cv2.remap(originals[other], mx, my, cv2.INTER_LINEAR)
            agrees = np.abs(color.astype(np.int16) - originals[index].astype(np.int16)).mean(axis=2) < 18
            votes += (warped & consistent & agrees).astype(np.uint8)
        original = masks[index] > 0
        combined = (original | ((votes >= 2) & (confidence[index] >= 64))).astype(np.uint8)
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        count, labels, _, _ = cv2.connectedComponentsWithStats(combined, connectivity=8)
        overlap = [int(((labels == label) & original).sum()) for label in range(1, count)]
        if not overlap:
            raise RuntimeError(f"Empty stabilized frame {index}")
        combined = labels == (1 + int(np.argmax(overlap)))
        if np.any(original & ~combined):
            raise RuntimeError(f"Stabilization would remove original body pixels in frame {index}")
        added = combined & ~original
        ratio = added.sum() / original.sum()
        if ratio > 0.25:
            raise RuntimeError(f"Excess foreground growth in frame {index}: {ratio:.1%}")
        result = old_frames[index].copy()
        result[added, :3] = originals[index][added]
        result[added, 3] = 255
        result[~combined] = 0
        refined.append(result)
        changes.append(int(added.sum()))
        if (index + 1) % 30 == 0:
            print(f"Stabilized {index + 1}/{FRAMES} original frames", flush=True)

    geometry = metadata["geometry"]
    old_anchors = geometry["anchors"]
    contacts = []
    recoveries = []
    previous = np.float32([108, 76])
    for index, rgba in enumerate(refined):
        predicted = previous
        if index:
            moved, status, _ = cv2.calcOpticalFlowPyrLK(
                grays[index - 1], grays[index], previous[None, None], None,
                winSize=(21, 21), maxLevel=3,
            )
            if moved is not None and status[0, 0] and np.linalg.norm(moved[0, 0] - previous) < 24:
                predicted = moved[0, 0]
        rgb = rgba[:, :, :3].astype(np.int16)
        skin = (rgba[:, :, 3] >= 240) & (rgb[:, :, 0] - rgb[:, :, 1] > 15) & (rgb[:, :, 0] - rgb[:, :, 2] > 20)
        skin &= (xx < old_anchors[index]["x"] + 24) & (yy < geometry["headY"][index] + 90)
        helmet = (rgba[:, :, 3] >= 240) & (np.abs(yy - geometry["headY"][index]) < 25)
        helmet &= (rgb[:, :, 0] > 105) & (rgb.max(axis=2) - rgb.min(axis=2) < 60) & (xx > 110)
        if not helmet.any():
            raise RuntimeError(f"No visible helmet region found while stabilizing frame {index}")
        helmet_x = float(np.median(np.nonzero(helmet)[1]))
        skin &= (xx - helmet_x) ** 2 / 18 ** 2 + (yy - geometry["headY"][index]) ** 2 / 23 ** 2 > 1
        distance = (xx - predicted[0]) ** 2 + (yy - predicted[1]) ** 2
        candidates = skin & (distance < 24 ** 2)
        if not candidates.any():
            anchor = old_anchors[index]
            if rgba[anchor["y"], anchor["x"], 3] < 240:
                raise RuntimeError(f"No valid contact point in frame {index}")
            print(f"Frame {index}: retaining its verified source hand contact", flush=True)
            recoveries.append(index)
        else:
            y, x = np.unravel_index(np.argmin(np.where(candidates, distance, np.inf)), distance.shape)
            anchor = {"x": int(x), "y": int(y)}
        contacts.append(anchor)
        previous = np.float32([anchor["x"], anchor["y"]])

    output.mkdir(parents=True, exist_ok=True)
    review.mkdir(parents=True, exist_ok=True)
    bounds = []
    for page, filename in enumerate(metadata["pages"]):
        atlas = Image.new("RGBA", (2560, 3520))
        for cell in range(100):
            index = page * 100 + cell
            rgba = refined[index]
            solid = rgba[:, :, 3] >= 128
            sy, sx = np.nonzero(solid)
            if min(sx) < 8 or max(sx) >= 248 or min(sy) < 8 or max(sy) >= 344:
                raise RuntimeError(f"Stabilized frame {index} would clip the figure")
            bounds.append([int(sx.min()), int(sy.min()), int(sx.max()) + 1, int(sy.max()) + 1])
            atlas.paste(Image.fromarray(rgba), (cell % 10 * FRAME_WIDTH, cell // 10 * FRAME_HEIGHT))
        atlas.save(output / filename, "WEBP", quality=94, method=6, alpha_quality=100, exact=True)
    geometry["anchors"] = contacts
    geometry["anchorX"], geometry["anchorY"] = contacts[0]["x"], contacts[0]["y"]
    geometry["poseBounds"] = bounds
    geometry["clearance"] = {
        "above": max(head - box[1] for head, box in zip(geometry["headY"], bounds)),
        "below": max(box[3] - head for head, box in zip(geometry["headY"], bounds)),
    }
    geometry["playback"] = dict(PLAYBACK)
    metadata["sourceAnchors"] = old_anchors
    metadata["geometry"] = geometry
    metadata["stabilization"] = "temporal-flow-v1"
    with Image.open(output / metadata["pages"][0]) as atlas:
        poster = Image.new("RGBA", (FRAME_WIDTH + PADDING * 2, FRAME_HEIGHT + PADDING * 2))
        poster.paste(atlas.crop((0, 0, FRAME_WIDTH, FRAME_HEIGHT)), (PADDING, PADDING))
        poster.save(output / "climber-poster.webp", "WEBP", lossless=True, exact=True)
    (output / "climber.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (output / "cliff-geometry.js").write_text("window.ayaClimbGeometry = Object.freeze(" + json.dumps(geometry, separators=(",", ":")) + ");\n")
    sheet = Image.new("RGB", (6 * 256, 5 * 376), "#f7f4ef")
    draw = ImageDraw.Draw(sheet)
    for item, index in enumerate(range(0, 300, 10)):
        x, y = item % 6 * 256, item // 6 * 376
        image = Image.fromarray(refined[index])
        sheet.paste(image, (x, y + 24), image)
        draw.text((x + 8, y + 5), f"Original frame {index}", fill="#242424")
    sheet.save(review / "stabilized-contact-sheet.png")
    (review / "stabilization.json").write_text(json.dumps({"addedPixels": changes, "contactRecoveries": recoveries}, indent=2))
    print("All 300 frames retained, missing foreground restored, and contact tracking stabilized.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--assets", type=Path, default=ROOT / "assets")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--confidence", type=Path, required=True)
    args = parser.parse_args()
    stabilize(args.input.resolve(), args.assets.resolve(), args.output.resolve(), args.review.resolve(), args.confidence.resolve())
