#!/usr/bin/env python3
"""Extract every native frame of the supplied climbing video, locally.

Requires mediapipe==0.10.35, Pillow, numpy, opencv-python, and onnxruntime.
The existing SAM support module supplies pinned model weights and authored
anatomical landmarks. No video or frame is uploaded.
"""

import argparse
from contextlib import ExitStack
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw
from stabilize_climber import PLAYBACK, stabilize


ROOT = Path(__file__).resolve().parents[1]
FRAME_WIDTH, FRAME_HEIGHT = 256, 352
SOURCE_WIDTH, SOURCE_HEIGHT = 464, 624
FPS, FRAME_COUNT, PER_PAGE, COLUMNS = 30, 300, 100, 10
POSE_HASH = "4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad"
POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"

spec = importlib.util.spec_from_file_location("climber_support", ROOT / "scripts/prepare-climber.py")
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def person_mask(rgb, result, index, encoder, decoder):
    coarse = result.segmentation_masks[0].numpy_view().squeeze()
    landmarks = result.pose_landmarks[0]
    h, w = coarse.shape
    points = []
    for joint in [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]:
        point = landmarks[joint]
        x, y = np.clip([point.x * w, point.y * h], [0, 0], [w - 1, h - 1])
        if point.visibility > 0.3 and coarse[round(y), round(x)] > 0.12:
            points.append([x, y])
    yy, xx = np.mgrid[:h, :w]
    hip = np.mean([[landmarks[j].x * w, landmarks[j].y * h] for j in [23, 24]], axis=0)
    colors = rgb.astype(np.int16)
    pink = (colors[:, :, 0] > 130) & (colors[:, :, 0] - colors[:, :, 1] > 40)
    pink &= (colors[:, :, 2] - colors[:, :, 1] > 15) & (np.abs(xx - hip[0]) < 70) & (np.abs(yy - hip[1]) < 65)
    py, px = np.nonzero(pink)
    if len(px) > 30:
        points.append([float(np.median(px)), float(np.median(py))])
    keys = sorted(support.LANDMARKS)
    for joint in range(8):
        points.append([
            float(np.interp(index * 12 / FPS, keys, [support.LANDMARKS[key][joint][axis] for key in keys]))
            for axis in (0, 1)
        ])
    points = np.float32(points)
    by, bx = np.nonzero(coarse > 0.7)
    if not len(bx):
        raise RuntimeError(f"No confident human foreground in source frame {index}")
    low = np.maximum(np.minimum(points.min(axis=0), [bx.min(), by.min()]) - [25, 25], [0, 0])
    high = np.minimum(np.maximum(points.max(axis=0), [bx.max(), by.max()]) + [25, 25], [w - 1, h - 1])
    low[1], high[1] = 0, h - 1
    negatives = np.float32([[65, 75], [65, 300], [65, 550], [110, 150], [110, 380], [110, 570], [400, 100], [400, 350], [400, 570]])
    prompts = np.concatenate((points, negatives, [low, high])).astype(np.float32)
    labels = [1] * len(points) + [0] * len(negatives) + [2, 3]
    embedding = encoder.run(None, {"input_image": cv2.resize(rgb, (761, 1024)).astype(np.float32)})[0]
    masks, _, _ = decoder.run(None, {
        "image_embeddings": embedding,
        "point_coords": (prompts * [761 / w, 1024 / h])[None].astype(np.float32),
        "point_labels": np.float32([labels]),
        "mask_input": np.zeros((1, 1, 256, 256), np.float32),
        "has_mask_input": np.zeros(1, np.float32),
        "orig_im_size": np.float32([h, w]),
    })
    guide = coarse > 0.5
    scores = [float(((mask > 0) & guide).sum() / max(1, ((mask > 0) | guide).sum())) for mask in masks[0]]
    solid = ((masks[0, int(np.argmax(scores))] > 0) | (coarse > 0.92)).astype(np.uint8)
    solid[:, :int(low[0])] = 0
    solid[:, int(high[0]) + 1:] = 0
    solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, components, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    if count < 2:
        raise RuntimeError(f"Empty human mask at frame {index}")
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    solid = (components == largest).astype(np.uint8)
    if not 10000 < int(solid.sum()) < 50000:
        raise RuntimeError(f"Implausible human area at frame {index}: {solid.sum()}")
    missing = []
    for joint in [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]:
        point = landmarks[joint]
        x, y = np.rint(np.clip([point.x * w, point.y * h], [0, 0], [w - 1, h - 1])).astype(int)
        if point.visibility > 0.8 and coarse[y, x] > 0.75:
            if not solid[max(0, y - 6):y + 7, max(0, x - 6):x + 7].any():
                missing.append(joint)
    if missing:
        raise RuntimeError(f"Visible anatomical landmarks missing at frame {index}: {missing}")
    return solid, max(scores)


def make_sprite(rgb, solid):
    coverage = cv2.resize(solid.astype(np.float32), (232, 312), interpolation=cv2.INTER_AREA)
    weighted = cv2.resize(rgb.astype(np.float32) * solid[:, :, None], (232, 312), interpolation=cv2.INTER_AREA)
    colors = np.divide(weighted, coverage[:, :, None], out=np.zeros_like(weighted), where=coverage[:, :, None] > 0)
    # Keep one-pixel source fingers/straps connected after the exact 2:1 reduction.
    alpha = np.sqrt(coverage)
    rgba = Image.fromarray(np.dstack((np.clip(colors, 0, 255), alpha * 255)).round().astype(np.uint8))
    sprite = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT))
    sprite.paste(rgba, (12, 20))
    return sprite


def frame_geometry(sprite, landmarks, index):
    pixels = np.asarray(sprite)
    yy, xx = np.mgrid[:FRAME_HEIGHT, :FRAME_WIDTH]
    solid = pixels[:, :, 3] >= 240
    sy, sx = np.nonzero(pixels[:, :, 3] >= 128)
    if not len(sx) or min(sx) < 8 or max(sx) >= FRAME_WIDTH - 8 or min(sy) < 8 or max(sy) >= FRAME_HEIGHT - 8:
        raise RuntimeError(f"The complete figure does not fit frame {index}")
    rgb = pixels[:, :, :3].astype(np.int16)
    skin = solid & (rgb[:, :, 0] - rgb[:, :, 1] > 15) & (rgb[:, :, 0] - rgb[:, :, 2] > 20)
    candidates = []
    for joint in [15, 16, 19, 20]:
        point = landmarks[joint]
        x, y = point.x * 232 + 12, point.y * 312 + 20
        nearby = skin & ((xx - x) ** 2 + (yy - y) ** 2 < 15 ** 2)
        py, px = np.nonzero(nearby)
        if len(px):
            best = np.argmin((px - x) ** 2 + (py - y) ** 2)
            candidates.append((int(px[best]), int(py[best])))
    if not candidates:
        raise RuntimeError(f"No opaque hand contact in frame {index}")
    hand = min(candidates, key=lambda point: point[0] + point[1] * 0.02)
    head_points = [landmarks[j] for j in [0, 2, 5, 7, 8] if landmarks[j].visibility > 0.5]
    if not head_points:
        raise RuntimeError(f"No head reference in frame {index}")
    head_y = float(np.median([point.y * 312 + 20 for point in head_points]))
    head_x = float(np.median([point.x * 232 + 12 for point in head_points]))
    hx, hy = round(head_x), round(head_y)
    if not solid[max(0, hy - 10):hy + 11, max(0, hx - 10):hx + 11].any():
        raise RuntimeError(f"Head was removed in frame {index}")
    return {"x": hand[0], "y": hand[1]}, head_y, [int(sx.min()), int(sy.min()), int(sx.max()) + 1, int(sy.max()) + 1]


def validate_export(output, metadata):
    bounds = []
    for page, filename in enumerate(metadata["pages"]):
        with Image.open(output / filename) as atlas:
            if atlas.size != (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * (PER_PAGE // COLUMNS)):
                raise RuntimeError(f"Unexpected frame-sheet size: {filename}")
            for cell in range(PER_PAGE):
                index = page * PER_PAGE + cell
                x, y = cell % COLUMNS * FRAME_WIDTH, cell // COLUMNS * FRAME_HEIGHT
                pixels = np.asarray(atlas.crop((x, y, x + FRAME_WIDTH, y + FRAME_HEIGHT)).convert("RGBA"))
                solid = (pixels[:, :, 3] >= 128).astype(np.uint8)
                sy, sx = np.nonzero(solid)
                if not len(sx) or min(sx) < 8 or max(sx) >= FRAME_WIDTH - 8 or min(sy) < 8 or max(sy) >= FRAME_HEIGHT - 8:
                    raise RuntimeError(f"Encoded frame {index} clips the figure")
                _, _, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
                if max(stats[1:, cv2.CC_STAT_AREA]) / solid.sum() < 0.995:
                    raise RuntimeError(f"Encoded frame {index} contains a disconnected body part")
                anchor = metadata["geometry"]["anchors"][index]
                if pixels[anchor["y"], anchor["x"], 3] < 240:
                    raise RuntimeError(f"Encoded frame {index} lost its hand contact")
                bounds.append([int(sx.min()), int(sy.min()), int(sx.max()) + 1, int(sy.max()) + 1])
    if metadata["sourceFrameIndices"] != list(range(FRAME_COUNT)):
        raise RuntimeError("The export does not retain every original frame in order")
    geometry = metadata["geometry"]
    geometry["poseBounds"] = bounds
    geometry["clearance"] = {
        "above": max(head - box[1] for head, box in zip(geometry["headY"], bounds)),
        "below": max(box[3] - head for head, box in zip(geometry["headY"], bounds)),
    }


def build(source, model_dir, pose_model, output, review):
    if not pose_model.is_file():
        pose_model.parent.mkdir(parents=True, exist_ok=True)
        print("Downloading the official local pose model", flush=True)
        urllib.request.urlretrieve(POSE_URL, pose_model)
    if hashlib.sha256(pose_model.read_bytes()).hexdigest() != POSE_HASH:
        raise RuntimeError("Pose model checksum mismatch")
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot read video: {source}")
    dimensions = (round(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    if dimensions != (SOURCE_WIDTH, SOURCE_HEIGHT) or abs(capture.get(cv2.CAP_PROP_FPS) - FPS) > 0.01:
        raise ValueError("This importer is calibrated to the supplied 464x624, 30fps video")
    output.mkdir(parents=True, exist_ok=True)
    review.mkdir(parents=True, exist_ok=True)
    encoder, decoder = support.load_models(model_dir)
    options = dict(base_options=mp.tasks.BaseOptions(model_asset_path=str(pose_model)), output_segmentation_masks=True)
    anchors, heads, bounds, diagnostics, pages, confidence = [], [], [], [], [], []
    review_sheet = Image.new("RGB", (6 * FRAME_WIDTH, 5 * (FRAME_HEIGHT + 22)), "#f7f4ef")
    draw = ImageDraw.Draw(review_sheet)
    atlas = None
    with ExitStack() as stack:
        model = stack.enter_context(mp.tasks.vision.PoseLandmarker.create_from_options(
            mp.tasks.vision.PoseLandmarkerOptions(running_mode=mp.tasks.vision.RunningMode.VIDEO, **options)))
        fallback = None
        for index in range(FRAME_COUNT):
            ok, bgr = capture.read()
            if not ok:
                raise RuntimeError(f"Video ended before source frame {index}")
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = model.detect_for_video(image, round(index * 1000 / FPS))
            if not result.pose_landmarks:
                print(f"Retrying pose detection on the same source frame {index}", flush=True)
                if fallback is None:
                    fallback = stack.enter_context(mp.tasks.vision.PoseLandmarker.create_from_options(
                        mp.tasks.vision.PoseLandmarkerOptions(running_mode=mp.tasks.vision.RunningMode.IMAGE, **options)))
                result = fallback.detect(image)
            if not result.pose_landmarks:
                raise RuntimeError(f"No body detected in original frame {index}; no frames will be skipped")
            probability = np.zeros((FRAME_HEIGHT, FRAME_WIDTH), np.uint8)
            probability[20:332, 12:244] = np.rint(cv2.resize(
                result.segmentation_masks[0].numpy_view().squeeze(), (232, 312),
                interpolation=cv2.INTER_AREA) * 255).astype(np.uint8)
            confidence.append(probability)
            solid, score = person_mask(rgb, result, index, encoder, decoder)
            sprite = make_sprite(rgb, solid)
            anchor, head, box = frame_geometry(sprite, result.pose_landmarks[0], index)
            anchors.append(anchor)
            heads.append(head)
            bounds.append(box)
            diagnostics.append({"sourceFrame": index, "maskScore": score, "sourceBounds": list(map(int, cv2.boundingRect(solid))), "spriteBounds": box})
            cell = index % PER_PAGE
            if cell == 0:
                atlas = Image.new("RGBA", (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * (PER_PAGE // COLUMNS)))
            atlas.paste(sprite, (cell % COLUMNS * FRAME_WIDTH, cell // COLUMNS * FRAME_HEIGHT))
            if index % 10 == 0:
                item = index // 10
                x, y = item % 6 * FRAME_WIDTH, item // 6 * (FRAME_HEIGHT + 22)
                review_sheet.paste(sprite, (x, y + 22), sprite)
                draw.text((x + 8, y + 5), f"Source frame {index:03}", fill="#242424")
            if cell == PER_PAGE - 1:
                filename = f"climber-{index // PER_PAGE:02}.webp"
                atlas.save(output / filename, "WEBP", quality=94, method=6, alpha_quality=100, exact=True)
                pages.append(filename)
            if (index + 1) % 30 == 0:
                print(f"Extracted original frames 0..{index} at native {FPS}fps", flush=True)
        if capture.read()[0]:
            raise RuntimeError("The reference video has more than 300 frames")
    capture.release()
    existing = json.loads((ROOT / "assets/climber.json").read_text())
    above = max(head - box[1] for head, box in zip(heads, bounds))
    below = max(box[3] - head for head, box in zip(heads, bounds))
    geometry = {
        "rightEdge": existing["geometry"]["rightEdge"],
        "leftEdge": existing["geometry"]["leftEdge"],
        "anchors": anchors,
        "anchorX": anchors[0]["x"],
        "anchorY": anchors[0]["y"],
        "headY": heads,
        "clearance": {"above": above, "below": below},
        "poseBounds": bounds,
        "contactInset": 12,
        "playback": dict(PLAYBACK),
    }
    metadata = {
        "frameWidth": FRAME_WIDTH, "frameHeight": FRAME_HEIGHT,
        "columns": COLUMNS, "rows": PER_PAGE // COLUMNS, "framesPerPage": PER_PAGE,
        "frames": FRAME_COUNT, "fps": FPS, "duration": FRAME_COUNT / FPS,
        "pages": pages, "sourceFrameIndices": list(range(FRAME_COUNT)),
        "sourceVideoSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "wallWidth": existing["wallWidth"], "wallHeight": existing["wallHeight"],
        "wallSource": existing["wallSource"], "geometry": geometry,
    }
    with Image.open(output / pages[0]) as image:
        image.crop((0, 0, FRAME_WIDTH, FRAME_HEIGHT)).save(output / "climber-poster.webp", "WEBP", lossless=True, exact=True)
    validate_export(output, metadata)
    (output / "climber.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (output / "cliff-geometry.js").write_text("window.ayaClimbGeometry = Object.freeze(" + json.dumps(geometry, separators=(",", ":")) + ");\n")
    review_sheet.save(review / "all-movements.png")
    (review / "frames.json").write_text(json.dumps(diagnostics, indent=2) + "\n")
    confidence_path = review / "person-confidence.npz"
    np.savez_compressed(confidence_path, confidence=np.stack(confidence), sourceSha256=metadata["sourceVideoSha256"])
    stabilize(source, output, output, review / "stabilized", confidence_path)
    metadata = json.loads((output / "climber.json").read_text())
    validate_export(output, metadata)
    (output / "climber.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (output / "cliff-geometry.js").write_text("window.ayaClimbGeometry = Object.freeze(" + json.dumps(metadata["geometry"], separators=(",", ":")) + ");\n")
    print(f"Finished: all {FRAME_COUNT} source frames in original order, stabilized for scroll-only playback.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--pose-model", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--review-dir", type=Path, required=True)
    args = parser.parse_args()
    build(args.input.expanduser().resolve(), args.model_dir.expanduser().resolve(),
          args.pose_model.expanduser().resolve(), args.output_dir.resolve(), args.review_dir.resolve())
