import assert from "node:assert/strict";

const { default: worker } = await import("../dist/server/index.js");
const gameUrl = "https://wildvault-run.account-subscription.chatgpt.site";
const currentDate = new Date().toISOString().slice(0, 10);
const expiredDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function getHtml(search = "") {
  const response = await worker.fetch(new Request(`${gameUrl}/${search}`));
  assert.equal(response.status, 200);
  return response.text();
}

function hasMeta(html, attribute, name, value) {
  return html.includes(`<meta ${attribute}="${name}" content="${value}"`);
}

const generic = await getHtml();
assert(hasMeta(generic, "property", "og:title", "Wildvault Run"));

const score = await getHtml("?challenge=1234");
assert(
  hasMeta(score, "property", "og:title", "Beat 1,234m in Wildvault Run"),
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

for (const invalidSearch of [
  "?challenge=100000",
  "?challenge=1234&challenge=55",
  "?challenge=%3Cscript%3E",
  "?challenge=1234&mode=daily",
  `?challenge=1234&mode=daily&date=${expiredDate}`,
  "?challenge=1234&utm_source=test",
]) {
  const invalid = await getHtml(invalidSearch);
  assert(
    hasMeta(invalid, "property", "og:title", "Wildvault Run"),
    `Expected generic metadata for ${invalidSearch}`,
  );
}

console.log("Social preview checks passed");
