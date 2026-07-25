export const GAME_URL = "https://wildvault-run.account-subscription.chatgpt.site";
export const MAX_CHALLENGE_DISTANCE = 99_999;

export interface ShareResult {
  outcome: "shared" | "copied" | "cancelled" | "failed";
  message: string;
}

export function readChallengeDistance(search: string): number | null {
  const rawDistance = new URLSearchParams(search).get("challenge");
  if (rawDistance === null || !/^\d{1,5}$/.test(rawDistance)) return null;

  const distance = Number(rawDistance);
  return Number.isSafeInteger(distance) && distance <= MAX_CHALLENGE_DISTANCE
    ? distance
    : null;
}

export function buildChallengeUrl(distance: number): string {
  const runDistance = Math.floor(distance);
  if (
    !Number.isFinite(runDistance) ||
    runDistance < 0 ||
    runDistance > MAX_CHALLENGE_DISTANCE
  ) {
    return GAME_URL;
  }

  const url = new URL(GAME_URL);
  url.searchParams.set("challenge", String(runDistance));
  return url.toString();
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();

    try {
      if (!document.execCommand("copy")) throw new Error("Copy command failed");
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      field.remove();
    }
  });
}

export async function shareRunResult(distance: number): Promise<ShareResult> {
  const runDistance = Math.floor(distance);
  const text = `I ran ${runDistance}m through Wildvault. Can you beat it?`;
  const challengeUrl = buildChallengeUrl(runDistance);

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Wildvault Run",
        text,
        url: challengeUrl,
      });
      return { outcome: "shared", message: "Challenge shared" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { outcome: "cancelled", message: "Share cancelled" };
      }
    }
  }

  try {
    await copyText(`${text} ${challengeUrl}`);
    return { outcome: "copied", message: "Challenge copied to clipboard" };
  } catch {
    return { outcome: "failed", message: "Could not copy. Try again." };
  }
}
