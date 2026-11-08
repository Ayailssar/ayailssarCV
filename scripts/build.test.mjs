import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");
const sourceHtml = read("index.html");
const sourceScript = read("app.js");
const html = read("dist/index.html");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const appScript = scripts.at(-1);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("production is one HTML file with inline styles and executable scripts", () => {
  assert.deepEqual(readdirSync(join(root, "dist")), ["index.html"]);
  assert(!html.includes("assets/"));
  assert(!/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html));
  assert.equal(scripts.length, 3);
  for (const script of scripts) assert.doesNotThrow(() => new Script(script));
  assert(html.includes(`<style>\n${read("styles.css")}</style>`));
  assert(html.includes(`<style>\n${read("cv.css")}</style>`));
  assert(html.lastIndexOf("<script>") > html.indexOf('<dialog id="lightbox"'));
});

test("all photos, climbing media, and the full soundtrack are embedded without modification", () => {
  const sourcePaths = [
    ...sourceHtml.matchAll(/\bsrc="(assets\/[^"]+)"/g),
    ...sourceScript.matchAll(/\bsrc: "(assets\/[^"]+)"/g)
  ].map((match) => match[1].split("?")[0]).filter(path => !path.endsWith(".js"));
  const embedded = [
    ...html.matchAll(/\bsrc="(data:[^"]+)"/g),
    ...appScript.matchAll(/\bsrc: "(data:[^"]+)"/g)
  ].map((match) => match[1]);
  assert.equal(sourcePaths.length, 19);
  assert.equal(embedded.length, sourcePaths.length);
  sourcePaths.forEach((path, index) => {
    const comma = embedded[index].indexOf(",");
    const expectedMime = { ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".webp": "image/webp" }[extname(path)];
    assert.equal(embedded[index].slice(0, comma), `data:${expectedMime};base64`);
    const decoded = Buffer.from(embedded[index].slice(comma + 1), "base64");
    assert.equal(digest(decoded), digest(readFileSync(join(root, path))), path);
  });
});

test("gallery content, behavior, and base layout remain unchanged while the cue is enlarged", () => {
  assert.equal(digest(read("styles.css")), "52d901d8699827b08b3477a2d6df793dc96260b9d5f31dd5e5704f4b62cc70b6");
  assert.match(sourceHtml, /class="scroll-arrow" aria-hidden="true">↔<\/span>/);
  assert.equal(digest(sourceScript.slice(sourceScript.indexOf("const photos"), sourceScript.indexOf("const intro"))),
    "12eeee9b68c4023f34e3c544870fcf1c7e428ffff764e0cd3913ec21a159a834");
  assert.equal(digest(sourceScript.slice(sourceScript.indexOf("const svgNS"), sourceScript.indexOf("// Keep words intact"))),
    "6b13754596deb9aeacdd70990e00277fe032302d4b088bd3f03c1af56b976197");
});

test("intro copy, scroll cues, and typography follow the new readability requirements", () => {
  assert(sourceHtml.includes("MY UNIQUE CV · 2026"));
  assert(!sourceHtml.includes("A PERSONAL WORLD"));
  assert(!/font-size:\s*[1-9](?:\.\d+)?px\b/.test(read("cv.css")));
  assert.match(read("cv.css"), /\.story-cue > span:first-child\s*\{[^}]*font-size:\s*48px/);
  assert.match(read("cv.css"), /\.photo-status \.scroll-arrow\s*\{[^}]*font-size:\s*40px/);
});

test("story order is title, about, software, experience, then contact", () => {
  const ids = ["start", "info", "software", "experience", "contact"];
  const positions = ids.map(id => sourceHtml.indexOf(`id="${id}"`));
  assert(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(read("cv.css"), /\.about-content\s*\{[^}]*flex-direction:\s*column-reverse/);
});

test("the career grows upward from the 2017 municipality role", () => {
  const years = [...sourceHtml.matchAll(/<article data-start-year="(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(years, [2017, 2020, 2021, 2022, 2024, 2025]);
  assert.match(read("cv.css"), /\.story-panel \.experience-list,[\s\S]*?flex-direction:\s*column-reverse/);
});

test("the climbing atlas metadata matches the browser's frame layout", () => {
  const metadata = JSON.parse(read("assets/climber.json"));
  for (const [key, value] of Object.entries({
    frameWidth: 256, frameHeight: 352, columns: 10, rows: 10, framesPerPage: 100, frames: 300, fps: 30, duration: 10
  })) {
    assert.equal(metadata[key], value, key);
  }
  assert.deepEqual(metadata.sourceFrameIndices, Array.from({ length: 300 }, (_, index) => index));
  assert.deepEqual(metadata.pages, ["climber-00.webp", "climber-01.webp", "climber-02.webp"]);
  assert.match(metadata.sourceVideoSha256, /^[a-f0-9]{64}$/);
});

test("the cliff is a separate full-height layer with a curved contact path", () => {
  assert.match(sourceHtml, /id="cliff-wall" src="assets\/cliff-wall\.webp(?:\?[^"]*)?"/);
  assert(!sourceHtml.includes("climb-route"));
  const wallStyles = read("cv.css").match(/\.cliff-wall\s*\{([^}]+)\}/)[1];
  assert.match(wallStyles, /height:\s*100%/);
  assert.match(wallStyles, /width:\s*auto/);
  assert.match(wallStyles, /object-fit:\s*contain/);
  assert(!/transform|animation/.test(wallStyles));
  const context = { window: {} };
  new Script(scripts[1]).runInNewContext(context);
  const geometry = JSON.parse(JSON.stringify(context.window.ayaClimbGeometry));
  const metadata = JSON.parse(read("assets/climber.json"));
  assert.deepEqual(geometry, metadata.geometry);
  assert.equal(geometry.rightEdge.length, metadata.wallHeight);
  assert.equal(geometry.leftEdge.length, metadata.wallHeight);
  assert(geometry.rightEdge.every(value => Number.isFinite(value) && value > 0 && value < 1));
  assert(Math.max(...geometry.rightEdge) - Math.min(...geometry.rightEdge) > 0.08);
  assert(Number.isFinite(geometry.anchorX) && geometry.anchorX >= 0 && geometry.anchorX < 256);
  assert(Number.isFinite(geometry.anchorY) && geometry.anchorY >= 0 && geometry.anchorY < 352);
  assert.equal(geometry.anchors.length, 300);
  assert(geometry.anchors.every(anchor => anchor.x >= 0 && anchor.x < 256 && anchor.y >= 0 && anchor.y < 352));
  assert(geometry.contactInset > 0);
  assert.deepEqual(geometry.playback, {
    frames: 300, fps: 30, duration: 10, loop: true, mode: "scroll-scrub",
    scrollCycles: 2, loopBlendFrames: 12, renderPadding: 32
  });
  assert(sourceHtml.includes('id="climber" width="320" height="416"'));
  assert(!("loop" in geometry), "A shortened pose list must not replace the original video.");
  assert.equal(geometry.headY.length, 300);
  assert(geometry.headY.every(value => Number.isFinite(value) && value >= 0 && value < 352));
  assert.equal(geometry.poseBounds.length, 300);
  assert(geometry.poseBounds.every(([left, top, right, bottom]) =>
    left >= 8 && top >= 8 && right <= 248 && bottom <= 344 && right > left && bottom > top));
  assert(geometry.clearance.above > 0 && geometry.clearance.below > 0);
});

test("the biography is a normal-order group of exactly three paragraphs", () => {
  const bio = sourceHtml.match(/<div class="bio-copy"[\s\S]*?<\/div>/)[0];
  assert(bio.includes('data-reading="top-down"'));
  assert.equal([...bio.matchAll(/class="ink bio-paragraph"/g)].length, 3);
  const starts = ["Architect with 7+", "Proven track record", "Currently pursuing"];
  const positions = starts.map(text => bio.indexOf(text));
  assert(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert(sourceHtml.indexOf('id="bio-copy"') < sourceHtml.indexOf('class="profile-photo"'));
});

test("the requested phone number is available as a dial link", () => {
  assert.match(sourceHtml, /href="tel:\+972525919726"/);
  assert.match(sourceHtml, /<span class="ink">052-5919726<\/span>/);
});

test("the supplied cliff is retained with only empty margins cropped", () => {
  const metadata = JSON.parse(read("assets/climber.json"));
  const source = readFileSync(join(root, "assets/cliff-source.png"));
  assert.equal(digest(source), metadata.wallSource.sha256);
  assert.deepEqual(metadata.wallSource.crop, [0, 0, 235, 1874]);
  assert.equal(source.readUInt32BE(16), metadata.wallSource.originalWidth);
  assert.equal(source.readUInt32BE(20), metadata.wallSource.originalHeight);
  assert.equal(metadata.wallWidth / metadata.wallHeight, 235 / 1874);
});

test("bundling preserves the app behavior and theme initialization", () => {
  const photoPaths = [...sourceScript.matchAll(/\bsrc: "(assets\/[^"]+)"/g)].map((match) => match[1]);
  let index = 0;
  const restoredScript = appScript.replace(/\bsrc: "data:[^"]+"/g, () => `src: "${photoPaths[index++]}"`);
  assert.equal(index, photoPaths.length);
  assert.equal(digest(restoredScript), digest(`\n${sourceScript}`));
  assert.equal(scripts[0], sourceHtml.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test("light is the default regardless of system theme, with an explicit dark override", () => {
  for (const systemDark of [false, true]) {
    for (const [search, expected] of [
      ["", "light"],
      ["?scoutTheme=light", "light"],
      ["?scoutTheme=dark", "dark"],
      ["?scoutTheme=unknown", "light"]
    ]) {
      let actual;
      new Script(scripts[0]).runInNewContext({
        URLSearchParams,
        window: {
          location: { search },
          matchMedia: () => ({ matches: systemDark })
        },
        document: {
          documentElement: {
            setAttribute(name, value) {
              assert.equal(name, "data-theme");
              actual = value;
            }
          }
        }
      });
      assert.equal(actual, expected, `systemDark=${systemDark}, search=${search}`);
    }
  }
});
