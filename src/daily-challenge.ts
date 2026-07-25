export interface DailyBest {
  date: string;
  distance: number;
  relics: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DAILY_BEST_STORAGE_KEY = "wildvault.daily-best.v1";

const safeRecord = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;

export function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function formatDailyDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function hashDate(dateKey: string): number {
  let hash = 2166136261;
  for (let index = 0; index < dateKey.length; index += 1) {
    hash ^= dateKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createDailyRandom(dateKey: string): () => number {
  let state = hashDate(dateKey);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function readDailyBest(
  dateKey = getUtcDateKey(),
  storage?: StorageLike,
): DailyBest {
  const empty = { date: dateKey, distance: 0, relics: 0 };
  try {
    const raw = (storage ?? window.localStorage).getItem(DAILY_BEST_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<DailyBest> | null;
    if (!parsed || typeof parsed !== "object" || parsed.date !== dateKey) return empty;
    return {
      date: dateKey,
      distance: safeRecord(parsed.distance),
      relics: safeRecord(parsed.relics),
    };
  } catch {
    return empty;
  }
}

export function saveDailyBest(
  dateKey: string,
  current: Pick<DailyBest, "distance" | "relics">,
  storage?: StorageLike,
): DailyBest {
  const previous = readDailyBest(dateKey, storage);
  const next = {
    date: dateKey,
    distance: Math.max(previous.distance, safeRecord(current.distance)),
    relics: Math.max(previous.relics, safeRecord(current.relics)),
  };
  if (next.distance === previous.distance && next.relics === previous.relics) return previous;
  try {
    (storage ?? window.localStorage).setItem(DAILY_BEST_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Daily mode remains playable when storage is unavailable.
  }
  return next;
}
