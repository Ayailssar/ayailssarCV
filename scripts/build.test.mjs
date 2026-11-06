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
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("production is one HTML file with inline styles and executable scripts", () => {
  assert.deepEqual(readdirSync(join(root, "dist")), ["index.html"]);
  assert(!html.includes("assets/"));
  assert(!/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html));
  assert.equal(scripts.length, 2);
  for (const script of scripts) assert.doesNotThrow(() => new Script(script));
  assert(html.includes(`<style>\n${read("styles.css")}</style>`));
  assert(html.includes(`<style>\n${read("cv.css")}</style>`));
  assert(html.lastIndexOf("<script>") > html.indexOf('<dialog id="lightbox"'));
});

test("all photos, climbing media, and the full soundtrack are embedded without modification", () => {
  const sourcePaths = [
    ...sourceHtml.matchAll(/\bsrc="(assets\/[^"]+)"/g),
    ...sourceScript.matchAll(/\bsrc: "(assets\/[^"]+)"/g)
  ].map((match) => match[1]);
  const embedded = [
    ...html.matchAll(/\bsrc="(data:[^"]+)"/g),
    ...scripts[1].matchAll(/\bsrc: "(data:[^"]+)"/g)
  ].map((match) => match[1]);
  assert.equal(sourcePaths.length, 16);
  assert.equal(embedded.length, sourcePaths.length);
  sourcePaths.forEach((path, index) => {
    const comma = embedded[index].indexOf(",");
    const expectedMime = { ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".webp": "image/webp" }[extname(path)];
    assert.equal(embedded[index].slice(0, comma), `data:${expectedMime};base64`);
    const decoded = Buffer.from(embedded[index].slice(comma + 1), "base64");
    assert.equal(digest(decoded), digest(readFileSync(join(root, path))), path);
  });
});

test("the original left panel, gallery data, gallery behavior, and base styles are unchanged", () => {
  assert.equal(digest(read("styles.css")), "52d901d8699827b08b3477a2d6df793dc96260b9d5f31dd5e5704f4b62cc70b6");
  assert.equal(digest(sourceHtml.match(/<aside class="visual-panel"[\s\S]*?<\/aside>/)[0]),
    "190c834ee21fcc995cba1a4c3ae555a457d39a32cc5ac7b7cec7ea5580eac766");
  assert.equal(digest(sourceScript.slice(sourceScript.indexOf("const photos"), sourceScript.indexOf("const intro"))),
    "12eeee9b68c4023f34e3c544870fcf1c7e428ffff764e0cd3913ec21a159a834");
  assert.equal(digest(sourceScript.slice(sourceScript.indexOf("const svgNS"), sourceScript.indexOf("// Keep words intact"))),
    "6b13754596deb9aeacdd70990e00277fe032302d4b088bd3f03c1af56b976197");
  assert(!/\.visual-panel|\.hobby-|\.gallery-|\.photo-/.test(read("cv.css")));
});

test("story order is title, about, software, experience, then contact", () => {
  const ids = ["start", "info", "software", "experience", "contact"];
  const positions = ids.map(id => sourceHtml.indexOf(`id="${id}"`));
  assert(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(read("cv.css"), /\.about-content\s*\{[^}]*flex-direction:\s*column-reverse/);
});

test("the climbing atlas metadata matches the browser's frame layout", () => {
  const metadata = JSON.parse(read("assets/climber.json"));
  for (const [key, value] of Object.entries({
    frameWidth: 232, frameHeight: 312, columns: 12, rows: 10, frames: 120, fps: 12, duration: 10
  })) {
    assert.equal(metadata[key], value, key);
  }
});

test("bundling preserves the app behavior and theme initialization", () => {
  const photoPaths = [...sourceScript.matchAll(/\bsrc: "(assets\/[^"]+)"/g)].map((match) => match[1]);
  let index = 0;
  const restoredScript = scripts[1].replace(/\bsrc: "data:[^"]+"/g, () => `src: "${photoPaths[index++]}"`);
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
