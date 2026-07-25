import assert from "node:assert/strict";

const { default: worker } = await import("../dist/server/index.js");
const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";

const response = await worker.fetch(new Request(`${gameUrl}/press-kit`));
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /^text\/html/);

const html = await response.text();
for (const requiredCopy of [
  "One line",
  "Short summary · two sentences",
  "Full description",
  "Keyboard",
  "Touch",
  "Play now",
  "/wildvault-social-preview.png",
  "/wildvault-mobile-gameplay.png",
  "/wildvault-gameplay.mp4",
  "Portal-ready package",
  "?embed=1",
]) {
  assert.ok(html.includes(requiredCopy), `Missing press-kit content: ${requiredCopy}`);
}

const clip = await worker.fetch(new Request(`${gameUrl}/wildvault-gameplay.mp4`));
assert.equal(clip.status, 200);
assert.equal(clip.headers.get("content-type"), "video/mp4");
assert.ok((await clip.arrayBuffer()).byteLength > 250_000);

const clipRange = await worker.fetch(
  new Request(`${gameUrl}/wildvault-gameplay.mp4`, {
    headers: { Range: "bytes=0-1023" },
  }),
);
assert.equal(clipRange.status, 206);
assert.equal(clipRange.headers.get("content-length"), "1024");
assert.match(clipRange.headers.get("content-range") ?? "", /^bytes 0-1023\/\d+$/);

const embed = await worker.fetch(new Request(`${gameUrl}/?embed=1`));
assert.equal(embed.status, 200);
const embedHtml = await embed.text();
assert.ok(embedHtml.includes("embed-mode"));
assert.ok(embedHtml.includes("embedMode"));
assert.ok(!embed.headers.has("x-frame-options"));

assert.ok(
  html.includes(
    '<link rel="canonical" href="https://wildvault-run.account-subscription.chatgpt.site/press-kit"',
  ),
);
assert.ok(
  html.includes(
    '<meta property="og:url" content="https://wildvault-run.account-subscription.chatgpt.site/press-kit"',
  ),
);

for (const route of [
  "/wildvault-social-preview.png",
  "/wildvault-mobile-gameplay.png",
]) {
  const image = await worker.fetch(new Request(`${gameUrl}${route}`));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.ok((await image.arrayBuffer()).byteLength > 10_000);
}

const sitemap = await worker.fetch(new Request(`${gameUrl}/sitemap.xml`));
assert.equal(sitemap.status, 200);
assert.ok((await sitemap.text()).includes(`${gameUrl}/press-kit`));

const trailingSlash = await worker.fetch(new Request(`${gameUrl}/press-kit/`));
assert.equal(trailingSlash.status, 200);

console.log("Press-kit route, embed mode, gameplay clip, metadata, images, and sitemap checks passed");
