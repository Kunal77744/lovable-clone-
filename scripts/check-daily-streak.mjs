import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/daily-streak.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

class MemoryStorage {
  value = new Map();
  getItem(key) { return this.value.get(key) ?? null; }
  setItem(key, value) { this.value.set(key, value); }
}

const storage = new MemoryStorage();
assert.deepEqual(module.completeDailyStreak("2026-07-24", storage), {
  lastCompletedDate: "2026-07-24", count: 1,
});
assert.deepEqual(module.completeDailyStreak("2026-07-25", storage), {
  lastCompletedDate: "2026-07-25", count: 2,
});
assert.equal(module.completeDailyStreak("2026-07-25", storage).count, 2, "same date must not inflate");
assert.equal(module.visibleDailyStreak("2026-07-26", module.readDailyStreak(storage)), 2);
assert.equal(module.visibleDailyStreak("2026-07-27", module.readDailyStreak(storage)), 0);
assert.equal(module.completeDailyStreak("2026-07-27", storage).count, 1, "missed date resets");
assert.equal(module.completeDailyStreak("2026-07-26", storage).count, 1, "older completion cannot overwrite");

const boundary = new MemoryStorage();
module.completeDailyStreak("2026-12-31", boundary);
assert.equal(module.completeDailyStreak("2027-01-01", boundary).count, 2, "UTC year boundary");

for (const malformed of ["{", "null", "{}", '{"lastCompletedDate":"nope","count":4}', '{"lastCompletedDate":"2026-07-25","count":0}']) {
  const broken = new MemoryStorage();
  broken.setItem(module.DAILY_STREAK_STORAGE_KEY, malformed);
  assert.deepEqual(module.readDailyStreak(broken), { lastCompletedDate: null, count: 0 });
}

const isolated = new MemoryStorage();
assert.deepEqual(module.readDailyStreak(isolated), { lastCompletedDate: null, count: 0 }, "free runs do not call completion");
console.log("Daily streak checks passed: consecutive, repeat, gap, UTC boundary, malformed storage, and free-run isolation.");
