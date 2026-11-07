# Aya Ilssar — A little higher

An independent CV website that begins at the bottom and follows an upward climb.
The original site at https://ayailssar.github.io/ is not changed by this project.

**New website:** https://ayailssar.github.io/ayailssarCV/

**Repository:** https://github.com/Ayailssar/ayailssarCV

## Experience

- The right panel starts at its bottom title. Scroll upward through About,
  Software & Tools, Experience, and contact details.
- About keeps its three paragraphs in normal top-to-bottom order. Its text stays
  in view while letters turn orange from top to bottom. Only after the biography
  is fully colored does the rest of the page resume bottom-to-top highlighting,
  after the portrait. On small screens the current line stays in view.
- The career timeline grows upward: Haifa Municipality (2017), Giora Gur,
  Oren M.A.Z, Tito Oman, Bar Orian, and finally Kodo at the top.
- The supplied `cliff.png` forms the full-height divider and stays completely
  still. Only its empty transparent margin is trimmed; the visible pixels and
  original aspect ratio are preserved, without stretching or repainting.
- The character is a separate transparent layer. Only her pose and position change
  with the right panel's scroll. Her gait loops throughout the whole ascent without
  resetting her height, and an opaque hand contact stays inside the actual rock.
  Scrolling back reverses the climb; stopping freezes her. Neither layer autoplays.
- Only inspected complete-body poses are displayed. Disconnected or frame-edge
  clipped poses are rejected during preparation.
- The original left gallery, photos, wave motion, infinite horizontal scrolling,
  pointer movement, photo viewer, and soundtrack are retained.
- The site defaults to light mode. Invert Colors and `?scoutTheme=dark` remain available.
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
- `assets/`: photos, soundtrack, static cliff panorama, character-only atlas and
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

Download **`dist/index.html`** for one-file offline use. The root `index.html` needs
its adjacent CSS, JS, and assets. The standalone file is large because it embeds
the entire one-hour soundtrack; GitHub may require downloading rather than previewing it.

## Climbing media

The character-only transparent sprite atlas has 120 frames, sampled at 12 fps from
the ten-second reference video. Frames are 232 × 312 pixels in a 12-column, 10-row
atlas. The supporting rock is not part of the animated frames.

`cliff-source.png` is the unmodified supplied image. `cliff-wall.webp` is its
lossless 235 × 1874 crop, removing only the empty right-hand margin. The rendered
width follows the image's native ratio at the panel's height.

`cliff-geometry.js` contains the edge at every source-image row and an actual opaque
hand anchor for every pose. The hand sits slightly inside the rock face rather
than hovering outside its edge. Complete poses 54–64 repeat every 220 pixels of CV scrolling;
overall vertical ascent continues independently from the repeating pose sequence.
The reduced-motion poster matches the loop's starting pose.

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
python3 -m pip install Pillow numpy opencv-python onnxruntime
python3 scripts/prepare-climber.py "/path/to/reference-video.mp4" --cliff-source assets/cliff-source.png
npm test
```

The helper is calibrated to the supplied 464 × 624, ten-second clip. It uses
locally executed MobileSAM segmentation with tracked anatomical prompts to
separate the character. It reuses the supplied cliff image rather than generating
a new panorama.
The first media rebuild downloads pinned, checksum-verified public model weights;
frames are never uploaded. The original video and model weights are not included
in the repository. No hosted image-processing or media-generation service is used.

## Publish updates

GitHub Pages serves this repository's `main` branch at `/ayailssarCV/`.
Relative asset URLs support that subpath and local previews. `.nojekyll` disables
Jekyll processing.

Edit this project, rebuild `dist/index.html`, commit, and push to this repository.
Do not push these changes to `Ayailssar.github.io` or `aya-about`: those remain the
separate original website and source project.
