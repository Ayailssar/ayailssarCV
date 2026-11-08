async (page) => {
  await page.bringToFront();
  await page.reload();
  await page.locator("#enter").click();
  await page.waitForFunction(() => document.getElementById("intro").classList.contains("dismissed") &&
    document.getElementById("climber").dataset.renderedFrame === "0");
  await page.evaluate(() => document.getElementById("background-music").pause());
  const snapshot = () => page.evaluate(() => ({
    top: document.getElementById("about").scrollTop,
    phase: document.getElementById("climb-figure").dataset.phase,
    transform: document.getElementById("climb-figure").style.transform,
    image: document.getElementById("climber").toDataURL()
  }));
  const initial = await snapshot();
  await page.waitForTimeout(500);
  if (JSON.stringify(await snapshot()) !== JSON.stringify(initial)) throw new Error("The climber advances before scrolling.");

  await page.evaluate(() => {
    window.__scrubCheck = { sequence: [], error: "", maxAdvance: 0 };
    window.__scrubToken = (window.__scrubToken || 0) + 1;
    const token = window.__scrubToken;
    let previous = -1, phase = null;
    const playback = window.ayaClimbGeometry.playback;
    const period = 299 + playback.loopBlendFrames;
    function inspect() {
      if (token !== window.__scrubToken) return;
      const state = window.__scrubCheck, figure = document.getElementById("climb-figure");
      const current = Number(figure.dataset.frame), nextPhase = Number(figure.dataset.phase);
      if (current !== previous) {
        if (previous >= 0 && current !== (previous + 1) % 300) state.error = `Skipped frame ${previous} -> ${current}`;
        state.sequence.push(current);
        previous = current;
      }
      if (phase !== null) {
        const advance = (nextPhase - phase + period) % period;
        if (advance < period / 2) state.maxAdvance = Math.max(state.maxAdvance, advance);
      }
      phase = nextPhase;
      requestAnimationFrame(inspect);
    }
    requestAnimationFrame(inspect);
  });
  const about = await page.locator("#about").boundingBox();
  await page.mouse.move(about.x + about.width * 0.6, about.y + about.height * 0.5);
  await page.mouse.wheel(0, -160);
  await page.waitForFunction(top => document.getElementById("about").scrollTop < top - 10, initial.top);
  await page.waitForFunction(() => document.getElementById("climb-figure").dataset.moving === "false");
  const stopped = await snapshot();
  await page.waitForTimeout(900);
  if (JSON.stringify(await snapshot()) !== JSON.stringify(stopped)) throw new Error("The frame changes after screen scrolling stops.");

  const gallery = await page.locator("#photo-scroll").boundingBox();
  await page.mouse.move(gallery.x + gallery.width * 0.5, gallery.y + gallery.height * 0.5);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(700);
  if (JSON.stringify(await snapshot()) !== JSON.stringify(stopped)) throw new Error("Left-gallery scrolling advanced the climber.");

  const maximum = await page.locator("#about").evaluate(element => element.scrollHeight - element.clientHeight);
  await page.mouse.move(about.x + about.width * 0.6, about.y + about.height * 0.5);
  await page.mouse.wheel(0, -(maximum / 2 + 80));
  await page.waitForFunction(() => document.getElementById("climb-figure").dataset.moving === "false" &&
    Number(document.getElementById("climb-figure").dataset.cycle) >= 1, null, { timeout: 20000 });
  const sequence = await page.evaluate(() => {
    window.__scrubToken++;
    const state = window.__scrubCheck;
    if (state.error) throw new Error(state.error);
    if (!state.sequence.slice(0, 300).every((frame, index) => frame === index) || state.sequence.length < 301) {
      throw new Error("The full original sequence was not available during scrolling.");
    }
    if (state.maxAdvance > 1.05) throw new Error(`Wheel interpolation jumps ${state.maxAdvance} frames.`);
    return { originalFrames: 300, maxFrameAdvance: state.maxAdvance, loopReached: true };
  });

  const transitions = await page.evaluate(async () => {
    const about = document.getElementById("about"), figure = document.getElementById("climb-figure");
    const playback = window.ayaClimbGeometry.playback;
    const period = 299 + playback.loopBlendFrames;
    const max = about.scrollHeight - about.clientHeight;
    const panel = document.querySelector(".story-panel").getBoundingClientRect();
    const world = document.createElement("canvas");
    world.width = 512; world.height = Math.ceil(panel.height);
    const context = world.getContext("2d", { willReadFrequently: true });
    async function capture(phase) {
      about.scrollTo({ top: max * (1 - phase / (period * playback.scrollCycles)), behavior: "instant" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const deadline = performance.now() + 2000;
      while (Math.abs(Number(figure.dataset.progress) - (1 - about.scrollTop / max)) > 0.00002) {
        if (performance.now() > deadline) throw new Error("Scroll-scrub render did not settle.");
        await new Promise(requestAnimationFrame);
      }
      const box = figure.getBoundingClientRect();
      context.clearRect(0, 0, world.width, world.height);
      context.drawImage(document.getElementById("climber"), box.left - panel.left + 100, box.top - panel.top, box.width, box.height);
      return context.getImageData(0, 0, world.width, world.height).data;
    }
    function difference(a, b) {
      let total = 0;
      for (let index = 0; index < a.length; index += 4) {
        total += Math.abs(a[index + 3] - b[index + 3]);
        for (let channel = 0; channel < 3; channel++) {
          total += Math.abs(a[index + channel] * a[index + 3] / 255 - b[index + channel] * b[index + 3] / 255);
        }
      }
      return total;
    }
    const last = await capture(299), first = await capture(period);
    const before = await capture(period - 0.2), after = await capture(period + 0.2);
    const raw = difference(last, first), smooth = difference(before, after);
    if (raw <= 0 || smooth >= raw * 0.05) throw new Error("The loop reset still produces a visible jump.");
    return { loopBoundaryChangeRatio: smooth / raw };
  });
  const final = await snapshot();
  await page.waitForTimeout(700);
  if (JSON.stringify(await snapshot()) !== JSON.stringify(final)) throw new Error("Interpolated frames keep playing while idle.");
  return { scrollOnly: true, freezesWhenIdle: true, leftGalleryIndependent: true, ...sequence, ...transitions };
}
