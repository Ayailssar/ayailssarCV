(async () => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const until = async (condition, message) => {
    const deadline = performance.now() + 2000;
    while (!condition()) {
      if (performance.now() > deadline) throw new Error(message);
      await frame();
    }
  };
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
  const checkedBodies = new Set();
  const bodyExtents = new Map();
  const source = wall.currentSrc;
  check(geometry.playback.frames === 300 && geometry.playback.fps === 30, "The original full video is not configured.");
  const distances = new Set(Array.from({ length: 21 }, (_, index) => Math.round(index / 20 * maximum)));
  const jobs = [...document.querySelectorAll(".experience-list article")];
  check(jobs.map(job => job.dataset.startYear).join(",") === "2017,2020,2021,2022,2024,2025", "Career chronology is wrong.");
  check(jobs.every((job, index) => index === 0 || job.getBoundingClientRect().top < jobs[index - 1].getBoundingClientRect().top),
    "Later roles must appear above earlier roles.");
  try {
    for (const distance of [...distances].sort((a, b) => a - b)) {
      const progress = distance / maximum;
      about.scrollTo({ top: maximum - distance, behavior: "instant" });
      await frame();
      await until(() => Math.abs(Number(figure.dataset.progress) - (1 - about.scrollTop / maximum)) < 0.00002,
        "The rendered ascent did not catch up with the scroll position.");
      const currentWall = wall.getBoundingClientRect();
      for (const key of ["top", "left", "width", "height"]) {
        check(Math.abs(currentWall[key] - wallBounds[key]) < 0.1, `The cliff moved or resized at ${progress}.`);
      }
      check(wall.currentSrc === source, "The rock texture changed while scrolling.");
      check(gallery.scrollLeft === initialGallery, "CV scrolling changed the left gallery.");
      check(Number(figure.dataset.frame) >= 0 && Number(figure.dataset.frame) < 300, "The current native frame is invalid.");
      if (reduced) check(Number(figure.dataset.frame) === 0, "Reduced motion is not a still frame.");
      const anchor = geometry.anchors[Number(figure.dataset.frame)];
      const bounds = figure.getBoundingClientRect();
      const scale = bounds.width / climber.width;
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
      const pose = Number(figure.dataset.frame);
      if (!checkedBodies.has(pose)) {
        const rgba = climber.getContext("2d").getImageData(0, 0, climber.width, climber.height).data;
        const solid = new Uint8Array(climber.width * climber.height);
        let total = 0, first = -1;
        const extent = { left: climber.width, right: 0, top: climber.height, bottom: 0 };
        for (let index = 0; index < solid.length; index++) {
          if (rgba[index * 4 + 3] < 128) continue;
          solid[index] = 1;
          total++;
          if (first < 0) first = index;
          const x = index % climber.width, y = Math.floor(index / climber.width);
          extent.left = Math.min(extent.left, x);
          extent.right = Math.max(extent.right, x + 1);
          extent.top = Math.min(extent.top, y);
          extent.bottom = Math.max(extent.bottom, y + 1);
          check(x >= 4 && x < climber.width - 4 && y >= 4 && y < climber.height - 4, "A body part touches the sprite crop.");
          check(bounds.top + y * scale >= storyBounds.top && bounds.top + (y + 1) * scale <= storyBounds.bottom,
            "The rendered figure is cut by the panel edge.");
        }
        check(total > 0, "The climbing pose is empty.");
        const visited = new Uint8Array(solid.length);
        const pending = [first];
        visited[first] = 1;
        let connected = 0;
        while (pending.length) {
          const current = pending.pop(), x = current % climber.width, y = Math.floor(current / climber.width);
          connected++;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= climber.width || ny < 0 || ny >= climber.height) continue;
            const index = ny * climber.width + nx;
            if (solid[index] && !visited[index]) { visited[index] = 1; pending.push(index); }
          }
        }
        check(connected / total >= 0.995, "A displayed pose has a disconnected body part.");
        checkedBodies.add(pose);
        bodyExtents.set(pose, extent);
      }
      const body = bodyExtents.get(pose);
      check(bounds.top + body.top * scale >= storyBounds.top && bounds.top + body.bottom * scale <= storyBounds.bottom,
        "The complete silhouette left the panel.");
      check(bounds.left + body.left * scale >= 0 && bounds.left + body.right * scale <= innerWidth,
        "The complete silhouette left the screen.");
      results.push({ progress, frame: Number(figure.dataset.frame), cycle: Number(figure.dataset.cycle),
        top: bounds.top + geometry.headY[Number(figure.dataset.frame)] * scale, left: bounds.left });
    }
    if (reduced) {
      check(results.every(result => Math.abs(result.top - results[0].top) < 0.1), "Reduced motion still moves the character.");
    } else {
      check(results.every((result, index) => index === 0 || result.top < results[index - 1].top), "The character did not climb upward.");
      check(figure.dataset.started === "true", "The first CV scroll did not start the full video.");
    }
    check(document.documentElement.scrollWidth <= innerWidth, "The page overflows horizontally.");
    check(!document.getElementById("climb-status").textContent, "A climbing media error was reported.");
    const bio = document.getElementById("bio-copy"), stage = document.getElementById("bio-stage");
    const bioLetters = [...bio.querySelectorAll(".ink-letter")];
    const otherLetters = [...document.querySelectorAll(".ink-letter")].filter(letter => !bio.contains(letter));
    const paragraphs = [...bio.querySelectorAll(".bio-paragraph")];
    check(paragraphs.length === 3 && paragraphs.every((paragraph, index) => !index ||
      paragraph.getBoundingClientRect().top > paragraphs[index - 1].getBoundingClientRect().top),
    "The biography paragraphs are not written top to bottom.");
    const travel = parseFloat(stage.style.getPropertyValue("--bio-travel"));
    const pinTop = about.clientHeight - parseFloat(bio.style.getPropertyValue("--bio-bottom")) - bio.getBoundingClientRect().height;
    const bioStart = stage.getBoundingClientRect().top - about.getBoundingClientRect().top + about.scrollTop + travel - pinTop;
    about.focus({ preventScroll: true });
    for (const fraction of [0, 0.2, 0.4, 0.6, 0.8, 1.01]) {
      about.scrollTo({ top: bioStart - travel * fraction, behavior: "instant" });
      await frame();
      await until(() => Math.abs(Number(stage.dataset.readProgress) - Math.min(1, fraction)) < 0.001,
        "Biography highlighting did not catch up with its reading position.");
      const count = bioLetters.filter(letter => letter.classList.contains("is-read")).length;
      check(bioLetters.every((letter, index) => letter.classList.contains("is-read") === (index < count)),
        "Biography letters do not color in top-down reading order.");
      if (count < bioLetters.length) {
        check(otherLetters.every(letter => !letter.classList.contains("is-read")), "Later categories started coloring too soon.");
        check(Math.abs(bio.getBoundingClientRect().top - about.getBoundingClientRect().top - pinTop) < 2,
          "The biography did not stay visible while coloring.");
      }
      const current = bioLetters[Math.min(count, bioLetters.length - 1)].getBoundingClientRect();
      const card = bio.getBoundingClientRect();
      check(current.top >= card.top - 2 && current.bottom <= card.bottom + 2, "The current biography line is clipped.");
    }
    check(bioLetters.every(letter => letter.classList.contains("is-read")) && about.dataset.readDirection === "bottom-up",
      "Reading did not return to bottom-up after all biography letters were colored.");
    about.scrollTo({ top: 0, behavior: "instant" });
    await frame();
    check(otherLetters.every(letter => letter.classList.contains("is-read")), "The remaining categories never finished coloring.");
    const phone = document.querySelector('#contact a[href="tel:+972525919726"]');
    check(phone?.textContent.includes("052-5919726"), "The requested dial link is missing.");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let minimumFont = Infinity;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const element = node.parentElement;
      const style = getComputedStyle(element);
      if (["SCRIPT", "STYLE"].includes(element.tagName) || style.display === "none" || style.visibility !== "visible" ||
          !element.getClientRects().length) continue;
      const size = parseFloat(style.fontSize);
      minimumFont = Math.min(minimumFont, size);
      check(size >= 10, `Text is smaller than 10px: ${node.textContent.trim().slice(0, 40)}`);
    }
    check(parseFloat(getComputedStyle(document.querySelector(".story-cue > span:first-child")).fontSize) >= 44,
      "The upward-scroll arrow is too small.");
    check(parseFloat(getComputedStyle(document.querySelector(".scroll-arrow")).fontSize) >= 38,
      "The sideways-scroll arrow is too small.");
    return {
      fullHeightStaticCliff: true, suppliedAspectRatioPreserved: true, continuousPhysicalContact: true,
      straightSeamHidden: true, upwardCareerChronology: true, reducedMotion: reduced,
      completePoseCount: checkedBodies.size, topDownBiographyThenBottomUp: true, phoneLink: true,
      minimumFontPixels: minimumFont, enlargedDirectionArrows: true,
      checkedPositions: results.length, completedCycles: results.at(-1).cycle,
      sampledPoses: [results[0], results[Math.floor(results.length / 2)], results.at(-1)]
    };
  } finally {
    about.scrollTo({ top: initialScroll, behavior: "instant" });
    await frame();
  }
})()
