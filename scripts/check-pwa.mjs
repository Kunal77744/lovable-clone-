import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const manifest = JSON.parse(await readFile("dist/manifest.webmanifest", "utf8"));
assert.equal(manifest.name, "Wildvault Run");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.deepEqual(
  manifest.icons.map(({ sizes, type }) => ({ sizes, type })),
  [
    { sizes: "192x192", type: "image/png" },
    { sizes: "512x512", type: "image/png" },
  ],
);

for (const size of [192, 512]) {
  const png = await readFile(`dist/icon-${size}.png`);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}

const serviceWorker = await readFile("dist/sw.js", "utf8");
assert.doesNotMatch(serviceWorker, /__CACHE_VERSION__/);
const cacheName = serviceWorker.match(
  /const CACHE_NAME = `\$\{CACHE_PREFIX\}([a-f0-9]{12})`;/,
)?.[1];
assert.ok(cacheName, "service worker cache name is content-versioned");

const listeners = new Map();
const deleted = [];
const cachedShells = [];
let claimed = false;
let skipped = false;
let networkDown = false;
const offlineShell = { source: "cached-shell" };

const context = {
  URL,
  Promise,
  Response,
  self: {
    location: { origin: "https://wildvault-run.example" },
    clients: { claim: async () => { claimed = true; } },
    skipWaiting: async () => { skipped = true; },
    addEventListener: (type, listener) => listeners.set(type, listener),
  },
  caches: {
    open: async () => ({
      addAll: async (urls) => cachedShells.push(...urls),
      put: async () => undefined,
    }),
    keys: async () => [
      "wildvault-shell-older",
      `wildvault-shell-${cacheName}`,
      "unrelated-cache",
    ],
    delete: async (key) => { deleted.push(key); },
    match: async (request) => request === "/" ? offlineShell : undefined,
  },
  fetch: async () => {
    if (networkDown) throw new Error("offline");
    return new Response("<html>current</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  },
};

vm.runInNewContext(serviceWorker, context);
assert.deepEqual([...listeners.keys()].sort(), ["activate", "fetch", "install"]);

let installPromise;
listeners.get("install")({ waitUntil: (promise) => { installPromise = promise; } });
await installPromise;
assert.deepEqual(cachedShells, [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
]);
assert.equal(skipped, true);

let activatePromise;
listeners.get("activate")({ waitUntil: (promise) => { activatePromise = promise; } });
await activatePromise;
assert.deepEqual(deleted, ["wildvault-shell-older"]);
assert.equal(claimed, true);

networkDown = true;
let offlineResponse;
listeners.get("fetch")({
  request: {
    method: "GET",
    mode: "navigate",
    url: "https://wildvault-run.example/",
  },
  respondWith: (promise) => { offlineResponse = promise; },
});
assert.equal(await offlineResponse, offlineShell);

const server = await readFile("dist/server/index.js", "utf8");
for (const route of [
  "/manifest.webmanifest",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
]) {
  assert.ok(server.includes(route), `${route} is served by production worker`);
}
assert.ok(server.includes('"service-worker-allowed": "/"'));

console.log("PWA manifest, icons, install shell, cache rotation, and offline fallback passed.");
