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
]) {
  assert.ok(html.includes(requiredCopy), `Missing press-kit content: ${requiredCopy}`);
}

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

console.log("Press-kit route, copy, metadata, images, and sitemap checks passed");
