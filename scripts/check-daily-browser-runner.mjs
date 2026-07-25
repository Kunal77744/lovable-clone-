import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";
const worker = await import("../dist/server/index.js");

const page = await worker.default.fetch(new Request(`${gameUrl}/daily-browser-runner`));
assert.equal(page.status, 200);
assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
const html = await page.text();

const requiredCopy = [
  "<title>Daily browser runner challenge | Wildvault Run</title>",
  '<h1 id="daily-title">One route. One day. Run it clean.</h1>',
  "same obstacle sequence today",
  "A separate daily best",
  "A fresh course at 00:00 UTC",
  "No account or download required.",
  "Growth by Tin",
];
for (const copy of requiredCopy) {
  assert.ok(html.includes(copy), `Missing page content: ${copy}`);
}

assert.equal((html.match(/class="play-today"/g) ?? []).length, 1);
assert.match(
  html,
  /href="\/\?daily=1&amp;utm_source=daily-browser-runner&amp;utm_medium=organic&amp;utm_campaign=todays-route"/,
);
assert.match(html, /id="play" aria-label="Play today's Wildvault daily route"/);
assert.match(
  html,
  /src="\/\?embed=1&amp;daily=1&amp;utm_source=daily-browser-runner&amp;utm_medium=organic&amp;utm_campaign=inline-daily"/,
);
assert.match(html, /timeZone: "UTC"/);
assert.match(html, /now\.getUTCDate\(\) \+ 1/);
assert.match(html, /window\.setTimeout\(renderDailyPage, view\.refreshDelay\)/);

assert.ok(
  html.includes(
    '<link rel="canonical" href="https://wildvault-run.account-subscription.chatgpt.site/daily-browser-runner"',
  ),
);
assert.ok(
  html.includes(
    '<meta property="og:url" content="https://wildvault-run.account-subscription.chatgpt.site/daily-browser-runner"',
  ),
);
assert.ok(html.includes('"@type": "WebPage"'));
assert.ok(html.includes('"@type": "VideoGame"'));
assert.ok(html.includes('"price": "0"'));
assert.doesNotMatch(html, /leaderboard|prize|cross-device/i);

const trailingSlash = await worker.default.fetch(
  new Request(`${gameUrl}/daily-browser-runner/`),
);
assert.equal(trailingSlash.status, 200);

const sitemapResponse = await worker.default.fetch(
  new Request(`${gameUrl}/sitemap.xml`),
);
assert.equal(sitemapResponse.status, 200);
assert.ok((await sitemapResponse.text()).includes(`${gameUrl}/daily-browser-runner`));

const runnerResponse = await worker.default.fetch(
  new Request(`${gameUrl}/free-browser-runner`),
);
assert.equal(runnerResponse.status, 200);
assert.ok((await runnerResponse.text()).includes('href="/daily-browser-runner"'));

const gameResponse = await worker.default.fetch(
  new Request(`${gameUrl}/?embed=1&daily=1`),
);
assert.equal(gameResponse.status, 200);
const gameHtml = await gameResponse.text();
assert.match(gameHtml, /Run today's route/);
const gameSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
assert.match(gameSource, /dailyEntryValues=routeParams\.getAll\("daily"\)/);
assert.match(gameSource, /dailyEntryMode=dailyEntryValues\.length===1&&dailyEntryValues\[0\]==="1"/);
assert.match(gameSource, /liveDailyChallenge\(\)\|\|dailyEntryMode\?"daily":"free"/);

console.log(
  "Daily browser runner route, UTC reset copy, direct daily entry, metadata, schema, sitemap, and internal-link checks passed",
);
