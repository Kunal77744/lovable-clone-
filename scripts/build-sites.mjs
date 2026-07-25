import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const indexPath = resolve(dist, "index.html");
const socialImagePath = resolve(dist, "wildvault-social-preview.png");

let html = await readFile(indexPath, "utf8");
const socialImageBase64 = (await readFile(socialImagePath)).toString("base64");

const stylesheet = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (stylesheet) {
  const cssPath = resolve(dist, stylesheet[1].replace(/^\.?\//, ""));
  const css = await readFile(cssPath, "utf8");
  html = html.replace(stylesheet[0], () => `<style>${css}</style>`);
}

const moduleScript = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (moduleScript) {
  const scriptPath = resolve(dist, moduleScript[1].replace(/^\.?\//, ""));
  const script = (await readFile(scriptPath, "utf8")).replace(/<\/script/gi, "<\\/script");
  html = html.replace(moduleScript[0], () => `<script type="module">${script}</script>`);
}

html = html.replace(
  /<link rel="icon"[^>]*>/,
  '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%227%22 fill=%22%23081713%22/%3E%3Cpath d=%22M16 5 27 16 16 27 5 16Z%22 fill=%22none%22 stroke=%22%23f2be4d%22 stroke-width=%222%22/%3E%3C/svg%3E">',
);

const workerPath = resolve(dist, "server", "index.js");
await mkdir(dirname(workerPath), { recursive: true });
await writeFile(
  workerPath,
  `const html = ${JSON.stringify(html)};\nconst socialImage = Uint8Array.from(atob(${JSON.stringify(socialImageBase64)}), (character) => character.charCodeAt(0));\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    if (url.pathname === "/wildvault-social-preview.png") {\n      return new Response(socialImage, {\n        headers: {\n          "content-type": "image/png",\n          "content-length": String(socialImage.byteLength),\n          "cache-control": "public, max-age=604800, immutable",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname !== "/" && url.pathname !== "/index.html") {\n      return new Response("Not found", { status: 404 });\n    }\n    return new Response(html, {\n      headers: {\n        "content-type": "text/html; charset=utf-8",\n        "cache-control": "no-store, max-age=0",\n        "x-content-type-options": "nosniff",\n        "referrer-policy": "strict-origin-when-cross-origin",\n      },\n    });\n  },\n};\n`,
);

await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(
  resolve(dist, ".openai", "hosting.json"),
  await readFile(resolve(root, ".openai", "hosting.json"), "utf8"),
);
