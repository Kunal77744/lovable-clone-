import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const { default: worker } = await import("../dist/server/index.js");
const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";
const currentDate = new Date().toISOString().slice(0, 10);
const expiredDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function getHtml(search = "") {
  const response = await worker.fetch(new Request(`${gameUrl}/${search}`));
  assert.equal(response.status, 200);
  return response.text();
}

async function getArtwork(search = "") {
  const response = await worker.fetch(
    new Request(`${gameUrl}/wildvault-challenge-preview.png${search}`),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(
    [...bytes.slice(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  return {
    bytes,
    hash: createHash("sha256").update(bytes).digest("hex"),
    cacheControl: response.headers.get("cache-control"),
  };
}

function hasMeta(html, attribute, name, value) {
  return html.includes(`<meta ${attribute}="${name}" content="${value}"`);
}

const generic = await getHtml();
assert(hasMeta(generic, "property", "og:title", "Wildvault Run"));
assert(
  hasMeta(
    generic,
    "property",
    "og:image",
    `${gameUrl}/wildvault-social-preview.png`,
  ),
);

const score = await getHtml("?challenge=1234");
assert(
  hasMeta(score, "property", "og:title", "Beat 1,234m in Wildvault Run"),
);
assert(
  hasMeta(
    score,
    "property",
    "og:image",
    `${gameUrl}/wildvault-challenge-preview.png?challenge=1234`,
  ),
);
assert(
  hasMeta(
    score,
    "name",
    "twitter:image:alt",
    "Wildvault Run challenge artwork showing 1,234m to beat.",
  ),
);
assert(
  hasMeta(
    score,
    "name",
    "twitter:description",
    "A Wildvault runner reached 1,234m. Take the challenge and see if you can go farther.",
  ),
);

const routeDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
}).format(new Date(`${currentDate}T00:00:00Z`));
const daily = await getHtml(
  `?challenge=9876&mode=daily&date=${currentDate}`,
);
assert(
  hasMeta(
    daily,
    "property",
    "og:title",
    `Beat 9,876m on Wildvault's ${routeDate} daily route`,
  ),
);
assert(
  hasMeta(
    daily,
    "property",
    "og:image",
    `${gameUrl}/wildvault-challenge-preview.png?challenge=9876&amp;mode=daily&amp;date=${currentDate}`,
  ),
);

const genericArtwork = await worker.fetch(
  new Request(`${gameUrl}/wildvault-social-preview.png`),
);
const genericArtworkBytes = new Uint8Array(await genericArtwork.arrayBuffer());
const genericArtworkHash = createHash("sha256")
  .update(genericArtworkBytes)
  .digest("hex");
const scoreArtwork = await getArtwork("?challenge=1234");
assert.notEqual(scoreArtwork.hash, genericArtworkHash);
assert.match(scoreArtwork.cacheControl, /immutable/);
const dailyArtwork = await getArtwork(
  `?challenge=9876&mode=daily&date=${currentDate}`,
);
assert.notEqual(dailyArtwork.hash, genericArtworkHash);
assert.notEqual(dailyArtwork.hash, scoreArtwork.hash);
assert.match(dailyArtwork.cacheControl, /must-revalidate/);

for (const invalidSearch of [
  "",
  "?challenge=100000",
  "?challenge=1234&challenge=55",
  "?challenge=%3Cscript%3E",
  "?challenge=1234&mode=daily",
  `?challenge=1234&mode=daily&date=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`,
  `?challenge=1234&mode=daily&date=${expiredDate}`,
  "?challenge=1234&utm_source=test",
]) {
  const invalid = await getHtml(invalidSearch);
  assert(
    hasMeta(invalid, "property", "og:title", "Wildvault Run"),
    `Expected generic metadata for ${invalidSearch}`,
  );
  const invalidArtwork = await getArtwork(invalidSearch);
  assert.equal(
    invalidArtwork.hash,
    genericArtworkHash,
    `Expected generic artwork for ${invalidSearch}`,
  );
}

console.log("Social preview checks passed");
