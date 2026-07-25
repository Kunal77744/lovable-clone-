import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const indexPath = resolve(dist, "index.html");
const pressKitPath = resolve(dist, "press-kit", "index.html");
const freeBrowserRunnerPath = resolve(dist, "free-browser-runner", "index.html");
const dailyBrowserRunnerPath = resolve(dist, "daily-browser-runner", "index.html");
const socialImagePath = resolve(dist, "wildvault-social-preview.png");
const mobileScreenshotPath = resolve(dist, "wildvault-mobile-gameplay.png");
const gameplayClipPath = resolve(dist, "wildvault-gameplay.mp4");
const robotsPath = resolve(dist, "robots.txt");
const sitemapPath = resolve(dist, "sitemap.xml");
const manifestPath = resolve(dist, "manifest.webmanifest");
const serviceWorkerPath = resolve(dist, "sw.js");
const icon192Path = resolve(dist, "icon-192.png");
const icon512Path = resolve(dist, "icon-512.png");
const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";
const socialArtworkRuntime = await readFile(
  resolve(root, "scripts", "social-artwork-runtime.js"),
  "utf8",
);

let html = await readFile(indexPath, "utf8");
const pressKitHtml = await readFile(pressKitPath, "utf8");
const freeBrowserRunnerHtml = await readFile(freeBrowserRunnerPath, "utf8");
const dailyBrowserRunnerHtml = await readFile(dailyBrowserRunnerPath, "utf8");
const socialImageBase64 = (await readFile(socialImagePath)).toString("base64");
const mobileScreenshotBase64 = (await readFile(mobileScreenshotPath)).toString("base64");
const gameplayClipBase64 = (await readFile(gameplayClipPath)).toString("base64");
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
  let imageAlt;
  const shareUrl = new URL(gameUrl);
  const imageUrl = new URL(challengeArtworkPath, gameUrl);
  shareUrl.searchParams.set("challenge", String(preview.distance));
  imageUrl.searchParams.set("challenge", String(preview.distance));

  if (preview.kind === "daily") {
    const routeDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${preview.date}T00:00:00Z`));
    title = `Beat ${score}m on Wildvault's ${routeDate} daily route`;
    description = `Take the ${routeDate} Wildvault daily challenge on the same route and see if you can beat ${score}m.`;
    imageAlt = `Wildvault Run ${preview.date} daily route challenge artwork showing ${score}m to beat.`;
    shareUrl.searchParams.set("mode", "daily");
    shareUrl.searchParams.set("date", preview.date);
    imageUrl.searchParams.set("mode", "daily");
    imageUrl.searchParams.set("date", preview.date);
  } else {
    title = `Beat ${score}m in Wildvault Run`;
    description = `A Wildvault runner reached ${score}m. Take the challenge and see if you can go farther.`;
    imageAlt = `Wildvault Run challenge artwork showing ${score}m to beat.`;
  }

  let rendered = replaceMeta(source, "name", "description", description);
  rendered = replaceMeta(rendered, "property", "og:title", title);
  rendered = replaceMeta(rendered, "property", "og:description", description);
  rendered = replaceMeta(rendered, "property", "og:url", shareUrl.toString());
  rendered = replaceMeta(rendered, "property", "og:image", imageUrl.toString());
  rendered = replaceMeta(
    rendered,
    "property",
    "og:image:secure_url",
    imageUrl.toString(),
  );
  rendered = replaceMeta(rendered, "property", "og:image:alt", imageAlt);
  rendered = replaceMeta(rendered, "name", "twitter:title", title);
  rendered = replaceMeta(rendered, "name", "twitter:description", description);
  rendered = replaceMeta(rendered, "name", "twitter:image", imageUrl.toString());
  rendered = replaceMeta(rendered, "name", "twitter:image:alt", imageAlt);
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
  `const html = ${JSON.stringify(html)};
const pressKitHtml = ${JSON.stringify(pressKitHtml)};
const freeBrowserRunnerHtml = ${JSON.stringify(freeBrowserRunnerHtml)};
const dailyBrowserRunnerHtml = ${JSON.stringify(dailyBrowserRunnerHtml)};
const robots = ${JSON.stringify(robots)};
const sitemap = ${JSON.stringify(sitemap)};
const manifest = ${JSON.stringify(manifest)};
const serviceWorker = ${JSON.stringify(serviceWorker)};
const socialImage = Uint8Array.from(atob(${JSON.stringify(socialImageBase64)}), (character) => character.charCodeAt(0));
const mobileScreenshot = Uint8Array.from(atob(${JSON.stringify(mobileScreenshotBase64)}), (character) => character.charCodeAt(0));
const gameplayClip = Uint8Array.from(atob(${JSON.stringify(gameplayClipBase64)}), (character) => character.charCodeAt(0));
const icon192 = Uint8Array.from(atob(${JSON.stringify(icon192Base64)}), (character) => character.charCodeAt(0));
const icon512 = Uint8Array.from(atob(${JSON.stringify(icon512Base64)}), (character) => character.charCodeAt(0));

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/wildvault-social-preview.png" || url.pathname === "/wildvault-mobile-gameplay.png") {
      const image = url.pathname === "/wildvault-social-preview.png" ? socialImage : mobileScreenshot;
      return new Response(image, {
        headers: {
          "content-type": "image/png",
          "content-length": String(image.byteLength),
          "cache-control": "public, max-age=604800, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/wildvault-gameplay.mp4") {
      const range = request.headers.get("range");
      const headers = {
        "content-type": "video/mp4",
        "cache-control": "public, max-age=604800, immutable",
        "accept-ranges": "bytes",
        "x-content-type-options": "nosniff",
      };

      if (range) {
        const match = /^bytes=(\\d*)-(\\d*)$/.exec(range);
        if (!match) {
          return new Response(null, {
            status: 416,
            headers: {
              ...headers,
              "content-range": "bytes */" + gameplayClip.byteLength,
            },
          });
        }

        const start = match[1] ? Number(match[1]) : 0;
        const requestedEnd = match[2]
          ? Number(match[2])
          : gameplayClip.byteLength - 1;
        const end = Math.min(requestedEnd, gameplayClip.byteLength - 1);
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end < start ||
          start >= gameplayClip.byteLength
        ) {
          return new Response(null, {
            status: 416,
            headers: {
              ...headers,
              "content-range": "bytes */" + gameplayClip.byteLength,
            },
          });
        }

        const slice = gameplayClip.slice(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            ...headers,
            "content-length": String(slice.byteLength),
            "content-range":
              "bytes " + start + "-" + end + "/" + gameplayClip.byteLength,
          },
        });
      }

      return new Response(gameplayClip, {
        headers: {
          ...headers,
          "content-length": String(gameplayClip.byteLength),
        },
      });
    }
    if (url.pathname === "/icon-192.png" || url.pathname === "/icon-512.png") {
      const icon = url.pathname === "/icon-192.png" ? icon192 : icon512;
      return new Response(icon, {
        headers: {
          "content-type": "image/png",
          "content-length": String(icon.byteLength),
          "cache-control": "public, max-age=86400, must-revalidate",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/manifest.webmanifest") {
      return new Response(manifest, {
        headers: {
          "content-type": "application/manifest+json; charset=utf-8",
          "cache-control": "public, max-age=3600, must-revalidate",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/sw.js") {
      return new Response(serviceWorker, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store, max-age=0",
          "service-worker-allowed": "/",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/robots.txt") {
      return new Response(robots, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/sitemap.xml") {
      return new Response(sitemap, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/press-kit" || url.pathname === "/press-kit/") {
      return new Response(pressKitHtml, { headers: htmlHeaders });
    }
    if (url.pathname === "/free-browser-runner" || url.pathname === "/free-browser-runner/") {
      return new Response(freeBrowserRunnerHtml, { headers: htmlHeaders });
    }
    if (url.pathname === "/daily-browser-runner" || url.pathname === "/daily-browser-runner/") {
      return new Response(dailyBrowserRunnerHtml, { headers: htmlHeaders });
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return new Response("Not found", { status: 404 });
    }
    return new Response(html, { headers: htmlHeaders });
  },
};
`,
);

let worker = await readFile(workerPath, "utf8");
const socialPreviewRuntime = `
const gameUrl = ${JSON.stringify(gameUrl)};

${socialArtworkRuntime}

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
  "    if (url.pathname === \"/wildvault-social-preview.png\" || url.pathname === \"/wildvault-mobile-gameplay.png\") {",
  `    if (url.pathname === challengeArtworkPath) {
      const preview = readSocialPreview(url, new Date().toISOString().slice(0, 10));
      if (!preview) {
        return new Response(socialImage, {
          headers: {
            "content-type": "image/png",
            "content-length": String(socialImage.byteLength),
            "cache-control": "public, max-age=300, must-revalidate",
            "x-content-type-options": "nosniff",
          },
        });
      }

      const image = await renderChallengeArtwork(preview);
      const cacheControl = preview.kind === "daily"
        ? "public, max-age=" + Math.max(0, Math.floor((Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate() + 1,
          ) - Date.now()) / 1000)) + ", must-revalidate"
        : "public, max-age=31536000, immutable";
      return new Response(image, {
        headers: {
          "content-type": "image/png",
          "content-length": String(image.byteLength),
          "cache-control": cacheControl,
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/wildvault-social-preview.png" || url.pathname === "/wildvault-mobile-gameplay.png") {`,
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
