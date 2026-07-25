export type DifficultyAnswer = "too_easy" | "just_right" | "too_hard";

export const DIFFICULTY_FEEDBACK_SHOWN_STORAGE_KEY =
  "wildvault.difficulty-feedback-shown.v1";
export const DIFFICULTY_FEEDBACK_ANSWERED_STORAGE_KEY =
  "wildvault.difficulty-feedback-answered.v1";

let shownDateFallback = "";
let answeredDateFallback = "";

export function getFeedbackUtcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function readDate(
  storageKey: string,
  fallback: string,
  storage: Pick<Storage, "getItem">,
) {
  try {
    return storage.getItem(storageKey) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeDate(
  storageKey: string,
  value: string,
  storage: Pick<Storage, "setItem">,
) {
  try {
    storage.setItem(storageKey, value);
  } catch {}
}

export function shouldShowDifficultyFeedback(
  runNumber: number,
  now = new Date(),
  storage: Pick<Storage, "getItem"> = window.localStorage,
) {
  if (runNumber !== 2) return false;
  const today = getFeedbackUtcDate(now);
  return (
    readDate(DIFFICULTY_FEEDBACK_SHOWN_STORAGE_KEY, shownDateFallback, storage) !==
      today &&
    readDate(
      DIFFICULTY_FEEDBACK_ANSWERED_STORAGE_KEY,
      answeredDateFallback,
      storage,
    ) !== today
  );
}

export function markDifficultyFeedbackShown(
  now = new Date(),
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  const today = getFeedbackUtcDate(now);
  shownDateFallback = today;
  writeDate(DIFFICULTY_FEEDBACK_SHOWN_STORAGE_KEY, today, storage);
}

export function claimDifficultyFeedback(
  now = new Date(),
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
) {
  const today = getFeedbackUtcDate(now);
  if (
    readDate(
      DIFFICULTY_FEEDBACK_ANSWERED_STORAGE_KEY,
      answeredDateFallback,
      storage,
    ) === today
  ) {
    return false;
  }

  answeredDateFallback = today;
  writeDate(DIFFICULTY_FEEDBACK_ANSWERED_STORAGE_KEY, today, storage);
  return true;
}

export function getDistanceBand(distance: number) {
  const distanceM = Math.max(0, Math.floor(distance));
  if (distanceM < 100) return "0_99m";
  if (distanceM < 300) return "100_299m";
  if (distanceM < 700) return "300_699m";
  return "700m_plus";
}
