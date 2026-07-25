export const GAME_URL = "https://wildvault-run.account-subscription.chatgpt.site";

export interface ShareResult {
  outcome: "shared" | "copied" | "cancelled" | "failed";
  message: string;
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
  const text = `I ran ${distance}m through Wildvault. Can you beat it?`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Wildvault Run",
        text,
        url: GAME_URL,
      });
      return { outcome: "shared", message: "Challenge shared" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { outcome: "cancelled", message: "Share cancelled" };
      }
    }
  }

  try {
    await copyText(`${text} ${GAME_URL}`);
    return { outcome: "copied", message: "Challenge copied to clipboard" };
  } catch {
    return { outcome: "failed", message: "Could not copy. Try again." };
  }
}
