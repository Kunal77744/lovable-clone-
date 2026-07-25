export interface PersonalBest {
  distance: number;
  relics: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PERSONAL_BEST_STORAGE_KEY = "wildvault.personal-best.v1";

const EMPTY_PERSONAL_BEST: PersonalBest = { distance: 0, relics: 0 };

function safeRecord(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function readPersonalBest(storage?: StorageLike): PersonalBest {
  try {
    const raw = (storage ?? window.localStorage).getItem(PERSONAL_BEST_STORAGE_KEY);
    if (!raw) return { ...EMPTY_PERSONAL_BEST };

    const parsed = JSON.parse(raw) as Partial<PersonalBest> | null;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_PERSONAL_BEST };

    return {
      distance: safeRecord(parsed.distance),
      relics: safeRecord(parsed.relics),
    };
  } catch {
    return { ...EMPTY_PERSONAL_BEST };
  }
}

export function savePersonalBest(
  current: PersonalBest,
  storage?: StorageLike,
): PersonalBest {
  const previous = readPersonalBest(storage);
  const next = {
    distance: Math.max(previous.distance, safeRecord(current.distance)),
    relics: Math.max(previous.relics, safeRecord(current.relics)),
  };

  if (next.distance === previous.distance && next.relics === previous.relics) {
    return previous;
  }

  try {
    (storage ?? window.localStorage).setItem(
      PERSONAL_BEST_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }

  return next;
}
