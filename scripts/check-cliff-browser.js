(async () => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const about = document.getElementById("about");
  const wall = document.getElementById("cliff-wall");
  const figure = document.getElementById("climb-figure");
  const climber = document.getElementById("climber");
  const gallery = document.getElementById("photo-scroll");
  const geometry = window.ayaClimbGeometry;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const maximum = about.scrollHeight - about.clientHeight;
  const initialScroll = about.scrollTop;
  const initialGallery = gallery.scrollLeft;
  check(Math.abs(initialScroll - maximum) <= 2, "The CV must open at its bottom title.");
  check(geometry && !climber.hidden, "Climbing media and geometry must finish loading.");
  await wall.decode();

  const wallBounds = wall.getBoundingClientRect();
  const storyBounds = document.querySelector(".story-panel").getBoundingClientRect();
  check(Math.abs(wallBounds.height - storyBounds.height) < 1, "The cliff does not fill the panel's height.");
  check(Math.abs(wallBounds.top - storyBounds.top) < 1, "The cliff does not begin at the top.");
  check(getComputedStyle(wall).transform === "none", "The cliff has a transform.");
  check(getComputedStyle(wall).animationName === "none", "The cliff has an animation.");
  check(Math.max(...geometry.rightEdge) - Math.min(...geometry.rightEdge) > 0.08, "The cliff edge is too straight.");

  const texture = document.createElement("canvas");
  texture.width = wall.naturalWidth;
  texture.height = wall.naturalHeight;
  const context = texture.getContext("2d", { willReadFrequently: true });
  context.drawImage(wall, 0, 0);
  const pixels = context.getImageData(0, 0, texture.width, texture.height).data;
  const alpha = (x, y) => pixels[(y * texture.width + x) * 4 + 3];
  for (let y = 0; y < texture.height; y++) {
    check(alpha(Math.floor(texture.width / 2), y) > 240, `The cliff has a central hole at row ${y}.`);
  }
  if (matchMedia("(min-width: 761px)").matches) {
    check(Math.abs(wallBounds.height - document.getElementById("site").getBoundingClientRect().height) < 1,
      "The cliff grew beyond the viewport-height layout.");
    check(document.documentElement.scrollHeight <= innerHeight + 1, "The desktop layout escaped its fixed-height panels.");
    const seamEdges = [document.querySelector(".visual-panel").getBoundingClientRect().right + 0.5, storyBounds.left - 0.5];
    for (const seam of seamEdges) {
      const x = Math.round((seam - wallBounds.left) / wallBounds.width * texture.width);
      check(x >= 0 && x < texture.width, "The cliff does not cover the old panel separator.");
      for (let y = 0; y < texture.height; y++) {
        check(alpha(x, y) > 240, `The straight separator shows through at row ${y}.`);
      }
    }
  }
  geometry.rightEdge.forEach((value, index) => {
    const y = Math.round(index / (geometry.rightEdge.length - 1) * (texture.height - 1));
    let right = texture.width - 1;
    while (right > 0 && alpha(right, y) <= 200) right--;
    check(Math.abs(value * texture.width - right) <= 4, `The contact contour misses the actual rock at sample ${index}.`);
  });

  const results = [];
  const source = wall.currentSrc;
  try {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      about.scrollTo({ top: (1 - progress) * maximum, behavior: "instant" });
      await frame();
      const currentWall = wall.getBoundingClientRect();
      for (const key of ["top", "left", "width", "height"]) {
        check(Math.abs(currentWall[key] - wallBounds[key]) < 0.1, `The cliff moved or resized at ${progress}.`);
      }
      check(wall.currentSrc === source, "The rock texture changed while scrolling.");
      check(gallery.scrollLeft === initialGallery, "CV scrolling changed the left gallery.");
      const expected = reduced ? 0 : Math.round(progress * 119);
      check(Math.abs(Number(figure.dataset.frame) - expected) <= 1, "The character pose does not follow the scroll.");
      const anchor = geometry.anchors?.[Number(figure.dataset.frame)] ??
        { x: geometry.anchorX, y: geometry.anchorY };
      const bounds = figure.getBoundingClientRect();
      const scale = bounds.width / 232;
      const contactY = bounds.top + anchor.y * scale;
      const sample = Math.max(0, Math.min(1, (contactY - wallBounds.top) / wallBounds.height)) * (geometry.rightEdge.length - 1);
      const lower = Math.floor(sample);
      const upper = Math.min(lower + 1, geometry.rightEdge.length - 1);
      const edge = geometry.rightEdge[lower] + (geometry.rightEdge[upper] - geometry.rightEdge[lower]) * (sample - lower);
      const hand = bounds.left + anchor.x * scale;
      check(Math.abs(hand - (wallBounds.left + edge * wallBounds.width)) <= 5, "The character lost contact with the curved rock.");
      results.push({ progress, frame: Number(figure.dataset.frame), top: bounds.top, left: bounds.left });
    }
    if (reduced) {
      check(results.every(result => Math.abs(result.top - results[0].top) < 0.1), "Reduced motion still moves the character.");
    } else {
      check(results.every((result, index) => index === 0 || result.top < results[index - 1].top), "The character did not climb upward.");
    }
    check(document.documentElement.scrollWidth <= innerWidth, "The page overflows horizontally.");
    check(!document.getElementById("climb-status").textContent, "A climbing media error was reported.");
    return { fullHeightStaticCliff: true, curvedSeparator: true, oldSeamCovered: true, reducedMotion: reduced, poses: results };
  } finally {
    about.scrollTo({ top: initialScroll, behavior: "instant" });
    await frame();
  }
})()
