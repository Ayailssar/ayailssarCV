async (page) => {
  await page.bringToFront();
  await page.reload();
  await page.locator("#enter").click();
  await page.waitForFunction(() => document.getElementById("intro").classList.contains("dismissed") &&
    document.getElementById("climber").dataset.renderedFrame === "0" &&
    document.getElementById("cliff-wall").naturalWidth > 0);
  await page.evaluate(() => document.getElementById("background-music").pause());
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (reduced) return { reducedMotion: true };
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const figure = document.getElementById("climb-figure");
    if (figure.dataset.started !== "false" || figure.dataset.frame !== "0") {
      throw new Error("The video started before the first CV scroll.");
    }
    const token = (window.__videoCheckToken || 0) + 1;
    window.__videoCheckToken = token;
    window.__videoCheck = { sequence: [], pages: new Set(), pixelsChecked: 0, error: "", done: false, startedAt: null, wrapTime: null };
    const reference = document.createElement("canvas");
    const canvas = document.getElementById("climber");
    reference.width = canvas.width;
    reference.height = canvas.height;
    const refContext = reference.getContext("2d", { willReadFrequently: true });
    const wall = document.getElementById("cliff-wall");
    const wallCanvas = document.createElement("canvas");
    wallCanvas.width = wall.naturalWidth;
    wallCanvas.height = wall.naturalHeight;
    const wallContext = wallCanvas.getContext("2d", { willReadFrequently: true });
    wallContext.drawImage(wall, 0, 0);
    const wallPixels = wallContext.getImageData(0, 0, wallCanvas.width, wallCanvas.height).data;
    const wallBox = wall.getBoundingClientRect();
    const checkedPixels = new Set();
    let previous = -1;
    function inspect(now) {
      if (window.__videoCheckToken !== token) return;
      const state = window.__videoCheck;
      try {
        const figure = document.getElementById("climb-figure");
        const frame = Number(figure.dataset.frame);
        const geometry = window.ayaClimbGeometry;
        if (figure.dataset.playing === "true" && state.startedAt === null) state.startedAt = now;
        if (frame !== previous) {
          if (previous >= 0 && frame !== (previous + 1) % 300) throw new Error(`Skipped/reversed source frame: ${previous} -> ${frame}`);
          if (Number(canvas.dataset.renderedFrame) !== frame) throw new Error("Frame counter differs from the drawn image.");
          if (previous === 299 && frame === 0 && state.wrapTime === null) state.wrapTime = now;
          state.sequence.push(frame);
          state.pages.add(Math.floor(frame / 100));
          previous = frame;
          const box = figure.getBoundingClientRect();
          const panel = document.querySelector(".story-panel").getBoundingClientRect();
          const scale = box.width / canvas.width;
          const [left, top, right, bottom] = geometry.poseBounds[frame];
          if (box.top + top * scale < panel.top - 1 || box.top + bottom * scale > panel.bottom + 1 ||
              box.left + left * scale < -1 || box.left + right * scale > innerWidth + 1) {
            throw new Error(`Original frame ${frame} is cut off on screen.`);
          }
          const anchor = geometry.anchors[frame];
          if (canvas.getContext("2d").getImageData(anchor.x, anchor.y, 1, 1).data[3] < 240) {
            throw new Error(`Original frame ${frame} lost its visible hand.`);
          }
          const wx = Math.round((box.left + anchor.x * scale - wallBox.left) / wallBox.width * wallCanvas.width);
          const wy = Math.round((box.top + anchor.y * scale - wallBox.top) / wallBox.height * wallCanvas.height);
          if (wx < 0 || wx >= wallCanvas.width || wy < 0 || wy >= wallCanvas.height ||
              wallPixels[(wy * wallCanvas.width + wx) * 4 + 3] < 200) {
            throw new Error(`Original frame ${frame} lost contact with the actual cliff.`);
          }
          if ([0, 99, 100, 199, 200, 299].includes(frame) && !checkedPixels.has(frame)) {
            checkedPixels.add(frame);
            const cell = frame % 100;
            refContext.clearRect(0, 0, canvas.width, canvas.height);
            refContext.drawImage(climbImages[Math.floor(frame / 100)],
              cell % 10 * canvas.width, Math.floor(cell / 10) * canvas.height,
              canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
            const actual = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
            const expected = refContext.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let index = 0; index < actual.length; index += 4) {
              if (actual[index + 3] !== expected[index + 3]) throw new Error(`Wrong source image at frame ${frame}.`);
              if (expected[index + 3] > 200 && [0, 1, 2].some(channel =>
                Math.abs(actual[index + channel] - expected[index + channel]) > 2)) {
                throw new Error(`Wrong source colors at frame ${frame}.`);
              }
            }
            state.pixelsChecked++;
          }
        }
        if (state.sequence.length >= 316) {
          state.done = true;
          return;
        }
        if (state.startedAt !== null && now - state.startedAt > 20000) throw new Error("The complete video did not loop smoothly.");
      } catch (error) {
        state.error = error.message;
        return;
      }
      requestAnimationFrame(inspect);
    }
    requestAnimationFrame(inspect);
  });
  const box = await page.locator("#about").boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -160);
  await page.waitForFunction(() => window.__videoCheck.done || window.__videoCheck.error, null, { timeout: 25000 });
  return await page.evaluate(() => {
    window.__videoCheckToken++;
    const state = window.__videoCheck;
    if (state.error) throw new Error(state.error);
    const firstCycle = state.sequence.slice(0, 300);
    if (!firstCycle.every((frame, index) => frame === index)) throw new Error("Not every original source frame was shown.");
    const duration = state.wrapTime - state.startedAt;
    if (duration < 9500 || duration > 15000) throw new Error(`Unexpected full-video playback duration: ${duration}ms`);
    if (state.pages.size !== 3 || state.pixelsChecked !== 6) throw new Error("Some native frame sheets were not rendered.");
    return {
      firstScrollStart: true, sourceFramesShown: firstCycle.length,
      originalForwardOrder: true, loopContinues: state.sequence[315] === 15,
      sourceSheetsUsed: state.pages.size, sourcePixelChecks: state.pixelsChecked,
      fullCharacterVisible: true, continuousRockContact: true, firstLoopMilliseconds: Math.round(duration)
    };
  });
}
