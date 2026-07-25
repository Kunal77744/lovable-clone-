import assert from "node:assert/strict";

const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";
const worker = await import("../dist/server/index.js");

const page = await worker.default.fetch(new Request(`${gameUrl}/free-browser-runner`));
assert.equal(page.status, 200);
assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
const html = await page.text();

const requiredCopy = [
  "<title>Free browser endless runner | Wildvault Run</title>",
  '<h1 id="runner-title">Run the ruins. Chase the next meter.</h1>',
  "Free to play. No account or download required.",
  "Personal best",
  "Daily route",
  "Score challenge",
  "Growth by Tin",
];
for (const copy of requiredCopy) {
  assert.ok(html.includes(copy), `Missing page content: ${copy}`);
}

assert.equal((html.match(/class="play-now"/g) ?? []).length, 1);
assert.ok(
  html.includes(
    '<link rel="canonical" href="https://wildvault-run.account-subscription.chatgpt.site/free-browser-runner"',
  ),
);
assert.ok(
  html.includes(
    '<meta property="og:url" content="https://wildvault-run.account-subscription.chatgpt.site/free-browser-runner"',
  ),
);
assert.ok(html.includes('"@type": "WebPage"'));
assert.ok(html.includes('"@type": "VideoGame"'));
assert.ok(html.includes('"price": "0"'));

const trailingSlash = await worker.default.fetch(
  new Request(`${gameUrl}/free-browser-runner/`),
);
assert.equal(trailingSlash.status, 200);

const sitemapResponse = await worker.default.fetch(
  new Request(`${gameUrl}/sitemap.xml`),
);
assert.equal(sitemapResponse.status, 200);
assert.ok((await sitemapResponse.text()).includes(`${gameUrl}/free-browser-runner`));

const pressKitResponse = await worker.default.fetch(
  new Request(`${gameUrl}/press-kit`),
);
assert.equal(pressKitResponse.status, 200);
assert.ok((await pressKitResponse.text()).includes('href="/free-browser-runner"'));

console.log(
  "Free browser runner route, metadata, schema, sitemap, and internal-link checks passed",
);
