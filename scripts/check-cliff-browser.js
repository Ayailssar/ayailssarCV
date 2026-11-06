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
  check(Math.abs(wallBounds.width / wallBounds.height - wall.naturalWidth / wall.naturalHeight) < 0.0001,
    "The supplied cliff is stretched out of proportion.");
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
    const site = document.getElementById("site");
    const bridge = getComputedStyle(site, "::before");
    const bridgeLeft = site.getBoundingClientRect().left + parseFloat(bridge.left);
    check(bridge.content !== "none" && bridge.backgroundColor === getComputedStyle(document.querySelector(".story-panel")).backgroundColor,
      "The old straight gutter is still visible.");
    check(bridgeLeft <= document.querySelector(".visual-panel").getBoundingClientRect().right &&
      bridgeLeft + parseFloat(bridge.width) >= storyBounds.left, "The background bridge misses the old gutter.");
  }
  geometry.rightEdge.forEach((value, index) => {
    const y = Math.round(index / (geometry.rightEdge.length - 1) * (texture.height - 1));
    let right = texture.width - 1;
    while (right > 0 && alpha(right, y) <= 200) right--;
    check(Math.abs(value * texture.width - right) <= 4, `The contact contour misses the actual rock at sample ${index}.`);
  });

  const results = [];
  const source = wall.currentSrc;
  const loop = geometry.loop;
  const distances = new Set(Array.from({ length: 81 }, (_, index) => Math.round(index / 80 * maximum)));
  for (let index = 0; index < loop.end - loop.start; index++) {
    distances.add(Math.min(maximum, Math.round((index + 0.5) / (loop.end - loop.start) * loop.pixelsPerCycle)));
  }
  for (let distance = loop.pixelsPerCycle; distance < maximum; distance += loop.pixelsPerCycle) {
    distances.add(distance - 1);
    distances.add(distance);
    distances.add(Math.min(maximum, distance + 1));
  }
  const jobs = [...document.querySelectorAll(".experience-list article")];
  check(jobs.map(job => job.dataset.startYear).join(",") === "2017,2020,2021,2022,2024,2025", "Career chronology is wrong.");
  check(jobs.every((job, index) => index === 0 || job.getBoundingClientRect().top < jobs[index - 1].getBoundingClientRect().top),
    "Later roles must appear above earlier roles.");
  try {
    for (const distance of [...distances].sort((a, b) => a - b)) {
      const progress = distance / maximum;
      about.scrollTo({ top: maximum - distance, behavior: "instant" });
      await frame();
      const currentWall = wall.getBoundingClientRect();
      for (const key of ["top", "left", "width", "height"]) {
        check(Math.abs(currentWall[key] - wallBounds[key]) < 0.1, `The cliff moved or resized at ${progress}.`);
      }
      check(wall.currentSrc === source, "The rock texture changed while scrolling.");
      check(gallery.scrollLeft === initialGallery, "CV scrolling changed the left gallery.");
      const actualDistance = maximum - about.scrollTop;
      const expected = loop.start + (reduced ? 0 : Math.floor((actualDistance / loop.pixelsPerCycle % 1) * (loop.end - loop.start)));
      check(Number(figure.dataset.frame) === expected, "The character stopped looping through the scroll.");
      const anchor = geometry.anchors[Number(figure.dataset.frame)];
      const bounds = figure.getBoundingClientRect();
      const scale = bounds.width / 232;
      const contactY = bounds.top + anchor.y * scale;
      const sample = Math.max(0, Math.min(1, (contactY - wallBounds.top) / wallBounds.height)) * (geometry.rightEdge.length - 1);
      const lower = Math.floor(sample);
      const upper = Math.min(lower + 1, geometry.rightEdge.length - 1);
      const edge = geometry.rightEdge[lower] + (geometry.rightEdge[upper] - geometry.rightEdge[lower]) * (sample - lower);
      const hand = bounds.left + anchor.x * scale;
      check(Math.abs(hand - (wallBounds.left + edge * wallBounds.width - geometry.contactInset * scale)) <= 2,
        "The character lost contact with the rock.");
      const rockX = Math.round((hand - wallBounds.left) / wallBounds.width * texture.width);
      const rockY = Math.round((contactY - wallBounds.top) / wallBounds.height * texture.height);
      check(rockX >= 0 && rockX < texture.width && rockY >= 0 && rockY < texture.height && alpha(rockX, rockY) > 200,
        "The hand's contact point is outside the visible cliff.");
      check(climber.getContext("2d").getImageData(anchor.x, anchor.y, 1, 1).data[3] >= 240,
        "The contact anchor is not on the visible climber.");
      results.push({ progress, frame: Number(figure.dataset.frame), cycle: Number(figure.dataset.cycle), top: bounds.top, left: bounds.left });
    }
    if (reduced) {
      check(results.every(result => Math.abs(result.top - results[0].top) < 0.1), "Reduced motion still moves the character.");
    } else {
      check(results.every((result, index) => index === 0 || result.top < results[index - 1].top), "The character did not climb upward.");
      check(results.at(-1).cycle >= 2, "The gait did not repeat through the CV.");
      check(new Set(results.filter(result => result.progress >= 0.9).map(result => result.frame)).size >= 3,
        "The character froze before the end of the scroll.");
    }
    check(document.documentElement.scrollWidth <= innerWidth, "The page overflows horizontally.");
    check(!document.getElementById("climb-status").textContent, "A climbing media error was reported.");
    return {
      fullHeightStaticCliff: true, suppliedAspectRatioPreserved: true, continuousPhysicalContact: true,
      straightSeamHidden: true, upwardCareerChronology: true, reducedMotion: reduced,
      checkedPositions: results.length, completedCycles: results.at(-1).cycle,
      sampledPoses: [results[0], results[Math.floor(results.length / 2)], results.at(-1)]
    };
  } finally {
    about.scrollTo({ top: initialScroll, behavior: "instant" });
    await frame();
  }
})()
