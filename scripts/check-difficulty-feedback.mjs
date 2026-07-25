import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "wildvault-feedback-"));
const outputPath = join(temporaryDirectory, "difficulty-feedback.mjs");

try {
  await build({
    entryPoints: [resolve(root, "src", "difficulty-feedback.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: outputPath,
  });

  const feedback = await import(pathToFileURL(outputPath).href);
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const today = new Date("2026-07-25T23:59:00Z");
  const tomorrow = new Date("2026-07-26T00:01:00Z");

  assert.equal(feedback.shouldShowDifficultyFeedback(1, today, storage), false);
  assert.equal(feedback.shouldShowDifficultyFeedback(2, today, storage), true);
  assert.equal(feedback.shouldShowDifficultyFeedback(3, today, storage), false);

  feedback.markDifficultyFeedbackShown(today, storage);
  assert.equal(feedback.shouldShowDifficultyFeedback(2, today, storage), false);
  assert.equal(feedback.shouldShowDifficultyFeedback(2, tomorrow, storage), true);

  assert.equal(feedback.claimDifficultyFeedback(today, storage), true);
  assert.equal(feedback.claimDifficultyFeedback(today, storage), false);
  assert.equal(feedback.claimDifficultyFeedback(tomorrow, storage), true);

  assert.equal(feedback.getDistanceBand(99.9), "0_99m");
  assert.equal(feedback.getDistanceBand(100), "100_299m");
  assert.equal(feedback.getDistanceBand(300), "300_699m");
  assert.equal(feedback.getDistanceBand(700), "700m_plus");

  console.log("Difficulty feedback UTC gate, dedupe, and distance bands pass.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
