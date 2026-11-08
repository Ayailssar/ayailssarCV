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
const bioStage = document.getElementById("bio-stage");
const bioCopy = document.getElementById("bio-copy");
const bioLetters = [...bioCopy.querySelectorAll(".ink-letter")];
const letters = [...document.querySelectorAll(".ink-letter")].filter(letter => !bioCopy.contains(letter));
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
  pages: [
    { src: "assets/climber-00.webp?v=scrub-7" },
    { src: "assets/climber-01.webp?v=scrub-7" },
    { src: "assets/climber-02.webp?v=scrub-7" }
  ],
  frameWidth: 256,
  frameHeight: 352,
  columns: 10,
  rows: 10,
  framesPerPage: 100,
  frames: 300,
  fps: 30
};
const climbImages = [];
const climbGeometry = window.ayaClimbGeometry;
let atlasReady = false;
let loadedClimbPages = 0;
let cliffReady = false;
let renderedClimbKey = "";
let climbFrameRequest = 0;
let storyScrollTarget = null;
let storyScrollFrame = 0;
let storyScrollTime = 0;
let lastRenderedDistance = 0;
let storyMaximum = 0;
let storySized = false;
let bioTravel = 0;
let bioBottom = 24;

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
  Array.isArray(climbGeometry.anchors) &&
  climbGeometry.anchors.length === climbMedia.frames && climbGeometry.anchors.every(validClimbAnchor) &&
  Number.isFinite(climbGeometry.contactInset) && climbGeometry.contactInset > 0 &&
  Array.isArray(climbGeometry.headY) && climbGeometry.headY.length === climbMedia.frames &&
  climbGeometry.headY.every(value => Number.isFinite(value) && value >= 0 && value < climbMedia.frameHeight) &&
  climbGeometry.clearance && Number.isFinite(climbGeometry.clearance.above) && climbGeometry.clearance.above > 0 &&
  Number.isFinite(climbGeometry.clearance.below) && climbGeometry.clearance.below > 0 &&
  climbGeometry.playback?.frames === climbMedia.frames &&
  climbGeometry.playback.fps === climbMedia.fps && climbGeometry.playback.loop === true &&
  climbGeometry.playback.mode === "scroll-scrub" &&
  Number.isInteger(climbGeometry.playback.scrollCycles) && climbGeometry.playback.scrollCycles > 0 &&
  Number.isFinite(climbGeometry.playback.loopBlendFrames) && climbGeometry.playback.loopBlendFrames >= 1 &&
  climbGeometry.playback.renderPadding === 32);
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
if (climbContext) {
  climbMedia.pages.forEach((source, index) => {
    const image = new Image();
    image.decoding = "async";
    climbImages.push(image);
    image.addEventListener("load", () => {
      if (image.naturalWidth !== climbMedia.frameWidth * climbMedia.columns ||
          image.naturalHeight !== climbMedia.frameHeight * climbMedia.rows) {
        reportClimbError(`Climbing frame sheet ${index + 1} has an unexpected size.`);
        return;
      }
      image.decode().then(() => {
        loadedClimbPages++;
        if (loadedClimbPages === climbMedia.pages.length) {
          atlasReady = true;
          climbPoster.hidden = true;
          climbCanvas.hidden = false;
          requestClimberFrame();
        }
      }, error => reportClimbError(`Climbing frame sheet ${index + 1} could not decode: ${error.message}`));
    });
    image.addEventListener("error", () => {
      reportClimbError(`Climbing frame sheet ${index + 1} could not load. Showing the still image.`);
    });
    image.src = source.src;
  });
} else {
  reportClimbError("This browser cannot display the climbing animation. Showing its still image.");
}

function storyScrollLimit() {
  return Math.max(0, about.scrollHeight - about.clientHeight);
}
function sizeStory() {
  const progress = storySized && storyMaximum ? clamp(1 - about.scrollTop / storyMaximum) : 0;
  about.style.setProperty("--story-viewport", `${about.clientHeight}px`);
  const headerHeight = about.querySelector(".header").getBoundingClientRect().height;
  about.style.setProperty("--story-header-height", `${headerHeight}px`);
  bioCopy.style.setProperty("--bio-max-height", `${Math.max(120, about.clientHeight - headerHeight - 48)}px`);
  const bioHeight = bioCopy.getBoundingClientRect().height;
  bioTravel = Math.max(420, Math.ceil(bioLetters.length * 1.2));
  bioBottom = Math.max(24, about.clientHeight - headerHeight - 24 - bioHeight);
  bioStage.style.setProperty("--bio-travel", `${bioTravel}px`);
  bioStage.style.setProperty("--bio-height", `${bioHeight}px`);
  bioCopy.style.setProperty("--bio-bottom", `${bioBottom}px`);
  const maximum = storyScrollLimit();
  if (!storySized || maximum !== storyMaximum) {
    cancelStoryScroll();
    about.scrollTo({ top: (1 - progress) * maximum, behavior: "instant" });
  }
  storyMaximum = maximum;
  storySized = true;
  needsMeasure = true;
  scheduleUpdate();
}
function biographyRange() {
  const stageTop = bioStage.getBoundingClientRect().top - about.getBoundingClientRect().top + about.scrollTop;
  const pinTop = about.clientHeight - bioBottom - bioCopy.getBoundingClientRect().height;
  const start = stageTop + bioTravel - pinTop;
  return { start, end: start - bioTravel };
}
function updateBiography() {
  const range = biographyRange();
  const progress = clamp((range.start - about.scrollTop) / bioTravel);
  const count = Math.floor(progress * bioLetters.length);
  bioLetters.forEach((letter, index) => letter.classList.toggle("is-read", index < count));
  const current = bioLetters[Math.min(count, bioLetters.length - 1)];
  const currentTop = current.getBoundingClientRect().top - bioCopy.getBoundingClientRect().top + bioCopy.scrollTop;
  bioCopy.scrollTo({ top: progress === 0 ? 0 : Math.max(0, currentTop - bioCopy.clientHeight * 0.65), behavior: "instant" });
  bioStage.dataset.readProgress = progress.toFixed(5);
  bioStage.dataset.readCount = String(count);
  const complete = count === bioLetters.length;
  about.dataset.readDirection = complete ? "bottom-up" : "top-down";
  return complete;
}
function navigateStory(target, behavior) {
  cancelStoryScroll();
  const top = target === about || target.id === "start"
    ? storyScrollLimit()
    : target.id === "info" || bioStage.contains(target)
      ? biographyRange().start
    : target.getBoundingClientRect().bottom - about.getBoundingClientRect().top +
      about.scrollTop - about.clientHeight + 24;
  about.scrollTo({ top: clamp(top, 0, storyScrollLimit()), behavior });
  rightActive = true;
  scheduleUpdate();
}
function cancelStoryScroll() {
  if (storyScrollFrame) cancelAnimationFrame(storyScrollFrame);
  storyScrollFrame = 0;
  storyScrollTarget = null;
  storyScrollTime = 0;
  scheduleUpdate();
}
function animateStoryScroll(now) {
  storyScrollFrame = 0;
  if (storyScrollTarget === null) return;
  if (document.hidden || lightbox.open || !intro.classList.contains("dismissed")) {
    cancelStoryScroll();
    return;
  }
  const elapsed = storyScrollTime ? clamp(now - storyScrollTime, 1, 50) : 1000 / 60;
  storyScrollTime = now;
  const difference = storyScrollTarget - about.scrollTop;
  const playback = climbGeometry.playback;
  const period = climbMedia.frames - 1 + playback.loopBlendFrames;
  const pixelsPerFrame = storyMaximum / (period * playback.scrollCycles);
  const limit = Math.max(1, pixelsPerFrame * 0.9 * Math.min(1, elapsed / (1000 / 60)));
  if (Math.abs(difference) <= 1) {
    about.scrollTo({ top: storyScrollTarget, behavior: "instant" });
    storyScrollTarget = null;
  } else {
    const eased = Math.abs(difference) * (1 - Math.exp(-elapsed / 70));
    const step = Math.sign(difference) * Math.min(Math.abs(difference), limit, Math.max(1, eased));
    about.scrollTo({ top: about.scrollTop + step, behavior: "instant" });
    storyScrollFrame = requestAnimationFrame(animateStoryScroll);
  }
  updateClimber();
  scheduleUpdate();
}
function handleStoryWheel(event) {
  if (event.ctrlKey || !event.deltaY) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? about.clientHeight : 1;
  const target = clamp((storyScrollTarget ?? about.scrollTop) + event.deltaY * unit, 0, storyScrollLimit());
  if (reducedMotion.matches || !geometryReady) {
    cancelStoryScroll();
    about.scrollTo({ top: target, behavior: "instant" });
  } else {
    storyScrollTarget = target;
    if (!storyScrollFrame) {
      storyScrollTime = 0;
      storyScrollFrame = requestAnimationFrame(animateStoryScroll);
    }
  }
  rightActive = true;
  scheduleUpdate();
}
function requestClimberFrame() {
  if (climbFrameRequest) return;
  climbFrameRequest = requestAnimationFrame(() => {
    climbFrameRequest = 0;
    updateClimber();
  });
}
function updateClimber() {
  const moving = geometryReady && cliffReady && !reducedMotion.matches;
  const visible = !document.hidden && intro.classList.contains("dismissed") && !lightbox.open;
  const distance = clamp(storyMaximum - about.scrollTop, 0, storyMaximum);
  const progress = storyMaximum ? distance / storyMaximum : 0;
  const playback = geometryReady ? climbGeometry.playback : null;
  const period = playback ? climbMedia.frames - 1 + playback.loopBlendFrames : 1;
  const totalPhase = moving && atlasReady ? progress * playback.scrollCycles * period : 0;
  const phase = totalPhase % period;
  const frame = Math.min(Math.floor(phase), climbMedia.frames - 1);
  const next = frame === climbMedia.frames - 1 ? 0 : frame + 1;
  let blend = frame === climbMedia.frames - 1 ? (phase - frame) / playback.loopBlendFrames : phase - frame;
  if (frame === climbMedia.frames - 1) blend = blend * blend * (3 - 2 * blend);
  const padding = 32;
  const scale = climbFigure.clientWidth / climbCanvas.width;
  const above = geometryReady ? climbGeometry.clearance.above * scale : 0;
  const below = geometryReady ? climbGeometry.clearance.below * scale : climbFigure.offsetHeight;
  const travel = Math.max(0, climbDivider.clientHeight - above - below - 48);
  const headPosition = 24 + above + (moving ? (1 - progress) * travel : travel / 2);
  function posePosition(index) {
    const y = headPosition - (geometryReady ? climbGeometry.headY[index] * scale : 0);
    if (!geometryReady) return { x: 0, y };
    const anchor = climbGeometry.anchors[index];
    const wallPosition = clamp((y + anchor.y * scale) / cliffWall.clientHeight);
    const sample = wallPosition * (climbGeometry.rightEdge.length - 1);
    const lower = Math.floor(sample);
    const start = climbGeometry.rightEdge[lower];
    const end = climbGeometry.rightEdge[Math.min(lower + 1, climbGeometry.rightEdge.length - 1)];
    const edge = (start + (end - start) * (sample - lower)) * cliffWall.clientWidth;
    return { x: edge - (anchor.x + climbGeometry.contactInset) * scale, y };
  }
  const firstPosition = posePosition(frame);
  const nextPosition = posePosition(next);
  const dx = (nextPosition.x - firstPosition.x) / scale;
  const dy = (nextPosition.y - firstPosition.y) / scale;
  climbFigure.style.transform = `translate3d(${firstPosition.x - padding * scale}px, ${firstPosition.y - padding * scale}px, 0)`;
  climbFigure.dataset.progress = progress.toFixed(5);
  climbFigure.dataset.frame = String(frame);
  climbFigure.dataset.nextFrame = String(next);
  climbFigure.dataset.blend = blend.toFixed(6);
  climbFigure.dataset.phase = phase.toFixed(6);
  climbFigure.dataset.cycle = String(Math.floor(totalPhase / period));
  climbFigure.dataset.moving = String(storyScrollTarget !== null);
  climbFigure.dataset.playing = String(visible && moving && Math.abs(distance - lastRenderedDistance) > 0.001);
  lastRenderedDistance = distance;
  const key = `${frame}:${next}:${blend.toFixed(6)}:${dx.toFixed(4)}:${dy.toFixed(4)}`;
  if (!atlasReady || key === renderedClimbKey) return;
  climbContext.clearRect(0, 0, climbCanvas.width, climbCanvas.height);
  function drawPose(index, x, y, opacity, composite) {
    const page = Math.floor(index / climbMedia.framesPerPage);
    const cell = index % climbMedia.framesPerPage;
    climbContext.globalAlpha = opacity;
    climbContext.globalCompositeOperation = composite;
    climbContext.drawImage(climbImages[page], cell % climbMedia.columns * climbMedia.frameWidth,
      Math.floor(cell / climbMedia.columns) * climbMedia.frameHeight,
      climbMedia.frameWidth, climbMedia.frameHeight, x, y, climbMedia.frameWidth, climbMedia.frameHeight);
  }
  drawPose(frame, padding, padding, 1 - blend, "source-over");
  if (blend > 0) drawPose(next, padding + dx, padding + dy, blend, "lighter");
  climbContext.globalAlpha = 1;
  climbContext.globalCompositeOperation = "source-over";
  climbCanvas.dataset.renderedFrame = String(frame);
  climbCanvas.dataset.renderedNextFrame = String(next);
  renderedClimbKey = key;
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
  requestClimberFrame();
  if (!rightActive && finePointer.matches) return;
  const biographyComplete = updateBiography();
  const readingPosition = about.scrollTop + about.clientHeight * 0.48;
  const atEnd = about.scrollTop <= 2;
  readingLines.forEach((line, index) => {
    const nextLine = readingLines[index + 1];
    const duration = nextLine
      ? Math.max(1, Math.min(line.top - nextLine.top, line.height * 2.4))
      : Math.max(line.height * 2.4, 40);
    const progress = biographyComplete
      ? (atEnd ? 1 : clamp((line.top + line.height - readingPosition) / duration))
      : 0;
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
about.addEventListener("wheel", handleStoryWheel, { passive: false });
storyPanel.addEventListener("pointerdown", cancelStoryScroll, { passive: true });
about.addEventListener("keydown", event => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancelStoryScroll();
});
storyPanel.addEventListener("wheel", (event) => {
  if (!about.contains(event.target)) handleStoryWheel(event);
}, { passive: false });
about.addEventListener("scrollend", requestClimberFrame);
photoScroll.addEventListener("scroll", scheduleUpdate, { passive: true });
window.addEventListener("scroll", scheduleUpdate, { passive: true });
window.addEventListener("resize", () => { needsMeasure = true; scheduleUpdate(); });
window.addEventListener("load", () => { needsMeasure = true; scheduleUpdate(); });
reducedMotion.addEventListener("change", () => {
  cancelStoryScroll();
  scheduleUpdate();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelStoryScroll();
  requestClimberFrame();
});
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
  requestClimberFrame();
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
