"use strict";

const photos = [
  { src: "assets/dance-stage.jpg", alt: "Me performing in a pole dance competition" },
  { src: "assets/dance-studio.jpg", alt: "Me practicing aerial silks in the studio" },
  { src: "assets/dance-flight.jpg", alt: "Me holding a pole dance pose" },
  { src: "assets/climbing-close.jpg", alt: "Me climbing a rock face" },
  { src: "assets/climbing-wall.jpg", alt: "Me climbing a tall rock wall" },
  { src: "assets/desert-climb.jpg", alt: "Me rock climbing in the desert" },
  { src: "assets/nepal.jpg", alt: "Me hiking among the snowy mountains of Nepal" },
  { src: "assets/together-mountains.jpg", alt: "My partner and me hiking in the mountains" },
  { src: "assets/together-dog.jpg", alt: "My partner, our dog, and me on a climbing trip" },
  { src: "assets/acro.jpg", alt: "Me practicing acroyoga with friends" },
  { src: "assets/drawing-01.jpg", alt: "One of my drawings" },
  { src: "assets/drawing-02.jpg", alt: "Another one of my drawings" }
];
const hobbies = [
  { name: "Dancing", phrase: "Dancing — getting out of my head.", note: "Finding a rhythm of my own.", photos: [0, 2] },
  { name: "Drawing", phrase: "Drawing — it starts with a line.", note: "A blank page. A little imagination.", photos: [10, 11] },
  { name: "Aerial silks", phrase: "Aerial silks — a little closer to the sky.", note: "Strength, softness, and a different perspective.", photos: [1] },
  { name: "Climbing", phrase: "Climbing — one more way up.", note: "A new problem. A new perspective.", photos: [3, 4, 5] },
  { name: "Traveling", phrase: "Traveling — taking the scenic route.", note: "New trails. Good company. Room to wander.", photos: [6, 7, 8] },
  { name: "Acroyoga", phrase: "Acroyoga — finding balance together.", note: "Trust, connection, and a little play.", photos: [9] }
];

const intro = document.getElementById("intro");
const site = document.getElementById("site");
const enter = document.getElementById("enter");
const replay = document.getElementById("replay");
const about = document.getElementById("about");
const photoScroll = document.getElementById("photo-scroll");
const photoFeed = document.getElementById("photo-feed");
const photoStatus = document.getElementById("photo-status");
const progressBar = document.getElementById("visual-progress");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktop = window.matchMedia("(min-width: 761px)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
let framePending = false;
let rightActive = false;
let restoreIntroFocus = false;
let enteringSite = false;

document.body.classList.add("intro-open");
site.inert = true;
enter.focus();

function openSite() {
  if (enteringSite) return;
  enteringSite = true;
  enter.disabled = true;
  if (reducedMotion.matches) {
    finishEnteringSite();
    return;
  }
  intro.classList.add("joining");
  window.setTimeout(() => {
    intro.classList.add("splitting");
    window.setTimeout(finishEnteringSite, 820);
  }, 620);
}

function finishEnteringSite() {
  intro.classList.add("dismissed");
  intro.inert = true;
  intro.setAttribute("aria-hidden", "true");
  site.inert = false;
  document.body.classList.remove("intro-open");
  if (!restoreIntroFocus) {
    sizeStory();
    const target = document.getElementById(window.location.hash.slice(1));
    navigateStory(target && about.contains(target) ? target : about, "instant");
  }
  (restoreIntroFocus ? replay : document.querySelector(".nav-about")).focus({ preventScroll: true });
  scheduleUpdate();
  if (!musicStarted) {
    musicStarted = true;
    playMusic();
  }
}
enter.addEventListener("click", openSite);
intro.addEventListener("keydown", (event) => {
  if (event.key === "Escape") openSite();
  if (event.key === "Tab") {
    event.preventDefault();
    enter.focus();
  }
});
replay.addEventListener("click", () => {
  restoreIntroFocus = true;
  site.inert = true;
  enteringSite = false;
  enter.disabled = false;
  intro.classList.add("resetting");
  intro.classList.remove("joining", "splitting");
  intro.inert = false;
  intro.removeAttribute("aria-hidden");
  intro.classList.remove("dismissed");
  document.body.classList.add("intro-open");
  window.requestAnimationFrame(() => intro.classList.remove("resetting"));
  enter.focus({ preventScroll: true });
});

const themeToggle = document.getElementById("theme-toggle");
function updateThemeLabel() {
  themeToggle.setAttribute("aria-label", document.documentElement.dataset.theme === "dark" ? "Switch to light colors" : "Switch to dark colors");
}
updateThemeLabel();
themeToggle.addEventListener("click", () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  updateThemeLabel();
});

const music = document.getElementById("background-music");
const musicToggle = document.getElementById("music-toggle");
const musicStatus = document.getElementById("music-status");
let musicStarted = false;
music.volume = 0.22;
function updateMusicControl() {
  const playing = !music.paused;
  musicToggle.setAttribute("aria-pressed", String(playing));
  musicToggle.setAttribute("aria-label", playing ? "Pause background music" : "Play background music");
  musicToggle.innerHTML = `${playing ? "SOUND ON" : "SOUND OFF"} <span aria-hidden="true">♪</span>`;
}
async function playMusic() {
  try {
    await music.play();
    musicStatus.textContent = "";
  } catch (error) {
    if (error.name === "AbortError" && music.paused) {
      updateMusicControl();
      return;
    }
    musicStatus.textContent = error.name === "NotAllowedError"
      ? "Select Sound On to start the background music."
      : "Background music could not play. Please try the sound button again.";
    console.error("Background music playback failed:", error);
    updateMusicControl();
  }
}
music.addEventListener("play", updateMusicControl);
music.addEventListener("pause", updateMusicControl);
music.addEventListener("error", () => {
  music.pause();
  musicStatus.textContent = "Background music is unavailable. Please reload and try again.";
  musicToggle.setAttribute("aria-label", musicStatus.textContent);
});
musicToggle.addEventListener("click", () => {
  musicStarted = true;
  if (music.paused) playMusic();
  else music.pause();
});

const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");
let lightboxIndex = 0;
let galleryTrigger = null;
function showLightboxPhoto(index) {
  lightboxIndex = (index + photos.length) % photos.length;
  const photo = photos[lightboxIndex];
  lightboxImage.src = photo.src;
  lightboxImage.alt = photo.alt;
  lightboxCaption.textContent = `${photo.alt} · ${lightboxIndex + 1} / ${photos.length}`;
}
function createPhotoButton(index) {
  const photo = photos[index];
  const button = document.createElement("button");
  button.className = "hobby-photo";
  button.setAttribute("aria-label", `Open photo: ${photo.alt}`);
  const image = new Image();
  image.src = photo.src;
  image.alt = photo.alt;
  image.loading = "lazy";
  image.decoding = "async";
  button.append(image);
  button.addEventListener("click", () => {
    galleryTrigger = button;
    showLightboxPhoto(index);
    lightbox.showModal();
    lightbox.append(cursor);
  });
  return button;
}

const svgNS = "http://www.w3.org/2000/svg";
function createHobbyScene(hobby, index, cycle) {
  const section = document.createElement("section");
  section.className = `hobby-scene scene-${index}`;
  section.setAttribute("aria-label", hobby.name);
  const heading = document.createElement("h2");
  heading.className = "sr-only";
  heading.textContent = hobby.phrase;
  const curve = document.createElementNS(svgNS, "svg");
  curve.classList.add("hobby-curve");
  curve.setAttribute("viewBox", "0 0 600 180");
  curve.setAttribute("preserveAspectRatio", "none");
  curve.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNS, "path");
  path.id = `hobby-path-${cycle}-${index}`;
  path.setAttribute("d", "M 0 90 C 100 35 200 35 300 90 S 500 145 600 90");
  path.setAttribute("fill", "none");
  const text = document.createElementNS(svgNS, "text");
  const textPath = document.createElementNS(svgNS, "textPath");
  textPath.setAttribute("href", `#${path.id}`);
  textPath.setAttribute("startOffset", "4%");
  textPath.setAttribute("textLength", "540");
  textPath.setAttribute("lengthAdjust", "spacingAndGlyphs");
  textPath.textContent = hobby.phrase;
  text.append(textPath);
  curve.append(path, text);
  const note = document.createElement("p");
  note.className = "hobby-note mono";
  note.textContent = `${String(index + 1).padStart(2, "0")} / ${hobby.note}`;
  section.append(heading, curve, note);
  hobby.photos.forEach((photoIndex) => section.append(createPhotoButton(photoIndex)));
  if (cycle !== 1) {
    section.setAttribute("aria-hidden", "true");
    section.querySelectorAll("button").forEach((button) => { button.tabIndex = -1; });
  }
  return section;
}
for (let cycle = 0; cycle < 3; cycle++) {
  const group = document.createElement("div");
  group.className = "gallery-cycle";
  hobbies.forEach((hobby, index) => group.append(createHobbyScene(hobby, index, cycle)));
  photoFeed.append(group);
}

let cycleWidth = 0;
let galleryTarget = null;
let galleryFrame = 0;
let pointerX = 0;
let pointerY = 0;
let motionX = 0;
let motionY = 0;
let motionSway = 0;
let gallerySpeed = 0;
const wrap = (value, length) => ((value % length) + length) % length;
function animateGallery() {
  galleryFrame = 0;
  const distance = galleryTarget === null ? 0 : galleryTarget - photoScroll.scrollLeft;
  if (Math.abs(distance) > 4) {
    const before = photoScroll.scrollLeft;
    photoScroll.scrollLeft += reducedMotion.matches ? distance : distance * 0.14;
    gallerySpeed = photoScroll.scrollLeft - before;
    wrapGallery();
  } else {
    if (galleryTarget !== null) photoScroll.scrollLeft = galleryTarget;
    wrapGallery();
    galleryTarget = null;
    gallerySpeed *= 0.8;
  }
  const targetX = reducedMotion.matches ? 0 : pointerX * 5;
  const targetY = reducedMotion.matches ? 0 : pointerY * 5;
  const targetSway = reducedMotion.matches ? 0 : clamp(gallerySpeed / 30, -1, 1) * 2;
  motionX += (targetX - motionX) * 0.1;
  motionY += (targetY - motionY) * 0.1;
  motionSway += (targetSway - motionSway) * 0.1;
  photoFeed.style.setProperty("--photo-x", `${motionX}px`);
  photoFeed.style.setProperty("--photo-y", `${motionY}px`);
  photoFeed.style.setProperty("--sway", `${motionSway}deg`);
  scheduleUpdate();
  if (galleryTarget !== null || Math.abs(targetX - motionX) + Math.abs(targetY - motionY) + Math.abs(targetSway - motionSway) + Math.abs(gallerySpeed) > 0.02) requestGalleryFrame();
}
function requestGalleryFrame() {
  if (!galleryFrame) galleryFrame = requestAnimationFrame(animateGallery);
}
function moveGallery(delta) {
  galleryTarget = (galleryTarget ?? photoScroll.scrollLeft) + delta;
  requestGalleryFrame();
}
photoScroll.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse") return;
  const rect = photoScroll.getBoundingClientRect();
  pointerX = (event.clientX - rect.left) / rect.width * 2 - 1;
  pointerY = (event.clientY - rect.top) / rect.height * 2 - 1;
  requestGalleryFrame();
});
photoScroll.addEventListener("pointerleave", () => {
  pointerX = pointerY = 0;
  requestGalleryFrame();
});
photoScroll.addEventListener("pointerdown", () => { galleryTarget = null; });
function sizeGallery() {
  const progress = cycleWidth ? wrap(photoScroll.scrollLeft, cycleWidth) / cycleWidth : 0;
  photoFeed.style.setProperty("--gallery-width", `${photoScroll.clientWidth}px`);
  cycleWidth = photoFeed.querySelector(".gallery-cycle").getBoundingClientRect().width;
  photoScroll.scrollLeft = cycleWidth * (1 + progress);
  galleryTarget = null;
  scheduleUpdate();
}
function wrapGallery() {
  if (!cycleWidth) return;
  const left = photoScroll.scrollLeft;
  // Identical neighboring cycles let us recenter without a visible jump.
  if (left < cycleWidth || left >= cycleWidth * 2) {
    photoScroll.scrollLeft = cycleWidth + wrap(left, cycleWidth);
    if (galleryTarget !== null) galleryTarget += photoScroll.scrollLeft - left;
  }
}
photoScroll.addEventListener("wheel", (event) => {
  if (event.ctrlKey) return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? photoScroll.clientWidth : 1;
  moveGallery(clamp(delta * unit, -photoScroll.clientWidth, photoScroll.clientWidth));
}, { passive: false });
photoScroll.addEventListener("keydown", (event) => {
  if (event.target !== photoScroll) return;
  const forward = ["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key);
  const backward = ["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key);
  if (!forward && !backward) return;
  event.preventDefault();
  const direction = backward || (event.key === " " && event.shiftKey) ? -1 : 1;
  moveGallery(direction * photoScroll.clientWidth * (event.key.startsWith("Arrow") ? 0.15 : 0.85));
});
photoScroll.addEventListener("scroll", wrapGallery, { passive: true });
new ResizeObserver(sizeGallery).observe(photoScroll);

// Keep words intact when wrapping; color each letter in visual reading order.
document.querySelectorAll(".ink").forEach((block) => {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part || /^\s+$/.test(part)) {
        fragment.append(document.createTextNode(part));
        return;
      }
      const word = document.createElement("span");
      word.className = "ink-word";
      for (const character of part) {
        const letter = document.createElement("span");
        letter.className = "ink-letter";
        letter.textContent = character;
        word.append(letter);
      }
      fragment.append(word);
    });
    node.replaceWith(fragment);
  });
});
const letters = [...document.querySelectorAll(".ink-letter")];
const storyContent = document.querySelector(".about-content");
const storyPanel = document.querySelector(".story-panel");
const climbFigure = document.getElementById("climb-figure");
const climbDivider = document.querySelector(".climb-divider");
const cliffWall = document.getElementById("cliff-wall");
const climbCanvas = document.getElementById("climber");
const climbPoster = document.getElementById("climber-poster");
const climbStatus = document.getElementById("climb-status");
const climbContext = climbCanvas.getContext("2d");
const climbMedia = {
  src: "assets/climber-atlas.webp?v=cliff-2",
  frameWidth: 232,
  frameHeight: 312,
  columns: 12,
  rows: 10,
  frames: 120
};
const climbAtlas = new Image();
const climbGeometry = window.ayaClimbGeometry;
let atlasReady = false;
let cliffReady = false;
let renderedClimbFrame = -1;
let storyMaximum = 0;
let storySized = false;

function reportClimbError(message) {
  climbStatus.textContent = message;
  console.error(message);
}
function validClimbAnchor(anchor) {
  return anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) &&
    anchor.x >= 0 && anchor.x < climbMedia.frameWidth &&
    anchor.y >= 0 && anchor.y < climbMedia.frameHeight;
}
const geometryReady = Boolean(climbGeometry &&
  Array.isArray(climbGeometry.rightEdge) && climbGeometry.rightEdge.length >= 2 &&
  climbGeometry.rightEdge.every(value => Number.isFinite(value) && value > 0 && value < 1) &&
  validClimbAnchor({ x: climbGeometry.anchorX, y: climbGeometry.anchorY }) &&
  (!climbGeometry.anchors || (Array.isArray(climbGeometry.anchors) &&
    climbGeometry.anchors.length === climbMedia.frames && climbGeometry.anchors.every(validClimbAnchor))));
if (!geometryReady) {
  reportClimbError("The climbing path could not load. Showing a stationary pose.");
}
cliffWall.addEventListener("load", () => {
  cliffReady = true;
  scheduleUpdate();
});
cliffWall.addEventListener("error", () => {
  cliffReady = false;
  reportClimbError("The cliff illustration could not load. Please reload.");
  scheduleUpdate();
});
if (cliffWall.complete) {
  cliffReady = cliffWall.naturalWidth > 0;
  if (!cliffReady) reportClimbError("The cliff illustration could not load. Please reload.");
}
climbPoster.addEventListener("error", () => {
  reportClimbError("The climbing illustration could not load. Please reload.");
});
climbAtlas.addEventListener("load", () => {
  if (climbAtlas.naturalWidth !== climbMedia.frameWidth * climbMedia.columns ||
      climbAtlas.naturalHeight !== climbMedia.frameHeight * climbMedia.rows) {
    reportClimbError("The climbing animation has an unexpected size. Please rebuild its frames.");
    return;
  }
  atlasReady = true;
  climbPoster.hidden = true;
  climbCanvas.hidden = false;
  scheduleUpdate();
});
climbAtlas.addEventListener("error", () => {
  reportClimbError("The climbing animation could not load. Showing its still image.");
});
if (climbContext) {
  climbAtlas.src = climbMedia.src;
} else {
  reportClimbError("This browser cannot display the climbing animation. Showing its still image.");
}

function storyScrollLimit() {
  return Math.max(0, about.scrollHeight - about.clientHeight);
}
function sizeStory() {
  const progress = storySized && storyMaximum ? clamp(1 - about.scrollTop / storyMaximum) : 0;
  about.style.setProperty("--story-viewport", `${about.clientHeight}px`);
  const maximum = storyScrollLimit();
  if (!storySized || maximum !== storyMaximum) {
    about.scrollTo({ top: (1 - progress) * maximum, behavior: "instant" });
  }
  storyMaximum = maximum;
  storySized = true;
  needsMeasure = true;
  scheduleUpdate();
}
function navigateStory(target, behavior) {
  const top = target === about || target.id === "start"
    ? storyScrollLimit()
    : target.getBoundingClientRect().bottom - about.getBoundingClientRect().top +
      about.scrollTop - about.clientHeight + 24;
  about.scrollTo({ top: clamp(top, 0, storyScrollLimit()), behavior });
  rightActive = true;
  scheduleUpdate();
}
function updateClimber() {
  const progress = storyMaximum ? clamp(1 - about.scrollTop / storyMaximum) : 0;
  const moving = geometryReady && cliffReady && !reducedMotion.matches;
  const travel = Math.max(0, climbDivider.clientHeight - climbFigure.offsetHeight - 48);
  const y = 24 + (moving ? (1 - progress) * travel : travel / 2);
  const frame = moving ? Math.round(progress * (climbMedia.frames - 1)) : 0;
  let figureX = 0;
  if (geometryReady) {
    const anchor = climbGeometry.anchors?.[frame] ??
      { x: climbGeometry.anchorX, y: climbGeometry.anchorY };
    const scale = climbFigure.clientWidth / climbMedia.frameWidth;
    const wallPosition = clamp((y + anchor.y * scale) / cliffWall.clientHeight);
    const sample = wallPosition * (climbGeometry.rightEdge.length - 1);
    const index = Math.floor(sample);
    const start = climbGeometry.rightEdge[index];
    const end = climbGeometry.rightEdge[Math.min(index + 1, climbGeometry.rightEdge.length - 1)];
    const edge = (start + (end - start) * (sample - index)) * cliffWall.clientWidth;
    figureX = edge - anchor.x * scale - 3;
  }
  climbFigure.style.transform = `translate3d(${figureX}px, ${y}px, 0)`;
  climbFigure.dataset.progress = progress.toFixed(5);
  climbFigure.dataset.frame = String(frame);
  if (!atlasReady || frame === renderedClimbFrame) return;
  const x = frame % climbMedia.columns * climbMedia.frameWidth;
  const row = Math.floor(frame / climbMedia.columns) * climbMedia.frameHeight;
  climbContext.clearRect(0, 0, climbCanvas.width, climbCanvas.height);
  climbContext.drawImage(climbAtlas, x, row, climbMedia.frameWidth, climbMedia.frameHeight,
    0, 0, climbCanvas.width, climbCanvas.height);
  renderedClimbFrame = frame;
}

let readingLines = [];
function measureLines() {
  const panelTop = about.getBoundingClientRect().top;
  const scrollTop = about.scrollTop;
  readingLines = [];
  letters.forEach((letter) => {
    const rect = letter.getBoundingClientRect();
    const top = rect.top - panelTop + scrollTop;
    let line = readingLines[readingLines.length - 1];
    if (!line || Math.abs(line.top - top) > 3) {
      line = { top, height: rect.height, letters: [] };
      readingLines.push(line);
    }
    line.letters.push(letter);
  });
  readingLines.sort((a, b) => b.top - a.top);
}
let needsMeasure = true;
function updateScroll() {
  framePending = false;
  if (needsMeasure) {
    measureLines();
    needsMeasure = false;
  }
  const progress = cycleWidth ? wrap(photoScroll.scrollLeft, cycleWidth) / cycleWidth : 0;
  progressBar.style.transform = `scaleX(${progress})`;
  const leftRect = photoScroll.getBoundingClientRect();
  document.querySelectorAll(".hobby-scene").forEach((scene) => {
    const rect = scene.getBoundingClientRect();
    if (rect.right < leftRect.left - 100 || rect.left > leftRect.right + 100) return;
    const phase = (rect.left - leftRect.left) / rect.width * Math.PI * 2;
    scene.style.setProperty("--wave-y", reducedMotion.matches ? "0px" : `${Math.sin(phase) * Math.min(32, leftRect.height * 0.045)}px`);
    scene.classList.toggle("in-view", rect.left < leftRect.right - 30 && rect.right > leftRect.left);
    const textPath = scene.querySelector("textPath");
    textPath.setAttribute("startOffset", reducedMotion.matches ? "4%" : `${4 + Math.sin(phase) * 1.5}%`);
  });
  if (photoStatus.getAttribute("role") !== "alert") {
    photoStatus.textContent = "SCROLL TO WANDER ↔";
  }

  updateClimber();
  if (!rightActive && finePointer.matches) return;
  const readingPosition = about.scrollTop + about.clientHeight * 0.48;
  const atEnd = about.scrollTop <= 2;
  readingLines.forEach((line, index) => {
    const nextLine = readingLines[index + 1];
    const duration = nextLine
      ? Math.max(1, Math.min(line.top - nextLine.top, line.height * 2.4))
      : Math.max(line.height * 2.4, 40);
    const progress = atEnd ? 1 : clamp((line.top + line.height - readingPosition) / duration);
    const count = Math.floor(progress * line.letters.length);
    line.letters.forEach((letter, index) => letter.classList.toggle("is-read", index < count));
  });
}
function scheduleUpdate() {
  if (framePending) return;
  framePending = true;
  window.requestAnimationFrame(updateScroll);
}
about.addEventListener("pointerenter", () => { rightActive = true; scheduleUpdate(); });
about.addEventListener("pointerleave", () => { rightActive = false; });
about.addEventListener("focusin", () => { rightActive = true; scheduleUpdate(); });
about.addEventListener("focusout", (event) => {
  if (!about.contains(event.relatedTarget) && !about.matches(":hover")) rightActive = false;
});
about.addEventListener("touchstart", () => { rightActive = true; }, { passive: true });
about.addEventListener("scroll", scheduleUpdate, { passive: true });
storyPanel.addEventListener("wheel", (event) => {
  if (event.ctrlKey || about.contains(event.target) || !event.deltaY) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? about.clientHeight : 1;
  about.scrollBy({ top: event.deltaY * unit, behavior: "instant" });
  rightActive = true;
  scheduleUpdate();
}, { passive: false });
photoScroll.addEventListener("scroll", scheduleUpdate, { passive: true });
window.addEventListener("scroll", scheduleUpdate, { passive: true });
window.addEventListener("resize", () => { needsMeasure = true; scheduleUpdate(); });
window.addEventListener("load", () => { needsMeasure = true; scheduleUpdate(); });
reducedMotion.addEventListener("change", scheduleUpdate);
desktop.addEventListener("change", () => { needsMeasure = true; scheduleUpdate(); });

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.hash);
    if (!target) return;
    event.preventDefault();
    const behavior = reducedMotion.matches ? "instant" : "smooth";
    navigateStory(target, behavior);
  });
});
const cursor = document.getElementById("square-cursor");
document.addEventListener("pointermove", (event) => {
  if (!finePointer.matches || event.pointerType !== "mouse") return;
  cursor.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
  cursor.classList.add("visible");
  cursor.classList.toggle("over-link", Boolean(event.target.closest("a,button")));
});
document.documentElement.addEventListener("pointerleave", () => cursor.classList.remove("visible"));
window.addEventListener("blur", () => cursor.classList.remove("visible"));

document.getElementById("close-lightbox").addEventListener("click", () => lightbox.close());
document.getElementById("previous-photo").addEventListener("click", () => showLightboxPhoto(lightboxIndex - 1));
document.getElementById("next-photo").addEventListener("click", () => showLightboxPhoto(lightboxIndex + 1));
lightbox.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    showLightboxPhoto(lightboxIndex + (event.key === "ArrowLeft" ? -1 : 1));
  }
});
lightbox.addEventListener("click", (event) => {
  if (event.target !== lightbox) return;
  const rect = lightbox.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) lightbox.close();
});
lightbox.addEventListener("close", () => {
  document.body.append(cursor);
  galleryTrigger?.focus({ preventScroll: true });
});
document.querySelectorAll(".hobby-photo img, .profile-photo img, #lightbox-image").forEach((image) => {
  image.addEventListener("error", () => {
    photoStatus.textContent = "Photo unavailable. Check the assets folder.";
    photoStatus.setAttribute("role", "alert");
  });
});
const storyResizeObserver = new ResizeObserver(sizeStory);
storyResizeObserver.observe(about);
storyResizeObserver.observe(storyContent);
sizeStory();
scheduleUpdate();
