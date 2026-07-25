import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const dailySource = await readFile(new URL("../src/daily-challenge.ts", import.meta.url), "utf8");
const dailyOutput = ts.transpileModule(dailySource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dailyUrl = `data:text/javascript;base64,${Buffer.from(dailyOutput).toString("base64")}`;

let resetSource = await readFile(new URL("../src/daily-reset.ts", import.meta.url), "utf8");
resetSource = resetSource.replace('"./daily-challenge"', JSON.stringify(dailyUrl));
const resetOutput = ts.transpileModule(resetSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(resetOutput).toString("base64")}`);

assert.deepEqual(module.getDailyResetView(new Date("2026-07-25T12:34:20.000Z")), {
  dateKey: "2026-07-25",
  copy: "Next route in 11h 26m",
  remainingMs: 41_140_000,
});
assert.equal(
  module.getDailyResetView(new Date("2026-07-25T23:59:59.999Z")).copy,
  "Next route in 0h 1m",
);
assert.deepEqual(module.getDailyResetView(new Date("2026-07-26T00:00:00.000Z")), {
  dateKey: "2026-07-26",
  copy: "Next route in 24h 0m",
  remainingMs: 86_400_000,
});
assert.equal(
  module.getDailyResetView(new Date("2026-12-31T23:59:59.999Z")).dateKey,
  "2026-12-31",
);
assert.equal(
  module.getDailyResetView(new Date("2027-01-01T00:00:00.000Z")).dateKey,
  "2027-01-01",
);
assert.equal(
  module.getDailyResetRefreshDelay(new Date("2026-07-25T23:59:59.900Z")),
  125,
);
assert.equal(
  module.getDailyResetRefreshDelay(new Date("2026-07-25T12:34:20.000Z")),
  40_025,
);

console.log("Daily reset checks passed: minute rounding, midnight rollover, year rollover, and boundary-aligned refresh.");
