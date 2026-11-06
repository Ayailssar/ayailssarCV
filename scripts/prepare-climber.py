#!/usr/bin/env python3
"""Separate the supplied climbing clip into a human atlas and a static cliff.

Requires ffmpeg, ffprobe, Pillow, numpy, opencv-python, and onnxruntime.
Usage: python3 scripts/prepare-climber.py VIDEO --model-dir /path/to/model-cache
Optional --review-dir saves local contact sheets and extraction diagnostics.

Landmarks are authored for the original 464x624, 10-second reference clip.
MobileSAM runs locally. Only pinned public model weights are downloaded when
absent; neither the video nor extracted frames are ever uploaded or published.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageChops, ImageDraw, features


FRAME_WIDTH, FRAME_HEIGHT = 232, 312
COLUMNS, ROWS, FRAMES, FPS, DURATION = 12, 10, 120, 12, 10
SOURCE_WIDTH, SOURCE_HEIGHT = 464, 624
ANCHOR_X, ANCHOR_Y = 72, 56
SUBJECT_SCALE = 0.5
WALL_WIDTH, WALL_HEIGHT = 480, 2880
ASSETS = Path(__file__).resolve().parents[1] / "assets"
MODEL_REVISION = "0d3b403339b4674a82493d5e97964dd78089ddc8"
MODELS = {
    "mobile_sam_image_encoder.onnx": "580f5fb648ea1062c0aabc26217aed56921985f03f0cbbd852bba81d760cc749",
    "sam_mask_decoder_multi.onnx": "8976b90a87ba50a6a72217a5ff994f7d25ce16f2229fcc1ed259e1294c622ffe",
}

# Hand contact, helmet, torso, hip, knee, near shoe, far shoe, chalk bag.
# These are positive anatomical prompts, not rectangle cutouts.
LANDMARKS = {
    0: [(192, 111), (240, 178), (240, 245), (263, 329), (252, 402), (267, 450), (267, 524), (282, 298)],
    12: [(191, 111), (240, 176), (245, 245), (264, 328), (252, 402), (268, 452), (270, 528), (284, 298)],
    18: [(190, 132), (258, 178), (253, 248), (287, 318), (255, 316), (265, 388), (274, 531), (327, 309)],
    24: [(190, 169), (268, 196), (254, 265), (290, 350), (236, 316), (239, 395), (268, 547), (328, 327)],
    30: [(191, 214), (240, 148), (249, 246), (272, 308), (219, 343), (235, 430), (252, 480), (299, 278)],
    33: [(181, 77), (229, 137), (221, 226), (243, 294), (218, 361), (239, 444), (248, 481), (263, 264)],
    36: [(169, 26), (222, 141), (205, 224), (223, 292), (215, 370), (237, 466), (242, 491), (243, 260)],
    48: [(174, 122), (240, 181), (248, 271), (266, 344), (241, 421), (235, 544), (240, 535), (282, 322)],
    54: [(182, 101), (250, 149), (249, 231), (267, 303), (217, 292), (200, 359), (237, 478), (297, 293)],
    60: [(175, 133), (245, 179), (238, 266), (254, 335), (198, 319), (188, 395), (235, 519), (279, 320)],
    66: [(176, 173), (260, 181), (253, 261), (271, 336), (202, 360), (191, 441), (241, 502), (306, 319)],
    72: [(178, 81), (250, 154), (239, 237), (241, 310), (203, 377), (189, 486), (199, 487), (271, 287)],
    78: [(176, 121), (242, 160), (260, 252), (277, 328), (223, 351), (227, 435), (203, 448), (311, 303)],
    84: [(177, 162), (263, 185), (255, 263), (271, 332), (201, 318), (196, 389), (204, 494), (302, 321)],
    90: [(184, 181), (253, 147), (233, 235), (233, 293), (191, 358), (200, 429), (222, 476), (273, 272)],
    96: [(194, 77), (260, 157), (231, 238), (232, 308), (198, 378), (196, 466), (213, 488), (258, 278)],
    108: [(200, 121), (240, 173), (244, 270), (239, 348), (216, 416), (190, 515), (199, 502), (274, 320)],
    114: [(203, 136), (255, 156), (253, 239), (253, 317), (220, 263), (195, 328), (206, 487), (299, 303)],
    119: [(205, 139), (273, 153), (252, 236), (252, 315), (194, 264), (182, 326), (206, 489), (284, 292)],
}

# Visible wall fixtures can be mistaken for part of a gripping hand or shoe.
# Track the fixtures separately and subtract their own semantic masks.
HOLD_TRACKS = [
    {0: (184, 93), 12: (184, 93), 18: (183, 113), 24: (182, 149), 30: (184, 194)},
    {47: (192, 319), 48: (194, 328), 49: (194, 337), 50: (192, 345)},
    {34: (159, 20), 36: (159, 35), 48: (164, 130), 60: (166, 220), 72: (171, 315), 84: (174, 410), 96: (175, 498), 108: (177, 560), 119: (178, 580)},
    {48: (163, 50), 60: (166, 134), 72: (172, 225), 84: (172, 315), 96: (174, 405), 108: (177, 460), 119: (178, 477)},
    {60: (162, 6), 72: (165, 86), 84: (166, 174), 96: (169, 255), 108: (171, 309), 119: (169, 321)},
    {84: (188, 15), 96: (183, 83), 108: (186, 138), 119: (186, 149)},
]
BACKGROUND_TRACKS = [
    {54: (180, 240), 60: (180, 275), 64: (183, 300), 66: (180, 315), 68: (183, 303), 70: (183, 300)},
    {54: (207, 405), 60: (205, 454), 64: (205, 486), 66: (208, 477), 68: (211, 500), 70: (212, 500)},
]


def decode_video(source):
    for executable in ("ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            raise RuntimeError(f"{executable} is required on PATH")
    if not features.check("webp"):
        raise RuntimeError("Pillow must include WebP support")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:format=duration", "-of", "json", str(source)],
        check=True, capture_output=True, text=True,
    )
    info = json.loads(probe.stdout)
    if not info.get("streams"):
        raise ValueError("The input contains no video stream")
    stream = info["streams"][0]
    if (stream["width"], stream["height"]) != (SOURCE_WIDTH, SOURCE_HEIGHT):
        raise ValueError("Landmarks require the original 464x624 reference footage")
    if abs(float(info["format"]["duration"]) - DURATION) > 0.05:
        raise ValueError("Landmarks require the original 10-second reference footage")
    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(source), "-map", "0:v:0", "-vf",
         f"fps={FPS}:start_time=0:round=up", "-frames:v", str(FRAMES), "-an", "-sn",
         "-pix_fmt", "rgb24", "-threads", "1", "-f", "rawvideo", "pipe:1"]
    )
    expected = FRAMES * SOURCE_WIDTH * SOURCE_HEIGHT * 3
    if len(raw) != expected:
        raise RuntimeError(f"Expected {expected} decoded bytes; received {len(raw)}")
    return np.frombuffer(raw, np.uint8).reshape(FRAMES, SOURCE_HEIGHT, SOURCE_WIDTH, 3)


def load_models(model_dir):
    model_dir.mkdir(parents=True, exist_ok=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    sessions = []
    for filename, digest in MODELS.items():
        path = model_dir / filename
        if not path.is_file():
            print(f"Downloading public model weights: {filename}", flush=True)
            url = f"https://huggingface.co/Acly/MobileSAM/resolve/{MODEL_REVISION}/{filename}"
            urllib.request.urlretrieve(url, path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Model checksum mismatch: {path}")
        sessions.append(ort.InferenceSession(
            str(path), sess_options=options, providers=["CPUExecutionProvider"]
        ))
    return sessions


def tracked_landmarks(frames):
    gray = [cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY) for frame in frames]
    result = np.empty((FRAMES, 8, 2), np.float32)
    keys = sorted(LANDMARKS)

    def propagate(start, stop, points):
        positions = {start: np.array(points, np.float32)}
        direction = 1 if stop > start else -1
        for index in range(start, stop, direction):
            following = index + direction
            moved, status, _ = cv2.calcOpticalFlowPyrLK(
                gray[index], gray[following], positions[index][:, None], None,
                winSize=(31, 31), maxLevel=4,
                criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.01),
            )
            fraction = (following - start) / (stop - start)
            authored = np.array(LANDMARKS[start]) * (1 - fraction) + np.array(LANDMARKS[stop]) * fraction
            if moved is None:
                raise RuntimeError(f"Optical flow failed between frames {index} and {following}")
            tracked = moved[:, 0]
            invalid = (status[:, 0] == 0) | (np.linalg.norm(tracked - authored, axis=1) > 65)
            if np.any(invalid):
                print(f"Frame {following}: using authored interpolation for occluded landmark(s) "
                      f"{np.flatnonzero(invalid).tolist()}", flush=True)
                tracked[invalid] = authored[invalid]
            positions[following] = np.clip(tracked, [0, 0], [463, 623]).astype(np.float32)
        return positions

    for start, stop in zip(keys, keys[1:]):
        forward = propagate(start, stop, LANDMARKS[start])
        backward = propagate(stop, start, LANDMARKS[stop])
        for index in range(start, stop + 1):
            fraction = (index - start) / (stop - start)
            result[index] = forward[index] * (1 - fraction) + backward[index] * fraction
    return result


def subtract_holds(frame, mask, points, index, embedding, decoder):
    red, green, blue = frame.astype(np.int16).transpose(2, 0, 1)
    visible_stone = (red - green < 10) & (red - blue < 18) & (red > 80)
    for track in HOLD_TRACKS:
        keys = sorted(track)
        if not keys[0] <= index <= keys[-1]:
            continue
        center = np.array([
            np.interp(index, keys, [track[key][axis] for key in keys]) for axis in (0, 1)
        ])
        cx, cy = np.rint(center).astype(int)
        x0, x1 = max(0, cx - 18), min(SOURCE_WIDTH, cx + 19)
        y0, y1 = max(0, cy - 24), min(SOURCE_HEIGHT, cy + 33)
        if not mask[y0:y1, x0:x1].any():
            continue
        sy0, sy1 = max(0, cy - 8), min(SOURCE_HEIGHT, cy + 9)
        sx0, sx1 = max(0, cx - 8), min(SOURCE_WIDTH, cx + 9)
        ys, xs = np.nonzero(visible_stone[sy0:sy1, sx0:sx1])
        if not len(xs):
            continue  # The fixture is occluded by the climber in this frame.
        candidates = np.column_stack((xs + sx0, ys + sy0))
        seed = candidates[np.argmin(np.sum((candidates - center) ** 2, axis=1))]
        if np.any(np.linalg.norm(points[[1, 2]] - seed, axis=1) < 26):
            continue
        if np.any(np.linalg.norm(points[[3, 4]] - seed, axis=1) < 35):
            continue
        order = np.argsort(np.linalg.norm(points - seed, axis=1))
        negative = next((points[i] for i in order if np.linalg.norm(points[i] - seed) > 8), None)
        if negative is None:
            raise RuntimeError("Cannot disambiguate a wall fixture from the subject")
        prompts = np.float32([seed, negative, [x0, y0], [x1 - 1, y1 - 1]])
        masks, _, _ = decoder.run(None, {
            "image_embeddings": embedding,
            "point_coords": (prompts * [761 / 464, 1024 / 624])[None].astype(np.float32),
            "point_labels": np.float32([[1, 0, 2, 3]]),
            "mask_input": np.zeros((1, 1, 256, 256), np.float32),
            "has_mask_input": np.zeros(1, np.float32),
            "orig_im_size": np.float32([SOURCE_HEIGHT, SOURCE_WIDTH]),
        })
        # The smallest object-scale token separates the grip from the fingers
        # resting on it; larger tokens can accidentally include the whole shoe.
        fixture = masks[0, 1] > 0
        if not 15 <= fixture.sum() <= 1400:
            continue  # An occluding garment is not a small climbing fixture.
        mask[y0:y1, x0:x1][fixture[y0:y1, x0:x1]] = 0
    return mask


def segment_person(frame, points, index, encoder, decoder):
    resized = cv2.resize(frame, (761, 1024), interpolation=cv2.INTER_LINEAR)
    embedding = encoder.run(None, {"input_image": resized.astype(np.float32)})[0]
    negatives = np.array([
        [100, points[2, 1]], [70, 100], [400, 500],
        [400, points[2, 1]], [110, points[5, 1]],
    ], np.float32)
    for track in BACKGROUND_TRACKS:
        keys = sorted(track)
        if keys[0] <= index <= keys[-1]:
            point = [np.interp(index, keys, [track[key][axis] for key in keys]) for axis in (0, 1)]
            negatives = np.vstack((negatives, np.float32(point)))
    low = np.maximum(points.min(axis=0) - [25, 30], [0, 0])
    high = np.minimum(points.max(axis=0) + [30, 30], [463, 623])
    prompts = np.concatenate((points, negatives, [low, high])).astype(np.float32)
    labels = [1] * len(points) + [0] * len(negatives) + [2, 3]
    masks, _, _ = decoder.run(None, {
        "image_embeddings": embedding,
        "point_coords": (prompts * [761 / 464, 1024 / 624])[None].astype(np.float32),
        "point_labels": np.array([labels], np.float32),
        "mask_input": np.zeros((1, 1, 256, 256), np.float32),
        "has_mask_input": np.zeros(1, np.float32),
        "orig_im_size": np.array([SOURCE_HEIGHT, SOURCE_WIDTH], np.float32),
    })
    # Combine the whole-object and largest-scale semantic masks. Rating the
    # ambiguity masks by IoU alone can select a torso-only cutout.
    mask = ((masks[0, 0] > 0) | (masks[0, 3] > 0)).astype(np.uint8)
    mask[:max(0, int(low[1])), :] = 0
    mask[min(SOURCE_HEIGHT, int(high[1]) + 1):, :] = 0
    mask[:, :max(0, int(low[0]))] = 0
    mask[:, min(SOURCE_WIDTH, int(high[0]) + 1):] = 0

    # Refine only a narrow semantic boundary; never let color similarity grow
    # a flesh/tan-clothing mask into the neighboring sandstone.
    kernel = np.ones((3, 3), np.uint8)
    inner = cv2.erode(mask, kernel, iterations=1)
    outer = cv2.dilate(mask, kernel, iterations=1)
    trimap = np.full(mask.shape, cv2.GC_BGD, np.uint8)
    trimap[outer > 0] = cv2.GC_PR_BGD
    trimap[mask > 0] = cv2.GC_PR_FGD
    trimap[inner > 0] = cv2.GC_FGD
    cv2.setRNGSeed(7)
    cv2.grabCut(
        cv2.cvtColor(frame, cv2.COLOR_RGB2BGR), trimap, None,
        np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
        2, cv2.GC_INIT_WITH_MASK,
    )
    mask = ((trimap == cv2.GC_FGD) | (trimap == cv2.GC_PR_FGD)).astype(np.uint8)
    count, components, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count < 2:
        raise RuntimeError("The human segmentation is empty")
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    distance = cv2.distanceTransform((components != largest).astype(np.uint8), cv2.DIST_L2, 5)
    keep = [
        label for label in range(1, count)
        if stats[label, cv2.CC_STAT_AREA] >= 500
        or (stats[label, cv2.CC_STAT_AREA] >= 16 and distance[components == label].min() <= 5)
    ]
    mask = np.isin(components, keep).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    mask = subtract_holds(frame, mask, points, index, embedding, decoder)
    count, components, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    for label in range(1, count):
        area = stats[label, cv2.CC_STAT_AREA]
        width, height = stats[label, cv2.CC_STAT_WIDTH:cv2.CC_STAT_HEIGHT + 1]
        if area < 16 or (area < 100 and min(width, height) <= 3):
            mask[components == label] = 0
    if not 10000 < int(mask.sum()) < 50000:
        raise RuntimeError(f"Implausible subject area: {mask.sum()} pixels")
    return mask


def contact_anchor(frame, mask, points):
    red, green, blue = frame.astype(np.int16).transpose(2, 0, 1)
    yy, xx = np.mgrid[:SOURCE_HEIGHT, :SOURCE_WIDTH]
    # Resolve the actual fingertips, not the interpolated position during a
    # quick hand-over-hand reach. The helmet/face lies to the right of this band.
    region = (np.abs(xx - points[0, 0]) < 12) & (yy < points[1, 1] + 90)
    skin = (mask > 0) & region & (red - green > 20) & (red - blue > 30)
    rows = np.flatnonzero(skin.sum(axis=1) >= 3)
    if not len(rows):
        raise RuntimeError("Cannot locate the visible wall-facing fingertips")
    top = rows[0]
    _, columns = np.nonzero(skin[top:top + 12])
    return np.array([np.median(columns), top + 7], np.float32)


def stabilized_sprite(frame, mask, hand):
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (3, 3), 0.45)
    colors = frame.astype(np.float32)
    # Extend foreground colors into the subpixel feather, rather than blending
    # surrounding rock/black into the transparent contour.
    outside = (mask == 0).astype(np.uint8)
    _, nearest = cv2.distanceTransformWithLabels(
        outside, cv2.DIST_L2, cv2.DIST_MASK_5, labelType=cv2.DIST_LABEL_PIXEL
    )
    interior_colors = colors[mask > 0]
    feather = (mask == 0) & (alpha > 0)
    colors[feather] = interior_colors[nearest[feather] - 1]
    premultiplied = np.dstack((colors * alpha[:, :, None], alpha))
    transform = np.array([
        [SUBJECT_SCALE, 0, ANCHOR_X - SUBJECT_SCALE * hand[0]],
        [0, SUBJECT_SCALE, ANCHOR_Y - SUBJECT_SCALE * hand[1]],
    ], np.float32)
    moved = cv2.warpAffine(
        premultiplied, transform, (FRAME_WIDTH, FRAME_HEIGHT),
        flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT,
    )
    opacity = np.clip(moved[:, :, 3], 0, 1)
    rgb = np.divide(
        moved[:, :, :3], opacity[:, :, None],
        out=np.zeros_like(moved[:, :, :3]), where=opacity[:, :, None] > 0.002,
    )
    result = np.dstack((np.clip(rgb, 0, 255), opacity * 255)).round().astype(np.uint8)
    result[result[:, :, 3] < 2] = 0
    ys, xs = np.nonzero(result[:, :, 3] > 10)
    if not len(xs) or min(xs) < 3 or max(xs) > FRAME_WIDTH - 4 or min(ys) < 3 or max(ys) > FRAME_HEIGHT - 4:
        raise RuntimeError("A stabilized pose would clip the canvas; revise anchor/scale")
    return Image.fromarray(result)


def build_wall(frames):
    indices = [36, 48, 60, 72, 84, 96, 108, 119]
    sift = cv2.SIFT_create(nfeatures=2000)
    detector_mask = np.zeros((SOURCE_HEIGHT, SOURCE_WIDTH), np.uint8)
    detector_mask[:, :145] = 255
    descriptors = [
        sift.detectAndCompute(cv2.cvtColor(frames[i], cv2.COLOR_RGB2GRAY), detector_mask)
        for i in indices
    ]
    transforms = [np.eye(3)]
    registrations = []
    for previous, following in zip(descriptors, descriptors[1:]):
        kp1, desc1 = previous
        kp2, desc2 = following
        matches = [
            first for first, second in cv2.BFMatcher().knnMatch(desc1, desc2, k=2)
            if first.distance < 0.75 * second.distance
        ]
        if len(matches) < 12:
            raise RuntimeError("Too few rock features for a trustworthy wall panorama")
        src = np.float32([kp1[match.queryIdx].pt for match in matches])
        dst = np.float32([kp2[match.trainIdx].pt for match in matches])
        cv2.setRNGSeed(7)
        affine, inliers = cv2.estimateAffinePartial2D(
            src, dst, method=cv2.RANSAC, ransacReprojThreshold=3
        )
        if affine is None or int(inliers.sum()) < 12:
            raise RuntimeError("Rock-only panorama registration failed")
        matrix = np.vstack((affine, [0, 0, 1]))
        transforms.append(transforms[-1] @ np.linalg.inv(matrix))
        registrations.append(int(inliers.sum()))

    # Only the clean left rock face is ever admitted: no people, ropes, or
    # inpainted/generated texture. These rectangles overlap after registration.
    clean_width = 140
    corners = np.float32([[8, 0], [clean_width - 8, 0], [8, 623], [clean_width - 8, 623]])
    projected = [cv2.perspectiveTransform(corners[None], matrix)[0] for matrix in transforms]
    left = max(points[:, 0].min() for points in projected) + 2
    right = min(points[:, 0].max() for points in projected) - 2
    width = right - left
    height = width * WALL_HEIGHT / WALL_WIDTH
    ymin = min(points[:, 1].min() for points in projected)
    ymax = max(points[:, 1].max() for points in projected)
    top = (ymin + ymax - height) / 2
    scale = WALL_WIDTH / width
    output = np.array([[scale, 0, -left * scale], [0, scale, -top * scale], [0, 0, 1]])
    color_sum = np.zeros((WALL_HEIGHT, WALL_WIDTH, 3), np.float32)
    weight_sum = np.zeros((WALL_HEIGHT, WALL_WIDTH), np.float32)
    yy, xx = np.mgrid[:SOURCE_HEIGHT, :SOURCE_WIDTH]
    horizontal = np.clip(np.minimum(xx, clean_width - 1 - xx) / 8, 0, 1)
    vertical = np.maximum(0, 1 - np.abs((yy - 311.5) / 311.5)) ** 4
    weight = (horizontal * vertical).astype(np.float32)
    for index, matrix in zip(indices, transforms):
        warp = output @ matrix
        warped_weight = cv2.warpPerspective(weight, warp, (WALL_WIDTH, WALL_HEIGHT))
        warped_color = cv2.warpPerspective(
            frames[index].astype(np.float32) * weight[:, :, None],
            warp, (WALL_WIDTH, WALL_HEIGHT),
        )
        weight_sum += warped_weight
        color_sum += warped_color
    if weight_sum.min() < 0.0001:
        raise RuntimeError("Registered cliff has uncovered pixels; refusing to fill with invented texture")
    rgb = np.clip(color_sum / weight_sum[:, :, None], 0, 255).round().astype(np.uint8)
    y = np.arange(WALL_HEIGHT, dtype=np.float64)
    left_edge = 55 + 15 * np.sin(y / 241 + 0.3) + 9 * np.sin(y / 113 + 1.1)
    right_edge = 365 + 30 * np.sin(y / 347 + 0.6) + 17 * np.sin(y / 157 + 1.8)
    x = np.arange(WALL_WIDTH)[None, :]
    distance = np.minimum(x - left_edge[:, None], right_edge[:, None] - x)
    alpha = np.clip(distance + 0.5, 0, 1)
    wall = np.dstack((rgb, (alpha * 255).round().astype(np.uint8)))
    wall[wall[:, :, 3] == 0] = 0
    return Image.fromarray(wall), registrations


def save_review(directory, sprites, wall, diagnostics):
    directory.mkdir(parents=True, exist_ok=True)
    indices = [0, 12, 24, 30, 36, 48, 60, 72, 84, 96, 108, 119]
    sheet = Image.new("RGB", (6 * FRAME_WIDTH, 4 * (FRAME_HEIGHT + 24)))
    draw = ImageDraw.Draw(sheet)
    for background, color in enumerate(("#f8f6f0", "#182227")):
        for position, index in enumerate(indices):
            x = position % 6 * FRAME_WIDTH
            y = (background * 2 + position // 6) * (FRAME_HEIGHT + 24)
            draw.rectangle((x, y, x + FRAME_WIDTH - 1, y + FRAME_HEIGHT + 23), fill=color)
            sheet.paste(sprites[index], (x, y + 24), sprites[index])
            draw.text((x + 8, y + 6), f"Frame {index}; anchor ({ANCHOR_X}, {ANCHOR_Y})",
                      fill="#24332d" if background == 0 else "#eeeeee")
    sheet.save(directory / "human-contact-sheet.webp", lossless=True)
    overview = Image.new("RGB", (WALL_WIDTH * 2, WALL_HEIGHT), "#f8f6f0")
    overview.paste("#182227", (WALL_WIDTH, 0, WALL_WIDTH * 2, WALL_HEIGHT))
    overview.paste(wall, (0, 0), wall)
    overview.paste(wall, (WALL_WIDTH, 0), wall)
    overview.save(directory / "wall-light-dark.webp", lossless=True)
    (directory / "diagnostics.json").write_text(json.dumps(diagnostics, indent=2) + "\n")


def write_geometry(metadata):
    with Image.open(ASSETS / "cliff-wall.webp") as wall:
        alpha = np.asarray(wall.getchannel("A"))
        samples = []
        for y in np.rint(np.linspace(0, wall.height - 1, 129)).astype(int):
            opaque = np.flatnonzero(alpha[y] > 200)
            if not len(opaque):
                raise RuntimeError(f"The static cliff has an empty row at {y}")
            samples.append(round(int(opaque[-1]) / wall.width, 6))
    geometry = {
        "rightEdge": samples,
        "anchorX": metadata["anchorX"],
        "anchorY": metadata["anchorY"],
    }
    metadata["geometry"] = geometry
    (ASSETS / "cliff-geometry.js").write_text(
        "window.ayaClimbGeometry = Object.freeze(" +
        json.dumps(geometry, separators=(",", ":")) + ");\n",
        encoding="utf-8",
    )
    (ASSETS / "climber.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def build(source, model_dir, review_dir):
    frames = decode_video(source)
    encoder, decoder = load_models(model_dir)
    landmarks = tracked_landmarks(frames)
    sprites, diagnostics = [], {"subjectAreas": [], "sourceAnchors": []}
    for index, (frame, points) in enumerate(zip(frames, landmarks)):
        mask = segment_person(frame, points, index, encoder, decoder)
        hand = contact_anchor(frame, mask, points)
        sprite = stabilized_sprite(frame, mask, hand)
        sprites.append(sprite)
        diagnostics["subjectAreas"].append(int(mask.sum()))
        diagnostics["sourceAnchors"].append(hand.tolist())
        if (index + 1) % 12 == 0:
            print(f"Extracted {index + 1}/{FRAMES} human-only frames", flush=True)
    wall, registrations = build_wall(frames)
    diagnostics["wallRegistrationInliers"] = registrations
    atlas = Image.new("RGBA", (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * ROWS))
    for index, sprite in enumerate(sprites):
        atlas.paste(sprite, (index % COLUMNS * FRAME_WIDTH, index // COLUMNS * FRAME_HEIGHT))
    metadata = {
        "frameWidth": FRAME_WIDTH, "frameHeight": FRAME_HEIGHT,
        "columns": COLUMNS, "rows": ROWS, "frames": FRAMES, "fps": FPS, "duration": DURATION,
        "anchorX": ANCHOR_X, "anchorY": ANCHOR_Y,
        "wallWidth": WALL_WIDTH, "wallHeight": WALL_HEIGHT,
    }
    if review_dir:
        save_review(review_dir, sprites, wall, diagnostics)
    ASSETS.mkdir(parents=True, exist_ok=True)
    atlas.save(ASSETS / "climber-atlas.webp", "WEBP", quality=90, method=6, alpha_quality=100, exact=True)
    wall.save(ASSETS / "cliff-wall.webp", "WEBP", quality=91, method=6, alpha_quality=100, exact=True)
    with Image.open(ASSETS / "climber-atlas.webp") as encoded:
        poster = encoded.crop((0, 0, FRAME_WIDTH, FRAME_HEIGHT))
    poster.save(ASSETS / "climber-poster.webp", "WEBP", lossless=True, method=6, exact=True)
    write_geometry(metadata)
    with Image.open(ASSETS / "cliff-wall.webp") as encoded:
        if not np.all(np.asarray(encoded.getchannel("A"))[:, 100:300] == 255):
            raise RuntimeError("Cliff's continuous divider-covering band is not fully opaque")
    with Image.open(ASSETS / "climber-poster.webp") as encoded:
        if ImageChops.difference(encoded, poster).getbbox() is not None:
            raise RuntimeError("Poster does not exactly match the first atlas cell")
    for filename in ("climber-atlas.webp", "climber-poster.webp", "climber.json", "cliff-wall.webp", "cliff-geometry.js"):
        print(f"assets/{filename}: {(ASSETS / filename).stat().st_size:,} bytes")
    print(f"Human-only atlas: {FRAMES} frames; anchor ({ANCHOR_X}, {ANCHOR_Y}); static wall {WALL_WIDTH}x{WALL_HEIGHT}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--model-dir", type=Path, default=Path.home() / ".cache" / "aya-climber-models")
    parser.add_argument("--review-dir", type=Path)
    args = parser.parse_args()
    source = args.input.expanduser().resolve()
    if not source.is_file():
        parser.error(f"Input video does not exist: {source}")
    build(source, args.model_dir.expanduser().resolve(), args.review_dir)


if __name__ == "__main__":
    main()
