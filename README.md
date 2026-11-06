# Aya Ilssar — A little higher

An independent CV website that begins at the bottom and follows an upward climb.
The original site at https://ayailssar.github.io/ is not changed by this project.

**New website:** https://ayailssar.github.io/ayailssarCV/

**Repository:** https://github.com/Ayailssar/ayailssarCV

## Experience

- The right panel starts at its bottom title. Scroll upward through About,
  Software & Tools, Experience, and contact details.
- A continuous, full-height cliff with curved edges forms the divider. Its rock
  texture is assembled from the supplied video and stays completely still.
- The character is a separate transparent layer. Only her pose and position change
  with the right panel's scroll; her wall contact follows the cliff's curved edge.
  Scrolling back reverses the climb, and stopping freezes her. Neither layer is an
  autoplaying video.
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
the actual rendered wall at five scroll positions: full height, covered panel
seam, unchanged wall position, curved contact alignment, and independent gallery.
It can be run with a browser evaluation tool, including
`agent-browser eval --stdin < scripts/check-cliff-browser.js`.

Download **`dist/index.html`** for one-file offline use. The root `index.html` needs
its adjacent CSS, JS, and assets. The standalone file is large because it embeds
the entire one-hour soundtrack; GitHub may require downloading rather than previewing it.

## Climbing media

The character-only transparent sprite atlas has 120 frames, sampled at 12 fps from
the ten-second reference video. Frames are 232 × 312 pixels in a 12-column, 10-row
atlas. The supporting rock is not part of the animated frames.

`cliff-wall.webp` is a separate static rock panorama, filling the divider from top
to bottom with organic, rounded contours. `cliff-geometry.js` contains its sampled
right edge and the character's contact anchor. This geometry is included directly
in the standalone HTML too, so no runtime fetch or canvas pixel-reading permission
is needed to position the character against the cliff.

To regenerate it locally, install Python 3 and FFmpeg, then run:

```sh
python3 -m pip install Pillow numpy opencv-python onnxruntime
python3 scripts/prepare-climber.py "/path/to/reference-video.mp4"
npm test
```

The helper is calibrated to the supplied 464 × 624, ten-second clip. It uses
locally executed MobileSAM segmentation with tracked anatomical prompts to
separate the character, and rock-only feature alignment to assemble the cliff.
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
