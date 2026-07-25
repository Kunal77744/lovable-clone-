import { getUtcDateKey } from "./daily-challenge";

export interface DailyResetView {
  dateKey: string;
  copy: string;
  remainingMs: number;
}

const MINUTE_MS = 60_000;

function nextUtcBoundary(timestamp: number): number {
  const now = new Date(timestamp);
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
}

export function getDailyResetView(now = new Date()): DailyResetView {
  const timestamp = now.getTime();
  const boundary = nextUtcBoundary(timestamp);
  const remainingMs = Math.max(0, boundary - timestamp);
  const remainingMinutes = Math.ceil(remainingMs / MINUTE_MS);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return {
    dateKey: getUtcDateKey(now),
    copy: `Next route in ${hours}h ${minutes}m`,
    remainingMs,
  };
}

export function getDailyResetRefreshDelay(now = new Date()): number {
  const timestamp = now.getTime();
  const untilMinute = MINUTE_MS - (timestamp % MINUTE_MS);
  const untilBoundary = nextUtcBoundary(timestamp) - timestamp;
  return Math.max(50, Math.min(untilMinute, untilBoundary) + 25);
}
