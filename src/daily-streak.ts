export interface DailyStreak {
  lastCompletedDate: string | null;
  count: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DAILY_STREAK_STORAGE_KEY = "wildvault.daily-streak.v1";

const EMPTY_STREAK: DailyStreak = { lastCompletedDate: null, count: 0 };
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function readDailyStreak(storage?: StorageLike): DailyStreak {
  try {
    const raw = (storage ?? window.localStorage).getItem(DAILY_STREAK_STORAGE_KEY);
    if (!raw) return { ...EMPTY_STREAK };
    const parsed = JSON.parse(raw) as Partial<DailyStreak> | null;
    const count = parsed?.count;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !isDateKey(parsed.lastCompletedDate) ||
      !Number.isSafeInteger(count) ||
      (count ?? 0) < 1 ||
      (count ?? 0) > 100000
    ) {
      return { ...EMPTY_STREAK };
    }
    return { lastCompletedDate: parsed.lastCompletedDate, count: count! };
  } catch {
    return { ...EMPTY_STREAK };
  }
}

export function visibleDailyStreak(
  dateKey: string,
  streak: DailyStreak,
): number {
  if (!isDateKey(dateKey) || !streak.lastCompletedDate) return 0;
  return streak.lastCompletedDate === dateKey ||
    streak.lastCompletedDate === previousDateKey(dateKey)
    ? streak.count
    : 0;
}

export function completeDailyStreak(
  dateKey: string,
  storage?: StorageLike,
): DailyStreak {
  const previous = readDailyStreak(storage);
  if (!isDateKey(dateKey)) return previous;
  if (previous.lastCompletedDate === dateKey) return previous;
  if (previous.lastCompletedDate && previous.lastCompletedDate > dateKey) return previous;

  const next: DailyStreak = {
    lastCompletedDate: dateKey,
    count:
      previous.lastCompletedDate === previousDateKey(dateKey)
        ? previous.count + 1
        : 1,
  };
  try {
    (storage ?? window.localStorage).setItem(
      DAILY_STREAK_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Daily mode remains playable when storage is unavailable.
  }
  return next;
}
