import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const indexPath = resolve(dist, "index.html");
const socialImagePath = resolve(dist, "wildvault-social-preview.png");
const robotsPath = resolve(dist, "robots.txt");
const sitemapPath = resolve(dist, "sitemap.xml");
const manifestPath = resolve(dist, "manifest.webmanifest");
const serviceWorkerPath = resolve(dist, "sw.js");
const icon192Path = resolve(dist, "icon-192.png");
const icon512Path = resolve(dist, "icon-512.png");
const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";

let html = await readFile(indexPath, "utf8");
const socialImageBase64 = (await readFile(socialImagePath)).toString("base64");
const robots = await readFile(robotsPath, "utf8");
const sitemap = await readFile(sitemapPath, "utf8");
const manifest = await readFile(manifestPath, "utf8");

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceMeta(source, attribute, name, value) {
  const escaped = escapeHtmlAttribute(value);
  const pattern = new RegExp(
    `(<meta\\s+${attribute}="${name}"\\s+content=")[^"]*("\\s*\\/?>)`,
    "i",
  );
  return source.replace(pattern, `$1${escaped}$2`);
}

function readSocialPreview(url, currentDate) {
  const entries = [...url.searchParams.entries()];
  const challengeValues = url.searchParams.getAll("challenge");
  const rawChallenge = challengeValues[0];

  if (
    challengeValues.length !== 1 ||
    rawChallenge === undefined ||
    !/^\d{1,5}$/.test(rawChallenge)
  ) {
    return null;
  }

  const distance = Number(rawChallenge);
  if (!Number.isSafeInteger(distance) || distance > 99_999) return null;

  const hasDailyContext =
    url.searchParams.has("mode") || url.searchParams.has("date");
  if (!hasDailyContext) {
    if (entries.length !== 1) return null;
    return { kind: "score", distance };
  }

  const modeValues = url.searchParams.getAll("mode");
  const dateValues = url.searchParams.getAll("date");
  if (
    entries.length !== 3 ||
    modeValues.length !== 1 ||
    modeValues[0] !== "daily" ||
    dateValues.length !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateValues[0]) ||
    dateValues[0] !== currentDate
  ) {
    return null;
  }

  return { kind: "daily", distance, date: dateValues[0] };
}

function renderSocialHtml(source, url, now = new Date()) {
  const currentDate = now.toISOString().slice(0, 10);
  const preview = readSocialPreview(url, currentDate);
  if (!preview) return source;

  const score = preview.distance.toLocaleString("en-US");
  let title;
  let description;
  const shareUrl = new URL(gameUrl);
  shareUrl.searchParams.set("challenge", String(preview.distance));

  if (preview.kind === "daily") {
    const routeDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${preview.date}T00:00:00Z`));
    title = `Beat ${score}m on Wildvault's ${routeDate} daily route`;
    description = `Take the ${routeDate} Wildvault daily challenge on the same route and see if you can beat ${score}m.`;
    shareUrl.searchParams.set("mode", "daily");
    shareUrl.searchParams.set("date", preview.date);
  } else {
    title = `Beat ${score}m in Wildvault Run`;
    description = `A Wildvault runner reached ${score}m. Take the challenge and see if you can go farther.`;
  }

  let rendered = replaceMeta(source, "name", "description", description);
  rendered = replaceMeta(rendered, "property", "og:title", title);
  rendered = replaceMeta(rendered, "property", "og:description", description);
  rendered = replaceMeta(rendered, "property", "og:url", shareUrl.toString());
  rendered = replaceMeta(rendered, "name", "twitter:title", title);
  rendered = replaceMeta(rendered, "name", "twitter:description", description);
  return rendered.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeHtmlAttribute(title)}</title>`,
  );
}

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

const cacheVersion = createHash("sha256").update(html).digest("hex").slice(0, 12);
const serviceWorker = (await readFile(serviceWorkerPath, "utf8")).replace(
  "__CACHE_VERSION__",
  cacheVersion,
);
await writeFile(serviceWorkerPath, serviceWorker);
const icon192Base64 = (await readFile(icon192Path)).toString("base64");
const icon512Base64 = (await readFile(icon512Path)).toString("base64");

const workerPath = resolve(dist, "server", "index.js");
await mkdir(dirname(workerPath), { recursive: true });
await writeFile(
  workerPath,
  `const html = ${JSON.stringify(html)};\nconst robots = ${JSON.stringify(robots)};\nconst sitemap = ${JSON.stringify(sitemap)};\nconst manifest = ${JSON.stringify(manifest)};\nconst serviceWorker = ${JSON.stringify(serviceWorker)};\nconst socialImage = Uint8Array.from(atob(${JSON.stringify(socialImageBase64)}), (character) => character.charCodeAt(0));\nconst icon192 = Uint8Array.from(atob(${JSON.stringify(icon192Base64)}), (character) => character.charCodeAt(0));\nconst icon512 = Uint8Array.from(atob(${JSON.stringify(icon512Base64)}), (character) => character.charCodeAt(0));\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    if (url.pathname === "/wildvault-social-preview.png") {\n      return new Response(socialImage, {\n        headers: {\n          "content-type": "image/png",\n          "content-length": String(socialImage.byteLength),\n          "cache-control": "public, max-age=604800, immutable",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname === "/icon-192.png" || url.pathname === "/icon-512.png") {\n      const icon = url.pathname === "/icon-192.png" ? icon192 : icon512;\n      return new Response(icon, {\n        headers: {\n          "content-type": "image/png",\n          "content-length": String(icon.byteLength),\n          "cache-control": "public, max-age=86400, must-revalidate",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname === "/manifest.webmanifest") {\n      return new Response(manifest, {\n        headers: {\n          "content-type": "application/manifest+json; charset=utf-8",\n          "cache-control": "public, max-age=3600, must-revalidate",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname === "/sw.js") {\n      return new Response(serviceWorker, {\n        headers: {\n          "content-type": "text/javascript; charset=utf-8",\n          "cache-control": "no-store, max-age=0",\n          "service-worker-allowed": "/",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname === "/robots.txt") {\n      return new Response(robots, {\n        headers: {\n          "content-type": "text/plain; charset=utf-8",\n          "cache-control": "public, max-age=3600",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname === "/sitemap.xml") {\n      return new Response(sitemap, {\n        headers: {\n          "content-type": "application/xml; charset=utf-8",\n          "cache-control": "public, max-age=3600",\n          "x-content-type-options": "nosniff",\n        },\n      });\n    }\n    if (url.pathname !== "/" && url.pathname !== "/index.html") {\n      return new Response("Not found", { status: 404 });\n    }\n    return new Response(html, {\n      headers: {\n        "content-type": "text/html; charset=utf-8",\n        "cache-control": "no-store, max-age=0",\n        "x-content-type-options": "nosniff",\n        "referrer-policy": "strict-origin-when-cross-origin",\n      },\n    });\n  },\n};\n`,
);

let worker = await readFile(workerPath, "utf8");
const socialPreviewRuntime = `
const gameUrl = ${JSON.stringify(gameUrl)};

${escapeHtmlAttribute.toString()}

${replaceMeta.toString()}

${readSocialPreview.toString()}

${renderSocialHtml.toString()}
`;
worker = worker.replace(
  "\n\nexport default {",
  `${socialPreviewRuntime}\nexport default {`,
);
worker = worker.replace(
  "return new Response(html, {",
  "return new Response(renderSocialHtml(html, url), {",
);
await writeFile(workerPath, worker);

await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(
  resolve(dist, ".openai", "hosting.json"),
  await readFile(resolve(root, ".openai", "hosting.json"), "utf8"),
);
