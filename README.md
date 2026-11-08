# Aya Ilssar — A little higher

An independent CV website that begins at the bottom and follows an upward climb.
The original site at https://ayailssar.github.io/ is not changed by this project.

**New website:** https://ayailssar.github.io/ayailssarCV/

**Repository:** https://github.com/Ayailssar/ayailssarCV

## Experience

- The right panel starts at its bottom title. Scroll upward through About,
  Technical Skills, Experience, Education, Certifications, and contact details.
- Professional text follows the supplied Architect CV: computational design and
  AI-enabled AEC workflows, exact role dates and project details, academic
  qualifications, certifications, technical levels, and languages. The original
  PDF is not uploaded with the website.
- About keeps its three paragraphs in normal top-to-bottom order. Its text stays
  in view while letters turn orange from top to bottom. Only after the biography
  is fully colored does the rest of the page resume bottom-to-top highlighting,
  after the portrait. On small screens the current line stays in view.
- The career timeline grows upward: Haifa Municipality (2017), Giora Gur,
  Oren M.A.Z, Tito Oman, Bar Orian, and finally Kodo at the top.
- Education also reads upward from the B.Arch.Ed. at WIZO to the current M.A. at
  HIT. Certifications follow Education, with contact information afterward.
- The supplied `cliff.png` forms the full-height divider and stays completely
  still. Only its empty transparent margin is trimmed; the visible pixels and
  original aspect ratio are preserved, without stretching or repainting.
- The character retains **all 300 source frames from the original 30fps video**.
  Frames are controlled strictly by the CV's actual scroll position, not a clock:
  scrolling up advances the source sequence, scrolling back retraces it, and
  stopping freezes the exact current pose. Left-gallery scrolling does not play it.
- Wheel movement is smoothed along with the page itself. Neighboring frames blend
  at sub-frame positions, and a short eased bridge joins the final frame to the
  first without a hard loop reset. No original movements are omitted.
- Temporal foreground consistency and stable contact tracking remove flickering
  limbs and abrupt hand-anchor switches. Both blended poses remain on the actual
  cliff; padded rendering avoids cutting either pose during a transition.
- A measured helmet reference advances continuously upward; pose recovery cannot
  make the character slide backward, and silhouette clearance keeps every pose
  inside the panel.
- Every source frame is processed. Full-body landmarks guide the masks, and
  padded frames preserve the complete silhouette, including thin hands and feet.
- The original left gallery, photos, wave motion, infinite horizontal scrolling,
  pointer movement, photo viewer, and soundtrack are retained.
- The site defaults to light mode. Invert Colors and `?scoutTheme=dark` remain available.
- Visible typography is at least 10px on every breakpoint. Direction arrows are
  enlarged, and the entrance badge reads `MY UNIQUE CV · 2026`.
- Reduced-motion mode shows a stationary climbing pose. The CV is still fully readable.
- On narrow screens the unchanged gallery stays above a separately scrollable CV panel.

## Run locally

No dependency installation is needed for the website.

```sh
python3 -m http.server 4175 --bind 127.0.0.1
```

Open http://127.0.0.1:4175. Scroll **up inside the CV panel** or use its navigation
links. The title's arrow opens About; Back to Start returns to the bottom.
Sound starts after the welcome screen, subject to browser autoplay permissions.

## Source and single-file download

- `index.html`: content, accessible navigation, and climbing divider markup.
- `styles.css`: unchanged base styles from the original site.
- `cv.css`: right-panel layout and divider styles only.
- `app.js`: original gallery behavior plus the upward story and scroll-driven frames.
- `assets/`: photos, soundtrack, static cliff panorama, three character frame sheets and
  poster, and the contour/anchor geometry.
- `scripts/`: build, integrity tests, and local media preparation.
- `dist/index.html`: self-contained download with styles, scripts, photos, climbing
  frames, and the complete soundtrack embedded.

Node.js 18 or newer is required only to rebuild and test:

```sh
npm run check
npm test
```

For an open page after entering the site, `scripts/check-cliff-browser.js` checks
the whole scroll, including gait-loop boundaries: undistorted full-height rock,
physical hand/rock contact, repeated motion through the end, upward career order,
and an unchanged independent gallery.
It can be run with a browser evaluation tool, including
`agent-browser eval --stdin < scripts/check-cliff-browser.js`.
`scripts/check-scroll-video-browser.js` checks real wheel input, all source frames,
idle freeze, left-gallery independence, and pixel continuity at the loop boundary.

Download **`dist/index.html`** for one-file offline use. The root `index.html` needs
its adjacent CSS, JS, and assets. The standalone file is large because it embeds
the entire one-hour soundtrack; GitHub may require downloading rather than previewing it.

## Climbing media

The three transparent frame sheets contain all 300 native 30fps frames from the
ten-second reference video. Each padded frame is 256 × 352 pixels; each sheet has
100 frames in a 10 × 10 grid. Source IDs 0–299 and the original video checksum are
recorded in `climber.json`. The supporting rock is not part of the animated frames.

`cliff-source.png` is the unmodified supplied image. `cliff-wall.webp` is its
lossless 235 × 1874 crop, removing only the empty right-hand margin. The rendered
width follows the image's native ratio at the panel's height.

`cliff-geometry.js` contains the edge at every source-image row and an actual opaque
hand anchor for every pose. The hand sits slightly inside the rock face rather
than hovering outside its edge. Two full source cycles span the CV ascent, with
a blended loop bridge and no autonomous playback. The padded canvas adds 32 pixels
around each side of the source frame so frame alignment cannot crop the figure.
The reduced-motion poster matches original frame zero.

To replace the cliff without rerunning person segmentation:

```sh
python3 -m pip install Pillow numpy
python3 scripts/prepare_cliff.py "/path/to/cliff.png"
npm test
```

Geometry is included directly in the standalone HTML, so positioning needs no
runtime fetch or canvas pixel-reading permission.

To regenerate it locally, install Python 3 and FFmpeg, then run:

```sh
python3 -m pip install mediapipe==0.10.35 Pillow numpy opencv-python onnxruntime
python3 scripts/prepare_full_climber.py "/path/to/reference-video.mp4" \
  --model-dir "$HOME/.cache/aya-climber-models" \
  --pose-model "$HOME/.cache/aya-climber-models/pose_landmarker_full.task" \
  --output-dir assets --review-dir /tmp/aya-climber-review
npm test
```

The helper is calibrated to the supplied 464 × 624, ten-second clip. MediaPipe
tracks the complete body and guides high-resolution MobileSAM masks. A local
optical-flow pass restores only foreground supported by neighboring source frames,
their actual colors, and person-confidence masks. Every native source frame is
retained; nothing is substituted or skipped. The supplied cliff image is retained
rather than regenerated. The old short-pose exporter is retired.
The first media rebuild downloads pinned, checksum-verified public model weights;
frames are never uploaded. The original video and model weights are not included
in the repository. No hosted image-processing or media-generation service is used.
Once models are cached, extraction can run with outbound networking disabled.

## Publish updates

GitHub Pages serves this repository's `main` branch at `/ayailssarCV/`.
Relative asset URLs support that subpath and local previews. `.nojekyll` disables
Jekyll processing.

Edit this project, rebuild `dist/index.html`, commit, and push to this repository.
Do not push these changes to `Ayailssar.github.io` or `aya-about`: those remain the
separate original website and source project.
