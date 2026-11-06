import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const mimeTypes = { ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".webp": "image/webp" };

function embedAsset(path) {
  assert.match(path, /^assets\/[^/\\]+$/, `Unsupported asset path: ${path}`);
  const mimeType = mimeTypes[extname(path)];
  assert(mimeType, `Unsupported asset type: ${path}`);
  return `data:${mimeType};base64,${readFileSync(join(root, path)).toString("base64")}`;
}

const stylesheets = ["styles.css", "cv.css"];
const styles = stylesheets.map(file => readFileSync(join(root, file), "utf8")).join("\n");
assert(!/<\/style/i.test(styles), "Stylesheet contains an HTML closing style tag.");
const script = readFileSync(join(root, "app.js"), "utf8")
  .replace(/\bsrc: "(assets\/[^"]+)"/g, (_, path) => `src: "${embedAsset(path)}"`)
  .replace(/<\/script/gi, "<\\/script");
let html = readFileSync(join(root, "index.html"), "utf8");
const scriptTag = /^[ \t]*<script src="app\.js(?:\?[^"]*)?" defer><\/script>\r?\n?/m;
for (const file of stylesheets) {
  const tag = new RegExp(`<link rel="stylesheet" href="${file.replaceAll(".", "\\.")}(?:\\?[^"]*)?">`);
  assert.match(html, tag, `Expected the ${file} stylesheet link.`);
  html = html.replace(tag, () => `<style>\n${readFileSync(join(root, file), "utf8")}</style>`);
}
assert.match(html, scriptTag, "Expected the deferred source script.");
assert.match(html, /<\/body>/, "Expected a closing body tag.");

html = html
  .replace(scriptTag, "")
  .replace(/\bsrc="(assets\/[^"]+)"/g, (_, path) => `src="${embedAsset(path)}"`)
  // Inline scripts cannot use defer; run after the complete page markup instead.
  .replace("</body>", () => `<script>\n${script}</script>\n</body>`);

assert(!html.includes("assets/"), "Production HTML still references the assets folder.");
assert(!/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html),
  "Production HTML still references an external script or stylesheet.");
assert(!/@import\b|\burl\s*\(/i.test(styles),
  "Stylesheet resources must be embedded before building a standalone file.");
const bytes = Buffer.byteLength(html);
assert(bytes < 100 * 1024 * 1024, "Production HTML exceeds GitHub's 100 MiB file limit.");

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "index.html"), html);
console.log(`Built standalone dist/index.html (${(bytes / 1024 / 1024).toFixed(1)} MiB), including all photos and music.`);
