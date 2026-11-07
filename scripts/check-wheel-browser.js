async (page) => {
  if (await page.locator("#intro").evaluate(element => !element.classList.contains("dismissed"))) {
    await page.locator("#enter").click();
  }
  await page.waitForFunction(() => document.getElementById("intro").classList.contains("dismissed") &&
    !document.getElementById("climber").hidden);
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (reduced) return { reducedMotion: true };
  await page.evaluate(() => {
    const about = document.getElementById("about");
    about.scrollTo({ top: about.scrollHeight, behavior: "instant" });
  });
  await page.waitForFunction(() => document.getElementById("climb-figure").dataset.progress === "0.00000");
  const box = await page.locator("#about").boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  const results = [];
  for (const delta of [120, 320, 60]) {
    await page.evaluate(() => {
      const token = (window.__climbCheckToken || 0) + 1;
      window.__climbCheckToken = token;
      window.__climbSamples = [];
      window.__climbImages = new Set();
      window.__climbBodyHeights = [];
      const seen = new Set();
      function record(time) {
        if (window.__climbCheckToken !== token) return;
        const figure = document.getElementById("climb-figure");
        const pose = Number(figure.dataset.frame);
        const bounds = figure.getBoundingClientRect();
        window.__climbSamples.push({ time, frame: pose,
          top: bounds.top + window.ayaClimbGeometry.headY[pose] * bounds.width / 232 });
        if (!seen.has(pose)) {
          seen.add(pose);
          const canvas = document.getElementById("climber");
          window.__climbImages.add(canvas.toDataURL());
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let min = canvas.height, max = 0;
          for (let index = 0; index < canvas.width * canvas.height; index++) {
            if (pixels[index * 4 + 3] < 128) continue;
            const y = Math.floor(index / canvas.width);
            min = Math.min(min, y);
            max = Math.max(max, y);
          }
          window.__climbBodyHeights.push(max - min);
        }
        requestAnimationFrame(record);
      }
      requestAnimationFrame(record);
    });
    const before = await page.locator("#about").evaluate(element => element.scrollTop);
    await page.mouse.wheel(0, -delta);
    await page.waitForFunction(previous => document.getElementById("about").scrollTop < previous, before);
    await page.waitForFunction(() => {
      const about = document.getElementById("about"), figure = document.getElementById("climb-figure");
      const target = 1 - about.scrollTop / (about.scrollHeight - about.clientHeight);
      return figure.dataset.moving === "false" && Math.abs(Number(figure.dataset.progress) - target) < 0.00002;
    });
    const trace = await page.evaluate(() => {
      window.__climbCheckToken++;
      const samples = window.__climbSamples;
      const figure = document.getElementById("climb-figure");
      const bounds = figure.getBoundingClientRect();
      const pose = Number(figure.dataset.frame);
      samples.push({ frame: pose, top: bounds.top + window.ayaClimbGeometry.headY[pose] * bounds.width / 232 });
      return {
        uniqueRenderedPoses: window.__climbImages.size,
        visibleBodyMovement: Math.max(...window.__climbBodyHeights) - Math.min(...window.__climbBodyHeights),
        ascent: samples[0].top - samples.at(-1).top,
        alwaysAscending: samples.every((sample, index) => !index || sample.top <= samples[index - 1].top + 0.01)
      };
    });
    if (trace.uniqueRenderedPoses < 4 || trace.ascent <= 0 || !trace.alwaysAscending) {
      throw new Error(`Wheel ${delta}px did not animate a complete step: ${JSON.stringify(trace)}`);
    }
    results.push({ wheelPixels: delta, ...trace });
  }
  if (Math.max(...results.map(result => result.visibleBodyMovement)) < 30) {
    throw new Error("The gait changes frame numbers but lacks a visible reach/pull movement.");
  }
  const stable = await page.evaluate(() => ({
    image: document.getElementById("climber").toDataURL(),
    transform: document.getElementById("climb-figure").style.transform
  }));
  await page.waitForTimeout(200);
  const unchanged = await page.evaluate(before =>
    document.getElementById("climber").toDataURL() === before.image &&
    document.getElementById("climb-figure").style.transform === before.transform, stable);
  if (!unchanged) throw new Error("The climber did not stop after the input settled.");
  return { realWheelSteps: results, stopsWhenIdle: true };
}
